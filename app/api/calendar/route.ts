import { NextRequest, NextResponse } from 'next/server';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// Simple in-memory cache (survives across requests within the same serverless instance)
const cache: Record<string, { data: any; ts: number }> = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function finnhubFetch(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`${FINNHUB_BASE}${endpoint}`);
  url.searchParams.set('token', FINNHUB_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const cacheKey = url.toString();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cache[cacheKey] = { data, ts: Date.now() };
  return data;
}

function getWeekRange(weekOffset: number = 0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(monday), to: fmt(friday) };
}

export async function GET(req: NextRequest) {
  if (!FINNHUB_KEY) {
    return NextResponse.json({ error: 'FINNHUB_API_KEY not configured' }, { status: 500 });
  }

  const week = parseInt(req.nextUrl.searchParams.get('week') || '0');
  const { from, to } = getWeekRange(week);

  try {
    // Fetch both in parallel
    const [economicRaw, earningsData] = await Promise.all([
      finnhubFetch('/calendar/economic', { from, to }).catch(e => {
        console.error('Economic calendar fetch failed:', e.message);
        return null;
      }),
      finnhubFetch('/calendar/earnings', { from, to }).catch(e => {
        console.error('Earnings calendar fetch failed:', e.message);
        return { earningsCalendar: [] };
      }),
    ]);

    // Debug: log raw economic response structure
    console.log('Economic raw keys:', economicRaw ? Object.keys(economicRaw) : 'null');
    console.log('Economic raw sample:', JSON.stringify(economicRaw)?.substring(0, 500));

    // Process economic events — try multiple possible response shapes
    const rawEconomic = economicRaw?.economicCalendar || economicRaw?.result || economicRaw?.data || [];
    const economicEvents = (Array.isArray(rawEconomic) ? rawEconomic : [])
      .filter((e: any) => {
        // Include US events and events with no country specified
        const country = (e.country || '').toUpperCase();
        return !country || country === 'US' || country === 'USD' || country === 'UNITED STATES';
      })
      .map((e: any) => ({
        event: e.event || e.name || e.title || '',
        country: e.country || 'US',
        date: e.time || e.date || '',
        impact: e.impact || e.importance || 'low',
        actual: e.actual ?? null,
        estimate: e.estimate ?? e.forecast ?? null,
        prev: e.prev ?? e.previous ?? null,
        unit: e.unit || '',
      }))
      .filter((e: any) => e.event) // must have an event name
      .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));

    // Process earnings
    const earningsEvents = (earningsData?.earningsCalendar || [])
      .map((e: any) => ({
        symbol: e.symbol || '',
        date: e.date || '',
        epsEstimate: e.epsEstimate ?? null,
        epsActual: e.epsActual ?? null,
        revenueEstimate: e.revenueEstimate ?? null,
        revenueActual: e.revenueActual ?? null,
        hour: e.hour || '', // bmo = before market open, amc = after market close
        quarter: e.quarter ?? null,
        year: e.year ?? null,
      }))
      .sort((a: any, b: any) => {
        const dateCmp = (a.date || '').localeCompare(b.date || '');
        if (dateCmp !== 0) return dateCmp;
        // BMO first, then AMC
        if (a.hour === 'bmo' && b.hour !== 'bmo') return -1;
        if (a.hour !== 'bmo' && b.hour === 'bmo') return 1;
        return 0;
      });

    return NextResponse.json({
      from, to, week,
      economic: economicEvents,
      earnings: earningsEvents,
      economicCount: economicEvents.length,
      earningsCount: earningsEvents.length,
      _debug_economicRawKeys: economicRaw ? Object.keys(economicRaw) : null,
      _debug_economicRawCount: Array.isArray(rawEconomic) ? rawEconomic.length : 'not array',
      _debug_economicSample: Array.isArray(rawEconomic) ? rawEconomic.slice(0, 2) : rawEconomic,
    });

  } catch (e: any) {
    console.error('Calendar API error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
