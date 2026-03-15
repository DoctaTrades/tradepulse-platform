// Schwab OAuth token management
// Tokens persisted in Supabase (survive redeploys)
// In-memory cache for fast access during a session

import { supabase } from './supabase';

interface SchwabTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp
  token_type: string;
}

// In-memory cache (fast reads, populated from Supabase on first check)
let tokenCache: SchwabTokens | null = null;
let cacheLoaded = false;

const TOKEN_ROW_ID = 'schwab_tokens';
const SCHWAB_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize';
const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';

function getCredentials() {
  const appKey = process.env.SCHWAB_APP_KEY;
  const appSecret = process.env.SCHWAB_APP_SECRET;
  const callbackUrl = process.env.SCHWAB_CALLBACK_URL || `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`;
  if (!appKey || !appSecret) throw new Error('SCHWAB_APP_KEY and SCHWAB_APP_SECRET must be set');
  return { appKey, appSecret, callbackUrl };
}

function getBasicAuth(): string {
  const { appKey, appSecret } = getCredentials();
  return Buffer.from(`${appKey}:${appSecret}`).toString('base64');
}

// ─── Supabase persistence ───────────────────────────────

async function saveTokensToSupabase(tokens: SchwabTokens): Promise<void> {
  try {
    const { error } = await supabase
      .from('pr_tokens')
      .upsert({
        id: TOKEN_ROW_ID,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_expires_at: tokens.expires_at,
        refresh_expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000), // ~7 days from now
        updated_at: new Date().toISOString(),
      });
    if (error) console.error('Supabase save error:', error.message);
    else console.log('Tokens saved to Supabase');
  } catch (e) {
    console.error('Failed to save tokens to Supabase:', e);
  }
}

async function loadTokensFromSupabase(): Promise<SchwabTokens | null> {
  try {
    const { data, error } = await supabase
      .from('pr_tokens')
      .select('*')
      .eq('id', TOKEN_ROW_ID)
      .single();

    if (error || !data?.access_token) return null;

    const tokens: SchwabTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.access_expires_at,
      token_type: 'Bearer',
    };

    console.log('Tokens loaded from Supabase');
    return tokens;
  } catch (e) {
    console.error('Failed to load tokens from Supabase:', e);
    return null;
  }
}

async function clearTokensFromSupabase(): Promise<void> {
  try {
    await supabase
      .from('pr_tokens')
      .upsert({
        id: TOKEN_ROW_ID,
        access_token: null,
        refresh_token: null,
        access_expires_at: null,
        refresh_expires_at: null,
        updated_at: new Date().toISOString(),
      });
  } catch (e) {
    console.error('Failed to clear tokens from Supabase:', e);
  }
}

// ─── Ensure cache is loaded ─────────────────────────────

async function ensureCacheLoaded(): Promise<void> {
  if (cacheLoaded) return;
  tokenCache = await loadTokensFromSupabase();
  cacheLoaded = true;
}

// ─── Public API ─────────────────────────────────────────

export function getAuthorizationUrl(): string {
  const { appKey, callbackUrl } = getCredentials();
  return `${SCHWAB_AUTH_URL}?client_id=${appKey}&redirect_uri=${encodeURIComponent(callbackUrl)}`;
}

export async function exchangeCodeForTokens(code: string): Promise<SchwabTokens> {
  const { callbackUrl } = getCredentials();
  
  let cleanCode = decodeURIComponent(code);
  if (!cleanCode.endsWith('@')) cleanCode += '@';

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${getBasicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: cleanCode,
      redirect_uri: callbackUrl,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Token exchange failed:', res.status, err);
    throw new Error(`Token exchange failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  tokenCache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000) - 60000,
    token_type: data.token_type,
  };
  cacheLoaded = true;

  // Persist to Supabase
  await saveTokensToSupabase(tokenCache);

  console.log('Schwab tokens acquired and saved');
  return tokenCache;
}

export async function refreshAccessToken(): Promise<SchwabTokens> {
  await ensureCacheLoaded();
  if (!tokenCache?.refresh_token) throw new Error('No refresh token available');

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${getBasicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenCache.refresh_token,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Token refresh failed:', res.status, err);
    tokenCache = null;
    await clearTokensFromSupabase();
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  tokenCache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokenCache.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000) - 60000,
    token_type: data.token_type,
  };

  // Persist refreshed tokens
  await saveTokensToSupabase(tokenCache);

  return tokenCache;
}

export async function getValidAccessToken(): Promise<string> {
  await ensureCacheLoaded();
  if (!tokenCache) throw new Error('NOT_AUTHENTICATED');
  
  // Auto-refresh if expired or within 2 minutes of expiry
  if (Date.now() >= tokenCache.expires_at - 120000) {
    console.log('Access token expired/expiring, refreshing...');
    await refreshAccessToken();
  }

  return tokenCache.access_token;
}

export async function isAuthenticated(): Promise<boolean> {
  await ensureCacheLoaded();
  return tokenCache !== null && tokenCache.access_token !== null;
}

export async function getTokenStatus(): Promise<{ connected: boolean; expiresAt: number | null; refreshExpiresEstimate: string }> {
  await ensureCacheLoaded();
  if (!tokenCache || !tokenCache.access_token) return { connected: false, expiresAt: null, refreshExpiresEstimate: 'N/A' };
  return {
    connected: true,
    expiresAt: tokenCache.expires_at,
    refreshExpiresEstimate: '~7 days from last auth',
  };
}

export async function clearTokens() {
  tokenCache = null;
  cacheLoaded = false;
  await clearTokensFromSupabase();
}
