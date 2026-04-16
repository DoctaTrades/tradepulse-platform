import { NextRequest, NextResponse } from 'next/server';
import { hasSchwabConnection } from '@/app/lib/schwab-auth';
import { schwabFetch as _schwabFetchBase } from '@/app/lib/schwab-data';
import { SECTORS as SECTOR_LIST } from '@/app/lib/sector-holdings';
import { verifyAuth } from '@/app/lib/auth-helpers';
import { runInParallel } from '@/app/lib/parallel-fetch';
import { aggregateCandlesByYear, aggregateCandlesByWeek, aggregateCandlesByMonth } from '@/app/lib/candle-aggregation';

// Append today's candle from quote data if price history doesn't include it yet
function appendTodayCandle(candles: any[], quote: any): any[] {
  if (!quote || !candles.length) return candles;
  if (!quote.openPrice || !quote.highPrice || !quote.lowPrice || !(quote.lastPrice || quote.closePrice)) return candles;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const lastCandle = candles[candles.length - 1];
  const lastDate = new Date(lastCandle.datetime);
  lastDate.setHours(0, 0, 0, 0);
  if (lastDate.getTime() < todayMs) {
    return [...candles, {
      datetime: todayMs,
      open: quote.openPrice,
      high: quote.highPrice,
      low: quote.lowPrice,
      close: quote.lastPrice || quote.closePrice,
      volume: quote.totalVolume || 0,
    }];
  }
  return candles;
}

// ─── SECTOR → TICKER MAPPINGS (from shared sector-holdings) ────
const INDICES = ['SPY', 'QQQ', 'IWM', 'DIA'];

const SECTOR_ETFS: Record<string, { label: string; tickers: string[] }> = {};
for (const s of SECTOR_LIST) {
  SECTOR_ETFS[s.etf] = { label: s.label, tickers: s.tickers };
}

// ─── CANDLE AGGREGATION ──────────────────────────────────

// Build reverse lookup: ticker → sector ETF symbol
const TICKER_TO_SECTOR: Record<string, string> = {};
for (const [etf, data] of Object.entries(SECTOR_ETFS)) {
  for (const ticker of data.tickers) {
    TICKER_TO_SECTOR[ticker] = etf;
  }
}

// Compute Timeframe Continuity (TFC) — direction of current D/W/M/Q candles
// Uses the most recent candle (which includes today's in-progress data when market is open)
// For W/M/Q: derives period-open from the first trading day within the current period
//            and period-close from the latest candle's close (= current price during market hours)
function computeTFC(candles: any[]): { d: 'up' | 'down'; w: 'up' | 'down'; m: 'up' | 'down'; q: 'up' | 'down' } | null {
  if (!candles || candles.length === 0) return null;
  const latest = candles[candles.length - 1];
  if (!latest || typeof latest.open !== 'number' || typeof latest.close !== 'number') return null;

  // Parse the latest candle's date to determine current period boundaries
  // Candles have a datetime field (ms epoch) from Schwab; fall back to date if present
  const getDate = (c: any): Date | null => {
    if (typeof c.datetime === 'number') return new Date(c.datetime);
    if (c.date) return new Date(c.date);
    return null;
  };

  const latestDate = getDate(latest);
  if (!latestDate) return null;

  const latestClose = latest.close;

  // DAILY: use the most recent candle's own open vs close
  const dailyUp = latestClose >= latest.open;

  // WEEKLY: find candles from the start of this week (Monday) to now
  // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat — we want to rewind to Monday
  const dayOfWeek = latestDate.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sun→6, Mon→0, Tue→1, ...
  const weekStart = new Date(latestDate);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - daysFromMonday);

  // MONTHLY: first day of this month
  const monthStart = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);

  // QUARTERLY: first day of this quarter (Jan/Apr/Jul/Oct)
  const quarterMonth = Math.floor(latestDate.getMonth() / 3) * 3;
  const quarterStart = new Date(latestDate.getFullYear(), quarterMonth, 1);

  // Find the first candle in each period and use its open
  // If period contains only the latest candle, open is latest.open
  const findPeriodOpen = (periodStart: Date): number => {
    for (const c of candles) {
      const d = getDate(c);
      if (d && d >= periodStart) {
        return c.open;
      }
    }
    return latest.open; // fallback: latest candle is the only one in period
  };

  const weekOpen = findPeriodOpen(weekStart);
  const monthOpen = findPeriodOpen(monthStart);
  const quarterOpen = findPeriodOpen(quarterStart);

  return {
    d: dailyUp ? 'up' : 'down',
    w: latestClose >= weekOpen ? 'up' : 'down',
    m: latestClose >= monthOpen ? 'up' : 'down',
    q: latestClose >= quarterOpen ? 'up' : 'down',
  };
}

// Calculate return over N days from candles
function calcReturn(candles: any[], days: number): number {
  if (candles.length < days + 1) return 0;
  const recent = candles.slice(-days);
  const startPrice = recent[0].close;
  const endPrice = recent[recent.length - 1].close;
  if (startPrice <= 0) return 0;
  return Math.round(((endPrice - startPrice) / startPrice) * 100 * 100) / 100;
}

// Candle aggregation now imported from app/lib/candle-aggregation.ts (calendar-anchored)

// ─── STRAT CLASSIFICATION ────────────────────────────────
function classifyStrat(candle: any, prev: any): string {
  const higherHigh = candle.high > prev.high;
  const lowerLow = candle.low < prev.low;
  if (higherHigh && lowerLow) return '3';
  if (!higherHigh && !lowerLow) return '1';
  if (higherHigh && !lowerLow) return '2U';
  if (!higherHigh && lowerLow) return '2D';
  return '1';
}

// ─── 5CR DETECTION ───────────────────────────────────────
// 5CR = Five Candle Reversal
// Bearish pattern (consecutive lower highs) = BULLISH reversal setup
//   → Price has been making lower highs (selling pressure)
//   → Trigger: break ABOVE the last candle's high reverses the pattern
// Bullish pattern (consecutive higher lows) = BEARISH reversal setup
//   → Price has been making higher lows (buying pressure)
//   → Trigger: break BELOW the last candle's low reverses the pattern
function detect5CR(candles: any[], minCount: number): { bearish: any; bullish: any } | null {
  if (candles.length < minCount + 2) return null;
  const recent = candles.slice(-20);

  let lowerHighCount = 0;
  for (let i = recent.length - 1; i > 0; i--) {
    if (recent[i].high < recent[i - 1].high) lowerHighCount++;
    else break;
  }

  let higherLowCount = 0;
  for (let i = recent.length - 1; i > 0; i--) {
    if (recent[i].low > recent[i - 1].low) higherLowCount++;
    else break;
  }

  const lastCandle = recent[recent.length - 1];
  const result: any = {};

  if (lowerHighCount >= minCount) {
    // Pattern: bearish candles (lower highs) → trade is BULLISH reversal
    result.bearish = {
      count: lowerHighCount,
      triggerPrice: lastCandle.high,  // break above last candle's high = reversal
      lastHigh: lastCandle.high,
      direction: 'BULLISH REVERSAL',
      signal: `${lowerHighCount} consecutive lower highs → bullish reversal trigger`,
      patternType: 'lower_highs',
      tradeDirection: 'BULLISH',
    };
  }

  if (higherLowCount >= minCount) {
    // Pattern: bullish candles (higher lows) → trade is BEARISH reversal
    result.bullish = {
      count: higherLowCount,
      triggerPrice: lastCandle.low,  // break below last candle's low = reversal
      lastLow: lastCandle.low,
      direction: 'BEARISH REVERSAL',
      signal: `${higherLowCount} consecutive higher lows → bearish reversal trigger`,
      patternType: 'higher_lows',
      tradeDirection: 'BEARISH',
    };
  }

  return (result.bearish || result.bullish) ? result : null;
}

// ─── STRAT SETUP DETECTION ──────────────────────────────
function detectStratSetups(candles: any[]): any[] {
  if (candles.length < 5) return [];
  const recent = candles.slice(-5);
  const classifications: string[] = [];
  for (let i = 1; i < recent.length; i++) {
    classifications.push(classifyStrat(recent[i], recent[i - 1]));
  }

  const last3 = classifications.slice(-3).join('-');
  const last2 = classifications.slice(-2).join('-');
  const setups: any[] = [];
  const lastCandle = recent[recent.length - 1];
  const prevCandle = recent[recent.length - 2];

  // Completed 3-candle patterns
  if (last3 === '2D-1-2U') setups.push({ pattern: '2-1-2 Bullish', type: 'continuation', description: 'Inside bar breakout to upside', triggerPrice: prevCandle.high, direction: 'BULLISH' });
  if (last3 === '2U-1-2D') setups.push({ pattern: '2-1-2 Bearish', type: 'continuation', description: 'Inside bar breakout to downside', triggerPrice: prevCandle.low, direction: 'BEARISH' });
  if (last3 === '3-1-2U') setups.push({ pattern: '3-1-2 Bullish Reversal', type: 'reversal', description: 'Outside bar → inside bar → bullish breakout', triggerPrice: prevCandle.high, direction: 'BULLISH' });
  if (last3 === '3-1-2D') setups.push({ pattern: '3-1-2 Bearish Reversal', type: 'reversal', description: 'Outside bar → inside bar → bearish breakout', triggerPrice: prevCandle.low, direction: 'BEARISH' });
  if (last3 === '1-3-2U') setups.push({ pattern: '1-3-2 Bullish', type: 'reversal', description: 'Inside → outside expansion → bullish follow-through', triggerPrice: prevCandle.high, direction: 'BULLISH' });
  if (last3 === '1-3-2D') setups.push({ pattern: '1-3-2 Bearish', type: 'reversal', description: 'Inside → outside expansion → bearish follow-through', triggerPrice: prevCandle.low, direction: 'BEARISH' });

  // 2-candle reversals
  if (last2 === '2U-2D') setups.push({ pattern: '2-2 Bearish Reversal', type: 'reversal', description: 'Up move failed → reversal down', triggerPrice: lastCandle.low, direction: 'BEARISH' });
  if (last2 === '2D-2U') setups.push({ pattern: '2-2 Bullish Reversal', type: 'reversal', description: 'Down move failed → reversal up', triggerPrice: lastCandle.high, direction: 'BULLISH' });

  // Building setups
  if (last2 === '1-3') setups.push({ pattern: '1-3 (Setting up for 2)', type: 'building', description: 'Inside → outside expansion. Watch for directional follow-through.', triggerHigh: lastCandle.high, triggerLow: lastCandle.low, direction: 'NEUTRAL' });
  if (last2 === '2U-1' || last2 === '2D-1' || last2 === '3-1') setups.push({ pattern: `${last2} (Inside bar forming)`, type: 'building', description: 'Inside bar after directional move — watch for breakout', triggerHigh: lastCandle.high, triggerLow: lastCandle.low, direction: 'NEUTRAL' });
  if (last2 === '1-1') setups.push({ pattern: '1-1 Compound Inside', type: 'coiling', description: 'Multiple inside bars — tight compression, big move coming', triggerHigh: Math.max(prevCandle.high, lastCandle.high), triggerLow: Math.min(prevCandle.low, lastCandle.low), direction: 'NEUTRAL' });

  return setups;
}

// ─── SCAN A SINGLE TICKER ACROSS TIMEFRAMES ─────────────
function scanTicker(ticker: string, dailyCandles: any[], min5CR: number): any {
  // Define timeframes: [label, aggregation period in days]
  const timeframes: [string, number, string][] = [
    ['1D', 1, 'daily'], ['2D', 2, 'daily'], ['3D', 3, 'daily'], ['4D', 4, 'daily'], ['5D', 5, 'daily'],
    ['6D', 6, 'daily'], ['7D', 7, 'daily'], ['8D', 8, 'daily'], ['9D', 9, 'daily'], ['10D', 10, 'daily'],
    ['11D', 11, 'daily'], ['12D', 12, 'daily'],
    ['1W', 1, 'weekly'], ['2W', 2, 'weekly'], ['3W', 3, 'weekly'], ['4W', 4, 'weekly'],
    ['1M', 1, 'monthly'], ['2M', 2, 'monthly'], ['3M', 3, 'monthly'],
  ];

  const tfResults: any[] = [];
  let totalPatterns = 0;
  let tfWithPatterns = 0;

  for (const [label, period, group] of timeframes) {
    let candles: any[];
    if (period === 1 && group === 'daily') {
      candles = dailyCandles;
    } else if (group === 'daily') {
      candles = aggregateCandlesByYear(dailyCandles, period);
    } else if (group === 'weekly') {
      candles = aggregateCandlesByWeek(dailyCandles, period);
    } else {
      candles = aggregateCandlesByMonth(dailyCandles, period);
    }
    if (candles.length < 7) continue;

    const fiveCR = detect5CR(candles, min5CR);
    const stratSetups = detectStratSetups(candles);

    const has5CR = fiveCR && (fiveCR.bearish || fiveCR.bullish);
    const hasStrat = stratSetups.length > 0;

    if (has5CR || hasStrat) {
      tfWithPatterns++;
      totalPatterns += (fiveCR?.bearish ? 1 : 0) + (fiveCR?.bullish ? 1 : 0) + stratSetups.length;

      // Get last candle strat sequence for this timeframe
      const recentStrat: string[] = [];
      for (let i = Math.max(1, candles.length - 5); i < candles.length; i++) {
        recentStrat.push(classifyStrat(candles[i], candles[i - 1]));
      }

      tfResults.push({
        timeframe: label,
        fiveCR_bearish: fiveCR?.bearish || null,
        fiveCR_bullish: fiveCR?.bullish || null,
        stratSetups,
        recentStrat: recentStrat.join(' → '),
      });
    }
  }

  return { tfResults, totalPatterns, tfWithPatterns };
}

// ─── MAIN ENDPOINT ──────────────────────────────────────
export async function POST(req: NextRequest) {
  // Verify auth: derive userId from JWT, not from request body
  const { userId } = await verifyAuth(req);
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const {
    tickers = [],
    minPrice = 5,
    maxPrice = 1000,
    min5CR = 5,
    mode = 'universe',
    sectorFilter,
  } = body;

  if (!await hasSchwabConnection(userId)) {
    return NextResponse.json({ error: 'Schwab not connected' }, { status: 401 });
  }

  const schwabFetch = (endpoint: string, params?: Record<string, string>) =>
    _schwabFetchBase(endpoint, params, userId || undefined);

  const logs: string[] = ['⚡ Starting multi-timeframe equity scan...'];
  let scanned = 0;

  // If sector filter is set, override tickers with that sector's holdings
  let effectiveTickers = tickers;
  if (sectorFilter && SECTOR_ETFS[sectorFilter]) {
    effectiveTickers = SECTOR_ETFS[sectorFilter].tickers;
    logs.push(`🏗 Sector filter: ${SECTOR_ETFS[sectorFilter].label} (${sectorFilter}) — ${effectiveTickers.length} tickers`);
  }

  // ─── Fetch quotes in bulk ───
  const allTickers = mode === 'topdown'
    ? [...INDICES, ...Object.keys(SECTOR_ETFS)]
    : effectiveTickers;

  const allQuotes: any = {};
  for (let i = 0; i < allTickers.length; i += 50) {
    const batch = allTickers.slice(i, i + 50);
    try {
      const data = await schwabFetch('/quotes', { symbols: batch.join(','), fields: 'quote,fundamental' });
      Object.assign(allQuotes, data);
    } catch { logs.push(`⚠ Quote batch failed`); }
  }

  // ─── Pre-fetch sector ETF price histories for RS calculation ───
  const sectorHistory: Record<string, any[]> = {};
  const sectorReturns: Record<string, number> = {};
  const sectorETFSymbols = Object.keys(SECTOR_ETFS);
  await runInParallel(sectorETFSymbols, async (etf) => {
    try {
      const hist = await schwabFetch('/pricehistory', {
        symbol: etf,
        periodType: 'month',
        period: '3',
        frequencyType: 'daily',
        frequency: '1',
      });
      sectorHistory[etf] = appendTodayCandle(hist.candles || [], allQuotes[etf]?.quote);
      sectorReturns[etf] = calcReturn(sectorHistory[etf], 20);
    } catch {
      sectorHistory[etf] = [];
      sectorReturns[etf] = 0;
    }
  }, { concurrency: 8 });

  // ─── Helper: scan a list of tickers ───
  async function scanList(tickerList: string[], label: string): Promise<any[]> {
    const results: any[] = [];

    await runInParallel(tickerList, async (ticker) => {
      scanned++;
      const quote = allQuotes[ticker]?.quote;
      const price = quote?.lastPrice || quote?.closePrice || 0;
      if (!price) return;
      if (price < minPrice || price > maxPrice) return;

      let candles: any[] = [];
      try {
        const hist = await schwabFetch('/pricehistory', {
          symbol: ticker,
          periodType: 'year',
          period: '1',
          frequencyType: 'daily',
          frequency: '1',
        });
        candles = appendTodayCandle(hist.candles || [], quote);
      } catch { return; }

      if (candles.length < 30) return;

      // Calculate average volume (20-day)
      const recentVols = candles.slice(-20).map((c: any) => c.volume || 0);
      const avgVolume = recentVols.reduce((s: number, v: number) => s + v, 0) / recentVols.length;
      const todayVol = quote?.totalVolume || 0;
      const relVolume = avgVolume > 0 ? Math.round((todayVol / avgVolume) * 100) / 100 : 0;

      const { tfResults, totalPatterns, tfWithPatterns } = scanTicker(ticker, candles, min5CR);

      if (tfResults.length > 0) {
        const chg = quote?.netPercentChangeInDouble || 0;

        // Summarize directions across all timeframes
        let hasBullish = false, hasBearish = false, has5CR = false;
        for (const tf of tfResults) {
          if (tf.fiveCR_bearish || tf.fiveCR_bullish) has5CR = true;
          for (const s of (tf.stratSetups || [])) {
            if (s.direction === 'BULLISH') hasBullish = true;
            if (s.direction === 'BEARISH') hasBearish = true;
          }
          // 5CR: bearish pattern (lower highs) = bullish reversal trade
          //       bullish pattern (higher lows) = bearish reversal trade
          if (tf.fiveCR_bearish) hasBullish = true;  // lower highs → bullish reversal
          if (tf.fiveCR_bullish) hasBearish = true;  // higher lows → bearish reversal
        }

        // Collect all unique pattern names
        const patternNames: string[] = [];
        for (const tf of tfResults) {
          if (tf.fiveCR_bearish) patternNames.push('5CR Bullish Reversal');
          if (tf.fiveCR_bullish) patternNames.push('5CR Bearish Reversal');
          for (const s of (tf.stratSetups || [])) {
            if (!patternNames.includes(s.pattern)) patternNames.push(s.pattern);
          }
        }

        // Earnings date estimation
        const fund = allQuotes[ticker]?.fundamental;
        let nextEarningsEst: string | null = null;
        let daysToEarnings: number | null = null;
        if (fund?.lastEarningsDate) {
          const lastEarnings = new Date(fund.lastEarningsDate);
          const nextEst = new Date(lastEarnings.getTime() + 90 * 24 * 60 * 60 * 1000);
          nextEarningsEst = nextEst.toISOString().split('T')[0];
          daysToEarnings = Math.round((nextEst.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        }

        // Relative strength vs sector
        const sectorETF = TICKER_TO_SECTOR[ticker] || null;
        const tickerReturn20d = calcReturn(candles, 20);
        const sectorReturn20d = sectorETF ? (sectorReturns[sectorETF] || 0) : 0;
        const relStrength = sectorETF ? Math.round((tickerReturn20d - sectorReturn20d) * 100) / 100 : null;

        // Timeframe Continuity (D/W/M/Q candle direction)
        const tfc = computeTFC(candles);

        results.push({
          ticker,
          price,
          change: chg,
          volume: todayVol,
          avgVolume: Math.round(avgVolume),
          relVolume,
          level: label,
          confluenceScore: tfWithPatterns,
          totalPatterns,
          timeframes: tfResults,
          hasBullish,
          hasBearish,
          has5CR,
          patternNames,
          nextEarningsEst,
          daysToEarnings,
          sectorETF,
          tickerReturn20d,
          sectorReturn20d,
          relStrength,
          tfc,
        });

        const tfLabels = tfResults.map((t: any) => t.timeframe).join(', ');
        logs.push(`✓ ${ticker} · ${totalPatterns} patterns across ${tfWithPatterns} timeframes (${tfLabels})`);
      } else {
        logs.push(`⊘ ${ticker} · No active patterns`);
      }
    }, { concurrency: 8 });

    return results;
  }

  let indexResults: any[] = [];
  let sectorResults: any[] = [];
  let tickerResults: any[] = [];

  if (mode === 'topdown') {
    // ─── TOP-DOWN MODE ───
    logs.push('\n── Level 1: Scanning Indices ──');
    indexResults = await scanList(INDICES, 'INDEX');

    // Find active sectors based on index signals
    logs.push('\n── Level 2: Scanning Sector ETFs ──');

    // Also fetch quotes for sector ETFs
    const sectorSymbols = Object.keys(SECTOR_ETFS);
    for (let i = 0; i < sectorSymbols.length; i += 50) {
      const batch = sectorSymbols.slice(i, i + 50);
      try {
        const data = await schwabFetch('/quotes', { symbols: batch.join(','), fields: 'quote,fundamental' });
        Object.assign(allQuotes, data);
      } catch {}
    }
    sectorResults = await scanList(sectorSymbols, 'SECTOR');

    // Drill into sectors that have setups
    const activeSectors = sectorResults.map(r => r.ticker);
    if (activeSectors.length > 0) {
      logs.push(`\n── Level 3: Drilling into ${activeSectors.length} active sectors ──`);
      const drillTickers: string[] = [];
      for (const sectorETF of activeSectors) {
        const sector = SECTOR_ETFS[sectorETF];
        if (sector) {
          drillTickers.push(...sector.tickers); // All tickers in active sectors
        }
      }

      // Fetch quotes for drill tickers
      const uniqueDrill = Array.from(new Set(drillTickers));
      for (let i = 0; i < uniqueDrill.length; i += 50) {
        const batch = uniqueDrill.slice(i, i + 50);
        try {
          const data = await schwabFetch('/quotes', { symbols: batch.join(','), fields: 'quote,fundamental' });
          Object.assign(allQuotes, data);
        } catch {}
      }

      tickerResults = await scanList(uniqueDrill, 'TICKER');
    }
  } else {
    // ─── UNIVERSE MODE ───
    tickerResults = await scanList(tickers, 'TICKER');
  }

  // Sort all results by confluence score (most timeframes with patterns first)
  const allResults = [...indexResults, ...sectorResults, ...tickerResults]
    .sort((a, b) => b.confluenceScore - a.confluenceScore || b.totalPatterns - a.totalPatterns);

  logs.push(`\n✅ Scan complete: ${scanned} tickers, ${allResults.length} with patterns`);

  return NextResponse.json({
    results: allResults,
    indexResults,
    sectorResults,
    tickerResults,
    logs,
    scanned,
    source: 'schwab_equity',
  });
}
