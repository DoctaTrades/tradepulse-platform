// Client-side Polygon scanner — FREE TIER ONLY
// Available: /v2/aggs/ticker/.../prev, /v2/aggs/ticker/.../range, /v3/reference/tickers/
// NOT available: snapshots, options data (requires paid plan)

const PROXY = '/api/polygon';

interface ScanCallbacks {
  onLog: (msg: string) => void;
  onResult: (result: any) => void;
  onProgress: (current: number, total: number) => void;
  shouldCancel: () => boolean;
}

const rateLimiter = {
  timestamps: [] as number[],
  limit: 5,
  async waitForSlot() {
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter(t => now - t < 60000);
      if (this.timestamps.length < this.limit) { this.timestamps.push(now); return; }
      const oldest = this.timestamps[0];
      await new Promise(r => setTimeout(r, Math.max(60000 - (now - oldest) + 200, 500)));
    }
  }
};

async function proxyFetch(path: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await rateLimiter.waitForSlot();
    try {
      const res = await fetch(`${PROXY}/${path}`);
      if (res.status === 429) { await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt))); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (e) { if (attempt === retries) throw e; await new Promise(r => setTimeout(r, 1000)); }
  }
}

function calcEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) { const d = prices[i] - prices[i - 1]; if (d > 0) gains += d; else losses += Math.abs(d); }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) { const d = prices[i] - prices[i - 1]; avgGain = (avgGain * 13 + (d > 0 ? d : 0)) / 14; avgLoss = (avgLoss * 13 + (d < 0 ? Math.abs(d) : 0)) / 14; }
  if (avgLoss === 0) return 100;
  return Math.round(100 - (100 / (1 + avgGain / avgLoss)));
}

function calcHV(prices: number[], period = 20): number | null {
  if (prices.length < period + 1) return null;
  const recent = prices.slice(-period - 1);
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) returns.push(Math.log(recent[i] / recent[i - 1]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.round(Math.sqrt(variance) * Math.sqrt(252) * 100);
}

function calcATR(bars: { h: number; l: number; c: number }[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs = bars.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - bars[i].c), Math.abs(b.l - bars[i].c)));
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function estimateIVR(iv: number, hv: number): number {
  if (!iv || !hv) return 50;
  const r = iv / hv;
  if (r >= 2.0) return 85; if (r >= 1.7) return 75; if (r >= 1.4) return 65;
  if (r >= 1.2) return 55; if (r >= 1.0) return 45; if (r >= 0.8) return 35; return 25;
}

const SECTOR_MAP: Record<string, string> = {
  'AAPL':'Technology','MSFT':'Technology','NVDA':'Technology','AMD':'Technology',
  'META':'Technology','GOOGL':'Technology','AMZN':'Technology','NFLX':'Technology',
  'TSLA':'Technology','AVGO':'Technology','CRM':'Technology','SHOP':'Technology',
  'SQ':'Technology','PLTR':'Technology','SNAP':'Technology','ROKU':'Technology',
  'COIN':'Technology','MSTR':'Technology','HOOD':'Technology','SOFI':'Financials',
  'UBER':'Technology','ABNB':'Consumer','DKNG':'Consumer','RIVN':'Consumer',
  'MARA':'Technology','RIOT':'Technology',
  'JPM':'Financials','BAC':'Financials','GS':'Financials',
  'DIS':'Consumer','HD':'Consumer','WMT':'Consumer','COST':'Consumer',
  'KO':'Consumer','PEP':'Consumer','JNJ':'Healthcare','PG':'Consumer',
  'XOM':'Energy','CVX':'Energy','BA':'Industrials','CAT':'Industrials',
  'DE':'Industrials','ABBV':'Healthcare',
  'SPY':'ETF','QQQ':'ETF','IWM':'ETF','XLE':'ETF','XLF':'ETF',
  'XLK':'ETF','XLV':'ETF','GLD':'ETF','SLV':'ETF','TLT':'ETF',
  'EEM':'ETF','SMH':'ETF','ARKK':'ETF',
};

const mktCapCache: Record<string, number> = {};

export async function polygonScan(
  tickers: string[], filters: any, callbacks: ScanCallbacks
): Promise<{ results: any[]; scanned: number }> {
  const results: any[] = [];
  let scanned = 0;
  const estMin = Math.ceil(tickers.length * 2 / 5);
  callbacks.onLog(`📡 Polygon FREE tier: ${tickers.length} tickers · 2 calls each · ~${estMin} min`);
  callbacks.onLog(`⚠ No options data on free tier — IV, IVR, RoR are estimated from HV. Connect Schwab for real data.`);

  for (let i = 0; i < tickers.length; i++) {
    if (callbacks.shouldCancel()) { callbacks.onLog('⛔ Scan cancelled'); break; }
    const ticker = tickers[i];
    callbacks.onProgress(i + 1, tickers.length);

    try {
      // 1. Previous close
      const prevData = await proxyFetch(`v2/aggs/ticker/${ticker}/prev`);
      const prev = prevData.results?.[0];
      scanned++;
      if (!prev) { callbacks.onLog(`⊘ ${ticker} · No data`); continue; }

      const price = prev.c || 0;
      if (!price || price < filters.minPrice || price > filters.maxPrice) {
        callbacks.onLog(`⊘ ${ticker} · $${price?.toFixed(2)} out of price range`); continue;
      }
      const vol = prev.v || 0;
      if (vol < filters.minVol) {
        callbacks.onLog(`⊘ ${ticker} · Vol ${(vol/1000).toFixed(0)}K below min`); continue;
      }

      // 2. Aggregates (90 days for technicals)
      const to = new Date(); to.setDate(to.getDate() - 1);
      const from = new Date(); from.setDate(from.getDate() - 120);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const aggData = await proxyFetch(`v2/aggs/ticker/${ticker}/range/1/day/${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&limit=120`);
      const bars = aggData.results || [];
      if (bars.length < 20) { callbacks.onLog(`⊘ ${ticker} · Only ${bars.length} bars`); continue; }

      const closes = bars.map((b: any) => b.c);
      const fullBars = bars.map((b: any) => ({ h: b.h, l: b.l, c: b.c }));
      const ema50 = calcEMA(closes, 50);
      const ema200 = calcEMA(closes, 200);
      const rsi = calcRSI(closes) || 50;
      const hv = calcHV(closes) || 20;
      const atr = calcATR(fullBars) || (price * 0.02);
      const atrPct = Math.round((atr / price) * 100 * 10) / 10;
      const prevClose = bars.length >= 2 ? bars[bars.length - 2].c : price;
      const change = prevClose > 0 ? Math.round(((price - prevClose) / prevClose) * 100 * 100) / 100 : 0;

      // EMA filters
      if (filters.emaTrend === 'above50' && ema50 && price <= ema50) { callbacks.onLog(`⊘ ${ticker} · Below 50 EMA`); continue; }
      if (filters.emaTrend === 'above200' && ema200 && price <= ema200) { callbacks.onLog(`⊘ ${ticker} · Below 200 EMA`); continue; }
      if (filters.emaTrend === 'above_both' && ((ema50 && price <= ema50) || (ema200 && price <= ema200))) { callbacks.onLog(`⊘ ${ticker} · Below EMA(s)`); continue; }

      // RSI filter
      if (rsi < filters.minRSI || rsi > filters.maxRSI) { callbacks.onLog(`⊘ ${ticker} · RSI ${rsi} out of range`); continue; }

      // Estimate IV from HV (no options data on free tier)
      const iv = Math.round(hv * 1.25);
      const ivr = estimateIVR(iv, hv);
      if (iv < filters.minIV) { callbacks.onLog(`⊘ ${ticker} · Est.IV ${iv}% below min`); continue; }
      if (ivr < filters.minIVR) { callbacks.onLog(`⊘ ${ticker} · Est.IVR ${ivr}% below min`); continue; }

      // Estimate RoR
      const strike = Math.round(price * 0.95 / 5) * 5;
      const estPremium = Math.round(strike * (iv / 100) * Math.sqrt(35 / 365) * 0.4 * 100) / 100;
      const ror = Math.round((estPremium / strike) * 100 * 100) / 100;
      if (filters.minRoR > 0 && ror < filters.minRoR) { callbacks.onLog(`⊘ ${ticker} · Est.RoR ${ror}% below min`); continue; }

      const result = {
        ticker, price, change, vol, iv, hv, ivr, rsi, atrPct,
        ema50: ema50 ? Math.round(ema50 * 100) / 100 : null,
        ema200: ema200 ? Math.round(ema200 * 100) / 100 : null,
        maxOI: 0, optVol: 0, optBid: estPremium, ror,
        uoaRatio: 0, isUOA: false, mktCap: mktCapCache[ticker] || 0,
        sector: SECTOR_MAP[ticker] || 'Unknown',
        source: 'polygon (est.)',
      };

      callbacks.onLog(`✓ ${ticker} · $${price.toFixed(2)} · HV:${hv}% · Est.IV:${iv}% · RSI:${rsi} · RoR:${ror}%`);
      callbacks.onResult(result);
      results.push(result);
    } catch (e: any) {
      callbacks.onLog(`✕ ${ticker} · ${e.message}`);
    }
  }
  return { results, scanned };
}
