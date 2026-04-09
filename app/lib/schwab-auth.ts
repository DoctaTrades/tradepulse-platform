// Schwab OAuth token management — Per-User + Legacy support
// Per-user: credentials stored in Supabase `user_schwab_credentials`
// Legacy fallback: env vars SCHWAB_APP_KEY / SCHWAB_APP_SECRET (for admin/owner)

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
const cacheLoadedMap: Record<string, boolean> = {};

const SCHWAB_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize';
const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';
const LEGACY_KEY = '__legacy__';

// ─── Credential Resolution ───────────────────────────────

function getLegacyCredentials(): UserCredentials | null {
  const appKey = process.env.SCHWAB_APP_KEY;
  const appSecret = process.env.SCHWAB_APP_SECRET;
  if (!appKey || !appSecret) return null;
  const callbackUrl = process.env.SCHWAB_CALLBACK_URL || `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`;
  return { appKey, appSecret, callbackUrl };
}

async function getUserCredentials(userId: string): Promise<UserCredentials | null> {
  if (credentialsCacheMap[userId]) return credentialsCacheMap[userId];

  try {
    const { data, error } = await supabase
      .from('user_schwab_credentials')
      .select('app_key, app_secret, callback_url')
      .eq('user_id', userId)
      .single();

    if (error || !data?.app_key) return null;

    const creds: UserCredentials = {
      appKey: data.app_key,
      appSecret: data.app_secret,
      callbackUrl: data.callback_url || `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`,
    };
    credentialsCacheMap[userId] = creds;
    return creds;
  } catch {
    return null;
  }
}

function getCredentials(userId?: string): UserCredentials {
  if (userId && credentialsCacheMap[userId]) return credentialsCacheMap[userId]!;
  const legacy = getLegacyCredentials();
  if (legacy) return legacy;
  throw new Error('No Schwab credentials available. Please add your Schwab API keys in Settings.');
}

function getBasicAuth(creds: UserCredentials): string {
  return Buffer.from(`${creds.appKey}:${creds.appSecret}`).toString('base64');
}

function getCacheKey(userId?: string): string {
  return userId || LEGACY_KEY;
}

// ─── Supabase Token Persistence ──────────────────────────

async function saveTokens(userId: string | undefined, tokens: SchwabTokens): Promise<void> {
  const key = getCacheKey(userId);
  tokenCacheMap[key] = tokens;

  if (userId) {
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
  } else {
    try {
      await supabase
        .from('pr_tokens')
        .upsert({
          id: 'schwab_tokens',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          access_expires_at: tokens.expires_at,
          refresh_expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000),
          updated_at: new Date().toISOString(),
        });
    } catch (e) {
      console.error('Failed to save legacy tokens:', e);
    }
  }
}

async function loadTokens(userId?: string): Promise<SchwabTokens | null> {
  if (userId) {
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
  } else {
    try {
      const { data, error } = await supabase
        .from('pr_tokens')
        .select('*')
        .eq('id', 'schwab_tokens')
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
}

async function clearTokensInternal(userId?: string, clearDB = false): Promise<void> {
  const key = getCacheKey(userId);
  tokenCacheMap[key] = null;
  cacheLoadedMap[key] = false;

  // Only wipe DB tokens when explicitly requested (e.g. user disconnects)
  // Don't wipe on refresh failures — the refresh token may still be valid for a retry
  if (clearDB) {
    if (userId) {
      try {
        await supabase
          .from('user_schwab_credentials')
          .update({ access_token: null, refresh_token: null, access_expires_at: null, refresh_expires_at: null, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } catch {}
    } else {
      try {
        await supabase
          .from('pr_tokens')
          .upsert({ id: 'schwab_tokens', access_token: null, refresh_token: null, access_expires_at: null, refresh_expires_at: null, updated_at: new Date().toISOString() });
      } catch {}
    }
  }
}

// ─── Ensure cache loaded (with TTL to handle multi-instance Vercel deployments) ─────

const cacheTimestamps: Record<string, number> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // Reload from DB every 5 minutes

async function ensureCacheLoaded(userId?: string, forceReload = false): Promise<void> {
  const key = getCacheKey(userId);
  const now = Date.now();
  const cacheAge = now - (cacheTimestamps[key] || 0);
  
  // Skip reload if cache is fresh and not forced
  if (!forceReload && cacheLoadedMap[key] && cacheAge < CACHE_TTL_MS) return;
  
  if (userId) await getUserCredentials(userId);
  tokenCacheMap[key] = await loadTokens(userId);
  cacheLoadedMap[key] = true;
  cacheTimestamps[key] = now;
}

// ─── Public API ─────────────────────────────────────────

export function getAuthorizationUrl(userId?: string): string {
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
  // Also save to legacy pr_tokens so dashboard/sectors routes (which don't have userId) can access tokens
  if (userId) {
    await saveTokens(undefined, tokens);
    const legacyKey = getCacheKey(undefined);
    tokenCacheMap[legacyKey] = tokens;
    cacheLoadedMap[legacyKey] = true;
  }
  const key = getCacheKey(userId);
  tokenCacheMap[key] = tokens;
  cacheLoadedMap[key] = true;

  return tokens;
}

export async function refreshAccessToken(userId?: string): Promise<SchwabTokens> {
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

  if (userId) await getUserCredentials(userId);
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
    // ─── DIAGNOSTIC LOGGING ─── (temporary — remove after auth cleanup)
    try {
      const errBody = await res.clone().text();
      console.log('[SCHWAB-AUTH-DIAG] refresh-call-failed', JSON.stringify({
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
        if (userId) {
          await saveTokens(undefined, retryTokens);
          tokenCacheMap[getCacheKey(undefined)] = retryTokens;
        }
        tokenCacheMap[key] = retryTokens;
        return retryTokens;
      }
    }
    // Truly expired — clear and throw
    await clearTokensInternal(userId);
    // TEMP: include Schwab's response body in the error so we can diagnose
    let schwabErrBody = '';
    try { schwabErrBody = await res.clone().text(); } catch {}
    throw new Error(`Token refresh failed: ${res.status} — Schwab said: ${schwabErrBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const tokens: SchwabTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || cached.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000) - 60000,
    token_type: data.token_type,
  };

  await saveTokens(userId, tokens);
  // Keep legacy pr_tokens in sync for dashboard/sectors routes
  if (userId) {
    await saveTokens(undefined, tokens);
    const legacyKey = getCacheKey(undefined);
    tokenCacheMap[legacyKey] = tokens;
  }
  tokenCacheMap[key] = tokens;
  return tokens;
}

export async function getValidAccessToken(userId?: string): Promise<string> {
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
  try {
    await getValidAccessToken(userId);
    return true;
  } catch {
    return false;
  }
}

export async function getTokenStatus(userId?: string): Promise<{ connected: boolean; expiresAt: number | null; refreshExpiresEstimate: string; hasCredentials: boolean }> {
  await ensureCacheLoaded(userId, true); // Always reload from DB for status checks
  const key = getCacheKey(userId);
  const cached = tokenCacheMap[key];
  const hasUserCreds = userId ? !!(await getUserCredentials(userId)) : !!getLegacyCredentials();

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
}

export async function deleteUserCredentials(userId: string): Promise<void> {
  await clearTokensInternal(userId);
  delete credentialsCacheMap[userId];
  await supabase.from('user_schwab_credentials').delete().eq('user_id', userId);
}

export async function hasUserCredentials(userId: string): Promise<boolean> {
  return !!(await getUserCredentials(userId));
}

export async function clearTokens(userId?: string) {
  await clearTokensInternal(userId);
}
