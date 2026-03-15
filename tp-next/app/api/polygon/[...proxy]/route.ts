import { NextRequest, NextResponse } from 'next/server';

const POLYGON_BASE = 'https://api.polygon.io';

export async function GET(req: NextRequest, context: { params: Promise<{ proxy: string[] }> }) {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 });
  }

  const { proxy } = await context.params;
  const path = proxy.join('/');
  const url = new URL(`${POLYGON_BASE}/${path}`);
  
  // Forward all query params and add API key
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  url.searchParams.set('apiKey', apiKey);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? (e instanceof Error ? e.message : "Unknown error") : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
