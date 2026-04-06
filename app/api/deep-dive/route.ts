import { NextRequest, NextResponse } from 'next/server';
import { getSectorByTicker, SECTORS } from '@/app/lib/sector-holdings';

export const dynamic = 'force-dynamic';

// ─── API KEYS ────────────────────────────────────────────────
const FMP_KEY = process.env.FMP_API_KEY || '';
const FMP_BASE = 'https://financialmodelingprep.com/stable';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// ─── FETCH HELPERS ───────────────────────────────────────────

async function fmpFetch(endpoint: string, params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams({ ...params, apikey: FMP_KEY });
  const url = `${FMP_BASE}${endpoint}?${searchParams.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP API ${res.status}`);
  return res.json();
}

async function safeFmpFetch(endpoint: string, params: Record<string, string> = {}) {
  try { return await fmpFetch(endpoint, params); } catch { return []; }
}

async function finnhubFetch(endpoint: string, params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams({ ...params, token: FINNHUB_KEY });
  const url = `${FINNHUB_BASE}${endpoint}?${searchParams.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub API ${res.status}`);
  return res.json();
}

async function safeFinnhubFetch(endpoint: string, params: Record<string, string> = {}) {
  try { return await finnhubFetch(endpoint, params); } catch { return null; }
}

// Helper: first non-null/non-zero value
function pick(...vals: any[]) { for (const v of vals) { if (v !== null && v !== undefined && v !== 0 && v !== '') return v; } return null; }
function pickNum(...vals: any[]) { for (const v of vals) { if (v !== null && v !== undefined && v !== 0 && !isNaN(v)) return v; } return null; }
function round(n: number | null, decimals: number = 1) { if (n === null || n === undefined || isNaN(n)) return null; return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals); }

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: 'Missing ticker parameter' });
  if (!FMP_KEY && !FINNHUB_KEY) return NextResponse.json({ error: 'No data provider API keys configured' });

  try {
    // ─── PARALLEL FETCH: FMP + Finnhub ───────────────────────
    // FMP calls (primary source — may return empty on free tier for non-covered tickers)
    const fmpPromises = FMP_KEY ? [
      fmpFetch('/profile', { symbol: ticker }).catch(() => []),
      safeFmpFetch('/ratios-ttm', { symbol: ticker }),
      safeFmpFetch('/income-statement', { symbol: ticker, period: 'annual', limit: '5' }),
      safeFmpFetch('/balance-sheet-statement', { symbol: ticker, period: 'annual', limit: '3' }),
      safeFmpFetch('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '3' }),
      safeFmpFetch('/quote', { symbol: ticker }),
      safeFmpFetch('/rating', { symbol: ticker }),
      safeFmpFetch('/analyst-estimates', { symbol: ticker, limit: '4' }),
      safeFmpFetch('/earnings-surprises', { symbol: ticker, limit: '8' }),
      safeFmpFetch('/financial-growth', { symbol: ticker, period: 'annual', limit: '3' }),
    ] : Array(10).fill(Promise.resolve([]));

    // Finnhub calls (fallback — covers all US tickers)
    const finnhubPromises = FINNHUB_KEY ? [
      safeFinnhubFetch('/stock/profile2', { symbol: ticker }),
      safeFinnhubFetch('/stock/metric', { symbol: ticker, metric: 'all' }),
      safeFinnhubFetch('/calendar/earnings', { symbol: ticker }),
      safeFinnhubFetch('/stock/earnings', { symbol: ticker }),
      safeFinnhubFetch('/stock/recommendation', { symbol: ticker }),
      safeFinnhubFetch('/stock/insider-transactions', { symbol: ticker }),
      safeFinnhubFetch('/stock/peers', { symbol: ticker }),
    ] : Array(7).fill(Promise.resolve(null));

    const [fmpResults, finnhubResults] = await Promise.all([
      Promise.all(fmpPromises),
      Promise.all(finnhubPromises),
    ]);

    // ─── UNPACK FMP DATA ─────────────────────────────────────
    const [profileArr, ratiosArr, incomeArr, balanceArr, cashFlowArr, quoteArr, ratingArr, analystArr, earningsArr, growthArr] = fmpResults;
    const fmpProfile = profileArr?.[0] || {};
    const ratios = ratiosArr?.[0] || {};
    const income = incomeArr || [];
    const balance = balanceArr || [];
    const cashFlow = cashFlowArr || [];
    const fmpQuote = quoteArr?.[0] || {};
    const fmpRating = ratingArr?.[0] || {};
    const analysts = analystArr || [];
    const fmpEarnings = earningsArr || [];
    const growth = growthArr || [];

    // Did FMP return real data?
    const fmpHasData = !!fmpProfile.companyName;

    // ─── UNPACK FINNHUB DATA ─────────────────────────────────
    const [fhProfile, fhMetrics, fhEarningsCal, fhEarnings, fhRecommendations, fhInsider, fhPeers] = finnhubResults;
    const fhMetric = fhMetrics?.metric || {};

    // ─── MERGE: Profile ──────────────────────────────────────
    const companyName = pick(fmpProfile.companyName, fhProfile?.name);
    const price = pickNum(fmpProfile.price, fmpQuote.price) || 0;
    const mktCap = pickNum(fmpProfile.marketCap, fmpProfile.mktCap, fmpQuote.marketCap, fhProfile?.marketCapitalization ? fhProfile.marketCapitalization * 1e6 : null) || 0;

    // ─── MERGE: Financials ───────────────────────────────────
    const latestIncome = income[0] || {};
    const prevIncome = income[1] || {};
    const latestBalance = balance[0] || {};
    const latestCashFlow = cashFlow[0] || {};
    const latestGrowth = growth[0] || {};

    // Revenue growth
    let revenueGrowth = latestGrowth.revenueGrowth ? round(latestGrowth.revenueGrowth * 100) : null;
    if (revenueGrowth === null && latestIncome.revenue && prevIncome.revenue && prevIncome.revenue > 0) {
      revenueGrowth = round(((latestIncome.revenue - prevIncome.revenue) / prevIncome.revenue) * 100);
    }
    if (revenueGrowth === null && fhMetric.revenueGrowthQuarterlyYoy) {
      revenueGrowth = round(fhMetric.revenueGrowthQuarterlyYoy);
    }

    // EPS growth
    let epsGrowth = latestGrowth.epsgrowth ? round(latestGrowth.epsgrowth * 100) : null;
    if (epsGrowth === null && latestIncome.eps && prevIncome.eps && prevIncome.eps > 0) {
      epsGrowth = round(((latestIncome.eps - prevIncome.eps) / prevIncome.eps) * 100);
    }
    if (epsGrowth === null && fhMetric.epsGrowthQuarterlyYoy) {
      epsGrowth = round(fhMetric.epsGrowthQuarterlyYoy);
    }

    // Margins
    const grossMargin = pickNum(
      ratios.grossProfitMarginTTM ? round(ratios.grossProfitMarginTTM * 100) : null,
      (latestIncome.grossProfit && latestIncome.revenue) ? round((latestIncome.grossProfit / latestIncome.revenue) * 100) : null,
      fhMetric.grossMarginTTM ? round(fhMetric.grossMarginTTM) : null,
    );
    const operatingMargin = pickNum(
      ratios.operatingProfitMarginTTM ? round(ratios.operatingProfitMarginTTM * 100) : null,
      (latestIncome.operatingIncome && latestIncome.revenue) ? round((latestIncome.operatingIncome / latestIncome.revenue) * 100) : null,
      fhMetric.operatingMarginTTM ? round(fhMetric.operatingMarginTTM) : null,
    );
    const netMargin = pickNum(
      ratios.netProfitMarginTTM ? round(ratios.netProfitMarginTTM * 100) : null,
      (latestIncome.netIncome && latestIncome.revenue) ? round((latestIncome.netIncome / latestIncome.revenue) * 100) : null,
      fhMetric.netProfitMarginTTM ? round(fhMetric.netProfitMarginTTM) : null,
    );

    // Valuation
    const eps = latestIncome.eps || fhMetric.epsBasicExclExtraItemsTTM || 0;
    const pe = pickNum(
      ratios.peRatioTTM ? round(ratios.peRatioTTM) : null,
      (price && eps && eps > 0) ? round(price / eps) : null,
      fhMetric.peBasicExclExtraTTM ? round(fhMetric.peBasicExclExtraTTM) : null,
    );
    const forwardPE = pickNum(fmpQuote.priceEarningsRatio, fhMetric.peTTM ? round(fhMetric.peTTM) : null);
    const ps = pickNum(
      ratios.priceToSalesRatioTTM ? round(ratios.priceToSalesRatioTTM) : null,
      (mktCap && latestIncome.revenue && latestIncome.revenue > 0) ? round(mktCap / latestIncome.revenue) : null,
      fhMetric.psTTM ? round(fhMetric.psTTM) : null,
    );
    const totalEquity = latestBalance.totalStockholdersEquity || latestBalance.totalEquity || 0;
    const pb = pickNum(
      ratios.priceToBookRatioTTM ? round(ratios.priceToBookRatioTTM) : null,
      (mktCap && totalEquity && totalEquity > 0) ? round(mktCap / totalEquity) : null,
      fhMetric.pbAnnual ? round(fhMetric.pbAnnual) : null,
    );
    const peg = pickNum(
      ratios.pegRatioTTM ? round(ratios.pegRatioTTM, 2) : null,
      (pe && epsGrowth && epsGrowth > 0) ? round(pe / epsGrowth, 2) : null,
    );
    const evToEbitda = pickNum(fhMetric.currentEv && fhMetric.ebitdaTTM ? round(fhMetric.currentEv / fhMetric.ebitdaTTM) : null);

    // Debt & Balance Sheet
    const totalDebt = latestBalance.totalDebt || latestBalance.longTermDebt || 0;
    const totalCash = latestBalance.cashAndCashEquivalents || latestBalance.cashAndShortTermInvestments || 0;
    const netDebt = totalDebt - totalCash;
    const debtToEquity = pickNum(
      ratios.debtEquityRatioTTM ? round(ratios.debtEquityRatioTTM, 2) : null,
      (totalDebt && totalEquity && totalEquity > 0) ? round(totalDebt / totalEquity, 2) : null,
      fhMetric.totalDebtToEquityAnnual ? round(fhMetric.totalDebtToEquityAnnual / 100, 2) : null,
    );
    const currentRatio = pickNum(
      ratios.currentRatioTTM ? round(ratios.currentRatioTTM, 2) : null,
      (latestBalance.totalCurrentAssets && latestBalance.totalCurrentLiabilities && latestBalance.totalCurrentLiabilities > 0)
        ? round(latestBalance.totalCurrentAssets / latestBalance.totalCurrentLiabilities, 2) : null,
      fhMetric.currentRatioAnnual ? round(fhMetric.currentRatioAnnual, 2) : null,
    );

    // Cash Flow
    const freeCashFlow = latestCashFlow.freeCashFlow || (fhMetric.freeCashFlowTTM ? fhMetric.freeCashFlowTTM * 1e6 : 0);
    const fcfRevenue = latestIncome.revenue || (fhMetric.revenueTTM ? fhMetric.revenueTTM * 1e6 : 0);
    const fcfMargin = fcfRevenue ? round((freeCashFlow / fcfRevenue) * 100) : null;

    // Dividend
    const annualDiv = fmpProfile.lastDividend || fmpProfile.lastDiv || 0;
    const divYield = pickNum(
      ratios.dividendYielTTM ? round(ratios.dividendYielTTM * 100, 2) : null,
      (annualDiv && price && price > 0) ? round((annualDiv / price) * 100, 2) : null,
      fhMetric.dividendYieldIndicatedAnnual ? round(fhMetric.dividendYieldIndicatedAnnual, 2) : null,
    ) || 0;
    const payoutRatio = pickNum(
      ratios.payoutRatioTTM ? round(ratios.payoutRatioTTM * 100) : null,
      (annualDiv && eps && eps > 0) ? round((annualDiv / eps) * 100) : null,
      fhMetric.payoutRatioAnnual ? round(fhMetric.payoutRatioAnnual) : null,
    );

    // ─── MERGE: Earnings ─────────────────────────────────────
    let earningsSurprises: any[] = [];
    if (fmpEarnings.length > 0) {
      earningsSurprises = fmpEarnings.slice(0, 4).map((e: any) => ({
        date: e.date,
        actual: e.actualEarningResult,
        estimated: e.estimatedEarning,
        surprise: e.actualEarningResult && e.estimatedEarning ? round(e.actualEarningResult - e.estimatedEarning, 2) : null,
        beat: e.actualEarningResult > e.estimatedEarning,
      }));
    } else if (fhEarnings && Array.isArray(fhEarnings) && fhEarnings.length > 0) {
      earningsSurprises = fhEarnings.slice(0, 4).map((e: any) => ({
        date: e.period,
        actual: e.actual,
        estimated: e.estimate,
        surprise: e.actual !== null && e.estimate !== null ? round(e.actual - e.estimate, 2) : null,
        beat: e.actual > e.estimate,
      }));
    }
    const beatStreak = earningsSurprises.filter((e: any) => e.beat).length;

    // Next earnings date (Finnhub has confirmed dates)
    let nextEarningsDate: string | null = null;
    if (fhEarningsCal?.earningsCalendar?.length > 0) {
      const upcoming = fhEarningsCal.earningsCalendar.find((e: any) => new Date(e.date) >= new Date());
      if (upcoming) nextEarningsDate = upcoming.date;
    }

    // Revenue history
    const revenueHistory = income.length > 0
      ? income.slice(0, 5).reverse().map((i: any) => ({ year: i.calendarYear || i.date?.substring(0, 4), revenue: i.revenue, netIncome: i.netIncome, eps: i.eps }))
      : [];

    // ─── FINNHUB-ONLY DATA: Insider, Recommendations, Peers ──
    const insiderTransactions = (fhInsider?.data || []).slice(0, 10).map((t: any) => ({
      name: t.name, share: t.share, change: t.change,
      filingDate: t.filingDate, transactionType: t.transactionType,
    }));
    const insiderBuys = (fhInsider?.data || []).filter((t: any) => t.change > 0).length;
    const insiderSells = (fhInsider?.data || []).filter((t: any) => t.change < 0).length;
    const insiderSentiment = insiderBuys > insiderSells ? 'net-buyer' : insiderSells > insiderBuys ? 'net-seller' : 'neutral';

    const recommendations = (fhRecommendations || []).slice(0, 3).map((r: any) => ({
      period: r.period, buy: r.buy, hold: r.hold, sell: r.sell,
      strongBuy: r.strongBuy, strongSell: r.strongSell,
    }));
    const latestRec = recommendations[0] || {};
    const totalAnalysts = (latestRec.strongBuy || 0) + (latestRec.buy || 0) + (latestRec.hold || 0) + (latestRec.sell || 0) + (latestRec.strongSell || 0);
    const analystConsensus = totalAnalysts > 0
      ? ((latestRec.strongBuy || 0) + (latestRec.buy || 0)) / totalAnalysts >= 0.6 ? 'Buy'
        : ((latestRec.sell || 0) + (latestRec.strongSell || 0)) / totalAnalysts >= 0.4 ? 'Sell' : 'Hold'
      : null;

    const peers = (fhPeers || []).filter((p: string) => p !== ticker).slice(0, 8);

    // ─── HEALTH CHECK (stoplight system) ─────────────────────
    const healthChecks: { name: string; value: string; score: 'green' | 'yellow' | 'red'; detail: string }[] = [];

    if (revenueGrowth !== null) {
      healthChecks.push({ name: 'Revenue Growth', value: `${revenueGrowth}% YoY`,
        score: revenueGrowth > 20 ? 'green' : revenueGrowth > 5 ? 'yellow' : 'red',
        detail: revenueGrowth > 20 ? 'Strong growth' : revenueGrowth > 5 ? 'Moderate growth' : revenueGrowth > 0 ? 'Slow growth' : 'Revenue declining' });
    }
    if (netMargin !== null) {
      healthChecks.push({ name: 'Net Margin', value: `${netMargin}%`,
        score: netMargin > 15 ? 'green' : netMargin > 5 ? 'yellow' : 'red',
        detail: netMargin > 15 ? 'Highly profitable' : netMargin > 5 ? 'Decent profitability' : netMargin > 0 ? 'Thin margins' : 'Unprofitable' });
    }
    if (pe) {
      healthChecks.push({ name: 'Valuation (P/E)', value: `${pe}x`,
        score: pe < 20 ? 'green' : pe < 40 ? 'yellow' : 'red',
        detail: pe < 15 ? 'Cheap' : pe < 25 ? 'Fair value' : pe < 40 ? 'Premium — needs growth to justify' : 'Expensive — high expectations priced in' });
    }
    if (debtToEquity !== null) {
      healthChecks.push({ name: 'Debt / Equity', value: `${debtToEquity}x`,
        score: debtToEquity < 0.5 ? 'green' : debtToEquity < 1.5 ? 'yellow' : 'red',
        detail: debtToEquity < 0.5 ? 'Low leverage — healthy' : debtToEquity < 1.5 ? 'Moderate debt' : 'High leverage — risky in downturns' });
    }
    if (fcfMargin !== null) {
      healthChecks.push({ name: 'Free Cash Flow', value: fcfMargin > 0 ? `${fcfMargin}% margin` : 'Negative',
        score: fcfMargin > 10 ? 'green' : fcfMargin > 0 ? 'yellow' : 'red',
        detail: fcfMargin > 10 ? 'Strong cash generation' : fcfMargin > 0 ? 'Positive but modest' : 'Burning cash' });
    }
    if (divYield > 0) {
      healthChecks.push({ name: 'Dividend', value: `${divYield}% yield`,
        score: divYield > 2 ? 'green' : divYield > 0.5 ? 'yellow' : 'yellow',
        detail: payoutRatio && payoutRatio > 80 ? 'High payout — may not be sustainable' : 'Dividend appears sustainable' });
    }
    if (earningsSurprises.length > 0) {
      healthChecks.push({ name: 'Earnings Beats', value: `${beatStreak}/${earningsSurprises.length} quarters`,
        score: beatStreak >= 3 ? 'green' : beatStreak >= 2 ? 'yellow' : 'red',
        detail: beatStreak >= 3 ? 'Consistently beating estimates' : beatStreak >= 2 ? 'Mixed results' : 'Missing estimates — caution' });
    }
    if (insiderBuys + insiderSells > 0) {
      healthChecks.push({ name: 'Insider Activity', value: `${insiderBuys} buys / ${insiderSells} sells`,
        score: insiderSentiment === 'net-buyer' ? 'green' : insiderSentiment === 'neutral' ? 'yellow' : 'red',
        detail: insiderSentiment === 'net-buyer' ? 'Insiders are buying — bullish signal' : insiderSentiment === 'neutral' ? 'Mixed insider activity' : 'Insiders are selling — watch carefully' });
    }

    // ─── TRADING CONTEXT ─────────────────────────────────────
    let tradingContext = '';
    const overallScore = healthChecks.filter(h => h.score === 'green').length;
    const totalChecks = healthChecks.length;

    if (totalChecks === 0) {
      tradingContext = `Limited fundamental data available for ${ticker}. Use technical analysis and options chain data for trade decisions. `;
    } else if (overallScore >= totalChecks * 0.7) {
      tradingContext = `Strong fundamentals make ${ticker} a quality Wheel/CSP candidate. If assigned, you're holding a solid company. `;
    } else if (overallScore >= totalChecks * 0.4) {
      tradingContext = `${ticker} has mixed fundamentals. Suitable for defined-risk strategies (spreads, IC) but think twice about Wheel/CSP where you might own shares. `;
    } else {
      tradingContext = `Weak fundamentals — avoid naked CSP on ${ticker}. If trading, use defined-risk (credit spreads) and keep position sizes small. `;
    }

    if (divYield > 2) tradingContext += `The ${divYield}% dividend provides a cushion if assigned on puts. `;
    if (pe && pe > 50 && revenueGrowth && revenueGrowth < 20) tradingContext += `Warning: high P/E with slowing growth — vulnerable to sharp selloffs. `;
    if (debtToEquity && debtToEquity > 2) tradingContext += `High debt makes this vulnerable in rising rate environments. `;
    if (insiderSentiment === 'net-buyer') tradingContext += `Insider buying is a positive signal. `;
    if (insiderSentiment === 'net-seller' && insiderSells > 3) tradingContext += `Heavy insider selling — proceed with caution. `;
    if (nextEarningsDate) {
      const daysToEarnings = Math.round((new Date(nextEarningsDate).getTime() - Date.now()) / 86400000);
      if (daysToEarnings >= 0 && daysToEarnings <= 14) tradingContext += `⚠️ Earnings in ${daysToEarnings} days (${nextEarningsDate}) — avoid holding through earnings with open positions. `;
    }

    // Data source tracking
    const dataSources: string[] = [];
    if (fmpHasData) dataSources.push('FMP');
    if (fhProfile?.name) dataSources.push('Finnhub');

    return NextResponse.json({
      ticker,
      profile: {
        name: companyName,
        sector: pick(fmpProfile.sector, fhProfile?.finnhubIndustry),
        industry: pick(fmpProfile.industry, fhProfile?.finnhubIndustry),
        description: fmpProfile.description || null,
        mktCap,
        employees: pickNum(fmpProfile.fullTimeEmployees, fhProfile?.employeeTotal),
        exchange: pick(fmpProfile.exchange, fmpProfile.exchangeShortName, fhProfile?.exchange),
        website: pick(fmpProfile.website, fhProfile?.weburl),
        image: pick(fmpProfile.image, fhProfile?.logo),
      },
      quote: {
        price,
        change: fmpProfile.change || fmpQuote.change || 0,
        changePct: fmpProfile.changePercentage || fmpQuote.changesPercentage || 0,
        volume: fmpProfile.volume || fmpQuote.volume || 0,
        avgVolume: fmpProfile.averageVolume || fmpQuote.avgVolume || 0,
        high52: pickNum(fmpQuote.yearHigh, (fmpProfile.range ? parseFloat(fmpProfile.range.split('-')[1]) : null), fhMetric['52WeekHigh']) || 0,
        low52: pickNum(fmpQuote.yearLow, (fmpProfile.range ? parseFloat(fmpProfile.range.split('-')[0]) : null), fhMetric['52WeekLow']) || 0,
        open: fmpQuote.open || 0,
        high: fmpQuote.dayHigh || 0,
        low: fmpQuote.dayLow || 0,
      },
      valuation: { pe, forwardPE, ps, pb, peg, evToEbitda },
      growth: { revenueGrowth, epsGrowth },
      margins: { gross: grossMargin, operating: operatingMargin, net: netMargin },
      debtHealth: { debtToEquity, currentRatio, totalDebt, totalCash, netDebt },
      cashFlow: { freeCashFlow, fcfMargin },
      dividend: { yield: divYield, payoutRatio },
      earnings: earningsSurprises,
      nextEarningsDate,
      revenueHistory,
      healthChecks,
      tradingContext,
      rating: pick(fmpRating.ratingRecommendation, analystConsensus),
      // New Finnhub data
      insiderTransactions,
      insiderSentiment,
      recommendations,
      analystConsensus,
      totalAnalysts,
      peers,
      dataSources,
      // Sector ETF membership
      sectorETFs: (() => {
        const matches = SECTORS.filter(s => s.tickers.includes(ticker));
        return matches.map(s => ({ etf: s.etf, label: s.label, color: s.color, tickerCount: s.tickers.length }));
      })(),
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
