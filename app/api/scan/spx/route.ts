import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getValidAccessToken } from '@/app/lib/schwab-auth';

const SCHWAB_BASE = 'https://api.schwabapi.com/marketdata/v1';

let _spxUserId: string | undefined;

async function schwabFetch(endpoint: string, params?: Record<string, string>) {
  const token = await getValidAccessToken(_spxUserId);
  const url = new URL(`${SCHWAB_BASE}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Schwab API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── TYPES ────────────────────────────────────────────────

interface StrikeData {
  strike: number;
  putOI: number;
  callOI: number;
  putVolume: number;
  callVolume: number;
  // Aggregated gamma across all expirations (OI-weighted sum)
  putGammaSum: number;
  callGammaSum: number;
  netGEX: number;
  // Best bid/ask/delta for play construction (from nearest expiration with liquidity)
  putBid: number;
  putAsk: number;
  putDelta: number;
  callBid: number;
  callAsk: number;
  callDelta: number;
  putIV: number;
  callIV: number;
  // Per-expiration breakdown
  byExpiration: Record<string, {
    expDate: string;
    dte: number;
    putOI: number;
    callOI: number;
    putVolume: number;
    callVolume: number;
    putGamma: number;
    callGamma: number;
    putBid: number;
    putAsk: number;
    putDelta: number;
    callBid: number;
    callAsk: number;
    callDelta: number;
  }>;
}

interface WallCluster {
  centerStrike: number;
  totalActivity: number;
  strikes: { strike: number; activity: number }[];
  distFromPrice: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { dteRange = [0, 7], wingWidth = 10, userId } = body;
  _spxUserId = userId;

  if (!await isAuthenticated(userId) && !await isAuthenticated()) {
    return NextResponse.json({ error: 'Schwab not connected. SPX Radar requires real-time data.' }, { status: 401 });
  }

  try {
    // ─── Get SPX price ───
    let spxPrice = 0;
    try {
      const quoteData = await schwabFetch('/quotes', { symbols: '$SPX', fields: 'quote' });
      spxPrice = quoteData['$SPX']?.quote?.lastPrice || quoteData['$SPX']?.quote?.closePrice || 0;
    } catch {
      try {
        const quoteData = await schwabFetch('/quotes', { symbols: 'SPX', fields: 'quote' });
        spxPrice = quoteData['SPX']?.quote?.lastPrice || quoteData['SPX']?.quote?.closePrice || 0;
      } catch {
        const quoteData = await schwabFetch('/quotes', { symbols: 'SPY', fields: 'quote' });
        spxPrice = (quoteData['SPY']?.quote?.lastPrice || quoteData['SPY']?.quote?.closePrice || 0) * 10;
      }
    }

    if (!spxPrice) {
      return NextResponse.json({ error: 'Could not fetch SPX price. Market may be closed.' }, { status: 500 });
    }

    // ─── Get SPX option chain ───
    // SPX has hundreds of expirations (0DTE, dailies, weeklies, monthlies, quarterlies)
    // We need to constrain the request to avoid Schwab 502 body overflow
    // Use the actual DTE range from the user + a small buffer for GEX analysis
    const today = new Date();
    const fromDate = today.toISOString().split('T')[0];
    const fetchDTEMax = Math.max(dteRange[1] + 7, 14); // buffer beyond user range for GEX context
    const toDateCalc = new Date(today.getTime() + fetchDTEMax * 24 * 60 * 60 * 1000);
    const toDate = toDateCalc.toISOString().split('T')[0];

    // Scale strike count based on wing width — wider wings need more strikes
    // SPX strikes are $5 apart, so $25 wing = 5 strikes out from short
    // Wall might be 60-100 pts from price, wing goes further out
    const baseStrikes = wingWidth >= 20 ? 50 : 40;

    let chain: any = null;
    const chainErrors: string[] = [];
    for (const sym of ['$SPX', 'SPX', 'SPXW']) {
      try {
        chain = await schwabFetch('/chains', {
          symbol: sym,
          contractType: 'ALL',
          range: 'NTM',
          strikeCount: String(baseStrikes),
          fromDate,
          toDate,
          includeUnderlyingQuote: 'true',
        });
        if (chain.putExpDateMap && Object.keys(chain.putExpDateMap).length > 0) break;
        chainErrors.push(`${sym}: empty chain`);
        chain = null;
      } catch (err: any) {
        chainErrors.push(`${sym}: ${err.message || 'unknown'}`);
        chain = null;
      }
    }

    // Fallback: if NTM didn't work, try OTM with tighter strike count
    if (!chain || !chain.putExpDateMap) {
      for (const sym of ['$SPX', 'SPX']) {
        try {
          chain = await schwabFetch('/chains', {
            symbol: sym,
            contractType: 'ALL',
            range: 'ALL',
            strikeCount: '30',
            fromDate,
            toDate,
            includeUnderlyingQuote: 'true',
          });
          if (chain.putExpDateMap && Object.keys(chain.putExpDateMap).length > 0) break;
          chain = null;
        } catch (err: any) {
          chainErrors.push(`${sym} fallback: ${err.message || 'unknown'}`);
          chain = null;
        }
      }
    }

    if (!chain || !chain.putExpDateMap) {
      return NextResponse.json({
        error: `Could not fetch SPX option chain. ${chainErrors.join(' | ')}`,
        spxPrice,
      }, { status: 500 });
    }

    const putMap = chain.putExpDateMap || {};
    const callMap = chain.callExpDateMap || {};

    // ─── Build strike map with PROPER aggregation ───
    const strikeMap = new Map<number, StrikeData>();
    const allExpirations = new Set<string>();

    const ensureStrike = (strike: number): StrikeData => {
      if (!strikeMap.has(strike)) {
        strikeMap.set(strike, {
          strike, putOI: 0, callOI: 0, putVolume: 0, callVolume: 0,
          putGammaSum: 0, callGammaSum: 0, netGEX: 0,
          putBid: 0, putAsk: 0, putDelta: 0,
          callBid: 0, callAsk: 0, callDelta: 0,
          putIV: 0, callIV: 0,
          byExpiration: {},
        });
      }
      return strikeMap.get(strike)!;
    };

    const ensureExpiration = (data: StrikeData, expKey: string, dte: number) => {
      if (!data.byExpiration[expKey]) {
        data.byExpiration[expKey] = {
          expDate: expKey, dte,
          putOI: 0, callOI: 0, putVolume: 0, callVolume: 0,
          putGamma: 0, callGamma: 0,
          putBid: 0, putAsk: 0, putDelta: 0,
          callBid: 0, callAsk: 0, callDelta: 0,
        };
      }
      return data.byExpiration[expKey];
    };

    // Process puts
    for (const [expDate, strikes] of Object.entries(putMap) as any) {
      for (const [strikeStr, contracts] of Object.entries(strikes) as any) {
        for (const c of contracts) {
          const dte = c.daysToExpiration ?? 0;
          if (dte < dteRange[0] || dte > dteRange[1]) continue;
          const strike = Number(strikeStr);
          const data = ensureStrike(strike);
          const expKey = expDate.split(':')[0];
          allExpirations.add(expKey);
          const exp = ensureExpiration(data, expKey, dte);

          const oi = c.openInterest || 0;
          const vol = c.totalVolume || 0;
          const gamma = c.gamma || 0;

          // AGGREGATE across expirations (sum, not overwrite)
          data.putOI += oi;
          data.putVolume += vol;
          data.putGammaSum += Math.abs(gamma) * oi; // OI-weighted gamma

          exp.putOI += oi;
          exp.putVolume += vol;
          exp.putGamma = gamma;
          exp.putBid = c.bid || 0;
          exp.putAsk = c.ask || 0;
          exp.putDelta = c.delta || 0;

          // Keep best bid/delta from most liquid contract for trade construction
          if ((c.bid || 0) > data.putBid || data.putBid === 0) {
            data.putBid = c.bid || 0;
            data.putAsk = c.ask || 0;
            data.putDelta = c.delta || 0;
            data.putIV = c.volatility || 0;
          }
        }
      }
    }

    // Process calls
    for (const [expDate, strikes] of Object.entries(callMap) as any) {
      for (const [strikeStr, contracts] of Object.entries(strikes) as any) {
        for (const c of contracts) {
          const dte = c.daysToExpiration ?? 0;
          if (dte < dteRange[0] || dte > dteRange[1]) continue;
          const strike = Number(strikeStr);
          const data = ensureStrike(strike);
          const expKey = expDate.split(':')[0];
          allExpirations.add(expKey);
          const exp = ensureExpiration(data, expKey, dte);

          const oi = c.openInterest || 0;
          const vol = c.totalVolume || 0;
          const gamma = c.gamma || 0;

          data.callOI += oi;
          data.callVolume += vol;
          data.callGammaSum += Math.abs(gamma) * oi; // OI-weighted gamma

          exp.callOI += oi;
          exp.callVolume += vol;
          exp.callGamma = gamma;
          exp.callBid = c.bid || 0;
          exp.callAsk = c.ask || 0;
          exp.callDelta = c.delta || 0;

          if ((c.bid || 0) > data.callBid || data.callBid === 0) {
            data.callBid = c.bid || 0;
            data.callAsk = c.ask || 0;
            data.callDelta = c.delta || 0;
            data.callIV = c.volatility || 0;
          }
        }
      }
    }

    // ─── Strike array (±8% of price) ───
    const allStrikes = Array.from(strikeMap.values())
      .filter(s => s.strike >= spxPrice * 0.92 && s.strike <= spxPrice * 1.08)
      .sort((a, b) => a.strike - b.strike);

    const hasOI = allStrikes.some(s => s.putOI > 0 || s.callOI > 0);
    const dataSource = hasOI ? 'OI' : 'VOLUME';
    const getPut = (s: StrikeData) => hasOI ? s.putOI : s.putVolume;
    const getCall = (s: StrikeData) => hasOI ? s.callOI : s.callVolume;

    // ─── GEX Calculation (dealer-hedging model) ───
    // Standard convention:
    //   Call GEX = POSITIVE (dealers short calls → buy stock as price rises → supportive/mean-reverting)
    //   Put GEX  = NEGATIVE (dealers short puts → sell stock as price drops → amplifying/destabilizing)
    // Positive total GEX = call-heavy = dealers cushion moves = mean-reverting
    // Negative total GEX = put-heavy = dealers amplify moves = trending/volatile
    for (const s of allStrikes) {
      // Use average gamma per contract (total weighted gamma / OI) × OI × 100 × spot
      const avgPutGamma = getPut(s) > 0 ? s.putGammaSum / getPut(s) : 0;
      const avgCallGamma = getCall(s) > 0 ? s.callGammaSum / getCall(s) : 0;
      const callGEX = getCall(s) * avgCallGamma * 100 * spxPrice;
      const putGEX = -(getPut(s) * avgPutGamma * 100 * spxPrice);
      s.netGEX = Math.round(callGEX + putGEX);
    }

    // ─── P/C Ratio ───
    const totalPutActivity = allStrikes.reduce((sum, s) => sum + getPut(s), 0);
    const totalCallActivity = allStrikes.reduce((sum, s) => sum + getCall(s), 0);
    const pcRatio = totalCallActivity > 0 ? Math.round((totalPutActivity / totalCallActivity) * 100) / 100 : 0;

    // ─── Clustered Wall Detection ───
    const findWallClusters = (strikes: StrikeData[], getActivity: (s: StrikeData) => number, count: number): WallCluster[] => {
      if (!strikes.length) return [];
      const sorted = [...strikes].sort((a, b) => getActivity(b) - getActivity(a));
      const clusters: WallCluster[] = [];
      const used = new Set<number>();

      for (const seed of sorted) {
        if (used.has(seed.strike)) continue;
        if (clusters.length >= count) break;

        // Find neighboring strikes within $15 of this seed
        const neighbors = strikes.filter(s =>
          !used.has(s.strike) && Math.abs(s.strike - seed.strike) <= 15 && getActivity(s) > 0
        );
        const totalActivity = neighbors.reduce((sum, s) => sum + getActivity(s), 0);
        const weightedStrike = neighbors.reduce((sum, s) => sum + s.strike * getActivity(s), 0) / totalActivity;
        neighbors.forEach(s => used.add(s.strike));

        clusters.push({
          centerStrike: Math.round(weightedStrike),
          totalActivity,
          strikes: neighbors.map(s => ({ strike: s.strike, activity: getActivity(s) })).sort((a, b) => b.activity - a.activity),
          distFromPrice: Math.round(Math.abs(spxPrice - weightedStrike)),
        });
      }
      return clusters.sort((a, b) => b.totalActivity - a.totalActivity).slice(0, count);
    };

    const putsBelow = allStrikes.filter(s => s.strike < spxPrice);
    const callsAbove = allStrikes.filter(s => s.strike > spxPrice);

    const putClusters = findWallClusters(putsBelow, getPut, 3);
    const callClusters = findWallClusters(callsAbove, getCall, 3);
    const putWallCluster = putClusters[0] || null;
    const callWallCluster = callClusters[0] || null;

    // Simple walls (backward compat)
    const putWall = putsBelow.length
      ? putsBelow.reduce((max, s) => getPut(s) > getPut(max) ? s : max, putsBelow[0])
      : allStrikes[0];
    const callWall = callsAbove.length
      ? callsAbove.reduce((max, s) => getCall(s) > getCall(max) ? s : max, callsAbove[0])
      : allStrikes[allStrikes.length - 1];

    // ─── Gamma Flip ───
    let cumulativeGEX = 0;
    let gammaFlip = spxPrice;
    let gammaFlipFound = false;
    for (const s of allStrikes) {
      const prev = cumulativeGEX;
      cumulativeGEX += s.netGEX;
      if (prev <= 0 && cumulativeGEX > 0) { gammaFlip = s.strike; gammaFlipFound = true; break; }
    }
    if (!gammaFlipFound) {
      cumulativeGEX = 0;
      for (let i = allStrikes.length - 1; i >= 0; i--) {
        const prev = cumulativeGEX;
        cumulativeGEX += allStrikes[i].netGEX;
        if (prev >= 0 && cumulativeGEX < 0) { gammaFlip = allStrikes[i].strike; break; }
      }
    }

    const totalGEX = allStrikes.reduce((sum, s) => sum + s.netGEX, 0);
    const regime = totalGEX > 0 ? 'POSITIVE GAMMA' : 'NEGATIVE GAMMA';
    const regimeDescription = totalGEX > 0
      ? 'Dealers long gamma — buy dips, sell rips — mean-reverting, compressed moves'
      : 'Dealers short gamma — sell into drops, buy into rips — trending, amplified moves';

    // ─── Expected Move (ATM Straddle) ───
    const atmStrike = allStrikes.length > 0
      ? allStrikes.reduce((n, s) => Math.abs(s.strike - spxPrice) < Math.abs(n.strike - spxPrice) ? s : n, allStrikes[0])
      : null;

    const atmStraddlePrice = atmStrike ? (atmStrike.putBid || 0) + (atmStrike.callBid || 0) : 0;
    const expectedMove = Math.round(atmStraddlePrice * 0.85); // ~85% of straddle ≈ 1SD
    const expectedMovePercent = spxPrice > 0 ? Math.round((expectedMove / spxPrice) * 10000) / 100 : 0;
    const expectedHigh = Math.round(spxPrice + expectedMove);
    const expectedLow = Math.round(spxPrice - expectedMove);

    const allDTEs = Object.values(allStrikes[0]?.byExpiration || {}).map(e => e.dte);
    const avgDTE = allDTEs.length > 0 ? Math.round(allDTEs.reduce((a, b) => a + b, 0) / allDTEs.length) : 0;

    // ─── Per-Expiration Summary ───
    const expirationSummary = Array.from(allExpirations).sort().map(exp => {
      let expPutOI = 0, expCallOI = 0, expPutVol = 0, expCallVol = 0, dte = 0;
      for (const s of allStrikes) {
        const e = s.byExpiration[exp];
        if (e) { expPutOI += e.putOI; expCallOI += e.callOI; expPutVol += e.putVolume; expCallVol += e.callVolume; dte = e.dte; }
      }
      const totalPut = hasOI ? expPutOI : expPutVol;
      const totalCall = hasOI ? expCallOI : expCallVol;
      return {
        expDate: exp, dte,
        putActivity: totalPut, callActivity: totalCall,
        totalActivity: totalPut + totalCall,
        pcRatio: totalCall > 0 ? Math.round((totalPut / totalCall) * 100) / 100 : 0,
        pctOfTotal: 0,
      };
    });
    const grandTotal = expirationSummary.reduce((s, e) => s + e.totalActivity, 0);
    expirationSummary.forEach(e => {
      e.pctOfTotal = grandTotal > 0 ? Math.round((e.totalActivity / grandTotal) * 1000) / 10 : 0;
    });

    // ─── Top individual strikes ───
    const topPutStrikes = [...putsBelow].sort((a, b) => getPut(b) - getPut(a)).slice(0, 5);
    const topCallStrikes = [...callsAbove].sort((a, b) => getCall(b) - getCall(a)).slice(0, 5);

    // ─── PLAY BUILDER ───
    const findNearestStrike = (strikes: StrikeData[], target: number): StrikeData | null => {
      if (!strikes.length) return null;
      return strikes.reduce((n, s) => Math.abs(s.strike - target) < Math.abs(n.strike - target) ? s : n, strikes[0]);
    };
    const findWingBelow = (strikes: StrikeData[], shortStrike: number, width: number) => {
      const below = strikes.filter(s => s.strike < shortStrike);
      if (!below.length) return null;
      return below.reduce((n, s) => Math.abs(s.strike - (shortStrike - width)) < Math.abs(n.strike - (shortStrike - width)) ? s : n, below[0]);
    };
    const findWingAbove = (strikes: StrikeData[], shortStrike: number, width: number) => {
      const above = strikes.filter(s => s.strike > shortStrike);
      if (!above.length) return null;
      return above.reduce((n, s) => Math.abs(s.strike - (shortStrike + width)) < Math.abs(n.strike - (shortStrike + width)) ? s : n, above[0]);
    };

    // Use cluster center for short strike placement
    const putShortTarget = putWallCluster ? putWallCluster.centerStrike : putWall.strike;
    const callShortTarget = callWallCluster ? callWallCluster.centerStrike : callWall.strike;
    const icPutShort = findNearestStrike(allStrikes, putShortTarget) || putWall;
    const icPutLong = findWingBelow(allStrikes, icPutShort.strike, wingWidth);
    const icCallShort = findNearestStrike(allStrikes, callShortTarget) || callWall;
    const icCallLong = findWingAbove(allStrikes, icCallShort.strike, wingWidth);

    const plays: any = {};

    if (icPutLong && icCallLong) {
      const putW = icPutShort.strike - icPutLong.strike;
      const callW = icCallLong.strike - icCallShort.strike;
      const putCredit = Math.max(0, Math.round(((icPutShort.putBid || 0) - (icPutLong.putAsk || 0)) * 100) / 100);
      const callCredit = Math.max(0, Math.round(((icCallShort.callBid || 0) - (icCallLong.callAsk || 0)) * 100) / 100);
      const totalCredit = Math.round((putCredit + callCredit) * 100) / 100;
      const maxWidth = Math.max(putW, callW);
      const maxLoss = Math.max(Math.round((maxWidth - totalCredit) * 100) / 100, 0);
      const breakEvenLow = icPutShort.strike - totalCredit;
      const breakEvenHigh = icCallShort.strike + totalCredit;
      const isBreakevenSafe = breakEvenLow < expectedLow && breakEvenHigh > expectedHigh;

      plays.ironCondor = {
        putShort: { strike: icPutShort.strike, bid: icPutShort.putBid, delta: icPutShort.putDelta },
        putLong: { strike: icPutLong.strike, ask: icPutLong.putAsk, delta: icPutLong.putDelta },
        callShort: { strike: icCallShort.strike, bid: icCallShort.callBid, delta: icCallShort.callDelta },
        callLong: { strike: icCallLong.strike, ask: icCallLong.callAsk, delta: icCallLong.callDelta },
        totalCredit, putCredit, callCredit, maxLoss,
        putWidth: putW, callWidth: callW,
        ror: maxLoss > 0 ? Math.round((totalCredit / maxLoss) * 100 * 100) / 100 : 0,
        breakEvenLow, breakEvenHigh,
        expectedMove, expectedHigh, expectedLow, isBreakevenSafe,
        putShortDistFromPrice: Math.round(spxPrice - icPutShort.strike),
        callShortDistFromPrice: Math.round(icCallShort.strike - spxPrice),
        putShortAtCluster: putWallCluster ? Math.abs(icPutShort.strike - putWallCluster.centerStrike) <= 5 : false,
        callShortAtCluster: callWallCluster ? Math.abs(icCallShort.strike - callWallCluster.centerStrike) <= 5 : false,
      };

      plays.bullPut = {
        shortStrike: icPutShort.strike, longStrike: icPutLong.strike,
        shortBid: icPutShort.putBid, longAsk: icPutLong.putAsk,
        shortDelta: icPutShort.putDelta,
        netCredit: putCredit,
        maxLoss: Math.max(Math.round((putW - putCredit) * 100) / 100, 0),
        width: putW,
        ror: (putW - putCredit) > 0 ? Math.round((putCredit / (putW - putCredit)) * 100 * 100) / 100 : 0,
        isOutsideExpectedMove: icPutShort.strike < expectedLow,
        distFromExpectedLow: Math.round(expectedLow - icPutShort.strike),
      };

      plays.bearCall = {
        shortStrike: icCallShort.strike, longStrike: icCallLong.strike,
        shortBid: icCallShort.callBid, longAsk: icCallLong.callAsk,
        shortDelta: icCallShort.callDelta,
        netCredit: callCredit,
        maxLoss: Math.max(Math.round((callW - callCredit) * 100) / 100, 0),
        width: callW,
        ror: (callW - callCredit) > 0 ? Math.round((callCredit / (callW - callCredit)) * 100 * 100) / 100 : 0,
        isOutsideExpectedMove: icCallShort.strike > expectedHigh,
        distFromExpectedHigh: Math.round(icCallShort.strike - expectedHigh),
      };
    }

    return NextResponse.json({
      spxPrice,
      regime, regimeDescription, totalGEX, gammaFlip, dataSource,
      pcRatio, totalPutActivity, totalCallActivity,
      expectedMove, expectedMovePercent, expectedHigh, expectedLow,
      atmStraddlePrice, avgDTE,
      putWallCluster, callWallCluster, putClusters, callClusters,
      putWall: { strike: putWall.strike, activity: getPut(putWall), distFromPrice: Math.round(spxPrice - putWall.strike) },
      callWall: { strike: callWall.strike, activity: getCall(callWall), distFromPrice: Math.round(callWall.strike - spxPrice) },
      topPutStrikes: topPutStrikes.map(s => ({ strike: s.strike, activity: getPut(s) })),
      topCallStrikes: topCallStrikes.map(s => ({ strike: s.strike, activity: getCall(s) })),
      expirationSummary,
      strikes: allStrikes.map(s => ({
        strike: s.strike, putOI: s.putOI, callOI: s.callOI,
        putVolume: s.putVolume, callVolume: s.callVolume, netGEX: s.netGEX,
        netOIDelta: s.putOI - s.callOI,
      })),
      plays, dteRange, wingWidth,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('SPX Radar error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
