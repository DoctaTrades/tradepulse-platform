import { getValidAccessToken } from './schwab-auth';

const SCHWAB_BASE = 'https://api.schwabapi.com/marketdata/v1';

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

// Multi-symbol quotes in a single call
export async function getQuotes(symbols: string[]) {
  return schwabFetch('/quotes', {
    symbols: symbols.join(','),
    fields: 'quote,fundamental',
  });
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
  const params: Record<string, string> = { symbol };
  if (opts?.contractType) params.contractType = opts.contractType;
  if (opts?.strikeCount) params.strikeCount = String(opts.strikeCount);
  if (opts?.range) params.range = opts.range;
  if (opts?.fromDate) params.fromDate = opts.fromDate;
  if (opts?.toDate) params.toDate = opts.toDate;
  if (opts?.expMonth) params.expMonth = opts.expMonth;

  return schwabFetch('/chains', params);
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
  const params: Record<string, string> = { symbol };
  if (opts?.periodType) params.periodType = opts.periodType;
  if (opts?.period) params.period = String(opts.period);
  if (opts?.frequencyType) params.frequencyType = opts.frequencyType;
  if (opts?.frequency) params.frequency = String(opts.frequency);
  if (opts?.needExtendedHoursData !== undefined) params.needExtendedHoursData = String(opts.needExtendedHoursData);

  return schwabFetch(`/pricehistory`, { ...params });
}

// Market movers
export async function getMovers(index: string, direction?: 'up' | 'down') {
  const params: Record<string, string> = {};
  if (direction) params.sort = direction;
  return schwabFetch(`/movers/${index}`, params);
}
