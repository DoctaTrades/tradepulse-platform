import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FMP_KEY = process.env.FMP_API_KEY || '';
const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

async function fmpFetch(endpoint: string) {
  const url = `${FMP_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${FMP_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP API ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: 'Missing ticker parameter' });
  if (!FMP_KEY) return NextResponse.json({ error: 'FMP API key not configured' });

  try {
    // Fetch all data in parallel
    const [profileArr, ratiosArr, incomeArr, balanceArr, cashFlowArr, quoteArr, ratingArr, analystArr, earningsArr, growthArr] = await Promise.all([
      fmpFetch(`/profile/${ticker}`),
      fmpFetch(`/ratios-ttm/${ticker}`),
      fmpFetch(`/income-statement/${ticker}?period=annual&limit=5`),
      fmpFetch(`/balance-sheet-statement/${ticker}?period=annual&limit=3`),
      fmpFetch(`/cash-flow-statement/${ticker}?period=annual&limit=3`),
      fmpFetch(`/quote/${ticker}`),
      fmpFetch(`/rating/${ticker}`),
      fmpFetch(`/analyst-estimates/${ticker}?limit=4`),
      fmpFetch(`/earnings-surprises/${ticker}?limit=8`),
      fmpFetch(`/financial-growth/${ticker}?period=annual&limit=3`),
    ]);

    const profile = profileArr?.[0] || {};
    const ratios = ratiosArr?.[0] || {};
    const income = incomeArr || [];
    const balance = balanceArr || [];
    const cashFlow = cashFlowArr || [];
    const quote = quoteArr?.[0] || {};
    const rating = ratingArr?.[0] || {};
    const analysts = analystArr || [];
    const earnings = earningsArr || [];
    const growth = growthArr || [];

    // Current financials
    const latestIncome = income[0] || {};
    const prevIncome = income[1] || {};
    const latestBalance = balance[0] || {};
    const latestCashFlow = cashFlow[0] || {};
    const latestGrowth = growth[0] || {};

    // Revenue growth
    const revenueGrowth = latestGrowth.revenueGrowth ? Math.round(latestGrowth.revenueGrowth * 100 * 10) / 10 : null;
    const epsGrowth = latestGrowth.epsgrowth ? Math.round(latestGrowth.epsgrowth * 100 * 10) / 10 : null;

    // Margins
    const grossMargin = ratios.grossProfitMarginTTM ? Math.round(ratios.grossProfitMarginTTM * 100 * 10) / 10 : null;
    const netMargin = ratios.netProfitMarginTTM ? Math.round(ratios.netProfitMarginTTM * 100 * 10) / 10 : null;
    const operatingMargin = ratios.operatingProfitMarginTTM ? Math.round(ratios.operatingProfitMarginTTM * 100 * 10) / 10 : null;

    // Valuation
    const pe = ratios.peRatioTTM ? Math.round(ratios.peRatioTTM * 10) / 10 : quote.pe;
    const forwardPE = quote.priceEarningsRatio || null;
    const ps = ratios.priceToSalesRatioTTM ? Math.round(ratios.priceToSalesRatioTTM * 10) / 10 : null;
    const pb = ratios.priceToBookRatioTTM ? Math.round(ratios.priceToBookRatioTTM * 10) / 10 : null;
    const peg = ratios.pegRatioTTM ? Math.round(ratios.pegRatioTTM * 100) / 100 : null;

    // Debt & Balance Sheet
    const debtToEquity = ratios.debtEquityRatioTTM ? Math.round(ratios.debtEquityRatioTTM * 100) / 100 : null;
    const currentRatio = ratios.currentRatioTTM ? Math.round(ratios.currentRatioTTM * 100) / 100 : null;
    const totalDebt = latestBalance.totalDebt || 0;
    const totalCash = latestBalance.cashAndCashEquivalents || 0;
    const netDebt = totalDebt - totalCash;

    // Cash Flow
    const freeCashFlow = latestCashFlow.freeCashFlow || 0;
    const fcfMargin = latestIncome.revenue ? Math.round((freeCashFlow / latestIncome.revenue) * 100 * 10) / 10 : null;

    // Dividend
    const divYield = ratios.dividendYielTTM ? Math.round(ratios.dividendYielTTM * 100 * 100) / 100 : (profile.lastDiv && quote.price) ? Math.round((profile.lastDiv / quote.price) * 100 * 100) / 100 : 0;
    const payoutRatio = ratios.payoutRatioTTM ? Math.round(ratios.payoutRatioTTM * 100 * 10) / 10 : null;

    // Earnings surprises
    const earningsSurprises = earnings.slice(0, 4).map((e: any) => ({
      date: e.date,
      actual: e.actualEarningResult,
      estimated: e.estimatedEarning,
      surprise: e.actualEarningResult && e.estimatedEarning ? Math.round((e.actualEarningResult - e.estimatedEarning) * 100) / 100 : null,
      beat: e.actualEarningResult > e.estimatedEarning,
    }));
    const beatStreak = earningsSurprises.filter((e: any) => e.beat).length;

    // Revenue history (for chart data)
    const revenueHistory = income.slice(0, 5).reverse().map((i: any) => ({
      year: i.calendarYear || i.date?.substring(0, 4),
      revenue: i.revenue,
      netIncome: i.netIncome,
      eps: i.eps,
    }));

    // Analyst consensus
    const analystData = analysts[0] || {};
    const priceTarget = {
      avg: analystData.estimatedRevAvg ? null : null, // FMP uses different fields
    };

    // ─── HEALTH CHECK (stoplight system) ───
    const healthChecks: { name: string; value: string; score: 'green' | 'yellow' | 'red'; detail: string }[] = [];

    // Revenue Growth
    if (revenueGrowth !== null) {
      healthChecks.push({
        name: 'Revenue Growth',
        value: `${revenueGrowth}% YoY`,
        score: revenueGrowth > 20 ? 'green' : revenueGrowth > 5 ? 'yellow' : 'red',
        detail: revenueGrowth > 20 ? 'Strong growth' : revenueGrowth > 5 ? 'Moderate growth' : revenueGrowth > 0 ? 'Slow growth' : 'Revenue declining',
      });
    }

    // Profit Margins
    if (netMargin !== null) {
      healthChecks.push({
        name: 'Net Margin',
        value: `${netMargin}%`,
        score: netMargin > 15 ? 'green' : netMargin > 5 ? 'yellow' : 'red',
        detail: netMargin > 15 ? 'Highly profitable' : netMargin > 5 ? 'Decent profitability' : netMargin > 0 ? 'Thin margins' : 'Unprofitable',
      });
    }

    // Valuation
    if (pe) {
      healthChecks.push({
        name: 'Valuation (P/E)',
        value: `${pe}x`,
        score: pe < 20 ? 'green' : pe < 40 ? 'yellow' : 'red',
        detail: pe < 15 ? 'Cheap' : pe < 25 ? 'Fair value' : pe < 40 ? 'Premium — needs growth to justify' : 'Expensive — high expectations priced in',
      });
    }

    // Debt
    if (debtToEquity !== null) {
      healthChecks.push({
        name: 'Debt / Equity',
        value: `${debtToEquity}x`,
        score: debtToEquity < 0.5 ? 'green' : debtToEquity < 1.5 ? 'yellow' : 'red',
        detail: debtToEquity < 0.5 ? 'Low leverage — healthy' : debtToEquity < 1.5 ? 'Moderate debt' : 'High leverage — risky in downturns',
      });
    }

    // Free Cash Flow
    if (fcfMargin !== null) {
      healthChecks.push({
        name: 'Free Cash Flow',
        value: fcfMargin > 0 ? `${fcfMargin}% margin` : 'Negative',
        score: fcfMargin > 10 ? 'green' : fcfMargin > 0 ? 'yellow' : 'red',
        detail: fcfMargin > 10 ? 'Strong cash generation' : fcfMargin > 0 ? 'Positive but modest' : 'Burning cash',
      });
    }

    // Dividend
    if (divYield > 0) {
      healthChecks.push({
        name: 'Dividend',
        value: `${divYield}% yield`,
        score: divYield > 2 ? 'green' : divYield > 0.5 ? 'yellow' : 'yellow',
        detail: payoutRatio && payoutRatio > 80 ? 'High payout — may not be sustainable' : 'Dividend appears sustainable',
      });
    }

    // Earnings consistency
    healthChecks.push({
      name: 'Earnings Beats',
      value: `${beatStreak}/4 quarters`,
      score: beatStreak >= 3 ? 'green' : beatStreak >= 2 ? 'yellow' : 'red',
      detail: beatStreak >= 3 ? 'Consistently beating estimates' : beatStreak >= 2 ? 'Mixed results' : 'Missing estimates — caution',
    });

    // ─── TRADING CONTEXT ───
    let tradingContext = '';
    const overallScore = healthChecks.filter(h => h.score === 'green').length;
    const totalChecks = healthChecks.length;

    if (overallScore >= totalChecks * 0.7) {
      tradingContext = `Strong fundamentals make ${ticker} a quality Wheel/CSP candidate. If assigned, you're holding a solid company. `;
    } else if (overallScore >= totalChecks * 0.4) {
      tradingContext = `${ticker} has mixed fundamentals. Suitable for defined-risk strategies (spreads, IC) but think twice about Wheel/CSP where you might own shares. `;
    } else {
      tradingContext = `Weak fundamentals — avoid naked CSP on ${ticker}. If trading, use defined-risk (credit spreads) and keep position sizes small. `;
    }

    if (divYield > 2) tradingContext += `The ${divYield}% dividend provides a cushion if assigned on puts. `;
    if (pe && pe > 50 && revenueGrowth && revenueGrowth < 20) tradingContext += `Warning: high P/E with slowing growth — vulnerable to sharp selloffs. `;
    if (debtToEquity && debtToEquity > 2) tradingContext += `High debt makes this vulnerable in rising rate environments. `;

    return NextResponse.json({
      ticker,
      profile: {
        name: profile.companyName,
        sector: profile.sector,
        industry: profile.industry,
        description: profile.description,
        mktCap: profile.mktCap,
        employees: profile.fullTimeEmployees,
        exchange: profile.exchangeShortName,
        website: profile.website,
        image: profile.image,
      },
      quote: {
        price: quote.price,
        change: quote.change,
        changePct: quote.changesPercentage,
        volume: quote.volume,
        avgVolume: quote.avgVolume,
        high52: quote.yearHigh,
        low52: quote.yearLow,
        open: quote.open,
        high: quote.dayHigh,
        low: quote.dayLow,
      },
      valuation: { pe, forwardPE, ps, pb, peg },
      growth: { revenueGrowth, epsGrowth },
      margins: { gross: grossMargin, operating: operatingMargin, net: netMargin },
      debtHealth: { debtToEquity, currentRatio, totalDebt, totalCash, netDebt },
      cashFlow: { freeCashFlow, fcfMargin },
      dividend: { yield: divYield, payoutRatio },
      earnings: earningsSurprises,
      revenueHistory,
      healthChecks,
      tradingContext,
      rating: rating.ratingRecommendation || null,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
