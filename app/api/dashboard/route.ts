import { verifyAuth } from '@/app/lib/auth-helpers';
import { aggregateCandlesByWeek, aggregateCandlesByMonth } from '@/app/lib/candle-aggregation';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/app/lib/schwab-auth';
import { schwabFetch as _schwabFetchBase } from '@/app/lib/schwab-data';
import { runInParallel } from '@/app/lib/parallel-fetch';

export const dynamic = 'force-dynamic';

function classifyStrat(candle: any, prev: any): string {
  const higherHigh = candle.high > prev.high;
  const lowerLow = candle.low < prev.low;
  if (higherHigh && lowerLow) return '3';
  if (!higherHigh && !lowerLow) return '1';
  if (higherHigh && !lowerLow) return '2U';
  if (!higherHigh && lowerLow) return '2D';
  return '1';
}

// Candle aggregation imported from app/lib/candle-aggregation.ts (calendar-anchored)

function getStratSequence(candles: any[], count: number): string {
  if (candles.length < count + 1) return '';
  const recent = candles.slice(-(count + 1));
  const result: string[] = [];
  for (let i = 1; i < recent.length; i++) {
    result.push(classifyStrat(recent[i], recent[i - 1]));
  }
  return result.join(' → ');
}

function getLastStrat(candles: any[]): string {
  if (candles.length < 2) return '?';
  return classifyStrat(candles[candles.length - 1], candles[candles.length - 2]);
}

// Count inside bars in recent candles (coiling indicator)
function countRecentInsideBars(candles: any[], lookback: number): number {
  const recent = candles.slice(-lookback);
  let count = 0;
  for (let i = 1; i < recent.length; i++) {
    if (classifyStrat(recent[i], recent[i - 1]) === '1') count++;
  }
  return count;
}

// ─── MAIN DASHBOARD ENDPOINT ────────────────────────────
const INDICES = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'IWM', label: 'Russell 2000' },
  { symbol: 'DIA', label: 'Dow 30' },
];

const SECTORS = [
  { symbol: 'XLK', label: 'Technology' },
  { symbol: 'XLF', label: 'Financials' },
  { symbol: 'XLV', label: 'Healthcare' },
  { symbol: 'XLY', label: 'Consumer Disc.' },
  { symbol: 'XLP', label: 'Consumer Staples' },
  { symbol: 'XLE', label: 'Energy' },
  { symbol: 'XLI', label: 'Industrials' },
  { symbol: 'XLB', label: 'Materials' },
  { symbol: 'XLRE', label: 'Real Estate' },
  { symbol: 'XLU', label: 'Utilities' },
  { symbol: 'XLC', label: 'Communication' },
];

export async function GET(req: NextRequest) {
  const { userId } = await verifyAuth(req);

  if (!await isAuthenticated(userId)) {
    return NextResponse.json({ error: 'Schwab not connected' }, { status: 401 });
  }

  // Request-scoped schwabFetch — captures userId in closure, eliminating
  // the module-level mutable state bug where concurrent requests could
  // leak credentials between users.
  const schwabFetch = (endpoint: string, params?: Record<string, string>) =>
    _schwabFetchBase(endpoint, params, userId || undefined);

  try {
    const allSymbols = [...INDICES, ...SECTORS].map(s => s.symbol);

    // Fetch quotes
    const quoteData = await schwabFetch('/quotes', {
      symbols: allSymbols.join(','),
      fields: 'quote',
    });

    // Fetch price history for each (for Strat classification)
    const historyMap: Record<string, any[]> = {};
    await runInParallel(allSymbols, async (sym) => {
      try {
        const hist = await schwabFetch('/pricehistory', {
          symbol: sym,
          periodType: 'year',
          period: '1',
          frequencyType: 'daily',
          frequency: '1',
        });
        let candles = hist.candles || [];

        // Append today's candle from quote data if not already in history
        // Schwab daily history often doesn't include the current/most recent session until overnight
        const q = quoteData[sym]?.quote;
        if (q && (q.openPrice || q.highPrice)) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayMs = today.getTime();
          const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
          const lastCandleDate = lastCandle ? new Date(lastCandle.datetime) : null;
          if (lastCandleDate) lastCandleDate.setHours(0, 0, 0, 0);
          const lastCandleMs = lastCandleDate ? lastCandleDate.getTime() : 0;

          // If the last candle is older than today, append today's data from the quote
          if (lastCandleMs < todayMs && q.openPrice && q.highPrice && q.lowPrice && (q.lastPrice || q.closePrice)) {
            candles.push({
              datetime: todayMs,
              open: q.openPrice,
              high: q.highPrice,
              low: q.lowPrice,
              close: q.lastPrice || q.closePrice,
              volume: q.totalVolume || 0,
            });
          }
        }

        historyMap[sym] = candles;
      } catch {
        historyMap[sym] = [];
      }
    }, { concurrency: 8 });

    // Build index data
    const indices = INDICES.map(idx => {
      const q = quoteData[idx.symbol]?.quote;
      const candles = historyMap[idx.symbol] || [];
      const weeklyCandles = aggregateCandlesByWeek(candles, 1);
      const monthlyCandles = aggregateCandlesByMonth(candles, 1);

      const price = q?.lastPrice || q?.closePrice || 0;
      let change = q?.netPercentChangeInDouble || 0;

      // Fallback: calculate change from candle data if quote doesn't have it
      if (!change && candles.length >= 2 && price > 0) {
        const prevClose = candles[candles.length - 2]?.close || 0;
        if (prevClose > 0) {
          change = Math.round(((price - prevClose) / prevClose) * 10000) / 100;
        }
      }

      return {
        symbol: idx.symbol,
        label: idx.label,
        price,
        change,
        volume: q?.totalVolume || 0,
        high: q?.highPrice || 0,
        low: q?.lowPrice || 0,
        strat: {
          daily: getLastStrat(candles),
          dailySeq: getStratSequence(candles, 5),
          weekly: getLastStrat(weeklyCandles),
          weeklySeq: getStratSequence(weeklyCandles, 3),
          monthly: getLastStrat(monthlyCandles),
        },
        insideBars5d: countRecentInsideBars(candles, 5),
      };
    });

    // Build sector data, sorted by daily change
    const sectors = SECTORS.map(sec => {
      const q = quoteData[sec.symbol]?.quote;
      const candles = historyMap[sec.symbol] || [];
      const weeklyCandles = aggregateCandlesByWeek(candles, 1);

      const secPrice = q?.lastPrice || q?.closePrice || 0;
      let secChange = q?.netPercentChangeInDouble || 0;

      // Fallback: calculate change from candle data
      if (!secChange && candles.length >= 2 && secPrice > 0) {
        const prevClose = candles[candles.length - 2]?.close || 0;
        if (prevClose > 0) {
          secChange = Math.round(((secPrice - prevClose) / prevClose) * 10000) / 100;
        }
      }

      return {
        symbol: sec.symbol,
        label: sec.label,
        price: secPrice,
        change: secChange,
        volume: q?.totalVolume || 0,
        strat: {
          daily: getLastStrat(candles),
          dailySeq: getStratSequence(candles, 5),
          weekly: getLastStrat(weeklyCandles),
        },
        insideBars5d: countRecentInsideBars(candles, 5),
      };
    }).sort((a, b) => b.change - a.change);

    // Market breadth signals
    const bullishSectors = sectors.filter(s => s.change > 0).length;
    const sectorsWithInsideBars = sectors.filter(s => s.strat.daily === '1').length;
    const sectorsUp2 = sectors.filter(s => s.strat.daily === '2U').length;
    const sectorsDown2 = sectors.filter(s => s.strat.daily === '2D').length;

    let marketBias = 'NEUTRAL';
    if (bullishSectors >= 8) marketBias = 'STRONG BULLISH';
    else if (bullishSectors >= 6) marketBias = 'BULLISH';
    else if (bullishSectors <= 3) marketBias = 'BEARISH';
    else if (bullishSectors <= 5) marketBias = 'SLIGHT BEARISH';

    const signals: string[] = [];
    if (sectorsWithInsideBars >= 4) signals.push(`${sectorsWithInsideBars} sectors showing inside bars — consolidation, watch for expansion`);
    if (sectorsUp2 >= 7) signals.push(`${sectorsUp2} sectors with 2U — broad bullish momentum`);
    if (sectorsDown2 >= 7) signals.push(`${sectorsDown2} sectors with 2D — broad bearish pressure`);

    const spyStrat = indices.find(i => i.symbol === 'SPY')?.strat.daily;
    if (spyStrat === '1') signals.push('SPY inside bar on daily — breakout imminent');
    if (spyStrat === '3') signals.push('SPY outside bar on daily — volatility expansion');

    return NextResponse.json({
      indices,
      sectors,
      marketBias,
      bullishSectors,
      totalSectors: sectors.length,
      signals,
      timestamp: new Date().toISOString(),
    });

  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
