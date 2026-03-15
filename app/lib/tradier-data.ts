// Tradier API integration for options data
// Supports both sandbox (free, delayed) and production (paid, real-time)

const SANDBOX_URL = 'https://sandbox.tradier.com';
const PROD_URL = 'https://api.tradier.com';

export async function tradierFetch(endpoint: string, accessToken: string, sandbox = false) {
  const baseUrl = sandbox ? SANDBOX_URL : PROD_URL;
  const res = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Tradier API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getTradierQuote(symbol: string, accessToken: string, sandbox = false) {
  const data = await tradierFetch(`/v1/markets/quotes?symbols=${symbol}`, accessToken, sandbox);
  const quote = data.quotes?.quote;
  if (!quote) return null;
  return {
    price: quote.last || quote.close || 0,
    change: quote.change_percentage || 0,
    volume: quote.volume || 0,
    open: quote.open, high: quote.high, low: quote.low,
  };
}

export async function getTradierChain(symbol: string, expiration: string, accessToken: string, sandbox = false) {
  const data = await tradierFetch(
    `/v1/markets/options/chains?symbol=${symbol}&expiration=${expiration}&greeks=true`,
    accessToken, sandbox
  );
  return data.options?.option || [];
}

export async function getTradierExpirations(symbol: string, accessToken: string, sandbox = false) {
  const data = await tradierFetch(
    `/v1/markets/options/expirations?symbol=${symbol}&includeAllRoots=true`,
    accessToken, sandbox
  );
  return data.expirations?.date || [];
}

export async function getTradierHistory(symbol: string, accessToken: string, sandbox = false) {
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const data = await tradierFetch(
    `/v1/markets/history?symbol=${symbol}&interval=daily&start=${start}&end=${end}`,
    accessToken, sandbox
  );
  return data.history?.day || [];
}

// Full scan for a single ticker — returns normalized result matching Schwab scan format
export async function scanTickerWithTradier(ticker: string, accessToken: string, sandbox = false, filters: any = {}) {
  try {
    // Get quote
    const quote = await getTradierQuote(ticker, accessToken, sandbox);
    if (!quote || !quote.price) return null;
    
    const price = quote.price;
    if (price < (filters.minPrice || 0) || price > (filters.maxPrice || 99999)) return null;
    if (quote.volume < (filters.minVol || 0)) return null;

    // Get price history for technicals
    const history = await getTradierHistory(ticker, accessToken, sandbox);
    const closes = history.map((d: any) => d.close).filter(Boolean);
    
    let ema20 = null, ema50 = null, ema200 = null, rsi = 50, hv = 20;
    if (closes.length >= 20) {
      ema20 = calcEMA(closes, 20);
      ema50 = closes.length >= 50 ? calcEMA(closes, 50) : null;
      ema200 = closes.length >= 200 ? calcEMA(closes, 200) : null;
      rsi = calcRSI(closes) || 50;
      hv = calcHV(closes) || 20;
    }

    // Get expirations
    const expirations = await getTradierExpirations(ticker, accessToken, sandbox);
    if (!expirations.length) return null;

    // Find target expiration (25-45 DTE)
    const now = Date.now();
    const targetDTE = filters.targetDTE || [25, 45];
    const targetExp = expirations.find((exp: string) => {
      const dte = Math.round((new Date(exp).getTime() - now) / (1000 * 60 * 60 * 24));
      return dte >= targetDTE[0] && dte <= targetDTE[1];
    });
    if (!targetExp) return null;

    // Get options chain
    const chain = await getTradierChain(ticker, targetExp, accessToken, sandbox);
    if (!chain.length) return null;

    const puts = chain.filter((o: any) => o.option_type === 'put');
    const calls = chain.filter((o: any) => o.option_type === 'call');
    
    // Find best CSP put near target delta
    const targetDelta = filters.targetDelta || 0.30;
    const dte = Math.round((new Date(targetExp).getTime() - now) / (1000 * 60 * 60 * 24));
    
    const candidatePuts = puts.filter((p: any) => 
      p.greeks?.delta && Math.abs(p.greeks.delta) >= 0.10 &&
      Math.abs(p.greeks.delta) <= 0.50 && p.bid > 0 && p.strike < price
    );
    
    candidatePuts.sort((a: any, b: any) => 
      Math.abs(Math.abs(a.greeks?.delta || 0) - targetDelta) - Math.abs(Math.abs(b.greeks?.delta || 0) - targetDelta)
    );

    const bestPut = candidatePuts[0];
    const iv = bestPut?.greeks?.mid_iv ? Math.round(bestPut.greeks.mid_iv * 100) : Math.round(hv * 1.25);
    const ivr = estimateIVR(iv, hv);
    const optBid = bestPut?.bid || 0;
    const ror = bestPut ? Math.round((bestPut.bid / bestPut.strike) * 100 * 100) / 100 : 0;

    return {
      ticker, price, change: quote.change, vol: quote.volume,
      iv, hv, ivr, rsi, atrPct: 2,
      ema20, ema50, ema200,
      maxOI: 0, optVol: 0, optBid, ror,
      uoaRatio: 0, isUOA: false, mktCap: 0,
      passesMainFilters: true,
      sector: 'Unknown', source: 'tradier',
      bestPut: bestPut ? {
        strike: bestPut.strike, bid: bestPut.bid, ask: bestPut.ask,
        delta: bestPut.greeks?.delta, theta: bestPut.greeks?.theta,
        gamma: bestPut.greeks?.gamma, vega: bestPut.greeks?.vega,
        iv: bestPut.greeks?.mid_iv, dte, expDate: targetExp,
        symbol: bestPut.symbol,
      } : undefined,
      // Credit spread
      creditSpread: buildCreditSpread(puts, price, dte, targetExp, targetDelta),
      // PMCC
      pmcc: buildPMCC(calls, price, dte, targetExp, accessToken, sandbox, expirations),
    };
  } catch (e) {
    return null;
  }
}

function buildCreditSpread(puts: any[], price: number, dte: number, expDate: string, targetDelta: number) {
  const shortPut = puts.find((p: any) => p.greeks?.delta && Math.abs(p.greeks.delta) >= targetDelta - 0.05 && Math.abs(p.greeks.delta) <= targetDelta + 0.05 && p.bid > 0);
  if (!shortPut) return undefined;
  
  const width = price > 100 ? 10 : 5;
  const longPut = puts.find((p: any) => Math.abs(p.strike - (shortPut.strike - width)) <= 2 && p.ask > 0);
  if (!longPut) return undefined;

  const netCredit = Math.round((shortPut.bid - longPut.ask) * 100) / 100;
  if (netCredit <= 0) return undefined;
  const maxLoss = Math.round((Math.abs(shortPut.strike - longPut.strike) - netCredit) * 100) / 100;

  return {
    type: 'BULL PUT',
    shortLeg: { strike: shortPut.strike, bid: shortPut.bid, ask: shortPut.ask, delta: shortPut.greeks?.delta, dte, expDate },
    longLeg: { strike: longPut.strike, bid: longPut.bid, ask: longPut.ask, delta: longPut.greeks?.delta },
    netCredit, maxLoss, width: Math.abs(shortPut.strike - longPut.strike),
    rorSpread: maxLoss > 0 ? Math.round((netCredit / maxLoss) * 100 * 100) / 100 : 0,
    pop: shortPut.greeks?.delta ? Math.round((1 - Math.abs(shortPut.greeks.delta)) * 100) : 70,
  };
}

function buildPMCC(calls: any[], price: number, dte: number, expDate: string, accessToken: string, sandbox: boolean, expirations: string[]) {
  // Would need longer-dated expiration for LEAP - simplified for now
  return undefined;
}

// Technical helpers (same as scan/route.ts)
function calcEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return Math.round(ema * 100) / 100;
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
