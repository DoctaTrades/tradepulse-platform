import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/app/lib/schwab-auth';
import { schwabFetch } from '@/app/lib/schwab-data';
import { verifyAuth } from '@/app/lib/auth-helpers';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

async function schwabQuotes(symbols: string[], userId?: string): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  try {
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += 40) {
      batches.push(symbols.slice(i, i + 40));
    }
    for (const batch of batches) {
      try {
        const data = await schwabFetch('/quotes', { symbols: batch.join(','), fields: 'quote' }, userId);
        for (const [sym, info] of Object.entries(data) as any) {
          const q = info?.quote;
          const price = q?.lastPrice || q?.closePrice || q?.mark || 0;
          if (price > 0) prices[sym] = Math.round(price * 100) / 100;
        }
      } catch { continue; }
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
    const { userId } = await verifyAuth(req);
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'symbols array required' }, { status: 400 });
    }

    const tickers = [...new Set(symbols.map((s: string) => s.toUpperCase().trim()).filter(Boolean))];
    const prices: Record<string, number> = {};
    const sources: Record<string, string> = {};

    if (await isAuthenticated(userId)) {
      const schwabPrices = await schwabQuotes(tickers, userId);
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
