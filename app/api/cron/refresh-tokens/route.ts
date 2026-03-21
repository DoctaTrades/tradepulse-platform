import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken, getTokenStatus } from '@/app/lib/schwab-auth';
import { supabase } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

// This endpoint is called by Vercel Cron to keep ALL Schwab tokens alive.
// It refreshes both the legacy/admin tokens and every individual user's tokens.
// Runs every 6 hours so refresh tokens (~7 day lifetime) stay exercised.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
