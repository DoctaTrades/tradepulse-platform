import { NextRequest, NextResponse } from 'next/server';
import { saveUserCredentials, deleteUserCredentials, hasUserCredentials, getTokenStatus } from '@/app/lib/schwab-auth';

// GET: check if user has credentials saved
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  try {
    const hasCreds = await hasUserCredentials(userId);
    const status = await getTokenStatus(userId);
    return NextResponse.json({ hasCredentials: hasCreds, ...status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: save user's Schwab App Key + Secret
export async function POST(req: NextRequest) {
  try {
    const { userId, appKey, appSecret } = await req.json();
    if (!userId || !appKey || !appSecret) {
      return NextResponse.json({ error: 'userId, appKey, and appSecret are required' }, { status: 400 });
    }

    // Basic validation
    if (appKey.length < 10) {
      return NextResponse.json({ error: 'App Key looks too short — check your Schwab developer dashboard' }, { status: 400 });
    }

    await saveUserCredentials(userId, appKey.trim(), appSecret.trim());

    return NextResponse.json({
      success: true,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`,
      message: 'Credentials saved. You can now connect to Schwab.',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE: remove user's credentials and tokens
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    await deleteUserCredentials(userId);
    return NextResponse.json({ success: true, message: 'Credentials and tokens removed.' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
