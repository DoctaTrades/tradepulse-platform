import { NextRequest, NextResponse } from 'next/server';
import { getTokenStatus, isAuthenticated, refreshAccessToken } from '@/app/lib/schwab-auth';
import { verifyAuth } from '@/app/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = await verifyAuth(req);
  try {
    const authenticated = await isAuthenticated(userId || undefined);
    const status = await getTokenStatus(userId || undefined);
    return NextResponse.json({ ...status, connected: authenticated });
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
