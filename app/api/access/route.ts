import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { verifyAuth } from '@/app/lib/auth-helpers';

// Cutoff: users created before this date are grandfathered in
const GRANDFATHER_CUTOFF = '2026-04-22T23:59:59Z';

// Valid access codes
const VALID_CODES = ['BETA-26'];

export async function POST(req: NextRequest) {
  const { userId: authUserId } = await verifyAuth(req);
  if (!authUserId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action } = body;

  try {
    // ═══ CHECK: Does this user have access? ═══
    if (action === 'check') {
      // 1. Check user_access table
      const { data: access } = await supabase
        .from('user_access')
        .select('*')
        .eq('user_id', authUserId)
        .single();

      if (access) {
        return NextResponse.json({ hasAccess: true, method: 'code' });
      }

      // 2. Check if user is grandfathered (account created before cutoff)
      const { data: { user } } = await supabase.auth.admin.getUserById(authUserId);
      if (user?.created_at && new Date(user.created_at) < new Date(GRANDFATHER_CUTOFF)) {
        // Auto-grant access — grandfather them in
        await supabase.from('user_access').upsert({
          user_id: authUserId,
          access_code: 'GRANDFATHERED',
          email: user.email || '',
          activated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        return NextResponse.json({ hasAccess: true, method: 'grandfathered' });
      }

      // 3. No access
      return NextResponse.json({ hasAccess: false });
    }

    // ═══ VALIDATE: Check an access code and grant access ═══
    if (action === 'validate') {
      const { code } = body;
      if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
      }

      const normalizedCode = code.trim().toUpperCase();
      if (!VALID_CODES.includes(normalizedCode)) {
        return NextResponse.json({ valid: false, error: 'Invalid access code' });
      }

      // Get user email for tracking
      const { data: { user } } = await supabase.auth.admin.getUserById(authUserId);

      // Grant access
      const { error } = await supabase.from('user_access').upsert({
        user_id: authUserId,
        access_code: normalizedCode,
        email: user?.email || '',
        activated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (error) {
        return NextResponse.json({ valid: false, error: `Database error: ${error.message}` }, { status: 500 });
      }

      return NextResponse.json({ valid: true, message: 'Access granted' });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (e: any) {
    console.error('Access API error:', e);
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
