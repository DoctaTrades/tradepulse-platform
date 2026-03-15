'use client';

import { useState, useCallback } from 'react';

interface DeepDiveData {
  ticker: string;
  profile: { name: string; sector: string; industry: string; description: string; mktCap: number; employees: number; exchange: string; website: string; image: string };
  quote: { price: number; change: number; changePct: number; volume: number; avgVolume: number; high52: number; low52: number };
  valuation: { pe: number; forwardPE: number; ps: number; pb: number; peg: number };
  growth: { revenueGrowth: number; epsGrowth: number };
  margins: { gross: number; operating: number; net: number };
  debtHealth: { debtToEquity: number; currentRatio: number; totalDebt: number; totalCash: number; netDebt: number };
  cashFlow: { freeCashFlow: number; fcfMargin: number };
  dividend: { yield: number; payoutRatio: number };
  earnings: { date: string; actual: number; estimated: number; surprise: number; beat: boolean }[];
  revenueHistory: { year: string; revenue: number; netIncome: number; eps: number }[];
  healthChecks: { name: string; value: string; score: 'green' | 'yellow' | 'red'; detail: string }[];
  tradingContext: string;
  rating: string | null;
  error?: string;
}

export default function DeepDiveModule() {
  const [ticker, setTicker] = useState('');
  const [data, setData] = useState<DeepDiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async (sym?: string) => {
    const t = (sym || ticker).toUpperCase().trim();
    if (!t) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await fetch(`/api/deep-dive?ticker=${t}`);
      const d = await res.json();
      if (d.error) setError(d.error);
      else setData(d);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [ticker]);

  const fmtB = (n: number) => {
    if (!n) return '—';
    if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    return `$${n.toLocaleString()}`;
  };
  const fmtPct = (n: number | null) => n !== null && n !== undefined ? `${n >= 0 ? '+' : ''}${n}%` : '—';
  const pctColor = (n: number) => n >= 0 ? '#4ade80' : '#f87171';
  const scoreColor = (s: string) => s === 'green' ? '#4ade80' : s === 'yellow' ? '#eab308' : '#f87171';
  const scoreIcon = (s: string) => s === 'green' ? '🟢' : s === 'yellow' ? '🟡' : '🔴';

  const quickTickers = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD', 'SPY', 'SOFI', 'PLTR', 'COIN'];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') loadData(); }}
          placeholder="Enter ticker (e.g. AAPL, NVDA, TSLA)"
          style={{ flex: 1, maxWidth: 320, padding: '12px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#e2e4ea', fontSize: 16, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif", letterSpacing: 2, outline: 'none' }} />
        <button onClick={() => loadData()} disabled={loading || !ticker}
          style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: !ticker ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #1e4fd8, #2563eb)', color: !ticker ? '#3d4150' : '#fff', fontSize: 13, fontWeight: 700, cursor: !ticker ? 'default' : 'pointer', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1, textTransform: 'uppercase' }}>
          {loading ? '⏳ Loading...' : '🔍 Analyze'}
        </button>
      </div>

      {/* Quick picks */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
        {quickTickers.map(t => (
          <button key={t} onClick={() => { setTicker(t); loadData(t); }}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', background: data?.ticker === t ? 'rgba(99,102,241,0.15)' : 'transparent', color: data?.ticker === t ? '#a5b4fc' : '#5c6070', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'monospace' }}>{t}</button>
        ))}
      </div>

      {error && <div style={{ padding: '14px 18px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }}>🔍</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#e2e4ea', marginBottom: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>STOCK DEEP DIVE</div>
          <div style={{ fontSize: 13, color: '#5c6070', maxWidth: 400, margin: '0 auto', lineHeight: 1.7 }}>
            Enter a ticker to get fundamental analysis with a health check, trading context, earnings history, and key financial metrics — all in plain English.
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 24, color: '#3b82f6', fontWeight: 700, fontFamily: "'Rajdhani', sans-serif" }}>⚡ Analyzing {ticker}...</div>
          <div style={{ fontSize: 12, color: '#5c6070', marginTop: 8 }}>Pulling financials, earnings, growth, and valuation data</div>
        </div>
      )}

      {data && (
        <>
          {/* ═══ HEADER ═══ */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {data.profile.image && <img src={data.profile.image} alt="" style={{ width: 36, height: 36, borderRadius: 8 }} />}
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#e2e4ea', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>{data.ticker}</div>
                  <div style={{ fontSize: 13, color: '#8a8f9e' }}>{data.profile.name} · {data.profile.sector} · {data.profile.exchange}</div>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: '#e2e4ea' }}>${data.quote.price?.toFixed(2)}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: pctColor(data.quote.changePct), fontFamily: 'monospace' }}>
                {data.quote.change >= 0 ? '+' : ''}{data.quote.change?.toFixed(2)} ({fmtPct(Math.round(data.quote.changePct * 100) / 100)})
              </div>
            </div>
          </div>

          {/* ═══ HEALTH CHECK + TRADING CONTEXT ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Health Check */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 9, color: '#5c6070', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 14 }}>Fundamental Health Check</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.healthChecks.map(h => (
                  <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14 }}>{scoreIcon(h.score)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e4ea' }}>{h.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: scoreColor(h.score) }}>{h.value}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#5c6070', marginTop: 1 }}>{h.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              {data.rating && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, fontSize: 11, color: '#8a8f9e' }}>
                  Analyst Consensus: <span style={{ color: '#a5b4fc', fontWeight: 700 }}>{data.rating}</span>
                </div>
              )}
            </div>

            {/* Trading Context */}
            <div style={{ background: 'rgba(30,79,216,0.06)', border: '1px solid rgba(30,79,216,0.15)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 9, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>⚡ Trading Context</div>
              <div style={{ fontSize: 13, color: '#c8cad0', lineHeight: 1.8, flex: 1 }}>{data.tradingContext}</div>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, color: '#5c6070', textTransform: 'uppercase' }}>52W Range</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#8a8f9e' }}>${data.quote.low52?.toFixed(2)} — ${data.quote.high52?.toFixed(2)}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, color: '#5c6070', textTransform: 'uppercase' }}>Mkt Cap</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#8a8f9e' }}>{fmtB(data.profile.mktCap)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ KEY METRICS GRID ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'P/E Ratio', value: data.valuation.pe ? `${data.valuation.pe}x` : '—' },
              { label: 'P/S Ratio', value: data.valuation.ps ? `${data.valuation.ps}x` : '—' },
              { label: 'PEG Ratio', value: data.valuation.peg ? `${data.valuation.peg}x` : '—' },
              { label: 'P/B Ratio', value: data.valuation.pb ? `${data.valuation.pb}x` : '—' },
              { label: 'Rev Growth', value: fmtPct(data.growth.revenueGrowth), color: data.growth.revenueGrowth > 0 ? '#4ade80' : '#f87171' },
              { label: 'EPS Growth', value: fmtPct(data.growth.epsGrowth), color: data.growth.epsGrowth > 0 ? '#4ade80' : '#f87171' },
              { label: 'Gross Margin', value: data.margins.gross ? `${data.margins.gross}%` : '—' },
              { label: 'Net Margin', value: data.margins.net ? `${data.margins.net}%` : '—', color: data.margins.net > 0 ? '#4ade80' : '#f87171' },
              { label: 'Debt/Equity', value: data.debtHealth.debtToEquity !== null ? `${data.debtHealth.debtToEquity}x` : '—' },
              { label: 'Current Ratio', value: data.debtHealth.currentRatio ? `${data.debtHealth.currentRatio}x` : '—' },
              { label: 'Free Cash Flow', value: fmtB(data.cashFlow.freeCashFlow), color: data.cashFlow.freeCashFlow > 0 ? '#4ade80' : '#f87171' },
              { label: 'Div Yield', value: data.dividend.yield ? `${data.dividend.yield}%` : 'None' },
            ].map(m => (
              <div key={m.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 9, color: '#5c6070', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: (m as any).color || '#e2e4ea' }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* ═══ BOTTOM ROW: Earnings + Revenue History ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Earnings Surprises */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 9, color: '#5c6070', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 12 }}>Recent Earnings</div>
              {data.earnings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.earnings.map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(0,0,0,0.15)', borderRadius: 6 }}>
                      <span style={{ fontSize: 11, color: '#8a8f9e', fontFamily: 'monospace' }}>{e.date}</span>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#5c6070' }}>Est: ${e.estimated?.toFixed(2)}</span>
                        <span style={{ fontSize: 10, color: '#5c6070' }}>Act: ${e.actual?.toFixed(2)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: e.beat ? '#4ade80' : '#f87171' }}>
                          {e.beat ? '✓ Beat' : '✗ Miss'} {e.surprise !== null ? `($${Math.abs(e.surprise).toFixed(2)})` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 12, color: '#5c6070' }}>No earnings data available</div>}
            </div>

            {/* Revenue History */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 9, color: '#5c6070', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 12 }}>Revenue & Earnings History</div>
              {data.revenueHistory.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Year', 'Revenue', 'Net Income', 'EPS'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Year' ? 'left' : 'right', fontSize: 9, color: '#3d4150', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenueHistory.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '6px 8px', fontSize: 11, color: '#8a8f9e', fontFamily: 'monospace' }}>{r.year}</td>
                        <td style={{ padding: '6px 8px', fontSize: 11, color: '#e2e4ea', fontFamily: 'monospace', textAlign: 'right' }}>{fmtB(r.revenue)}</td>
                        <td style={{ padding: '6px 8px', fontSize: 11, color: r.netIncome > 0 ? '#4ade80' : '#f87171', fontFamily: 'monospace', textAlign: 'right' }}>{fmtB(r.netIncome)}</td>
                        <td style={{ padding: '6px 8px', fontSize: 11, color: '#e2e4ea', fontFamily: 'monospace', textAlign: 'right' }}>${r.eps?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div style={{ fontSize: 12, color: '#5c6070' }}>No revenue history available</div>}
            </div>
          </div>

          {/* Company Description */}
          {data.profile.description && (
            <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 9, color: '#5c6070', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>About {data.profile.name}</div>
              <div style={{ fontSize: 12, color: '#8a8f9e', lineHeight: 1.7 }}>{data.profile.description.substring(0, 500)}{data.profile.description.length > 500 ? '...' : ''}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
