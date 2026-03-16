import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/app/lib/schwab-auth';

export async function GET(req: NextRequest) {
  try {
    // userId passed as query param — used to look up that user's App Key
    const userId = req.nextUrl.searchParams.get('userId') || undefined;
    const authUrl = getAuthorizationUrl(userId);

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
