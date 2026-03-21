// Candle Open Tracker for 2026
// Calculates which multi-timeframe candles open on each trading day
// Logic: TradingView-style anchoring
//   - Daily cycles (1D-12D): anchor to first trading day of year (Jan 2, 2026), count by trading days
//   - Weekly cycles (1W-12W): anchor to first Monday of year (Jan 5, 2026), count by weeks
//   - Monthly cycles (1M, 2M, 3M): first trading day of each month/period

// NYSE 2026 holidays (market closed)
const NYSE_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Jr. Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed, July 4 is Saturday)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
];

const holidaySet = new Set(NYSE_HOLIDAYS_2026);

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isHoliday(d: Date): boolean {
  return holidaySet.has(fmt(d));
}

function isTradingDay(d: Date): boolean {
  return !isWeekend(d) && !isHoliday(d);
}

// Build full array of 2026 trading days with index
function buildTradingDays(year: number = 2026): { date: string; index: number }[] {
  const days: { date: string; index: number }[] = [];
  const d = new Date(`${year}-01-01T12:00:00`);
  let idx = 0;
  while (d.getFullYear() === year) {
    if (isTradingDay(d)) {
      idx++;
      days.push({ date: fmt(d), index: idx });
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Build weekly anchors — every Monday (or next trading day if Monday is holiday)
function buildWeeklyAnchors(tradingDays: { date: string; index: number }[], year: number = 2026): string[] {
  const anchors: string[] = [];
  const d = new Date(`${year}-01-01T12:00:00`);
  // Find first Monday
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  
  while (d.getFullYear() === year) {
    // If Monday is a holiday, use next trading day
    const monday = new Date(d);
    while (!isTradingDay(monday) && monday.getFullYear() === year) {
      monday.setDate(monday.getDate() + 1);
    }
    if (monday.getFullYear() === year) {
      anchors.push(fmt(monday));
    }
    d.setDate(d.getDate() + 7);
  }
  return anchors;
}

// Build monthly anchors — first trading day of each month
function buildMonthlyAnchors(tradingDays: { date: string; index: number }[], year: number = 2026): string[] {
  const anchors: string[] = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(year, m, 1, 12, 0, 0);
    while (!isTradingDay(d) && d.getMonth() === m) {
      d.setDate(d.getDate() + 1);
    }
    if (d.getMonth() === m) anchors.push(fmt(d));
  }
  return anchors;
}

const DAILY_CYCLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WEEKLY_CYCLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MONTHLY_CYCLES = [1, 2, 3];

export interface CandleOpens {
  date: string;
  daily: number[];   // which D cycles open (e.g., [1, 2, 3, 6] = new 1D, 2D, 3D, 6D candle)
  weekly: number[];   // which W cycles open (e.g., [1, 2, 4])
  monthly: number[];  // which M cycles open (e.g., [1])
}

// Get candle opens for a specific date range
export function getCandleOpens(from: string, to: string): CandleOpens[] {
  const tradingDays = buildTradingDays(2026);
  const weeklyAnchors = buildWeeklyAnchors(tradingDays);
  const monthlyAnchors = buildMonthlyAnchors(tradingDays);

  const results: CandleOpens[] = [];

  for (const td of tradingDays) {
    if (td.date < from || td.date > to) continue;

    const daily: number[] = [];
    const weekly: number[] = [];
    const monthly: number[] = [];

    // Daily cycles: new N-day candle opens when (index - 1) % N === 0
    for (const n of DAILY_CYCLES) {
      if ((td.index - 1) % n === 0) daily.push(n);
    }

    // Weekly cycles: check which week index this is from the first Monday
    const weekIdx = weeklyAnchors.indexOf(td.date);
    if (weekIdx >= 0) {
      for (const n of WEEKLY_CYCLES) {
        if (weekIdx % n === 0) weekly.push(n);
      }
    }

    // Monthly cycles
    const monthIdx = monthlyAnchors.indexOf(td.date);
    if (monthIdx >= 0) {
      for (const n of MONTHLY_CYCLES) {
        if (monthIdx % n === 0) monthly.push(n);
      }
    }

    // Only include days with notable candle opens (skip days with just 1D)
    if (daily.length > 1 || weekly.length > 0 || monthly.length > 0) {
      results.push({ date: td.date, daily, weekly, monthly });
    }
  }

  return results;
}

// Format candle opens as a readable string
export function formatCandleOpens(opens: CandleOpens): string {
  const parts: string[] = [];
  if (opens.daily.length > 0) {
    parts.push(opens.daily.map(n => `${n}D`).join(', '));
  }
  if (opens.weekly.length > 0) {
    parts.push(opens.weekly.map(n => `${n}W`).join(', '));
  }
  if (opens.monthly.length > 0) {
    parts.push(opens.monthly.map(n => `${n}M`).join(', '));
  }
  return parts.join(' · ');
}

// Get a significance score (more candle opens = more significant day)
export function candleSignificance(opens: CandleOpens): 'high' | 'medium' | 'low' {
  const total = opens.daily.length + opens.weekly.length * 2 + opens.monthly.length * 3;
  if (total >= 10 || opens.monthly.length > 0) return 'high';
  if (total >= 5 || opens.weekly.length > 0) return 'medium';
  return 'low';
}
