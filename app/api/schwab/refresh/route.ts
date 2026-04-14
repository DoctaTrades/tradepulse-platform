import { NextRequest, NextResponse } from 'next/server';
import { getTokenStatus, isAuthenticated, hasSchwabConnection, refreshAccessToken } from '@/app/lib/schwab-auth';
import { verifyAuth } from '@/app/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = await verifyAuth(req);
  try {
    // UI status semantics:
    //   connected = true  → user has a working Schwab connection (even if the
    //                       access token is temporarily expired; it'll auto-refresh
    //                       on the next API call)
    //   connected = false → either no credentials saved, or the refresh token
    //                       itself has expired (past the ~7-day Schwab window)
    //                       and the user needs to manually reconnect
    //
    // We do NOT use isAuthenticated here because it's too strict — it returns
    // false when the access token is briefly expired, which would make the UI
    // flash "disconnected" constantly even though the backend auto-refreshes
    // transparently. hasSchwabConnection matches the backend route auth gate
    // semantics and tracks the user's actual ability to talk to Schwab.
    const connected = await hasSchwabConnection(userId || undefined);
    const status = await getTokenStatus(userId || undefined);
    return NextResponse.json({ ...status, connected });
  } catch {
    return NextResponse.json({ connected: false, expiresAt: null, refreshExpiresEstimate: 'N/A', hasCredentials: false });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await verifyAuth(req);
  try {
    if (!await isAuthenticated(userId || undefined)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    await refreshAccessToken(userId || undefined);
    return NextResponse.json({ success: true, ...await getTokenStatus(userId || undefined) });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : "Unknown error") }, { status: 500 });
  }
}
