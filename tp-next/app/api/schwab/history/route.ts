import { NextRequest, NextResponse } from 'next/server';
import { getPriceHistory } from '@/app/lib/schwab-data';
import { isAuthenticated } from '@/app/lib/schwab-auth';

export async function GET(req: NextRequest) {
  if (!await isAuthenticated()) {
    return NextResponse.json({ error: 'Not authenticated with Schwab' }, { status: 401 });
  }

  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'symbol parameter required' }, { status: 400 });
  }

  try {
    const data = await getPriceHistory(symbol, {
      periodType: req.nextUrl.searchParams.get('periodType') || 'year',
      period: Number(req.nextUrl.searchParams.get('period')) || 1,
      frequencyType: req.nextUrl.searchParams.get('frequencyType') || 'daily',
      frequency: Number(req.nextUrl.searchParams.get('frequency')) || 1,
    });
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : "Unknown error") }, { status: 500 });
  }
}
