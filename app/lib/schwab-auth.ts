// Schwab OAuth token management — Per-User + Legacy support
// Per-user: credentials stored in Supabase `user_schwab_credentials`
// Per-user Schwab credentials only. Legacy env-var fallback removed in
// Session 5 along with the pr_tokens platform tokens table reads/writes.

import { supabase } from './supabase';

interface SchwabTokens {
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

// In-memory cache keyed by userId (or '__legacy__' for env-var flow)
const tokenCacheMap: Record<string, SchwabTokens | null> = {};
const credentialsCacheMap: Record<string, UserCredentials | null> = {};
const credentialsCacheTimestamps: Record<string, number> = {};
const cacheLoadedMap: Record<string, boolean> = {};

const SCHWAB_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize';
const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';
const LEGACY_KEY = '__legacy__';
const CREDENTIALS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — match token cache TTL

// ─── Credential Resolution ───────────────────────────────

async function getUserCredentials(userId: string): Promise<UserCredentials | null> {
  // TTL check: if cache is fresh, return cached; otherwise reload from DB.
  // Prevents stale credentials from persisting in memory after a user updates
  // their app_key/app_secret via Settings.
  const cached = credentialsCacheMap[userId];
  const cachedAt = credentialsCacheTimestamps[userId] || 0;
  const cacheAge = Date.now() - cachedAt;
  if (cached && cacheAge < CREDENTIALS_CACHE_TTL_MS) {
    return cached;
  }

  try {
    const { data, error } = await supabase
      .from('user_schwab_credentials')
      .select('app_key, app_secret, callback_url')
      .eq('user_id', userId)
      .single();

    if (error || !data?.app_key) {
      // Clear any stale cache entry if DB has nothing
      delete credentialsCacheMap[userId];
      delete credentialsCacheTimestamps[userId];
      return null;
    }

    const creds: UserCredentials = {
      appKey: data.app_key,
      appSecret: data.app_secret,
      callbackUrl: data.callback_url || `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`,
    };
    credentialsCacheMap[userId] = creds;
    credentialsCacheTimestamps[userId] = Date.now();
    return creds;
  } catch {
    return null;
  }
}

function getCredentials(userId?: string): UserCredentials {
  if (!userId) {
    throw new Error('No Schwab credentials available. Please add your Schwab API keys in Settings.');
  }
  const cached = credentialsCacheMap[userId];
  if (cached) return cached;
  throw new Error('No Schwab credentials available. Please add your Schwab API keys in Settings.');
}

function getBasicAuth(creds: UserCredentials): string {
  return Buffer.from(`${creds.appKey}:${creds.appSecret}`).toString('base64');
}

function getCacheKey(userId?: string): string {
  return userId || LEGACY_KEY;
}

// ─── Supabase Token Persistence ──────────────────────────

async function saveTokens(userId: string, tokens: SchwabTokens): Promise<void> {
  const key = getCacheKey(userId);
  tokenCacheMap[key] = tokens;

  try {
    await supabase
      .from('user_schwab_credentials')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_expires_at: tokens.expires_at,
        refresh_expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000),
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } catch (e) {
    console.error('Failed to save user tokens:', e);
  }
}

async function loadTokens(userId: string): Promise<SchwabTokens | null> {
  try {
    const { data, error } = await supabase
      .from('user_schwab_credentials')
      .select('access_token, refresh_token, access_expires_at')
      .eq('user_id', userId)
      .single();

    if (error || !data?.access_token) return null;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.access_expires_at,
      token_type: 'Bearer',
    };
  } catch { return null; }
}

async function clearTokensInternal(userId: string, clearDB = false): Promise<void> {
  const key = getCacheKey(userId);
  tokenCacheMap[key] = null;
  cacheLoadedMap[key] = false;

  // Only wipe DB tokens when explicitly requested (e.g. user disconnects)
  // Don't wipe on refresh failures — the refresh token may still be valid for a retry
  if (clearDB) {
    try {
      await supabase
        .from('user_schwab_credentials')
        .update({ access_token: null, refresh_token: null, access_expires_at: null, refresh_expires_at: null, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    } catch {}
  }
}

// ─── Ensure cache loaded (with TTL to handle multi-instance Vercel deployments) ─────

const cacheTimestamps: Record<string, number> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // Reload from DB every 5 minutes

async function ensureCacheLoaded(userId: string, forceReload = false): Promise<void> {
  const key = getCacheKey(userId);
  const now = Date.now();
  const cacheAge = now - (cacheTimestamps[key] || 0);
  
  // Skip reload if cache is fresh and not forced
  if (!forceReload && cacheLoadedMap[key] && cacheAge < CACHE_TTL_MS) return;
  
  await getUserCredentials(userId);
  tokenCacheMap[key] = await loadTokens(userId);
  cacheLoadedMap[key] = true;
  cacheTimestamps[key] = now;
}

// ─── Public API ─────────────────────────────────────────

export async function getAuthorizationUrl(userId?: string): Promise<string> {
  // Load per-user credentials from DB before reading from cache. Without this
  // async load, a cold serverless start falls through to legacy env-var credentials,
  // and the OAuth flow ends up using mismatched credentials between authorize and
  // token-exchange steps — causing subtle token corruption.
  if (userId) await getUserCredentials(userId);
  const creds = getCredentials(userId);
  return `${SCHWAB_AUTH_URL}?client_id=${creds.appKey}&redirect_uri=${encodeURIComponent(creds.callbackUrl)}`;
}

export async function exchangeCodeForTokens(code: string, userId?: string): Promise<SchwabTokens> {
  if (userId) await getUserCredentials(userId);
  const creds = getCredentials(userId);

  let cleanCode = decodeURIComponent(code);
  if (!cleanCode.endsWith('@')) cleanCode += '@';

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${getBasicAuth(creds)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: cleanCode,
      redirect_uri: creds.callbackUrl,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  const tokens: SchwabTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000) - 60000,
    token_type: data.token_type,
  };

  await saveTokens(userId, tokens);
  const key = getCacheKey(userId);
  tokenCacheMap[key] = tokens;
  cacheLoadedMap[key] = true;

  return tokens;
}

export async function refreshAccessToken(userId: string): Promise<SchwabTokens> {
  await ensureCacheLoaded(userId);
  const key = getCacheKey(userId);
  let cached = tokenCacheMap[key];
  
  // If no refresh token in cache, try reloading from DB (another serverless instance may have updated it)
  if (!cached?.refresh_token) {
    cacheLoadedMap[key] = false;
    await ensureCacheLoaded(userId);
    cached = tokenCacheMap[key];
  }
  if (!cached?.refresh_token) throw new Error('No refresh token available');

  await getUserCredentials(userId);
  const creds = getCredentials(userId);

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${getBasicAuth(creds)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cached.refresh_token,
    }),
  });

  if (!res.ok) {
    // Observability: log metadata when Schwab rejects a refresh. Prefixes and
    // lengths help diagnose credential/token mismatches without leaking secrets.
    try {
      const errBody = await res.clone().text();
      console.log('[SCHWAB-AUTH] refresh-rejected', JSON.stringify({
        userId: userId || 'none',
        status: res.status,
        body: errBody.slice(0, 500),
        appKeyPrefix: creds.appKey.slice(0, 8) + '…',
        appKeyLen: creds.appKey.length,
        refreshTokenPrefix: cached.refresh_token.slice(0, 12) + '…',
        refreshTokenLen: cached.refresh_token.length,
        callbackUrl: creds.callbackUrl,
      }));
    } catch {}
    // Before clearing, try reloading from DB — a fresh token may have been saved by another instance
    cacheLoadedMap[key] = false;
    const freshTokens = await loadTokens(userId);
    if (freshTokens && freshTokens.refresh_token && freshTokens.refresh_token !== cached.refresh_token) {
      // DB has a newer token — retry refresh with it
      tokenCacheMap[key] = freshTokens;
      const retryRes = await fetch(SCHWAB_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${getBasicAuth(creds)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: freshTokens.refresh_token,
        }),
      });
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const retryTokens: SchwabTokens = {
          access_token: retryData.access_token,
          refresh_token: retryData.refresh_token || freshTokens.refresh_token,
          expires_at: Date.now() + (retryData.expires_in * 1000) - 60000,
          token_type: retryData.token_type,
        };
        await saveTokens(userId, retryTokens);
        tokenCacheMap[key] = retryTokens;
        return retryTokens;
      }
    }
    // Read Schwab's response body so we can decide if this is a permanent or transient failure
    let schwabErrBody = '';
    try { schwabErrBody = await res.clone().text(); } catch {}

    // Log the failure for observability (server-side only)
    console.log('[SCHWAB-AUTH-DIAG] refresh-call-failed', JSON.stringify({
      userId: userId || 'none',
      status: res.status,
      body: schwabErrBody.slice(0, 300),
    }));

    // ─── PERMANENT-DEATH DETECTION (Fix 1) ──────────────────────────────────
    // These Schwab error codes mean the refresh token or credentials are dead.
    // Retrying them will never succeed, so we wipe the DB tokens to break out
    // of refresh loops and allow the UI to surface a "please reconnect" state.
    const bodyLower = schwabErrBody.toLowerCase();
    const isPermanentlyDead =
      res.status === 400 && (
        bodyLower.includes('invalid_grant') ||
        bodyLower.includes('invalid_client') ||
        bodyLower.includes('unsupported_token_type') ||
        bodyLower.includes('failed refresh token authentication')
      );

    if (isPermanentlyDead) {
      // Wipe DB + cache. Next isAuthenticated() call returns false, UI can react.
      console.log('[SCHWAB-AUTH] token permanently dead per Schwab — wiping DB tokens', JSON.stringify({
        userId: userId || 'none', status: res.status,
      }));
      await clearTokensInternal(userId, true /* clearDB */);
      throw new Error('Token refresh failed: credentials rejected by Schwab. Please reconnect.');
    }

    // Transient failure — clear in-memory cache only, leave DB alone so a retry
    // on a future request can try again.
    await clearTokensInternal(userId, false);
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  const tokens: SchwabTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || cached.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000) - 60000,
    token_type: data.token_type,
  };

  await saveTokens(userId, tokens);
  tokenCacheMap[key] = tokens;
  return tokens;
}

export async function getValidAccessToken(userId?: string): Promise<string> {
  if (!userId) throw new Error('NOT_AUTHENTICATED');
  await ensureCacheLoaded(userId);
  const key = getCacheKey(userId);
  let cached = tokenCacheMap[key];
  if (!cached) throw new Error('NOT_AUTHENTICATED');

  if (Date.now() >= cached.expires_at - 120000) {
    // Token expired or near-expiry — reload from DB first (another instance may have refreshed it)
    await ensureCacheLoaded(userId, true);
    cached = tokenCacheMap[key];
    if (!cached) throw new Error('NOT_AUTHENTICATED');
    
    // If still expired after DB reload, do the actual refresh
    if (Date.now() >= cached.expires_at - 120000) {
      await refreshAccessToken(userId);
    }
  }

  return tokenCacheMap[key]!.access_token;
}

export async function isAuthenticated(userId?: string): Promise<boolean> {
  if (!userId) return false;
  try {
    await getValidAccessToken(userId);
    return true;
  } catch {
    return false;
  }
}

export async function getTokenStatus(userId?: string): Promise<{ connected: boolean; expiresAt: number | null; refreshExpiresEstimate: string; hasCredentials: boolean }> {
  if (!userId) {
    return { connected: false, expiresAt: null, refreshExpiresEstimate: 'N/A', hasCredentials: false };
  }
  await ensureCacheLoaded(userId, true); // Always reload from DB for status checks
  const key = getCacheKey(userId);
  const cached = tokenCacheMap[key];
  const hasUserCreds = !!(await getUserCredentials(userId));

  if (!cached || !cached.access_token) {
    return { connected: false, expiresAt: null, refreshExpiresEstimate: 'N/A', hasCredentials: hasUserCreds };
  }
  return { connected: true, expiresAt: cached.expires_at, refreshExpiresEstimate: '~7 days from last auth', hasCredentials: hasUserCreds };
}

// ─── User Credential Management ─────────────────────────

export async function saveUserCredentials(userId: string, appKey: string, appSecret: string): Promise<void> {
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

  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
  credentialsCacheMap[userId] = { appKey, appSecret, callbackUrl };
  credentialsCacheTimestamps[userId] = Date.now();
}

export async function deleteUserCredentials(userId: string): Promise<void> {
  await clearTokensInternal(userId);
  delete credentialsCacheMap[userId];
  delete credentialsCacheTimestamps[userId];
  await supabase.from('user_schwab_credentials').delete().eq('user_id', userId);
}

/**
 * Clear token fields (access_token, refresh_token, expiries) for a user BEFORE
 * starting a fresh OAuth flow. Leaves app_key, app_secret, and callback_url intact.
 *
 * This makes the Reconnect flow idempotent and recovery-safe: every reconnect
 * starts from a known clean state, so stale tokens from a previous failed OAuth
 * attempt can't conflict with the tokens about to be written.
 *
 * Also clears the in-memory cache so the next request on this serverless instance
 * will re-read from DB (which will be empty until OAuth completes).
 */
export async function clearTokensBeforeReconnect(userId: string): Promise<void> {
  // Wipe DB tokens for this user
  try {
    await supabase
      .from('user_schwab_credentials')
      .update({
        access_token: null,
        refresh_token: null,
        access_expires_at: null,
        refresh_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } catch (e) {
    console.error('[SCHWAB-AUTH] clearTokensBeforeReconnect DB update failed:', e);
    throw e;
  }
  // Clear in-memory cache for this user
  const key = getCacheKey(userId);
  tokenCacheMap[key] = null;
  cacheLoadedMap[key] = false;
  delete cacheTimestamps[key];
}

export async function hasUserCredentials(userId: string): Promise<boolean> {
  return !!(await getUserCredentials(userId));
}

export async function clearTokens(userId: string) {
  await clearTokensInternal(userId);
}
