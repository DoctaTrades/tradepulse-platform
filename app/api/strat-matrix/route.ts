import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getValidAccessToken } from '@/app/lib/schwab-auth';

export const dynamic = 'force-dynamic';

const SCHWAB_BASE = 'https://api.schwabapi.com/marketdata/v1';

async function schwabFetch(endpoint: string, params?: Record<string, string>) {
  const token = await getValidAccessToken();
  const url = new URL(`${SCHWAB_BASE}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Schwab API ${res.status}`);
  return res.json();
}

// Aggregate daily candles into N-day candles
function aggregateCandles(dailyCandles: any[], period: number): any[] {
  const result: any[] = [];
  for (let i = 0; i <= dailyCandles.length - period; i += period) {
    const chunk = dailyCandles.slice(i, i + period);
    result.push({
      datetime: chunk[0].datetime,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + (c.volume || 0), 0),
    });
  }
  return result;
}

// Classify strat: 1 (inside), 2U (up), 2D (down), 3 (outside)
function classifyStrat(candle: any, prev: any): string {
  const higherHigh = candle.high > prev.high;
  const lowerLow = candle.low < prev.low;
  if (higherHigh && lowerLow) return '3';
  if (!higherHigh && !lowerLow) return '1';
  if (higherHigh && !lowerLow) return '2U';
  if (!higherHigh && lowerLow) return '2D';
  return '1';
}

// Get last N strat labels as sequence
function getStratSequence(candles: any[], count: number): string[] {
  if (candles.length < 2) return [];
  const seq: string[] = [];
  const start = Math.max(1, candles.length - count);
  for (let i = start; i < candles.length; i++) {
    seq.push(classifyStrat(candles[i], candles[i - 1]));
  }
  return seq;
}

// Detect actionable strat setups from last 3 candles
function detectSetups(sequence: string[]): { pattern: string; direction: string; type: string; description: string }[] {
  if (sequence.length < 2) return [];
  const setups: any[] = [];
  const last2 = sequence.slice(-2).join('-');
  const last3 = sequence.length >= 3 ? sequence.slice(-3).join('-') : '';

  // 3-candle combos
  if (last3 === '2D-1-2U') setups.push({ pattern: '2-1-2 Bullish', type: 'continuation', description: 'Inside bar breakout to upside', direction: 'BULLISH' });
  if (last3 === '2U-1-2D') setups.push({ pattern: '2-1-2 Bearish', type: 'continuation', description: 'Inside bar breakout to downside', direction: 'BEARISH' });
  if (last3 === '3-1-2U') setups.push({ pattern: '3-1-2 Bullish', type: 'reversal', description: 'Outside → inside → bullish breakout', direction: 'BULLISH' });
  if (last3 === '3-1-2D') setups.push({ pattern: '3-1-2 Bearish', type: 'reversal', description: 'Outside → inside → bearish breakout', direction: 'BEARISH' });
  if (last3 === '1-3-2U') setups.push({ pattern: '1-3-2 Bullish', type: 'reversal', description: 'Inside → outside → bullish follow-through', direction: 'BULLISH' });
  if (last3 === '1-3-2D') setups.push({ pattern: '1-3-2 Bearish', type: 'reversal', description: 'Inside → outside → bearish follow-through', direction: 'BEARISH' });

  // 2-candle combos
  if (last2 === '2U-2D') setups.push({ pattern: '2-2 Bearish', type: 'reversal', description: 'Up move failed → reversal down', direction: 'BEARISH' });
  if (last2 === '2D-2U') setups.push({ pattern: '2-2 Bullish', type: 'reversal', description: 'Down move failed → reversal up', direction: 'BULLISH' });

  // Building setups (watch for next candle)
  if (last2 === '2U-1' || last2 === '2D-1' || last2 === '3-1') {
    setups.push({ pattern: `${last2} Inside bar forming`, type: 'building', description: 'Watch for breakout direction', direction: 'NEUTRAL' });
  }
  if (last2 === '1-3') setups.push({ pattern: '1-3 Expansion', type: 'building', description: 'Inside → outside. Watch for directional follow-through', direction: 'NEUTRAL' });
  if (last2 === '1-1') setups.push({ pattern: '1-1 Compound inside', type: 'coiling', description: 'Tight compression — big move coming', direction: 'NEUTRAL' });

  return setups;
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: 'Missing ticker parameter' });

  if (!await isAuthenticated()) {
    return NextResponse.json({ error: 'Schwab not connected' }, { status: 401 });
  }

  try {
    // Fetch 1 year of daily candles
    const hist = await schwabFetch('/pricehistory', {
      symbol: ticker,
      periodType: 'year',
      period: '1',
      frequencyType: 'daily',
      frequency: '1',
    });

    const dailyCandles = hist.candles || [];
    if (dailyCandles.length < 30) {
      return NextResponse.json({ error: `Not enough price data for ${ticker} (${dailyCandles.length} candles)` });
    }

    // Append today's candle from quote if needed
    try {
      const quoteData = await schwabFetch('/quotes', { symbols: ticker, fields: 'quote' });
      const q = quoteData[ticker]?.quote;
      if (q && q.openPrice && q.highPrice && q.lowPrice && (q.lastPrice || q.closePrice)) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lastCandle = dailyCandles[dailyCandles.length - 1];
        const lastDate = new Date(lastCandle.datetime);
        lastDate.setHours(0, 0, 0, 0);
        if (lastDate.getTime() < today.getTime()) {
          dailyCandles.push({
            datetime: today.getTime(),
            open: q.openPrice,
            high: q.highPrice,
            low: q.lowPrice,
            close: q.lastPrice || q.closePrice,
            volume: q.totalVolume || 0,
          });
        }
      }
    } catch {}

    // Get current price
    const price = dailyCandles[dailyCandles.length - 1]?.close || 0;

    // Define all timeframes
    const timeframes: [string, number, string][] = [
      // [label, period in trading days, group]
      ['1D', 1, 'daily'], ['2D', 2, 'daily'], ['3D', 3, 'daily'], ['4D', 4, 'daily'],
      ['5D', 5, 'daily'], ['6D', 6, 'daily'], ['7D', 7, 'daily'], ['8D', 8, 'daily'],
      ['9D', 9, 'daily'], ['10D', 10, 'daily'], ['11D', 11, 'daily'], ['12D', 12, 'daily'],
      ['1W', 5, 'weekly'], ['2W', 10, 'weekly'], ['3W', 15, 'weekly'], ['4W', 20, 'weekly'],
      ['5W', 25, 'weekly'], ['6W', 30, 'weekly'], ['8W', 40, 'weekly'], ['12W', 60, 'weekly'],
      ['1M', 21, 'monthly'], ['2M', 42, 'monthly'], ['3M', 63, 'monthly'],
    ];

    const matrix: any[] = [];

    for (const [label, period, group] of timeframes) {
      const candles = period === 1 ? dailyCandles : aggregateCandles(dailyCandles, period);
      if (candles.length < 3) continue;

      const sequence = getStratSequence(candles, 5);
      const currentStrat = sequence.length > 0 ? sequence[sequence.length - 1] : '?';
      const setups = detectSetups(sequence);

      // Trigger prices from current candle
      const lastCandle = candles[candles.length - 1];
      const triggerHigh = lastCandle?.high || 0;
      const triggerLow = lastCandle?.low || 0;

      matrix.push({
        timeframe: label,
        group,
        period,
        strat: currentStrat,
        sequence,
        setups,
        triggerHigh: Math.round(triggerHigh * 100) / 100,
        triggerLow: Math.round(triggerLow * 100) / 100,
        candleOpen: lastCandle?.open ? Math.round(lastCandle.open * 100) / 100 : 0,
        candleClose: lastCandle?.close ? Math.round(lastCandle.close * 100) / 100 : 0,
      });
    }

    // Summary: count setups by direction
    const allSetups = matrix.flatMap(m => m.setups);
    const bullishSetups = allSetups.filter(s => s.direction === 'BULLISH').length;
    const bearishSetups = allSetups.filter(s => s.direction === 'BEARISH').length;
    const neutralSetups = allSetups.filter(s => s.direction === 'NEUTRAL').length;
    const totalSetups = allSetups.length;

    let bias = 'NEUTRAL';
    if (bullishSetups > bearishSetups + 1) bias = 'BULLISH';
    else if (bearishSetups > bullishSetups + 1) bias = 'BEARISH';
    else if (bullishSetups > 0 && bearishSetups > 0) bias = 'MIXED';

    return NextResponse.json({
      ticker,
      price,
      matrix,
      summary: { totalSetups, bullishSetups, bearishSetups, neutralSetups, bias },
      candleCount: dailyCandles.length,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
