'use client';

import { useState, useEffect, useCallback } from 'react';

interface DiscoveryResult {
  ticker: string; price: number; change: number; vol: number;
  iv: number; ivr: number; rsi: number; atrPct: number;
  ema20: number | null; ema50: number | null; ema200: number | null;
  optBid: number; ror: number; mktCap: number; sector: string;
  source: string; passesMainFilters: boolean;
}

interface CustomFilters {
  minPrice: number; maxPrice: number; minRSI: number; maxRSI: number;
  emaTrend: string; minVolRatio: number; minMktCap: string;
  sector: string; minIVR: number; maxIVR: number; wk52Position: string;
  minDivYield: number;
}

interface SavedPreset {
  name: string; filters: CustomFilters; createdAt: string;
}

const DEFAULT_FILTERS: CustomFilters = {
  minPrice: 5, maxPrice: 500, minRSI: 30, maxRSI: 70,
  emaTrend: 'any', minVolRatio: 1, minMktCap: 'any',
  sector: 'all', minIVR: 0, maxIVR: 100,
  wk52Position: 'any', minDivYield: 0,
};

const DISCOVERY_PRESETS = [
  { id: 'momentum', name: 'Momentum breakouts', icon: '🚀', desc: '52W highs, RSI > 60, strong uptrend, 2x+ volume', filters: { ...DEFAULT_FILTERS, minRSI: 60, maxRSI: 100, minVolRatio: 2, wk52Position: 'near_high', emaTrend: 'above_all' } },
  { id: 'pullback', name: 'Pullback to support', icon: '🎯', desc: 'Near 50 EMA, RSI 30-45, overall uptrend intact', filters: { ...DEFAULT_FILTERS, minRSI: 30, maxRSI: 45, emaTrend: 'above200', wk52Position: 'any' } },
  { id: 'earnings', name: 'Earnings plays', icon: '📅', desc: 'High IV rank stocks — fat premium for earnings straddles or strangles', filters: { ...DEFAULT_FILTERS, minIVR: 40, maxIVR: 100, minRSI: 25, maxRSI: 75 } },
  { id: 'value', name: 'Value plays', icon: '💎', desc: 'Down 20%+ from highs, beaten down but still liquid', filters: { ...DEFAULT_FILTERS, wk52Position: 'near_low', minRSI: 20, maxRSI: 50, minPrice: 10 } },
  { id: 'coveredcall', name: 'Covered call candidates', icon: '📈', desc: 'Stable, dividend-paying, above key EMAs, moderate IV', filters: { ...DEFAULT_FILTERS, minDivYield: 1, minRSI: 40, maxRSI: 65, emaTrend: 'above50', minIVR: 20 } },
  { id: 'oversold', name: 'Oversold bounce', icon: '⚡', desc: 'RSI under 30, extreme fear — potential snap-back', filters: { ...DEFAULT_FILTERS, minRSI: 10, maxRSI: 30, minPrice: 10 } },
];

const UNIVERSES = [
  { id: 'core', name: '⚡ Pulse Core', count: 56 },
  { id: 'sp500', name: '📈 S&P 500', count: 150 },
  { id: 'megaCap', name: '🏛 Mega Cap', count: 30 },
  { id: 'ndx100', name: '💻 Nasdaq 100', count: 90 },
  { id: 'highIV', name: '🔥 High IV', count: 48 },
  { id: 'etf', name: '📊 ETFs', count: 52 },
  { id: 'fullMarket', name: '🌐 Full Market', count: 400 },
];

export default function DiscoveryModule({ user }: { user?: any }) {
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [customFilters, setCustomFilters] = useState<CustomFilters>({ ...DEFAULT_FILTERS });
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanStats, setScanStats] = useState({ scanned: 0, found: 0, elapsed: '' });
  const [universe, setUniverse] = useState('core');
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [sortField, setSortField] = useState('ivr');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Load saved presets from Supabase
  useEffect(() => {
    if (!user?.id) return;
    fetch('/api/user-keys', { headers: { 'x-user-id': user.id } })
      .then(r => r.json())
      .then(data => {
        if (data.apiKeys?.discoveryPresets) setSavedPresets(data.apiKeys.discoveryPresets);
      }).catch(() => {});
  }, [user?.id]);

  // Save presets to Supabase
  const persistPresets = async (presets: SavedPreset[]) => {
    if (!user?.id) return;
    // Load existing keys first, merge
    try {
      const res = await fetch('/api/user-keys', { headers: { 'x-user-id': user.id } });
      const data = await res.json();
      const merged = { ...(data.apiKeys || {}), discoveryPresets: presets };
      await fetch('/api/user-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({ action: 'save', apiKeys: merged }),
      });
    } catch {}
  };

  const savePreset = async () => {
    if (!presetName.trim()) return;
    const preset: SavedPreset = { name: presetName.trim(), filters: { ...customFilters }, createdAt: new Date().toISOString() };
    const updated = [...savedPresets.filter(p => p.name !== preset.name), preset];
    setSavedPresets(updated);
    await persistPresets(updated);
    setPresetName('');
    setShowSaveInput(false);
  };

  const deletePreset = async (name: string) => {
    const updated = savedPresets.filter(p => p.name !== name);
    setSavedPresets(updated);
    await persistPresets(updated);
  };

  // Run scan
  const runScan = useCallback(async (filters: CustomFilters) => {
    setScanning(true);
    setResults([]);
    const start = Date.now();

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universe,
          filters: {
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice,
            minRSI: filters.minRSI,
            maxRSI: filters.maxRSI,
            emaTrend: filters.emaTrend,
            minVol: (filters.minVolRatio || 1) * 100000,
            minIVR: filters.minIVR || 0,
            minIV: 0, minBid: 0, minRoR: 0, minMktCap: 0, minOI: 0,
          },
          userId: user?.id,
          userEmail: user?.email,
        }),
      });
      const data = await res.json();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      let filtered = data.results || [];

      // Client-side post-filters
      if (filters.wk52Position === 'near_high') filtered = filtered.filter((r: any) => r.ema50 && r.price > r.ema50 * 1.1);
      if (filters.wk52Position === 'near_low') filtered = filtered.filter((r: any) => r.ema200 && r.price < r.ema200);
      if (filters.maxIVR < 100) filtered = filtered.filter((r: any) => r.ivr <= filters.maxIVR);
      if (filters.sector !== 'all') filtered = filtered.filter((r: any) => r.sector === filters.sector);
      if (filters.minMktCap === 'large') filtered = filtered.filter((r: any) => r.mktCap >= 10e9);
      if (filters.minMktCap === 'mid') filtered = filtered.filter((r: any) => r.mktCap >= 2e9);
      if (filters.minMktCap === 'small') filtered = filtered.filter((r: any) => r.mktCap >= 300e6 && r.mktCap < 2e9);

      setResults(filtered);
      setScanStats({ scanned: data.scanned || filtered.length, found: filtered.length, elapsed: `${elapsed}s` });
    } catch {}
    setScanning(false);
  }, [universe, user]);

  // Sort
  const sorted = [...results].sort((a: any, b: any) => {
    const av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const pctColor = (n: number) => n >= 0 ? 'var(--green)' : 'var(--red)';
  const fmtVol = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : String(n);

  const FilterInput = ({ label, value, onChange, type = 'number', width = '100%' }: any) => (
    <div>
      <label className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-dim)' }}>{label}</label>
      <input type={type} value={value} onChange={(e: any) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        className="w-full px-2 py-1.5 rounded font-mono text-xs border outline-none" style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)', width }} />
    </div>
  );

  const FilterSelect = ({ label, value, onChange, options }: any) => (
    <div>
      <label className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-dim)' }}>{label}</label>
      <select value={value} onChange={(e: any) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 rounded font-mono text-xs border outline-none" style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)' }}>
        {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="p-7 max-w-[1600px]">
      {/* Universe selector */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="font-display text-xs font-bold tracking-wider uppercase" style={{ color: 'var(--text-dim)' }}>Universe:</span>
        {UNIVERSES.map(u => (
          <button key={u.id} onClick={() => setUniverse(u.id)}
            className={`px-3 py-1.5 rounded-lg font-display text-[11px] font-bold tracking-wider border transition-all ${
              universe === u.id ? 'border-[var(--blue3)] text-[var(--blue3)]' : 'border-[var(--border)] text-[var(--text-dim)]'
            }`}>
            {u.name} ({u.count})
          </button>
        ))}
      </div>

      {/* Preset scans */}
      <div className="mb-5">
        <div className="font-display text-sm font-bold tracking-wider uppercase mb-3" style={{ color: 'var(--text)' }}>Preset scans</div>
        <div className="grid grid-cols-3 gap-3">
          {DISCOVERY_PRESETS.map(p => (
            <button key={p.id} onClick={() => { setActivePreset(p.id); setShowCustom(false); setCustomFilters(p.filters); runScan(p.filters); }}
              className="text-left p-4 rounded-xl border transition-all hover:border-[var(--blue3)]"
              style={{ background: activePreset === p.id ? 'rgba(30,79,216,0.1)' : 'var(--navy3)', borderColor: activePreset === p.id ? 'var(--blue3)' : 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 16 }}>{p.icon}</span>
                <span className="font-display text-sm font-bold" style={{ color: activePreset === p.id ? 'var(--blue3)' : 'var(--text)' }}>{p.name}</span>
              </div>
              <div className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Saved user presets */}
      {savedPresets.length > 0 && (
        <div className="mb-5">
          <div className="font-display text-sm font-bold tracking-wider uppercase mb-3" style={{ color: 'var(--gold)' }}>Your saved presets</div>
          <div className="flex gap-2 flex-wrap">
            {savedPresets.map(p => (
              <div key={p.name} className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all hover:border-[var(--blue3)]" style={{ background: 'var(--navy3)', borderColor: 'var(--border)' }}>
                <button onClick={() => { setActivePreset('saved-' + p.name); setShowCustom(false); setCustomFilters(p.filters); runScan(p.filters); }}
                  className="font-display text-xs font-bold" style={{ color: 'var(--text)' }}>{p.name}</button>
                <button onClick={() => deletePreset(p.name)} className="font-mono text-[10px] opacity-50 hover:opacity-100" style={{ color: 'var(--red)' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom scan toggle */}
      <div className="mb-5">
        <button onClick={() => { setShowCustom(!showCustom); setActivePreset('custom'); }}
          className={`px-5 py-2.5 rounded-xl font-display text-xs font-bold tracking-wider uppercase border-2 transition-all ${
            showCustom ? 'border-[var(--blue3)] text-[var(--blue3)]' : 'border-[var(--blue)] text-[var(--text-dim)]'
          }`} style={{ borderStyle: showCustom ? 'solid' : 'dashed' }}>
          🛠 Custom scan builder
        </button>
      </div>

      {/* Custom filter builder */}
      {showCustom && (
        <div className="p-5 rounded-xl border mb-5" style={{ background: 'var(--navy3)', borderColor: 'var(--border)' }}>
          <div className="font-display text-sm font-bold tracking-wider uppercase mb-4" style={{ color: 'var(--text)' }}>Custom filter builder</div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-dim)' }}>Price range</label>
              <div className="flex gap-2">
                <FilterInput label="" value={customFilters.minPrice} onChange={(v: number) => setCustomFilters(p => ({...p, minPrice: v}))} />
                <FilterInput label="" value={customFilters.maxPrice} onChange={(v: number) => setCustomFilters(p => ({...p, maxPrice: v}))} />
              </div>
            </div>
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-dim)' }}>RSI range</label>
              <div className="flex gap-2">
                <FilterInput label="" value={customFilters.minRSI} onChange={(v: number) => setCustomFilters(p => ({...p, minRSI: v}))} />
                <FilterInput label="" value={customFilters.maxRSI} onChange={(v: number) => setCustomFilters(p => ({...p, maxRSI: v}))} />
              </div>
            </div>
            <FilterSelect label="EMA trend" value={customFilters.emaTrend} onChange={(v: string) => setCustomFilters(p => ({...p, emaTrend: v}))} options={[
              { value: 'any', label: 'Any' }, { value: 'above20', label: 'Above 20 EMA' }, { value: 'above50', label: 'Above 50 EMA' },
              { value: 'above200', label: 'Above 200 EMA' }, { value: 'above_both', label: 'Above 50 + 200' },
              { value: 'above_all', label: 'Above all EMAs' }, { value: 'below20', label: 'Below 20 EMA' },
            ]} />
            <FilterSelect label="Volume" value={String(customFilters.minVolRatio)} onChange={(v: string) => setCustomFilters(p => ({...p, minVolRatio: Number(v)}))} options={[
              { value: '1', label: '1x+ (normal)' }, { value: '1.5', label: '1.5x+ avg' },
              { value: '2', label: '2x+ avg' }, { value: '3', label: '3x+ avg' },
            ]} />
            <FilterSelect label="Market cap" value={customFilters.minMktCap} onChange={(v: string) => setCustomFilters(p => ({...p, minMktCap: v}))} options={[
              { value: 'any', label: 'Any' }, { value: 'small', label: 'Small ($300M-$2B)' },
              { value: 'mid', label: 'Mid ($2B+)' }, { value: 'large', label: 'Large ($10B+)' },
            ]} />
            <FilterSelect label="Sector" value={customFilters.sector} onChange={(v: string) => setCustomFilters(p => ({...p, sector: v}))} options={[
              { value: 'all', label: 'All sectors' }, { value: 'Technology', label: 'Technology' },
              { value: 'Healthcare', label: 'Healthcare' }, { value: 'Financial Services', label: 'Financials' },
              { value: 'Energy', label: 'Energy' }, { value: 'Consumer Cyclical', label: 'Consumer Disc.' },
              { value: 'Consumer Defensive', label: 'Consumer Staples' }, { value: 'Industrials', label: 'Industrials' },
              { value: 'Utilities', label: 'Utilities' }, { value: 'Real Estate', label: 'Real Estate' },
              { value: 'Communication Services', label: 'Communication' },
            ]} />
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-dim)' }}>IV rank range</label>
              <div className="flex gap-2">
                <FilterInput label="" value={customFilters.minIVR} onChange={(v: number) => setCustomFilters(p => ({...p, minIVR: v}))} />
                <FilterInput label="" value={customFilters.maxIVR} onChange={(v: number) => setCustomFilters(p => ({...p, maxIVR: v}))} />
              </div>
            </div>
            <FilterSelect label="52W position" value={customFilters.wk52Position} onChange={(v: string) => setCustomFilters(p => ({...p, wk52Position: v}))} options={[
              { value: 'any', label: 'Any' }, { value: 'near_high', label: 'Near 52W high' }, { value: 'near_low', label: 'Near 52W low' },
            ]} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => runScan(customFilters)} disabled={scanning} className="btn-primary text-xs">
              {scanning ? '⏳ Scanning...' : `⚡ Run custom scan`}
            </button>
            <button onClick={() => setShowSaveInput(!showSaveInput)} className="btn-ghost text-xs">💾 Save as preset</button>
            {showSaveInput && (
              <div className="flex items-center gap-2">
                <input value={presetName} onChange={(e: any) => setPresetName(e.target.value)}
                  onKeyDown={(e: any) => { if (e.key === 'Enter') savePreset(); }}
                  placeholder="Preset name..."
                  className="px-3 py-1.5 rounded font-mono text-xs border outline-none" style={{ background: 'var(--navy4)', borderColor: 'var(--border)', color: 'var(--text)', width: 160 }} />
                <button onClick={savePreset} className="btn-primary text-xs py-1.5">Save</button>
              </div>
            )}
            <button onClick={() => setCustomFilters({ ...DEFAULT_FILTERS })} className="btn-ghost text-xs">↺ Reset</button>
          </div>
        </div>
      )}

      {/* Scanning indicator */}
      {scanning && (
        <div className="text-center py-12">
          <div className="font-display text-xl font-bold" style={{ color: 'var(--blue3)' }}>⚡ Scanning {universe}...</div>
          <div className="font-mono text-xs mt-2" style={{ color: 'var(--text-dim)' }}>Analyzing tickers against your filters</div>
        </div>
      )}

      {/* Results */}
      {!scanning && results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-sm font-bold tracking-wider uppercase" style={{ color: 'var(--text)' }}>
              {results.length} matches · {scanStats.scanned} scanned · {scanStats.elapsed}
            </div>
          </div>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                  {[
                    { id: 'ticker', label: 'Ticker', align: 'left' },
                    { id: 'price', label: 'Price', align: 'right' },
                    { id: 'change', label: 'Chg%', align: 'right' },
                    { id: 'iv', label: 'IV', align: 'right' },
                    { id: 'ivr', label: 'IVR', align: 'right' },
                    { id: 'rsi', label: 'RSI', align: 'right' },
                    { id: 'ror', label: 'CSP RoR', align: 'right' },
                    { id: 'optBid', label: 'Best Bid', align: 'right' },
                    { id: 'vol', label: 'Volume', align: 'right' },
                    { id: 'sector', label: 'Sector', align: 'left' },
                  ].map(col => (
                    <th key={col.id} onClick={() => toggleSort(col.id)}
                      className="font-mono text-[9px] uppercase tracking-wider px-3 py-2 cursor-pointer select-none"
                      style={{ color: sortField === col.id ? 'var(--gold)' : 'var(--text-dim)', borderBottom: '1px solid var(--border)', textAlign: col.align as any }}>
                      {col.label} {sortField === col.id && (sortDir === 'desc' ? '↓' : '↑')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 100).map((r, i) => (
                  <tr key={r.ticker} style={{ background: i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent' }}
                    className="hover:bg-[rgba(30,79,216,0.08)] transition-colors">
                    <td className="px-3 py-2 font-display text-sm font-bold" style={{ color: 'var(--text)' }}>{r.ticker}</td>
                    <td className="px-3 py-2 font-mono text-xs text-right" style={{ color: 'var(--text-mid)' }}>${r.price?.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-xs font-bold text-right" style={{ color: pctColor(r.change) }}>{r.change >= 0 ? '+' : ''}{r.change?.toFixed(2)}%</td>
                    <td className="px-3 py-2 font-mono text-xs text-right" style={{ color: 'var(--gold)' }}>{r.iv}%</td>
                    <td className="px-3 py-2 font-mono text-xs text-right" style={{ color: r.ivr >= 50 ? 'var(--green)' : 'var(--text-mid)' }}>{r.ivr}%</td>
                    <td className="px-3 py-2 font-mono text-xs text-right" style={{ color: r.rsi > 70 ? 'var(--red)' : r.rsi < 30 ? 'var(--green)' : 'var(--text-mid)' }}>{r.rsi}</td>
                    <td className="px-3 py-2 font-mono text-xs text-right" style={{ color: r.ror > 2 ? 'var(--green)' : 'var(--text-mid)' }}>{r.ror?.toFixed(1)}%</td>
                    <td className="px-3 py-2 font-mono text-xs text-right" style={{ color: 'var(--text-mid)' }}>${r.optBid?.toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-right" style={{ color: 'var(--text-dim)' }}>{fmtVol(r.vol)}</td>
                    <td className="px-3 py-2 font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>{r.sector || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!scanning && results.length === 0 && !activePreset && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 opacity-30">🔍</div>
          <div className="font-display text-xl font-bold mb-2" style={{ color: 'var(--text-dim)' }}>Stock Discovery</div>
          <div className="font-mono text-xs max-w-md mx-auto" style={{ color: 'var(--text-dim)', lineHeight: 1.8 }}>
            Pick a preset scan above or build your own custom filters. Results show tickers matching your criteria with key metrics for further analysis.
          </div>
        </div>
      )}

      {/* No results after scan */}
      {!scanning && results.length === 0 && activePreset && (
        <div className="text-center py-12">
          <div className="font-display text-lg font-bold mb-2" style={{ color: 'var(--text-dim)' }}>No matches found</div>
          <div className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>Try adjusting filters or scanning a larger universe</div>
        </div>
      )}
    </div>
  );
}
