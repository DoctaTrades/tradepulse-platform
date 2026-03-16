import { NextRequest, NextResponse } from 'next/server';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const FMP_KEY = process.env.FMP_API_KEY || '';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

// Simple in-memory cache
const cache: Record<string, { data: any; ts: number }> = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function cachedFetch(url: string) {
  const cached = cache[url];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cache[url] = { data, ts: Date.now() };
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
  const week = parseInt(req.nextUrl.searchParams.get('week') || '0');
  const { from, to } = getWeekRange(week);

  try {
    // Fetch economic from FMP and earnings from Finnhub in parallel
    const [fmpEconomic, finnhubEarnings] = await Promise.all([
      FMP_KEY
        ? cachedFetch(`${FMP_BASE}/economic_calendar?from=${from}&to=${to}&apikey=${FMP_KEY}`).catch(e => {
            console.error('FMP economic calendar error:', e.message);
            return [];
          })
        : Promise.resolve([]),
      FINNHUB_KEY
        ? cachedFetch(`${FINNHUB_BASE}/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`).catch(e => {
            console.error('Finnhub earnings error:', e.message);
            return { earningsCalendar: [] };
          })
        : Promise.resolve({ earningsCalendar: [] }),
    ]);

    // Process FMP economic events — filter to US
    const rawEconomic = Array.isArray(fmpEconomic) ? fmpEconomic : [];
    const economicEvents = rawEconomic
      .filter((e: any) => {
        const country = (e.country || '').toLowerCase();
        return country === 'us' || country === 'united states' || country === 'usa';
      })
      .map((e: any) => ({
        event: e.event || e.name || '',
        country: 'US',
        date: e.date || '',
        impact: e.impact || (e.importance === 3 ? 'high' : e.importance === 2 ? 'medium' : 'low'),
        actual: e.actual ?? e.actualValue ?? null,
        estimate: e.estimate ?? e.consensus ?? e.forecast ?? null,
        prev: e.previous ?? e.prev ?? null,
        unit: e.unit || '',
        change: e.change ?? null,
        changePercentage: e.changePercentage ?? null,
      }))
      .filter((e: any) => e.event)
      .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));

    // Process Finnhub earnings
    const earningsEvents = (finnhubEarnings?.earningsCalendar || [])
      .map((e: any) => ({
        symbol: e.symbol || '',
        date: e.date || '',
        epsEstimate: e.epsEstimate ?? null,
        epsActual: e.epsActual ?? null,
        revenueEstimate: e.revenueEstimate ?? null,
        revenueActual: e.revenueActual ?? null,
        hour: e.hour || '',
        quarter: e.quarter ?? null,
        year: e.year ?? null,
      }))
      .sort((a: any, b: any) => {
        const dateCmp = (a.date || '').localeCompare(b.date || '');
        if (dateCmp !== 0) return dateCmp;
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
    });

  } catch (e: any) {
    console.error('Calendar API error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
