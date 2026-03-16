// Market data layer — Schwab primary, Tradier alternative
// ALL functions return data in SCHWAB'S EXACT format so scan routes don't change
// Provider detection: checks Schwab first, falls back to Tradier if configured

import { getValidAccessToken, isAuthenticated } from './schwab-auth';
import { supabase } from './supabase';

const SCHWAB_BASE = 'https://api.schwabapi.com/marketdata/v1';
const TRADIER_PROD = 'https://api.tradier.com/v1';
const TRADIER_SANDBOX = 'https://sandbox.tradier.com/v1';

// ─── SCHWAB FETCH (original, untouched) ──────────────────

async function schwabFetch(endpoint: string, params?: Record<string, string>) {
  const token = await getValidAccessToken();
  const url = new URL(`${SCHWAB_BASE}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Schwab API ${res.status}: ${err}`);
  }

  return res.json();
}

// ─── TRADIER FETCH ───────────────────────────────────────

// Cache tradier creds to avoid repeated DB lookups
let tradierCache: { token: string; sandbox: boolean; ts: number } | null = null;
const TRADIER_CACHE_TTL = 5 * 60 * 1000;

async function getTradierConfig(): Promise<{ token: string; sandbox: boolean } | null> {
  if (tradierCache && Date.now() - tradierCache.ts < TRADIER_CACHE_TTL) {
    return { token: tradierCache.token, sandbox: tradierCache.sandbox };
  }

  try {
    // Check for any user with tradier credentials (for single-tenant / admin use)
    // In multi-tenant, this would use the request's userId
    const { data } = await supabase
      .from('user_schwab_credentials')
      .select('tradier_token, tradier_sandbox')
      .not('tradier_token', 'is', null)
      .limit(1)
      .single();

    if (data?.tradier_token) {
      tradierCache = { token: data.tradier_token, sandbox: data.tradier_sandbox || false, ts: Date.now() };
      return { token: data.tradier_token, sandbox: data.tradier_sandbox || false };
    }
  } catch {}
  return null;
}

async function tradierFetch(endpoint: string, token: string, sandbox: boolean, params?: Record<string, string>) {
  const base = sandbox ? TRADIER_SANDBOX : TRADIER_PROD;
  const url = new URL(`${base}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Tradier API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── TRADIER → SCHWAB FORMAT TRANSFORMERS ────────────────

// Transform Tradier quotes to look like Schwab's quote response
function tradierQuotesToSchwab(tradierData: any): any {
  const quotes = Array.isArray(tradierData?.quotes?.quote) ? tradierData.quotes.quote : tradierData?.quotes?.quote ? [tradierData.quotes.quote] : [];
  const result: any = {};
  for (const q of quotes) {
    result[q.symbol] = {
      quote: {
        lastPrice: q.last || 0,
        closePrice: q.prevclose || 0,
        openPrice: q.open || 0,
        highPrice: q.high || 0,
        lowPrice: q.low || 0,
        netChange: q.change || 0,
        netPercentChangeInDouble: q.change_percentage || 0,
        totalVolume: q.volume || 0,
        bidPrice: q.bid || 0,
        askPrice: q.ask || 0,
        '52WkHigh': q.week_52_high || 0,
        '52WkLow': q.week_52_low || 0,
        avgTotalVolume: q.average_volume || 0,
        mark: q.last || 0,
      },
      fundamental: {
        avg10DaysVolume: q.average_volume || 0,
        marketCap: 0, // Tradier doesn't provide this in quotes
        marketSector: '',
      },
    };
  }
  return result;
}

// Transform Tradier option chain to look like Schwab's chain response
function tradierChainToSchwab(options: any[], expirations: string[], underlyingPrice: number): any {
  const putExpDateMap: any = {};
  const callExpDateMap: any = {};

  for (const o of options) {
    const exp = o.expiration_date || '';
    const dte = Math.max(0, Math.round((new Date(exp).getTime() - Date.now()) / 86400000));
    const expKey = `${exp}:${dte}`;

    const contract = {
      symbol: o.symbol || '',
      strikePrice: o.strike || 0,
      strike: o.strike || 0,
      bid: o.bid || 0,
      ask: o.ask || 0,
      last: o.last || 0,
      totalVolume: o.volume || 0,
      openInterest: o.open_interest || 0,
      delta: o.greeks?.delta || 0,
      gamma: o.greeks?.gamma || 0,
      theta: o.greeks?.theta || 0,
      vega: o.greeks?.vega || 0,
      volatility: (o.greeks?.mid_iv || o.greeks?.ask_iv || 0),
      daysToExpiration: dte,
      inTheMoney: o.strike ? (o.option_type === 'put' ? o.strike > underlyingPrice : o.strike < underlyingPrice) : false,
      expirationDate: exp,
    };

    const strikeKey = String(o.strike);

    if (o.option_type === 'put') {
      if (!putExpDateMap[expKey]) putExpDateMap[expKey] = {};
      if (!putExpDateMap[expKey][strikeKey]) putExpDateMap[expKey][strikeKey] = [];
      putExpDateMap[expKey][strikeKey].push(contract);
    } else {
      if (!callExpDateMap[expKey]) callExpDateMap[expKey] = {};
      if (!callExpDateMap[expKey][strikeKey]) callExpDateMap[expKey][strikeKey] = [];
      callExpDateMap[expKey][strikeKey].push(contract);
    }
  }

  return {
    putExpDateMap,
    callExpDateMap,
    underlyingPrice,
    volatility: 0,
    underlying: { last: underlyingPrice },
  };
}

// Transform Tradier history to look like Schwab's pricehistory response
function tradierHistoryToSchwab(tradierData: any): any {
  const days = tradierData?.history?.day || [];
  return {
    candles: days.map((d: any) => ({
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume || 0,
      datetime: new Date(d.date).getTime(),
    })),
  };
}

// ─── PROVIDER DETECTION ──────────────────────────────────

async function useSchwab(): Promise<boolean> {
  try {
    return await isAuthenticated();
  } catch {
    return false;
  }
}

// ─── PUBLIC API (same signatures as before) ──────────────

// Multi-symbol quotes in a single call
export async function getQuotes(symbols: string[]) {
  // Try Schwab first
  if (await useSchwab()) {
    return schwabFetch('/quotes', {
      symbols: symbols.join(','),
      fields: 'quote,fundamental',
    });
  }

  // Fallback: Tradier
  const tradier = await getTradierConfig();
  if (tradier) {
    const data = await tradierFetch('/markets/quotes', tradier.token, tradier.sandbox, {
      symbols: symbols.join(','),
      greeks: 'false',
    });
    return tradierQuotesToSchwab(data);
  }

  throw new Error('No data provider available. Connect Schwab or Tradier in Settings → Schwab API.');
}

// Full option chain with Greeks
export async function getOptionChain(symbol: string, opts?: {
  contractType?: 'CALL' | 'PUT' | 'ALL';
  strikeCount?: number;
  range?: string;
  fromDate?: string;
  toDate?: string;
  expMonth?: string;
}) {
  // Try Schwab first
  if (await useSchwab()) {
    const params: Record<string, string> = { symbol };
    if (opts?.contractType) params.contractType = opts.contractType;
    if (opts?.strikeCount) params.strikeCount = String(opts.strikeCount);
    if (opts?.range) params.range = opts.range;
    if (opts?.fromDate) params.fromDate = opts.fromDate;
    if (opts?.toDate) params.toDate = opts.toDate;
    if (opts?.expMonth) params.expMonth = opts.expMonth;
    return schwabFetch('/chains', params);
  }

  // Fallback: Tradier
  const tradier = await getTradierConfig();
  if (tradier) {
    // Get underlying price
    const quoteData = await tradierFetch('/markets/quotes', tradier.token, tradier.sandbox, { symbols: symbol });
    const quotes = Array.isArray(quoteData?.quotes?.quote) ? quoteData.quotes.quote : quoteData?.quotes?.quote ? [quoteData.quotes.quote] : [];
    const underlyingPrice = quotes[0]?.last || 0;

    // Get expirations
    const expData = await tradierFetch('/markets/options/expirations', tradier.token, tradier.sandbox, { symbol, includeAllRoots: 'true' });
    let expirations: string[] = expData?.expirations?.date || [];

    // Filter expirations by date range if specified
    if (opts?.fromDate) expirations = expirations.filter(e => e >= opts.fromDate!);
    if (opts?.toDate) expirations = expirations.filter(e => e <= opts.toDate!);

    // Limit to nearest 6 expirations to stay within rate limits
    expirations = expirations.slice(0, 6);

    // Fetch chain for each expiration
    let allOptions: any[] = [];
    for (const exp of expirations) {
      try {
        const chainData = await tradierFetch('/markets/options/chains', tradier.token, tradier.sandbox, {
          symbol, expiration: exp, greeks: 'true',
        });
        const options = Array.isArray(chainData?.options?.option) ? chainData.options.option : chainData?.options?.option ? [chainData.options.option] : [];
        allOptions.push(...options);
      } catch {}
    }

    return tradierChainToSchwab(allOptions, expirations, underlyingPrice);
  }

  throw new Error('No data provider available. Connect Schwab or Tradier in Settings → Schwab API.');
}

// Price history for technical analysis
export async function getPriceHistory(symbol: string, opts?: {
  periodType?: string;
  period?: number;
  frequencyType?: string;
  frequency?: number;
  startDate?: number;
  endDate?: number;
  needExtendedHoursData?: boolean;
}) {
  // Try Schwab first
  if (await useSchwab()) {
    const params: Record<string, string> = { symbol };
    if (opts?.periodType) params.periodType = opts.periodType;
    if (opts?.period) params.period = String(opts.period);
    if (opts?.frequencyType) params.frequencyType = opts.frequencyType;
    if (opts?.frequency) params.frequency = String(opts.frequency);
    if (opts?.needExtendedHoursData !== undefined) params.needExtendedHoursData = String(opts.needExtendedHoursData);
    return schwabFetch(`/pricehistory`, { ...params });
  }

  // Fallback: Tradier
  const tradier = await getTradierConfig();
  if (tradier) {
    const end = new Date().toISOString().split('T')[0];
    const days = (opts?.period || 3) * (opts?.periodType === 'year' ? 365 : 30);
    const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const data = await tradierFetch('/markets/history', tradier.token, tradier.sandbox, {
      symbol, interval: 'daily', start, end,
    });
    return tradierHistoryToSchwab(data);
  }

  throw new Error('No data provider available. Connect Schwab or Tradier in Settings → Schwab API.');
}

// Market movers (Schwab only — no Tradier equivalent)
export async function getMovers(index: string, direction?: 'up' | 'down') {
  const params: Record<string, string> = {};
  if (direction) params.sort = direction;
  return schwabFetch(`/movers/${index}`, params);
}
