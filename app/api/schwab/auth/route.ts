import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizationUrl, clearTokensBeforeReconnect } from '@/app/lib/schwab-auth';

export async function GET(req: NextRequest) {
  try {
    // userId passed as query param — used to look up that user's App Key
    const userId = req.nextUrl.searchParams.get('userId') || undefined;

    // ─── Fix 2: Wipe stale tokens before starting OAuth ─────────────────────
    // Ensures every reconnect starts from a clean slate so a half-written
    // state from a prior failed OAuth can't conflict with the new tokens.
    // Preserves app_key/app_secret — only clears the token fields.
    if (userId) {
      try {
        await clearTokensBeforeReconnect(userId);
      } catch (e) {
        console.error('[SCHWAB-AUTH] pre-reconnect wipe failed:', e);
        // Non-fatal — still attempt the OAuth flow
      }
    }

    const authUrl = await getAuthorizationUrl(userId);

    // Store userId in a cookie so the callback knows which user to associate tokens with
    const response = NextResponse.redirect(authUrl);
    if (userId) {
      response.cookies.set('schwab_auth_user', userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 300, // 5 minutes — enough to complete OAuth
        path: '/',
      });
    }
    return response;
  } catch (e: unknown) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${appUrl}?schwab_error=${encodeURIComponent((e instanceof Error ? e.message : "Unknown error"))}`);
  }
}
