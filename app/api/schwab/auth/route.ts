import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizationUrl, clearTokensBeforeReconnect } from '@/app/lib/schwab-auth';
import { verifyAuth } from '@/app/lib/auth-helpers';

// POST /api/schwab/auth
// Returns the OAuth start URL for the *authenticated* user.
// Previously this was a GET that accepted ?userId=... as a query param,
// which let any caller initiate an OAuth flow "as" any user (and wipe
// their tokens via clearTokensBeforeReconnect). The new flow requires
// a Bearer JWT — the userId is derived from the verified token, never
// from the request body or query string.
//
// The 'schwab_auth_user' cookie is set on this response so that when
// the user is later redirected to /api/schwab/callback by Schwab, the
// callback knows which TradePulse user to associate the new tokens with.

export async function POST(req: NextRequest) {
  try {
    const { userId } = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Wipe stale tokens before starting OAuth so a half-written state
    // from a prior failed OAuth can't conflict with the new tokens.
    // Preserves app_key/app_secret — only clears the token fields.
    try {
      await clearTokensBeforeReconnect(userId);
    } catch (e) {
      console.error('[SCHWAB-AUTH] pre-reconnect wipe failed:', e);
      // Non-fatal — still attempt the OAuth flow
    }

    const authUrl = await getAuthorizationUrl(userId);

    const response = NextResponse.json({ authUrl });
    response.cookies.set('schwab_auth_user', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300, // 5 minutes — enough to complete OAuth
      path: '/',
    });
    return response;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
