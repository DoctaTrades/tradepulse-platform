import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/app/lib/auth-helpers';

// ─── PER-USER API KEY MANAGEMENT ─────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// ─── GET: Retrieve user's API config ─────────────────────────
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

// ─── POST: Save user's API config ────────────────────────────
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

  if (action === 'test') {
    const { provider } = body;
    
    if (provider === 'schwab') {
      try {
        const { clientId, clientSecret, refreshToken } = apiKeys.schwab || {};
        if (!clientId || !clientSecret || !refreshToken) return NextResponse.json({ error: 'Missing Schwab credentials' });
        
        const tokenRes = await fetch('https://api.schwabapi.com/v1/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          },
          body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
        });
        
        if (!tokenRes.ok) {
          const err = await tokenRes.text();
          return NextResponse.json({ connected: false, error: `Token refresh failed: ${err}` });
        }
        
        const tokenData = await tokenRes.json();
        // Test with a simple quote
        const quoteRes = await fetch('https://api.schwabapi.com/marketdata/v1/quotes?symbols=SPY', {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        });
        
        return NextResponse.json({ connected: quoteRes.ok, provider: 'schwab' });
      } catch (e: any) {
        return NextResponse.json({ connected: false, error: e.message });
      }
    }

    if (provider === 'tradier') {
      try {
        const { accessToken, sandbox } = apiKeys.tradier || {};
        if (!accessToken) return NextResponse.json({ error: 'Missing Tradier access token' });
        
        const baseUrl = sandbox ? 'https://sandbox.tradier.com' : 'https://api.tradier.com';
        const res = await fetch(`${baseUrl}/v1/markets/quotes?symbols=SPY`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
        });
        
        return NextResponse.json({ connected: res.ok, provider: 'tradier' });
      } catch (e: any) {
        return NextResponse.json({ connected: false, error: e.message });
      }
    }

    if (provider === 'polygon') {
      try {
        const { apiKey } = apiKeys.polygon || {};
        if (!apiKey) return NextResponse.json({ error: 'Missing Polygon API key' });
        
        const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/SPY/prev?apiKey=${apiKey}`);
        return NextResponse.json({ connected: res.ok, provider: 'polygon' });
      } catch (e: any) {
        return NextResponse.json({ connected: false, error: e.message });
      }
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
