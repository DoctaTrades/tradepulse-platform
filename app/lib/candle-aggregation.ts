// Candle aggregation helpers — calendar-anchored, year-bounded.
//
// CORE RULES (per Patrick's specification):
// 1. Every timeframe (daily-period, weekly, monthly) respects calendar
//    year boundaries for aggregation. Candles truncate at Dec 31 and
//    the new year starts fresh aggregation at the first applicable
//    anchor day (first trading day for daily/monthly, first Monday for
//    weekly).
// 2. Year-end leftover candles can be shorter than normal — a 10D
//    candle might end up being 4 days long if that's all that remained
//    in the year. Same for 2W, 3W, 2M, 3M, etc.
// 3. Strat classification walks across year boundaries naturally. The
//    classifier doesn't care what year a candle belongs to — it only
//    compares each candle to the one immediately before it in the
//    continuous chronological sequence. This means Jan 2 2026's 10D
//    candle is classified relative to Dec 17 2025's 10D candle, which
//    is exactly how TradingView displays it.
// 4. These functions return the full continuous sequence across all
//    years present in the input data. Downstream code (like
//    getStratSequence in strat-matrix/route.ts) is responsible for
//    showing only the most recent N candles for display.
//
// SCHWAB DATETIME FORMAT (verified April 12, 2026):
// Schwab stamps daily candles at 05:00 UTC which consistently falls
// within the correct ET calendar date. JS getDay/getMonth/getFullYear
// return correct values without timezone conversion. If Schwab ever
// changes this, weekly/monthly grouping could silently shift by one
// day. Re-run the DT-DEBUG diagnostic to investigate.

/**
 * Group candles by calendar year using getFullYear().
 * Returns a Map where keys are year numbers (e.g., 2025, 2026) and
 * values are arrays of candles sorted chronologically.
 */
function groupByYear(candles: any[]): Map<number, any[]> {
  const sorted = [...candles]
    .filter(c => typeof c?.datetime === 'number')
    .sort((a, b) => a.datetime - b.datetime);
  const groups = new Map<number, any[]>();
  for (const c of sorted) {
    const year = new Date(c.datetime).getFullYear();
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year)!.push(c);
  }
  return groups;
}

/**
 * Combine an array of candles into one aggregated candle.
 * Used by all three aggregation functions.
 */
function mergeCandles(chunk: any[]): any {
  return {
    datetime: chunk[0].datetime,
    open: chunk[0].open,
    high: Math.max(...chunk.map((c: any) => c.high)),
    low: Math.min(...chunk.map((c: any) => c.low)),
    close: chunk[chunk.length - 1].close,
    volume: chunk.reduce((s: number, c: any) => s + (c.volume || 0), 0),
  };
}

/**
 * Aggregate daily candles into N-trading-day candles.
 * Each calendar year is anchored independently to its first trading
 * day. Year-end leftover chunks (if the year's trading day count
 * isn't divisible by `period`) become shorter final candles.
 *
 * @param dailyCandles - Schwab daily candles
 * @param period       - trading days per aggregated candle (2, 3, 4, ...)
 * @returns            - continuous chronological array of aggregated
 *                       candles across all years in the input
 */
export function aggregateCandlesByYear(dailyCandles: any[], period: number): any[] {
  if (!dailyCandles || dailyCandles.length === 0 || period < 1) return [];
  if (period === 1) {
    return [...dailyCandles]
      .filter(c => typeof c?.datetime === 'number')
      .sort((a, b) => a.datetime - b.datetime);
  }

  const byYear = groupByYear(dailyCandles);
  const yearKeys = Array.from(byYear.keys()).sort((a, b) => a - b);
  const result: any[] = [];

  for (const year of yearKeys) {
    const yearCandles = byYear.get(year)!;
    // Chunk forward from this year's first trading day in fixed groups
    // of `period`. The final chunk may be shorter (year-end leftover).
    for (let i = 0; i < yearCandles.length; i += period) {
      const chunk = yearCandles.slice(i, Math.min(i + period, yearCandles.length));
      if (chunk.length === 0) continue;
      result.push(mergeCandles(chunk));
    }
  }

  return result;
}

/**
 * Compute the Monday-of-week date object for a given candle datetime.
 * For Monday itself, returns that same day. For Tue/Wed/Thu/Fri, backs
 * up to the Monday of that week. Sunday and Saturday are defensive
 * fallbacks (should not occur in Schwab daily data).
 */
function mondayForCandle(datetime: number): Date {
  const d = new Date(datetime);
  const day = d.getDay();
  const offset = day === 0 ? 6 : day - 1;
  return new Date(d.getTime() - offset * 24 * 60 * 60 * 1000);
}

/**
 * Produce a stable YYYY-MM-DD key for a Date.
 */
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Aggregate daily candles into calendar-week-anchored candles.
 * Each weekly candle contains all trading days from Monday through
 * Friday of that calendar week (handling holiday-shortened weeks
 * naturally — fewer days, still one candle).
 *
 * Orphan days at the start of the year (trading days before the
 * first Monday of that year) are DROPPED from the weekly view.
 *
 * Each calendar year has its own independent multi-week anchor. A 4W
 * candle from 2025 may be a shorter-than-normal year-end leftover;
 * 2026's first 4W candle starts fresh at the first Monday of 2026.
 *
 * @param dailyCandles - Schwab daily candles
 * @param weekPeriod   - number of consecutive weeks per aggregated
 *                       candle (1 for 1W, 2 for 2W, 4 for 4W, etc.)
 * @returns            - continuous chronological array across all
 *                       years in the input
 */
export function aggregateCandlesByWeek(dailyCandles: any[], weekPeriod: number): any[] {
  if (!dailyCandles || dailyCandles.length === 0 || weekPeriod < 1) return [];

  // Step 1: group daily candles by their "Monday key" (YYYY-MM-DD of
  // the Monday that begins that week). Orphan days at the start of a
  // year produce a Monday key in the PRIOR year, which will be handled
  // correctly by step 2 (they get grouped into that prior year).
  const weekGroups = new Map<string, any[]>();
  const sorted = [...dailyCandles]
    .filter(c => typeof c?.datetime === 'number')
    .sort((a, b) => a.datetime - b.datetime);

  for (const c of sorted) {
    const monday = mondayForCandle(c.datetime);
    const key = dateKey(monday);
    if (!weekGroups.has(key)) weekGroups.set(key, []);
    weekGroups.get(key)!.push(c);
  }

  // Step 2: produce weekly candles, ordered by Monday date. But we
  // need to ALSO track which year each weekly candle "belongs to" for
  // the multi-week year-boundary reset logic.
  //
  // A weekly candle belongs to the year of its Monday key. So the
  // week of Dec 29 2025 (Mon) is a 2025 week even if some of its
  // trading days are in early Jan 2026. Conversely, orphan days like
  // Jan 2 2026 (Fri) that back-compute to Dec 29 2025 Monday will
  // join the Dec 29 2025 weekly candle — which is correct TradingView
  // behavior (that week spans the year boundary in ONE weekly candle).
  //
  // HOWEVER: Patrick's rule says weekly candles truncate at year-end.
  // So the Dec 29 2025 weekly candle contains only Dec 29, 30, 31
  // (2025 days). Jan 2 2026 is an orphan day of 2026 and per the
  // "drop orphans" rule is excluded from the weekly view entirely.
  //
  // Therefore: when producing weekly candles, we filter out any days
  // from the wrong year. The Monday key determines which year a
  // weekly candle belongs to; days in the group from different years
  // are excluded.
  const sortedKeys = Array.from(weekGroups.keys()).sort();
  const weeklyCandles: { year: number; candle: any }[] = [];

  for (const key of sortedKeys) {
    const group = weekGroups.get(key)!;
    const weekYear = parseInt(key.slice(0, 4), 10);
    // Filter to only days in the same year as the Monday key.
    // This enforces Patrick's "candles truncate at year-end" rule.
    const sameYearDays = group.filter(c => {
      return new Date(c.datetime).getFullYear() === weekYear;
    });
    if (sameYearDays.length === 0) continue;
    weeklyCandles.push({
      year: weekYear,
      candle: mergeCandles(sameYearDays),
    });
  }

  // Step 3: if weekPeriod is 1, return the weekly candles directly
  if (weekPeriod === 1) {
    return weeklyCandles.map(w => w.candle);
  }

  // Step 4: for multi-week periods, group weekly candles BY YEAR and
  // chunk each year's weekly candles forward in groups of weekPeriod.
  // Year-end leftovers produce shorter final chunks. Each new year
  // starts a fresh multi-week anchor.
  const byYear = new Map<number, any[]>();
  for (const { year, candle } of weeklyCandles) {
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(candle);
  }

  const result: any[] = [];
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  for (const year of years) {
    const yearWeeks = byYear.get(year)!;
    for (let i = 0; i < yearWeeks.length; i += weekPeriod) {
      const chunk = yearWeeks.slice(i, Math.min(i + weekPeriod, yearWeeks.length));
      if (chunk.length === 0) continue;
      result.push(mergeCandles(chunk));
    }
  }

  return result;
}

/**
 * Aggregate daily candles into calendar-month-anchored candles.
 * Each monthly candle contains all trading days in that calendar
 * month. The first trading day of each month opens the candle.
 *
 * Each year's multi-month (2M, 3M) anchor resets at January. A 3M
 * candle from 2025 may be a shorter year-end leftover (e.g., Dec
 * alone if the year didn't divide evenly); 2026's first 3M candle
 * starts fresh at January 2026.
 *
 * @param dailyCandles - Schwab daily candles
 * @param monthPeriod  - consecutive months per aggregated candle
 * @returns            - continuous chronological array across all
 *                       years in the input
 */
export function aggregateCandlesByMonth(dailyCandles: any[], monthPeriod: number): any[] {
  if (!dailyCandles || dailyCandles.length === 0 || monthPeriod < 1) return [];

  // Step 1: group all candles by year+month key (e.g., "2026-01")
  const monthGroups = new Map<string, any[]>();
  const sorted = [...dailyCandles]
    .filter(c => typeof c?.datetime === 'number')
    .sort((a, b) => a.datetime - b.datetime);

  for (const c of sorted) {
    const d = new Date(c.datetime);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!monthGroups.has(key)) monthGroups.set(key, []);
    monthGroups.get(key)!.push(c);
  }

  // Step 2: produce one monthly candle per year+month, sorted chronologically
  const sortedKeys = Array.from(monthGroups.keys()).sort();
  const monthlyCandles: { year: number; candle: any }[] = [];
  for (const key of sortedKeys) {
    const group = monthGroups.get(key)!;
    if (group.length === 0) continue;
    const year = parseInt(key.slice(0, 4), 10);
    monthlyCandles.push({
      year,
      candle: mergeCandles(group),
    });
  }

  // Step 3: if monthPeriod is 1, return monthly candles directly
  if (monthPeriod === 1) {
    return monthlyCandles.map(m => m.candle);
  }

  // Step 4: for multi-month periods, group monthly candles BY YEAR
  // and chunk each year's monthly candles forward in groups.
  const byYear = new Map<number, any[]>();
  for (const { year, candle } of monthlyCandles) {
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(candle);
  }

  const result: any[] = [];
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  for (const year of years) {
    const yearMonths = byYear.get(year)!;
    for (let i = 0; i < yearMonths.length; i += monthPeriod) {
      const chunk = yearMonths.slice(i, Math.min(i + monthPeriod, yearMonths.length));
      if (chunk.length === 0) continue;
      result.push(mergeCandles(chunk));
    }
  }

  return result;
}
