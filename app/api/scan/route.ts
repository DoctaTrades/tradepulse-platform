import { NextRequest, NextResponse } from 'next/server';
import { hasSchwabConnection } from '@/app/lib/schwab-auth';
import { getQuotes, getOptionChain, getPriceHistory } from '@/app/lib/schwab-data';
import { UNIVERSE_TICKERS as UNIVERSES } from '@/app/lib/ticker-universes';
import { verifyAuth } from '@/app/lib/auth-helpers';
import { runInParallel } from '@/app/lib/parallel-fetch';

// UNIVERSES imported from shared lib/ticker-universes.ts — single source of truth

// ─── TECHNICAL CALCULATIONS ───────────────────────────────
function calcEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * 13 + (diff > 0 ? diff : 0)) / 14;
    avgLoss = (avgLoss * 13 + (diff < 0 ? Math.abs(diff) : 0)) / 14;
  }
  if (avgLoss === 0) return 100;
  return Math.round(100 - (100 / (1 + avgGain / avgLoss)));
}

function calcHV(prices: number[], period = 20): number | null {
  if (prices.length < period + 1) return null;
  const recent = prices.slice(-period - 1);
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) returns.push(Math.log(recent[i] / recent[i - 1]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.round(Math.sqrt(variance) * Math.sqrt(252) * 100);
}

function calcATR(bars: { h: number; l: number; c: number }[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs = bars.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - bars[i].c), Math.abs(b.l - bars[i].c)));
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function calcBollingerBands(prices: number[], period = 20, stdDev = 2): { upper: number; middle: number; lower: number; position: number } | null {
  if (prices.length < period) return null;
  const recent = prices.slice(-period);
  const mean = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((s, p) => s + (p - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mean + stdDev * sd;
  const lower = mean - stdDev * sd;
  const current = prices[prices.length - 1];
  // Position: 0 = at lower band, 50 = at middle (SMA), 100 = at upper band, <0 = below lower, >100 = above upper
  const position = upper > lower ? Math.round(((current - lower) / (upper - lower)) * 100) : 50;
  return { upper: Math.round(upper * 100) / 100, middle: Math.round(mean * 100) / 100, lower: Math.round(lower * 100) / 100, position };
}

function calcEMACross(prices: number[], fast = 20, slow = 50): 'golden' | 'death' | 'none' {
  if (prices.length < slow + 5) return 'none';
  // Compute EMA series
  const fastK = 2 / (fast + 1), slowK = 2 / (slow + 1);
  let fastEMA = prices.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  let slowEMA = prices.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  // Build series of last 5 values of each to check for cross
  const fastSeries: number[] = [];
  const slowSeries: number[] = [];
  for (let i = fast; i < prices.length; i++) {
    fastEMA = prices[i] * fastK + fastEMA * (1 - fastK);
    if (i >= slow) {
      slowEMA = prices[i] * slowK + slowEMA * (1 - slowK);
      fastSeries.push(fastEMA);
      slowSeries.push(slowEMA);
    }
  }
  // Also accumulate slow from start
  slowEMA = prices.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  const slowSeriesFull: number[] = [slowEMA];
  for (let i = slow; i < prices.length; i++) { slowEMA = prices[i] * slowK + slowEMA * (1 - slowK); slowSeriesFull.push(slowEMA); }
  // Check last 5 bars for cross
  const lookback = Math.min(5, fastSeries.length - 1);
  for (let i = fastSeries.length - lookback; i < fastSeries.length; i++) {
    if (i < 1) continue;
    const prevFast = fastSeries[i - 1], prevSlow = slowSeriesFull[i - 1];
    const currFast = fastSeries[i], currSlow = slowSeriesFull[i];
    if (prevFast <= prevSlow && currFast > currSlow) return 'golden';
    if (prevFast >= prevSlow && currFast < currSlow) return 'death';
  }
  return 'none';
}

function estimateIVR(iv: number, hv: number): number {
  if (!iv || !hv) return 50;
  const ratio = iv / hv;
  if (ratio >= 2.0) return 85;
  if (ratio >= 1.7) return 75;
  if (ratio >= 1.4) return 65;
  if (ratio >= 1.2) return 55;
  if (ratio >= 1.0) return 45;
  if (ratio >= 0.8) return 35;
  return 25;
}

// ─── SCHWAB SCAN (primary — real Greeks, fast) ────────────
async function scanWithSchwab(tickers: string[], filters: any, userId?: string) {
  const results: any[] = [];
  const logs: string[] = [];
  
  // Batch quotes — up to 500 symbols in one call!
  logs.push(`⚡ Schwab: Fetching quotes for ${tickers.length} tickers in one call...`);
  let allQuotes: any;
  try {
    allQuotes = await getQuotes(tickers, userId);
  } catch (e: unknown) {
    logs.push(`✕ Schwab quotes failed: ${(e instanceof Error ? e.message : "Unknown error")}`);
    return { results, logs, scanned: 0, source: 'schwab' };
  }

  let scanned = 0;
  await runInParallel(tickers, async (ticker) => {
    const quote = allQuotes[ticker]?.quote;
    if (!quote) { logs.push(`⊘ ${ticker} · No quote data`); return; }
    scanned++;

    const price = quote.lastPrice || quote.closePrice || 0;
    if (!price || price < filters.minPrice || price > filters.maxPrice) {
      logs.push(`⊘ ${ticker} · Price $${price?.toFixed(2)} out of range`);
      return;
    }

    const vol = quote.totalVolume || 0;
    if (vol < filters.minVol) {
      logs.push(`⊘ ${ticker} · Vol ${(vol/1000).toFixed(0)}K below minimum`);
      return;
    }

    // Market cap from fundamental data
    const mktCap = allQuotes[ticker]?.fundamental?.marketCap || 0;
    if (filters.minMktCap > 0 && mktCap > 0 && mktCap < filters.minMktCap) {
      logs.push(`⊘ ${ticker} · Mkt cap $${(mktCap/1e6).toFixed(0)}M below minimum`);
      return;
    }

    // Price history for technicals
    let ema20 = null, ema50 = null, ema200 = null, rsi = 50, hv = 20, atrPct = 2;
    let bb: { upper: number; middle: number; lower: number; position: number } | null = null;
    let emaCross: 'golden' | 'death' | 'none' = 'none';
    let smaSlope: number = 0;
    let swingLow: number = 0;
    try {
      const hist = await getPriceHistory(ticker, {
        periodType: 'year', period: 1, frequencyType: 'daily', frequency: 1,
      }, userId);
      const candles = hist.candles || [];
      if (candles.length >= 20) {
        const closes = candles.map((c: any) => c.close);
        const bars = candles.map((c: any) => ({ h: c.high, l: c.low, c: c.close }));
        ema20 = calcEMA(closes, 20);
        ema50 = calcEMA(closes, 50);
        ema200 = calcEMA(closes, 200);
        rsi = calcRSI(closes) || 50;
        hv = calcHV(closes) || 20;
        const atr = calcATR(bars) || (price * 0.02);
        atrPct = Math.round((atr / price) * 100 * 10) / 10;
        bb = calcBollingerBands(closes, 20, 2);
        emaCross = calcEMACross(closes, 20, 50);
        // SMA slope: % change of 20-day SMA over last 20 bars
        if (closes.length >= 40) {
          const sma20Now = closes.slice(-20).reduce((s: number, v: number) => s + v, 0) / 20;
          const sma20Prev = closes.slice(-40, -20).reduce((s: number, v: number) => s + v, 0) / 20;
          smaSlope = sma20Prev > 0 ? Math.round(((sma20Now - sma20Prev) / sma20Prev) * 100 * 10) / 10 : 0;
        }
        // Recent swing low (lowest close in last 20 bars)
        swingLow = Math.min(...closes.slice(-20));
      }
    } catch (e) {
      logs.push(`  ⚠ ${ticker} · Price history unavailable, using defaults`);
    }

    // Bollinger Band filter (optional — only applied if set)
    if (filters.bbPosition && filters.bbPosition !== 'any' && bb) {
      if (filters.bbPosition === 'below_lower' && bb.position > 0) { logs.push(`⊘ ${ticker} · BB position ${bb.position}% (need below lower)`); return; }
      if (filters.bbPosition === 'near_lower' && bb.position > 20) { logs.push(`⊘ ${ticker} · BB position ${bb.position}% (need ≤20%)`); return; }
      if (filters.bbPosition === 'near_upper' && bb.position < 80) { logs.push(`⊘ ${ticker} · BB position ${bb.position}% (need ≥80%)`); return; }
      if (filters.bbPosition === 'above_upper' && bb.position < 100) { logs.push(`⊘ ${ticker} · BB position ${bb.position}% (need above upper)`); return; }
      if (filters.bbPosition === 'middle' && (bb.position < 30 || bb.position > 70)) { logs.push(`⊘ ${ticker} · BB position ${bb.position}% (need 30-70%)`); return; }
    }

    // EMA Cross filter (optional — only applied if set)
    if (filters.emaCross && filters.emaCross !== 'any') {
      if (filters.emaCross !== emaCross) { logs.push(`⊘ ${ticker} · No ${filters.emaCross} cross`); return; }
    }

    // RSI filter — hard filter (Calendar Press wants neutral RSI near support too)
    if (rsi < filters.minRSI || rsi > filters.maxRSI) {
      logs.push(`⊘ ${ticker} · RSI ${rsi} out of range`);
      return;
    }

    // EMA filter — hard filter (Calendar Press wants stocks with support structure)
    if (filters.emaTrend === 'above20' && ema20 && price <= ema20) { logs.push(`⊘ ${ticker} · Below 20 EMA`); return; }
    if (filters.emaTrend === 'above50' && ema50 && price <= ema50) { logs.push(`⊘ ${ticker} · Below 50 EMA`); return; }
    if (filters.emaTrend === 'above200' && ema200 && price <= ema200) { logs.push(`⊘ ${ticker} · Below 200 EMA`); return; }
    if (filters.emaTrend === 'above_all' && ((ema20 && price <= ema20) || (ema50 && price <= ema50) || (ema200 && price <= ema200))) { logs.push(`⊘ ${ticker} · Below EMA(s)`); return; }
    if (filters.emaTrend === 'above_both' && ((ema50 && price <= ema50) || (ema200 && price <= ema200))) { logs.push(`⊘ ${ticker} · Below EMA(s)`); return; }
    if (filters.emaTrend === 'below20' && ema20 && price >= ema20) { logs.push(`⊘ ${ticker} · Above 20 EMA`); return; }

    // Option chain — THE BIG UPGRADE: real Greeks, real bid/ask, real DTE
    let iv = 0, ivr = 50, maxOI = 0, optVol = 0, optBid = 0, ror = 0;
    let bestPut: any = null;
    let putCallRatio = 0;
    let bidAskSpreadPct = 0;
    let allPuts: any[] = [];
    let allCalls: any[] = [];
    let cspByDTE: any[] = [];
    const targetDTE = filters.targetDTE || [25, 45];
    const targetDelta = filters.targetDelta || 0.30;
    const deltaMin = filters.cspDeltaMin || 0.10;
    const deltaMax = filters.cspDeltaMax || 0.35;

    try {
      const chain = await getOptionChain(ticker, {
        contractType: 'ALL',
        strikeCount: 40,
        range: 'ALL',
      }, userId);

      // IV is now computed from ATM contracts after allPuts/allCalls are populated (see below)
      
      // Process put map for CSP/Wheel analysis
      const putMap = chain.putExpDateMap || {};
      const callMap = chain.callExpDateMap || {};
      
      let totalPutOI = 0, totalCallOI = 0;

      for (const [expDate, strikes] of Object.entries(putMap) as any) {
        for (const [strike, contracts] of Object.entries(strikes) as any) {
          for (const c of contracts) {
            totalPutOI += c.openInterest || 0;
            optVol += c.totalVolume || 0;
            if ((c.openInterest || 0) > maxOI) maxOI = c.openInterest;
            allPuts.push({ ...c, expDate, strike: Number(strike) });
          }
        }
      }

      for (const [expDate, strikes] of Object.entries(callMap) as any) {
        for (const [strike, contracts] of Object.entries(strikes) as any) {
          for (const c of contracts) {
            totalCallOI += c.openInterest || 0;
            allCalls.push({ ...c, expDate, strike: Number(strike) });
          }
        }
      }

      putCallRatio = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : 0;

      // Compute real per-ticker IV from near-the-money contracts (puts AND calls)
      // Industry convention: ATM ~30-day IV. This is what Tastytrade/ToS call "stock IV".
      // Filters: strike within 7% of current price, 20-60 DTE, non-zero realistic volatility
      const atmIVs: number[] = [];
      const ivFilter = (c: any) => {
        const vol = c.volatility;
        const dte = c.daysToExpiration || 0;
        const strikePct = c.strike > 0 ? Math.abs(c.strike - price) / price : 1;
        return typeof vol === 'number' && vol > 0 && vol < 500 && dte >= 20 && dte <= 60 && strikePct <= 0.07;
      };
      for (const pc of allPuts) { if (ivFilter(pc)) atmIVs.push(pc.volatility); }
      for (const cc of allCalls) { if (ivFilter(cc)) atmIVs.push(cc.volatility); }
      if (atmIVs.length > 0) {
        const avgIV = atmIVs.reduce((s, v) => s + v, 0) / atmIVs.length;
        iv = Math.round(avgIV);
      } else {
        // Fallback: no near-ATM contracts found, estimate from historical volatility
        iv = Math.round(hv * 1.25);
      }

      // Find best put for CSP analysis
      // Search across multiple DTE buckets AND a delta range for optimal plays
      const dteBuckets: [string, number, number][] = [
        ['7-14d', 7, 14],
        ['25-45d', 25, 45],
        ['45-60d', 45, 60],
        ['60-90d', 60, 90],
      ];

      cspByDTE = [];
      let allCSPCandidates: any[] = [];

      for (const [label, dteMin, dteMax] of dteBuckets) {
        const candidates = allPuts.filter(p => {
          const dte = p.daysToExpiration || 0;
          const absDelta = Math.abs(p.delta || 0);
          return dte >= dteMin && dte <= dteMax && absDelta >= deltaMin && absDelta <= deltaMax && (p.bid || 0) > 0 && p.strike > 0 && p.strike < price;
        });
        if (!candidates.length) continue;

        // Score each candidate: balance premium efficiency vs safety
        const scored = candidates.map((put: any) => {
          const bid = put.bid || 0;
          const dte = put.daysToExpiration || 1;
          const absDelta = Math.abs(put.delta || 0);
          const putRor = Math.round((bid / put.strike) * 100 * 100) / 100;
          const annualizedRoR = Math.round((putRor / dte) * 365 * 100) / 100;
          const pop = Math.round((1 - absDelta) * 100); // probability of profit
          const capitalRequired = put.strike * 100;
          const premium100 = Math.round(bid * 100);
          // Value score: weighs annualized return, but penalizes high delta (lower safety)
          // A 0.15 delta with 25% annualized is better than 0.30 delta with 30% annualized
          const safetyMultiplier = 1 + (0.35 - absDelta); // higher for lower deltas
          const valueScore = Math.round(annualizedRoR * safetyMultiplier * 100) / 100;

          return {
            label,
            strike: put.strike,
            bid: put.bid,
            ask: put.ask,
            delta: put.delta,
            theta: put.theta,
            gamma: put.gamma,
            vega: put.vega,
            iv: put.volatility,
            dte,
            expDate: put.expDate?.split(':')[0],
            symbol: put.symbol,
            ror: putRor,
            annualizedRoR,
            capitalRequired,
            premium100,
            pop,
            valueScore,
          };
        });

        // Sort by value score descending, take top 2 per DTE bucket
        scored.sort((a: any, b: any) => b.valueScore - a.valueScore);
        const topForBucket = scored.slice(0, 2);
        cspByDTE.push(...topForBucket);
        allCSPCandidates.push(...scored);
      }

      // Also add the legacy single best per DTE bucket (closest to targetDelta) for backward compat
      // But now allCSPCandidates has the full range

      // Pick the best overall by value score
      if (allCSPCandidates.length > 0) {
        allCSPCandidates.sort((a: any, b: any) => b.valueScore - a.valueScore);
        const best = allCSPCandidates[0];
        bestPut = best;
        optBid = best.bid;
        ror = best.ror;

        if (best.bid > 0 && best.ask > 0) {
          const mid = (best.bid + best.ask) / 2;
          bidAskSpreadPct = Math.round(((best.ask - best.bid) / mid) * 100 * 10) / 10;
        }
      }
    } catch (e) {
      iv = Math.round(hv * 1.25);
      logs.push(`  ⚠ ${ticker} · Options chain unavailable, estimating IV`);
    }

    if (iv < filters.minIV) { logs.push(`⊘ ${ticker} · IV ${iv}% below ${filters.minIV}% min`); return; }

    ivr = estimateIVR(iv, hv);
    if (ivr < filters.minIVR) { logs.push(`⊘ ${ticker} · IVR ${ivr}% below ${filters.minIVR}% min`); return; }

    // Bid and RoR — soft flags (these are CSP-specific, Calendar Press doesn't use them)
    let passesBidRoR = true;
    if (filters.minBid > 0 && optBid > 0 && optBid < filters.minBid) passesBidRoR = false;
    if (filters.minRoR > 0 && ror < filters.minRoR) passesBidRoR = false;

    // If fails bid/RoR AND no Calendar Press potential in the chain, skip
    const passesMainFilters = passesBidRoR;
    if (!passesBidRoR) {
      const hasCalPressChain = allPuts.some(p => Math.abs(p.delta || 0) >= 0.55 && (p.daysToExpiration || 0) >= 60)
        && allPuts.some(p => Math.abs(p.delta || 0) <= 0.30 && (p.daysToExpiration || 0) <= 21 && (p.bid || 0) > 0);
      if (!hasCalPressChain) {
        if (optBid < filters.minBid) logs.push(`⊘ ${ticker} · Bid $${optBid.toFixed(2)} below min`);
        else logs.push(`⊘ ${ticker} · RoR ${ror}% below min`);
        return;
      }
    }

    const uoaRatio = maxOI > 0 ? Math.round((optVol / maxOI) * 10) / 10 : 0;
    // Daily % change — prefer Schwab's direct field, but fall back to recomputing
    // from lastPrice/closePrice because netPercentChangeInDouble is sometimes
    // missing or zero on the Schwab /quotes response.
    let chg = quote.netPercentChangeInDouble || 0;
    if (!chg && quote.lastPrice && quote.closePrice && quote.closePrice > 0) {
      chg = Math.round(((quote.lastPrice - quote.closePrice) / quote.closePrice) * 10000) / 100;
    }

    // Earnings date estimation
    const fund = allQuotes[ticker]?.fundamental;
    let nextEarningsEst: string | null = null;
    let daysToEarnings: number | null = null;
    if (fund?.lastEarningsDate) {
      const lastEarnings = new Date(fund.lastEarningsDate);
      const nextEst = new Date(lastEarnings.getTime() + 90 * 24 * 60 * 60 * 1000); // ~90 days later
      nextEarningsEst = nextEst.toISOString().split('T')[0];
      daysToEarnings = Math.round((nextEst.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    }

    const result: any = {
      ticker, price, change: chg, vol, iv, hv, ivr, rsi, atrPct,
      ema20: ema20 ? Math.round(ema20 * 100) / 100 : null,
      ema50: ema50 ? Math.round(ema50 * 100) / 100 : null,
      ema200: ema200 ? Math.round(ema200 * 100) / 100 : null,
      bb, emaCross, smaSlope, swingLow,
      maxOI, optVol, optBid, ror, uoaRatio,
      isUOA: uoaRatio >= 2 && optVol >= 500,
      mktCap, putCallRatio, bidAskSpreadPct,
      passesMainFilters,
      nextEarningsEst,
      daysToEarnings,
      sector: allQuotes[ticker]?.fundamental?.marketSector || 'Unknown',
      source: 'schwab',
    };

    // Best put contract details (Schwab-only data)
    if (bestPut) {
      result.bestPut = {
        strike: bestPut.strike,
        bid: bestPut.bid,
        ask: bestPut.ask,
        delta: bestPut.delta,
        theta: bestPut.theta,
        gamma: bestPut.gamma,
        vega: bestPut.vega,
        iv: bestPut.iv,
        dte: bestPut.dte,
        expDate: bestPut.expDate,
        symbol: bestPut.symbol,
        annualizedRoR: bestPut.annualizedRoR,
        valueScore: bestPut.valueScore,
        pop: bestPut.pop,
      };
    }

    // All DTE options for comparison
    if (cspByDTE.length > 0) {
      result.cspByDTE = cspByDTE;
    }

    // ─── PLAY BUILDER: Multi-leg strategies ──────────────

    // Helper: find best contract within delta range and DTE range
    // For strategies that should respect the user's delta min/max
    const findContractInRange = (contracts: any[], dMin: number, dMax: number, dte: [number, number]) => {
      const candidates = contracts.filter((c: any) => {
        const d = c.daysToExpiration || 0;
        const absDelta = Math.abs(c.delta || 0);
        return d >= dte[0] && d <= dte[1] && absDelta >= dMin && absDelta <= dMax && (c.bid || 0) > 0;
      });
      if (!candidates.length) return null;
      // Pick highest premium within range (best for credit collection)
      candidates.sort((a: any, b: any) => (b.bid || 0) - (a.bid || 0));
      return candidates[0];
    };

    // Helper: find contract closest to a specific delta (for strategies with fixed delta targets like PMCC, diagonals)
    const findContract = (contracts: any[], targetDelta: number, dte: [number, number]) => {
      const candidates = contracts.filter((c: any) => {
        const d = c.daysToExpiration || 0;
        return d >= dte[0] && d <= dte[1] && Math.abs(c.delta || 0) > 0.01 && (c.bid || 0) > 0;
      });
      if (!candidates.length) return null;
      candidates.sort((a: any, b: any) => Math.abs(Math.abs(a.delta) - targetDelta) - Math.abs(Math.abs(b.delta) - targetDelta));
      return candidates[0];
    };

    // Helper: find contract at specific strike and same expiration
    const findAtStrike = (contracts: any[], strike: number, expDate: string) => {
      return contracts.find((c: any) => c.strike === strike && c.expDate === expDate) || null;
    };

    // Helper: find contract N dollars away from a reference strike
    const findWing = (contracts: any[], refStrike: number, width: number, expDate: string) => {
      const target = refStrike + width;
      const sameDTE = contracts.filter((c: any) => c.expDate === expDate);
      if (!sameDTE.length) return null;
      sameDTE.sort((a: any, b: any) => Math.abs(a.strike - target) - Math.abs(b.strike - target));
      return sameDTE[0];
    };

    // ── OI WALL DETECTION ──
    // Find highest OI clusters for puts (support) and calls (resistance) within DTE range
    const detectOIWalls = (contracts: any[], dte: [number, number], count: number = 3) => {
      // Aggregate OI by strike across expirations within DTE range
      const oiByStrike: Record<number, number> = {};
      contracts.forEach(c => {
        const d = c.daysToExpiration || 0;
        if (d >= dte[0] && d <= dte[1] && (c.openInterest || 0) > 0) {
          const s = c.strike;
          oiByStrike[s] = (oiByStrike[s] || 0) + (c.openInterest || 0);
        }
      });
      // Sort by OI descending and take top N
      return Object.entries(oiByStrike)
        .map(([strike, oi]) => ({ strike: Number(strike), oi }))
        .sort((a, b) => b.oi - a.oi)
        .slice(0, count);
    };

    const putOIWalls = detectOIWalls(allPuts, targetDTE);
    const callOIWalls = detectOIWalls(allCalls, targetDTE);
    result.putOIWalls = putOIWalls;
    result.callOIWalls = callOIWalls;

    // ── CREDIT SPREAD (Bull Put) — try all standard widths, keep all valid ──
    const shortPut = findContractInRange(allPuts, deltaMin, deltaMax, targetDTE);
    if (shortPut) {
      const allPutSpreads: any[] = [];
      for (const w of [1, 2.5, 5, 7.5, 10, 15, 20]) {
        const longPut = findWing(allPuts, shortPut.strike, -w, shortPut.expDate);
        if (longPut && longPut.strike < shortPut.strike && (longPut.ask || 0) > 0) {
          const nc = Math.round(((shortPut.bid || 0) - (longPut.ask || 0)) * 100) / 100;
          const actualWidth = Math.abs(shortPut.strike - longPut.strike);
          if (nc > 0) {
            const ml = Math.round((actualWidth - nc) * 100) / 100;
            allPutSpreads.push({
              longPut, netCredit: nc, width: actualWidth, maxLoss: ml,
              rorSpread: ml > 0 ? Math.round((nc / ml) * 100 * 100) / 100 : 0,
            });
          }
        }
      }
      if (allPutSpreads.length > 0) {
        const bestPS = allPutSpreads.reduce((a, b) => a.rorSpread > b.rorSpread ? a : b);
        result.creditSpread = {
          type: 'BULL PUT',
          shortLeg: { strike: shortPut.strike, bid: shortPut.bid, ask: shortPut.ask, delta: shortPut.delta, dte: shortPut.daysToExpiration, expDate: shortPut.expDate?.split(':')[0] },
          longLeg: { strike: bestPS.longPut.strike, bid: bestPS.longPut.bid, ask: bestPS.longPut.ask, delta: bestPS.longPut.delta },
          netCredit: bestPS.netCredit, maxLoss: bestPS.maxLoss, width: bestPS.width,
          rorSpread: bestPS.rorSpread,
          pop: shortPut.delta ? Math.round((1 - Math.abs(shortPut.delta)) * 100) : 70,
          nearestPutWall: putOIWalls.length > 0 ? putOIWalls.reduce((closest, w) => Math.abs(w.strike - shortPut.strike) < Math.abs(closest.strike - shortPut.strike) ? w : closest) : null,
          atWall: putOIWalls.some(w => w.strike === shortPut.strike),
          allWidths: allPutSpreads.map(sp => ({ width: sp.width, netCredit: sp.netCredit, maxLoss: sp.maxLoss, rorSpread: sp.rorSpread, longStrike: sp.longPut.strike, longBid: sp.longPut.bid, longAsk: sp.longPut.ask })),
        };
      }
    }

    // ── CREDIT SPREAD (Bear Call) — try all standard widths, keep all valid ──
    const shortCall = findContractInRange(allCalls, deltaMin, deltaMax, targetDTE);
    if (shortCall) {
      const allCallSpreads: any[] = [];
      for (const w of [1, 2.5, 5, 7.5, 10, 15, 20]) {
        const longCall = findWing(allCalls, shortCall.strike, w, shortCall.expDate);
        if (longCall && longCall.strike > shortCall.strike && (longCall.ask || 0) > 0) {
          const nc = Math.round(((shortCall.bid || 0) - (longCall.ask || 0)) * 100) / 100;
          const actualWidth = Math.abs(longCall.strike - shortCall.strike);
          if (nc > 0) {
            const ml = Math.round((actualWidth - nc) * 100) / 100;
            allCallSpreads.push({
              longCall, netCredit: nc, width: actualWidth, maxLoss: ml,
              rorSpread: ml > 0 ? Math.round((nc / ml) * 100 * 100) / 100 : 0,
            });
          }
        }
      }
      if (allCallSpreads.length > 0) {
        const bestCS = allCallSpreads.reduce((a, b) => a.rorSpread > b.rorSpread ? a : b);
        result.bearCallSpread = {
          type: 'BEAR CALL',
          shortLeg: { strike: shortCall.strike, bid: shortCall.bid, ask: shortCall.ask, delta: shortCall.delta, dte: shortCall.daysToExpiration, expDate: shortCall.expDate?.split(':')[0] },
          longLeg: { strike: bestCS.longCall.strike, bid: bestCS.longCall.bid, ask: bestCS.longCall.ask, delta: bestCS.longCall.delta },
          netCredit: bestCS.netCredit, maxLoss: bestCS.maxLoss, width: bestCS.width,
          rorSpread: bestCS.rorSpread,
          pop: shortCall.delta ? Math.round((1 - Math.abs(shortCall.delta)) * 100) : 70,
          nearestCallWall: callOIWalls.length > 0 ? callOIWalls.reduce((closest, w) => Math.abs(w.strike - shortCall.strike) < Math.abs(closest.strike - shortCall.strike) ? w : closest) : null,
          atWall: callOIWalls.some(w => w.strike === shortCall.strike),
          allWidths: allCallSpreads.map(sp => ({ width: sp.width, netCredit: sp.netCredit, maxLoss: sp.maxLoss, rorSpread: sp.rorSpread, longStrike: sp.longCall.strike, longBid: sp.longCall.bid, longAsk: sp.longCall.ask })),
        };
      }
    }

    // ── IRON CONDOR (combine bull put + bear call) ──
    if (result.creditSpread && result.bearCallSpread) {
      const totalCredit = Math.round((result.creditSpread.netCredit + result.bearCallSpread.netCredit) * 100) / 100;
      const singleSideMaxLoss = Math.max(result.creditSpread.maxLoss, result.bearCallSpread.maxLoss);
      const icMaxLoss = Math.round((singleSideMaxLoss - totalCredit) * 100) / 100;
      result.ironCondor = {
        putSpread: result.creditSpread,
        callSpread: result.bearCallSpread,
        totalCredit,
        maxLoss: Math.max(icMaxLoss, 0),
        breakEvenLow: result.creditSpread.shortLeg.strike - totalCredit,
        breakEvenHigh: result.bearCallSpread.shortLeg.strike + totalCredit,
        dte: result.creditSpread.shortLeg.dte,
        expDate: result.creditSpread.shortLeg.expDate,
        rorIC: icMaxLoss > 0 ? Math.round((totalCredit / icMaxLoss) * 100 * 100) / 100 : 0,
      };
    }

    // ── PMCC (deep ITM LEAP + short OTM call) ──
    const leapCall = findContract(allCalls, 0.70, [180, 730]); // 6-24 months out, deep ITM
    const shortOTMCall = findContract(allCalls, 0.25, targetDTE); // near term OTM
    if (leapCall && shortOTMCall) {
      const leapCost = leapCall.ask || 0;
      const shortCredit = shortOTMCall.bid || 0;
      const netDebit = Math.round((leapCost - shortCredit) * 100) / 100;
      result.pmcc = {
        leapLeg: { strike: leapCall.strike, bid: leapCall.bid, ask: leapCall.ask, delta: leapCall.delta, dte: leapCall.daysToExpiration, expDate: leapCall.expDate?.split(':')[0] },
        shortLeg: { strike: shortOTMCall.strike, bid: shortOTMCall.bid, ask: shortOTMCall.ask, delta: shortOTMCall.delta, dte: shortOTMCall.daysToExpiration, expDate: shortOTMCall.expDate?.split(':')[0] },
        leapCost,
        shortCredit,
        netDebit,
        capitalRequired: Math.round(netDebit * 100),
        monthlyIncome: shortCredit,
        breakEven: leapCall.strike + netDebit,
      };
    }

    // ── DIAGONAL (back month + front month different strikes) ──
    const backMonth = findContract(allCalls, 0.50, [45, 90]); // slightly ITM, 45-90 DTE
    const frontMonth = findContract(allCalls, 0.25, targetDTE); // OTM, near term
    if (backMonth && frontMonth && backMonth.expDate !== frontMonth.expDate) {
      const netDebit = Math.round(((backMonth.ask || 0) - (frontMonth.bid || 0)) * 100) / 100;
      result.diagonal = {
        type: 'CALL DIAGONAL',
        backLeg: { strike: backMonth.strike, bid: backMonth.bid, ask: backMonth.ask, delta: backMonth.delta, dte: backMonth.daysToExpiration, expDate: backMonth.expDate?.split(':')[0] },
        frontLeg: { strike: frontMonth.strike, bid: frontMonth.bid, ask: frontMonth.ask, delta: frontMonth.delta, dte: frontMonth.daysToExpiration, expDate: frontMonth.expDate?.split(':')[0] },
        netDebit,
        capitalRequired: Math.round(netDebit * 100),
        maxProfit: Math.round(((frontMonth.strike - backMonth.strike) + (frontMonth.bid || 0) - netDebit) * 100) / 100,
      };
    }

    // ── CALENDAR PRESS (neutral-to-mildly-bullish put diagonal) ──
    // SELL weekly OTM put (5-14 DTE, prefer ~7 DTE) — at or below support, income generator
    // BUY longer-dated OTM put (60-180 DTE, prefer 90-120 DTE) — collateral + downside hedge
    // Cost ratio driven: find long puts where cost is 1.5-3x the weekly credit
    // Composite score: weeklyROC / costRatio — rewards high ROC + fast payback
    const shortPutCP = findContractInRange(allPuts, deltaMin, deltaMax, [5, 14]);
    if (shortPutCP && (shortPutCP.bid || 0) > 0 && shortPutCP.strike < price) {
      const weeklyCredit = shortPutCP.bid || 0;
      const shortStrike = shortPutCP.strike;

      // Scan ALL long puts in 60-180 DTE range below the short strike
      const longPutCandidates = allPuts.filter((p: any) => {
        const dte = p.daysToExpiration || 0;
        return dte >= 60 && dte <= 180
          && p.strike < shortStrike
          && p.strike > 0
          && (shortStrike - p.strike) <= 30
          && (p.ask || 0) >= 0.10
          && p.expDate !== shortPutCP.expDate;
      });

      // Deduplicate by strike — prefer 90-120 DTE sweet spot
      const byStrike: Record<number, any> = {};
      longPutCandidates.forEach((p: any) => {
        const s = p.strike;
        const inSweetSpot = p.daysToExpiration >= 90 && p.daysToExpiration <= 120;
        const existingInSweetSpot = byStrike[s] && byStrike[s].daysToExpiration >= 90 && byStrike[s].daysToExpiration <= 120;
        if (!byStrike[s]) { byStrike[s] = p; }
        else if (inSweetSpot && !existingInSweetSpot) { byStrike[s] = p; }
        else if (inSweetSpot === existingInSweetSpot && Math.abs(p.daysToExpiration - 105) < Math.abs(byStrike[s].daysToExpiration - 105)) { byStrike[s] = p; }
      });

      const allCPSetups: any[] = [];
      Object.values(byStrike).forEach((longPut: any) => {
        const longCost = longPut.ask || 0;
        const actualWidth = shortStrike - longPut.strike;
        if (actualWidth <= 0) return;
        const capitalRequired = actualWidth * 100;
        const costRatio = weeklyCredit > 0 ? longCost / weeklyCredit : 99;
        const weeksToBreakeven = weeklyCredit > 0 ? Math.ceil(longCost / weeklyCredit) : 99;
        const weeklyROC = capitalRequired > 0 ? (weeklyCredit * 100 / capitalRequired) * 100 : 0;
        const weeklyROI = longCost > 0 ? Math.round((weeklyCredit / longCost) * 100 * 100) / 100 : 0;
        // Composite score: rewards setups closest to 2x cost ratio AND high ROC
        // ratioScore: 1.0 at exactly 2x, drops off in both directions
        // e.g. 1.5x = 0.75, 2.0x = 1.0, 2.5x = 0.75, 3.0x = 0.50
        const ratioScore = costRatio > 0 ? Math.max(0, 1 - Math.abs(costRatio - 2) * 0.5) : 0;
        const score = ratioScore * weeklyROC;

        allCPSetups.push({
          longPut, longCost, actualWidth, capitalRequired,
          costRatio: Math.round(costRatio * 10) / 10,
          weeksToBreakeven, weeklyROC: Math.round(weeklyROC * 100) / 100,
          weeklyROI, score: Math.round(score * 100) / 100,
        });
      });

      // Filter extreme outliers, sort by composite score
      const validSetups = allCPSetups.filter(sp => sp.costRatio <= 10).sort((a, b) => b.score - a.score);

      if (validSetups.length > 0) {
        const best = validSetups[0];

        // Support proximity: check if short strike is near key support levels
        const supportProximity: any[] = [];
        if (bb && Math.abs(shortStrike - bb.lower) / price < 0.03) supportProximity.push({ level: 'BB Lower', value: bb.lower });
        if (ema20 && Math.abs(shortStrike - ema20) / price < 0.03) supportProximity.push({ level: '20 EMA', value: Math.round(ema20 * 100) / 100 });
        if (ema50 && Math.abs(shortStrike - ema50) / price < 0.03) supportProximity.push({ level: '50 EMA', value: Math.round(ema50 * 100) / 100 });
        if (swingLow > 0 && Math.abs(shortStrike - swingLow) / price < 0.03) supportProximity.push({ level: 'Swing Low', value: swingLow });

        result.calendarPress = {
          longLeg: {
            strike: best.longPut.strike, bid: best.longPut.bid, ask: best.longPut.ask,
            delta: best.longPut.delta, dte: best.longPut.daysToExpiration,
            expDate: best.longPut.expDate?.split(':')[0],
            intrinsicValue: 0,
          },
          shortLeg: {
            strike: shortPutCP.strike, bid: shortPutCP.bid, ask: shortPutCP.ask,
            delta: shortPutCP.delta, dte: shortPutCP.daysToExpiration,
            expDate: shortPutCP.expDate?.split(':')[0],
          },
          longCost: best.longCost,
          weeklyCredit,
          netDebit: Math.round((best.longCost - weeklyCredit) * 100) / 100,
          spreadWidth: best.actualWidth,
          capitalRequired: best.capitalRequired,
          weeksToBreakeven: best.weeksToBreakeven,
          costRatio: best.costRatio,
          weeklyROI: best.weeklyROI,
          weeklyROC: best.weeklyROC,
          score: best.score,
          maxProfitIfBearish: Math.round((shortStrike - best.longPut.strike) * 100) / 100,
          supportProximity,
          allWidths: validSetups.map(sp => ({
            width: sp.actualWidth, capitalRequired: sp.capitalRequired, costRatio: sp.costRatio,
            weeksToBreakeven: sp.weeksToBreakeven, weeklyROC: sp.weeklyROC, weeklyROI: sp.weeklyROI,
            longCost: sp.longCost, longStrike: sp.longPut.strike, longDTE: sp.longPut.daysToExpiration,
            score: sp.score,
          })),
        };
      }
    }

    logs.push(`✓ ${ticker} · IVR:${ivr}% · IV:${iv}% · RoR:${ror}% · Bid:$${optBid.toFixed(2)}${bestPut ? ` · Δ${bestPut.delta?.toFixed(2)} · ${bestPut.daysToExpiration}DTE` : ''}`);
    results.push(result);
  }, { concurrency: 8, onError: (t, e) => logs.push(`✕ ${t} · ${e instanceof Error ? e.message : 'error'}`) });

  return { results, logs, scanned, source: 'schwab' };
}

// ─── MAIN SCAN ENDPOINT ──────────────────────────────────
export async function POST(req: NextRequest) {
  // Verify auth and derive userId from the JWT, not the request body.
  // Rejects unauthenticated requests immediately.
  const { userId } = await verifyAuth(req);
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const {
    universe = 'core',
    customTickers,
    filters = {},
  } = body;

  // Build ticker list
  let tickers = customTickers || UNIVERSES[universe] || UNIVERSES.core;

  // Default filters
  const f = {
    minPrice: filters.minPrice ?? 20,
    maxPrice: filters.maxPrice ?? 300,
    minMktCap: (filters.minMktCap ?? 250) * 1e6,
    minIVR: filters.minIVR ?? 25,
    minIV: filters.minIV ?? 20,
    minVol: filters.minVol ?? 200000,
    minOI: filters.minOI ?? 50,
    minBid: filters.minBid ?? 0.10,
    minRoR: filters.minRoR ?? 0,
    minRSI: filters.minRSI ?? 30,
    maxRSI: filters.maxRSI ?? 75,
    emaTrend: filters.emaTrend ?? 'any',
    targetDelta: filters.targetDelta ?? 0.30,
    targetDTE: filters.targetDTE ?? [25, 45],
    cspDeltaMin: filters.cspDeltaMin ?? 0.10,
    cspDeltaMax: filters.cspDeltaMax ?? 0.35,
    cpShortDelta: filters.cpShortDelta ?? 0.30,
  };

  const useSchwab = await hasSchwabConnection(userId);
  
  if (useSchwab) {
    const result = await scanWithSchwab(tickers, f, userId);
    return NextResponse.json(result);
  }

  // User doesn't have Schwab connected — return clear error instead of a
  // degraded fallback. Schwab is the required data provider.
  return NextResponse.json({
    error: 'Schwab not connected',
    message: 'This scan requires a Schwab API connection. Go to Settings → Schwab API to connect your Schwab developer account.',
    results: [],
    logs: ['✕ Schwab not connected. Connect your Schwab API in Settings to run scans.'],
    scanned: 0,
    source: 'none',
  }, { status: 401 });
}
