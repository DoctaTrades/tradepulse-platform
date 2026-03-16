// Unified market data provider
// Abstracts Schwab, Tradier, and Polygon into a common interface
// Each provider returns data in the same shape so scan logic doesn't care about the source

import { getValidAccessToken as getSchwabToken, isAuthenticated as isSchwabAuth } from './schwab-auth';

const SCHWAB_BASE = 'https://api.schwabapi.com/marketdata/v1';
const TRADIER_PROD = 'https://api.tradier.com/v1';
const TRADIER_SANDBOX = 'https://sandbox.tradier.com/v1';

export type Provider = 'schwab' | 'tradier' | 'polygon';

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  bid: number;
  ask: number;
  wk52High: number;
  wk52Low: number;
  avgVolume: number;
  marketCap?: number;
  pe?: number;
}

export interface OptionContract {
  symbol: string;
  strike: number;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  daysToExpiration: number;
  expDate: string;
  putCall: 'PUT' | 'CALL';
  inTheMoney: boolean;
}

export interface OptionChain {
  underlying: string;
  underlyingPrice: number;
  puts: Record<string, OptionContract[]>;  // keyed by expDate
  calls: Record<string, OptionContract[]>; // keyed by expDate
  volatility?: number;
}

export interface PriceCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  datetime: number;
}

// ═══ SCHWAB PROVIDER ═══

async function schwabFetch(endpoint: string, params?: Record<string, string>) {
  const token = await getSchwabToken();
  const url = new URL(`${SCHWAB_BASE}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Schwab API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function schwabQuotes(symbols: string[]): Promise<Record<string, QuoteData>> {
  const results: Record<string, QuoteData> = {};
  for (let i = 0; i < symbols.length; i += 40) {
    const batch = symbols.slice(i, i + 40);
    const data = await schwabFetch('/quotes', { symbols: batch.join(','), fields: 'quote,fundamental' });
    for (const [sym, info] of Object.entries(data) as any) {
      const q = info?.quote;
      const f = info?.fundamental;
      if (!q) continue;
      results[sym] = {
        symbol: sym,
        price: q.lastPrice || q.closePrice || 0,
        change: q.netChange || 0,
        changePct: q.netPercentChangeInDouble || 0,
        volume: q.totalVolume || 0,
        open: q.openPrice || 0,
        high: q.highPrice || 0,
        low: q.lowPrice || 0,
        prevClose: q.closePrice || 0,
        bid: q.bidPrice || 0,
        ask: q.askPrice || 0,
        wk52High: q['52WkHigh'] || 0,
        wk52Low: q['52WkLow'] || 0,
        avgVolume: q.avgTotalVolume || f?.avg10DaysVolume || 0,
        marketCap: f?.marketCap || 0,
        pe: f?.peRatio || 0,
      };
    }
  }
  return results;
}

async function schwabOptionChain(symbol: string, params?: Record<string, string>): Promise<OptionChain> {
  const chain = await schwabFetch('/chains', {
    symbol,
    contractType: 'ALL',
    range: 'ALL',
    strikeCount: '40',
    includeUnderlyingQuote: 'true',
    ...params,
  });

  const puts: Record<string, OptionContract[]> = {};
  const calls: Record<string, OptionContract[]> = {};

  for (const [expDate, strikes] of Object.entries(chain.putExpDateMap || {}) as any) {
    const exp = expDate.split(':')[0];
    puts[exp] = [];
    for (const contracts of Object.values(strikes) as any) {
      for (const c of contracts) {
        puts[exp].push({
          symbol: c.symbol, strike: Number(c.strikePrice || 0),
          bid: c.bid || 0, ask: c.ask || 0, last: c.last || 0,
          volume: c.totalVolume || 0, openInterest: c.openInterest || 0,
          delta: c.delta || 0, gamma: c.gamma || 0, theta: c.theta || 0, vega: c.vega || 0,
          iv: c.volatility || 0, daysToExpiration: c.daysToExpiration || 0,
          expDate: exp, putCall: 'PUT', inTheMoney: c.inTheMoney || false,
        });
      }
    }
  }

  for (const [expDate, strikes] of Object.entries(chain.callExpDateMap || {}) as any) {
    const exp = expDate.split(':')[0];
    calls[exp] = [];
    for (const contracts of Object.values(strikes) as any) {
      for (const c of contracts) {
        calls[exp].push({
          symbol: c.symbol, strike: Number(c.strikePrice || 0),
          bid: c.bid || 0, ask: c.ask || 0, last: c.last || 0,
          volume: c.totalVolume || 0, openInterest: c.openInterest || 0,
          delta: c.delta || 0, gamma: c.gamma || 0, theta: c.theta || 0, vega: c.vega || 0,
          iv: c.volatility || 0, daysToExpiration: c.daysToExpiration || 0,
          expDate: exp, putCall: 'CALL', inTheMoney: c.inTheMoney || false,
        });
      }
    }
  }

  return {
    underlying: symbol,
    underlyingPrice: chain.underlyingPrice || chain.underlying?.last || 0,
    puts, calls,
    volatility: chain.volatility || 0,
  };
}

async function schwabPriceHistory(symbol: string, periodType = 'month', period = '3'): Promise<PriceCandle[]> {
  const hist = await schwabFetch('/pricehistory', {
    symbol, periodType, period, frequencyType: 'daily', frequency: '1',
  });
  return (hist.candles || []).map((c: any) => ({
    open: c.open, high: c.high, low: c.low, close: c.close,
    volume: c.volume || 0, datetime: c.datetime || 0,
  }));
}

// ═══ TRADIER PROVIDER ═══

async function tradierFetch(endpoint: string, token: string, sandbox = false, params?: Record<string, string>) {
  const base = sandbox ? TRADIER_SANDBOX : TRADIER_PROD;
  const url = new URL(`${base}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Tradier API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function tradierQuotes(symbols: string[], token: string, sandbox = false): Promise<Record<string, QuoteData>> {
  const results: Record<string, QuoteData> = {};
  // Tradier supports up to 1000 symbols in one call
  const data = await tradierFetch('/markets/quotes', token, sandbox, { symbols: symbols.join(','), greeks: 'false' });
  const quotes = Array.isArray(data?.quotes?.quote) ? data.quotes.quote : data?.quotes?.quote ? [data.quotes.quote] : [];

  for (const q of quotes) {
    if (q.type !== 'stock' && q.type !== 'etf') continue;
    results[q.symbol] = {
      symbol: q.symbol,
      price: q.last || 0,
      change: q.change || 0,
      changePct: q.change_percentage || 0,
      volume: q.volume || 0,
      open: q.open || 0,
      high: q.high || 0,
      low: q.low || 0,
      prevClose: q.prevclose || 0,
      bid: q.bid || 0,
      ask: q.ask || 0,
      wk52High: q.week_52_high || 0,
      wk52Low: q.week_52_low || 0,
      avgVolume: q.average_volume || 0,
    };
  }
  return results;
}

async function tradierOptionChain(symbol: string, token: string, sandbox = false): Promise<OptionChain> {
  // Step 1: get expirations
  const expData = await tradierFetch('/markets/options/expirations', token, sandbox, { symbol, includeAllRoots: 'true' });
  const expirations: string[] = expData?.expirations?.date || [];

  const puts: Record<string, OptionContract[]> = {};
  const calls: Record<string, OptionContract[]> = {};

  // Step 2: fetch chain for each expiration (limit to nearest 4 to stay within rate limits)
  const nearExps = expirations.slice(0, 4);
  for (const exp of nearExps) {
    const chainData = await tradierFetch('/markets/options/chains', token, sandbox, {
      symbol, expiration: exp, greeks: 'true',
    });
    const options = Array.isArray(chainData?.options?.option) ? chainData.options.option : chainData?.options?.option ? [chainData.options.option] : [];

    puts[exp] = [];
    calls[exp] = [];

    for (const o of options) {
      const contract: OptionContract = {
        symbol: o.symbol || '',
        strike: o.strike || 0,
        bid: o.bid || 0,
        ask: o.ask || 0,
        last: o.last || 0,
        volume: o.volume || 0,
        openInterest: o.open_interest || 0,
        delta: o.greeks?.delta || 0,
        gamma: o.greeks?.gamma || 0,
        theta: o.greeks?.theta || 0,
        vega: o.greeks?.vega || 0,
        iv: (o.greeks?.mid_iv || o.greeks?.ask_iv || 0) * 100,
        daysToExpiration: Math.max(0, Math.round((new Date(exp).getTime() - Date.now()) / (86400000))),
        expDate: exp,
        putCall: o.option_type === 'put' ? 'PUT' : 'CALL',
        inTheMoney: o.strike ? (o.option_type === 'put' ? o.strike > (o.underlying_price || 0) : o.strike < (o.underlying_price || 0)) : false,
      };

      if (o.option_type === 'put') puts[exp].push(contract);
      else calls[exp].push(contract);
    }
  }

  // Get underlying price from a quote
  let underlyingPrice = 0;
  try {
    const q = await tradierQuotes([symbol], token, sandbox);
    underlyingPrice = q[symbol]?.price || 0;
  } catch {}

  return { underlying: symbol, underlyingPrice, puts, calls };
}

async function tradierPriceHistory(symbol: string, token: string, sandbox = false): Promise<PriceCandle[]> {
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
  const data = await tradierFetch('/markets/history', token, sandbox, {
    symbol, interval: 'daily', start, end,
  });
  const days = data?.history?.day || [];
  return days.map((d: any) => ({
    open: d.open, high: d.high, low: d.low, close: d.close,
    volume: d.volume || 0, datetime: new Date(d.date).getTime(),
  }));
}

// ═══ UNIFIED INTERFACE ═══

export interface ProviderConfig {
  provider: Provider;
  schwabUserId?: string;          // for per-user Schwab
  tradierToken?: string;
  tradierSandbox?: boolean;
  polygonKey?: string;
}

export async function getQuotes(symbols: string[], config: ProviderConfig): Promise<Record<string, QuoteData>> {
  switch (config.provider) {
    case 'schwab':
      return schwabQuotes(symbols);
    case 'tradier':
      if (!config.tradierToken) throw new Error('Tradier access token required');
      return tradierQuotes(symbols, config.tradierToken, config.tradierSandbox);
    case 'polygon':
      throw new Error('Polygon quotes not yet implemented — use Schwab or Tradier');
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export async function getOptionChain(symbol: string, config: ProviderConfig, params?: Record<string, string>): Promise<OptionChain> {
  switch (config.provider) {
    case 'schwab':
      return schwabOptionChain(symbol, params);
    case 'tradier':
      if (!config.tradierToken) throw new Error('Tradier access token required');
      return tradierOptionChain(symbol, config.tradierToken, config.tradierSandbox);
    case 'polygon':
      throw new Error('Polygon option chains require a paid plan — use Schwab or Tradier');
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export async function getPriceHistory(symbol: string, config: ProviderConfig): Promise<PriceCandle[]> {
  switch (config.provider) {
    case 'schwab':
      return schwabPriceHistory(symbol);
    case 'tradier':
      if (!config.tradierToken) throw new Error('Tradier access token required');
      return tradierPriceHistory(symbol, config.tradierToken, config.tradierSandbox);
    case 'polygon':
      throw new Error('Polygon price history not yet implemented');
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

// Helper: detect which provider is available
export async function detectProvider(): Promise<ProviderConfig> {
  // Check Schwab first (env var / legacy)
  if (await isSchwabAuth()) {
    return { provider: 'schwab' };
  }
  // Default to schwab (will error if not connected)
  return { provider: 'schwab' };
}
