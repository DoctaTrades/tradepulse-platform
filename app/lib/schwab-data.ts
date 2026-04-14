// Market data layer — Per-user Schwab
// ALL functions return data in SCHWAB'S EXACT format
// Per-user credentials only (env var fallback removed 2026-04-13)
// Every function takes optional userId — no module-level mutable state

import { getValidAccessToken, hasSchwabConnection, refreshAccessToken } from './schwab-auth';

const SCHWAB_BASE = 'https://api.schwabapi.com/marketdata/v1';

// ─── SCHWAB FETCH (single implementation with 401 retry) ──

export async function schwabFetch(endpoint: string, params?: Record<string, string>, userId?: string) {
  let token = await getValidAccessToken(userId);
  const url = new URL(`${SCHWAB_BASE}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });

  // On 401, force refresh and retry once
  if (res.status === 401) {
    // Log the initial 401 for observability
    try {
      const body = await res.clone().text();
      console.log('[SCHWAB-API] initial-401', JSON.stringify({
        endpoint, userId: userId || 'none',
        tokenPrefix: token ? token.slice(0, 12) + '…' : 'none',
        tokenLen: token?.length || 0,
        responseBody: body.slice(0, 300),
      }));
    } catch {}
    try {
      await refreshAccessToken(userId);
      token = await getValidAccessToken(userId);
      res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store',
      });
      // If the retry still fails, log it for diagnostic purposes
      if (!res.ok) {
        try {
          const body2 = await res.clone().text();
          console.log('[SCHWAB-API] retry-after-refresh-failed', JSON.stringify({
            endpoint, userId: userId || 'none',
            status: res.status,
            body: body2.slice(0, 300),
          }));
        } catch {}
      }
    } catch (refreshErr: any) {
      console.log('[SCHWAB-API] refresh-threw', JSON.stringify({
        endpoint, userId: userId || 'none',
        error: refreshErr?.message || String(refreshErr),
      }));
      throw new Error('Schwab API 401: Token refresh failed. Please reconnect Schwab.');
    }
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Schwab API ${res.status}: ${err}`);
  }

  return res.json();
}

// ─── PROVIDER DETECTION ──────────────────────────────────

async function detectProvider(userId?: string): Promise<{ type: 'schwab' | null; schwabUserId?: string }> {
  if (!userId) return { type: null };
  try {
    // hasSchwabConnection returns true if the user has credentials + refresh_token,
    // even if the access_token is currently expired. schwabFetch will refresh on
    // demand when it hits a 401 from the actual API call.
    const connected = await hasSchwabConnection(userId);
    if (connected) return { type: 'schwab', schwabUserId: userId };
  } catch {}
  return { type: null };
}

// ─── PUBLIC API ──────────────────────────────────────────

export async function getQuotes(symbols: string[], userId?: string) {
  const { type, schwabUserId } = await detectProvider(userId);
  if (type === 'schwab') return schwabFetch('/quotes', { symbols: symbols.join(','), fields: 'quote,fundamental' }, schwabUserId);
  throw new Error('No data provider available. Connect Schwab in Settings.');
}

export async function getOptionChain(symbol: string, opts?: {
  contractType?: 'CALL' | 'PUT' | 'ALL'; strikeCount?: number; range?: string;
  fromDate?: string; toDate?: string; expMonth?: string;
}, userId?: string) {
  const { type, schwabUserId } = await detectProvider(userId);
  if (type === 'schwab') {
    const params: Record<string, string> = { symbol };
    if (opts?.contractType) params.contractType = opts.contractType;
    if (opts?.strikeCount) params.strikeCount = String(opts.strikeCount);
    if (opts?.range) params.range = opts.range;
    if (opts?.fromDate) params.fromDate = opts.fromDate;
    if (opts?.toDate) params.toDate = opts.toDate;
    if (opts?.expMonth) params.expMonth = opts.expMonth;
    return schwabFetch('/chains', params, schwabUserId);
  }
  throw new Error('No data provider available. Connect Schwab in Settings.');
}

export async function getPriceHistory(symbol: string, opts?: {
  periodType?: string; period?: number; frequencyType?: string; frequency?: number;
  startDate?: number; endDate?: number; needExtendedHoursData?: boolean;
}, userId?: string) {
  const { type, schwabUserId } = await detectProvider(userId);
  if (type === 'schwab') {
    const params: Record<string, string> = { symbol };
    if (opts?.periodType) params.periodType = opts.periodType;
    if (opts?.period) params.period = String(opts.period);
    if (opts?.frequencyType) params.frequencyType = opts.frequencyType;
    if (opts?.frequency) params.frequency = String(opts.frequency);
    if (opts?.needExtendedHoursData !== undefined) params.needExtendedHoursData = String(opts.needExtendedHoursData);
    return schwabFetch('/pricehistory', { ...params }, schwabUserId);
  }
  throw new Error('No data provider available. Connect Schwab in Settings.');
}

export async function getMovers(index: string, direction?: 'up' | 'down', userId?: string) {
  const { schwabUserId } = await detectProvider(userId);
  const params: Record<string, string> = {};
  if (direction) params.sort = direction;
  return schwabFetch(`/movers/${index}`, params, schwabUserId);
}
