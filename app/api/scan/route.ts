import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/app/lib/schwab-auth';
import { getQuotes, getOptionChain, getPriceHistory, setActiveUser } from '@/app/lib/schwab-data';

// ─── TICKER UNIVERSES ─────────────────────────────────────
const UNIVERSES: Record<string, string[]> = {
  core: [
    // Tier 1 — Mega-liquid premium machines
    'SPY','QQQ','IWM','AAPL','TSLA','NVDA','AMD','META','AMZN','GOOGL','MSFT','NFLX',
    // Tier 2 — High IV / high volume
    'COIN','MSTR','MARA','RIOT','SOFI','HOOD','RIVN',
    'SHOP','SQ','PLTR','ROKU','DKNG','SNAP','UBER','ABNB',
    // Tier 3 — Blue chip premium
    'JPM','BAC','GS','DIS','HD','WMT','COST','KO','PEP',
    'JNJ','PG','XOM','CVX','BA','CAT','DE','AVGO','CRM','ABBV',
    // Tier 4 — Sector ETFs
    'XLE','XLF','XLK','XLV','GLD','SLV','TLT','EEM','SMH','ARKK'
  ],
  sp500: [
    'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','LLY','JPM',
    'V','UNH','XOM','MA','JNJ','PG','COST','HD','MRK','ABBV','CRM','AMD',
    'CVX','BAC','NFLX','KO','PEP','TMO','WMT','ACN','LIN','MCD','ABT',
    'CSCO','TXN','DHR','NEE','NKE','PM','MS','AMGN','RTX','SCHW','ISRG',
    'GS','SPGI','LOW','BKNG','INTU','GE','DE','CAT','AMAT','REGN','BMY',
    'SYK','VRTX','ADI','GILD','C','AXP','MDLZ','PLD','MO','ETN','BSX',
    'BLK','CB','LRCX','ZTS','AMT','SO','DUK','COP','CI','SHW','MMC',
    'TGT','WM','FCX','HON','MMM','ITW','EMR','PH','GD','NOC','LMT',
    'OXY','PSX','VLO','MPC','SLB','HAL','BKR','WFC','USB','PNC',
    'AIG','PRU','MET','AFL','ALL','PGR','TRV','ORCL','ADBE','NOW',
    'PYPL','INTC','QCOM','MU','KLAC','SNPS','CDNS','MRVL','ON','NXPI',
    'CMG','SBUX','YUM','DPZ','ORLY','AZO','ROST','TJX','LULU','NKE',
    'UPS','FDX','DAL','UAL','AAL','LUV','ABNB','BKNG','MAR','HLT',
    'PFE','MRNA','BIIB','ILMN','DXCM','ZBH','EW','MDT','BDX',
    'NEE','AEP','D','SRE','EXC','XEL','ED','WEC','ES','AEE',
    'PSA','O','WELL','EQR','AVB','SPG','DLR','CCI','AMT','EQIX'
  ],
  highIV: [
    // Stocks that consistently have elevated IV — premium selling targets
    'TSLA','NVDA','AMD','COIN','MSTR','MARA','RIOT','SOFI','HOOD','RIVN',
    'SHOP','SQ','PLTR','ROKU','DKNG','SNAP','RBLX','U','NET','CRWD',
    'SNOW','OKTA','MDB','PANW','ZS','DDOG','BILL','HUBS','CFLT',
    'UPST','AFRM','LCID','NIO','XPEV','LI','SMCI','ARM','IONQ',
    'GME','AMC','BBBY','SPCE','MRNA','BNTX','ENPH','SEDG',
    'ARKK','TQQQ','SQQQ','UVXY','SOXL','SOXS'
  ],
  etf: [
    'SPY','QQQ','IWM','DIA','RSP','MDY','GLD','SLV','TLT','IEF',
    'HYG','LQD','EEM','EFA','VWO','FXI','EWJ','EWZ',
    'XLE','XLF','XLK','XLV','XLI','XLP','XLU','XLB','XLY','XLRE','XLC',
    'XBI','IBB','ARKK','ARKG','ARKW',
    'SOXX','SMH','HACK','KWEB','BITO',
    'GDX','GDXJ','USO','UNG',
    'UVXY','TQQQ','SQQQ','SPXU','UPRO','TNA','TZA','SOXL','SOXS'
  ],
  megaCap: [
    // Top 30 by market cap — most liquid options in the market
    'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','LLY','JPM',
    'V','UNH','XOM','MA','JNJ','PG','COST','HD','MRK','ABBV',
    'CRM','AMD','CVX','BAC','NFLX','KO','PEP','TMO','WMT','ORCL'
  ],
};

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
async function scanWithSchwab(tickers: string[], filters: any) {
  const results: any[] = [];
  const logs: string[] = [];
  
  // Batch quotes — up to 500 symbols in one call!
  logs.push(`⚡ Schwab: Fetching quotes for ${tickers.length} tickers in one call...`);
  logs.push(`🎯 CSP Delta Range: ${filters.cspDeltaMin} — ${filters.cspDeltaMax}`);
  let allQuotes: any;
  try {
    allQuotes = await getQuotes(tickers);
  } catch (e: unknown) {
    logs.push(`✕ Schwab quotes failed: ${(e instanceof Error ? e.message : "Unknown error")}`);
    return { results, logs, scanned: 0, source: 'schwab' };
  }

  let scanned = 0;
  for (const ticker of tickers) {
    const quote = allQuotes[ticker]?.quote;
    if (!quote) { logs.push(`⊘ ${ticker} · No quote data`); continue; }
    scanned++;

    const price = quote.lastPrice || quote.closePrice || 0;
    if (!price || price < filters.minPrice || price > filters.maxPrice) {
      logs.push(`⊘ ${ticker} · Price $${price?.toFixed(2)} out of range`);
      continue;
    }

    const vol = quote.totalVolume || 0;
    if (vol < filters.minVol) {
      logs.push(`⊘ ${ticker} · Vol ${(vol/1000).toFixed(0)}K below minimum`);
      continue;
    }

    // Market cap from fundamental data
    const mktCap = allQuotes[ticker]?.fundamental?.marketCap || 0;
    if (filters.minMktCap > 0 && mktCap > 0 && mktCap < filters.minMktCap) {
      logs.push(`⊘ ${ticker} · Mkt cap $${(mktCap/1e6).toFixed(0)}M below minimum`);
      continue;
    }

    // Price history for technicals
    let ema20 = null, ema50 = null, ema200 = null, rsi = 50, hv = 20, atrPct = 2;
    try {
      const hist = await getPriceHistory(ticker, {
        periodType: 'year', period: 1, frequencyType: 'daily', frequency: 1,
      });
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
      }
    } catch (e) {
      logs.push(`  ⚠ ${ticker} · Price history unavailable, using defaults`);
    }

    // RSI filter — hard filter (Calendar Press wants neutral RSI near support too)
    if (rsi < filters.minRSI || rsi > filters.maxRSI) {
      logs.push(`⊘ ${ticker} · RSI ${rsi} out of range`);
      continue;
    }

    // EMA filter — hard filter (Calendar Press wants stocks with support structure)
    if (filters.emaTrend === 'above20' && ema20 && price <= ema20) { logs.push(`⊘ ${ticker} · Below 20 EMA`); continue; }
    if (filters.emaTrend === 'above50' && ema50 && price <= ema50) { logs.push(`⊘ ${ticker} · Below 50 EMA`); continue; }
    if (filters.emaTrend === 'above200' && ema200 && price <= ema200) { logs.push(`⊘ ${ticker} · Below 200 EMA`); continue; }
    if (filters.emaTrend === 'above_all' && ((ema20 && price <= ema20) || (ema50 && price <= ema50) || (ema200 && price <= ema200))) { logs.push(`⊘ ${ticker} · Below EMA(s)`); continue; }
    if (filters.emaTrend === 'above_both' && ((ema50 && price <= ema50) || (ema200 && price <= ema200))) { logs.push(`⊘ ${ticker} · Below EMA(s)`); continue; }
    if (filters.emaTrend === 'below20' && ema20 && price >= ema20) { logs.push(`⊘ ${ticker} · Above 20 EMA`); continue; }

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

    try {
      const chain = await getOptionChain(ticker, {
        contractType: 'ALL',
        strikeCount: 40,
        range: 'ALL',
      });

      // Extract IV from the chain
      iv = Math.round((chain.volatility || hv * 1.25) * (chain.volatility > 1 ? 1 : 100));
      
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

      // Find best put for CSP analysis
      // Search across multiple DTE buckets AND a delta range for optimal plays
      const deltaMin = filters.cspDeltaMin || 0.10;
      const deltaMax = filters.cspDeltaMax || 0.35;
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

    if (iv < filters.minIV) { logs.push(`⊘ ${ticker} · IV ${iv}% below ${filters.minIV}% min`); continue; }

    ivr = estimateIVR(iv, hv);
    if (ivr < filters.minIVR) { logs.push(`⊘ ${ticker} · IVR ${ivr}% below ${filters.minIVR}% min`); continue; }

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
        continue;
      }
    }

    const uoaRatio = maxOI > 0 ? Math.round((optVol / maxOI) * 10) / 10 : 0;
    const chg = quote.netPercentChangeInDouble || 0;

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

    // Helper: find contract closest to target delta within DTE range
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

    // ── CREDIT SPREAD (Bull Put) ──
    const shortPut = findContract(allPuts, targetDelta, targetDTE);
    if (shortPut) {
      const width = price > 100 ? 10 : 5;
      const longPut = findWing(allPuts, shortPut.strike, -width, shortPut.expDate);
      if (longPut) {
        const netCredit = Math.round(((shortPut.bid || 0) - (longPut.ask || 0)) * 100) / 100;
        const maxLoss = Math.round((Math.abs(shortPut.strike - longPut.strike) - netCredit) * 100) / 100;
        result.creditSpread = {
          type: 'BULL PUT',
          shortLeg: { strike: shortPut.strike, bid: shortPut.bid, ask: shortPut.ask, delta: shortPut.delta, dte: shortPut.daysToExpiration, expDate: shortPut.expDate?.split(':')[0] },
          longLeg: { strike: longPut.strike, bid: longPut.bid, ask: longPut.ask, delta: longPut.delta },
          netCredit,
          maxLoss,
          width: Math.abs(shortPut.strike - longPut.strike),
          rorSpread: maxLoss > 0 ? Math.round((netCredit / maxLoss) * 100 * 100) / 100 : 0,
          pop: shortPut.delta ? Math.round((1 - Math.abs(shortPut.delta)) * 100) : 70,
        };
      }
    }

    // ── CREDIT SPREAD (Bear Call) ──
    const shortCall = findContract(allCalls, 0.30, targetDTE);
    if (shortCall) {
      const width = price > 100 ? 10 : 5;
      const longCall = findWing(allCalls, shortCall.strike, width, shortCall.expDate);
      if (longCall) {
        const netCredit = Math.round(((shortCall.bid || 0) - (longCall.ask || 0)) * 100) / 100;
        const maxLoss = Math.round((Math.abs(longCall.strike - shortCall.strike) - netCredit) * 100) / 100;
        result.bearCallSpread = {
          type: 'BEAR CALL',
          shortLeg: { strike: shortCall.strike, bid: shortCall.bid, ask: shortCall.ask, delta: shortCall.delta, dte: shortCall.daysToExpiration, expDate: shortCall.expDate?.split(':')[0] },
          longLeg: { strike: longCall.strike, bid: longCall.bid, ask: longCall.ask, delta: longCall.delta },
          netCredit,
          maxLoss,
          width: Math.abs(longCall.strike - shortCall.strike),
          rorSpread: maxLoss > 0 ? Math.round((netCredit / maxLoss) * 100 * 100) / 100 : 0,
          pop: shortCall.delta ? Math.round((1 - Math.abs(shortCall.delta)) * 100) : 70,
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

    // ── CALENDAR PRESS (put diagonal / collateralized weekly put selling) ──
    // ── CALENDAR PRESS (neutral-to-bullish put diagonal) ──
    // SELL weekly OTM put (3-21 DTE) — closer to the money, income generator
    // BUY longer-dated OTM put (60-150 DTE) — further from money, collateral/protection
    // Both strikes BELOW current price (both OTM)
    // Short strike > Long strike (short is closer to the money)
    // Capital required = spread width (short strike - long strike) × 100
    const cpShortDelta = filters.cpShortDelta || 0.30;
    const shortPutCP = findContract(allPuts, cpShortDelta, [3, 21]);
    if (shortPutCP && (shortPutCP.bid || 0) > 0 && shortPutCP.strike < price) {
      const weeklyCredit = shortPutCP.bid || 0;
      const shortStrike = shortPutCP.strike;

      // Long put: further OTM, 60-150 DTE, strike below the short put
      // Try widths starting tight ($5) — prefer tightest spread that still has liquidity
      let bestLP: any = null;
      let bestSetup: any = null;

      for (const width of [5, 10, 15, 20, 25]) {
        const targetStrike = shortStrike - width;
        if (targetStrike <= 0) continue;

        // Find long puts near this strike in 60-150 DTE range
        const candidates = allPuts.filter((p: any) => {
          const dte = p.daysToExpiration || 0;
          return dte >= 60 && dte <= 150
            && Math.abs(p.strike - targetStrike) <= 3
            && p.strike < shortStrike  // MUST be below short strike
            && (p.ask || 0) > 0;
        });
        if (!candidates.length) continue;

        candidates.sort((a: any, b: any) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike));
        const longPut = candidates[0];
        if (longPut.expDate === shortPutCP.expDate) continue;

        const longCost = longPut.ask || 0;
        const actualWidth = shortStrike - longPut.strike;
        if (actualWidth <= 0) continue;

        const capitalRequired = actualWidth * 100;
        const costRatio = weeklyCredit > 0 ? longCost / weeklyCredit : 99;
        const weeksToBreakeven = weeklyCredit > 0 ? Math.ceil(longCost / weeklyCredit) : 99;
        const weeklyROC = capitalRequired > 0 ? (weeklyCredit * 100 / capitalRequired) * 100 : 0;

        // Pick TIGHTEST spread first (least capital), only go wider if no liquidity
        if (!bestSetup) {
          bestLP = longPut;
          bestSetup = { longCost, actualWidth, capitalRequired, costRatio, weeksToBreakeven, weeklyROC };
        }
      }

      if (bestLP && bestSetup) {
        const costRatio = Math.round(bestSetup.costRatio * 10) / 10;
        const weeklyROI = bestSetup.longCost > 0 ? Math.round((weeklyCredit / bestSetup.longCost) * 100 * 100) / 100 : 0;
        const weeklyROC = Math.round(bestSetup.weeklyROC * 100) / 100;

        logs.push(`  📅 ${ticker} CalPress: Sell $${shortStrike}P @$${weeklyCredit.toFixed(2)} (${shortPutCP.daysToExpiration}DTE) / Buy $${bestLP.strike}P @$${bestSetup.longCost.toFixed(2)} (${bestLP.daysToExpiration}DTE) · Width:$${bestSetup.actualWidth} · Cap:$${bestSetup.capitalRequired} · Ratio:${costRatio}x · ~${bestSetup.weeksToBreakeven}wks · ROC:${weeklyROC}%`);

        result.calendarPress = {
          longLeg: {
            strike: bestLP.strike, bid: bestLP.bid, ask: bestLP.ask,
            delta: bestLP.delta, dte: bestLP.daysToExpiration,
            expDate: bestLP.expDate?.split(':')[0],
            intrinsicValue: 0, // OTM, no intrinsic
          },
          shortLeg: {
            strike: shortPutCP.strike, bid: shortPutCP.bid, ask: shortPutCP.ask,
            delta: shortPutCP.delta, dte: shortPutCP.daysToExpiration,
            expDate: shortPutCP.expDate?.split(':')[0],
          },
          longCost: bestSetup.longCost,
          weeklyCredit,
          netDebit: Math.round((bestSetup.longCost - weeklyCredit) * 100) / 100,
          spreadWidth: bestSetup.actualWidth,
          capitalRequired: bestSetup.capitalRequired,
          weeksToBreakeven: bestSetup.weeksToBreakeven,
          costRatio,
          weeklyROI,
          weeklyROC,
          maxProfitIfBearish: Math.round((shortStrike - bestLP.strike) * 100) / 100,
        };
      }
    }

    logs.push(`✓ ${ticker} · IVR:${ivr}% · IV:${iv}% · RoR:${ror}% · Bid:$${optBid.toFixed(2)}${bestPut ? ` · Δ${bestPut.delta?.toFixed(2)} · ${bestPut.daysToExpiration}DTE` : ''}`);
    results.push(result);
  }

  return { results, logs, scanned, source: 'schwab' };
}

// ─── ADMIN USERS (can use platform Schwab credentials) ────
const ADMIN_IDS = ['a4f7c71e-95bc-43f9-bbfd-108f1feb6f48'];
const ADMIN_EMAILS = ['risethediver@gmail.com'];

function isAdmin(userId?: string, userEmail?: string): boolean {
  if (userId && ADMIN_IDS.includes(userId)) return true;
  if (userEmail && ADMIN_EMAILS.includes(userEmail.toLowerCase())) return true;
  return false;
}

// ─── MAIN SCAN ENDPOINT ──────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    universe = 'core',
    customTickers,
    filters = {},
    userId,
    userEmail,
  } = body;

  // Set active user for per-user credential routing
  setActiveUser(userId || undefined);

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

  const admin = isAdmin(userId, userEmail);
  const useSchwab = admin && await isAuthenticated();
  
  if (useSchwab) {
    const result = await scanWithSchwab(tickers, f);
    return NextResponse.json(result);
  } else if (!admin) {
    // Non-admin user — tell them to use personal keys or Polygon fallback
    return NextResponse.json({
      results: [],
      logs: ['📡 Using Polygon scan. Connect your own Schwab or Tradier in Screener Settings for real Greeks.'],
      scanned: 0,
      source: 'polygon_fallback',
      tickers,
      filters: f,
    });
  } else {
    // Admin but Schwab not connected
    return NextResponse.json({
      results: [],
      logs: ['⚠ Schwab not connected. Using Polygon client-side scan (slower, estimated data).'],
      scanned: 0,
      source: 'polygon_fallback',
      tickers,
      filters: f,
    });
  }
}
