import { NextResponse } from 'next/server';
import { getTokenStatus, isAuthenticated, refreshAccessToken } from '@/app/lib/schwab-auth';

export async function GET() {
  return NextResponse.json(await getTokenStatus());
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
