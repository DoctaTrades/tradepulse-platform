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
  sectorETFs?: { etf: string; label: string; color: string; tickerCount: number }[];
  // New cascading data
  valuation: { pe: number; forwardPE: number; ps: number; pb: number; peg: number; evToEbitda?: number };
  nextEarningsDate?: string | null;
  insiderTransactions?: { name: string; share: number; change: number; filingDate: string; transactionType: string }[];
  insiderSentiment?: string;
  recommendations?: { period: string; buy: number; hold: number; sell: number; strongBuy: number; strongSell: number }[];
  analystConsensus?: string | null;
  totalAnalysts?: number;
  peers?: string[];
  dataSources?: string[];
  error?: string;
}

export default function DeepDiveModule({ user }: { user?: any }) {
  const [ticker, setTicker] = useState('');
  const [data, setData] = useState<DeepDiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stratMatrix, setStratMatrix] = useState<any>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixCollapsed, setMatrixCollapsed] = useState(false);

  const getHeaders = useCallback(async () => {
    const h: Record<string, string> = {};
    if (user?.id) h['x-user-id'] = user.id;
    try {
      const { getAuthHeaders } = await import('@/app/lib/auth-fetch');
      const authH = await getAuthHeaders();
      Object.assign(h, authH);
    } catch {}
    return h;
  }, [user?.id]);

  const loadData = useCallback(async (sym?: string) => {
    const t = (sym || ticker).toUpperCase().trim();
    if (!t) return;
    setLoading(true);
    setError('');
    setData(null);
    setStratMatrix(null);
    const headers = await getHeaders();
    try {
      const res = await fetch(`/api/deep-dive?ticker=${t}`, { headers });
      const d = await res.json();
      if (d.error) setError(d.error);
      else setData(d);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);

    setMatrixLoading(true);
    try {
      const mRes = await fetch(`/api/strat-matrix?ticker=${t}`, { headers });
      const mData = await mRes.json();
      if (!mData.error) setStratMatrix(mData);
    } catch {}
    setMatrixLoading(false);
  }, [ticker, getHeaders]);

  const fmtB = (n: number) => {
    if (!n) return '—';
    if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    return `$${n.toLocaleString()}`;
  };
  const fmtPct = (n: number | null) => n !== null && n !== undefined ? `${n >= 0 ? '+' : ''}${n}%` : '—';
  const pctColor = (n: number) => n >= 0 ? 'var(--tp-success)' : 'var(--tp-danger)';
  const scoreColor = (s: string) => s === 'green' ? 'var(--tp-success)' : s === 'yellow' ? 'var(--tp-warning)' : 'var(--tp-danger)';
  const scoreIcon = (s: string) => s === 'green' ? '🟢' : s === 'yellow' ? '🟡' : '🔴';

  const quickTickers = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD', 'SPY', 'SOFI', 'PLTR', 'COIN'];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') loadData(); }}
          placeholder="Enter ticker (e.g. AAPL, NVDA, TSLA)"
          style={{ flex: 1, maxWidth: 320, padding: '12px 18px', background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 16, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif", letterSpacing: 2, outline: 'none' }} />
        <button onClick={() => loadData()} disabled={loading || !ticker}
          style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: !ticker ? 'var(--navy3)' : 'linear-gradient(135deg, #1e4fd8, #2563eb)', color: !ticker ? 'var(--text-dim)' : '#fff', fontSize: 13, fontWeight: 700, cursor: !ticker ? 'default' : 'pointer', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1, textTransform: 'uppercase' }}>
          {loading ? '⏳ Loading...' : '🔍 Analyze'}
        </button>
      </div>

      {/* Quick picks */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
        {quickTickers.map(t => (
          <button key={t} onClick={() => { setTicker(t); loadData(t); }}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: data?.ticker === t ? 'rgba(var(--tp-accent-rgb), 0.15)' : 'transparent', color: data?.ticker === t ? 'var(--blue3)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'monospace' }}>{t}</button>
        ))}
      </div>

      {error && <div style={{ padding: '14px 18px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }}>🔍</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>STOCK DEEP DIVE</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', maxWidth: 400, margin: '0 auto', lineHeight: 1.7 }}>
            Enter a ticker to get fundamental analysis with a health check, trading context, earnings history, and key financial metrics — all in plain English.
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 24, color: 'var(--blue3)', fontWeight: 700, fontFamily: "'Rajdhani', sans-serif" }}>⚡ Analyzing {ticker}...</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>Pulling financials, earnings, growth, and valuation data</div>
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
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>{data.ticker}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{data.profile.name} · {data.profile.sector} · {data.profile.exchange}</div>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text)' }}>${data.quote.price?.toFixed(2)}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: pctColor(data.quote.change || 0), fontFamily: 'monospace' }}>
                {data.quote.change >= 0 ? '+' : ''}{(data.quote.change || 0).toFixed(2)} ({data.quote.changePct ? `${data.quote.changePct >= 0 ? '+' : ''}${data.quote.changePct.toFixed(2)}%` : '—'})
              </div>
            </div>
          </div>

          {/* ═══ SECTOR ETF MEMBERSHIP ═══ */}
          {data.sectorETFs && data.sectorETFs.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              {data.sectorETFs.map(s => (
                <div key={s.etf} style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: "'Rajdhani', sans-serif" }}>{s.etf}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace' }}>({s.tickerCount} holdings)</span>
                </div>
              ))}
            </div>
          )}

          {/* ═══ STRAT MATRIX ═══ */}
          {matrixLoading && (
            <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading Strat matrix...</div>
            </div>
          )}
          {stratMatrix && (
            <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
              <div onClick={() => setMatrixCollapsed(c => !c)} style={{ padding: '14px 18px', borderBottom: matrixCollapsed ? 'none' : '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', transition: 'transform 0.2s', transform: matrixCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>Multi-Timeframe Strat Matrix</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{stratMatrix.summary.totalSetups} setups across {stratMatrix.matrix.length} timeframes</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {stratMatrix.summary.bullishSetups > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(var(--tp-success-rgb), 0.12)', color: 'var(--tp-success)' }}>▲ {stratMatrix.summary.bullishSetups} Bull</span>}
                  {stratMatrix.summary.bearishSetups > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(var(--tp-danger-rgb), 0.12)', color: 'var(--tp-danger)' }}>▼ {stratMatrix.summary.bearishSetups} Bear</span>}
                  {stratMatrix.summary.neutralSetups > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(var(--tp-warning-rgb), 0.12)', color: 'var(--tp-warning)' }}>● {stratMatrix.summary.neutralSetups} Building</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: stratMatrix.summary.bias === 'BULLISH' ? 'rgba(var(--tp-success-rgb), 0.12)' : stratMatrix.summary.bias === 'BEARISH' ? 'rgba(var(--tp-danger-rgb), 0.12)' : 'rgba(255,255,255,0.06)', color: stratMatrix.summary.bias === 'BULLISH' ? 'var(--tp-success)' : stratMatrix.summary.bias === 'BEARISH' ? 'var(--tp-danger)' : 'var(--text-dim)' }}>Bias: {stratMatrix.summary.bias}</span>
                </div>
              </div>
              {!matrixCollapsed && (<>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', width: 50 }}>TF</th>
                      <th style={{ textAlign: 'center', padding: '7px 12px', fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', width: 45 }}>Strat</th>
                      <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' }}>Sequence (last 5)</th>
                      <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)' }}>Setup</th>
                      <th style={{ textAlign: 'right', padding: '7px 12px', fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', width: 90 }}>Trigger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['daily', 'weekly', 'monthly'].map(group => {
                      const rows = stratMatrix.matrix.filter((m: any) => m.group === group);
                      if (rows.length === 0) return null;
                      return [
                        <tr key={`h-${group}`} style={{ background: 'rgba(var(--tp-accent-rgb), 0.03)' }}>
                          <td colSpan={5} style={{ padding: '5px 12px', fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{group}</td>
                        </tr>,
                        ...rows.map((m: any) => {
                          const stratColor = m.strat === '2U' ? { bg: 'rgba(var(--tp-success-rgb), 0.12)', text: 'var(--tp-success)' } :
                            m.strat === '2D' ? { bg: 'rgba(var(--tp-danger-rgb), 0.12)', text: 'var(--tp-danger)' } :
                            m.strat === '1' ? { bg: 'rgba(var(--tp-warning-rgb), 0.12)', text: 'var(--tp-warning)' } :
                            m.strat === '3' ? { bg: 'rgba(var(--tp-accent-rgb), 0.12)', text: 'var(--tp-accent-light)' } :
                            { bg: 'rgba(255,255,255,0.05)', text: 'var(--text-dim)' };
                          const hasSetup = m.setups.length > 0;
                          return (
                            <tr key={m.timeframe} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: hasSetup ? 'rgba(var(--tp-accent-rgb), 0.02)' : 'transparent' }}>
                              <td style={{ padding: '5px 12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace', fontSize: 11 }}>{m.timeframe}</td>
                              <td style={{ textAlign: 'center', padding: '5px 12px' }}>
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: stratColor.bg, color: stratColor.text }}>{m.strat}</span>
                              </td>
                              <td style={{ padding: '5px 12px', fontFamily: 'monospace', fontSize: 10, color: 'var(--text-dim)' }}>
                                {m.sequence.map((s: string, j: number) => (
                                  <span key={j}>
                                    {j > 0 && <span style={{ color: 'var(--text-dim)', opacity: 0.4 }}> → </span>}
                                    <span style={{ fontWeight: j === m.sequence.length - 1 ? 700 : 400, color: s === '2U' ? 'var(--tp-success)' : s === '2D' ? 'var(--tp-danger)' : s === '1' ? 'var(--tp-warning)' : s === '3' ? 'var(--tp-accent-light)' : 'var(--text-dim)' }}>{s}</span>
                                  </span>
                                ))}
                              </td>
                              <td style={{ padding: '5px 12px' }}>
                                {m.setups.map((s: any, j: number) => (
                                  <span key={j} style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, marginRight: 4, background: s.direction === 'BULLISH' ? 'rgba(var(--tp-success-rgb), 0.12)' : s.direction === 'BEARISH' ? 'rgba(var(--tp-danger-rgb), 0.12)' : 'rgba(var(--tp-accent-rgb), 0.1)', color: s.direction === 'BULLISH' ? 'var(--tp-success)' : s.direction === 'BEARISH' ? 'var(--tp-danger)' : 'var(--tp-accent-light)' }}>{s.pattern}</span>
                                ))}
                                {m.setups.length === 0 && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>—</span>}
                              </td>
                              <td style={{ textAlign: 'right', padding: '5px 12px', fontFamily: 'monospace', fontSize: 10 }}>
                                {m.strat === '1' || m.setups.some((s: any) => s.type === 'building' || s.type === 'coiling') ? (
                                  <div>
                                    <div style={{ color: 'var(--tp-success)' }}>↑ ${m.triggerHigh}</div>
                                    <div style={{ color: 'var(--tp-danger)' }}>↓ ${m.triggerLow}</div>
                                  </div>
                                ) : m.setups.some((s: any) => s.direction === 'BULLISH') ? (
                                  <div style={{ color: 'var(--tp-success)' }}>↑ ${m.triggerHigh}</div>
                                ) : m.setups.some((s: any) => s.direction === 'BEARISH') ? (
                                  <div style={{ color: 'var(--tp-danger)' }}>↓ ${m.triggerLow}</div>
                                ) : (
                                  <span style={{ color: 'var(--text-dim)' }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 14, fontSize: 9, color: 'var(--text-dim)' }}>
                <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: 'rgba(var(--tp-success-rgb), 0.3)', marginRight: 3 }}/>2U</span>
                <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: 'rgba(var(--tp-danger-rgb), 0.3)', marginRight: 3 }}/>2D</span>
                <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: 'rgba(var(--tp-warning-rgb), 0.3)', marginRight: 3 }}/>1 (inside)</span>
                <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: 'rgba(var(--tp-accent-rgb), 0.3)', marginRight: 3 }}/>3 (outside)</span>
                <span style={{ marginLeft: 'auto' }}>↑↓ = breakout triggers</span>
              </div>
              </>)}
            </div>
          )}

          {/* ═══ HEALTH CHECK + TRADING CONTEXT ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Health Check */}
            <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 14 }}>Fundamental Health Check</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.healthChecks.map(h => (
                  <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14 }}>{scoreIcon(h.score)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{h.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: scoreColor(h.score) }}>{h.value}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{h.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              {data.rating && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--navy3)', borderRadius: 8, fontSize: 11, color: 'var(--text-mid)' }}>
                  Analyst Consensus: <span style={{ color: 'var(--tp-accent-light)', fontWeight: 700 }}>{data.rating}</span>
                </div>
              )}
            </div>

            {/* Trading Context */}
            <div style={{ background: 'var(--shell-active)', border: '1px solid var(--blue)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 9, color: 'var(--blue3)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>⚡ Trading Context</div>
              <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.8, flex: 1 }}>{data.tradingContext}</div>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--navy3)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', textTransform: 'uppercase' }}>52W Range</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-mid)' }}>${data.quote.low52?.toFixed(2)} — ${data.quote.high52?.toFixed(2)}</div>
                </div>
                <div style={{ background: 'var(--navy3)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Mkt Cap</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-mid)' }}>{fmtB(data.profile.mktCap)}</div>
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
              { label: 'EV/EBITDA', value: data.valuation.evToEbitda ? `${data.valuation.evToEbitda}x` : '—' },
              { label: 'Rev Growth', value: fmtPct(data.growth.revenueGrowth), color: data.growth.revenueGrowth > 0 ? 'var(--tp-success)' : 'var(--tp-danger)' },
              { label: 'EPS Growth', value: fmtPct(data.growth.epsGrowth), color: data.growth.epsGrowth > 0 ? 'var(--tp-success)' : 'var(--tp-danger)' },
              { label: 'Gross Margin', value: data.margins.gross ? `${data.margins.gross}%` : '—' },
              { label: 'Net Margin', value: data.margins.net ? `${data.margins.net}%` : '—', color: data.margins.net > 0 ? 'var(--tp-success)' : 'var(--tp-danger)' },
              { label: 'Debt/Equity', value: data.debtHealth.debtToEquity !== null ? `${data.debtHealth.debtToEquity}x` : '—' },
              { label: 'Current Ratio', value: data.debtHealth.currentRatio ? `${data.debtHealth.currentRatio}x` : '—' },
              { label: 'Free Cash Flow', value: fmtB(data.cashFlow.freeCashFlow), color: data.cashFlow.freeCashFlow > 0 ? 'var(--tp-success)' : 'var(--tp-danger)' },
              { label: 'Div Yield', value: data.dividend.yield ? `${data.dividend.yield}%` : 'None' },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: (m as any).color || 'var(--text)' }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* ═══ BOTTOM ROW: Earnings + Revenue History ═══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Earnings Surprises */}
            <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 12 }}>Recent Earnings</div>
              {data.earnings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.earnings.map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--navy3)', borderRadius: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-mid)', fontFamily: 'monospace' }}>{e.date}</span>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Est: ${e.estimated?.toFixed(2)}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Act: ${e.actual?.toFixed(2)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: e.beat ? 'var(--tp-success)' : 'var(--tp-danger)' }}>
                          {e.beat ? '✓ Beat' : '✗ Miss'} {e.surprise !== null ? `($${Math.abs(e.surprise).toFixed(2)})` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No earnings data available</div>}
            </div>

            {/* Revenue History */}
            <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 12 }}>Revenue & Earnings History</div>
              {data.revenueHistory.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Year', 'Revenue', 'Net Income', 'EPS'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Year' ? 'left' : 'right', fontSize: 9, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenueHistory.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-mid)', fontFamily: 'monospace' }}>{r.year}</td>
                        <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text)', fontFamily: 'monospace', textAlign: 'right' }}>{fmtB(r.revenue)}</td>
                        <td style={{ padding: '6px 8px', fontSize: 11, color: r.netIncome > 0 ? 'var(--tp-success)' : 'var(--tp-danger)', fontFamily: 'monospace', textAlign: 'right' }}>{fmtB(r.netIncome)}</td>
                        <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text)', fontFamily: 'monospace', textAlign: 'right' }}>${r.eps?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No revenue history available</div>}
            </div>
          </div>

          {/* ── NEW: Insider Activity, Analyst Recs, Peers ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>

            {/* Insider Transactions */}
            {data.insiderTransactions && data.insiderTransactions.length > 0 && (
              <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>Insider Activity</div>
                  {data.insiderSentiment && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                      background: data.insiderSentiment === 'net-buyer' ? 'rgba(var(--tp-success-rgb), 0.1)' : data.insiderSentiment === 'net-seller' ? 'rgba(var(--tp-danger-rgb), 0.1)' : 'rgba(var(--tp-warning-rgb), 0.1)',
                      color: data.insiderSentiment === 'net-buyer' ? 'var(--tp-success)' : data.insiderSentiment === 'net-seller' ? 'var(--tp-danger)' : 'var(--tp-warning)'
                    }}>
                      {data.insiderSentiment === 'net-buyer' ? '↑ Net Buying' : data.insiderSentiment === 'net-seller' ? '↓ Net Selling' : '— Neutral'}
                    </span>
                  )}
                </div>
                {data.insiderTransactions.slice(0, 6).map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none', fontSize: 11 }}>
                    <div>
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{t.name?.split(' ').slice(0, 2).join(' ')}</span>
                      <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>{t.filingDate}</span>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                      color: t.change > 0 ? 'var(--tp-success)' : 'var(--tp-danger)'
                    }}>
                      {t.change > 0 ? '+' : ''}{t.change?.toLocaleString()} shares
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Analyst Recommendations */}
            {data.recommendations && data.recommendations.length > 0 && (
              <div style={{ background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>Analyst Consensus</div>
                  {data.analystConsensus && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                      background: data.analystConsensus === 'Buy' ? 'rgba(var(--tp-success-rgb), 0.1)' : data.analystConsensus === 'Sell' ? 'rgba(var(--tp-danger-rgb), 0.1)' : 'rgba(var(--tp-warning-rgb), 0.1)',
                      color: data.analystConsensus === 'Buy' ? 'var(--tp-success)' : data.analystConsensus === 'Sell' ? 'var(--tp-danger)' : 'var(--tp-warning)'
                    }}>
                      {data.analystConsensus} ({data.totalAnalysts} analysts)
                    </span>
                  )}
                </div>
                {data.recommendations.slice(0, 3).map((r, i) => {
                  const total = (r.strongBuy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strongSell || 0);
                  if (total === 0) return null;
                  return (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>{r.period}</div>
                      <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden' }}>
                        {r.strongBuy > 0 && <div style={{ width: `${(r.strongBuy / total) * 100}%`, background: '#059669' }} title={`Strong Buy: ${r.strongBuy}`}/>}
                        {r.buy > 0 && <div style={{ width: `${(r.buy / total) * 100}%`, background: 'var(--tp-success)' }} title={`Buy: ${r.buy}`}/>}
                        {r.hold > 0 && <div style={{ width: `${(r.hold / total) * 100}%`, background: 'var(--tp-warning)' }} title={`Hold: ${r.hold}`}/>}
                        {r.sell > 0 && <div style={{ width: `${(r.sell / total) * 100}%`, background: 'var(--tp-danger)' }} title={`Sell: ${r.sell}`}/>}
                        {r.strongSell > 0 && <div style={{ width: `${(r.strongSell / total) * 100}%`, background: '#dc2626' }} title={`Strong Sell: ${r.strongSell}`}/>}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                        <span style={{ color: 'var(--tp-success)' }}>Buy {(r.strongBuy || 0) + (r.buy || 0)}</span>
                        <span style={{ color: 'var(--tp-warning)' }}>Hold {r.hold || 0}</span>
                        <span style={{ color: 'var(--tp-danger)' }}>Sell {(r.sell || 0) + (r.strongSell || 0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Peers & Data Sources */}
          {(data.peers?.length > 0 || data.nextEarningsDate || data.dataSources?.length > 0) && (
            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {data.nextEarningsDate && (
                <span style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: 'rgba(var(--tp-warning-rgb), 0.08)', border: '1px solid rgba(var(--tp-warning-rgb), 0.15)', color: 'var(--tp-warning)', fontWeight: 600 }}>
                  📅 Next Earnings: {data.nextEarningsDate}
                </span>
              )}
              {data.peers && data.peers.length > 0 && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Peers:</span>
                  {data.peers.map(p => (
                    <button key={p} onClick={() => { setTicker(p); loadData(p); }} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(var(--tp-accent-rgb), 0.2)', background: 'rgba(var(--tp-accent-rgb), 0.06)', color: 'var(--tp-accent-light)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
              {data.dataSources && data.dataSources.length > 0 && (
                <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 'auto' }}>
                  Sources: {data.dataSources.join(' + ')}
                </span>
              )}
            </div>
          )}

          {/* Company Description */}
          {data.profile.description && (
            <div style={{ marginTop: 14, background: 'var(--shell-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>About {data.profile.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.7 }}>{data.profile.description.substring(0, 500)}{data.profile.description.length > 500 ? '...' : ''}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
