// Schwab OAuth token management — rewritten 2026-04-13
//
// Design principles:
// 1. One source of truth per user: user_schwab_credentials table
// 2. Auth checks are read-only (never trigger refresh as a side effect)
// 3. Token operations are linear (no recovery loops, no retries)
// 4. Automatic destruction is forbidden (no wipes on refresh failure)
// 5. Every state change is observable (success AND failure logged)
// 6. No env-var credential fallback at runtime (per-user only)
// 7. Refresh failures return errors, not side effects
// 8. In-memory cache is minimal (30-second TTL, one map)
//
// Public API preserved from prior version:
//   isAuthenticated, getValidAccessToken, refreshAccessToken,
//   exchangeCodeForTokens, getAuthorizationUrl, clearTokensBeforeReconnect,
//   saveUserCredentials, deleteUserCredentials, hasUserCredentials,
//   getTokenStatus, clearTokens
//
// Error codes (strings thrown):
//   NO_USER_ID         — userId was not provided
//   NO_CREDENTIALS     — user has no app_key/app_secret saved
//   NOT_AUTHENTICATED  — user has credentials but no tokens (not yet OAuthed)
//   REFRESH_FAILED     — Schwab rejected the refresh (includes Schwab body)
//   OAUTH_EXCHANGE_FAILED — OAuth code exchange failed
//   DB_ERROR           — Supabase read/write failed

import { supabase } from './supabase';

// ─── TYPES ───────────────────────────────────────────────

interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

interface UserCredentials {
  appKey: string;
  appSecret: string;
  callbackUrl: string;
}

interface CachedEntry {
  tokens: TokenPair | null;
  credentials: UserCredentials | null;
  cachedAt: number;
}

interface TokenStatus {
  connected: boolean;
  expiresAt: number | null;
  refreshExpiresEstimate: string;
  hasCredentials: boolean;
}

// ─── CONSTANTS ───────────────────────────────────────────

const SCHWAB_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize';
const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';
const CACHE_TTL_MS = 30 * 1000; // 30 seconds
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ACCESS_TOKEN_EARLY_REFRESH_MS = 60 * 1000; // refresh 60s before real expiry

// ─── IN-MEMORY CACHE ─────────────────────────────────────

const cache = new Map<string, CachedEntry>();

function cacheGet(userId: string): CachedEntry | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return entry;
}

function cacheSet(userId: string, entry: Partial<CachedEntry>): void {
  const existing = cache.get(userId);
  cache.set(userId, {
    tokens: entry.tokens !== undefined ? entry.tokens : (existing?.tokens ?? null),
    credentials: entry.credentials !== undefined ? entry.credentials : (existing?.credentials ?? null),
    cachedAt: Date.now(),
  });
}

function cacheDelete(userId: string): void {
  cache.delete(userId);
}

// ─── DB READS ────────────────────────────────────────────

async function dbLoadRow(userId: string): Promise<{
  tokens: TokenPair | null;
  credentials: UserCredentials | null;
} | null> {
  // Bypass the Supabase JS client and use raw fetch with explicit no-cache
  // directives. Next.js 14 caches fetch() responses by default, and the
  // Supabase JS client goes through the global fetch, which means its reads
  // get cached at the Next.js Data Cache layer. This was causing stale token
  // reads that survived across requests even with a fresh client.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    console.log('[SCHWAB] db-load-config-error', JSON.stringify({ userId, hasUrl: !!supabaseUrl, hasKey: !!serviceKey }));
    return null;
  }

  const url = `${supabaseUrl}/rest/v1/user_schwab_credentials?user_id=eq.${encodeURIComponent(userId)}&select=app_key,app_secret,callback_url,access_token,refresh_token,access_expires_at`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    const ageHeader = res.headers.get('age');
    const cacheControl = res.headers.get('cache-control');

    if (!res.ok) {
      console.log('[SCHWAB] db-load-http-error', JSON.stringify({
        userId,
        status: res.status,
        age: ageHeader,
        cacheControl,
      }));
      return null;
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const data = rows[0];

    const credentials: UserCredentials | null = data.app_key
      ? {
          appKey: data.app_key,
          appSecret: data.app_secret,
          callbackUrl: data.callback_url || `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`,
        }
      : null;

    const tokens: TokenPair | null = data.access_token && data.refresh_token
      ? {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.access_expires_at || 0,
          token_type: 'Bearer',
        }
      : null;

    return { tokens, credentials };
  } catch (e) {
    console.log('[SCHWAB] db-load-error', JSON.stringify({ userId, error: (e as Error).message }));
    return null;
  }
}

async function ensureLoaded(userId: string): Promise<CachedEntry> {
  const cached = cacheGet(userId);
  if (cached) return cached;

  const row = await dbLoadRow(userId);
  if (!row) {
    const empty: CachedEntry = { tokens: null, credentials: null, cachedAt: Date.now() };
    cache.set(userId, empty);
    return empty;
  }
  cacheSet(userId, { tokens: row.tokens, credentials: row.credentials });
  return cache.get(userId)!;
}

// ─── DB WRITES ───────────────────────────────────────────

async function dbSaveTokens(userId: string, tokens: TokenPair): Promise<void> {
  const refreshExpiresAt = Date.now() + REFRESH_TOKEN_LIFETIME_MS;
  const { error } = await supabase
    .from('user_schwab_credentials')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_expires_at: tokens.expires_at,
      refresh_expires_at: refreshExpiresAt,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.log('[SCHWAB] db-save-tokens-error', JSON.stringify({ userId, error: error.message }));
    throw new Error(`DB_ERROR: ${error.message}`);
  }
}

async function dbClearTokenFields(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_schwab_credentials')
    .update({
      access_token: null,
      refresh_token: null,
      access_expires_at: null,
      refresh_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.log('[SCHWAB] db-clear-tokens-error', JSON.stringify({ userId, error: error.message }));
    throw new Error(`DB_ERROR: ${error.message}`);
  }
}

// ─── HELPERS ─────────────────────────────────────────────

function getBasicAuth(creds: UserCredentials): string {
  return Buffer.from(`${creds.appKey}:${creds.appSecret}`).toString('base64');
}

// ─── PUBLIC API ──────────────────────────────────────────

export async function hasUserCredentials(userId: string): Promise<boolean> {
  if (!userId) return false;
  const entry = await ensureLoaded(userId);
  return !!entry.credentials;
}

export async function isAuthenticated(userId?: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const entry = await ensureLoaded(userId);
    if (!entry.tokens || !entry.tokens.access_token) return false;
    return entry.tokens.expires_at > Date.now();
  } catch {
    return false;
  }
}

// hasSchwabConnection — used by route auth gates. Returns true if the user
// has the tools needed to talk to Schwab (credentials saved + refresh token
// stored), regardless of whether the current access token is expired. The
// actual refresh happens inside schwabFetch when a real API call hits 401.
// This keeps isAuthenticated read-only while still allowing auth gates to
// let through requests that just need a token refresh.
export async function hasSchwabConnection(userId?: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const entry = await ensureLoaded(userId);
    return !!(entry.credentials && entry.tokens?.refresh_token);
  } catch {
    return false;
  }
}

export async function getValidAccessToken(userId?: string): Promise<string> {
  if (!userId) throw new Error('NO_USER_ID');

  const entry = await ensureLoaded(userId);
  if (!entry.credentials) throw new Error('NO_CREDENTIALS');
  if (!entry.tokens) throw new Error('NOT_AUTHENTICATED');

  // If token is expired or within the early-refresh window, refresh it
  if (entry.tokens.expires_at <= Date.now() + ACCESS_TOKEN_EARLY_REFRESH_MS) {
    const refreshed = await refreshAccessToken(userId);
    return refreshed.access_token;
  }

  return entry.tokens.access_token;
}

export async function refreshAccessToken(userId?: string): Promise<TokenPair> {
  if (!userId) throw new Error('NO_USER_ID');

  // Force reload from DB to get the latest refresh_token (another instance
  // may have refreshed it since our last cache load)
  cacheDelete(userId);
  const entry = await ensureLoaded(userId);

  if (!entry.credentials) throw new Error('NO_CREDENTIALS');
  if (!entry.tokens?.refresh_token) throw new Error('NOT_AUTHENTICATED');

  console.log('[SCHWAB] refresh-start', JSON.stringify({
    userId,
    appKeyPrefix: entry.credentials.appKey.slice(0, 8) + '…',
    refreshTokenPrefix: entry.tokens.refresh_token.slice(0, 12) + '…',
  }));

  let res: Response;
  try {
    res = await fetch(SCHWAB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${getBasicAuth(entry.credentials)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: entry.tokens.refresh_token,
      }),
    });
  } catch (e) {
    console.log('[SCHWAB] refresh-network-error', JSON.stringify({
      userId,
      error: (e as Error).message,
    }));
    throw new Error(`REFRESH_FAILED: network error — ${(e as Error).message}`);
  }

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch {}
    console.log('[SCHWAB] refresh-failed', JSON.stringify({
      userId,
      status: res.status,
      body: body.slice(0, 500),
    }));
    // DO NOT WIPE. DO NOT DELETE. Just throw and let caller handle it.
    throw new Error(`REFRESH_FAILED: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const newTokens: TokenPair = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || entry.tokens.refresh_token,
    expires_at: Date.now() + ((data.expires_in || 1800) * 1000) - 60000,
    token_type: data.token_type || 'Bearer',
  };

  await dbSaveTokens(userId, newTokens);
  cacheSet(userId, { tokens: newTokens });

  console.log('[SCHWAB] refresh-success', JSON.stringify({
    userId,
    expiresAt: new Date(newTokens.expires_at).toISOString(),
  }));

  return newTokens;
}

export async function exchangeCodeForTokens(code: string, userId?: string): Promise<TokenPair> {
  if (!userId) throw new Error('NO_USER_ID');

  const entry = await ensureLoaded(userId);
  if (!entry.credentials) throw new Error('NO_CREDENTIALS');

  let cleanCode = decodeURIComponent(code);
  if (!cleanCode.endsWith('@')) cleanCode += '@';

  console.log('[SCHWAB] oauth-exchange-start', JSON.stringify({
    userId,
    appKeyPrefix: entry.credentials.appKey.slice(0, 8) + '…',
    callbackUrl: entry.credentials.callbackUrl,
  }));

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${getBasicAuth(entry.credentials)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: cleanCode,
      redirect_uri: entry.credentials.callbackUrl,
    }),
  });

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch {}
    console.log('[SCHWAB] oauth-exchange-failed', JSON.stringify({
      userId,
      status: res.status,
      body: body.slice(0, 500),
    }));
    throw new Error(`OAUTH_EXCHANGE_FAILED: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const tokens: TokenPair = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + ((data.expires_in || 1800) * 1000) - 60000,
    token_type: data.token_type || 'Bearer',
  };

  await dbSaveTokens(userId, tokens);
  cacheSet(userId, { tokens });

  console.log('[SCHWAB] oauth-exchange-success', JSON.stringify({
    userId,
    expiresAt: new Date(tokens.expires_at).toISOString(),
  }));

  return tokens;
}

export async function getAuthorizationUrl(userId?: string): Promise<string> {
  if (!userId) throw new Error('NO_USER_ID');
  const entry = await ensureLoaded(userId);
  if (!entry.credentials) throw new Error('NO_CREDENTIALS');
  return `${SCHWAB_AUTH_URL}?client_id=${entry.credentials.appKey}&redirect_uri=${encodeURIComponent(entry.credentials.callbackUrl)}`;
}

export async function clearTokensBeforeReconnect(userId: string): Promise<void> {
  if (!userId) throw new Error('NO_USER_ID');
  await dbClearTokenFields(userId);
  cacheDelete(userId);
  console.log('[SCHWAB] tokens-cleared-before-reconnect', JSON.stringify({ userId }));
}

export async function saveUserCredentials(userId: string, appKey: string, appSecret: string): Promise<void> {
  if (!userId) throw new Error('NO_USER_ID');
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`;

  const { error } = await supabase
    .from('user_schwab_credentials')
    .upsert({
      user_id: userId,
      app_key: appKey,
      app_secret: appSecret,
      callback_url: callbackUrl,
      updated_at: new Date().toISOString(),
    });

  if (error) throw new Error(`DB_ERROR: ${error.message}`);

  cacheSet(userId, {
    credentials: { appKey, appSecret, callbackUrl },
  });

  console.log('[SCHWAB] credentials-saved', JSON.stringify({
    userId,
    appKeyPrefix: appKey.slice(0, 8) + '…',
  }));
}

export async function deleteUserCredentials(userId: string): Promise<void> {
  if (!userId) throw new Error('NO_USER_ID');
  await supabase.from('user_schwab_credentials').delete().eq('user_id', userId);
  cacheDelete(userId);
  console.log('[SCHWAB] credentials-deleted', JSON.stringify({ userId }));
}

export async function getTokenStatus(userId?: string): Promise<TokenStatus> {
  if (!userId) {
    return { connected: false, expiresAt: null, refreshExpiresEstimate: 'N/A', hasCredentials: false };
  }

  // Force reload for status checks — user is probably on Settings page
  cacheDelete(userId);
  const entry = await ensureLoaded(userId);

  const hasCreds = !!entry.credentials;
  const connected = !!(entry.tokens?.access_token && entry.tokens.expires_at > Date.now());
  const expiresAt = entry.tokens?.expires_at || null;

  return {
    connected,
    expiresAt,
    refreshExpiresEstimate: connected ? '~7 days from last auth' : 'N/A',
    hasCredentials: hasCreds,
  };
}

export async function clearTokens(userId?: string): Promise<void> {
  if (!userId) return;
  cacheDelete(userId);
}
