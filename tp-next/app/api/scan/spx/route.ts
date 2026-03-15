import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getValidAccessToken } from '@/app/lib/schwab-auth';

const SCHWAB_BASE = 'https://api.schwabapi.com/marketdata/v1';

async function schwabFetch(endpoint: string, params?: Record<string, string>) {
  const token = await getValidAccessToken();
  const url = new URL(`${SCHWAB_BASE}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Schwab API ${res.status}: ${await res.text()}`);
  return res.json();
}

interface StrikeData {
  strike: number;
  putOI: number;
  callOI: number;
  putVolume: number;
  callVolume: number;
  putGamma: number;
  callGamma: number;
  netGEX: number;
  putBid: number;
  putAsk: number;
  putDelta: number;
  callBid: number;
  callAsk: number;
  callDelta: number;
}

export async function POST(req: NextRequest) {
  if (!await isAuthenticated()) {
    return NextResponse.json({ error: 'Schwab not connected. SPX Radar requires real-time data.' }, { status: 401 });
  }

  const body = await req.json();
  const { dteRange = [0, 7], wingWidth = 10 } = body;

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
    let chain: any = null;
    for (const sym of ['$SPX', 'SPX', 'SPXW']) {
      try {
        chain = await schwabFetch('/chains', {
          symbol: sym,
          contractType: 'ALL',
          range: 'ALL',
          strikeCount: '60',
          includeUnderlyingQuote: 'true',
        });
        if (chain.putExpDateMap && Object.keys(chain.putExpDateMap).length > 0) break;
        chain = null;
      } catch { chain = null; }
    }

    if (!chain || !chain.putExpDateMap) {
      return NextResponse.json({ error: 'Could not fetch SPX option chain.', spxPrice }, { status: 500 });
    }

    const putMap = chain.putExpDateMap || {};
    const callMap = chain.callExpDateMap || {};

    // ─── Build strike map ───
    const strikeMap = new Map<number, StrikeData>();

    for (const [expDate, strikes] of Object.entries(putMap) as any) {
      for (const [strikeStr, contracts] of Object.entries(strikes) as any) {
        for (const c of contracts) {
          const dte = c.daysToExpiration || 0;
          if (dte < dteRange[0] || dte > dteRange[1]) continue;
          const strike = Number(strikeStr);
          const existing = strikeMap.get(strike) || {
            strike, putOI: 0, callOI: 0, putVolume: 0, callVolume: 0,
            putGamma: 0, callGamma: 0, netGEX: 0,
            putBid: 0, putAsk: 0, putDelta: 0, callBid: 0, callAsk: 0, callDelta: 0,
          };
          existing.putOI += c.openInterest || 0;
          existing.putVolume += c.totalVolume || 0;
          existing.putGamma = c.gamma || 0;
          existing.putBid = c.bid || 0;
          existing.putAsk = c.ask || 0;
          existing.putDelta = c.delta || 0;
          strikeMap.set(strike, existing);
        }
      }
    }

    for (const [expDate, strikes] of Object.entries(callMap) as any) {
      for (const [strikeStr, contracts] of Object.entries(strikes) as any) {
        for (const c of contracts) {
          const dte = c.daysToExpiration || 0;
          if (dte < dteRange[0] || dte > dteRange[1]) continue;
          const strike = Number(strikeStr);
          const existing = strikeMap.get(strike) || {
            strike, putOI: 0, callOI: 0, putVolume: 0, callVolume: 0,
            putGamma: 0, callGamma: 0, netGEX: 0,
            putBid: 0, putAsk: 0, putDelta: 0, callBid: 0, callAsk: 0, callDelta: 0,
          };
          existing.callOI += c.openInterest || 0;
          existing.callVolume += c.totalVolume || 0;
          existing.callGamma = c.gamma || 0;
          existing.callBid = c.bid || 0;
          existing.callAsk = c.ask || 0;
          existing.callDelta = c.delta || 0;
          strikeMap.set(strike, existing);
        }
      }
    }

    // ─── Strike array ───
    const allStrikes = Array.from(strikeMap.values())
      .filter(s => s.strike >= spxPrice * 0.92 && s.strike <= spxPrice * 1.08)
      .sort((a, b) => a.strike - b.strike);

    const hasOI = allStrikes.some(s => s.putOI > 0 || s.callOI > 0);
    const dataSource = hasOI ? 'OI' : 'VOLUME';
    const getPut = (s: StrikeData) => hasOI ? s.putOI : s.putVolume;
    const getCall = (s: StrikeData) => hasOI ? s.callOI : s.callVolume;

    // ─── GEX ───
    for (const s of allStrikes) {
      const putGEX = getPut(s) * Math.abs(s.putGamma) * 100 * spxPrice;
      const callGEX = -(getCall(s) * Math.abs(s.callGamma) * 100 * spxPrice);
      s.netGEX = Math.round(putGEX + callGEX);
    }

    // ─── Key levels ───
    // Put wall = highest put activity BELOW price (support)
    // Call wall = highest call activity ABOVE price (resistance)
    const putsBelow = allStrikes.filter(s => s.strike < spxPrice);
    const callsAbove = allStrikes.filter(s => s.strike > spxPrice);

    const putWall = putsBelow.length
      ? putsBelow.reduce((max, s) => getPut(s) > getPut(max) ? s : max, putsBelow[0])
      : allStrikes[0];
    const callWall = callsAbove.length
      ? callsAbove.reduce((max, s) => getCall(s) > getCall(max) ? s : max, callsAbove[0])
      : allStrikes[allStrikes.length - 1];

    // Gamma flip
    let cumulativeGEX = 0;
    let gammaFlip = spxPrice;
    for (const s of allStrikes) {
      const prev = cumulativeGEX;
      cumulativeGEX += s.netGEX;
      if (prev <= 0 && cumulativeGEX > 0) { gammaFlip = s.strike; break; }
    }

    const totalGEX = allStrikes.reduce((sum, s) => sum + s.netGEX, 0);
    const regime = totalGEX > 0 ? 'LONG GAMMA (mean-reverting)' : 'SHORT GAMMA (trending, volatile)';

    const topPutStrikes = [...putsBelow].sort((a, b) => getPut(b) - getPut(a)).slice(0, 5);
    const topCallStrikes = [...callsAbove].sort((a, b) => getCall(b) - getCall(a)).slice(0, 5);

    // ─── PLAY BUILDER ───
    const findWingBelow = (strikes: StrikeData[], shortStrike: number, width: number) => {
      const below = strikes.filter(s => s.strike < shortStrike);
      if (!below.length) return null;
      const target = shortStrike - width;
      return below.reduce((n, s) => Math.abs(s.strike - target) < Math.abs(n.strike - target) ? s : n, below[0]);
    };

    const findWingAbove = (strikes: StrikeData[], shortStrike: number, width: number) => {
      const above = strikes.filter(s => s.strike > shortStrike);
      if (!above.length) return null;
      const target = shortStrike + width;
      return above.reduce((n, s) => Math.abs(s.strike - target) < Math.abs(n.strike - target) ? s : n, above[0]);
    };

    // Short strikes at the walls (put wall below price, call wall above price)
    const icPutShort = putWall;
    const icPutLong = findWingBelow(allStrikes, icPutShort.strike, wingWidth);
    const icCallShort = callWall;
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

      plays.ironCondor = {
        putShort: { strike: icPutShort.strike, bid: icPutShort.putBid, delta: icPutShort.putDelta },
        putLong: { strike: icPutLong.strike, ask: icPutLong.putAsk, delta: icPutLong.putDelta },
        callShort: { strike: icCallShort.strike, bid: icCallShort.callBid, delta: icCallShort.callDelta },
        callLong: { strike: icCallLong.strike, ask: icCallLong.callAsk, delta: icCallLong.callDelta },
        totalCredit, putCredit, callCredit, maxLoss,
        putWidth: putW, callWidth: callW,
        ror: maxLoss > 0 ? Math.round((totalCredit / maxLoss) * 100 * 100) / 100 : 0,
        breakEvenLow: icPutShort.strike - totalCredit,
        breakEvenHigh: icCallShort.strike + totalCredit,
      };

      plays.bullPut = {
        shortStrike: icPutShort.strike, longStrike: icPutLong.strike,
        shortBid: icPutShort.putBid, longAsk: icPutLong.putAsk,
        shortDelta: icPutShort.putDelta,
        netCredit: putCredit,
        maxLoss: Math.max(Math.round((putW - putCredit) * 100) / 100, 0),
        width: putW,
        ror: (putW - putCredit) > 0 ? Math.round((putCredit / (putW - putCredit)) * 100 * 100) / 100 : 0,
      };

      plays.bearCall = {
        shortStrike: icCallShort.strike, longStrike: icCallLong.strike,
        shortBid: icCallShort.callBid, longAsk: icCallLong.callAsk,
        shortDelta: icCallShort.callDelta,
        netCredit: callCredit,
        maxLoss: Math.max(Math.round((callW - callCredit) * 100) / 100, 0),
        width: callW,
        ror: (callW - callCredit) > 0 ? Math.round((callCredit / (callW - callCredit)) * 100 * 100) / 100 : 0,
      };
    }

    return NextResponse.json({
      spxPrice,
      regime, totalGEX, gammaFlip, dataSource,
      putWall: { strike: putWall.strike, activity: getPut(putWall), distFromPrice: Math.round(spxPrice - putWall.strike) },
      callWall: { strike: callWall.strike, activity: getCall(callWall), distFromPrice: Math.round(callWall.strike - spxPrice) },
      topPutStrikes: topPutStrikes.map(s => ({ strike: s.strike, activity: getPut(s) })),
      topCallStrikes: topCallStrikes.map(s => ({ strike: s.strike, activity: getCall(s) })),
      strikes: allStrikes.map(s => ({
        strike: s.strike, putOI: s.putOI, callOI: s.callOI,
        putVolume: s.putVolume, callVolume: s.callVolume, netGEX: s.netGEX,
      })),
      plays, dteRange, wingWidth,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('SPX Radar error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
