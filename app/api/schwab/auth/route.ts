import { NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/app/lib/schwab-auth';

export async function GET() {
  try {
    const authUrl = getAuthorizationUrl();
    return NextResponse.redirect(authUrl);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : "Unknown error") }, { status: 500 });
  }
}
