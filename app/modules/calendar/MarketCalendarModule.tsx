'use client';
import { useState, useEffect, useCallback } from 'react';

// ─── TYPES ────────────────────────────────────────────────
interface EconomicEvent {
  event: string;
  country: string;
  date: string;
  impact: string;
  actual: number | null;
  estimate: number | null;
  prev: number | null;
  unit: string;
  category?: string;
  notes?: string;
}

interface EarningsEvent {
  symbol: string;
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  hour: string;
  quarter: number | null;
  year: number | null;
}

// ─── HELPERS ──────────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  return day === 0 ? 6 : day - 1; // 0=Mon, 4=Fri
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRevenue(val: number | null): string {
  if (val === null || val === undefined) return '—';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

function impactColor(impact: string): string {
  const i = impact?.toLowerCase();
  if (i === 'high' || i === '3') return 'var(--red)';
  if (i === 'medium' || i === '2') return 'var(--gold)';
  return 'var(--text-dim)';
}

function impactLabel(impact: string): string {
  const i = impact?.toLowerCase();
  if (i === 'high' || i === '3') return 'HIGH';
  if (i === 'medium' || i === '2') return 'MED';
  return 'LOW';
}

// ─── COMPONENT ────────────────────────────────────────────
export default function MarketCalendarModule() {
  const [week, setWeek] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [economic, setEconomic] = useState<EconomicEvent[]>([]);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [candleOpens, setCandleOpens] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [activeView, setActiveView] = useState<'economic' | 'earnings'>('economic');
  const [impactFilter, setImpactFilter] = useState<'all' | 'high' | 'medium'>('all');
  const [econSource, setEconSource] = useState('');

  const fetchCalendar = useCallback(async (w: number) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/calendar?week=${w}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEconomic(data.economic || []);
      setEarnings(data.earnings || []);
      setCandleOpens(data.candleOpens || []);
      setDateRange({ from: data.from, to: data.to });
      setEconSource(data.economicSource || 'static');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCalendar(week); }, [week, fetchCalendar]);

  const weekLabel = week === 0 ? 'This Week' : week === 1 ? 'Next Week' : week === -1 ? 'Last Week' : `${week > 0 ? '+' : ''}${week} Weeks`;

  // Group by day
  const economicByDay: Record<number, EconomicEvent[]> = {};
  const earningsByDay: Record<number, EarningsEvent[]> = {};
  for (let i = 0; i < 5; i++) { economicByDay[i] = []; earningsByDay[i] = []; }

  economic.forEach(e => {
    const dayStr = e.date?.substring(0, 10);
    if (dayStr) {
      const d = getDayOfWeek(dayStr);
      if (d >= 0 && d < 5) economicByDay[d].push(e);
    }
  });

  earnings.forEach(e => {
    if (e.date) {
      const d = getDayOfWeek(e.date);
      if (d >= 0 && d < 5) earningsByDay[d].push(e);
    }
  });

  // Apply impact filter
  const filteredEconomicByDay: Record<number, EconomicEvent[]> = {};
  for (let i = 0; i < 5; i++) {
    filteredEconomicByDay[i] = economicByDay[i].filter(e => {
      if (impactFilter === 'all') return true;
      const imp = e.impact?.toLowerCase();
      if (impactFilter === 'high') return imp === 'high' || imp === '3';
      if (impactFilter === 'medium') return imp === 'high' || imp === '3' || imp === 'medium' || imp === '2';
      return true;
    });
  }

  // Get dates for each day
  const dayDates: string[] = [];
  const dayISO: string[] = [];
  if (dateRange.from) {
    const start = new Date(dateRange.from + 'T12:00:00');
    for (let i = 0; i < 5; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dayDates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      dayISO.push(d.toISOString().split('T')[0]);
    }
  }

  const highImpactCount = economic.filter(e => {
    const imp = e.impact?.toLowerCase();
    return imp === 'high' || imp === '3';
  }).length;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: "'Rajdhani', sans-serif" }}>Market Calendar</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            {dateRange.from && dateRange.to ? `${formatDate(dateRange.from)} — ${formatDate(dateRange.to)}` : ''}
            {highImpactCount > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>🔴 {highImpactCount} high-impact event{highImpactCount !== 1 ? 's' : ''}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setWeek(w => w - 1)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text-mid)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← Prev</button>
          <button onClick={() => setWeek(0)} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border2)', background: week === 0 ? 'rgba(var(--tp-accent-rgb), 0.12)' : 'transparent', color: week === 0 ? 'var(--tp-accent-light)' : 'var(--text-mid)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{weekLabel}</button>
          <button onClick={() => setWeek(w => w + 1)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text-mid)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Next →</button>
        </div>
      </div>

      {/* View Toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--navy2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
        <button onClick={() => setActiveView('economic')} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: activeView === 'economic' ? 'rgba(var(--tp-accent-rgb), 0.15)' : 'transparent', color: activeView === 'economic' ? 'var(--tp-accent-light)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s' }}>
          📊 Economic Events ({economic.length})
        </button>
        <button onClick={() => setActiveView('earnings')} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: activeView === 'earnings' ? 'rgba(var(--tp-accent-rgb), 0.15)' : 'transparent', color: activeView === 'earnings' ? 'var(--tp-accent-light)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s' }}>
          💰 Earnings ({earnings.length})
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--blue3)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading calendar data...</div>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, fontSize: 13, color: 'var(--tp-danger)' }}>{error}</div>
      )}

      {/* ═══ ECONOMIC EVENTS VIEW ═══ */}
      {!loading && activeView === 'economic' && (
        <div>
          {/* Impact filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {(['all', 'high', 'medium'] as const).map(f => (
              <button key={f} onClick={() => setImpactFilter(f)} style={{
                padding: '5px 14px', borderRadius: 6, border: `1px solid ${impactFilter === f ? 'rgba(var(--tp-accent-rgb), 0.3)' : 'var(--border)'}`,
                background: impactFilter === f ? 'rgba(var(--tp-accent-rgb), 0.1)' : 'transparent',
                color: impactFilter === f ? 'var(--tp-accent-light)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              }}>
                {f === 'all' ? 'All Events' : f === 'high' ? '🔴 High Only' : '🟡 Med + High'}
              </button>
            ))}
          </div>

          {/* Day columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {DAYS.map((day, i) => {
              const events = filteredEconomicByDay[i];
              const hasHigh = events.some(e => e.impact?.toLowerCase() === 'high' || e.impact === '3');
              return (
                <div key={day} style={{ background: 'var(--navy2)', border: `1px solid ${hasHigh ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: hasHigh ? 'rgba(239,68,68,0.05)' : 'var(--navy3)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{day}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{dayDates[i] || ''}</div>
                  </div>
                  <div style={{ padding: 8, minHeight: 100 }}>
                    {/* Candle Opens */}
                    {(() => {
                      const dayDate = dayISO[i];
                      const opens = candleOpens.find((c: any) => c.date === dayDate);
                      if (!opens) return null;
                      const hasMonthly = opens.monthly?.length > 0;
                      const hasWeekly = opens.weekly?.length > 0;
                      return (
                        <div style={{ padding: '6px 6px 8px', marginBottom: 6, borderBottom: '1px solid rgba(var(--tp-accent-rgb), 0.12)', background: hasMonthly ? 'rgba(168,85,247,0.06)' : hasWeekly ? 'rgba(var(--tp-accent-rgb), 0.04)' : 'transparent', borderRadius: 6 }}>
                          <div style={{ fontSize: 8, fontWeight: 700, color: hasMonthly ? '#c084fc' : '#818cf8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>🕯 New Candles</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {opens.monthly?.map((n: number) => (
                              <span key={`m${n}`} style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'rgba(168,85,247,0.2)', color: '#c084fc' }}>{n}M</span>
                            ))}
                            {opens.weekly?.map((n: number) => (
                              <span key={`w${n}`} style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'rgba(59,130,246,0.2)', color: '#93c5fd' }}>{n}W</span>
                            ))}
                            {opens.daily?.filter((n: number) => n > 1).map((n: number) => (
                              <span key={`d${n}`} style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: n >= 6 ? 'rgba(var(--tp-warning-rgb), 0.15)' : 'rgba(255,255,255,0.06)', color: n >= 6 ? '#fbbf24' : 'var(--text-dim)' }}>{n}D</span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {events.length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic', padding: '12px 4px', textAlign: 'center' }}>No events</div>
                    )}
                    {events.map((e, j) => (
                      <div key={j} style={{ padding: '8px 6px', borderBottom: j < events.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 5px', borderRadius: 3, background: `${impactColor(e.impact)}20`, color: impactColor(e.impact), letterSpacing: 0.5 }}>{impactLabel(e.impact)}</span>
                          {e.category && <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: 'rgba(var(--tp-accent-rgb), 0.15)', color: 'var(--tp-accent-light)', letterSpacing: 0.3 }}>{e.category}</span>}
                          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{e.date?.substring(11, 16) || ''} ET</span>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: e.notes ? 2 : 4 }}>{e.event}</div>
                        {e.notes && <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>{e.notes}</div>}
                        <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                          {e.estimate !== null && <span style={{ color: 'var(--text-dim)' }}>Est: <span style={{ color: 'var(--blue3)' }}>{e.estimate}{e.unit ? ` ${e.unit}` : ''}</span></span>}
                          {e.prev !== null && <span style={{ color: 'var(--text-dim)' }}>Prev: <span style={{ color: 'var(--text-mid)' }}>{e.prev}{e.unit ? ` ${e.unit}` : ''}</span></span>}
                          {e.actual !== null && <span style={{ color: 'var(--text-dim)' }}>Act: <span style={{ color: 'var(--green)', fontWeight: 700 }}>{e.actual}{e.unit ? ` ${e.unit}` : ''}</span></span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ EARNINGS VIEW ═══ */}
      {!loading && activeView === 'earnings' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {DAYS.map((day, i) => {
              const dayEarnings = earningsByDay[i];
              const bmo = dayEarnings.filter(e => e.hour === 'bmo');
              const amc = dayEarnings.filter(e => e.hour === 'amc');
              const other = dayEarnings.filter(e => e.hour !== 'bmo' && e.hour !== 'amc');
              return (
                <div key={day} style={{ background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--navy3)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{day}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{dayDates[i] || ''} · {dayEarnings.length} reporting</div>
                  </div>
                  <div style={{ padding: 8, minHeight: 100, maxHeight: 400, overflowY: 'auto' }}>
                    {dayEarnings.length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic', padding: '12px 4px', textAlign: 'center' }}>No earnings</div>
                    )}

                    {bmo.length > 0 && (
                      <>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, padding: '4px 4px 2px', marginTop: 2 }}>☀ Before Market</div>
                        {bmo.map((e, j) => <EarningsRow key={`bmo-${j}`} e={e} />)}
                      </>
                    )}

                    {amc.length > 0 && (
                      <>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--blue3)', textTransform: 'uppercase', letterSpacing: 1, padding: '4px 4px 2px', marginTop: bmo.length > 0 ? 8 : 2 }}>🌙 After Market</div>
                        {amc.map((e, j) => <EarningsRow key={`amc-${j}`} e={e} />)}
                      </>
                    )}

                    {other.length > 0 && (
                      <>
                        {(bmo.length > 0 || amc.length > 0) && <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, padding: '4px 4px 2px', marginTop: 8 }}>TBD</div>}
                        {other.map((e, j) => <EarningsRow key={`oth-${j}`} e={e} />)}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && economic.length === 0 && earnings.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-dim)' }}>No calendar data available for this week</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>Try navigating to a different week</div>
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '16px 0 4px', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 0.5 }}>
        Data provided by Finnhub (earnings) · Economic events from Fed/BLS/BEA official schedules
      </div>
    </div>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────
function EarningsRow({ e }: { e: EarningsEvent }) {
  const beat = e.epsActual !== null && e.epsEstimate !== null ? e.epsActual > e.epsEstimate : null;
  return (
    <div style={{ padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace" }}>{e.symbol}</span>
        {beat !== null && (
          <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 5px', borderRadius: 3, background: beat ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: beat ? 'var(--green)' : 'var(--red)' }}>
            {beat ? 'BEAT' : 'MISS'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: 10, marginTop: 2 }}>
        {e.epsEstimate !== null && <span style={{ color: 'var(--text-dim)' }}>EPS Est: <span style={{ color: 'var(--blue3)' }}>${e.epsEstimate.toFixed(2)}</span></span>}
        {e.epsActual !== null && <span style={{ color: 'var(--text-dim)' }}>Act: <span style={{ color: beat ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>${e.epsActual.toFixed(2)}</span></span>}
      </div>
      {e.revenueEstimate !== null && (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
          Rev Est: <span style={{ color: 'var(--text-mid)' }}>{formatRevenue(e.revenueEstimate)}</span>
          {e.revenueActual !== null && <span> · Act: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatRevenue(e.revenueActual)}</span></span>}
        </div>
      )}
    </div>
  );
}
