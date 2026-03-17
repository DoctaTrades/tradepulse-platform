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

  // ═══ PPI (Producer Price Index) - typically mid-month at 8:30 AM ET ═══
  // Leading indicator for CPI — wholesale inflation
  { date: '2026-01-30', time: '08:30', event: 'PPI (Dec)', impact: 'medium', category: 'PPI' },
  { date: '2026-02-27', time: '08:30', event: 'PPI (Jan)', impact: 'medium', category: 'PPI' },
  { date: '2026-03-18', time: '08:30', event: 'PPI (Feb)', impact: 'medium', category: 'PPI' },
  { date: '2026-04-15', time: '08:30', event: 'PPI (Mar)', impact: 'medium', category: 'PPI' },
  { date: '2026-05-14', time: '08:30', event: 'PPI (Apr)', impact: 'medium', category: 'PPI' },
  { date: '2026-06-12', time: '08:30', event: 'PPI (May)', impact: 'medium', category: 'PPI' },
  { date: '2026-07-16', time: '08:30', event: 'PPI (Jun)', impact: 'medium', category: 'PPI' },
  { date: '2026-08-14', time: '08:30', event: 'PPI (Jul)', impact: 'medium', category: 'PPI' },
  { date: '2026-09-15', time: '08:30', event: 'PPI (Aug)', impact: 'medium', category: 'PPI' },
  { date: '2026-10-15', time: '08:30', event: 'PPI (Sep)', impact: 'medium', category: 'PPI' },
  { date: '2026-11-13', time: '08:30', event: 'PPI (Oct)', impact: 'medium', category: 'PPI' },
  { date: '2026-12-11', time: '08:30', event: 'PPI (Nov)', impact: 'medium', category: 'PPI' },

  // ═══ RETAIL SALES - typically mid-month at 8:30 AM ET ═══
  // Consumer spending strength — ~70% of GDP
  { date: '2026-01-16', time: '08:30', event: 'Retail Sales (Dec)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-02-14', time: '08:30', event: 'Retail Sales (Jan)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-03-17', time: '08:30', event: 'Retail Sales (Feb)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-04-16', time: '08:30', event: 'Retail Sales (Mar)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-05-15', time: '08:30', event: 'Retail Sales (Apr)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-06-16', time: '08:30', event: 'Retail Sales (May)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-07-16', time: '08:30', event: 'Retail Sales (Jun)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-08-14', time: '08:30', event: 'Retail Sales (Jul)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-09-16', time: '08:30', event: 'Retail Sales (Aug)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-10-16', time: '08:30', event: 'Retail Sales (Sep)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-11-17', time: '08:30', event: 'Retail Sales (Oct)', impact: 'medium', category: 'RETAIL' },
  { date: '2026-12-16', time: '08:30', event: 'Retail Sales (Nov)', impact: 'medium', category: 'RETAIL' },

  // ═══ ISM MANUFACTURING PMI - 1st business day of month at 10:00 AM ET ═══
  // Above 50 = expansion, below 50 = contraction
  { date: '2026-01-05', time: '10:00', event: 'ISM Manufacturing PMI (Dec)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-02-02', time: '10:00', event: 'ISM Manufacturing PMI (Jan)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-03-02', time: '10:00', event: 'ISM Manufacturing PMI (Feb)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-04-01', time: '10:00', event: 'ISM Manufacturing PMI (Mar)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-05-01', time: '10:00', event: 'ISM Manufacturing PMI (Apr)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-06-01', time: '10:00', event: 'ISM Manufacturing PMI (May)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-07-01', time: '10:00', event: 'ISM Manufacturing PMI (Jun)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-08-03', time: '10:00', event: 'ISM Manufacturing PMI (Jul)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-09-01', time: '10:00', event: 'ISM Manufacturing PMI (Aug)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-10-01', time: '10:00', event: 'ISM Manufacturing PMI (Sep)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-11-02', time: '10:00', event: 'ISM Manufacturing PMI (Oct)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },
  { date: '2026-12-01', time: '10:00', event: 'ISM Manufacturing PMI (Nov)', impact: 'medium', category: 'ISM', notes: 'Above 50 = expansion' },

  // ═══ ISM SERVICES PMI - 3rd business day of month at 10:00 AM ET ═══
  // Services = ~77% of US economy
  { date: '2026-01-07', time: '10:00', event: 'ISM Services PMI (Dec)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },
  { date: '2026-02-04', time: '10:00', event: 'ISM Services PMI (Jan)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },
  { date: '2026-03-04', time: '10:00', event: 'ISM Services PMI (Feb)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },
  { date: '2026-04-03', time: '10:00', event: 'ISM Services PMI (Mar)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },
  { date: '2026-05-05', time: '10:00', event: 'ISM Services PMI (Apr)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },
  { date: '2026-06-03', time: '10:00', event: 'ISM Services PMI (May)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },
  { date: '2026-07-02', time: '10:00', event: 'ISM Services PMI (Jun)', impact: 'medium', category: 'ISM', notes: '* Moved from July 6 due to July 4 holiday' },
  { date: '2026-08-05', time: '10:00', event: 'ISM Services PMI (Jul)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },
  { date: '2026-09-03', time: '10:00', event: 'ISM Services PMI (Aug)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },
  { date: '2026-10-05', time: '10:00', event: 'ISM Services PMI (Sep)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },
  { date: '2026-11-04', time: '10:00', event: 'ISM Services PMI (Oct)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },
  { date: '2026-12-03', time: '10:00', event: 'ISM Services PMI (Nov)', impact: 'medium', category: 'ISM', notes: 'Services = ~77% of economy' },

  // ═══ JOLTS (Job Openings & Labor Turnover) - ~5 weeks after reference month at 10:00 AM ET ═══
  // Fed watches this closely for labor market tightness
  { date: '2026-01-07', time: '10:00', event: 'JOLTS Job Openings (Nov)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-02-05', time: '10:00', event: 'JOLTS Job Openings (Dec)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-03-13', time: '10:00', event: 'JOLTS Job Openings (Jan)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-03-31', time: '10:00', event: 'JOLTS Job Openings (Feb)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-05-06', time: '10:00', event: 'JOLTS Job Openings (Mar)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-06-03', time: '10:00', event: 'JOLTS Job Openings (Apr)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-07-08', time: '10:00', event: 'JOLTS Job Openings (May)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-08-05', time: '10:00', event: 'JOLTS Job Openings (Jun)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-09-02', time: '10:00', event: 'JOLTS Job Openings (Jul)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-10-07', time: '10:00', event: 'JOLTS Job Openings (Aug)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-11-04', time: '10:00', event: 'JOLTS Job Openings (Sep)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
  { date: '2026-12-09', time: '10:00', event: 'JOLTS Job Openings (Oct)', impact: 'medium', category: 'JOLTS', notes: 'Fed watches labor demand' },
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
