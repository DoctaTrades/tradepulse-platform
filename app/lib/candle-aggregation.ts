// Candle aggregation helpers — calendar-anchored.
//
// THIS FILE: daily-period aggregation (2D, 3D, 4D, ... N trading days).
// NEXT SESSION: add true week-anchored and month-anchored aggregation
// (1W = calendar Mon-Fri, 1M = calendar month, etc.)
//
// Why this exists:
// The old aggregateCandles() functions in strat-matrix/route.ts and
// scan/equity/route.ts chunked daily candles starting from index 0 of
// whatever Schwab returned (typically ~1 year of rolling daily data
// from today backwards). That means "the first 2D candle" was anchored
// to whatever day Schwab's earliest returned candle happened to be —
// NOT to the start of the calendar year. As a result, the displayed
// Strat sequences for 2D, 3D, etc. were shifted relative to what
// TradingView shows (TradingView anchors to calendar boundaries).
//
// This function fixes that: it filters to the current calendar year
// first, then chunks forward from the first trading day of that year.

/**
 * Aggregate daily candles into N-trading-day candles, anchored to the
 * first trading day of the current calendar year.
 *
 * @param dailyCandles - Schwab daily candles, each with `datetime` (ms),
 *                       `open`, `high`, `low`, `close`, `volume`
 * @param period       - trading days per aggregated candle (2, 3, 4, ...)
 * @returns            - array of aggregated candles, oldest to newest,
 *                       including an in-progress "active" candle at the
 *                       end if the remainder isn't zero
 */
export function aggregateCandlesByYear(dailyCandles: any[], period: number): any[] {
  if (!dailyCandles || dailyCandles.length === 0 || period < 1) return [];
  if (period === 1) return dailyCandles; // no aggregation needed for 1D

  // Step 1: determine the current year from the most recent candle.
  // We use the data itself rather than system clock so behavior is
  // consistent even if Schwab's data is slightly stale.
  const sorted = [...dailyCandles].sort((a, b) => (a.datetime || 0) - (b.datetime || 0));
  const latest = sorted[sorted.length - 1];
  if (!latest || typeof latest.datetime !== 'number') return [];
  const latestDate = new Date(latest.datetime);
  const currentYear = latestDate.getFullYear();

  // Step 2: filter to current-year candles only.
  // Year boundaries use local time from the Date object, which for
  // Schwab data reflects the market's ET session boundaries closely
  // enough for Strat classification purposes.
  const currentYearStart = new Date(currentYear, 0, 1).getTime();
  const nextYearStart = new Date(currentYear + 1, 0, 1).getTime();
  const filtered = sorted.filter(c => {
    const t = c.datetime || 0;
    return t >= currentYearStart && t < nextYearStart;
  });

  if (filtered.length === 0) return [];

  // Step 3: chunk forward from index 0 in fixed groups of `period`.
  // The last chunk may be incomplete — that's the active/in-progress
  // candle and we keep it.
  const result: any[] = [];
  for (let i = 0; i < filtered.length; i += period) {
    const chunk = filtered.slice(i, Math.min(i + period, filtered.length));
    if (chunk.length === 0) continue;
    result.push({
      datetime: chunk[0].datetime,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c: any) => c.high)),
      low: Math.min(...chunk.map((c: any) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s: number, c: any) => s + (c.volume || 0), 0),
    });
  }
  return result;
}
