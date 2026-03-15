import { NextRequest, NextResponse } from 'next/server';
import { getQuotes } from '@/app/lib/schwab-data';
import { isAuthenticated } from '@/app/lib/schwab-auth';

export async function GET(req: NextRequest) {
  if (!await isAuthenticated()) {
    return NextResponse.json({ error: 'Not authenticated with Schwab' }, { status: 401 });
  }

  const symbols = req.nextUrl.searchParams.get('symbols');
  if (!symbols) {
    return NextResponse.json({ error: 'symbols parameter required' }, { status: 400 });
  }

  try {
    const data = await getQuotes(symbols.split(','));
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : "Unknown error") }, { status: 500 });
  }
}
