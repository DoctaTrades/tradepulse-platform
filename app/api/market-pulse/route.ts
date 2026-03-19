import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/app/lib/schwab-auth';
import { getQuotes, getPriceHistory } from '@/app/lib/schwab-data';

export const dynamic = 'force-dynamic';

// ─── TECHNICAL HELPERS ───────────────────────────────────
function calcEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return Math.round(ema * 100) / 100;
}

function calcRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * 13 + (diff > 0 ? diff : 0)) / 14;
    avgLoss = (avgLoss * 13 + (diff < 0 ? Math.abs(diff) : 0)) / 14;
  }
  if (avgLoss === 0) return 100;
  return Math.round(100 - (100 / (1 + avgGain / avgLoss)));
}

function pctChange(current: number, previous: number): number {
  if (!previous) return 0;
  return Math.round(((current - previous) / previous) * 100 * 100) / 100;
}

// ─── SYMBOLS ─────────────────────────────────────────────
const MARKET_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', '$VIX.X'];

const SECTOR_ETFS = [
  { symbol: 'XLK', name: 'Technology' },
  { symbol: 'XLF', name: 'Financials' },
  { symbol: 'XLE', name: 'Energy' },
  { symbol: 'XLV', name: 'Healthcare' },
  { symbol: 'XLI', name: 'Industrials' },
  { symbol: 'XLP', name: 'Consumer Staples' },
  { symbol: 'XLY', name: 'Consumer Disc.' },
  { symbol: 'XLU', name: 'Utilities' },
  { symbol: 'XLB', name: 'Materials' },
  { symbol: 'XLRE', name: 'Real Estate' },
  { symbol: 'XLC', name: 'Communication' },
];

// Breadth proxies — equal-weight vs cap-weight divergence
const BREADTH_SYMBOLS = ['RSP', 'SPY']; // RSP = equal-weight S&P, SPY = cap-weighted

export async function GET(req: NextRequest) {
  const useSchwab = await isAuthenticated();
  
  if (!useSchwab) {
    return NextResponse.json({ error: 'Schwab not connected. Market Pulse requires Schwab API.' });
  }

  try {
    // 1. Fetch all quotes in one batch
    const allSymbols = [...MARKET_SYMBOLS, ...SECTOR_ETFS.map(s => s.symbol), ...BREADTH_SYMBOLS];
    const quotes = await getQuotes([...new Set(allSymbols)]);

    // 2. Get VIX data
    const vixQuote = quotes['$VIX.X']?.quote || quotes['VIX']?.quote;
    const vixPrice = vixQuote?.lastPrice || vixQuote?.closePrice || 0;
    let vixChange = vixQuote?.netPercentChangeInDouble || 0;

    // Fallback: calculate VIX change from close vs last price or previous close
    if (!vixChange && vixPrice > 0) {
      // Try closePrice (previous session close) vs lastPrice
      const prevClose = vixQuote?.closePrice || vixQuote?.previousClose || vixQuote?.regularMarketLastPrice || 0;
      if (prevClose > 0 && prevClose !== vixPrice) {
        vixChange = Math.round(((vixPrice - prevClose) / prevClose) * 10000) / 100;
      }
      // If still 0, try price history
      if (!vixChange) {
        for (const vixSym of ['$VIX.X', 'VIX', '$VIX']) {
          try {
            const hist = await getPriceHistory(vixSym, { periodType: 'month', period: 1, frequencyType: 'daily', frequency: 1 });
            const candles = hist.candles || [];
            if (candles.length >= 1) {
              const pc = candles[candles.length - 1]?.close || 0;
              if (pc > 0) { vixChange = Math.round(((vixPrice - pc) / pc) * 10000) / 100; break; }
            }
          } catch {}
        }
      }
    }
    
    // VIX context
    let vixRegime = 'unknown';
    let vixContext = '';
    if (vixPrice < 15) { vixRegime = 'complacency'; vixContext = 'Extremely low fear — premium is cheap, be cautious of complacency'; }
    else if (vixPrice < 20) { vixRegime = 'calm'; vixContext = 'Normal conditions — steady premium selling environment'; }
    else if (vixPrice < 25) { vixRegime = 'elevated'; vixContext = 'Elevated uncertainty — premium is getting fatter, good for sellers'; }
    else if (vixPrice < 30) { vixRegime = 'fear'; vixContext = 'Fear in the market — fat premium, but widen strikes and shorten DTE'; }
    else { vixRegime = 'panic'; vixContext = 'Panic selling — extreme premium but high risk, go small and wide'; }

    // 3. Market indices — fetch price history for change fallback
    const indices = [];
    for (const sym of ['SPY', 'QQQ', 'IWM', 'DIA']) {
      const q = quotes[sym]?.quote;
      const price = q?.lastPrice || q?.closePrice || 0;
      let change = q?.netPercentChangeInDouble || 0;

      // Fallback: calculate from price history if quote change is 0
      if (!change && price > 0) {
        try {
          const hist = await getPriceHistory(sym, {
            periodType: 'month', period: 1, frequencyType: 'daily', frequency: 1,
          });
          const candles = hist.candles || [];
          if (candles.length >= 2) {
            // Use second-to-last candle as previous close (last may be today's partial)
            const prevClose = candles[candles.length - 1]?.close || 0;
            if (prevClose > 0) {
              change = Math.round(((price - prevClose) / prevClose) * 10000) / 100;
            }
          }
        } catch {}
      }

      indices.push({
        symbol: sym,
        price,
        change,
        volume: q?.totalVolume || 0,
        high52: q?.['52WkHigh'] || 0,
        low52: q?.['52WkLow'] || 0,
      });
    }

    // 4. Sector performance with momentum
    const sectorData = [];
    for (const sector of SECTOR_ETFS) {
      const q = quotes[sector.symbol]?.quote;
      if (!q) continue;
      
      const price = q.lastPrice || q.closePrice || 0;
      let change1d = q.netPercentChangeInDouble || 0;
      
      // Get price history for momentum calculations
      let change1w = 0, change1m = 0, change3m = 0, rsi = 50;
      try {
        const hist = await getPriceHistory(sector.symbol, {
          periodType: 'month', period: 3, frequencyType: 'daily', frequency: 1,
        });
        const candles = hist.candles || [];
        if (candles.length > 5) {
          const closes = candles.map((c: any) => c.close);

          // Fallback: calculate 1d change from candle data if quote doesn't have it
          if (!change1d && price > 0 && closes.length >= 1) {
            const prevClose = closes[closes.length - 1] || 0;
            if (prevClose > 0) change1d = pctChange(price, prevClose);
          }

          change1w = pctChange(price, closes[closes.length - 6] || price);
          if (closes.length > 22) change1m = pctChange(price, closes[closes.length - 23] || price);
          if (closes.length > 63) change3m = pctChange(price, closes[closes.length - 64] || price);
          rsi = calcRSI(closes) || 50;
        }
      } catch {}

      sectorData.push({
        symbol: sector.symbol,
        name: sector.name,
        price,
        change1d,
        change1w,
        change1m,
        change3m,
        rsi,
      });
    }
    
    // Sort by 1-week momentum
    sectorData.sort((a, b) => b.change1w - a.change1w);

    // 5. Breadth — RSP vs SPY divergence
    const rspQuote = quotes['RSP']?.quote;
    const spyQuote = quotes['SPY']?.quote;
    let rspChange = rspQuote?.netPercentChangeInDouble || 0;
    let spyChange = spyQuote?.netPercentChangeInDouble || 0;

    // Fallback: calculate from price history if quote returns 0
    if (!rspChange && rspQuote) {
      try {
        const hist = await getPriceHistory('RSP', { periodType: 'month', period: 1, frequencyType: 'daily', frequency: 1 });
        const candles = hist.candles || [];
        const price = rspQuote.lastPrice || rspQuote.closePrice || 0;
        if (candles.length >= 1 && price > 0) {
          const prevClose = candles[candles.length - 1]?.close || 0;
          if (prevClose > 0) rspChange = Math.round(((price - prevClose) / prevClose) * 10000) / 100;
        }
      } catch {}
    }
    if (!spyChange && spyQuote) {
      try {
        const hist = await getPriceHistory('SPY', { periodType: 'month', period: 1, frequencyType: 'daily', frequency: 1 });
        const candles = hist.candles || [];
        const price = spyQuote.lastPrice || spyQuote.closePrice || 0;
        if (candles.length >= 1 && price > 0) {
          const prevClose = candles[candles.length - 1]?.close || 0;
          if (prevClose > 0) spyChange = Math.round(((price - prevClose) / prevClose) * 10000) / 100;
        }
      } catch {}
    }

    const breadthDivergence = Math.round((rspChange - spyChange) * 100) / 100;
    
    let breadthSignal = 'neutral';
    let breadthContext = '';
    if (breadthDivergence > 0.5) { breadthSignal = 'broadening'; breadthContext = 'Equal-weight outperforming — broad market participation, healthy rally'; }
    else if (breadthDivergence < -0.5) { breadthSignal = 'narrowing'; breadthContext = 'Cap-weight outperforming — narrow leadership, mega-caps carrying the market'; }
    else { breadthSignal = 'neutral'; breadthContext = 'Breadth is balanced — no significant divergence'; }

    // 6. SPY technicals
    let spyTechnicals: any = {};
    try {
      const hist = await getPriceHistory('SPY', {
        periodType: 'year', period: 1, frequencyType: 'daily', frequency: 1,
      });
      const candles = hist.candles || [];
      if (candles.length > 20) {
        const closes = candles.map((c: any) => c.close);
        const spyPrice = indices[0].price;
        const ema20 = calcEMA(closes, 20);
        const ema50 = calcEMA(closes, 50);
        const ema200 = calcEMA(closes, 200);
        const rsi = calcRSI(closes);

        let trend = 'mixed';
        if (ema20 && ema50 && ema200 && spyPrice > ema20 && spyPrice > ema50 && spyPrice > ema200) trend = 'strong_uptrend';
        else if (ema50 && ema200 && spyPrice > ema50 && spyPrice > ema200) trend = 'uptrend';
        else if (ema50 && ema200 && spyPrice < ema50 && spyPrice < ema200) trend = 'downtrend';
        else if (ema20 && ema50 && ema200 && spyPrice < ema20 && spyPrice < ema50 && spyPrice < ema200) trend = 'strong_downtrend';

        spyTechnicals = { ema20, ema50, ema200, rsi, trend };
      }
    } catch {}

    // 7. Fear & Greed Composite (0-100, 50 = neutral)
    let fgScore = 50;
    const fgComponents: any[] = [];
    
    // VIX component (inverted — low VIX = greed, high VIX = fear)
    const vixComponent = vixPrice < 15 ? 85 : vixPrice < 18 ? 70 : vixPrice < 22 ? 55 : vixPrice < 28 ? 35 : vixPrice < 35 ? 20 : 10;
    fgComponents.push({ name: 'VIX Level', value: vixComponent, weight: 0.30 });

    // RSI component (high RSI = greed, low = fear)
    const spyRSI = spyTechnicals.rsi || 50;
    const rsiComponent = spyRSI > 70 ? 85 : spyRSI > 60 ? 70 : spyRSI > 45 ? 55 : spyRSI > 35 ? 35 : 15;
    fgComponents.push({ name: 'SPY RSI', value: rsiComponent, weight: 0.20 });

    // Trend component
    const trendMap: Record<string, number> = { strong_uptrend: 80, uptrend: 65, mixed: 50, downtrend: 35, strong_downtrend: 15 };
    const trendComponent = trendMap[spyTechnicals.trend] || 50;
    fgComponents.push({ name: 'Trend', value: trendComponent, weight: 0.25 });

    // Breadth component
    const breadthComponent = breadthDivergence > 1 ? 75 : breadthDivergence > 0 ? 60 : breadthDivergence > -0.5 ? 45 : 30;
    fgComponents.push({ name: 'Breadth', value: breadthComponent, weight: 0.15 });

    // Sector rotation (defensives outperforming = fear)
    const xlpChange = sectorData.find(s => s.symbol === 'XLP')?.change1w || 0;
    const xluChange = sectorData.find(s => s.symbol === 'XLU')?.change1w || 0;
    const xlkChange = sectorData.find(s => s.symbol === 'XLK')?.change1w || 0;
    const defensiveStrength = (xlpChange + xluChange) / 2;
    const offensiveStrength = xlkChange;
    const rotationComponent = offensiveStrength > defensiveStrength + 1 ? 75 : offensiveStrength > defensiveStrength ? 60 : 40;
    fgComponents.push({ name: 'Rotation', value: rotationComponent, weight: 0.10 });

    fgScore = Math.round(fgComponents.reduce((sum, c) => sum + c.value * c.weight, 0));

    let fgLabel = 'Neutral';
    let fgColor = '#eab308';
    if (fgScore >= 75) { fgLabel = 'Extreme Greed'; fgColor = '#22c55e'; }
    else if (fgScore >= 60) { fgLabel = 'Greed'; fgColor = '#86efac'; }
    else if (fgScore >= 45) { fgLabel = 'Neutral'; fgColor = '#eab308'; }
    else if (fgScore >= 30) { fgLabel = 'Fear'; fgColor = '#fb923c'; }
    else { fgLabel = 'Extreme Fear'; fgColor = '#ef4444'; }

    // 8. Premium selling recommendation
    let premiumRec = '';
    if (fgScore <= 30 && vixPrice > 25) premiumRec = 'Fat premium available — sell puts on quality names, but go wide (2+ strikes OTM) and short DTE (7-21 days). Scale in, don\'t go all-in.';
    else if (fgScore <= 45) premiumRec = 'Elevated premium — good environment for CSP and credit spreads. Favor 25-45 DTE with 0.20-0.25 delta.';
    else if (fgScore <= 60) premiumRec = 'Normal conditions — standard premium selling. Stick to your system. 0.25-0.30 delta, 25-45 DTE.';
    else if (fgScore <= 75) premiumRec = 'Premium is thinning — be selective. Favor calendar presses and PMCC over naked CSP. Consider tightening position sizes.';
    else premiumRec = 'Extreme complacency — premium is cheap and risk is underpriced. Reduce exposure, keep positions small, focus on defined-risk strategies (spreads, IC).';

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      vix: { price: vixPrice, change: vixChange, regime: vixRegime, context: vixContext },
      indices,
      sectors: sectorData,
      breadth: { rspChange, spyChange, divergence: breadthDivergence, signal: breadthSignal, context: breadthContext },
      spyTechnicals,
      fearGreed: { score: fgScore, label: fgLabel, color: fgColor, components: fgComponents },
      premiumRec,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
