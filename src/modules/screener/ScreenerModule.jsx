import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, RefreshCw, Settings, Filter, ChevronDown, ChevronUp, ChevronRight, X, Plus, Check, AlertTriangle, Zap, TrendingUp, TrendingDown, DollarSign, Shield, Layers, Target, Clock, BarChart3 } from "lucide-react";
import { supabase } from "../../App";

// ─── PULSE CORE UNIVERSE (56 tickers) ────────────────────────────────────────
const PULSE_CORE = [
  "AAPL","MSFT","AMZN","GOOGL","META","NVDA","TSLA","AMD","NFLX","DIS",
  "BA","JPM","GS","V","MA","UNH","JNJ","PFE","MRK","ABBV",
  "XOM","CVX","COP","SLB","OXY","HD","LOW","TGT","WMT","COST",
  "CAT","DE","GE","HON","LMT","RTX","SPY","QQQ","IWM","DIA",
  "XLF","XLE","XLK","XLV","ARKK","SOFI","PLTR","COIN","MARA","RIOT",
  "SQ","PYPL","SHOP","SNOW","CRWD","NET"
];

// ─── STRATEGY DEFINITIONS ────────────────────────────────────────────────────
const STRATEGIES = [
  { id:"csp", label:"Cash-Secured Put", short:"CSP", icon:Shield, color:"#60a5fa",
    desc:"Sell puts on stocks you want to own at lower prices",
    filter: (chain, ticker, price) => filterCSP(chain, ticker, price) },
  { id:"cc", label:"Covered Call", short:"CC", icon:TrendingUp, color:"#4ade80",
    desc:"Sell calls against shares you own for income",
    filter: (chain, ticker, price) => filterCC(chain, ticker, price) },
  { id:"pmcc", label:"PMCC / Diagonal", short:"PMCC", icon:Layers, color:"#a78bfa",
    desc:"Poor Man's Covered Call — long LEAP + short calls",
    filter: (chain, ticker, price) => filterPMCC(chain, ticker, price) },
  { id:"calendar", label:"Calendar Press", short:"Cal", icon:Clock, color:"#eab308",
    desc:"Long dated option + short weeklies for premium",
    filter: (chain, ticker, price) => filterCalendar(chain, ticker, price) },
  { id:"pcs", label:"Put Credit Spread", short:"PCS", icon:ChevronUp, color:"#34d399",
    desc:"Bullish vertical — sell put, buy lower put",
    filter: (chain, ticker, price) => filterPCS(chain, ticker, price) },
  { id:"ccs", label:"Call Credit Spread", short:"CCS", icon:ChevronDown, color:"#f87171",
    desc:"Bearish vertical — sell call, buy higher call",
    filter: (chain, ticker, price) => filterCCS(chain, ticker, price) },
  { id:"ic", label:"Iron Condor", short:"IC", icon:Target, color:"#f472b6",
    desc:"Neutral — sell OTM put spread + OTM call spread",
    filter: (chain, ticker, price) => filterIC(chain, ticker, price) },
  { id:"custom", label:"Custom Scan", short:"Custom", icon:Filter, color:"#8a8f9e",
    desc:"Build your own filters — DTE, delta, IV, premium",
    filter: null },
];

// ─── STRATEGY FILTERS ────────────────────────────────────────────────────────
function filterCSP(chain, ticker, price) {
  const puts = (chain.puts || []).filter(o => 
    o.putCall === "PUT" && o.delta && Math.abs(o.delta) >= 0.15 && Math.abs(o.delta) <= 0.35 &&
    o.daysToExpiration >= 20 && o.daysToExpiration <= 50 &&
    o.bid > 0.10 && o.strikePrice < price
  );
  return puts.map(o => ({
    ...o, ticker, currentPrice: price, strategy: "CSP",
    maxProfit: o.bid * 100,
    maxRisk: (o.strikePrice - o.bid) * 100,
    ror: o.bid / (o.strikePrice - o.bid) * 100,
    annualizedRor: (o.bid / (o.strikePrice - o.bid)) * (365 / o.daysToExpiration) * 100
  }));
}

function filterCC(chain, ticker, price) {
  const calls = (chain.calls || []).filter(o =>
    o.putCall === "CALL" && o.delta && o.delta >= 0.15 && o.delta <= 0.40 &&
    o.daysToExpiration >= 20 && o.daysToExpiration <= 50 &&
    o.bid > 0.10 && o.strikePrice > price
  );
  return calls.map(o => ({
    ...o, ticker, currentPrice: price, strategy: "CC",
    maxProfit: o.bid * 100 + (o.strikePrice - price) * 100,
    maxRisk: (price - o.bid) * 100,
    ror: o.bid / price * 100,
    annualizedRor: (o.bid / price) * (365 / o.daysToExpiration) * 100
  }));
}

function filterPMCC(chain, ticker, price) {
  const longCalls = (chain.calls || []).filter(o =>
    o.putCall === "CALL" && o.delta && o.delta >= 0.70 &&
    o.daysToExpiration >= 180 && o.ask > 0
  );
  const shortCalls = (chain.calls || []).filter(o =>
    o.putCall === "CALL" && o.delta && o.delta >= 0.20 && o.delta <= 0.40 &&
    o.daysToExpiration >= 20 && o.daysToExpiration <= 50 && o.bid > 0.10
  );
  const results = [];
  longCalls.slice(0, 3).forEach(lc => {
    shortCalls.slice(0, 5).forEach(sc => {
      if (sc.strikePrice > lc.strikePrice) {
        const debit = lc.ask;
        const credit = sc.bid;
        results.push({
          ticker, currentPrice: price, strategy: "PMCC",
          longLeg: lc, shortLeg: sc,
          netDebit: (debit - credit) * 100,
          maxProfit: (sc.strikePrice - lc.strikePrice - debit + credit) * 100,
          ror: credit / debit * 100,
          daysToExpiration: sc.daysToExpiration,
          delta: sc.delta,
          longDelta: lc.delta,
        });
      }
    });
  });
  return results.slice(0, 10);
}

function filterCalendar(chain, ticker, price) {
  const longPuts = (chain.puts || []).filter(o =>
    o.putCall === "PUT" && o.daysToExpiration >= 60 && o.ask > 0
  );
  const shortPuts = (chain.puts || []).filter(o =>
    o.putCall === "PUT" && o.daysToExpiration >= 5 && o.daysToExpiration <= 35 && o.bid > 0.05
  );
  const results = [];
  longPuts.slice(0, 5).forEach(lp => {
    shortPuts.filter(sp => Math.abs(sp.strikePrice - lp.strikePrice) < price * 0.03).slice(0, 3).forEach(sp => {
      const debit = lp.ask - sp.bid;
      if (debit > 0) {
        results.push({
          ticker, currentPrice: price, strategy: "Calendar",
          longLeg: lp, shortLeg: sp,
          netDebit: debit * 100,
          shortCredit: sp.bid * 100,
          ror: sp.bid / debit * 100,
          daysToExpiration: sp.daysToExpiration,
          strike: sp.strikePrice,
        });
      }
    });
  });
  return results.slice(0, 10);
}

function filterPCS(chain, ticker, price) {
  const puts = (chain.puts || []).filter(o =>
    o.putCall === "PUT" && o.daysToExpiration >= 20 && o.daysToExpiration <= 50 && o.bid > 0
  ).sort((a, b) => b.strikePrice - a.strikePrice);
  const results = [];
  for (let i = 0; i < puts.length - 1; i++) {
    const sell = puts[i];
    if (!sell.delta || Math.abs(sell.delta) > 0.35 || Math.abs(sell.delta) < 0.15) continue;
    for (let j = i + 1; j < Math.min(i + 4, puts.length); j++) {
      const buy = puts[j];
      const width = sell.strikePrice - buy.strikePrice;
      if (width <= 0 || width > price * 0.1) continue;
      const credit = sell.bid - buy.ask;
      if (credit <= 0) continue;
      results.push({
        ticker, currentPrice: price, strategy: "PCS",
        sellLeg: sell, buyLeg: buy,
        credit: credit * 100, width: width * 100,
        maxRisk: (width - credit) * 100,
        ror: credit / (width - credit) * 100,
        daysToExpiration: sell.daysToExpiration,
        delta: sell.delta,
      });
    }
  }
  return results.sort((a, b) => b.ror - a.ror).slice(0, 15);
}

function filterCCS(chain, ticker, price) {
  const calls = (chain.calls || []).filter(o =>
    o.putCall === "CALL" && o.daysToExpiration >= 20 && o.daysToExpiration <= 50 && o.bid > 0
  ).sort((a, b) => a.strikePrice - b.strikePrice);
  const results = [];
  for (let i = 0; i < calls.length - 1; i++) {
    const sell = calls[i];
    if (!sell.delta || sell.delta > 0.35 || sell.delta < 0.15) continue;
    for (let j = i + 1; j < Math.min(i + 4, calls.length); j++) {
      const buy = calls[j];
      const width = buy.strikePrice - sell.strikePrice;
      if (width <= 0 || width > price * 0.1) continue;
      const credit = sell.bid - buy.ask;
      if (credit <= 0) continue;
      results.push({
        ticker, currentPrice: price, strategy: "CCS",
        sellLeg: sell, buyLeg: buy,
        credit: credit * 100, width: width * 100,
        maxRisk: (width - credit) * 100,
        ror: credit / (width - credit) * 100,
        daysToExpiration: sell.daysToExpiration,
        delta: sell.delta,
      });
    }
  }
  return results.sort((a, b) => b.ror - a.ror).slice(0, 15);
}

function filterIC(chain, ticker, price) {
  const pcsResults = filterPCS(chain, ticker, price).slice(0, 5);
  const ccsResults = filterCCS(chain, ticker, price).slice(0, 5);
  const results = [];
  pcsResults.forEach(pcs => {
    ccsResults.filter(ccs => ccs.daysToExpiration === pcs.daysToExpiration).forEach(ccs => {
      const totalCredit = pcs.credit + ccs.credit;
      const totalWidth = Math.max(pcs.width, ccs.width);
      results.push({
        ticker, currentPrice: price, strategy: "IC",
        putSide: pcs, callSide: ccs,
        credit: totalCredit, maxRisk: totalWidth - totalCredit,
        ror: totalCredit / (totalWidth - totalCredit) * 100,
        daysToExpiration: pcs.daysToExpiration,
      });
    });
  });
  return results.sort((a, b) => b.ror - a.ror).slice(0, 10);
}

// ─── API HELPERS ─────────────────────────────────────────────────────────────
async function fetchSchwabToken(clientId, clientSecret, refreshToken) {
  const resp = await fetch("https://api.schwabapi.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + btoa(clientId + ":" + clientSecret) },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function fetchSchwabChain(accessToken, ticker) {
  const resp = await fetch(`https://api.schwabapi.com/marketdata/v1/chains?symbol=${ticker}&contractType=ALL&strikeCount=20&includeUnderlyingQuote=true&strategy=SINGLE`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const calls = [], puts = [];
  const price = data.underlyingPrice || data.underlying?.last;
  
  if (data.callExpDateMap) {
    Object.values(data.callExpDateMap).forEach(strikes => {
      Object.values(strikes).forEach(contracts => {
        contracts.forEach(c => calls.push({
          putCall: "CALL", symbol: c.symbol, strikePrice: c.strikePrice,
          bid: c.bid, ask: c.ask, last: c.last, volume: c.totalVolume,
          openInterest: c.openInterest, delta: c.delta, gamma: c.gamma,
          theta: c.theta, vega: c.vega, iv: c.volatility,
          daysToExpiration: c.daysToExpiration, expirationDate: c.expirationDate,
          inTheMoney: c.inTheMoney
        }));
      });
    });
  }
  if (data.putExpDateMap) {
    Object.values(data.putExpDateMap).forEach(strikes => {
      Object.values(strikes).forEach(contracts => {
        contracts.forEach(c => puts.push({
          putCall: "PUT", symbol: c.symbol, strikePrice: c.strikePrice,
          bid: c.bid, ask: c.ask, last: c.last, volume: c.totalVolume,
          openInterest: c.openInterest, delta: c.delta, gamma: c.gamma,
          theta: c.theta, vega: c.vega, iv: c.volatility,
          daysToExpiration: c.daysToExpiration, expirationDate: c.expirationDate,
          inTheMoney: c.inTheMoney
        }));
      });
    });
  }
  return { calls, puts, price };
}

async function fetchPolygonChain(ticker, apiKey) {
  try {
    // Get current price
    const priceResp = await fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?apiKey=${apiKey}`);
    const priceData = await priceResp.json();
    const price = priceData.results?.[0]?.c;
    if (!price) return null;

    // Get options contracts
    const now = new Date();
    const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const resp = await fetch(`https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${now.toISOString().split("T")[0]}&expiration_date.lte=${future.toISOString().split("T")[0]}&limit=250&apiKey=${apiKey}`);
    const data = await resp.json();
    if (!data.results) return { calls: [], puts: [], price };

    const calls = [], puts = [];
    data.results.forEach(c => {
      const dte = Math.round((new Date(c.expiration_date) - now) / (1000 * 60 * 60 * 24));
      const opt = {
        putCall: c.contract_type === "call" ? "CALL" : "PUT",
        symbol: c.ticker, strikePrice: c.strike_price,
        bid: 0, ask: 0, last: 0, volume: 0, openInterest: 0,
        delta: null, gamma: null, theta: null, vega: null, iv: null,
        daysToExpiration: dte, expirationDate: c.expiration_date,
        inTheMoney: c.contract_type === "call" ? c.strike_price < price : c.strike_price > price
      };
      if (c.contract_type === "call") calls.push(opt); else puts.push(opt);
    });
    return { calls, puts, price };
  } catch { return null; }
}

// ─── SCREENER MODULE ─────────────────────────────────────────────────────────
export default function ScreenerModule({ user, theme }) {
  const [activeStrategy, setActiveStrategy] = useState("csp");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, ticker: "" });
  const [results, setResults] = useState([]);
  const [sortField, setSortField] = useState("ror");
  const [sortDir, setSortDir] = useState("desc");
  const [showSettings, setShowSettings] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);

  // API config (per-user, stored in Supabase prefs)
  const [apiConfig, setApiConfig] = useState({ schwabClientId: "", schwabSecret: "", schwabRefreshToken: "", polygonKey: "", dataSource: "polygon" });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Custom ticker list
  const [customTickers, setCustomTickers] = useState([]);
  const [tickerInput, setTickerInput] = useState("");
  const [useCustomList, setUseCustomList] = useState(false);

  // Custom filter (for custom scan tab)
  const [customFilter, setCustomFilter] = useState({ minDTE: 20, maxDTE: 50, minDelta: 0.15, maxDelta: 0.35, minPremium: 0.10, optionType: "PUT" });

  // Load API config from Supabase
  useEffect(() => {
    if (!user) return;
    supabase.from("user_data").select("screener_config").eq("user_id", user.id).single().then(({ data }) => {
      if (data?.screener_config) {
        setApiConfig(prev => ({ ...prev, ...data.screener_config }));
        if (data.screener_config.customTickers) setCustomTickers(data.screener_config.customTickers);
      }
      setConfigLoaded(true);
    });
  }, [user]);

  // Save API config
  const saveConfig = useCallback(async (newConfig) => {
    const merged = { ...apiConfig, ...newConfig, customTickers };
    setApiConfig(merged);
    if (user) {
      await supabase.from("user_data").upsert({ user_id: user.id, screener_config: { ...merged, customTickers } }, { onConflict: "user_id" });
    }
  }, [apiConfig, customTickers, user]);

  const tickers = useCustomList && customTickers.length > 0 ? customTickers : PULSE_CORE;
  const strategy = STRATEGIES.find(s => s.id === activeStrategy);

  // ── SCAN ENGINE ──
  const runScan = async () => {
    if (scanning) return;
    setScanning(true);
    setResults([]);
    setScanProgress({ current: 0, total: tickers.length, ticker: "" });

    const allResults = [];
    const hasSwab = apiConfig.dataSource === "schwab" && apiConfig.schwabClientId && apiConfig.schwabSecret && apiConfig.schwabRefreshToken;
    const hasPoly = apiConfig.polygonKey;

    if (!hasSwab && !hasPoly) {
      alert("Please configure an API key in Screener Settings. You need either a Schwab API or Polygon API key.");
      setScanning(false);
      return;
    }

    let accessToken = null;
    if (hasSwab) {
      const tokenData = await fetchSchwabToken(apiConfig.schwabClientId, apiConfig.schwabSecret, apiConfig.schwabRefreshToken);
      if (tokenData?.access_token) accessToken = tokenData.access_token;
      else if (hasPoly) { /* fallback to polygon */ }
      else { alert("Schwab token refresh failed. Check your credentials."); setScanning(false); return; }
    }

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      setScanProgress({ current: i + 1, total: tickers.length, ticker });

      let chain = null;
      if (accessToken) {
        chain = await fetchSchwabChain(accessToken, ticker);
      }
      if (!chain && hasPoly) {
        chain = await fetchPolygonChain(ticker, apiConfig.polygonKey);
      }
      if (!chain || !chain.price) continue;

      if (activeStrategy === "custom") {
        // Custom filter
        const opts = customFilter.optionType === "PUT" ? (chain.puts || []) : (chain.calls || []);
        const filtered = opts.filter(o =>
          o.daysToExpiration >= customFilter.minDTE && o.daysToExpiration <= customFilter.maxDTE &&
          o.delta && Math.abs(o.delta) >= customFilter.minDelta && Math.abs(o.delta) <= customFilter.maxDelta &&
          o.bid >= customFilter.minPremium
        ).map(o => ({
          ...o, ticker, currentPrice: chain.price, strategy: "Custom",
          maxProfit: o.bid * 100, ror: 0
        }));
        allResults.push(...filtered);
      } else if (strategy?.filter) {
        const filtered = strategy.filter(chain, ticker, chain.price);
        allResults.push(...filtered);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, accessToken ? 350 : 250));
    }

    setResults(allResults);
    setScanning(false);
  };

  // ── SORT ──
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [results, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortHeader = ({ field, label, align }) => (
    <th onClick={()=>toggleSort(field)} style={{ padding:"8px 10px", textAlign:align||"left", cursor:"pointer", fontSize:9, fontWeight:600, color: sortField===field ? "#a5b4fc" : theme.textFaintest, textTransform:"uppercase", letterSpacing:0.5, borderBottom:`1px solid ${theme.border}`, background:"rgba(0,0,0,0.15)", userSelect:"none", whiteSpace:"nowrap" }}>
      {label} {sortField===field && (sortDir==="desc" ? "↓" : "↑")}
    </th>
  );

  const fmtD = n => `$${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}`;

  // ── RENDER ──
  return (
    <div style={{ maxWidth:1200 }}>
      {/* Strategy Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap" }}>
        {STRATEGIES.map(s => (
          <button key={s.id} onClick={()=>{setActiveStrategy(s.id);setResults([]);}} style={{
            display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8,
            border:`1px solid ${activeStrategy===s.id ? s.color+"60" : theme.borderLight}`,
            background: activeStrategy===s.id ? s.color+"15" : "transparent",
            color: activeStrategy===s.id ? s.color : theme.textFaint,
            cursor:"pointer", fontSize:12, fontWeight: activeStrategy===s.id ? 600 : 500, transition:"all 0.15s"
          }}>
            <s.icon size={14}/> {s.short}
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
          <button onClick={()=>setShowSettings(!showSettings)} style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${theme.borderLight}`, background:"transparent", color:theme.textFaint, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", gap:5 }}>
            <Settings size={13}/> API
          </button>
        </div>
      </div>

      {/* Strategy Description */}
      {strategy && (
        <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:12, padding:"14px 18px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:theme.text, marginBottom:3 }}>{strategy.label}</div>
            <div style={{ fontSize:12, color:theme.textFaint }}>{strategy.desc}</div>
          </div>
          <button onClick={runScan} disabled={scanning} style={{
            display:"flex", alignItems:"center", gap:8, padding:"10px 24px", borderRadius:10, border:"none",
            background: scanning ? "rgba(99,102,241,0.2)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
            color:"#fff", cursor: scanning ? "wait" : "pointer", fontSize:13, fontWeight:600,
            boxShadow: scanning ? "none" : "0 4px 14px rgba(99,102,241,0.3)"
          }}>
            {scanning ? <><RefreshCw size={14} style={{ animation:"spin 1s linear infinite" }}/> Scanning {scanProgress.current}/{scanProgress.total} — {scanProgress.ticker}</> : <><Zap size={14}/> Scan {tickers.length} Tickers</>}
          </button>
        </div>
      )}

      {/* Ticker Universe Toggle */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <div style={{ display:"flex", gap:4 }}>
          <button onClick={()=>setUseCustomList(false)} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${!useCustomList ? "#6366f1" : theme.borderLight}`, background:!useCustomList?"rgba(99,102,241,0.12)":"transparent", color:!useCustomList?"#a5b4fc":theme.textFaint, cursor:"pointer", fontSize:11, fontWeight:!useCustomList?600:400 }}>Pulse Core ({PULSE_CORE.length})</button>
          <button onClick={()=>setUseCustomList(true)} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${useCustomList ? "#6366f1" : theme.borderLight}`, background:useCustomList?"rgba(99,102,241,0.12)":"transparent", color:useCustomList?"#a5b4fc":theme.textFaint, cursor:"pointer", fontSize:11, fontWeight:useCustomList?600:400 }}>Custom ({customTickers.length})</button>
        </div>
        {useCustomList && (
          <div style={{ display:"flex", gap:4, flex:1 }}>
            <input value={tickerInput} onChange={e=>setTickerInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter"&&tickerInput.trim()){setCustomTickers(p=>[...new Set([...p,tickerInput.trim()])]);setTickerInput("");}}} placeholder="Add ticker..." style={{ padding:"5px 10px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:6, color:theme.text, fontSize:11, outline:"none", width:100 }}/>
            {customTickers.length > 0 && <div style={{ display:"flex", gap:3, flexWrap:"wrap", flex:1 }}>
              {customTickers.map(t => (
                <span key={t} style={{ display:"inline-flex", alignItems:"center", gap:3, padding:"3px 8px", background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:4, fontSize:10, color:"#a5b4fc" }}>
                  {t} <X size={8} style={{ cursor:"pointer", opacity:0.6 }} onClick={()=>setCustomTickers(p=>p.filter(x=>x!==t))}/>
                </span>
              ))}
            </div>}
          </div>
        )}
      </div>

      {/* API Settings Panel */}
      {showSettings && (
        <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:12, padding:"20px", marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, color:theme.text, marginBottom:12 }}>API Configuration</div>
          <div style={{ fontSize:11, color:theme.textFaint, marginBottom:16, lineHeight:1.6 }}>
            Configure your own API keys for options data. Schwab provides real Greeks and live quotes. Polygon is a free fallback with limited data.
          </div>
          
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            <button onClick={()=>saveConfig({dataSource:"schwab"})} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${apiConfig.dataSource==="schwab"?"#4ade80":theme.borderLight}`, background:apiConfig.dataSource==="schwab"?"rgba(74,222,128,0.1)":"transparent", color:apiConfig.dataSource==="schwab"?"#4ade80":theme.textFaint, cursor:"pointer", fontSize:11, fontWeight:600 }}>Schwab API</button>
            <button onClick={()=>saveConfig({dataSource:"polygon"})} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${apiConfig.dataSource==="polygon"?"#4ade80":theme.borderLight}`, background:apiConfig.dataSource==="polygon"?"rgba(74,222,128,0.1)":"transparent", color:apiConfig.dataSource==="polygon"?"#4ade80":theme.textFaint, cursor:"pointer", fontSize:11, fontWeight:600 }}>Polygon (Free)</button>
          </div>

          {apiConfig.dataSource === "schwab" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
              <div>
                <label style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:4 }}>Client ID</label>
                <input value={apiConfig.schwabClientId} onChange={e=>setApiConfig(p=>({...p,schwabClientId:e.target.value}))} style={{ width:"100%", padding:"8px 10px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:6, color:theme.text, fontSize:11, outline:"none", boxSizing:"border-box" }} placeholder="Your Schwab App Key"/>
              </div>
              <div>
                <label style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:4 }}>App Secret</label>
                <input type="password" value={apiConfig.schwabSecret} onChange={e=>setApiConfig(p=>({...p,schwabSecret:e.target.value}))} style={{ width:"100%", padding:"8px 10px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:6, color:theme.text, fontSize:11, outline:"none", boxSizing:"border-box" }} placeholder="Your App Secret"/>
              </div>
              <div>
                <label style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:4 }}>Refresh Token</label>
                <input type="password" value={apiConfig.schwabRefreshToken} onChange={e=>setApiConfig(p=>({...p,schwabRefreshToken:e.target.value}))} style={{ width:"100%", padding:"8px 10px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:6, color:theme.text, fontSize:11, outline:"none", boxSizing:"border-box" }} placeholder="Refresh token"/>
              </div>
            </div>
          )}

          {apiConfig.dataSource === "polygon" && (
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:4 }}>Polygon API Key</label>
              <input value={apiConfig.polygonKey} onChange={e=>setApiConfig(p=>({...p,polygonKey:e.target.value}))} style={{ width:300, padding:"8px 10px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:6, color:theme.text, fontSize:11, outline:"none", boxSizing:"border-box" }} placeholder="Your Polygon.io API key (free tier)"/>
            </div>
          )}

          <button onClick={()=>{saveConfig(apiConfig);setShowSettings(false);}} style={{ padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#059669,#34d399)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}>Save Configuration</button>
        </div>
      )}

      {/* Custom Filter (for custom scan) */}
      {activeStrategy === "custom" && (
        <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:12, padding:"16px 20px", marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:theme.text, marginBottom:10 }}>Custom Filter</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:10 }}>
            <div><label style={{ fontSize:8, color:theme.textFaintest, textTransform:"uppercase", display:"block", marginBottom:3 }}>Type</label>
              <select value={customFilter.optionType} onChange={e=>setCustomFilter(p=>({...p,optionType:e.target.value}))} style={{ width:"100%", padding:"6px 8px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:4, color:theme.text, fontSize:11, outline:"none" }}><option value="PUT">Puts</option><option value="CALL">Calls</option></select></div>
            <div><label style={{ fontSize:8, color:theme.textFaintest, textTransform:"uppercase", display:"block", marginBottom:3 }}>Min DTE</label>
              <input type="number" value={customFilter.minDTE} onChange={e=>setCustomFilter(p=>({...p,minDTE:parseInt(e.target.value)||0}))} style={{ width:"100%", padding:"6px 8px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:4, color:theme.text, fontSize:11, outline:"none", boxSizing:"border-box" }}/></div>
            <div><label style={{ fontSize:8, color:theme.textFaintest, textTransform:"uppercase", display:"block", marginBottom:3 }}>Max DTE</label>
              <input type="number" value={customFilter.maxDTE} onChange={e=>setCustomFilter(p=>({...p,maxDTE:parseInt(e.target.value)||0}))} style={{ width:"100%", padding:"6px 8px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:4, color:theme.text, fontSize:11, outline:"none", boxSizing:"border-box" }}/></div>
            <div><label style={{ fontSize:8, color:theme.textFaintest, textTransform:"uppercase", display:"block", marginBottom:3 }}>Min |Delta|</label>
              <input type="number" step="0.01" value={customFilter.minDelta} onChange={e=>setCustomFilter(p=>({...p,minDelta:parseFloat(e.target.value)||0}))} style={{ width:"100%", padding:"6px 8px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:4, color:theme.text, fontSize:11, outline:"none", boxSizing:"border-box" }}/></div>
            <div><label style={{ fontSize:8, color:theme.textFaintest, textTransform:"uppercase", display:"block", marginBottom:3 }}>Max |Delta|</label>
              <input type="number" step="0.01" value={customFilter.maxDelta} onChange={e=>setCustomFilter(p=>({...p,maxDelta:parseFloat(e.target.value)||0}))} style={{ width:"100%", padding:"6px 8px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:4, color:theme.text, fontSize:11, outline:"none", boxSizing:"border-box" }}/></div>
            <div><label style={{ fontSize:8, color:theme.textFaintest, textTransform:"uppercase", display:"block", marginBottom:3 }}>Min Bid</label>
              <input type="number" step="0.01" value={customFilter.minPremium} onChange={e=>setCustomFilter(p=>({...p,minPremium:parseFloat(e.target.value)||0}))} style={{ width:"100%", padding:"6px 8px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:4, color:theme.text, fontSize:11, outline:"none", boxSizing:"border-box" }}/></div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ padding:"14px 18px", borderBottom:`1px solid ${theme.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:700, color:theme.text }}>{results.length} Results — {strategy?.label}</span>
            <span style={{ fontSize:11, color:theme.textFaint }}>Click row to view details</span>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                <SortHeader field="ticker" label="Ticker"/>
                <SortHeader field="currentPrice" label="Price" align="right"/>
                <SortHeader field="strikePrice" label="Strike" align="right"/>
                <SortHeader field="daysToExpiration" label="DTE" align="right"/>
                <SortHeader field="delta" label="Delta" align="right"/>
                <SortHeader field="bid" label="Bid" align="right"/>
                <SortHeader field="iv" label="IV" align="right"/>
                <SortHeader field="ror" label="ROR%" align="right"/>
                <SortHeader field="annualizedRor" label="Ann%" align="right"/>
                <SortHeader field="maxProfit" label="Max Profit" align="right"/>
                <SortHeader field="maxRisk" label="Max Risk" align="right"/>
              </tr></thead>
              <tbody>
                {sortedResults.slice(0, 100).map((r, i) => {
                  const strike = r.strikePrice || r.sellLeg?.strikePrice || r.strike || "—";
                  const delta = r.delta || r.sellLeg?.delta || "—";
                  const bid = r.bid || r.sellLeg?.bid || r.credit/100 || "—";
                  const iv = r.iv || r.sellLeg?.iv || "—";
                  return (
                    <tr key={i} onClick={()=>setSelectedResult(r)} style={{ cursor:"pointer", background: i%2===0 ? "rgba(0,0,0,0.08)" : "transparent", transition:"background 0.1s" }}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(99,102,241,0.08)"}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"rgba(0,0,0,0.08)":"transparent"}>
                      <td style={{ padding:"8px 10px", fontWeight:700, color:theme.text, fontSize:12 }}>{r.ticker}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:theme.textMuted }}>${r.currentPrice?.toFixed(2)}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:theme.text }}>{typeof strike === "number" ? `$${strike.toFixed(2)}` : strike}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:theme.textMuted }}>{r.daysToExpiration || "—"}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#60a5fa" }}>{typeof delta === "number" ? delta.toFixed(2) : delta}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#4ade80" }}>{typeof bid === "number" ? `$${bid.toFixed(2)}` : bid}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#eab308" }}>{typeof iv === "number" ? `${(iv*100).toFixed(0)}%` : iv}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:600, color:"#4ade80" }}>{r.ror ? `${r.ror.toFixed(1)}%` : "—"}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#a78bfa" }}>{r.annualizedRor ? `${r.annualizedRor.toFixed(0)}%` : "—"}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#4ade80" }}>{r.maxProfit ? fmtD(r.maxProfit) : r.credit ? fmtD(r.credit) : "—"}</td>
                      <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#f87171" }}>{r.maxRisk ? fmtD(r.maxRisk) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!scanning && results.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 20px" }}>
          <Search size={48} color={theme.textFaintest} style={{ marginBottom:16, opacity:0.3 }}/>
          <div style={{ fontSize:15, color:theme.textFaint, marginBottom:6 }}>Select a strategy and click Scan</div>
          <div style={{ fontSize:12, color:theme.textFaintest }}>Configure your API key in Settings to get started</div>
        </div>
      )}

      {/* Result Detail Modal */}
      {selectedResult && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={()=>setSelectedResult(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:14, padding:"24px 28px", maxWidth:500, width:"100%" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color:theme.text }}>{selectedResult.ticker}</div>
                <div style={{ fontSize:12, color:theme.textFaint }}>{selectedResult.strategy} — ${selectedResult.currentPrice?.toFixed(2)}</div>
              </div>
              <button onClick={()=>setSelectedResult(null)} style={{ background:"none", border:"none", color:theme.textFaint, cursor:"pointer" }}><X size={18}/></button>
            </div>
            
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
              {[
                { l:"Strike", v: selectedResult.strikePrice ? `$${selectedResult.strikePrice.toFixed(2)}` : selectedResult.sellLeg ? `$${selectedResult.sellLeg.strikePrice}` : "—" },
                { l:"DTE", v: selectedResult.daysToExpiration || "—" },
                { l:"Delta", v: selectedResult.delta ? selectedResult.delta.toFixed(3) : "—" },
                { l:"Bid", v: selectedResult.bid ? `$${selectedResult.bid.toFixed(2)}` : "—" },
                { l:"ROR", v: selectedResult.ror ? `${selectedResult.ror.toFixed(1)}%` : "—", c:"#4ade80" },
                { l:"Max Profit", v: selectedResult.maxProfit ? fmtD(selectedResult.maxProfit) : selectedResult.credit ? fmtD(selectedResult.credit) : "—", c:"#4ade80" },
                { l:"Max Risk", v: selectedResult.maxRisk ? fmtD(selectedResult.maxRisk) : "—", c:"#f87171" },
                { l:"IV", v: selectedResult.iv ? `${(selectedResult.iv*100).toFixed(0)}%` : "—" },
                { l:"Volume", v: selectedResult.volume || "—" },
              ].map((s, i) => (
                <div key={i} style={{ background:"rgba(0,0,0,0.15)", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:8, color:theme.textFaintest, textTransform:"uppercase", letterSpacing:0.5, marginBottom:3 }}>{s.l}</div>
                  <div style={{ fontSize:15, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color: s.c || theme.text }}>{s.v}</div>
                </div>
              ))}
            </div>

            {selectedResult.longLeg && selectedResult.shortLeg && (
              <div style={{ background:"rgba(0,0,0,0.1)", borderRadius:8, padding:"12px 14px", marginBottom:16 }}>
                <div style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", marginBottom:6 }}>Legs</div>
                <div style={{ fontSize:11, color:theme.textMuted, marginBottom:3 }}>Long: {selectedResult.longLeg.strikePrice} {selectedResult.longLeg.putCall} @ ${selectedResult.longLeg.ask?.toFixed(2)} — {selectedResult.longLeg.daysToExpiration} DTE</div>
                <div style={{ fontSize:11, color:theme.textMuted }}>Short: {selectedResult.shortLeg.strikePrice} {selectedResult.shortLeg.putCall} @ ${selectedResult.shortLeg.bid?.toFixed(2)} — {selectedResult.shortLeg.daysToExpiration} DTE</div>
              </div>
            )}

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={()=>setSelectedResult(null)} style={{ padding:"8px 16px", borderRadius:6, border:`1px solid ${theme.borderLight}`, background:"transparent", color:theme.textFaint, cursor:"pointer", fontSize:12 }}>Close</button>
              <button style={{ padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}>Log as Trade →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
