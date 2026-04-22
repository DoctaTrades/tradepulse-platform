import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { verifyAuth } from '@/app/lib/auth-helpers';

// Cutoff: users created before this date are grandfathered in
const GRANDFATHER_CUTOFF = '2026-04-22T23:59:59Z';

// Admin user IDs — only these users can manage access codes
const ADMIN_IDS = ['a4f7c71e-95bc-43f9-bbfd-108f1feb6f48'];

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
  const isAdmin = ADMIN_IDS.includes(authUserId);

  try {
    // ═══ CHECK: Does this user have access? ═══
    if (action === 'check') {
      if (isAdmin) {
        return NextResponse.json({ hasAccess: true, method: 'admin', isAdmin: true });
      }

      const { data: access } = await supabase
        .from('user_access')
        .select('*')
        .eq('user_id', authUserId)
        .single();

      if (access) {
        return NextResponse.json({ hasAccess: true, method: 'code' });
      }

      const { data: { user } } = await supabase.auth.admin.getUserById(authUserId);
      if (user?.created_at && new Date(user.created_at) < new Date(GRANDFATHER_CUTOFF)) {
        await supabase.from('user_access').upsert({
          user_id: authUserId,
          access_code: 'GRANDFATHERED',
          email: user.email || '',
          activated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        return NextResponse.json({ hasAccess: true, method: 'grandfathered' });
      }

      return NextResponse.json({ hasAccess: false });
    }

    // ═══ VALIDATE: Check an access code and grant access ═══
    if (action === 'validate') {
      const { code } = body;
      if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
      }

      const normalizedCode = code.trim().toUpperCase();

      const { data: codeRecord } = await supabase
        .from('access_codes')
        .select('*')
        .eq('code', normalizedCode)
        .eq('active', true)
        .single();

      if (!codeRecord) {
        return NextResponse.json({ valid: false, error: 'Invalid access code' });
      }

      if (codeRecord.max_uses > 0 && codeRecord.use_count >= codeRecord.max_uses) {
        return NextResponse.json({ valid: false, error: 'This code has reached its usage limit' });
      }

      const { data: { user } } = await supabase.auth.admin.getUserById(authUserId);

      const { error } = await supabase.from('user_access').upsert({
        user_id: authUserId,
        access_code: normalizedCode,
        email: user?.email || '',
        activated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (error) {
        return NextResponse.json({ valid: false, error: `Database error: ${error.message}` }, { status: 500 });
      }

      await supabase
        .from('access_codes')
        .update({ use_count: (codeRecord.use_count || 0) + 1 })
        .eq('id', codeRecord.id);

      return NextResponse.json({ valid: true, message: 'Access granted' });
    }

    // ═══════════════════════════════════════════════════════════
    // ADMIN-ONLY ACTIONS
    // ═══════════════════════════════════════════════════════════

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (action === 'admin_list_codes') {
      const { data: codes } = await supabase
        .from('access_codes')
        .select('*')
        .order('created_at', { ascending: false });

      return NextResponse.json({ codes: codes || [] });
    }

    if (action === 'admin_create_code') {
      const { code, label, maxUses } = body;
      if (!code) return NextResponse.json({ error: 'Code is required' }, { status: 400 });

      const { data, error } = await supabase
        .from('access_codes')
        .insert({
          code: code.trim().toUpperCase(),
          label: label || '',
          max_uses: maxUses || 0,
          use_count: 0,
          active: true,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') return NextResponse.json({ error: 'Code already exists' }, { status: 400 });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, code: data });
    }

    if (action === 'admin_toggle_code') {
      const { codeId, active } = body;
      if (!codeId) return NextResponse.json({ error: 'codeId required' }, { status: 400 });

      const { error } = await supabase
        .from('access_codes')
        .update({ active: !!active })
        .eq('id', codeId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'admin_delete_code') {
      const { codeId } = body;
      if (!codeId) return NextResponse.json({ error: 'codeId required' }, { status: 400 });

      const { error } = await supabase
        .from('access_codes')
        .delete()
        .eq('id', codeId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'admin_list_users') {
      const { data: users } = await supabase
        .from('user_access')
        .select('*')
        .order('activated_at', { ascending: false });

      return NextResponse.json({ users: users || [] });
    }

    if (action === 'admin_revoke_user') {
      const { userId } = body;
      if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

      if (ADMIN_IDS.includes(userId)) {
        return NextResponse.json({ error: 'Cannot revoke admin access' }, { status: 400 });
      }

      const { error } = await supabase
        .from('user_access')
        .delete()
        .eq('user_id', userId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (e: any) {
    console.error('Access API error:', e);
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
