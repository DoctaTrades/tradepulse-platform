import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scanTickerWithTradier } from '@/app/lib/tradier-data';
import { UNIVERSE_TICKERS as UNIVERSES } from '@/app/lib/ticker-universes';

const supabaseUrl = process.env.SUPABASE_URL || 'https://odpgrgyiivbcbbqcdkxm.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// UNIVERSES imported from shared lib/ticker-universes.ts — single source of truth

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, universe = 'core', customTickers, filters = {} } = body;

  if (!userId || !supabase) {
    return NextResponse.json({ error: 'Not authenticated', results: [], logs: [], scanned: 0, source: 'none' });
  }

  // Load user's API keys
  let apiKeys: any = {};
  try {
    const { data } = await supabase.from('user_data').select('api_keys').eq('user_id', userId).single();
    apiKeys = data?.api_keys || {};
  } catch {}

  const tickers = customTickers || UNIVERSES[universe] || UNIVERSES.core;
  const f = {
    minPrice: filters.minPrice ?? 20,
    maxPrice: filters.maxPrice ?? 700,
    minVol: filters.minVol ?? 200000,
    minIVR: filters.minIVR ?? 25,
    minIV: filters.minIV ?? 20,
    targetDelta: filters.targetDelta ?? 0.30,
    targetDTE: filters.targetDTE ?? [25, 45],
    minRSI: filters.minRSI ?? 30,
    maxRSI: filters.maxRSI ?? 75,
    emaTrend: filters.emaTrend ?? 'any',
    minBid: filters.minBid ?? 0.10,
    minRoR: filters.minRoR ?? 0,
    minMktCap: (filters.minMktCap ?? 250) * 1e6,
    minOI: filters.minOI ?? 50,
    cpShortDelta: filters.cpShortDelta ?? 0.30,
  };

  const provider = apiKeys.preferredProvider || 'polygon';

  // Try Schwab (user's own keys)
  if (provider === 'schwab' && apiKeys.schwab?.clientId && apiKeys.schwab?.clientSecret && apiKeys.schwab?.refreshToken) {
    try {
      // Refresh token
      const tokenRes = await fetch('https://api.schwabapi.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${apiKeys.schwab.clientId}:${apiKeys.schwab.clientSecret}`).toString('base64'),
        },
        body: `grant_type=refresh_token&refresh_token=${apiKeys.schwab.refreshToken}`,
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        // Use the main scan route's Schwab scanning logic by forwarding internally
        // For now, return a message that personal Schwab scanning is active
        // The main /api/scan route handles Schwab via server env vars
        return NextResponse.json({
          results: [],
          logs: ['⚡ Personal Schwab connection verified. Use the main scan for full Schwab scanning.'],
          scanned: 0,
          source: 'schwab_personal',
          accessToken: tokenData.access_token, // Pass to client for direct API calls if needed
        });
      }
    } catch (e: any) {
      // Fall through to next provider
    }
  }

  // Try Tradier (user's own keys)
  if ((provider === 'tradier' || provider === 'schwab') && apiKeys.tradier?.accessToken) {
    const results: any[] = [];
    const logs: string[] = [`⚡ Tradier scan starting (${tickers.length} tickers)...`];
    let scanned = 0;

    for (const ticker of tickers) {
      try {
        const result = await scanTickerWithTradier(
          ticker,
          apiKeys.tradier.accessToken,
          apiKeys.tradier.sandbox || false,
          f
        );
        scanned++;
        if (result) {
          if (result.ivr >= f.minIVR && result.iv >= f.minIV && result.optBid >= f.minBid) {
            results.push(result);
            logs.push(`✓ ${ticker} · IVR:${result.ivr}% · IV:${result.iv}% · RoR:${result.ror}% · Bid:$${result.optBid.toFixed(2)}`);
          } else {
            logs.push(`⊘ ${ticker} · Filtered (IVR:${result.ivr}% IV:${result.iv}%)`);
          }
        } else {
          logs.push(`⊘ ${ticker} · No data`);
        }
      } catch (e: any) {
        logs.push(`✕ ${ticker} · ${e.message}`);
      }

      // Rate limit — Tradier allows ~120 req/min
      await new Promise(r => setTimeout(r, 600));
    }

    logs.push(`✅ Tradier scan complete · ${scanned} scanned · ${results.length} results`);
    return NextResponse.json({ results, logs, scanned, source: 'tradier' });
  }

  // Fallback to Polygon (client-side)
  if (apiKeys.polygon?.apiKey) {
    return NextResponse.json({
      results: [],
      logs: ['📡 Using Polygon client-side scan...'],
      scanned: 0,
      source: 'polygon_fallback',
      tickers,
      filters: f,
      polygonKey: apiKeys.polygon.apiKey,
    });
  }

  // No API configured
  return NextResponse.json({
    results: [],
    logs: ['⚠ No API keys configured. Go to Screener → API Settings to connect Schwab, Tradier, or Polygon.'],
    scanned: 0,
    source: 'none',
  });
}
