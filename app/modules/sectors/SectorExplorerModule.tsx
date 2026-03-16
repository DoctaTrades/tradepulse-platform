'use client';
import { useState, useEffect, useCallback } from 'react';

interface SectorOverview {
  etf: string; label: string; color: string;
  price: number; change: number; changePct: number;
  weekChange: number; monthChange: number;
  dailyStrat: string; weeklyStrat: string; rsi: number;
  holdingsCount: number;
}
interface Holding {
  ticker: string; price: number; change: number; changePct: number;
  volume: number; avgVolume: number; volRatio: number;
  dailyStrat: string; weeklyStrat: string; rsi: number;
  mktCap: number; fromHigh: number; wk52High: number; wk52Low: number;
}

const PERF_MODES = [
  { key: 'changePct', label: 'Today' },
  { key: 'weekChange', label: 'Week' },
  { key: 'monthChange', label: 'Month' },
] as const;

function stratColor(s: string) {
  if (s === '2U') return '#4ade80';
  if (s === '2D') return '#f87171';
  if (s === '3') return '#facc15';
  if (s === '1') return '#94a3b8';
  return '#64748b';
}

function stratBg(s: string) {
  if (s === '2U') return 'rgba(74,222,128,0.12)';
  if (s === '2D') return 'rgba(248,113,113,0.12)';
  if (s === '3') return 'rgba(250,204,21,0.12)';
  if (s === '1') return 'rgba(148,163,184,0.08)';
  return 'rgba(100,116,139,0.08)';
}

function perfColor(val: number) {
  if (val > 2) return '#22c55e';
  if (val > 0.5) return '#4ade80';
  if (val > 0) return '#86efac';
  if (val > -0.5) return '#fca5a5';
  if (val > -2) return '#f87171';
  return '#ef4444';
}

function perfBg(val: number, intensity = 1) {
  const abs = Math.min(Math.abs(val), 5);
  const alpha = Math.round((abs / 5) * 40 * intensity + 5);
  if (val >= 0) return `rgba(74,222,128,0.${String(alpha).padStart(2, '0')})`;
  return `rgba(248,113,113,0.${String(alpha).padStart(2, '0')})`;
}

function rsiColor(rsi: number) {
  if (rsi >= 70) return '#ef4444';
  if (rsi >= 60) return '#f59e0b';
  if (rsi <= 30) return '#22c55e';
  if (rsi <= 40) return '#4ade80';
  return 'var(--text-mid)';
}

function formatMktCap(n: number) {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n}`;
}

function formatVol(n: number) {
  if (!n) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

export default function SectorExplorerModule() {
  const [sectors, setSectors] = useState<SectorOverview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [perfMode, setPerfMode] = useState<'changePct' | 'weekChange' | 'monthChange'>('changePct');

  // Drill-down state
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillLabel, setDrillLabel] = useState('');
  const [drillColor, setDrillColor] = useState('');
  const [sortBy, setSortBy] = useState<'changePct' | 'rsi' | 'volRatio' | 'dailyStrat'>('changePct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sectors?mode=overview');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSectors(data.sectors || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load sectors');
    }
    setLoading(false);
  }, []);

  const fetchDrillDown = useCallback(async (etf: string) => {
    setDrillLoading(true);
    try {
      const res = await fetch(`/api/sectors?mode=drilldown&sector=${etf}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setHoldings(data.holdings || []);
      setDrillLabel(data.label || etf);
      setDrillColor(data.color || '#3b82f6');
      setSelectedSector(etf);
    } catch (e: any) {
      setError(e.message);
    }
    setDrillLoading(false);
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  const sortedHoldings = [...holdings].sort((a: any, b: any) => {
    if (sortBy === 'dailyStrat') {
      const order: Record<string, number> = { '2U': 4, '3': 3, '1': 2, '2D': 1, '?': 0 };
      const diff = (order[b.dailyStrat] || 0) - (order[a.dailyStrat] || 0);
      return sortDir === 'desc' ? diff : -diff;
    }
    const diff = (b[sortBy] || 0) - (a[sortBy] || 0);
    return sortDir === 'desc' ? diff : -diff;
  });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  // Count strat patterns in holdings
  const stratCounts = holdings.reduce((acc, h) => {
    acc[h.dailyStrat] = (acc[h.dailyStrat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-5">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-mono text-sm font-bold tracking-wide" style={{ color: 'var(--text)' }}>
            {selectedSector ? `${drillLabel} (${selectedSector})` : '🏗 Sector Explorer'}
          </h2>
          <p className="font-mono text-[10px] mt-1" style={{ color: 'var(--text-dim)' }}>
            {selectedSector
              ? `${holdings.length} holdings · Strat combos + RSI · Click column headers to sort`
              : 'Click a sector to drill into its top holdings'
            }
          </p>
        </div>
        <div className="flex gap-2">
          {selectedSector && (
            <button
              onClick={() => { setSelectedSector(null); setHoldings([]); }}
              className="font-mono text-[10px] px-3 py-1.5 rounded-md"
              style={{ background: 'var(--navy3)', color: 'var(--text-mid)', border: '1px solid var(--border)' }}
            >
              ← All Sectors
            </button>
          )}
          {!selectedSector && (
            <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {PERF_MODES.map(m => (
                <button key={m.key}
                  onClick={() => setPerfMode(m.key as any)}
                  className="font-mono text-[9px] px-3 py-1.5 transition-colors"
                  style={{
                    background: perfMode === m.key ? 'var(--blue3)' : 'var(--navy3)',
                    color: perfMode === m.key ? '#fff' : 'var(--text-dim)',
                  }}
                >{m.label}</button>
              ))}
            </div>
          )}
          <button
            onClick={selectedSector ? () => fetchDrillDown(selectedSector) : fetchOverview}
            disabled={loading || drillLoading}
            className="font-mono text-[10px] px-3 py-1.5 rounded-md"
            style={{ background: 'var(--blue3)', color: '#fff', opacity: (loading || drillLoading) ? 0.5 : 1 }}
          >
            {(loading || drillLoading) ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="font-mono text-[10px] p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* ═══ SECTOR HEATMAP ═══ */}
      {!selectedSector && !loading && sectors.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {[...sectors]
            .sort((a, b) => (b[perfMode] || 0) - (a[perfMode] || 0))
            .map(s => {
              const val = s[perfMode] || 0;
              return (
                <button
                  key={s.etf}
                  onClick={() => fetchDrillDown(s.etf)}
                  className="relative rounded-lg p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: perfBg(val, 1.5),
                    border: `1px solid ${perfColor(val)}30`,
                    cursor: 'pointer',
                  }}
                >
                  <div className="font-mono text-[10px] font-bold tracking-wide" style={{ color: 'var(--text)' }}>{s.etf}</div>
                  <div className="font-mono text-[8px] mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>{s.label}</div>
                  <div className="font-mono text-lg font-black mt-1" style={{ color: perfColor(val) }}>
                    {val > 0 ? '+' : ''}{val.toFixed(2)}%
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <span className="font-mono text-[8px] px-1.5 py-0.5 rounded" style={{ background: stratBg(s.dailyStrat), color: stratColor(s.dailyStrat), fontWeight: 700 }}>
                      D:{s.dailyStrat}
                    </span>
                    <span className="font-mono text-[8px] px-1.5 py-0.5 rounded" style={{ background: stratBg(s.weeklyStrat), color: stratColor(s.weeklyStrat), fontWeight: 700 }}>
                      W:{s.weeklyStrat}
                    </span>
                  </div>
                  <div className="font-mono text-[8px] mt-1" style={{ color: rsiColor(s.rsi) }}>RSI {s.rsi}</div>
                </button>
              );
            })}
        </div>
      )}

      {!selectedSector && loading && (
        <div className="text-center py-12 font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
          ⏳ Loading sector data from Schwab...
        </div>
      )}

      {/* ═══ DRILL-DOWN VIEW ═══ */}
      {selectedSector && !drillLoading && holdings.length > 0 && (
        <>
          {/* Strat Summary Bar */}
          <div className="flex gap-3 flex-wrap">
            {['2U', '2D', '1', '3'].map(s => (
              <div key={s} className="font-mono text-[10px] px-3 py-1.5 rounded-md flex items-center gap-2"
                style={{ background: stratBg(s), border: `1px solid ${stratColor(s)}30` }}>
                <span style={{ color: stratColor(s), fontWeight: 800 }}>{s}</span>
                <span style={{ color: 'var(--text-mid)' }}>{stratCounts[s] || 0} tickers</span>
              </div>
            ))}
          </div>

          {/* Holdings Table */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--navy3)' }}>
                    <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2.5 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>Ticker</th>
                    <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2.5 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>Price</th>
                    <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2.5 text-left border-b cursor-pointer select-none" style={{ color: sortBy === 'changePct' ? 'var(--blue3)' : 'var(--text-dim)', borderColor: 'var(--border)' }}
                      onClick={() => toggleSort('changePct')}>Chg% {sortBy === 'changePct' && (sortDir === 'desc' ? '▼' : '▲')}</th>
                    <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2.5 text-left border-b cursor-pointer select-none" style={{ color: sortBy === 'dailyStrat' ? 'var(--blue3)' : 'var(--text-dim)', borderColor: 'var(--border)' }}
                      onClick={() => toggleSort('dailyStrat')}>D Strat {sortBy === 'dailyStrat' && (sortDir === 'desc' ? '▼' : '▲')}</th>
                    <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2.5 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>W Strat</th>
                    <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2.5 text-left border-b cursor-pointer select-none" style={{ color: sortBy === 'rsi' ? 'var(--blue3)' : 'var(--text-dim)', borderColor: 'var(--border)' }}
                      onClick={() => toggleSort('rsi')}>RSI {sortBy === 'rsi' && (sortDir === 'desc' ? '▼' : '▲')}</th>
                    <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2.5 text-left border-b cursor-pointer select-none" style={{ color: sortBy === 'volRatio' ? 'var(--blue3)' : 'var(--text-dim)', borderColor: 'var(--border)' }}
                      onClick={() => toggleSort('volRatio')}>Vol {sortBy === 'volRatio' && (sortDir === 'desc' ? '▼' : '▲')}</th>
                    <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2.5 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>Mkt Cap</th>
                    <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2.5 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>From 52wH</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.map((h: any) => (
                    <tr key={h.ticker} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2 border-b font-mono text-xs font-bold" style={{ borderColor: 'rgba(255,255,255,0.035)', color: 'var(--text)' }}>
                        {h.ticker}
                      </td>
                      <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)', color: 'var(--text)' }}>
                        ${h.price?.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 border-b font-mono text-xs font-bold" style={{ borderColor: 'rgba(255,255,255,0.035)', color: perfColor(h.changePct) }}>
                        {h.changePct > 0 ? '+' : ''}{h.changePct?.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded font-bold" style={{ background: stratBg(h.dailyStrat), color: stratColor(h.dailyStrat) }}>
                          {h.dailyStrat}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded font-bold" style={{ background: stratBg(h.weeklyStrat), color: stratColor(h.weeklyStrat) }}>
                          {h.weeklyStrat}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b font-mono text-xs font-medium" style={{ borderColor: 'rgba(255,255,255,0.035)', color: rsiColor(h.rsi) }}>
                        {h.rsi}
                      </td>
                      <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)', color: h.volRatio >= 1.5 ? '#facc15' : 'var(--text-mid)' }}>
                        {formatVol(h.volume)}
                        {h.volRatio > 0 && (
                          <span className="ml-1 text-[8px]" style={{ color: h.volRatio >= 1.5 ? '#facc15' : 'var(--text-dim)' }}>
                            ({h.volRatio.toFixed(1)}x)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b font-mono text-[10px]" style={{ borderColor: 'rgba(255,255,255,0.035)', color: 'var(--text-dim)' }}>
                        {formatMktCap(h.mktCap)}
                      </td>
                      <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)', color: h.fromHigh > -5 ? '#4ade80' : h.fromHigh > -15 ? 'var(--text-mid)' : '#f87171' }}>
                        {h.fromHigh?.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 font-mono text-[9px]" style={{ color: 'var(--text-dim)' }}>
            <span><span style={{ color: stratColor('2U'), fontWeight: 700 }}>2U</span> = Bullish (higher high, no lower low)</span>
            <span><span style={{ color: stratColor('2D'), fontWeight: 700 }}>2D</span> = Bearish (lower low, no higher high)</span>
            <span><span style={{ color: stratColor('1'), fontWeight: 700 }}>1</span> = Inside bar (coiling)</span>
            <span><span style={{ color: stratColor('3'), fontWeight: 700 }}>3</span> = Outside bar (expansion)</span>
            <span><span style={{ color: '#facc15' }}>Vol highlight</span> = 1.5x+ avg volume</span>
          </div>
        </>
      )}

      {selectedSector && drillLoading && (
        <div className="text-center py-12 font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
          ⏳ Loading {drillLabel} holdings — fetching Strat combos + RSI for {holdings.length || '~20'} tickers...
        </div>
      )}
    </div>
  );
}
