import { NextRequest, NextResponse } from 'next/server';
import { getSnapTradeClient } from '@/app/lib/snaptrade';
import { supabase } from '@/app/lib/supabase';

// ─── Helper: get or create snaptrade_users table entry ───
async function getSnapTradeUser(userId: string) {
  const { data } = await supabase
    .from('snaptrade_users')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data;
}

async function saveSnapTradeUser(userId: string, snapUserId: string, userSecret: string) {
  const { data, error } = await supabase
    .from('snaptrade_users')
    .upsert({
      user_id: userId,
      snap_user_id: snapUserId,
      user_secret: userSecret,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data;
}

// ─── POST handler ───
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Missing x-user-id header' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action } = body;
  const snaptrade = getSnapTradeClient();

  try {
    // ═══ REGISTER: Create a SnapTrade user for this TradePulse user ═══
    if (action === 'register') {
      // Check if already registered
      const existing = await getSnapTradeUser(userId);
      if (existing?.snap_user_id && existing?.user_secret) {
        return NextResponse.json({
          success: true,
          message: 'Already registered',
          snapUserId: existing.snap_user_id,
        });
      }

      // Register with SnapTrade
      const snapUserId = `tp-${userId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30)}`;
      const registerRes = await snaptrade.authentication.registerSnapTradeUser({
        userId: snapUserId,
      });

      const userSecret = registerRes.data?.userSecret;
      if (!userSecret) {
        throw new Error('No userSecret returned from SnapTrade registration');
      }

      // Save to Supabase
      await saveSnapTradeUser(userId, snapUserId, userSecret);

      return NextResponse.json({
        success: true,
        message: 'Registered with SnapTrade',
        snapUserId,
      });
    }

    // ═══ CONNECT: Generate Connection Portal URL ═══
    if (action === 'connect') {
      const snapUser = await getSnapTradeUser(userId);
      if (!snapUser?.snap_user_id || !snapUser?.user_secret) {
        return NextResponse.json({ error: 'Not registered with SnapTrade. Register first.' }, { status: 400 });
      }

      const { broker, customRedirect } = body;

      const loginRes = await snaptrade.authentication.loginSnapTradeUser({
        userId: snapUser.snap_user_id,
        userSecret: snapUser.user_secret,
        ...(broker ? { broker } : {}),
        connectionType: 'read',
        showCloseButton: true,
        darkMode: true,
        connectionPortalVersion: 'v4',
        ...(customRedirect ? { customRedirect, immediateRedirect: true } : {}),
      });

      const redirectURI = loginRes.data?.redirectURI;
      if (!redirectURI) {
        throw new Error('No redirectURI returned from SnapTrade');
      }

      return NextResponse.json({ success: true, redirectURI });
    }

    // ═══ ACCOUNTS: List all connected accounts ═══
    if (action === 'accounts') {
      const snapUser = await getSnapTradeUser(userId);
      if (!snapUser?.snap_user_id || !snapUser?.user_secret) {
        return NextResponse.json({ error: 'Not registered', accounts: [], connections: [] }, { status: 400 });
      }

      // Get connections
      const connRes = await snaptrade.connections.listBrokerageAuthorizations({
        userId: snapUser.snap_user_id,
        userSecret: snapUser.user_secret,
      });

      // Get accounts
      const acctRes = await snaptrade.accountInformation.listUserAccounts({
        userId: snapUser.snap_user_id,
        userSecret: snapUser.user_secret,
      });

      const connections = (connRes.data || []).map((c: any) => ({
        id: c.id,
        brokerage: c.brokerage?.name || 'Unknown',
        brokerageSlug: c.brokerage?.slug || '',
        logo: c.brokerage?.aws_s3_logo_url || '',
        disabled: c.disabled || false,
        createdAt: c.created_date,
      }));

      const accounts = (acctRes.data || []).map((a: any) => ({
        id: a.id,
        name: a.name || a.number || 'Account',
        number: a.number || '',
        type: a.raw_type || a.meta?.type || '',
        connectionId: a.brokerage_authorization,
        syncStatus: a.sync_status,
      }));

      return NextResponse.json({ success: true, connections, accounts });
    }

    // ═══ DISCONNECT: Remove a connection ═══
    if (action === 'disconnect') {
      const { connectionId } = body;
      if (!connectionId) {
        return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 });
      }

      const snapUser = await getSnapTradeUser(userId);
      if (!snapUser?.snap_user_id || !snapUser?.user_secret) {
        return NextResponse.json({ error: 'Not registered' }, { status: 400 });
      }

      await snaptrade.connections.removeBrokerageAuthorization({
        userId: snapUser.snap_user_id,
        userSecret: snapUser.user_secret,
        authorizationId: connectionId,
      });

      return NextResponse.json({ success: true, message: 'Connection removed' });
    }

    // ═══ IMPORT: Pull transactions from a connected account ═══
    if (action === 'import') {
      const { accountId, startDate, endDate } = body;
      if (!accountId) {
        return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
      }

      const snapUser = await getSnapTradeUser(userId);
      if (!snapUser?.snap_user_id || !snapUser?.user_secret) {
        return NextResponse.json({ error: 'Not registered' }, { status: 400 });
      }

      // Pull transactions — try both endpoints
      const allActivities: any[] = [];
      let debugMethod = '';

      // Method 1: Account-level activities (newer endpoint)
      try {
        const res = await snaptrade.accountInformation.getAccountActivities({
          accountId,
          userId: snapUser.snap_user_id,
          userSecret: snapUser.user_secret,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        });

        // Response could be: res.data (array), res.data.activities (array), or paginated
        const raw = res.data;
        if (Array.isArray(raw)) {
          allActivities.push(...raw);
          debugMethod = `accountActivities (array, ${raw.length})`;
        } else if (raw?.activities && Array.isArray(raw.activities)) {
          allActivities.push(...raw.activities);
          debugMethod = `accountActivities.activities (${raw.activities.length})`;
        } else if (raw?.data && Array.isArray(raw.data)) {
          allActivities.push(...raw.data);
          debugMethod = `accountActivities.data (${raw.data.length})`;
        } else {
          debugMethod = `accountActivities (unknown shape: ${JSON.stringify(raw).substring(0, 200)})`;
        }
      } catch (e: any) {
        debugMethod = `accountActivities error: ${e.message}`;
      }

      // Method 2: If method 1 returned nothing, try transactionsAndReporting
      if (allActivities.length === 0) {
        try {
          const res2 = await snaptrade.transactionsAndReporting.getActivities({
            userId: snapUser.snap_user_id,
            userSecret: snapUser.user_secret,
            accounts: accountId,
            ...(startDate ? { startDate } : {}),
            ...(endDate ? { endDate } : {}),
          });

          const raw2 = res2.data;
          if (Array.isArray(raw2)) {
            allActivities.push(...raw2);
            debugMethod += ` | txReporting (array, ${raw2.length})`;
          } else if (raw2?.activities && Array.isArray(raw2.activities)) {
            allActivities.push(...raw2.activities);
            debugMethod += ` | txReporting.activities (${raw2.activities.length})`;
          } else {
            debugMethod += ` | txReporting (unknown: ${JSON.stringify(raw2).substring(0, 200)})`;
          }
        } catch (e: any) {
          debugMethod += ` | txReporting error: ${e.message}`;
        }
      }

      // Debug: log raw activity types to identify what SnapTrade returns
      const typeCounts: Record<string, number> = {};
      allActivities.forEach((a: any) => {
        const t = (a.type || a.action_type || a.side || 'UNKNOWN').toString().toUpperCase();
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });

      // Transform into a standardized format for TradePulse
      const orders = allActivities.map((a: any) => {
        const isOption = !!a.option_symbol;
        const symbol = a.symbol?.symbol || a.symbol?.raw_symbol || a.symbol?.ticker || (typeof a.symbol === 'string' ? a.symbol : '') || '';
        const rawType = (a.type || a.action_type || a.side || '').toString().toUpperCase();
        const optionDetail = a.option_symbol ? {
          optionSymbol: a.option_symbol.description || a.option_symbol.ticker || '',
          optionType: a.option_symbol.option_type || '',
          strikePrice: a.option_symbol.strike_price || 0,
          expirationDate: a.option_symbol.expiration_date || '',
        } : null;

        // Normalize type — SnapTrade may use BUY/SELL, buy/sell, or other variants
        let normalizedType = '';
        if (['BUY', 'BTO', 'BTC', 'PURCHASE'].includes(rawType)) normalizedType = 'BUY';
        else if (['SELL', 'STO', 'STC', 'SALE'].includes(rawType)) normalizedType = 'SELL';
        else if (rawType.includes('BUY')) normalizedType = 'BUY';
        else if (rawType.includes('SELL')) normalizedType = 'SELL';

        return {
          id: a.id || `${a.trade_date}-${symbol}-${Math.random()}`,
          symbol,
          isOption,
          optionDetail,
          date: a.trade_date ? a.trade_date.substring(0, 10) : a.settlement_date ? a.settlement_date.substring(0, 10) : '',
          settlementDate: a.settlement_date ? a.settlement_date.substring(0, 10) : '',
          type: normalizedType,
          rawType,
          action: normalizedType === 'BUY' ? 'Buy' : normalizedType === 'SELL' ? 'Sell' : rawType,
          quantity: Math.abs(a.units || a.quantity || 0),
          price: Math.abs(a.price || 0),
          amount: a.amount || 0,
          fee: Math.abs(a.fee || 0),
          currency: a.currency?.code || a.currency || 'USD',
          description: a.description || '',
          institution: a.institution || '',
          externalRefId: a.external_reference_id || '',
        };
      }).filter((o: any) => o.symbol && o.date && (o.type === 'BUY' || o.type === 'SELL'));

      return NextResponse.json({
        success: true,
        totalRaw: allActivities.length,
        orders,
        message: `Found ${orders.length} buy/sell transactions (${allActivities.length} total activities)`,
        _debug_typeCounts: typeCounts,
        _debug_sampleRaw: allActivities.slice(0, 3),
        _debug_method: debugMethod,
      });
    }

    // ═══ STATUS: Check if SnapTrade API is working ═══
    if (action === 'status') {
      const statusRes = await snaptrade.apiStatus.check();
      const snapUser = await getSnapTradeUser(userId);
      return NextResponse.json({
        success: true,
        apiOnline: statusRes.data?.online || false,
        registered: !!(snapUser?.snap_user_id),
        hasConnections: false, // will be checked by accounts call
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (e: any) {
    console.error('SnapTrade API error:', e?.response?.data || e.message || e);
    const msg = e?.response?.data?.detail || e?.response?.data?.message || e.message || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
