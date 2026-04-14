import { verifyAuth } from '@/app/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { getOptionChain } from '@/app/lib/schwab-data';
import { hasSchwabConnection } from '@/app/lib/schwab-auth';

export async function GET(req: NextRequest) {
  const { userId } = await verifyAuth(req);
  if (!await hasSchwabConnection(userId)) {
    return NextResponse.json({ error: 'Not authenticated with Schwab' }, { status: 401 });
  }

  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'symbol parameter required' }, { status: 400 });
  }

  try {
    const data = await getOptionChain(symbol, {
      contractType: (req.nextUrl.searchParams.get('contractType') as any) || 'ALL',
      strikeCount: Number(req.nextUrl.searchParams.get('strikeCount')) || 20,
      range: req.nextUrl.searchParams.get('range') || undefined,
      fromDate: req.nextUrl.searchParams.get('fromDate') || undefined,
      toDate: req.nextUrl.searchParams.get('toDate') || undefined,
    }, userId);
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : "Unknown error") }, { status: 500 });
  }
}
