import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/app/lib/schwab-auth';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!code) {
    return NextResponse.redirect(`${appUrl}?schwab_error=no_code`);
  }

  try {
    await exchangeCodeForTokens(code);
    return NextResponse.redirect(`${appUrl}?schwab_connected=true`);
  } catch (e: unknown) {
    console.error('Schwab callback error:', e);
    return NextResponse.redirect(`${appUrl}?schwab_error=${encodeURIComponent((e instanceof Error ? e.message : "Unknown error"))}`);
  }
}
