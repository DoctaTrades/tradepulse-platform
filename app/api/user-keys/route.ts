import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/app/lib/auth-helpers';

// ─── USER DATA BLOB STORAGE ──────────────────────────────
// Historically named "user-keys" because it stored per-user API credentials.
// Credential storage moved to user_schwab_credentials table. This endpoint
// now only handles the user_data.api_keys JSON blob which stores things like
// Discovery screener saved presets. Kept under the old name and path for
// backward compatibility with DiscoveryModule and ScreenerModule.
//
// TODO: rename column from api_keys → user_prefs or similar in a future
// schema migration, then rename this route to /api/user-prefs.

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// GET: load the user's stored blob
export async function GET(req: NextRequest) {
  const { userId } = await verifyAuth(req);
  if (!userId || !supabase) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const { data } = await supabase.from('user_data').select('api_keys').eq('user_id', userId).single();
    return NextResponse.json({ apiKeys: data?.api_keys || {} });
  } catch {
    return NextResponse.json({ apiKeys: {} });
  }
}

// POST: save the user's blob (only `action: 'save'` is supported)
export async function POST(req: NextRequest) {
  const { userId } = await verifyAuth(req);
  if (!userId || !supabase) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const { action, apiKeys } = body;

  if (action === 'save') {
    try {
      await supabase.from('user_data').upsert(
        { user_id: userId, api_keys: apiKeys },
        { onConflict: 'user_id' }
      );
      return NextResponse.json({ success: true });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
