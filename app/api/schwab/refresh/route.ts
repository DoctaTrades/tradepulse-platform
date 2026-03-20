import { NextResponse } from 'next/server';
import { getTokenStatus, isAuthenticated, refreshAccessToken } from '@/app/lib/schwab-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Try to validate and refresh the token, then return status
  try {
    const authenticated = await isAuthenticated();
    const status = await getTokenStatus();
    return NextResponse.json({ ...status, connected: authenticated });
  } catch {
    return NextResponse.json({ connected: false, expiresAt: null, refreshExpiresEstimate: 'N/A', hasCredentials: false });
  }
}

export async function POST() {
  try {
    if (!await isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    await refreshAccessToken();
    return NextResponse.json({ success: true, ...await getTokenStatus() });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : "Unknown error") }, { status: 500 });
  }
}
