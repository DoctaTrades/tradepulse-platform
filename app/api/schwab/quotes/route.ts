import { verifyAuth } from '@/app/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { getQuotes } from '@/app/lib/schwab-data';
import { hasSchwabConnection } from '@/app/lib/schwab-auth';

export async function GET(req: NextRequest) {
  const { userId } = await verifyAuth(req);
  if (!await hasSchwabConnection(userId)) {
    return NextResponse.json({ error: 'Not authenticated with Schwab' }, { status: 401 });
  }

  const symbols = req.nextUrl.searchParams.get('symbols');
  if (!symbols) {
    return NextResponse.json({ error: 'symbols parameter required' }, { status: 400 });
  }

  try {
    const data = await getQuotes(symbols.split(','), userId);
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : "Unknown error") }, { status: 500 });
  }
}
