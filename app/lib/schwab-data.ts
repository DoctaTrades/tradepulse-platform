// Market data layer — Per-user Schwab/Tradier with platform fallback
// ALL functions return data in SCHWAB'S EXACT format
// Priority: User's Schwab → User's Tradier → Platform Schwab (env vars)

import { getValidAccessToken, isAuthenticated, hasUserCredentials } from './schwab-auth';
import { supabase } from './supabase';

const SCHWAB_BASE = 'https://api.schwabapi.com/marketdata/v1';
const TRADIER_PROD = 'https://api.tradier.com/v1';
const TRADIER_SANDBOX = 'https://sandbox.tradier.com/v1';

// ─── REQUEST-SCOPED USER CONTEXT ─────────────────────────
// Set before each scan to route to the correct user's credentials
let _activeUserId: string | undefined;

export function setActiveUser(userId?: string) {
  _activeUserId = userId;
}

export function getActiveUser(): string | undefined {
  return _activeUserId;
}

// ─── SCHWAB FETCH ────────────────────────────────────────

// Resolved userId for the current request — set by detectProvider
let _resolvedSchwabUserId: string | undefined;

async function schwabFetch(endpoint: string, params?: Record<string, string>) {
  // Use the resolved userId from detectProvider (may be undefined for platform/legacy)
  const token = await getValidAccessToken(_resolvedSchwabUserId);
  const url = new URL(`${SCHWAB_BASE}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Schwab API ${res.status}: ${err}`);
  }

  return res.json();
}

// ─── TRADIER FETCH ───────────────────────────────────────

async function getUserTradierConfig(userId?: string): Promise<{ token: string; sandbox: boolean } | null> {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from('user_schwab_credentials')
      .select('tradier_token, tradier_sandbox')
      .eq('user_id', userId)
      .single();

    if (data?.tradier_token) {
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
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Tradier API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── TRADIER → SCHWAB FORMAT TRANSFORMERS ────────────────

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
        marketCap: 0,
        marketSector: '',
      },
    };
  }
  return result;
}

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
// Priority: User's Schwab → User's Tradier → Platform Schwab

async function detectProvider(): Promise<'schwab' | 'tradier' | null> {
  const userId = _activeUserId;

  // 1. Check if this user has their own Schwab credentials + active tokens
  if (userId) {
    const userHasSchwab = await hasUserCredentials(userId);
    if (userHasSchwab) {
      try {
        const userAuth = await isAuthenticated(userId);
        if (userAuth) {
          _resolvedSchwabUserId = userId; // Use this user's tokens
          return 'schwab';
        }
      } catch {}
    }

    // 2. Check if this user has Tradier
    const tradier = await getUserTradierConfig(userId);
    if (tradier) return 'tradier';
  }

  // 3. Fall back to platform Schwab (env vars / legacy tokens)
  try {
    const platformAuth = await isAuthenticated(); // no userId = legacy
    if (platformAuth) {
      _resolvedSchwabUserId = undefined; // Use platform/legacy tokens
      return 'schwab';
    }
  } catch {}

  return null;
}

// ─── PUBLIC API ──────────────────────────────────────────

export async function getQuotes(symbols: string[]) {
  const provider = await detectProvider();

  if (provider === 'schwab') {
    return schwabFetch('/quotes', {
      symbols: symbols.join(','),
      fields: 'quote,fundamental',
    });
  }

  if (provider === 'tradier') {
    const tradier = await getUserTradierConfig(_activeUserId);
    if (tradier) {
      const data = await tradierFetch('/markets/quotes', tradier.token, tradier.sandbox, {
        symbols: symbols.join(','),
        greeks: 'false',
      });
      return tradierQuotesToSchwab(data);
    }
  }

  throw new Error('No data provider available. Connect Schwab or Tradier in Settings → Schwab API.');
}

export async function getOptionChain(symbol: string, opts?: {
  contractType?: 'CALL' | 'PUT' | 'ALL';
  strikeCount?: number;
  range?: string;
  fromDate?: string;
  toDate?: string;
  expMonth?: string;
}) {
  const provider = await detectProvider();

  if (provider === 'schwab') {
    const params: Record<string, string> = { symbol };
    if (opts?.contractType) params.contractType = opts.contractType;
    if (opts?.strikeCount) params.strikeCount = String(opts.strikeCount);
    if (opts?.range) params.range = opts.range;
    if (opts?.fromDate) params.fromDate = opts.fromDate;
    if (opts?.toDate) params.toDate = opts.toDate;
    if (opts?.expMonth) params.expMonth = opts.expMonth;
    return schwabFetch('/chains', params);
  }

  if (provider === 'tradier') {
    const tradier = await getUserTradierConfig(_activeUserId);
    if (tradier) {
      // Get underlying price
      const quoteData = await tradierFetch('/markets/quotes', tradier.token, tradier.sandbox, { symbols: symbol });
      const quotes = Array.isArray(quoteData?.quotes?.quote) ? quoteData.quotes.quote : quoteData?.quotes?.quote ? [quoteData.quotes.quote] : [];
      const underlyingPrice = quotes[0]?.last || 0;

      // Get expirations
      const expData = await tradierFetch('/markets/options/expirations', tradier.token, tradier.sandbox, { symbol, includeAllRoots: 'true' });
      let expirations: string[] = expData?.expirations?.date || [];

      if (opts?.fromDate) expirations = expirations.filter(e => e >= opts.fromDate!);
      if (opts?.toDate) expirations = expirations.filter(e => e <= opts.toDate!);
      expirations = expirations.slice(0, 6);

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
  }

  throw new Error('No data provider available. Connect Schwab or Tradier in Settings → Schwab API.');
}

export async function getPriceHistory(symbol: string, opts?: {
  periodType?: string;
  period?: number;
  frequencyType?: string;
  frequency?: number;
  startDate?: number;
  endDate?: number;
  needExtendedHoursData?: boolean;
}) {
  const provider = await detectProvider();

  if (provider === 'schwab') {
    const params: Record<string, string> = { symbol };
    if (opts?.periodType) params.periodType = opts.periodType;
    if (opts?.period) params.period = String(opts.period);
    if (opts?.frequencyType) params.frequencyType = opts.frequencyType;
    if (opts?.frequency) params.frequency = String(opts.frequency);
    if (opts?.needExtendedHoursData !== undefined) params.needExtendedHoursData = String(opts.needExtendedHoursData);
    return schwabFetch(`/pricehistory`, { ...params });
  }

  if (provider === 'tradier') {
    const tradier = await getUserTradierConfig(_activeUserId);
    if (tradier) {
      const end = new Date().toISOString().split('T')[0];
      const days = (opts?.period || 3) * (opts?.periodType === 'year' ? 365 : 30);
      const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
      const data = await tradierFetch('/markets/history', tradier.token, tradier.sandbox, {
        symbol, interval: 'daily', start, end,
      });
      return tradierHistoryToSchwab(data);
    }
  }

  throw new Error('No data provider available. Connect Schwab or Tradier in Settings → Schwab API.');
}

// Market movers (Schwab only)
export async function getMovers(index: string, direction?: 'up' | 'down') {
  const params: Record<string, string> = {};
  if (direction) params.sort = direction;
  return schwabFetch(`/movers/${index}`, params);
}
