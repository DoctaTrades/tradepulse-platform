import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/app/lib/schwab-auth';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!code) {
    return NextResponse.redirect(`${appUrl}?schwab_error=no_code`);
  }

  // Read userId from cookie (set by auth route)
  const userId = req.cookies.get('schwab_auth_user')?.value || undefined;

  try {
    await exchangeCodeForTokens(code, userId);

    // Clear the auth cookie
    const response = NextResponse.redirect(`${appUrl}?schwab_connected=true`);
    response.cookies.delete('schwab_auth_user');
    return response;
  } catch (e: unknown) {
    console.error('Schwab callback error:', e);
    return NextResponse.redirect(`${appUrl}?schwab_error=${encodeURIComponent((e instanceof Error ? e.message : "Unknown error"))}`);
  }
}
