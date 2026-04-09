import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken, getTokenStatus } from '@/app/lib/schwab-auth';
import { supabase } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

// This endpoint is called by Vercel Cron to keep ALL Schwab tokens alive.
// It refreshes both the legacy/admin tokens and every individual user's tokens.
// Runs daily per vercel.json schedule. Schwab refresh tokens have ~7-day
// lifetime, so daily exercise keeps them well within the safety margin.
//
// AUTH: Requires CRON_SECRET env var to be set in Vercel. Vercel's cron
// runner automatically sends `Authorization: Bearer <CRON_SECRET>` when it
// calls this endpoint, provided CRON_SECRET is defined in the project's
// environment variables. If CRON_SECRET is not set, ALL requests are
// rejected (fail-closed). Previous implementation was fail-open when
// CRON_SECRET was absent, which left this endpoint publicly callable.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // Fail-closed: if CRON_SECRET is not configured, refuse all requests.
    return NextResponse.json(
      { error: 'Cron auth not configured. Set CRON_SECRET in Vercel env vars.' },
      { status: 503 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: { id: string; status: string; error?: string }[] = [];

  // 1. Refresh legacy/admin tokens (pr_tokens)
  try {
    const legacyStatus = await getTokenStatus();
    if (legacyStatus.connected) {
      await refreshAccessToken();
      results.push({ id: 'legacy', status: 'refreshed' });
    } else {
      results.push({ id: 'legacy', status: 'skipped — no tokens' });
    }
  } catch (e: any) {
    results.push({ id: 'legacy', status: 'failed', error: e.message });
  }

  // 2. Refresh all per-user tokens
  try {
    const { data: users, error } = await supabase
      .from('user_schwab_credentials')
      .select('user_id, access_token, refresh_token')
      .not('refresh_token', 'is', null);

    if (!error && users && users.length > 0) {
      for (const user of users) {
        if (!user.refresh_token) continue;
        try {
          await refreshAccessToken(user.user_id);
          results.push({ id: user.user_id, status: 'refreshed' });
        } catch (e: any) {
          results.push({ id: user.user_id, status: 'failed', error: e.message });
        }
      }
    }
  } catch (e: any) {
    results.push({ id: 'user-query', status: 'failed', error: e.message });
  }

  const refreshed = results.filter(r => r.status === 'refreshed').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return NextResponse.json({
    summary: `${refreshed} refreshed, ${failed} failed, ${results.length} total`,
    results,
    timestamp: new Date().toISOString(),
  });
}
