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

export async function GET(req: NextRequest) {
  const week = parseInt(req.nextUrl.searchParams.get('week') || '0');
  const { from, to } = getWeekRange(week);

  try {
    // Economic events from static calendar (FOMC, CPI, NFP, GDP, PCE, Jobless Claims)
    const economicEvents = getEconomicEvents(from, to).map(e => ({
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
    });

  } catch (e: any) {
    console.error('Calendar API error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
