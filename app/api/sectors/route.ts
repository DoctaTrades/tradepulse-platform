import { verifyAuth } from '@/app/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/app/lib/schwab-auth';
import { schwabFetch as _schwabFetchBase } from '@/app/lib/schwab-data';
import { SECTORS, getSectorByETF } from '@/app/lib/sector-holdings';

export const dynamic = 'force-dynamic';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

let _sectUserId: string | undefined;
async function schwabFetch(endpoint: string, params?: Record<string, string>) {
  return _schwabFetchBase(endpoint, params, _sectUserId);
}

// ─── STRAT HELPERS ───
function classifyStrat(candle: any, prev: any): string {
  const higherHigh = candle.high > prev.high;
  const lowerLow = candle.low < prev.low;
  if (higherHigh && lowerLow) return '3';
  if (!higherHigh && !lowerLow) return '1';
  if (higherHigh && !lowerLow) return '2U';
  if (!higherHigh && lowerLow) return '2D';
  return '1';
}

// Append today's candle from quote data if price history doesn't include it yet
function appendTodayCandle(candles: any[], quote: any): any[] {
  if (!quote || !candles.length) return candles;
  const q = quote;
  if (!q.openPrice || !q.highPrice || !q.lowPrice || !(q.lastPrice || q.closePrice)) return candles;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const lastCandle = candles[candles.length - 1];
  const lastDate = new Date(lastCandle.datetime);
  lastDate.setHours(0, 0, 0, 0);
  if (lastDate.getTime() < todayMs) {
    return [...candles, {
      datetime: todayMs,
      open: q.openPrice,
      high: q.highPrice,
      low: q.lowPrice,
      close: q.lastPrice || q.closePrice,
      volume: q.totalVolume || 0,
    }];
  }
  return candles;
}

function aggregateCandles(dailyCandles: any[], period: number): any[] {
  const result: any[] = [];
  for (let i = 0; i <= dailyCandles.length - period; i += period) {
    const chunk = dailyCandles.slice(i, i + period);
    result.push({
      open: chunk[0].open,
      high: Math.max(...chunk.map((c: any) => c.high)),
      low: Math.min(...chunk.map((c: any) => c.low)),
      close: chunk[chunk.length - 1].close,
    });
  }
  return result;
}

function getLastStrat(candles: any[]): string {
  if (candles.length < 2) return '?';
  return classifyStrat(candles[candles.length - 1], candles[candles.length - 2]);
}

function calcRSI(candles: any[], period = 14): number {
  if (candles.length < period + 1) return 50;
  const closes = candles.slice(-(period + 1)).map((c: any) => c.close);
  let gains = 0, losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - (100 / (1 + rs)));
}

// ─── Finnhub ETF holdings (optional refresh) ───
async function finnhubHoldings(etf: string): Promise<string[]> {
  if (!FINNHUB_KEY) return [];
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/etf/holdings?symbol=${etf}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.holdings || [])
      .slice(0, 20)
      .map((h: any) => h.symbol)
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Cache
const cache: Record<string, { data: any; ts: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function GET(req: NextRequest) {
  const sector = req.nextUrl.searchParams.get('sector');
  const mode = req.nextUrl.searchParams.get('mode') || 'overview';
  const useFinnhub = req.nextUrl.searchParams.get('finnhub') === 'true';
  const { userId } = await verifyAuth(req);
  _sectUserId = userId;

  if (!await isAuthenticated(userId)) {
    return NextResponse.json({ error: 'Schwab not connected' }, { status: 401 });
  }

  try {
    // ═══ OVERVIEW MODE: all sector ETFs with performance ═══
    if (mode === 'overview') {
      const cacheKey = 'sector_overview';
      if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_TTL) {
        return NextResponse.json(cache[cacheKey].data);
      }

      const etfSymbols = SECTORS.map(s => s.etf);
      const quoteData = await schwabFetch('/quotes', {
        symbols: etfSymbols.join(','),
        fields: 'quote',
      });

      // Get price history for each sector to calculate weekly/monthly change + strat
      const sectorData = await Promise.all(SECTORS.map(async (s) => {
        const q = quoteData[s.etf]?.quote;
        const price = q?.lastPrice || q?.closePrice || q?.mark || 0;
        const change = q?.netChange || 0;
        // Try multiple Schwab fields for % change
        let changePct = q?.netPercentChangeInDouble || q?.percentChange || 0;

        // Get candles for strat + RSI
        let dailyStrat = '?', weeklyStrat = '?', rsi = 50;
        let weekChange = 0, monthChange = 0;
        try {
          const now = Date.now();
          const hist = await schwabFetch('/pricehistory', {
            symbol: s.etf,
            periodType: 'month',
            period: '3',
            frequencyType: 'daily',
            frequency: '1',
          });
          const candles = appendTodayCandle(hist.candles || [], q);
          if (candles.length >= 2) {
            dailyStrat = getLastStrat(candles);
            rsi = calcRSI(candles);

            // Fallback: calculate today's change from yesterday's close
            if (!changePct && price > 0 && candles.length >= 2) {
              const prevClose = candles[candles.length - 2]?.close || 0;
              if (prevClose > 0) {
                changePct = Math.round(((price - prevClose) / prevClose) * 10000) / 100;
              }
            }

            // Weekly strat from aggregated candles
            const weekly = aggregateCandles(candles, 5);
            weeklyStrat = getLastStrat(weekly);
            // Week change (5 days ago)
            if (candles.length >= 6) {
              const prev5 = candles[candles.length - 6]?.close || price;
              weekChange = Math.round(((price - prev5) / prev5) * 10000) / 100;
            }
            // Month change (22 days ago)
            if (candles.length >= 23) {
              const prev22 = candles[candles.length - 23]?.close || price;
              monthChange = Math.round(((price - prev22) / prev22) * 10000) / 100;
            }
          }
        } catch {}

        return {
          etf: s.etf,
          label: s.label,
          color: s.color,
          price,
          change: Math.round(change * 100) / 100,
          changePct: Math.round(changePct * 100) / 100,
          weekChange,
          monthChange,
          dailyStrat,
          weeklyStrat,
          rsi,
          holdingsCount: s.tickers.length,
        };
      }));

      const result = { sectors: sectorData, ts: new Date().toISOString() };
      cache[cacheKey] = { data: result, ts: Date.now() };
      return NextResponse.json(result);
    }

    // ═══ DRILLDOWN MODE: specific sector holdings ═══
    if (mode === 'drilldown' && sector) {
      const cacheKey = `sector_drill_${sector}`;
      if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_TTL) {
        return NextResponse.json(cache[cacheKey].data);
      }

      const sectorDef = getSectorByETF(sector);
      if (!sectorDef) {
        return NextResponse.json({ error: `Unknown sector: ${sector}` }, { status: 400 });
      }

      // Optionally fetch fresh holdings from Finnhub
      let tickers = [...sectorDef.tickers];
      if (useFinnhub) {
        const fhHoldings = await finnhubHoldings(sector);
        if (fhHoldings.length > 0) {
          // Merge: Finnhub top holdings + static fallbacks for any missing
          const merged = [...new Set([...fhHoldings, ...sectorDef.tickers])];
          tickers = merged;
        }
      }

      // Batch quote all tickers
      const batches: string[][] = [];
      for (let i = 0; i < tickers.length; i += 40) {
        batches.push(tickers.slice(i, i + 40));
      }
      const allQuotes: Record<string, any> = {};
      for (const batch of batches) {
        try {
          const data = await schwabFetch('/quotes', {
            symbols: batch.join(','),
            fields: 'quote,fundamental',
          });
          Object.assign(allQuotes, data);
        } catch {}
      }

      // Fetch price history for Strat + RSI (parallel, limited concurrency)
      const holdingData = await Promise.all(tickers.map(async (ticker) => {
        const q = allQuotes[ticker]?.quote;
        const fund = allQuotes[ticker]?.fundamental;
        if (!q) return null;

        const price = q.lastPrice || q.closePrice || 0;
        const change = q.netChange || 0;
        let changePct = q.netPercentChangeInDouble || 0;
        const volume = q.totalVolume || 0;

        let dailyStrat = '?', weeklyStrat = '?', rsi = 50;
        let avgVolume = 0, volRatio = 0;
        let candles: any[] = [];

        try {
          const hist = await schwabFetch('/pricehistory', {
            symbol: ticker,
            periodType: 'month',
            period: '3',
            frequencyType: 'daily',
            frequency: '1',
          });
          candles = appendTodayCandle(hist.candles || [], q);
          if (candles.length >= 2) {
            dailyStrat = getLastStrat(candles);
            rsi = calcRSI(candles);
            const weekly = aggregateCandles(candles, 5);
            weeklyStrat = getLastStrat(weekly);
            // Avg volume (20-day)
            const recentVols = candles.slice(-20).map((c: any) => c.volume || 0);
            avgVolume = Math.round(recentVols.reduce((a: number, b: number) => a + b, 0) / recentVols.length);
            volRatio = avgVolume > 0 ? Math.round((volume / avgVolume) * 100) / 100 : 0;

            // Fallback: calculate change from yesterday's close
            if (!changePct && price > 0) {
              const prevClose = candles[candles.length - 2]?.close || 0;
              if (prevClose > 0) {
                changePct = Math.round(((price - prevClose) / prevClose) * 10000) / 100;
              }
            }
          }
        } catch {}

        // 52-week high/low — try multiple Schwab field names + candle fallback
        let wk52High = q['52WkHigh'] || q.fiftyTwoWeekHigh || q['52WeekHigh'] || q.yearHigh || 0;
        let wk52Low = q['52WkLow'] || q.fiftyTwoWeekLow || q['52WeekLow'] || q.yearLow || 0;

        // Fallback: calculate from candle data if quote doesn't have it
        if (!wk52High && candles.length >= 2) {
          const highs = candles.map((c: any) => c.high || 0);
          wk52High = Math.max(...highs);
        }
        if (!wk52Low && candles.length >= 2) {
          const lows = candles.filter((c: any) => c.low > 0).map((c: any) => c.low);
          wk52Low = lows.length > 0 ? Math.min(...lows) : 0;
        }

        const fromHigh = wk52High > 0 ? Math.round(((price - wk52High) / wk52High) * 10000) / 100 : 0;

        // Market cap — try multiple fields, calculate from shares outstanding as fallback
        let mktCap = fund?.marketCap || fund?.mktCap || fund?.marketCapFloat || q?.marketCap || 0;
        if (!mktCap && fund) {
          // Try calculating: price × shares outstanding
          const shares = fund?.sharesOutstanding || fund?.shares || fund?.float || 0;
          if (shares > 0 && price > 0) mktCap = Math.round(price * shares);
        }
        // Finnhub fallback for market cap (only if we still don't have it and key exists)
        if (!mktCap && FINNHUB_KEY) {
          try {
            const profileRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_KEY}`);
            if (profileRes.ok) {
              const profile = await profileRes.json();
              mktCap = profile?.marketCapitalization ? Math.round(profile.marketCapitalization * 1e6) : 0;
            }
          } catch {}
        }

        return {
          ticker,
          price: Math.round(price * 100) / 100,
          change: Math.round(change * 100) / 100,
          changePct: Math.round(changePct * 100) / 100,
          volume,
          avgVolume,
          volRatio,
          dailyStrat,
          weeklyStrat,
          rsi,
          mktCap,
          fromHigh,
          wk52High: Math.round((wk52High || 0) * 100) / 100,
          wk52Low: Math.round((wk52Low || 0) * 100) / 100,
        };
      }));

      const holdings = holdingData.filter(Boolean);

      // Sort by absolute change % (biggest movers first)
      holdings.sort((a: any, b: any) => Math.abs(b.changePct) - Math.abs(a.changePct));

      const result = {
        etf: sectorDef.etf,
        label: sectorDef.label,
        color: sectorDef.color,
        holdings,
        tickerCount: holdings.length,
        ts: new Date().toISOString(),
      };
      cache[cacheKey] = { data: result, ts: Date.now() };
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid mode. Use ?mode=overview or ?mode=drilldown&sector=XLK' }, { status: 400 });

  } catch (err: any) {
    console.error('Sector API error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
