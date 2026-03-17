import { NextRequest, NextResponse } from 'next/server';
import { getEconomicEvents } from '@/app/lib/economic-calendar-2026';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

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

// Map Finnhub economic event to our format
function mapFinnhubEconomicEvent(e: any) {
  const event = e.event || '';
  const eventLower = event.toLowerCase();

  // Determine category
  let category = 'OTHER';
  if (eventLower.includes('fomc') || eventLower.includes('federal funds') || eventLower.includes('interest rate')) category = 'FOMC';
  else if (eventLower.includes('consumer price') || eventLower.includes('cpi')) category = 'CPI';
  else if (eventLower.includes('nonfarm') || eventLower.includes('non-farm') || eventLower.includes('payroll') || eventLower.includes('employment situation')) category = 'NFP';
  else if (eventLower.includes('gdp') || eventLower.includes('gross domestic')) category = 'GDP';
  else if (eventLower.includes('pce') || eventLower.includes('personal consumption') || eventLower.includes('personal income')) category = 'PCE';
  else if (eventLower.includes('producer price') || eventLower.includes('ppi')) category = 'PPI';
  else if (eventLower.includes('retail sales')) category = 'RETAIL';
  else if (eventLower.includes('ism') || eventLower.includes('purchasing manager')) category = 'ISM';
  else if (eventLower.includes('jolts') || eventLower.includes('job opening')) category = 'JOLTS';
  else if (eventLower.includes('jobless') || eventLower.includes('unemployment claim')) category = 'JOBLESS';

  // Determine impact
  let impact = 'low';
  if (['FOMC', 'CPI', 'NFP', 'GDP', 'PCE'].includes(category)) impact = 'high';
  else if (['PPI', 'RETAIL', 'ISM', 'JOLTS', 'JOBLESS'].includes(category)) impact = 'medium';
  // Also check Finnhub's own impact field if available
  if (e.impact === 'high' || e.importance === 3) impact = 'high';
  else if (e.impact === 'medium' || e.importance === 2) impact = 'medium';

  return {
    event: e.event || '',
    country: e.country || 'US',
    date: e.time || e.date || '',
    impact,
    actual: e.actual ?? null,
    estimate: e.estimate ?? null,
    prev: e.prev ?? null,
    unit: e.unit || '',
    category,
    notes: '',
  };
}

export async function GET(req: NextRequest) {
  const week = parseInt(req.nextUrl.searchParams.get('week') || '0');
  const { from, to } = getWeekRange(week);

  try {
    let economicEvents: any[] = [];
    let economicSource = 'static';

    // Try Finnhub economic calendar first (live, accurate dates)
    if (FINNHUB_KEY) {
      try {
        const finnhubEcon = await cachedFetch(
          `${FINNHUB_BASE}/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_KEY}`
        );

        const events = finnhubEcon?.economicCalendar || finnhubEcon?.result || [];
        if (Array.isArray(events) && events.length > 0) {
          // Filter to US events only
          economicEvents = events
            .filter((e: any) => !e.country || e.country === 'US' || e.country === 'United States')
            .map(mapFinnhubEconomicEvent)
            .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
          economicSource = 'finnhub';
        }
      } catch (e: any) {
        console.error('Finnhub economic calendar error:', e.message);
      }
    }

    // Fallback: static calendar if Finnhub returned nothing
    if (economicEvents.length === 0) {
      economicEvents = getEconomicEvents(from, to).map(e => ({
        event: e.event,
        country: 'US',
        date: `${e.date}T${e.time}:00`,
        impact: e.impact,
        actual: null,
        estimate: null,
        prev: null,
        unit: '',
        category: e.category,
        notes: e.notes || '',
      }));
      economicSource = 'static';
    }

    // Earnings from Finnhub
    let earningsEvents: any[] = [];
    if (FINNHUB_KEY) {
      try {
        const finnhubData = await cachedFetch(
          `${FINNHUB_BASE}/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`
        );
        earningsEvents = (finnhubData?.earningsCalendar || [])
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
      } catch (e: any) {
        console.error('Finnhub earnings error:', e.message);
      }
    }

    return NextResponse.json({
      from, to, week,
      economic: economicEvents,
      earnings: earningsEvents,
      economicCount: economicEvents.length,
      earningsCount: earningsEvents.length,
      economicSource,
    });

  } catch (e: any) {
    console.error('Calendar API error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
