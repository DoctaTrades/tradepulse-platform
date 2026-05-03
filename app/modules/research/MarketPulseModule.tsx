'use client';

import { useState, useCallback } from 'react';

interface MarketData {
  timestamp: string;
  vix: { price: number; change: number; regime: string; context: string };
  indices: { symbol: string; price: number; change: number; volume: number; high52: number; low52: number }[];
  sectors: { symbol: string; name: string; price: number; change1d: number; change1w: number; change1m: number; change3m: number; rsi: number }[];
  breadth: { rspChange: number; spyChange: number; divergence: number; signal: string; context: string };
  spyTechnicals: { ema20: number; ema50: number; ema200: number; rsi: number; trend: string };
  fearGreed: { score: number; label: string; color: string; components: { name: string; value: number; weight: number }[] };
  premiumRec: string;
  error?: string;
}

export default function MarketPulseModule({ user }: { user?: any }) {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers: Record<string, string> = {};
      if (user?.id) headers['x-user-id'] = user.id;
      try { const { getAuthHeaders } = await import('@/app/lib/auth-fetch'); Object.assign(headers, await getAuthHeaders()); } catch {}
      const res = await fetch('/api/market-pulse', { headers });
      const d = await res.json();
      if (d.error) setError(d.error);
      else setData(d);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [user?.id]);

  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const fmtPrice = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pctColor = (n: number) => n >= 0 ? 'var(--tp-success)' : 'var(--tp-danger)';

  const trendLabels: Record<string, string> = {
    strong_uptrend: '🟢 Strong Uptrend',
    uptrend: '🟢 Uptrend',
    mixed: '🟡 Mixed',
    downtrend: '🔴 Downtrend',
    strong_downtrend: '🔴 Strong Downtrend',
  };

  const regimeColors: Record<string, string> = {
    complacency: 'var(--tp-success)',
    calm: '#86efac',
    elevated: 'var(--tp-warning)',
    fear: '#fb923c',
    panic: '#ef4444',
  };

  // Empty state
  if (!data && !loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }}>📡</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>MARKET PULSE</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', maxWidth: 450, margin: '0 auto 24px', lineHeight: 1.7 }}>
            Real-time market regime analysis. VIX context, sector rotation, breadth, and a Fear & Greed composite that tells you whether to sell premium aggressively or play defense.
          </div>
          <button onClick={loadData} disabled={loading}
            style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #1e4fd8, #2563eb)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1, textTransform: 'uppercase', boxShadow: '0 4px 20px rgba(30,79,216,0.35)' }}>
            {loading ? '⏳ Loading...' : '⚡ Load Market Pulse'}
          </button>
          {error && <div style={{ marginTop: 16, color: 'var(--tp-danger)', fontSize: 12 }}>{error}</div>}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, color: 'var(--blue3)', fontWeight: 700, fontFamily: "'Rajdhani', sans-serif" }}>⚡ Fetching market data...</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>Pulling VIX, sectors, breadth, and technicals from Schwab</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace', letterSpacing: 1 }}>LAST UPDATED</div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', fontFamily: 'monospace' }}>{new Date(data.timestamp).toLocaleString()}</div>
        </div>
        <button onClick={loadData} disabled={loading}
          style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase' }}>
          🔄 Refresh
        </button>
      </div>

      {/* ═══ TOP ROW: Fear & Greed + VIX + Premium Rec ═══ */}
      <div className="tp-mp-top-row" style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Fear & Greed Gauge */}
        <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>Fear & Greed</div>
          <div style={{ fontSize: 48, fontWeight: 800, fontFamily: "'Rajdhani', sans-serif", color: data.fearGreed.color, lineHeight: 1 }}>{data.fearGreed.score}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: data.fearGreed.color, marginTop: 4, fontFamily: "'Rajdhani', sans-serif", textTransform: 'uppercase', letterSpacing: 1 }}>{data.fearGreed.label}</div>
          {/* Component breakdown */}
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            {data.fearGreed.components.map(c => (
              <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', marginBottom: 3 }}>
                <span>{c.name}</span>
                <span style={{ color: c.value >= 60 ? 'var(--tp-success)' : c.value >= 40 ? 'var(--tp-warning)' : 'var(--tp-danger)', fontFamily: 'monospace' }}>{c.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* VIX */}
        <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>VIX — Fear Index</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
                <span style={{ fontSize: 36, fontWeight: 800, fontFamily: "'Rajdhani', sans-serif", color: regimeColors[data.vix.regime] || 'var(--tp-warning)' }}>{data.vix.price.toFixed(2)}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: pctColor(data.vix.change) }}>{fmtPct(data.vix.change)}</span>
              </div>
            </div>
            <div style={{ padding: '4px 12px', borderRadius: 8, background: `${regimeColors[data.vix.regime]}15`, border: `1px solid ${regimeColors[data.vix.regime]}30`, fontSize: 11, fontWeight: 700, color: regimeColors[data.vix.regime], textTransform: 'uppercase', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>
              {data.vix.regime}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6 }}>{data.vix.context}</div>
        </div>

        {/* Premium Recommendation */}
        <div style={{ background: 'var(--shell-active)', border: '1px solid var(--blue)', borderRadius: 14, padding: '20px' }}>
          <div style={{ fontSize: 9, color: 'var(--blue3)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>⚡ Premium Selling Signal</div>
          <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.7 }}>{data.premiumRec}</div>
        </div>
      </div>

      {/* ═══ INDICES ROW ═══ */}
      <div className="tp-mp-strat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        {data.indices.map(idx => (
          <div key={idx.symbol} style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>{idx.symbol}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: pctColor(idx.change), fontFamily: 'monospace' }}>{fmtPct(idx.change)}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', marginTop: 2 }}>{fmtPrice(idx.price)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'monospace' }}>52W: {fmtPrice(idx.low52)} — {fmtPrice(idx.high52)}</div>
          </div>
        ))}
      </div>

      {/* ═══ MIDDLE ROW: SPY Technicals + Breadth ═══ */}
      <div className="tp-mp-half" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* SPY Technicals */}
        <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 12 }}>SPY Technical Health</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{trendLabels[data.spyTechnicals.trend] || '🟡 Mixed'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-mid)', fontFamily: 'monospace' }}>RSI: {data.spyTechnicals.rsi}</span>
          </div>
          <div className="tp-mp-trio" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'EMA 20', value: data.spyTechnicals.ema20, above: data.indices[0]?.price > data.spyTechnicals.ema20 },
              { label: 'EMA 50', value: data.spyTechnicals.ema50, above: data.indices[0]?.price > data.spyTechnicals.ema50 },
              { label: 'EMA 200', value: data.spyTechnicals.ema200, above: data.indices[0]?.price > data.spyTechnicals.ema200 },
            ].map(ema => (
              <div key={ema.label} style={{ background: 'var(--navy3)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>{ema.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>{ema.value ? fmtPrice(ema.value) : '—'}</div>
                <div style={{ fontSize: 9, color: ema.above ? 'var(--tp-success)' : 'var(--tp-danger)', fontWeight: 600 }}>{ema.above ? '▲ Above' : '▼ Below'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Breadth */}
        <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 12 }}>Market Breadth</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Rajdhani', sans-serif", color: data.breadth.divergence > 0 ? 'var(--tp-success)' : data.breadth.divergence < -0.3 ? 'var(--tp-danger)' : 'var(--tp-warning)' }}>
              {data.breadth.divergence > 0 ? '+' : ''}{data.breadth.divergence.toFixed(2)}%
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mid)', textTransform: 'uppercase', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>
              {data.breadth.signal}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 12 }}>{data.breadth.context}</div>
          <div className="tp-mp-half" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'var(--navy3)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>RSP (Equal Weight)</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: pctColor(data.breadth.rspChange) }}>{fmtPct(data.breadth.rspChange)}</div>
            </div>
            <div style={{ background: 'var(--navy3)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>SPY (Cap Weight)</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: pctColor(data.breadth.spyChange) }}>{fmtPct(data.breadth.spyChange)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SECTOR MOMENTUM TABLE ═══ */}
      <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>Sector Momentum Rankings</span>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 8 }}>Sorted by 1-week performance</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['#', 'Sector', 'ETF', 'Price', '1D', '1W', '1M', '3M', 'RSI', 'Signal'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: h === '#' || h === 'Sector' || h === 'ETF' ? 'left' : 'right', fontSize: 9, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', background: 'var(--navy3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.sectors.map((s, i) => {
              const signal = s.change1w > 2 ? '🔥 Hot' : s.change1w > 0.5 ? '↗ Gaining' : s.change1w > -0.5 ? '➡ Flat' : s.change1w > -2 ? '↘ Fading' : '❄ Cold';
              return (
                <tr key={s.symbol} style={{ background: i % 2 === 0 ? 'rgba(0,0,0,0.08)' : 'transparent' }}>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{i + 1}</td>
                  <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{s.name}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-mid)' }}>{s.symbol}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text)', textAlign: 'right' }}>{fmtPrice(s.price)}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: pctColor(s.change1d), textAlign: 'right', fontWeight: 600 }}>{fmtPct(s.change1d)}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: pctColor(s.change1w), textAlign: 'right', fontWeight: 700 }}>{fmtPct(s.change1w)}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: pctColor(s.change1m), textAlign: 'right' }}>{fmtPct(s.change1m)}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: pctColor(s.change3m), textAlign: 'right' }}>{fmtPct(s.change3m)}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: s.rsi > 70 ? 'var(--red)' : s.rsi < 30 ? 'var(--green)' : 'var(--text-mid)', textAlign: 'right' }}>{s.rsi}</td>
                  <td style={{ padding: '8px 12px', fontSize: 10, textAlign: 'right' }}>{signal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
