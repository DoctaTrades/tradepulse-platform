// 2026 US Economic Calendar - Major Market-Moving Events
// Sources: Federal Reserve (FOMC), Bureau of Labor Statistics (CPI, NFP), Bureau of Economic Analysis (GDP)
// Update annually in January with new year's schedule from official sources
// FOMC: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
// CPI: https://www.bls.gov/schedule/news_release/cpi.htm
// NFP: https://www.bls.gov/schedule/news_release/empsit.htm

export interface EconomicEvent {
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM ET
  event: string;
  impact: 'high' | 'medium' | 'low';
  category: string;    // FOMC | CPI | NFP | GDP | JOBLESS | PPI | RETAIL | PCE
  notes?: string;
}

export const ECONOMIC_CALENDAR_2026: EconomicEvent[] = [
  // ═══ FOMC MEETINGS (8 per year, statement at 2:00 PM ET, presser at 2:30 PM ET) ═══
  // * = Summary of Economic Projections (dot plot)
  { date: '2026-01-28', time: '14:00', event: 'FOMC Rate Decision', impact: 'high', category: 'FOMC', notes: 'Jan 27-28 meeting' },
  { date: '2026-03-18', time: '14:00', event: 'FOMC Rate Decision *', impact: 'high', category: 'FOMC', notes: 'Mar 17-18 meeting · SEP + Dot Plot' },
  { date: '2026-05-06', time: '14:00', event: 'FOMC Rate Decision', impact: 'high', category: 'FOMC', notes: 'May 5-6 meeting' },
  { date: '2026-06-17', time: '14:00', event: 'FOMC Rate Decision *', impact: 'high', category: 'FOMC', notes: 'Jun 16-17 meeting · SEP + Dot Plot' },
  { date: '2026-07-29', time: '14:00', event: 'FOMC Rate Decision', impact: 'high', category: 'FOMC', notes: 'Jul 28-29 meeting' },
  { date: '2026-09-16', time: '14:00', event: 'FOMC Rate Decision *', impact: 'high', category: 'FOMC', notes: 'Sep 15-16 meeting · SEP + Dot Plot' },
  { date: '2026-10-28', time: '14:00', event: 'FOMC Rate Decision', impact: 'high', category: 'FOMC', notes: 'Oct 27-28 meeting' },
  { date: '2026-12-09', time: '14:00', event: 'FOMC Rate Decision *', impact: 'high', category: 'FOMC', notes: 'Dec 8-9 meeting · SEP + Dot Plot' },

  // ═══ FOMC MINUTES (released 3 weeks after meeting) ═══
  { date: '2026-02-18', time: '14:00', event: 'FOMC Minutes (Jan)', impact: 'medium', category: 'FOMC' },
  { date: '2026-04-08', time: '14:00', event: 'FOMC Minutes (Mar)', impact: 'medium', category: 'FOMC' },
  { date: '2026-05-27', time: '14:00', event: 'FOMC Minutes (May)', impact: 'medium', category: 'FOMC' },
  { date: '2026-07-08', time: '14:00', event: 'FOMC Minutes (Jun)', impact: 'medium', category: 'FOMC' },
  { date: '2026-08-19', time: '14:00', event: 'FOMC Minutes (Jul)', impact: 'medium', category: 'FOMC' },
  { date: '2026-10-07', time: '14:00', event: 'FOMC Minutes (Sep)', impact: 'medium', category: 'FOMC' },
  { date: '2026-11-18', time: '14:00', event: 'FOMC Minutes (Oct)', impact: 'medium', category: 'FOMC' },

  // ═══ CPI (Consumer Price Index) - released ~10-15th of each month at 8:30 AM ET ═══
  { date: '2026-01-14', time: '08:30', event: 'CPI (Dec)', impact: 'high', category: 'CPI' },
  { date: '2026-02-13', time: '08:30', event: 'CPI (Jan)', impact: 'high', category: 'CPI' },
  { date: '2026-03-11', time: '08:30', event: 'CPI (Feb)', impact: 'high', category: 'CPI' },
  { date: '2026-04-10', time: '08:30', event: 'CPI (Mar)', impact: 'high', category: 'CPI' },
  { date: '2026-05-12', time: '08:30', event: 'CPI (Apr)', impact: 'high', category: 'CPI' },
  { date: '2026-06-10', time: '08:30', event: 'CPI (May)', impact: 'high', category: 'CPI' },
  { date: '2026-07-14', time: '08:30', event: 'CPI (Jun)', impact: 'high', category: 'CPI' },
  { date: '2026-08-12', time: '08:30', event: 'CPI (Jul)', impact: 'high', category: 'CPI' },
  { date: '2026-09-11', time: '08:30', event: 'CPI (Aug)', impact: 'high', category: 'CPI' },
  { date: '2026-10-13', time: '08:30', event: 'CPI (Sep)', impact: 'high', category: 'CPI' },
  { date: '2026-11-12', time: '08:30', event: 'CPI (Oct)', impact: 'high', category: 'CPI' },
  { date: '2026-12-10', time: '08:30', event: 'CPI (Nov)', impact: 'high', category: 'CPI' },

  // ═══ NFP (Non-Farm Payrolls / Employment Situation) - 1st Friday of month at 8:30 AM ET ═══
  { date: '2026-01-09', time: '08:30', event: 'Non-Farm Payrolls (Dec)', impact: 'high', category: 'NFP' },
  { date: '2026-02-06', time: '08:30', event: 'Non-Farm Payrolls (Jan)', impact: 'high', category: 'NFP' },
  { date: '2026-03-06', time: '08:30', event: 'Non-Farm Payrolls (Feb)', impact: 'high', category: 'NFP' },
  { date: '2026-04-03', time: '08:30', event: 'Non-Farm Payrolls (Mar)', impact: 'high', category: 'NFP' },
  { date: '2026-05-08', time: '08:30', event: 'Non-Farm Payrolls (Apr)', impact: 'high', category: 'NFP' },
  { date: '2026-06-05', time: '08:30', event: 'Non-Farm Payrolls (May)', impact: 'high', category: 'NFP' },
  { date: '2026-07-02', time: '08:30', event: 'Non-Farm Payrolls (Jun)', impact: 'high', category: 'NFP' },
  { date: '2026-08-07', time: '08:30', event: 'Non-Farm Payrolls (Jul)', impact: 'high', category: 'NFP' },
  { date: '2026-09-04', time: '08:30', event: 'Non-Farm Payrolls (Aug)', impact: 'high', category: 'NFP' },
  { date: '2026-10-02', time: '08:30', event: 'Non-Farm Payrolls (Sep)', impact: 'high', category: 'NFP' },
  { date: '2026-11-06', time: '08:30', event: 'Non-Farm Payrolls (Oct)', impact: 'high', category: 'NFP' },
  { date: '2026-12-04', time: '08:30', event: 'Non-Farm Payrolls (Nov)', impact: 'high', category: 'NFP' },

  // ═══ GDP (Advance, Preliminary, Final) - released by BEA ═══
  { date: '2026-01-29', time: '08:30', event: 'GDP Q4 2025 (Advance)', impact: 'high', category: 'GDP' },
  { date: '2026-02-26', time: '08:30', event: 'GDP Q4 2025 (Second)', impact: 'medium', category: 'GDP' },
  { date: '2026-03-26', time: '08:30', event: 'GDP Q4 2025 (Third)', impact: 'medium', category: 'GDP' },
  { date: '2026-04-29', time: '08:30', event: 'GDP Q1 2026 (Advance)', impact: 'high', category: 'GDP' },
  { date: '2026-05-28', time: '08:30', event: 'GDP Q1 2026 (Second)', impact: 'medium', category: 'GDP' },
  { date: '2026-06-25', time: '08:30', event: 'GDP Q1 2026 (Third)', impact: 'medium', category: 'GDP' },
  { date: '2026-07-30', time: '08:30', event: 'GDP Q2 2026 (Advance)', impact: 'high', category: 'GDP' },
  { date: '2026-08-27', time: '08:30', event: 'GDP Q2 2026 (Second)', impact: 'medium', category: 'GDP' },
  { date: '2026-09-24', time: '08:30', event: 'GDP Q2 2026 (Third)', impact: 'medium', category: 'GDP' },
  { date: '2026-10-29', time: '08:30', event: 'GDP Q3 2026 (Advance)', impact: 'high', category: 'GDP' },
  { date: '2026-11-25', time: '08:30', event: 'GDP Q3 2026 (Second)', impact: 'medium', category: 'GDP' },
  { date: '2026-12-23', time: '08:30', event: 'GDP Q3 2026 (Third)', impact: 'medium', category: 'GDP' },

  // ═══ PCE (Personal Consumption Expenditures - Fed's preferred inflation gauge) ═══
  { date: '2026-01-30', time: '08:30', event: 'Core PCE Price Index (Dec)', impact: 'high', category: 'PCE' },
  { date: '2026-02-27', time: '08:30', event: 'Core PCE Price Index (Jan)', impact: 'high', category: 'PCE' },
  { date: '2026-03-27', time: '08:30', event: 'Core PCE Price Index (Feb)', impact: 'high', category: 'PCE' },
  { date: '2026-04-30', time: '08:30', event: 'Core PCE Price Index (Mar)', impact: 'high', category: 'PCE' },
  { date: '2026-05-29', time: '08:30', event: 'Core PCE Price Index (Apr)', impact: 'high', category: 'PCE' },
  { date: '2026-06-26', time: '08:30', event: 'Core PCE Price Index (May)', impact: 'high', category: 'PCE' },
  { date: '2026-07-31', time: '08:30', event: 'Core PCE Price Index (Jun)', impact: 'high', category: 'PCE' },
  { date: '2026-08-28', time: '08:30', event: 'Core PCE Price Index (Jul)', impact: 'high', category: 'PCE' },
  { date: '2026-09-25', time: '08:30', event: 'Core PCE Price Index (Aug)', impact: 'high', category: 'PCE' },
  { date: '2026-10-30', time: '08:30', event: 'Core PCE Price Index (Sep)', impact: 'high', category: 'PCE' },
  { date: '2026-11-25', time: '08:30', event: 'Core PCE Price Index (Oct)', impact: 'high', category: 'PCE' },
  { date: '2026-12-23', time: '08:30', event: 'Core PCE Price Index (Nov)', impact: 'high', category: 'PCE' },

  // ═══ WEEKLY JOBLESS CLAIMS (every Thursday at 8:30 AM ET) ═══
  // Not listing all 52 — these are generated dynamically in the API route
];

// Generate weekly jobless claims for the full year (every Thursday)
export function getJoblessClaimsDates(year: number = 2026): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const d = new Date(`${year}-01-01T12:00:00`);
  // Find first Thursday
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === year) {
    events.push({
      date: d.toISOString().split('T')[0],
      time: '08:30',
      event: 'Initial Jobless Claims',
      impact: 'medium',
      category: 'JOBLESS',
    });
    d.setDate(d.getDate() + 7);
  }
  return events;
}

// Get all events for a date range
export function getEconomicEvents(from: string, to: string): EconomicEvent[] {
  const jobless = getJoblessClaimsDates(2026);
  const all = [...ECONOMIC_CALENDAR_2026, ...jobless];
  return all
    .filter(e => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
