import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getValidAccessToken } from '@/app/lib/schwab-auth';

const SCHWAB_BASE = 'https://api.schwabapi.com/marketdata/v1';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

async function schwabQuotes(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  try {
    const token = await getValidAccessToken();
    // Schwab supports comma-separated symbols in one call (up to ~50)
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += 40) {
      batches.push(symbols.slice(i, i + 40));
    }
    for (const batch of batches) {
      const url = new URL(`${SCHWAB_BASE}/quotes`);
      url.searchParams.set('symbols', batch.join(','));
      url.searchParams.set('fields', 'quote');
      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const [sym, info] of Object.entries(data) as any) {
        const q = info?.quote;
        const price = q?.lastPrice || q?.closePrice || q?.mark || 0;
        if (price > 0) prices[sym] = Math.round(price * 100) / 100;
      }
    }
  } catch (err: any) {
    console.error('Schwab quotes error:', err.message);
  }
  return prices;
}

async function finnhubQuote(symbol: string): Promise<number | null> {
  if (!FINNHUB_KEY) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    // c = current price, pc = previous close
    const price = data?.c || data?.pc || 0;
    return price > 0 ? Math.round(price * 100) / 100 : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { symbols } = await req.json();
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'symbols array required' }, { status: 400 });
    }

    // Clean and dedupe
    const tickers = [...new Set(symbols.map((s: string) => s.toUpperCase().trim()).filter(Boolean))];
    const prices: Record<string, number> = {};
    const sources: Record<string, string> = {};

    // Source 1: Schwab (batch, real-time during market hours)
    if (await isAuthenticated()) {
      const schwabPrices = await schwabQuotes(tickers);
      for (const [sym, price] of Object.entries(schwabPrices)) {
        prices[sym] = price;
        sources[sym] = 'schwab';
      }
    }

    // Source 2: Finnhub fallback for any missing tickers
    const missing = tickers.filter(t => !prices[t]);
    if (missing.length > 0 && FINNHUB_KEY) {
      // Finnhub free tier: 60 calls/min, so throttle slightly
      for (const ticker of missing) {
        const price = await finnhubQuote(ticker);
        if (price) {
          prices[ticker] = price;
          sources[ticker] = 'finnhub';
        }
        if (missing.length > 5) {
          await new Promise(r => setTimeout(r, 200)); // rate limit protection
        }
      }
    }

    const stillMissing = tickers.filter(t => !prices[t]);

    return NextResponse.json({
      prices,
      sources,
      fetched: Object.keys(prices).length,
      missing: stillMissing,
      ts: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
