import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, Cell } from "recharts";
import { TrendingUp, TrendingDown, Plus, X, BookOpen, List, Home, Filter, Award, Target, Activity, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, ChevronRight, Crosshair, Calculator, RefreshCw, Settings, Calendar, DollarSign, BarChart3, Percent, ChevronLeft, Layers, Zap, Camera, Image, CalendarDays, Clipboard, Shield, AlertTriangle, Lightbulb, SkipForward, SkipBack, Upload, Download, Check, FileText, Briefcase, Sun, Moon, Menu, Clock } from "lucide-react";

// ─── SUPABASE CLIENT ─────────────────────────────────────────────────────────
import { supabase } from "../../lib/supabase-client";

// ─── LOCAL STORAGE (fallback + migration source) ────────────────────────────
const STORAGE_KEY = "tj-trades";
const WATCHLIST_KEY = "tj-watchlists";
const WHEEL_KEY = "tj-wheel";
const FUTURES_SETTINGS_KEY = "tj-futures-settings";
const CUSTOM_FIELDS_KEY = "tj-custom-fields";
const ACCOUNT_BALANCES_KEY = "tj-account-balances";
const PLAYBOOK_KEY = "tj-playbooks";
const PREFS_KEY = "tj-prefs";
const JOURNAL_KEY = "tj-journal";
const GOALS_KEY = "tj-goals";
const DIVIDENDS_KEY = "tj-dividends";
const CASH_TRANSACTIONS_KEY = "tj-cash-transactions";

// Local storage helpers (used for migration + offline cache)
function localLoad(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }
function localSave(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) { console.error(e); } }

// Check if any local data exists (for migration prompt)
function hasLocalData() {
  return !!(localLoad(STORAGE_KEY)?.length || localLoad(JOURNAL_KEY)?.length || localLoad(WATCHLIST_KEY)?.length || localLoad(WHEEL_KEY)?.length || localLoad(PLAYBOOK_KEY)?.length || localLoad(DIVIDENDS_KEY)?.length);
}

function getLocalData() {
  return {
    trades: localLoad(STORAGE_KEY) || [],
    watchlists: localLoad(WATCHLIST_KEY) || [],
    wheel_trades: localLoad(WHEEL_KEY) || [],
    futures_settings: localLoad(FUTURES_SETTINGS_KEY) || [],
    custom_fields: localLoad(CUSTOM_FIELDS_KEY) || {},
    account_balances: localLoad(ACCOUNT_BALANCES_KEY) || {},
    playbooks: localLoad(PLAYBOOK_KEY) || [],
    journal: localLoad(JOURNAL_KEY) || [],
    goals: localLoad(GOALS_KEY) || {},
    dividends: localLoad(DIVIDENDS_KEY) || [],
    cashTransactions: localLoad(CASH_TRANSACTIONS_KEY) || [],
    prefs: localLoad(PREFS_KEY) || { theme: "dark", logo: "", banner: "", tabOrder: [], dashWidgets: [] }
  };
}

// ─── CLOUD SYNC FUNCTIONS ───────────────────────────────────────────────────
async function cloudLoad(userId) {
  const { data, error } = await supabase.from("user_data").select("*").eq("user_id", userId).single();
  if (error && error.code === "PGRST116") return null; // No row yet
  if (error) { console.error("Cloud load error:", error); return null; }
  return data;
}

async function cloudSave(userId, field, value) {
  const { error } = await supabase.from("user_data").upsert({ user_id: userId, [field]: value }, { onConflict: "user_id" });
  if (error) console.error(`Cloud save error (${field}):`, error);
}

async function cloudSaveAll(userId, allData) {
  const { error } = await supabase.from("user_data").upsert({ user_id: userId, ...allData }, { onConflict: "user_id" });
  if (error) console.error("Cloud save all error:", error);
}

// ─── AUTH SCREEN ────────────────────────────────────────────────────────────

// ─── MIGRATION PROMPT ───────────────────────────────────────────────────────
function MigrationPrompt({ onMigrate, onSkip }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"#1a1d28", borderRadius:18, width:"min(92vw, 460px)", padding:32, border:"1px solid rgba(255,255,255,0.08)", boxShadow:"0 24px 60px rgba(0,0,0,0.5)", textAlign:"center" }}>
        <Upload size={40} color="#a5b4fc" style={{ marginBottom:16 }}/>
        <h3 style={{ color:"#e2e8f0", fontSize:18, fontWeight:700, margin:"0 0 8px" }}>Existing Data Found</h3>
        <p style={{ color:"#9ca3af", fontSize:13, lineHeight:1.6, margin:"0 0 24px" }}>
          We found trade data saved on this device from before you created your account. Would you like to import it into your cloud account so it syncs across all your devices?
        </p>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <button onClick={onSkip} style={{ padding:"10px 24px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"#9ca3af", cursor:"pointer", fontSize:13, fontWeight:600 }}>Skip</button>
          <button onClick={onMigrate} style={{ padding:"10px 28px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}>Import to Cloud</button>
        </div>
      </div>
    </div>
  );
}

// ─── THEME SYSTEM ────────────────────────────────────────────────────────────

// Theme is passed as prop to components

// Default custom field options
const DEFAULT_CUSTOM_FIELDS = {
  emotions: ["Confident", "Uncertain", "FOMO", "Revenge Trading", "Calm", "Anxious", "Greedy", "Patient"],
  accounts: ["Main", "IRA", "Roth IRA", "401k", "Cash Account", "Margin", "Paper Trading"],
  timeframes: ["Scalp (< 1 day)", "Day Trade", "Swing (1-7 days)", "Position (weeks)", "Long-term (months+)"],
  strategies: ["Momentum", "Mean Reversion", "Breakout", "Pullback", "Trend Following", "Counter-Trend", "News/Events", "Earnings Play"]
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ASSET_TYPES = ["Stock", "Options", "Futures"];
const DIRECTIONS = ["Long", "Short"];
const STATUSES = ["Open", "Closed", "Partial"];
const STOCK_STRATEGIES = ["Scalp", "Swing", "Day Trade", "Position", "Other"];
const OPTIONS_STRATEGY_TYPES = ["Single Leg", "Vertical Spread", "PMCC / Diagonal", "Calendar Press", "Butterfly", "Condor", "Straddle / Strangle", "Iron Condor", "Iron Butterfly", "Custom"];
const GRADES = ["A+", "A", "B+", "B", "C", "D", "F"];
const SECTORS = ["Technology","Healthcare","Financials","Consumer Discretionary","Industrials","Communication Services","Consumer Staples","Energy","Materials","Real Estate","Utilities","Crypto","ETFs / Indices","Commodities","Other"];

// ─── WEEK HELPERS ─────────────────────────────────────────────────────────────
function getWeekStart(date = new Date()) { const d = new Date(date); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); d.setHours(0,0,0,0); return d.toISOString().split("T")[0]; }
function formatWeekLabel(ws) { const d = new Date(ws + "T12:00:00"); const e = new Date(d); e.setDate(e.getDate()+4); const o = {month:"short",day:"numeric"}; return `Week of ${d.toLocaleDateString("en-US",o)} – ${e.toLocaleDateString("en-US",o)}`; }

// ─── LEG HELPERS ──────────────────────────────────────────────────────────────
const emptyLeg = (action = "Buy", type = "Call") => ({ id: Date.now() + Math.random(), action, type, strike: "", expiration: "", contracts: "1", entryPremium: "", exitPremium: "", partialCloses: [], rolls: [] });
const emptyRoll = () => ({ id: Date.now() + Math.random(), date: new Date().toISOString().split("T")[0], sellPremium: "", buybackPremium: "", contracts: "" });

function defaultLegs(strategyType) {
  switch (strategyType) {
    case "Single Leg": return [emptyLeg("Buy","Call")];
    case "Vertical Spread": return [emptyLeg("Buy","Call"), emptyLeg("Sell","Call")];
    case "Diagonal": case "PMCC / Diagonal": return [emptyLeg("Buy","Call"), emptyLeg("Sell","Call")];
    case "Calendar": case "Calendar Press": return [emptyLeg("Buy","Call"), emptyLeg("Sell","Call")];
    case "Butterfly": return [emptyLeg("Buy","Call"), { ...emptyLeg("Sell","Call"), contracts: "2" }, emptyLeg("Buy","Call")];
    case "Condor": return [emptyLeg("Buy","Call"), emptyLeg("Sell","Call"), emptyLeg("Sell","Call"), emptyLeg("Buy","Call")];
    case "Straddle / Strangle": return [emptyLeg("Buy","Call"), emptyLeg("Buy","Put")];
    case "Iron Condor": return [emptyLeg("Sell","Put"), emptyLeg("Buy","Put"), emptyLeg("Sell","Call"), emptyLeg("Buy","Call")];
    case "Iron Butterfly": return [emptyLeg("Buy","Put"), emptyLeg("Sell","Put"), emptyLeg("Sell","Call"), emptyLeg("Buy","Call")];
    case "Custom": return [emptyLeg("Buy","Call"), emptyLeg("Sell","Put")];
    default: return [emptyLeg("Buy","Call")];
  }
}

// ─── P&L ENGINE ───────────────────────────────────────────────────────────────
function calcPnL(trade) {
  const fees = parseFloat(trade.fees) || 0;

  // Multi-leg options P&L
  if (trade.assetType === "Options" && trade.legs && trade.legs.length > 0) {
    const isCalDiag = ["Calendar","Calendar Press","Diagonal","PMCC / Diagonal"].includes(trade.optionsStrategyType);
    let total = 0; let hasData = false;
    for (const leg of trade.legs) {
      const entry = parseFloat(leg.entryPremium);
      const contracts = parseInt(leg.contracts) || 1;
      const partials = leg.partialCloses || [];
      const sign = leg.action === "Buy" ? 1 : -1;
      
      if (partials.length > 0 && !isNaN(entry)) {
        // Use partial closes for P&L
        hasData = true;
        partials.forEach(pc => {
          const pcQty = parseInt(pc.qty) || 1;
          const pcExit = parseFloat(pc.exitPremium);
          if (!isNaN(pcExit)) {
            total += sign * (pcExit - entry) * pcQty * 100;
          }
        });
      } else {
        // Fallback: single exitPremium (backward compatible)
        const exit = parseFloat(leg.exitPremium);
        if (!isNaN(entry) && !isNaN(exit)) {
          hasData = true;
          total += sign * (exit - entry) * contracts * 100;
        } else if (isCalDiag && !isNaN(entry)) {
          hasData = true;
          if (leg.action === "Buy") { total -= entry * contracts * 100; }
          else { total += entry * contracts * 100; }
        }
      }
      
      // Add roll credits for short legs
      if (leg.action === "Sell" && leg.rolls && leg.rolls.length > 0) {
        hasData = true;
        leg.rolls.forEach(roll => {
          const sell = parseFloat(roll.sellPremium) || 0;
          const buyback = parseFloat(roll.buybackPremium) || 0;
          // Rolls apply per-contract for remaining open contracts at time of roll
          const rollQty = parseInt(roll.contracts) || contracts;
          total += (sell - buyback) * rollQty * 100;
        });
      }
    }
    if (!hasData) return null;
    return parseFloat((total - fees).toFixed(2));
  }

  // Futures
  if (trade.assetType === "Futures") {
    const entry = parseFloat(trade.entryPrice);
    const totalQty = parseFloat(trade.quantity);
    const tickSize = parseFloat(trade.tickSize) || 0.25;
    const tickValue = parseFloat(trade.tickValue) || 1;
    if (isNaN(entry) || isNaN(totalQty) || totalQty <= 0) return null;
    const dir = trade.direction === "Long" ? 1 : -1;
    const scaleOuts = trade.futuresScaleOuts || [];
    
    if (scaleOuts.length > 0) {
      let total = 0; let closedQty = 0;
      scaleOuts.forEach(so => {
        const soQty = parseFloat(so.qty) || 0;
        const soExit = parseFloat(so.exitPrice);
        if (!isNaN(soExit) && soQty > 0) {
          const priceDiff = dir * (soExit - entry);
          total += (priceDiff / tickSize) * tickValue * soQty;
          closedQty += soQty;
        }
      });
      // Remaining contracts use main exit price if set
      const remaining = totalQty - closedQty;
      const mainExit = parseFloat(trade.exitPrice);
      if (remaining > 0 && !isNaN(mainExit)) {
        const priceDiff = dir * (mainExit - entry);
        total += (priceDiff / tickSize) * tickValue * remaining;
      } else if (remaining > 0) {
        // Still open contracts, only return P&L from closed scale-outs
        if (closedQty === 0) return null;
      }
      return parseFloat((total - fees).toFixed(2));
    }
    
    // No scale-outs: original single-exit logic
    const exit = parseFloat(trade.exitPrice);
    if (isNaN(entry) || isNaN(exit)) return null;
    const priceDiff = dir * (exit - entry);
    const numTicks = priceDiff / tickSize;
    const profit = numTicks * tickValue * totalQty;
    return parseFloat((profit - fees).toFixed(2));
  }

  // Stock
  if (!trade.entryPrice || !trade.exitPrice || !trade.quantity) return null;
  const entry = parseFloat(trade.entryPrice), exit = parseFloat(trade.exitPrice), qty = parseFloat(trade.quantity);
  if (isNaN(entry) || isNaN(exit) || isNaN(qty)) return null;
  return parseFloat(((trade.direction === "Long" ? (exit - entry) : (entry - exit)) * qty - fees).toFixed(2));
}

// ─── RISK/REWARD ENGINE ───────────────────────────────────────────────────────
function calcRiskReward(trade) {
  if (trade.assetType === "Options" && trade.legs && trade.legs.length > 0) {
    let netPremium = 0; let allEntry = true;
    for (const leg of trade.legs) {
      const p = parseFloat(leg.entryPremium);
      const c = parseInt(leg.contracts) || 1;
      if (isNaN(p)) { allEntry = false; continue; }
      netPremium += (leg.action === "Buy" ? p : -p) * c * 100;
    }
    const strikes = trade.legs.map(l => parseFloat(l.strike)).filter(s => !isNaN(s)).sort((a, b) => a - b);
    const minContracts = Math.min(...trade.legs.map(l => parseInt(l.contracts) || 1));
    let maxRisk = null, maxReward = null;
    const st = trade.optionsStrategyType;

    if (st === "Single Leg") {
      if (netPremium > 0) { maxRisk = netPremium; maxReward = null; }
      else { maxRisk = null; maxReward = -netPremium; }
    } else if (st === "Vertical Spread" && strikes.length >= 2) {
      const width = (strikes[1] - strikes[0]) * minContracts * 100;
      if (netPremium > 0) { maxRisk = netPremium; maxReward = width - netPremium; }
      else { maxRisk = width + netPremium; maxReward = -netPremium; }
    } else if ((st === "Iron Condor" || st === "Iron Butterfly") && strikes.length >= 4) {
      const lowerWidth = (strikes[1] - strikes[0]) * minContracts * 100;
      const upperWidth = (strikes[3] - strikes[2]) * minContracts * 100;
      const maxWidth = Math.max(lowerWidth, upperWidth);
      if (netPremium < 0) { maxReward = -netPremium; maxRisk = maxWidth + netPremium; }
      else { maxRisk = netPremium; maxReward = maxWidth - netPremium; }
    } else if (st === "Straddle / Strangle") {
      maxRisk = netPremium > 0 ? netPremium : null; maxReward = null;
    } else if (st === "Butterfly" && strikes.length >= 3) {
      const width = (strikes[1] - strikes[0]) * minContracts * 100;
      if (netPremium > 0) { maxRisk = netPremium; maxReward = width - netPremium; }
      else { maxRisk = width + netPremium; maxReward = -netPremium; }
    } else if (st === "Condor" && strikes.length >= 4) {
      const width = ((strikes[3] - strikes[0]) - (strikes[2] - strikes[1])) / 2 * minContracts * 100;
      if (netPremium > 0) { maxRisk = netPremium; maxReward = width - netPremium; }
      else { maxRisk = width + netPremium; maxReward = -netPremium; }
    } else if (allEntry) {
      if (netPremium > 0) maxRisk = netPremium; else maxReward = -netPremium;
    }
    const ratio = (maxRisk && maxReward && maxRisk > 0) ? maxReward / maxRisk : null;
    return { maxRisk, maxReward, ratio, netPremium };
  }

  // Stock / Futures: use stopLoss + takeProfit
  const entry = parseFloat(trade.entryPrice);
  const stop = parseFloat(trade.stopLoss);
  const tp = parseFloat(trade.takeProfit);
  const qty = parseFloat(trade.quantity) || 1;
  
  // For futures, calculate based on ticks
  if (trade.assetType === "Futures") {
    const tickSize = parseFloat(trade.tickSize) || 0.25;
    const tickValue = parseFloat(trade.tickValue) || 1;
    if (isNaN(entry)) return null;
    const riskTicks = !isNaN(stop) ? Math.abs((entry - stop) / tickSize) : null;
    const rewardTicks = !isNaN(tp) ? Math.abs((tp - entry) / tickSize) : null;
    const risk = riskTicks !== null ? riskTicks * tickValue * qty : null;
    const reward = rewardTicks !== null ? rewardTicks * tickValue * qty : null;
    const ratio = (risk && reward && risk > 0) ? reward / risk : null;
    return { maxRisk: risk, maxReward: reward, ratio };
  }
  
  // Stock calculation
  const mult = qty;
  if (isNaN(entry)) return null;
  const dir = trade.direction === "Long" ? 1 : -1;
  const risk = !isNaN(stop) ? Math.abs((entry - stop) * dir * mult) : null;
  const reward = !isNaN(tp) ? Math.abs((tp - entry) * dir * mult) : null;
  const ratio = (risk && reward && risk > 0) ? reward / risk : null;
  return { maxRisk: risk, maxReward: reward, ratio };
}

// ─── FORMATTING ───────────────────────────────────────────────────────────────
function fmt(n) { if (n === null || n === undefined || isNaN(n)) return "—"; const abs = Math.abs(n); const s = abs >= 1000 ? abs.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : abs.toFixed(2); return (n < 0 ? "-" : n > 0 ? "+" : "") + "$" + s; }
function fmtPct(n) { if (n === null || isNaN(n)) return "—"; return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"; }

const emptyTrade = (prefill = {}) => ({
  id: Date.now(), date: new Date().toISOString().split("T")[0], ticker: "", assetType: "Stock",
  direction: "Long", status: "Open", strategy: "Day Trade", entryPrice: "", exitPrice: "",
  quantity: "", fees: "0", pnl: null, notes: "", grade: "", entryTime: "", exitTime: "", exitDate: "",
  stopLoss: "", takeProfit: "",
  optionsStrategyType: "Single Leg", legs: [emptyLeg("Buy","Call")],
  futuresContract: "", tickSize: "", tickValue: "", futuresScaleOuts: [],
  // New customizable fields
  emotions: [], account: "", timeframe: "", tradeStrategy: "",
  screenshots: [], playbook: "",
  ...prefill
});

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 22px", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:-18, right:-12, opacity:0.06 }}><Icon size={80}/></div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
        <div style={{ width:34, height:34, borderRadius:9, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center" }}><Icon size={17} color={color}/></div>
        <span style={{ fontSize:12, color:"var(--tp-muted)", textTransform:"uppercase", letterSpacing:1 }}>{label}</span>
      </div>
      <div style={{ fontSize:26, fontWeight:700, color:color||"#fff", fontFamily:"'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:"var(--tp-faint)", marginTop:4 }}>{sub}</div>}
    </div>
  );
}
function Input({ label, value, onChange, type="text", placeholder, style:s, options }) {
  const base = { width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5, ...s }}>
      <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8 }}>{label}</label>
      {options ? (
        <select value={value} onChange={e=>onChange(e.target.value)} style={{ ...base, appearance:"none", cursor:"pointer", background:"var(--tp-input)" }}>
          {options.map(o=><option key={o} value={o} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>{o}</option>)}
        </select>
      ) : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={base}/>}
    </div>
  );
}

// ─── RISK/REWARD PANEL ────────────────────────────────────────────────────────
function RiskRewardPanel({ trade }) {
  const rr = useMemo(() => calcRiskReward(trade), [trade]);
  if (!rr) return null;
  const { maxRisk, maxReward, ratio, netPremium } = rr;
  if (maxRisk === null && maxReward === null) return null;

  const isCredit = netPremium !== undefined && netPremium < 0;

  return (
    <div style={{ background:"rgba(30,32,38,0.9)", border:"1px solid var(--tp-border-l)", borderRadius:12, padding:"16px 18px", marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
        <Calculator size={15} color="#a5b4fc"/>
        <span style={{ fontSize:12, color:"#a5b4fc", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8 }}>Risk / Reward</span>
        {ratio && <span style={{ marginLeft:"auto", fontSize:13, fontWeight:700, color: ratio >= 2 ? "#4ade80" : ratio >= 1 ? "#eab308" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{ratio.toFixed(2)}:1</span>}
      </div>
      <div style={{ display:"grid", gridTemplateColumns: netPremium !== undefined ? "1fr 1fr 1fr" : "1fr 1fr", gap:10 }}>
        <div style={{ background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.18)", borderRadius:8, padding:"10px 12px" }}>
          <div style={{ fontSize:9.5, color:"#f87171", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4, fontWeight:600 }}>Max Risk</div>
          <div style={{ fontSize:16, fontWeight:700, color:"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{maxRisk !== null ? fmt(maxRisk) : "Unlimited"}</div>
        </div>
        <div style={{ background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.18)", borderRadius:8, padding:"10px 12px" }}>
          <div style={{ fontSize:9.5, color:"#4ade80", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4, fontWeight:600 }}>Max Reward</div>
          <div style={{ fontSize:16, fontWeight:700, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>{maxReward !== null ? fmt(maxReward) : "Unlimited"}</div>
        </div>
        {netPremium !== undefined && (
          <div style={{ background: isCredit ? "rgba(96,165,250,0.08)" : "rgba(234,179,8,0.08)", border:`1px solid ${isCredit ? "rgba(96,165,250,0.18)" : "rgba(234,179,8,0.18)"}`, borderRadius:8, padding:"10px 12px" }}>
            <div style={{ fontSize:9.5, color: isCredit ? "#60a5fa" : "#eab308", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4, fontWeight:600 }}>{isCredit ? "Net Credit" : "Net Debit"}</div>
            <div style={{ fontSize:16, fontWeight:700, color: isCredit ? "#60a5fa" : "#eab308", fontFamily:"'JetBrains Mono', monospace" }}>${Math.abs(netPremium).toFixed(2)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── OPTIONS LEG ROW ──────────────────────────────────────────────────────────
function LegRow({ leg, index, onChange, onRemove, showRemove, locked, showRolls }) {
  const [showRollHistory, setShowRollHistory] = useState(false);
  const [showPartialCloses, setShowPartialCloses] = useState(false);
  const [newClose, setNewClose] = useState({ qty: "1", exitPremium: "", date: new Date().toISOString().split("T")[0] });
  const set = k => v => onChange(index, { ...leg, [k]: v });
  
  const addRoll = () => {
    const rolls = [...(leg.rolls || []), emptyRoll()];
    onChange(index, { ...leg, rolls });
  };
  
  const updateRoll = (rollIdx, updated) => {
    const rolls = [...(leg.rolls || [])];
    rolls[rollIdx] = updated;
    onChange(index, { ...leg, rolls });
  };
  
  const removeRoll = (rollIdx) => {
    const rolls = (leg.rolls || []).filter((_, i) => i !== rollIdx);
    onChange(index, { ...leg, rolls });
  };
  
  const totalRollCredits = (leg.rolls || []).reduce((sum, roll) => {
    const sell = parseFloat(roll.sellPremium) || 0;
    const buyback = parseFloat(roll.buybackPremium) || 0;
    const rqty = parseInt(roll.contracts) || parseInt(leg.contracts) || 1;
    return sum + (sell - buyback) * rqty * 100;
  }, 0);

  // Partial close helpers
  const partials = leg.partialCloses || [];
  const totalContracts = parseInt(leg.contracts) || 1;
  const closedQty = partials.reduce((s, pc) => s + (parseInt(pc.qty) || 0), 0);
  const remainingQty = totalContracts - closedQty;
  const hasPartials = partials.length > 0;
  const entryP = parseFloat(leg.entryPremium) || 0;
  const sign = leg.action === "Buy" ? 1 : -1;
  const partialPnl = partials.reduce((s, pc) => {
    const exit = parseFloat(pc.exitPremium) || 0;
    return s + sign * (exit - entryP) * (parseInt(pc.qty) || 1) * 100;
  }, 0);

  const addPartialClose = () => {
    const qty = parseInt(newClose.qty) || 1;
    const exit = parseFloat(newClose.exitPremium);
    if (isNaN(exit) || qty <= 0 || qty > remainingQty) return;
    const pc = { id: Date.now() + Math.random(), qty: String(qty), exitPremium: newClose.exitPremium, date: newClose.date };
    onChange(index, { ...leg, partialCloses: [...partials, pc] });
    setNewClose({ qty: String(Math.min(remainingQty - qty, remainingQty)), exitPremium: "", date: new Date().toISOString().split("T")[0] });
    // Also update the legacy exitPremium to weighted avg for backward compat
    const allCloses = [...partials, pc];
    const totalClosedQty = allCloses.reduce((s, p) => s + (parseInt(p.qty) || 0), 0);
    if (totalClosedQty === totalContracts) {
      const weightedExit = allCloses.reduce((s, p) => s + (parseFloat(p.exitPremium) || 0) * (parseInt(p.qty) || 1), 0) / totalClosedQty;
      onChange(index, { ...leg, partialCloses: [...partials, pc], exitPremium: String(weightedExit.toFixed(2)) });
    }
  };

  const removePartialClose = (pcId) => {
    onChange(index, { ...leg, partialCloses: partials.filter(pc => pc.id !== pcId), exitPremium: "" });
  };
  
  return (
    <div style={{ marginBottom:6 }}>
      <div className="tp-leg-row" style={{ display:"grid", gridTemplateColumns:"28px 0.7fr 0.55fr 0.7fr 0.6fr 0.7fr 0.7fr 28px", gap:6, alignItems:"end" }}>
        <div style={{ width:24, height:24, borderRadius:6, background:"rgba(99,102,241,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#a5b4fc", alignSelf:"center" }}>{index+1}</div>
        {/* Action */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Action</label>}
          <select value={leg.action} onChange={e=>set("action")(e.target.value)} disabled={locked} style={{ width:"100%", padding:"7px 8px", background: leg.action === "Buy" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", border:`1px solid ${leg.action === "Buy" ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`, borderRadius:6, color: leg.action === "Buy" ? "#4ade80" : "#f87171", fontSize:12, fontWeight:600, outline:"none", appearance:"none", cursor: locked ? "default" : "pointer" }}>
            <option value="Buy" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>Buy</option>
            <option value="Sell" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>Sell</option>
          </select>
        </div>
        {/* Call / Put */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>C/P</label>}
          <select value={leg.type} onChange={e=>set("type")(e.target.value)} disabled={locked} style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", appearance:"none", cursor: locked ? "default" : "pointer" }}>
            <option value="Call" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>Call</option>
            <option value="Put" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>Put</option>
          </select>
        </div>
        {/* Strike */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Strike</label>}
          <input type="number" value={leg.strike} onChange={e=>set("strike")(e.target.value)} placeholder="150" style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
        </div>
        {/* Qty */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Qty</label>}
          <input type="number" value={leg.contracts} onChange={e=>set("contracts")(e.target.value)} placeholder="1" style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
        </div>
        {/* Entry $ */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Entry $</label>}
          <input type="number" value={leg.entryPremium} onChange={e=>set("entryPremium")(e.target.value)} placeholder="0.00" style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
        </div>
        {/* Exit $ — partial close or single */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Exit $</label>}
          {!hasPartials ? (
            <input type="number" value={leg.exitPremium} onChange={e=>set("exitPremium")(e.target.value)} placeholder="0.00" style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
          ) : (
            <button onClick={()=>setShowPartialCloses(!showPartialCloses)} style={{ width:"100%", padding:"7px 8px", background: remainingQty === 0 ? "rgba(74,222,128,0.1)" : "rgba(234,179,8,0.1)", border:`1px solid ${remainingQty === 0 ? "rgba(74,222,128,0.25)" : "rgba(234,179,8,0.25)"}`, borderRadius:6, color: remainingQty === 0 ? "#4ade80" : "#eab308", fontSize:10, fontWeight:600, cursor:"pointer", textAlign:"center" }}>
              {remainingQty === 0 ? "Closed" : `${closedQty}/${totalContracts}`}
            </button>
          )}
        </div>
        {/* Remove btn */}
        <div style={{ alignSelf:"center" }}>
          {showRemove && <button onClick={()=>onRemove(index)} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer", padding:2 }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><X size={14}/></button>}
        </div>
      </div>

      {/* Partial Closes Panel */}
      {(hasPartials || showPartialCloses) && (
        <div style={{ marginTop:6, marginLeft:32, background:"rgba(99,102,241,0.05)", border:"1px solid rgba(99,102,241,0.15)", borderRadius:8, padding:"10px 12px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:11, color:"#a5b4fc", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8 }}>Partial Closes</span>
              <span style={{ fontSize:10, color:"var(--tp-faint)" }}>{closedQty}/{totalContracts} closed</span>
              {partialPnl !== 0 && <span style={{ fontSize:11, color: partialPnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace", fontWeight:600 }}>{partialPnl >= 0 ? "+" : ""}${partialPnl.toFixed(2)}</span>}
            </div>
          </div>

          {/* Existing closes */}
          {partials.map(pc => (
            <div key={pc.id} style={{ display:"grid", gridTemplateColumns:"50px 70px 70px 1fr 20px", gap:6, padding:"6px 8px", background:"var(--tp-card)", borderRadius:6, marginBottom:4, alignItems:"center", fontSize:11 }}>
              <span style={{ color:"var(--tp-faint)", fontFamily:"'JetBrains Mono', monospace" }}>{pc.date?.slice(5) || "—"}</span>
              <span style={{ color:"var(--tp-text2)", fontWeight:600 }}>{pc.qty} ct{parseInt(pc.qty)!==1?"s":""}</span>
              <span style={{ color:"#a5b4fc", fontFamily:"'JetBrains Mono', monospace" }}>@ ${parseFloat(pc.exitPremium).toFixed(2)}</span>
              <span style={{ color: (sign * (parseFloat(pc.exitPremium) - entryP)) >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace", fontWeight:600 }}>
                {((sign * (parseFloat(pc.exitPremium) - entryP)) >= 0 ? "+" : "")}${(sign * (parseFloat(pc.exitPremium) - entryP) * (parseInt(pc.qty)||1) * 100).toFixed(2)}
              </span>
              <button onClick={()=>removePartialClose(pc.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--tp-faint)", padding:0 }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><X size={10}/></button>
            </div>
          ))}

          {/* Add new partial close */}
          {remainingQty > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"60px 80px 80px auto", gap:6, marginTop:6, alignItems:"end" }}>
              <div>
                <label style={{ fontSize:8, color:"var(--tp-faintest)", display:"block", marginBottom:2 }}>QTY</label>
                <input type="number" value={newClose.qty} onChange={e=>setNewClose(p=>({...p,qty:e.target.value}))} min="1" max={remainingQty} placeholder="1" style={{ width:"100%", padding:"6px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:5, color:"var(--tp-text)", fontSize:11, outline:"none", boxSizing:"border-box", fontFamily:"'JetBrains Mono', monospace" }}/>
              </div>
              <div>
                <label style={{ fontSize:8, color:"var(--tp-faintest)", display:"block", marginBottom:2 }}>CLOSE $</label>
                <input type="number" value={newClose.exitPremium} onChange={e=>setNewClose(p=>({...p,exitPremium:e.target.value}))} placeholder="0.00" style={{ width:"100%", padding:"6px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:5, color:"var(--tp-text)", fontSize:11, outline:"none", boxSizing:"border-box", fontFamily:"'JetBrains Mono', monospace" }}/>
              </div>
              <div>
                <label style={{ fontSize:8, color:"var(--tp-faintest)", display:"block", marginBottom:2 }}>DATE</label>
                <input type="date" value={newClose.date} onChange={e=>setNewClose(p=>({...p,date:e.target.value}))} style={{ width:"100%", padding:"6px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:5, color:"var(--tp-text)", fontSize:11, outline:"none", boxSizing:"border-box" }}/>
              </div>
              <button onClick={addPartialClose} style={{ padding:"6px 12px", borderRadius:5, border:"none", background:"#6366f1", color:"#fff", cursor:"pointer", fontSize:10, fontWeight:600, whiteSpace:"nowrap", alignSelf:"end" }}>Close {newClose.qty || 1}</button>
            </div>
          )}
          {remainingQty === 0 && <div style={{ fontSize:10, color:"#4ade80", fontWeight:600, marginTop:4 }}>✓ All {totalContracts} contract{totalContracts!==1?"s":""} closed</div>}
        </div>
      )}

      {/* Scale out button - shows when >1 contracts and no partials yet */}
      {totalContracts > 1 && !hasPartials && !showPartialCloses && (
        <div style={{ marginTop:4, marginLeft:32 }}>
          <button onClick={()=>setShowPartialCloses(true)} style={{ fontSize:9, color:"#a5b4fc", background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:4, padding:"3px 8px", cursor:"pointer", fontWeight:500 }}>
            ↳ Scale out ({totalContracts} contracts)
          </button>
        </div>
      )}
      
      {/* Roll tracking for short legs in diagonal/calendar spreads */}
      {showRolls && leg.action === "Sell" && (
        <div style={{ marginTop:6, marginLeft:32, background:"rgba(234,179,8,0.05)", border:"1px solid rgba(234,179,8,0.12)", borderRadius:8, padding:"10px 12px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <button onClick={()=>setShowRollHistory(!showRollHistory)} style={{ background:"none", border:"none", color:"#eab308", cursor:"pointer", padding:0, display:"flex", alignItems:"center" }}>
                {showRollHistory ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
              </button>
              <span style={{ fontSize:11, color:"#eab308", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8 }}>Roll History</span>
              {totalRollCredits > 0 && <span style={{ fontSize:11, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>+${totalRollCredits.toFixed(2)}</span>}
              <span style={{ fontSize:10, color:"var(--tp-faint)" }}>({(leg.rolls || []).length} roll{(leg.rolls || []).length !== 1 ? "s" : ""})</span>
            </div>
            <button onClick={addRoll} style={{ padding:"3px 8px", borderRadius:4, border:"1px solid rgba(234,179,8,0.3)", background:"rgba(234,179,8,0.1)", color:"#eab308", cursor:"pointer", fontSize:10, fontWeight:500 }}>+ Add Roll</button>
          </div>
          
          {showRollHistory && (leg.rolls || []).length > 0 && (
            <div style={{ display:"grid", gap:6 }}>
              <div style={{ display:"grid", gridTemplateColumns:"80px 50px 1fr 1fr 70px 24px", gap:8, padding:"0 10px", fontSize:8, color:"var(--tp-faintest)", textTransform:"uppercase", letterSpacing:0.5 }}>
                <span>Date</span><span style={{textAlign:"center"}}>Qty</span><span>Buyback $</span><span>Sell $</span><span style={{textAlign:"right"}}>Net</span><span/>
              </div>
              {(leg.rolls || []).map((roll, rollIdx) => (
                <RollRow key={roll.id} roll={roll} index={rollIdx} onChange={(updated) => updateRoll(rollIdx, updated)} onRemove={() => removeRoll(rollIdx)} legContracts={parseInt(leg.contracts)||1}/>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RollRow({ roll, index, onChange, onRemove, legContracts }) {
  const set = k => v => onChange({ ...roll, [k]: v });
  const qty = parseInt(roll.contracts) || parseInt(legContracts) || 1;
  const netCredit = (parseFloat(roll.sellPremium) || 0) - (parseFloat(roll.buybackPremium) || 0);
  const totalCredit = netCredit * qty * 100;
  
  return (
    <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:6, padding:"8px 10px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"80px 50px 1fr 1fr 70px 24px", gap:8, alignItems:"center" }}>
        <input type="date" value={roll.date} onChange={e=>set("date")(e.target.value)} style={{ padding:"5px 6px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:4, color:"var(--tp-text)", fontSize:11, outline:"none", boxSizing:"border-box" }}/>
        <div><input type="number" value={roll.contracts || ""} onChange={e=>set("contracts")(e.target.value)} placeholder={String(legContracts || 1)} min="1" style={{ width:"100%", padding:"5px 6px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:4, color:"var(--tp-text)", fontSize:11, outline:"none", boxSizing:"border-box", textAlign:"center" }}/></div>
        <div><input type="number" value={roll.buybackPremium} onChange={e=>set("buybackPremium")(e.target.value)} placeholder="Buyback $" style={{ width:"100%", padding:"5px 6px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:4, color:"var(--tp-text)", fontSize:11, outline:"none", boxSizing:"border-box" }}/></div>
        <div><input type="number" value={roll.sellPremium} onChange={e=>set("sellPremium")(e.target.value)} placeholder="Sell $" style={{ width:"100%", padding:"5px 6px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:4, color:"var(--tp-text)", fontSize:11, outline:"none", boxSizing:"border-box" }}/></div>
        <div style={{ fontSize:11, fontFamily:"'JetBrains Mono', monospace", color: totalCredit > 0 ? "#4ade80" : totalCredit < 0 ? "#f87171" : "var(--tp-faintest)", textAlign:"right" }}>
          {totalCredit !== 0 ? `${totalCredit > 0 ? "+" : ""}$${totalCredit.toFixed(0)}` : "—"}
        </div>
        <button onClick={onRemove} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer", padding:2 }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><X size={12}/></button>
      </div>
    </div>
  );
}

// ─── CALENDAR LEG ROW (with per-leg expiration) ──────────────────────────────
function CalendarLegRow({ leg, index, onChange, showRolls }) {
  const [showRollHistory, setShowRollHistory] = useState(false);
  const set = k => v => onChange(index, { ...leg, [k]: v });
  
  const addRoll = () => {
    const rolls = [...(leg.rolls || []), emptyRoll()];
    onChange(index, { ...leg, rolls });
  };
  
  const updateRoll = (rollIdx, updated) => {
    const rolls = [...(leg.rolls || [])];
    rolls[rollIdx] = updated;
    onChange(index, { ...leg, rolls });
  };
  
  const removeRoll = (rollIdx) => {
    const rolls = (leg.rolls || []).filter((_, i) => i !== rollIdx);
    onChange(index, { ...leg, rolls });
  };
  
  const totalRollCredits = (leg.rolls || []).reduce((sum, roll) => {
    const sell = parseFloat(roll.sellPremium) || 0;
    const buyback = parseFloat(roll.buybackPremium) || 0;
    const rqty = parseInt(roll.contracts) || parseInt(leg.contracts) || 1;
    return sum + (sell - buyback) * rqty * 100;
  }, 0);
  
  return (
    <div style={{ marginBottom:6 }}>
      <div style={{ display:"grid", gridTemplateColumns:"28px 0.7fr 0.55fr 0.7fr 0.9fr 0.5fr 0.7fr 0.7fr", gap:6, alignItems:"end" }}>
        <div style={{ width:24, height:24, borderRadius:6, background:"rgba(99,102,241,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#a5b4fc", alignSelf:"center" }}>{index+1}</div>
        {/* Action */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Action</label>}
          <select value={leg.action} onChange={e=>set("action")(e.target.value)} style={{ width:"100%", padding:"7px 8px", background: leg.action === "Buy" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", border:`1px solid ${leg.action === "Buy" ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`, borderRadius:6, color: leg.action === "Buy" ? "#4ade80" : "#f87171", fontSize:12, fontWeight:600, outline:"none", appearance:"none", cursor:"pointer" }}>
            <option value="Buy" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>Buy</option>
            <option value="Sell" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>Sell</option>
          </select>
        </div>
        {/* Call / Put */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>C/P</label>}
          <select value={leg.type} onChange={e=>set("type")(e.target.value)} style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", appearance:"none", cursor:"pointer" }}>
            <option value="Call" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>Call</option>
            <option value="Put" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>Put</option>
          </select>
        </div>
        {/* Strike */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Strike</label>}
          <input type="number" value={leg.strike} onChange={e=>set("strike")(e.target.value)} placeholder="150" style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
        </div>
        {/* Expiration (per leg) */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Expiration</label>}
          <input type="date" value={leg.expiration} onChange={e=>set("expiration")(e.target.value)} style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
        </div>
        {/* Qty */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Qty</label>}
          <input type="number" value={leg.contracts} onChange={e=>set("contracts")(e.target.value)} placeholder="1" style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
        </div>
        {/* Entry $ */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Entry $</label>}
          <input type="number" value={leg.entryPremium} onChange={e=>set("entryPremium")(e.target.value)} placeholder="0.00" style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
        </div>
        {/* Exit $ */}
        <div>
          {index === 0 && <label style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, display:"block", marginBottom:3 }}>Exit $</label>}
          <input type="number" value={leg.exitPremium} onChange={e=>set("exitPremium")(e.target.value)} placeholder="0.00" style={{ width:"100%", padding:"7px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
        </div>
      </div>
      
      {/* Roll tracking for short legs in diagonal spreads */}
      {showRolls && leg.action === "Sell" && (
        <div style={{ marginTop:6, marginLeft:32, background:"rgba(234,179,8,0.05)", border:"1px solid rgba(234,179,8,0.12)", borderRadius:8, padding:"10px 12px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <button onClick={()=>setShowRollHistory(!showRollHistory)} style={{ background:"none", border:"none", color:"#eab308", cursor:"pointer", padding:0, display:"flex", alignItems:"center" }}>
                {showRollHistory ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
              </button>
              <span style={{ fontSize:11, color:"#eab308", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8 }}>Roll History</span>
              {totalRollCredits > 0 && <span style={{ fontSize:11, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>+${totalRollCredits.toFixed(2)}</span>}
              <span style={{ fontSize:10, color:"var(--tp-faint)" }}>({(leg.rolls || []).length} roll{(leg.rolls || []).length !== 1 ? "s" : ""})</span>
            </div>
            <button onClick={addRoll} style={{ padding:"3px 8px", borderRadius:4, border:"1px solid rgba(234,179,8,0.3)", background:"rgba(234,179,8,0.1)", color:"#eab308", cursor:"pointer", fontSize:10, fontWeight:500 }}>+ Add Roll</button>
          </div>
          
          {showRollHistory && (leg.rolls || []).length > 0 && (
            <div style={{ display:"grid", gap:6 }}>
              <div style={{ display:"grid", gridTemplateColumns:"80px 50px 1fr 1fr 70px 24px", gap:8, padding:"0 10px", fontSize:8, color:"var(--tp-faintest)", textTransform:"uppercase", letterSpacing:0.5 }}>
                <span>Date</span><span style={{textAlign:"center"}}>Qty</span><span>Buyback $</span><span>Sell $</span><span style={{textAlign:"right"}}>Net</span><span/>
              </div>
              {(leg.rolls || []).map((roll, rollIdx) => (
                <RollRow key={roll.id} roll={roll} index={rollIdx} onChange={(updated) => updateRoll(rollIdx, updated)} onRemove={() => removeRoll(rollIdx)} legContracts={parseInt(leg.contracts)||1}/>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TRADE MODAL ──────────────────────────────────────────────────────────────
function TradeModal({ onSave, onClose, editTrade, futuresSettings, customFields, playbooks, accountBalances }) {
  // Migrate old trades: convert pointValue to tickValue if needed
  const migratedTrade = editTrade ? {
    ...editTrade,
    tickValue: editTrade.tickValue || editTrade.pointValue || ""
  } : emptyTrade();
  
  const [trade, setTrade] = useState(migratedTrade);
  const set = k => v => setTrade(p => ({ ...p, [k]: v }));

  const handleAssetTypeChange = (v) => {
    setTrade(p => ({ ...p, assetType: v, legs: v === "Options" ? defaultLegs("Single Leg") : [], optionsStrategyType: "Single Leg" }));
  };
  const handleOptionsStrategy = (v) => {
    setTrade(p => ({ ...p, optionsStrategyType: v, legs: defaultLegs(v) }));
  };
  const handleFuturesContractChange = (name) => {
    const preset = (futuresSettings || []).find(f => f.name === name);
    if (preset) {
      setTrade(p => ({ ...p, futuresContract: name, tickSize: preset.tickSize, tickValue: preset.tickValue }));
    } else {
      setTrade(p => ({ ...p, futuresContract: name }));
    }
  };

  const updateLeg = (idx, updated) => setTrade(p => { const legs = [...p.legs]; legs[idx] = updated; return { ...p, legs }; });
  const removeLeg = (idx) => setTrade(p => ({ ...p, legs: p.legs.filter((_,i) => i !== idx) }));
  const addLeg = () => setTrade(p => ({ ...p, legs: [...p.legs, emptyLeg("Buy","Call")] }));

  const handleSave = () => {
    if (!trade.ticker.trim()) return;
    const t = { ...trade, ticker: trade.ticker.toUpperCase() };
    if (t.status === "Closed") t.pnl = calcPnL(t);
    onSave(t);
  };

  const pnlPreview = trade.status === "Closed" ? calcPnL(trade) : null;
  const isPos = pnlPreview > 0;
  const isCalendar = trade.optionsStrategyType === "Calendar" || trade.optionsStrategyType === "Diagonal" || trade.optionsStrategyType === "PMCC / Diagonal" || trade.optionsStrategyType === "Calendar Press";
  const lockedLegs = trade.optionsStrategyType !== "Custom" && trade.optionsStrategyType !== "Single Leg" && trade.optionsStrategyType !== "Calendar" && trade.optionsStrategyType !== "Vertical Spread" && trade.optionsStrategyType !== "Diagonal" && trade.optionsStrategyType !== "PMCC / Diagonal" && trade.optionsStrategyType !== "Calendar Press";

  return (
    <div className="tp-modal-overlay" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, backdropFilter:"blur(3px)" }}>
      <div className="tp-modal" style={{ background:"var(--tp-sel-bg)", borderRadius:18, width:"min(96vw, 740px)", maxHeight:"92vh", overflowY:"auto", padding:28, border:"1px solid var(--tp-border-l)", boxShadow:"0 24px 60px rgba(0,0,0,0.4)" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <h3 style={{ color:"var(--tp-text)", fontSize:18, fontWeight:600, margin:0 }}>{editTrade ? "Edit Trade" : "New Trade"}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={20}/></button>
        </div>

        {/* Row 1 */}
        <div className="tp-modal-grid4" style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
          <Input label="Ticker" value={trade.ticker} onChange={v=>set("ticker")(v.toUpperCase())} placeholder="AAPL"/>
          <Input label="Asset Type" value={trade.assetType} onChange={handleAssetTypeChange} options={ASSET_TYPES}/>
          {trade.assetType !== "Options" && <Input label="Direction" value={trade.direction} onChange={set("direction")} options={DIRECTIONS}/>}
          {trade.assetType === "Options" && <Input label="Opt Strategy" value={trade.optionsStrategyType} onChange={handleOptionsStrategy} options={OPTIONS_STRATEGY_TYPES}/>}
          <Input label="Status" value={trade.status} onChange={set("status")} options={STATUSES}/>
        </div>

        {/* Row 2 - Dates & Times */}
        {(() => {
          const showExitDate = trade.strategy === "Swing" || trade.strategy === "Position";
          const cols = showExitDate ? "1fr 1fr 1fr 1fr 1fr" : "1fr 1fr 1fr 1fr";
          return (
            <div className="tp-modal-grid4" style={{ display:"grid", gridTemplateColumns:cols, gap:12, marginBottom:12 }}>
              <Input label={showExitDate ? "Entry Date" : "Date"} value={trade.date} onChange={set("date")} type="date"/>
              <Input label="Entry Time" value={trade.entryTime} onChange={set("entryTime")} type="time"/>
              {showExitDate && <Input label="Exit Date" value={trade.exitDate || ""} onChange={set("exitDate")} type="date"/>}
              <Input label="Exit Time" value={trade.exitTime} onChange={set("exitTime")} type="time"/>
              <Input label="Trade Style" value={trade.strategy} onChange={set("strategy")} options={STOCK_STRATEGIES}/>
            </div>
          );
        })()}

        {/* ── OPTIONS: Legs ── */}
        {trade.assetType === "Options" && (
          <div style={{ background:"rgba(99,102,241,0.06)", borderRadius:12, padding:"16px 18px", marginBottom:14, border:"1px solid rgba(99,102,241,0.2)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <span style={{ fontSize:11, color:"#6366f1", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8 }}>
                {trade.optionsStrategyType} — {trade.legs.length} Leg{trade.legs.length !== 1 ? "s" : ""}
              </span>
              {trade.optionsStrategyType === "Custom" && (
                <button onClick={addLeg} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:6, border:"1px solid rgba(99,102,241,0.3)", background:"rgba(99,102,241,0.1)", color:"#a5b4fc", cursor:"pointer", fontSize:11 }}><Plus size={11}/> Add Leg</button>
              )}
            </div>
            {isCalendar ? (
              trade.legs.map((leg, i) => (
                <CalendarLegRow key={leg.id || i} leg={leg} index={i} onChange={updateLeg} showRolls={trade.optionsStrategyType === "Diagonal" || trade.optionsStrategyType === "PMCC / Diagonal" || trade.optionsStrategyType === "Calendar Press" || trade.optionsStrategyType === "Calendar"}/>
              ))
            ) : (
              trade.legs.map((leg, i) => (
                <LegRow key={leg.id || i} leg={leg} index={i} onChange={updateLeg} onRemove={removeLeg} showRemove={trade.optionsStrategyType === "Custom" && trade.legs.length > 1} locked={lockedLegs} showRolls={trade.optionsStrategyType === "Calendar" || trade.optionsStrategyType === "Vertical Spread" || trade.optionsStrategyType === "Diagonal" || trade.optionsStrategyType === "PMCC / Diagonal" || trade.optionsStrategyType === "Calendar Press"}/>
              ))
            )}
            {/* Shared expiration + fees (hide shared expiration for Calendar) */}
            <div className="tp-modal-expiry-fees" style={{ marginTop:10, display:"grid", gridTemplateColumns: isCalendar ? "1fr" : "1fr 1fr", gap:12 }}>
              {!isCalendar && <Input label="Expiration (all legs)" value={trade.legs[0]?.expiration || ""} onChange={v => setTrade(p => ({ ...p, legs: p.legs.map(l => ({...l, expiration: v})) }))} type="date"/>}
              <Input label="Fees ($)" value={trade.fees} onChange={set("fees")} type="number" placeholder="0"/>
            </div>
          </div>
        )}

        {/* ── STOCK ── */}
        {trade.assetType === "Stock" && (
          <>
            <div className="tp-modal-grid4" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
              <Input label="Entry Price" value={trade.entryPrice} onChange={set("entryPrice")} type="number" placeholder="0.00"/>
              <Input label="Exit Price" value={trade.exitPrice} onChange={set("exitPrice")} type="number" placeholder="0.00"/>
              <Input label="Shares" value={trade.quantity} onChange={set("quantity")} type="number" placeholder="100"/>
              <Input label="Fees ($)" value={trade.fees} onChange={set("fees")} type="number" placeholder="0"/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <Input label="Stop Loss" value={trade.stopLoss} onChange={set("stopLoss")} type="number" placeholder="e.g. 145.00"/>
              <Input label="Take Profit" value={trade.takeProfit} onChange={set("takeProfit")} type="number" placeholder="e.g. 165.00"/>
            </div>
          </>
        )}

        {/* ── FUTURES ── */}
        {trade.assetType === "Futures" && (
          <>
            <div className="tp-modal-grid4" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
              <Input label="Entry Price" value={trade.entryPrice} onChange={set("entryPrice")} type="number" placeholder="0.00"/>
              <Input label="Exit Price" value={trade.exitPrice} onChange={set("exitPrice")} type="number" placeholder="0.00"/>
              <Input label="Contracts" value={trade.quantity} onChange={set("quantity")} type="number" placeholder="1"/>
              <Input label="Fees ($)" value={trade.fees} onChange={set("fees")} type="number" placeholder="0"/>
            </div>
            <div style={{ background:"rgba(234,179,8,0.07)", borderRadius:10, padding:"14px 16px", marginBottom:12, border:"1px solid rgba(234,179,8,0.18)" }}>
              <div style={{ fontSize:11, color:"#eab308", fontWeight:600, marginBottom:10, textTransform:"uppercase", letterSpacing:0.8 }}>Futures Details</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                <div>
                  <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:5, display:"block" }}>Contract</label>
                  <select value={trade.futuresContract} onChange={e=>handleFuturesContractChange(e.target.value)} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box" }}>
                    <option value="" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-faint)" }}>Select preset…</option>
                    {(futuresSettings || []).map(f=><option key={f.name} value={f.name} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>{f.name}</option>)}
                    <option value="__custom__" style={{ background:"var(--tp-sel-bg)", color:"#6366f1" }}>+ Custom</option>
                  </select>
                  {trade.futuresContract === "__custom__" && <input autoFocus placeholder="e.g. ES, NQ" onChange={e=>set("futuresContract")(e.target.value==="" ? "__custom__" : e.target.value)} style={{ width:"100%", padding:"9px 12px", marginTop:6, background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", boxSizing:"border-box" }}/>}
                </div>
                <Input label="Tick Size" value={trade.tickSize} onChange={set("tickSize")} type="number" placeholder="0.25"/>
                <Input label="Tick Value ($)" value={trade.tickValue} onChange={set("tickValue")} type="number" placeholder="12.50"/>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <Input label="Stop Loss" value={trade.stopLoss} onChange={set("stopLoss")} type="number" placeholder="e.g. 5800"/>
              <Input label="Take Profit" value={trade.takeProfit} onChange={set("takeProfit")} type="number" placeholder="e.g. 5850"/>
            </div>
            {/* Scale-Out Section */}
            {(parseInt(trade.quantity)||0) > 1 && (
              <div style={{ background:"rgba(99,102,241,0.07)", borderRadius:10, padding:"14px 16px", marginBottom:12, border:"1px solid rgba(99,102,241,0.18)" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:11, color:"#a5b4fc", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8 }}>Scale-Out Exits</span>
                    {(trade.futuresScaleOuts||[]).length > 0 && <span style={{ fontSize:10, color:"var(--tp-faint)" }}>({(trade.futuresScaleOuts||[]).reduce((s,so)=>s+(parseInt(so.qty)||0),0)} of {trade.quantity} contracts)</span>}
                  </div>
                  <button onClick={()=>setTrade(p=>({...p, futuresScaleOuts:[...(p.futuresScaleOuts||[]),{id:Date.now()+Math.random(), qty:"1", exitPrice:"", date:new Date().toISOString().split("T")[0]}]}))} style={{ padding:"3px 8px", borderRadius:4, border:"1px solid rgba(99,102,241,0.3)", background:"rgba(99,102,241,0.1)", color:"#a5b4fc", cursor:"pointer", fontSize:10, fontWeight:500 }}>+ Add Exit</button>
                </div>
                {(trade.futuresScaleOuts||[]).length > 0 && (
                  <div style={{ display:"grid", gap:6 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"70px 1fr 1fr 60px 24px", gap:8, padding:"0 4px", fontSize:8, color:"var(--tp-faintest)", textTransform:"uppercase", letterSpacing:0.5 }}>
                      <span>Date</span><span>Qty</span><span>Exit Price</span><span style={{textAlign:"right"}}>P&L</span><span/>
                    </div>
                    {(trade.futuresScaleOuts||[]).map((so, idx) => {
                      const soQty = parseFloat(so.qty)||0, soExit = parseFloat(so.exitPrice);
                      const entry = parseFloat(trade.entryPrice)||0, ts = parseFloat(trade.tickSize)||0.25, tv = parseFloat(trade.tickValue)||1;
                      const dir = trade.direction === "Long" ? 1 : -1;
                      const soPnL = (!isNaN(soExit) && soQty > 0 && entry > 0) ? (dir * (soExit - entry) / ts) * tv * soQty : null;
                      return (
                        <div key={so.id} style={{ display:"grid", gridTemplateColumns:"70px 1fr 1fr 60px 24px", gap:8, alignItems:"center", background:"rgba(0,0,0,0.2)", borderRadius:6, padding:"8px 8px" }}>
                          <input type="date" value={so.date||""} onChange={e=>setTrade(p=>({...p,futuresScaleOuts:p.futuresScaleOuts.map((s,i)=>i===idx?{...s,date:e.target.value}:s)}))} style={{ padding:"5px 4px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:4, color:"var(--tp-text)", fontSize:10, outline:"none", boxSizing:"border-box" }}/>
                          <input type="number" value={so.qty} onChange={e=>setTrade(p=>({...p,futuresScaleOuts:p.futuresScaleOuts.map((s,i)=>i===idx?{...s,qty:e.target.value}:s)}))} placeholder="1" min="1" style={{ padding:"5px 6px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:4, color:"var(--tp-text)", fontSize:11, outline:"none", boxSizing:"border-box", textAlign:"center" }}/>
                          <input type="number" value={so.exitPrice} onChange={e=>setTrade(p=>({...p,futuresScaleOuts:p.futuresScaleOuts.map((s,i)=>i===idx?{...s,exitPrice:e.target.value}:s)}))} placeholder="Exit $" step="any" style={{ padding:"5px 6px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:4, color:"var(--tp-text)", fontSize:11, outline:"none", boxSizing:"border-box" }}/>
                          <div style={{ fontSize:11, fontFamily:"'JetBrains Mono', monospace", color:soPnL>0?"#4ade80":soPnL<0?"#f87171":"var(--tp-faintest)", textAlign:"right" }}>{soPnL!==null?`${soPnL>=0?"+":""}$${soPnL.toFixed(0)}`:"—"}</div>
                          <button onClick={()=>setTrade(p=>({...p,futuresScaleOuts:p.futuresScaleOuts.filter((_,i)=>i!==idx)}))} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer", padding:2 }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="var(--tp-faint)"}><X size={12}/></button>
                        </div>
                      );
                    })}
                    {(() => {
                      const closedQty = (trade.futuresScaleOuts||[]).reduce((s,so)=>s+(parseInt(so.qty)||0),0);
                      const remaining = (parseInt(trade.quantity)||0) - closedQty;
                      return remaining > 0 ? <div style={{ fontSize:10, color:"var(--tp-faintest)", padding:"4px 8px" }}>{remaining} contract{remaining!==1?"s":""} remaining — {trade.exitPrice ? `exit at ${trade.exitPrice}` : "use Exit Price field above or add another scale-out"}</div> : remaining < 0 ? <div style={{ fontSize:10, color:"#f87171", padding:"4px 8px" }}>Scale-out qty exceeds total contracts</div> : null;
                    })()}
                  </div>
                )}
                {(trade.futuresScaleOuts||[]).length === 0 && <div style={{ fontSize:10, color:"var(--tp-faintest)" }}>Add exits to log partial closes at different prices. Remaining contracts use the main Exit Price.</div>}
              </div>
            )}
          </>
        )}

        {/* ── RISK/REWARD ── */}
        <RiskRewardPanel trade={trade}/>

        {/* ── P&L PREVIEW ── */}
        {pnlPreview !== null && (
          <div style={{ background: isPos ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", border:`1px solid ${isPos ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`, borderRadius:10, padding:"12px 16px", marginBottom:14, display:"flex", alignItems:"center", gap:10 }}>
            {isPos ? <TrendingUp size={18} color="#4ade80"/> : <TrendingDown size={18} color="#f87171"/>}
            <span style={{ color: isPos ? "#4ade80" : "#f87171", fontWeight:600, fontSize:15, fontFamily:"'JetBrains Mono', monospace" }}>P&L: {fmt(pnlPreview)}</span>
          </div>
        )}

        {/* Live Risk Score */}
        {(() => {
          const entry = parseFloat(trade.entryPrice) || 0;
          const stop = parseFloat(trade.stopLoss) || 0;
          const qty = parseFloat(trade.quantity) || 0;
          const acctBal = trade.account && accountBalances?.[trade.account]
            ? parseFloat(accountBalances[trade.account])
            : Object.values(accountBalances || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);

          if (!entry || !qty || acctBal <= 0) return null;
          const dollarRisk = stop > 0 ? Math.abs(entry - stop) * qty : entry * qty * 0.02;
          const riskPct = (dollarRisk / acctBal) * 100;
          let label, color;
          if (riskPct <= 1) { label = "Conservative"; color = "#4ade80"; }
          else if (riskPct <= 2) { label = "Moderate"; color = "#60a5fa"; }
          else if (riskPct <= 5) { label = "Elevated"; color = "#eab308"; }
          else { label = "Oversized"; color = "#f87171"; }

          return (
            <div style={{ background:`${color}08`, border:`1px solid ${color}25`, borderRadius:10, padding:"10px 16px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Shield size={14} color={color}/>
                <span style={{ fontSize:12, color:"var(--tp-text2)" }}>Position Risk:</span>
                <span style={{ fontSize:13, fontWeight:700, color, fontFamily:"'JetBrains Mono', monospace" }}>{riskPct.toFixed(1)}%</span>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background:`${color}15`, color, fontWeight:600 }}>{label}</span>
              </div>
              <span style={{ fontSize:10, color:"var(--tp-faint)" }}>${dollarRisk.toFixed(2)} risk{stop > 0 ? "" : " (est.)"}</span>
            </div>
          );
        })()}

        {/* ── CUSTOM FIELDS ── */}
        <div style={{ background:"rgba(99,102,241,0.04)", borderRadius:12, padding:"14px 16px", marginBottom:14, border:"1px solid rgba(99,102,241,0.12)" }}>
          <div style={{ fontSize:11, color:"#6366f1", fontWeight:600, marginBottom:12, textTransform:"uppercase", letterSpacing:0.8 }}>Trade Details</div>
          
          {/* Emotions */}
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Emotions</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {(customFields.emotions || []).map(emotion => {
                const isSelected = (trade.emotions || []).includes(emotion);
                return (
                  <button
                    key={emotion}
                    onClick={() => {
                      setTrade(p => ({
                        ...p,
                        emotions: isSelected 
                          ? (p.emotions || []).filter(e => e !== emotion)
                          : [...(p.emotions || []), emotion]
                      }));
                    }}
                    style={{
                      padding:"5px 12px",
                      borderRadius:6,
                      border:`1px solid ${isSelected?"#f472b6":"var(--tp-border-l)"}`,
                      background:isSelected?"rgba(244,114,182,0.15)":"var(--tp-input)",
                      color:isSelected?"#f472b6":"#8a8f9e",
                      cursor:"pointer",
                      fontSize:12,
                      fontWeight:isSelected?600:400
                    }}
                  >
                    {emotion}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Account, Timeframe, Strategy, Playbook */}
          <div className="tp-modal-grid4" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12 }}>
            <div>
              <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 }}>Account</label>
              <select value={trade.account || ""} onChange={e=>set("account")(e.target.value)} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box" }}>
                <option value="" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-faint)" }}>Select account...</option>
                {(customFields.accounts || []).map(acc => <option key={acc} value={acc} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>{acc}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 }}>Time Frame</label>
              <select value={trade.timeframe || ""} onChange={e=>set("timeframe")(e.target.value)} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box" }}>
                <option value="" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-faint)" }}>Select timeframe...</option>
                {(customFields.timeframes || []).map(tf => <option key={tf} value={tf} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>{tf}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 }}>Strategy</label>
              <select value={trade.tradeStrategy || ""} onChange={e=>set("tradeStrategy")(e.target.value)} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box" }}>
                <option value="" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-faint)" }}>Select strategy...</option>
                {(customFields.strategies || []).map(strat => <option key={strat} value={strat} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>{strat}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 }}>Playbook</label>
              <select value={trade.playbook || ""} onChange={e=>set("playbook")(e.target.value)} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box" }}>
                <option value="" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-faint)" }}>Select setup...</option>
                {(playbooks || []).length > 0 && <optgroup label="My Setups" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-faint)", fontWeight:700 }}>
                  {(playbooks || []).map(pb => <option key={pb.id} value={pb.name} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)", fontWeight:400 }}>{pb.name}</option>)}
                </optgroup>}
                {(() => {
                  const myNames = new Set((playbooks || []).map(p => p.name));
                  const cats = {};
                  STRATEGY_LIBRARY.forEach(s => { if (!myNames.has(s.name)) { if (!cats[s.category]) cats[s.category] = []; cats[s.category].push(s); } });
                  return Object.entries(cats).map(([cat, items]) => (
                    <optgroup key={cat} label={`📚 ${cat}`} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-faint)", fontWeight:700 }}>
                      {items.map(s => <option key={s.id} value={s.name} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)", fontWeight:400 }}>{s.name}</option>)}
                    </optgroup>
                  ));
                })()}
              </select>
            </div>
          </div>
        </div>

        {/* ── GRADE + NOTES ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 3fr", gap:12, marginBottom:14 }}>
          <Input label="Grade" value={trade.grade} onChange={set("grade")} options={["", ...GRADES]}/>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8 }}>Notes / Lessons</label>
            <textarea value={trade.notes} onChange={e=>set("notes")(e.target.value)} placeholder="What happened? What did you learn?" rows={3} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box" }}/>
          </div>
        </div>

        {/* ── SCREENSHOTS ── */}
        <div style={{ background:"rgba(99,102,241,0.04)", borderRadius:12, padding:"14px 16px", marginBottom:20, border:"1px solid rgba(99,102,241,0.12)" }}>
          <ScreenshotManager screenshots={trade.screenshots || []} onChange={v=>set("screenshots")(v)}/>
        </div>

        {/* ── ACTIONS ── */}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
          <button onClick={onClose} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Cancel</button>
          <button onClick={handleSave} style={{ padding:"9px 24px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}>
            {editTrade ? "Update Trade" : "Log Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DATE RANGE HELPERS ──────────────────────────────────────────────────────
function getDateRangeBounds(preset) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const dow = now.getDay();
  
  switch(preset) {
    case "today": return { from: today, to: today };
    case "this_week": {
      const mondayOffset = dow === 0 ? 6 : dow - 1;
      const monday = new Date(year, month, day - mondayOffset);
      return { from: monday.toISOString().split("T")[0], to: today };
    }
    case "this_month": return { from: `${year}-${String(month+1).padStart(2,"0")}-01`, to: today };
    case "last_30": {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return { from: d.toISOString().split("T")[0], to: today };
    }
    case "last_90": {
      const d = new Date(now); d.setDate(d.getDate() - 90);
      return { from: d.toISOString().split("T")[0], to: today };
    }
    case "ytd": return { from: `${year}-01-01`, to: today };
    case "all": return { from: "", to: "" };
    default: return { from: "", to: "" };
  }
}

// ─── SCREENSHOT LIGHTBOX ─────────────────────────────────────────────────────
function ScreenshotLightbox({ src, onClose }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, cursor:"zoom-out", backdropFilter:"blur(6px)" }}>
      <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"var(--tp-border-l)", border:"none", color:"var(--tp-text)", cursor:"pointer", width:36, height:36, borderRadius:18, display:"flex", alignItems:"center", justifyContent:"center" }}><X size={18}/></button>
      <img src={src} alt="Trade screenshot" onClick={e=>e.stopPropagation()} style={{ maxWidth:"92vw", maxHeight:"90vh", borderRadius:8, boxShadow:"0 20px 60px rgba(0,0,0,0.6)", cursor:"default" }}/>
    </div>
  );
}

// ─── SCREENSHOT MANAGER (for Trade Modal) ────────────────────────────────────
function ScreenshotManager({ screenshots, onChange }) {
  const [dragOver, setDragOver] = useState(false);
  const [viewingSrc, setViewingSrc] = useState(null);
  const fileInputRef = { current: null };

  const compressAndAdd = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        const entry = { id: Date.now() + Math.random(), data: dataUrl, name: file.name, addedAt: new Date().toISOString() };
        onChange([...(screenshots || []), entry]);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleFiles = (files) => { Array.from(files).forEach(compressAndAdd); };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        compressAndAdd(item.getAsFile());
        return;
      }
    }
  };

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); };
  const removeScreenshot = (id) => onChange((screenshots || []).filter(s => s.id !== id));

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <Camera size={14} color="#a5b4fc"/>
        <span style={{ fontSize:11, color:"#a5b4fc", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8 }}>Screenshots</span>
        <span style={{ fontSize:10, color:"var(--tp-faintest)" }}>{(screenshots||[]).length} image{(screenshots||[]).length!==1?"s":""}</span>
      </div>

      {/* Thumbnails */}
      {(screenshots || []).length > 0 && (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
          {(screenshots || []).map(s => (
            <div key={s.id} style={{ position:"relative", borderRadius:8, overflow:"hidden", border:"1px solid var(--tp-border-l)", cursor:"pointer", width:100, height:70 }} onClick={()=>setViewingSrc(s.data)}>
              <img src={s.data} alt={s.name||"screenshot"} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
              <button onClick={e=>{e.stopPropagation();removeScreenshot(s.id);}} style={{
                position:"absolute", top:3, right:3, width:18, height:18, borderRadius:9,
                background:"rgba(0,0,0,0.7)", border:"none", color:"#f87171", cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", padding:0
              }}><X size={10}/></button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        tabIndex={0}
        onClick={()=>fileInputRef.current?.click()}
        style={{
          border:`2px dashed ${dragOver ? "#6366f1" : "var(--tp-border-l)"}`,
          borderRadius:10, padding:"16px 20px", textAlign:"center", cursor:"pointer",
          background: dragOver ? "rgba(99,102,241,0.08)" : "var(--tp-card)",
          transition:"all 0.2s", outline:"none"
        }}
      >
        <input ref={el=>fileInputRef.current=el} type="file" accept="image/*" multiple onChange={e=>handleFiles(e.target.files)} style={{ display:"none" }}/>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <Image size={16} color={dragOver?"#6366f1":"#5c6070"}/>
          <span style={{ fontSize:12, color: dragOver ? "#a5b4fc" : "#5c6070" }}>
            Drop images, paste from clipboard, or click to upload
          </span>
        </div>
        <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:4 }}>Supports PNG, JPG, GIF · Images compressed to save space</div>
      </div>

      {viewingSrc && <ScreenshotLightbox src={viewingSrc} onClose={()=>setViewingSrc(null)}/>}
    </div>
  );
}

// ─── DASHBOARD FILTER PILL ────────────────────────────────────────────────────
function FilterPill({ label, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      padding:"5px 14px", borderRadius:20, border:`1px solid ${active ? (color||"#6366f1") : "var(--tp-border-l)"}`,
      background: active ? `${color||"#6366f1"}18` : "var(--tp-card)",
      color: active ? (color||"#a5b4fc") : "#6b7080", cursor:"pointer", fontSize:11.5, fontWeight: active?600:400,
      transition:"all 0.2s", whiteSpace:"nowrap", letterSpacing:0.2
    }}>{label}</button>
  );
}

// ─── DASHBOARD MINI STAT ─────────────────────────────────────────────────────
function MiniStat({ label, value, color, sub }) {
  return (
    <div style={{ textAlign:"center", padding:"10px 6px" }}>
      <div style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:700, color:color||"#fff", fontFamily:"'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:3 }}>{sub}</div>}
    </div>
  );
}

// ─── CALENDAR HEATMAP COMPONENT ──────────────────────────────────────────────
function CalendarHeatmap({ dailyMap, month, year, startingCapital }) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun
  const weeks = [];
  let currentWeek = new Array(startDow).fill(null);
  
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    currentWeek.push({ day: d, date: dateStr, pnl: dailyMap[dateStr] || 0, hasTrade: dailyMap[dateStr] !== undefined });
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
  }
  if (currentWeek.length > 0) { while (currentWeek.length < 7) currentWeek.push(null); weeks.push(currentWeek); }

  const monthPnL = Object.entries(dailyMap).filter(([d]) => d.startsWith(`${year}-${String(month+1).padStart(2,"0")}`)).reduce((s,[,v]) => s+v, 0);
  const monthPct = startingCapital > 0 ? (monthPnL / startingCapital) * 100 : 0;

  const maxAbs = Math.max(1, ...Object.values(dailyMap).map(Math.abs));
  const cellColor = (pnl, hasTrade) => {
    if (!hasTrade) return "var(--tp-card)";
    if (pnl === 0) return "var(--tp-input)";
    const intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
    if (pnl > 0) return `rgba(74,222,128,${0.12 + intensity * 0.45})`;
    return `rgba(248,113,113,${0.12 + intensity * 0.45})`;
  };

  const dayLabels = ["S","M","T","W","T","F","S"];
  const monthName = firstDay.toLocaleString("en-US", { month:"long" });

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:15, fontWeight:600, color:"var(--tp-text)" }}>{monthName} {year}</div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:13, fontWeight:700, color: monthPnL >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(monthPnL)}</span>
          <span style={{ fontSize:11, fontWeight:600, color: monthPct >= 0 ? "rgba(74,222,128,0.7)" : "rgba(248,113,113,0.7)", background: monthPct >= 0 ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)", padding:"2px 8px", borderRadius:10, fontFamily:"'JetBrains Mono', monospace" }}>{monthPct >= 0 ? "+" : ""}{monthPct.toFixed(1)}%</span>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:3 }}>
        {dayLabels.map((d,i) => <div key={i} style={{ textAlign:"center", fontSize:9, color:"var(--tp-faintest)", fontWeight:600, paddingBottom:4, textTransform:"uppercase", letterSpacing:0.5 }}>{d}</div>)}
        {weeks.flat().map((cell, i) => {
          if (!cell) return <div key={`e${i}`} style={{ aspectRatio:"1", borderRadius:4 }}/>;
          return (
            <div key={cell.date} title={cell.hasTrade ? `${cell.date}: ${fmt(cell.pnl)}` : cell.date} style={{
              aspectRatio:"1", borderRadius:5, background: cellColor(cell.pnl, cell.hasTrade),
              display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              border: cell.date === new Date().toISOString().split("T")[0] ? "1.5px solid rgba(99,102,241,0.6)" : "1px solid var(--tp-border)",
              cursor: cell.hasTrade ? "default" : "default", position:"relative", transition:"transform 0.15s",
              minHeight:32
            }}>
              <span style={{ fontSize:10, color: cell.hasTrade ? "#cdd1dc" : "#3a3e4a", fontWeight: cell.hasTrade ? 600 : 400 }}>{cell.day}</span>
              {cell.hasTrade && <span style={{ fontSize:7.5, color: cell.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace", fontWeight:700, marginTop:1 }}>{cell.pnl >= 0 ? "+" : ""}{Math.abs(cell.pnl) >= 1000 ? `${(cell.pnl/1000).toFixed(1)}k` : cell.pnl.toFixed(0)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const DEFAULT_DASH_WIDGETS = [
  { id:"accounts", label:"Account Balances", visible:true },
  { id:"filters", label:"Filter Bar", visible:true },
  { id:"stats", label:"Stat Cards", visible:true },
  { id:"secondary", label:"Secondary Stats", visible:true },
  { id:"chart", label:"P&L Chart", visible:true },
  { id:"calendar", label:"Calendar Heatmap", visible:true },
  { id:"breakdown", label:"Daily / Monthly Breakdown", visible:true },
];

// ─── PRE-TRADE RISK CALCULATOR ──────────────────────────────────────────────
function RiskCalculator({ theme, accountBalances, futuresSettings, customFields, accountSummaries }) {
  const [selectedAccount, setSelectedAccount] = useState("");
  const [accountSize, setAccountSize] = useState("");
  const [assetType, setAssetType] = useState("Stock"); // Stock | Options | Futures
  const [direction, setDirection] = useState("Long");
  const [riskPct, setRiskPct] = useState("1");

  // Stock fields
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  // Options fields
  const [optPremium, setOptPremium] = useState("");
  const [optStopPremium, setOptStopPremium] = useState("");
  const [optContracts, setOptContracts] = useState("");

  // Futures fields
  const [futContract, setFutContract] = useState("");
  const [futEntry, setFutEntry] = useState("");
  const [futStop, setFutStop] = useState("");
  const [futTickSize, setFutTickSize] = useState("");
  const [futTickValue, setFutTickValue] = useState("");
  const [futMode, setFutMode] = useState("manual"); // manual | auto
  const [futNumContracts, setFutNumContracts] = useState("1");

  // Account names from balances + custom fields
  const allAccounts = useMemo(() => {
    const set = new Set();
    if (accountBalances) Object.keys(accountBalances).forEach(k => set.add(k));
    if (customFields?.accounts) customFields.accounts.forEach(k => set.add(k));
    return [...set];
  }, [accountBalances, customFields]);

  // Auto-fill account size when account selected (use current balance from summaries)
  useEffect(() => {
    if (selectedAccount) {
      const summary = (accountSummaries || []).find(a => a.name === selectedAccount);
      if (summary) {
        setAccountSize(String(parseFloat(summary.currentBal) || ""));
      } else if (accountBalances && accountBalances[selectedAccount]) {
        setAccountSize(String(parseFloat(accountBalances[selectedAccount]) || ""));
      }
    }
  }, [selectedAccount, accountBalances, accountSummaries]);

  // Auto-fill on first load
  useEffect(() => {
    if (!accountSize) {
      if (accountSummaries && accountSummaries.length > 0) {
        const best = accountSummaries.reduce((a, b) => (b.currentBal || 0) > (a.currentBal || 0) ? b : a);
        setSelectedAccount(best.name);
        setAccountSize(String(parseFloat(best.currentBal) || ""));
      } else if (accountBalances && typeof accountBalances === "object") {
        const entries = Object.entries(accountBalances);
        if (entries.length > 0) {
          const [name, val] = entries.reduce((a, b) => (parseFloat(b[1]) || 0) > (parseFloat(a[1]) || 0) ? b : a);
          setSelectedAccount(name);
          setAccountSize(String(parseFloat(val) || ""));
        }
      }
    }
  }, [accountBalances, accountSummaries]);

  // Auto-fill futures preset
  useEffect(() => {
    if (futContract && futuresSettings) {
      const preset = futuresSettings.find(f => f.name === futContract);
      if (preset) {
        setFutTickSize(String(preset.tickSize || ""));
        setFutTickValue(String(preset.tickValue || ""));
      }
    }
  }, [futContract, futuresSettings]);

  const acct = parseFloat(accountSize) || 0;
  const risk = parseFloat(riskPct) || 0;
  const dollarRisk = acct > 0 && risk > 0 ? acct * (risk / 100) : 0;

  // ── Stock calculations ──
  const stockEntry = parseFloat(entryPrice) || 0;
  const stockStop = parseFloat(stopLoss) || 0;
  const stockRiskPerShare = direction === "Long" ? stockEntry - stockStop : stockStop - stockEntry;
  const stockValid = acct > 0 && stockEntry > 0 && stockStop > 0 && risk > 0 && stockRiskPerShare > 0;
  const stockShares = stockValid ? Math.floor(dollarRisk / stockRiskPerShare) : 0;
  const stockPosValue = stockShares * stockEntry;
  const stockPctOfAcct = acct > 0 ? (stockPosValue / acct) * 100 : 0;
  const stockR1 = stockValid ? (direction === "Long" ? stockEntry + stockRiskPerShare : stockEntry - stockRiskPerShare) : 0;
  const stockR2 = stockValid ? (direction === "Long" ? stockEntry + stockRiskPerShare*2 : stockEntry - stockRiskPerShare*2) : 0;
  const stockR3 = stockValid ? (direction === "Long" ? stockEntry + stockRiskPerShare*3 : stockEntry - stockRiskPerShare*3) : 0;

  // ── Options calculations ──
  const oPrem = parseFloat(optPremium) || 0;
  const oStopPrem = parseFloat(optStopPremium) || 0;
  const oContracts = parseInt(optContracts) || 0;
  const oRiskPerContract = (oPrem - oStopPrem) * 100; // each contract = 100 shares
  const oMaxRiskPerContract = oPrem * 100; // if riding to zero
  const optValid = acct > 0 && oPrem > 0 && risk > 0;
  const optContractsCalc = oStopPrem > 0 && oRiskPerContract > 0
    ? Math.floor(dollarRisk / oRiskPerContract)
    : oMaxRiskPerContract > 0 ? Math.floor(dollarRisk / oMaxRiskPerContract) : 0;
  const optActualContracts = oContracts > 0 ? oContracts : optContractsCalc;
  const optTotalCost = optActualContracts * oPrem * 100;
  const optTotalRisk = oStopPrem > 0 ? optActualContracts * oRiskPerContract : optTotalCost;
  const optPctOfAcct = acct > 0 ? (optTotalCost / acct) * 100 : 0;
  // Options R targets (premium-based)
  const oR1 = optValid ? oPrem + (oPrem - oStopPrem || oPrem) : 0;
  const oR2 = optValid ? oPrem + (oPrem - oStopPrem || oPrem) * 2 : 0;
  const oR3 = optValid ? oPrem + (oPrem - oStopPrem || oPrem) * 3 : 0;

  // ── Futures calculations (dual mode) ──
  // Key: all prices must align to tick size. Risk is measured in ticks, then converted to $.
  // tick_count = price_distance / tick_size (always whole ticks)
  // dollar_risk_per_contract = tick_count × tick_value
  const fEntry = parseFloat(futEntry) || 0;
  const fTickSize = parseFloat(futTickSize) || 0;
  const fTickValue = parseFloat(futTickValue) || 0;
  const fContracts = parseInt(futNumContracts) || 1;

  // Helper: snap a price to nearest valid tick
  const snapPrice = (price) => fTickSize > 0 ? Math.round(price / fTickSize) * fTickSize : price;

  // AUTO MODE: compute stop from risk %
  // dollarRisk / (contracts × tickValue) = max ticks per contract → snap to whole ticks → stop = entry ∓ (ticks × tickSize)
  const fAutoRawTicks = (dollarRisk > 0 && fContracts > 0 && fTickValue > 0) ? dollarRisk / (fContracts * fTickValue) : 0;
  const fAutoTicks = Math.max(0, Math.floor(fAutoRawTicks)); // whole ticks only, min 0
  const fAutoStopDistance = fAutoTicks * fTickSize; // points
  const fAutoStop = (fEntry > 0 && fAutoTicks > 0 && fTickSize > 0)
    ? snapPrice(direction === "Long" ? fEntry - fAutoStopDistance : fEntry + fAutoStopDistance) : 0;
  const fAutoRiskPerContract = fAutoTicks * fTickValue;
  const fAutoTotalRisk = fContracts * fAutoRiskPerContract;
  const fAutoValid = futMode === "auto" && acct > 0 && fEntry > 0 && fTickSize > 0 && fTickValue > 0 && risk > 0 && fContracts >= 1 && fAutoTicks >= 1;

  // MANUAL MODE: compute contracts from stop
  const fStop = parseFloat(futStop) || 0;
  const fManualPriceDist = direction === "Long" ? fEntry - fStop : fStop - fEntry;
  const fManualTicks = fTickSize > 0 ? Math.max(0, Math.floor(fManualPriceDist / fTickSize)) : 0;
  const fManualRiskPerContract = fManualTicks * fTickValue;
  const fManualValid = futMode === "manual" && acct > 0 && fEntry > 0 && fStop > 0 && fTickSize > 0 && fTickValue > 0 && risk > 0 && fManualTicks >= 1;
  const fManualContracts = fManualValid && fManualRiskPerContract > 0 ? Math.max(1, Math.floor(dollarRisk / fManualRiskPerContract)) : 0;
  const fManualTotalRisk = fManualContracts * fManualRiskPerContract;

  // Unified futures outputs (pick from correct mode)
  const futValid = futMode === "auto" ? fAutoValid : fManualValid;
  const futContracts = futMode === "auto" ? fContracts : fManualContracts;
  const fRiskTicks = futMode === "auto" ? fAutoTicks : fManualTicks; // whole ticks
  const fRiskPerContract = futMode === "auto" ? fAutoRiskPerContract : fManualRiskPerContract;
  const futTotalRisk = futMode === "auto" ? fAutoTotalRisk : fManualTotalRisk;
  const fRiskPoints = fRiskTicks * fTickSize; // price distance of risk
  const fActualStop = futMode === "auto" ? fAutoStop : fStop;
  // R-targets: each R = risk distance in ticks, applied as price movement from entry
  const fR1 = futValid ? snapPrice(direction === "Long" ? fEntry + fRiskPoints : fEntry - fRiskPoints) : 0;
  const fR2 = futValid ? snapPrice(direction === "Long" ? fEntry + fRiskPoints*2 : fEntry - fRiskPoints*2) : 0;
  const fR3 = futValid ? snapPrice(direction === "Long" ? fEntry + fRiskPoints*3 : fEntry - fRiskPoints*3) : 0;
  // R-target dollar amounts per R
  const fR1Dollar = fRiskTicks * fTickValue * futContracts;
  const fR2Dollar = fRiskTicks * fTickValue * futContracts * 2;
  const fR3Dollar = fRiskTicks * fTickValue * futContracts * 3;

  const inputStyle = { width:"100%", padding:"9px 12px", background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:8, color:theme.text, fontSize:13, outline:"none", fontFamily:"'JetBrains Mono', monospace", boxSizing:"border-box" };
  const labelStyle = { fontSize:10, color:theme.textFaint, textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 };
  const selectStyle = { ...inputStyle, appearance:"none", cursor:"pointer" };

  const ResultCard = ({ label, value, sub, color, large }) => (
    <div style={{ background:theme.cardBg, borderRadius:8, padding:"12px 14px", textAlign:"center" }}>
      <div style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:large?20:18, fontWeight:800, color, fontFamily:"'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:theme.textFaintest }}>{sub}</div>}
    </div>
  );

  const isValid = assetType === "Stock" ? stockValid : assetType === "Options" ? optValid : futValid;
  const showStopWarning = assetType === "Stock" && acct > 0 && stockEntry > 0 && stockStop > 0 && stockRiskPerShare <= 0;
  const showFutStopWarning = assetType === "Futures" && futMode === "manual" && acct > 0 && fEntry > 0 && fStop > 0 && fManualTicks <= 0;

  return (
    <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:14, padding:"18px 20px", marginBottom:16, order:-1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        <Calculator size={15} color="#a5b4fc"/>
        <span style={{ fontSize:13, fontWeight:600, color:theme.text }}>Pre-Trade Risk Calculator</span>
        <span style={{ fontSize:10, color:theme.textFaintest }}>Size your position before every trade</span>
      </div>

      {/* Row 1: Account + Asset Type + Direction + Risk % */}
      <div className="tp-risk-calc-grid" style={{ display:"grid", gridTemplateColumns:"1.3fr 0.8fr 0.7fr 0.7fr", gap:10, marginBottom:12 }}>
        <div>
          <label style={labelStyle}>Account</label>
          <div style={{ display:"flex", gap:6 }}>
            <select value={selectedAccount} onChange={e=>{setSelectedAccount(e.target.value);}} style={{ ...selectStyle, flex:1 }}>
              <option value="" style={{ background:theme.selectOptionBg }}>Manual entry...</option>
              {allAccounts.map(a => { const sum = (accountSummaries||[]).find(s=>s.name===a); const bal = sum ? sum.currentBal : (parseFloat(accountBalances?.[a])||0); return <option key={a} value={a} style={{ background:theme.selectOptionBg }}>{a} {bal ? `($${bal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})})` : ""}</option>; })}
            </select>
            <input type="number" value={accountSize} onChange={e=>{setAccountSize(e.target.value);setSelectedAccount("");}} placeholder="$" style={{ ...inputStyle, width:90 }}/>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Asset Type</label>
          <select value={assetType} onChange={e=>setAssetType(e.target.value)} style={selectStyle}>
            <option value="Stock" style={{ background:theme.selectOptionBg }}>📈 Stock</option>
            <option value="Options" style={{ background:theme.selectOptionBg }}>🎯 Options</option>
            <option value="Futures" style={{ background:theme.selectOptionBg }}>⚡ Futures</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Direction</label>
          <select value={direction} onChange={e=>setDirection(e.target.value)} style={selectStyle}>
            <option value="Long" style={{ background:theme.selectOptionBg }}>Long</option>
            <option value="Short" style={{ background:theme.selectOptionBg }}>Short</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Risk %</label>
          <div style={{ position:"relative" }}>
            <input type="number" value={riskPct} onChange={e=>setRiskPct(e.target.value)} placeholder="1" step="0.25" min="0.1" max="10" style={{ ...inputStyle, paddingRight:22 }}/>
            <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:theme.textFaintest, fontSize:13 }}>%</span>
          </div>
        </div>
      </div>

      {/* Row 2: Asset-specific inputs */}
      {assetType === "Stock" && (
        <div className="tp-risk-calc-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
          <div>
            <label style={labelStyle}>Entry Price</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:theme.textFaintest, fontSize:13 }}>$</span>
              <input type="number" value={entryPrice} onChange={e=>setEntryPrice(e.target.value)} placeholder="150.00" style={{ ...inputStyle, paddingLeft:22 }}/>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Stop Loss</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:theme.textFaintest, fontSize:13 }}>$</span>
              <input type="number" value={stopLoss} onChange={e=>setStopLoss(e.target.value)} placeholder="147.50" style={{ ...inputStyle, paddingLeft:22 }}/>
            </div>
          </div>
        </div>
      )}

      {assetType === "Options" && (
        <div className="tp-risk-calc-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
          <div>
            <label style={labelStyle}>Entry Premium</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:theme.textFaintest, fontSize:13 }}>$</span>
              <input type="number" value={optPremium} onChange={e=>setOptPremium(e.target.value)} placeholder="2.50" step="0.05" style={{ ...inputStyle, paddingLeft:22 }}/>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Stop Premium <span style={{ fontSize:8, color:theme.textFaintest }}>(optional)</span></label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:theme.textFaintest, fontSize:13 }}>$</span>
              <input type="number" value={optStopPremium} onChange={e=>setOptStopPremium(e.target.value)} placeholder="1.25" step="0.05" style={{ ...inputStyle, paddingLeft:22 }}/>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Contracts <span style={{ fontSize:8, color:theme.textFaintest }}>(override)</span></label>
            <input type="number" value={optContracts} onChange={e=>setOptContracts(e.target.value)} placeholder="Auto" min="1" style={inputStyle}/>
          </div>
        </div>
      )}

      {assetType === "Futures" && (
        <div style={{ marginBottom:14 }}>
          {/* Mode toggle */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ fontSize:10, color:theme.textFaint, textTransform:"uppercase", letterSpacing:0.8 }}>Mode:</span>
            <div style={{ display:"flex", borderRadius:6, overflow:"hidden", border:`1px solid ${theme.borderLight}` }}>
              <button onClick={()=>setFutMode("manual")} style={{ padding:"4px 12px", border:"none", background:futMode==="manual"?"rgba(99,102,241,0.2)":theme.cardBg, color:futMode==="manual"?"#a5b4fc":theme.textFaint, cursor:"pointer", fontSize:10, fontWeight:600 }}>Enter Stop</button>
              <button onClick={()=>setFutMode("auto")} style={{ padding:"4px 12px", border:"none", background:futMode==="auto"?"rgba(99,102,241,0.2)":theme.cardBg, color:futMode==="auto"?"#a5b4fc":theme.textFaint, cursor:"pointer", fontSize:10, fontWeight:600, borderLeft:`1px solid ${theme.borderLight}` }}>Calculate Stop</button>
            </div>
            <span style={{ fontSize:9, color:theme.textFaintest, fontStyle:"italic" }}>
              {futMode === "manual" ? "You set the stop → we calculate contracts" : "You set contracts → we calculate max stop distance"}
            </span>
          </div>

          {/* Inputs row */}
          <div className="tp-risk-calc-grid" style={{ display:"grid", gridTemplateColumns: futMode === "manual" ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr 1fr", gap:10 }}>
            <div>
              <label style={labelStyle}>Contract</label>
              <select value={futContract} onChange={e=>setFutContract(e.target.value)} style={selectStyle}>
                <option value="" style={{ background:theme.selectOptionBg }}>Select preset...</option>
                {(futuresSettings || []).map(f => <option key={f.name} value={f.name} style={{ background:theme.selectOptionBg }}>{f.name} (${f.tickValue}/{f.tickSize})</option>)}
                <option value="_custom" style={{ background:theme.selectOptionBg }}>Custom...</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Entry Price</label>
              <input type="number" value={futEntry} onChange={e=>setFutEntry(e.target.value)} placeholder="5450.25" step="any" style={inputStyle}/>
            </div>
            {futMode === "manual" ? (
              <div>
                <label style={labelStyle}>Stop Loss</label>
                <input type="number" value={futStop} onChange={e=>setFutStop(e.target.value)} placeholder="5445.00" step="any" style={inputStyle}/>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Contracts</label>
                <input type="number" value={futNumContracts} onChange={e=>setFutNumContracts(e.target.value)} placeholder="1" min="1" style={inputStyle}/>
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              <div>
                <label style={labelStyle}>Tick Size</label>
                <input type="number" value={futTickSize} onChange={e=>setFutTickSize(e.target.value)} placeholder="0.25" step="any" style={inputStyle}/>
              </div>
              <div>
                <label style={labelStyle}>Tick $</label>
                <input type="number" value={futTickValue} onChange={e=>setFutTickValue(e.target.value)} placeholder="12.50" step="any" style={inputStyle}/>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {isValid ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))", gap:8 }}>
          {/* ── Stock Results ── */}
          {assetType === "Stock" && <>
            <ResultCard label="Position Size" value={stockShares.toLocaleString()} sub="shares" color="#a5b4fc" large/>
            <ResultCard label="Dollar Risk" value={`$${dollarRisk.toFixed(2)}`} sub={`${riskPct}% of account`} color="#f87171"/>
            <ResultCard label="Risk / Share" value={`$${stockRiskPerShare.toFixed(2)}`} sub={direction==="Long"?"entry − stop":"stop − entry"} color="#eab308"/>
            <ResultCard label="Position Value" value={`$${stockPosValue.toLocaleString()}`} sub={`${stockPctOfAcct.toFixed(1)}% of account`} color="#60a5fa"/>
            <div style={{ background:theme.cardBg, borderRadius:8, padding:"12px 14px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", marginBottom:3 }}>R-Targets</div>
              <div style={{ fontSize:11, fontFamily:"'JetBrains Mono', monospace", lineHeight:1.7 }}>
                <div style={{ color:"#4ade80" }}>1R: ${stockR1.toFixed(2)} <span style={{ color:theme.textFaintest, fontSize:9 }}>+${dollarRisk.toFixed(0)}</span></div>
                <div style={{ color:"#22d3ee" }}>2R: ${stockR2.toFixed(2)} <span style={{ color:theme.textFaintest, fontSize:9 }}>+${(dollarRisk*2).toFixed(0)}</span></div>
                <div style={{ color:"#a78bfa" }}>3R: ${stockR3.toFixed(2)} <span style={{ color:theme.textFaintest, fontSize:9 }}>+${(dollarRisk*3).toFixed(0)}</span></div>
              </div>
            </div>
            {stockPctOfAcct > 20 && <div style={{ gridColumn:"1 / -1", display:"flex", alignItems:"center", gap:6, padding:"8px 12px", background:"rgba(234,179,8,0.08)", border:"1px solid rgba(234,179,8,0.2)", borderRadius:8, fontSize:11, color:"#eab308" }}><AlertTriangle size={14}/> Position is {stockPctOfAcct.toFixed(0)}% of your account — consider reducing size.</div>}
          </>}

          {/* ── Options Results ── */}
          {assetType === "Options" && <>
            <ResultCard label="Contracts" value={optActualContracts.toLocaleString()} sub={oContracts > 0 ? "manual override" : "calculated"} color="#a5b4fc" large/>
            <ResultCard label="Total Cost" value={`$${optTotalCost.toLocaleString()}`} sub={`${optPctOfAcct.toFixed(1)}% of account`} color="#60a5fa"/>
            <ResultCard label="Dollar Risk" value={`$${optTotalRisk.toFixed(2)}`} sub={oStopPrem > 0 ? `${optActualContracts} × $${oRiskPerContract.toFixed(0)}/ct` : "max risk (full premium)"} color="#f87171"/>
            <ResultCard label="Cost / Contract" value={`$${(oPrem * 100).toFixed(0)}`} sub={`$${oPrem.toFixed(2)} × 100`} color="#eab308"/>
            <div style={{ background:theme.cardBg, borderRadius:8, padding:"12px 14px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", marginBottom:3 }}>Premium Targets</div>
              <div style={{ fontSize:11, fontFamily:"'JetBrains Mono', monospace", lineHeight:1.7 }}>
                <div style={{ color:"#4ade80" }}>1R: ${oR1.toFixed(2)} <span style={{ color:theme.textFaintest, fontSize:9 }}>+${(optActualContracts*(oR1-oPrem)*100).toFixed(0)}</span></div>
                <div style={{ color:"#22d3ee" }}>2R: ${oR2.toFixed(2)} <span style={{ color:theme.textFaintest, fontSize:9 }}>+${(optActualContracts*(oR2-oPrem)*100).toFixed(0)}</span></div>
                <div style={{ color:"#a78bfa" }}>3R: ${oR3.toFixed(2)} <span style={{ color:theme.textFaintest, fontSize:9 }}>+${(optActualContracts*(oR3-oPrem)*100).toFixed(0)}</span></div>
              </div>
            </div>
            {!oStopPrem && <div style={{ gridColumn:"1 / -1", display:"flex", alignItems:"center", gap:6, padding:"8px 12px", background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.2)", borderRadius:8, fontSize:11, color:"#60a5fa" }}>💡 Set a stop premium for tighter risk control. Without it, max risk = full premium paid.</div>}
            {optPctOfAcct > 10 && <div style={{ gridColumn:"1 / -1", display:"flex", alignItems:"center", gap:6, padding:"8px 12px", background:"rgba(234,179,8,0.08)", border:"1px solid rgba(234,179,8,0.2)", borderRadius:8, fontSize:11, color:"#eab308" }}><AlertTriangle size={14}/> Options position is {optPctOfAcct.toFixed(0)}% of account — consider smaller size.</div>}
          </>}

          {/* ── Futures Results ── */}
          {assetType === "Futures" && <>
            {futMode === "auto" ? (
              <>
                <div style={{ background:theme.cardBg, borderRadius:8, padding:"12px 14px", textAlign:"center", border:"1px solid rgba(248,113,113,0.25)" }}>
                  <div style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", marginBottom:3 }}>Calculated Stop</div>
                  <div style={{ fontSize:22, fontWeight:800, color:"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fAutoStop.toFixed(fTickSize < 0.01 ? 4 : fTickSize < 1 ? 2 : 0)}</div>
                  <div style={{ fontSize:10, color:theme.textFaintest }}>{direction === "Long" ? "below" : "above"} entry</div>
                </div>
                <ResultCard label="Contracts" value={fContracts.toLocaleString()} sub={futContract || "futures"} color="#a5b4fc" large/>
                <ResultCard label="Ticks to Stop" value={`${fAutoTicks}`} sub={`${fRiskPoints.toFixed(2)} pts · $${fAutoRiskPerContract.toFixed(2)}/ct`} color="#60a5fa"/>
                <ResultCard label="Total Risk" value={`$${fAutoTotalRisk.toFixed(2)}`} sub={`${fAutoTicks} ticks × $${fTickValue} × ${fContracts}ct`} color="#eab308"/>
              </>
            ) : (
              <>
                <ResultCard label="Contracts" value={futContracts.toLocaleString()} sub={futContract || "futures"} color="#a5b4fc" large/>
                <ResultCard label="Ticks to Stop" value={`${fRiskTicks}`} sub={`${fRiskPoints.toFixed(2)} pts`} color="#60a5fa"/>
                <ResultCard label="Risk / Contract" value={`$${fRiskPerContract.toFixed(2)}`} sub={`${fRiskTicks} ticks × $${fTickValue}/tick`} color="#eab308"/>
                <ResultCard label="Total Risk" value={`$${futTotalRisk.toFixed(2)}`} sub={`${fRiskTicks}t × $${fTickValue} × ${futContracts}ct`} color="#f87171"/>
              </>
            )}
            <div style={{ background:theme.cardBg, borderRadius:8, padding:"12px 14px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", marginBottom:3 }}>R-Targets (tick-based)</div>
              <div style={{ fontSize:11, fontFamily:"'JetBrains Mono', monospace", lineHeight:1.8 }}>
                <div style={{ color:"#4ade80" }}>1R: {fR1.toFixed(2)} <span style={{ color:theme.textFaintest, fontSize:9 }}>({fRiskTicks}t · +${fR1Dollar.toFixed(0)})</span></div>
                <div style={{ color:"#22d3ee" }}>2R: {fR2.toFixed(2)} <span style={{ color:theme.textFaintest, fontSize:9 }}>({fRiskTicks*2}t · +${fR2Dollar.toFixed(0)})</span></div>
                <div style={{ color:"#a78bfa" }}>3R: {fR3.toFixed(2)} <span style={{ color:theme.textFaintest, fontSize:9 }}>({fRiskTicks*3}t · +${fR3Dollar.toFixed(0)})</span></div>
              </div>
            </div>
          </>}
        </div>
      ) : (
        <div style={{ textAlign:"center", padding:"14px", color:theme.textFaintest, fontSize:12 }}>
          {(showStopWarning || showFutStopWarning) ?
            <span style={{ color:"#f87171" }}>⚠️ Stop loss must be {direction === "Long" ? "below" : "above"} entry price for a {direction.toLowerCase()} trade</span> :
            assetType === "Futures" ? (
              <div>
                {!(fTickSize > 0 && fTickValue > 0) && <div style={{ marginBottom:4 }}>⚠️ Select a contract preset or enter tick size & tick value</div>}
                {!(acct > 0) && <div style={{ marginBottom:4 }}>⚠️ Enter an account size or select an account</div>}
                {!(fEntry > 0) && <div style={{ marginBottom:4 }}>⚠️ Enter an entry price</div>}
                {futMode === "manual" && !(fStop > 0) && fEntry > 0 && <div style={{ marginBottom:4 }}>⚠️ Enter a stop loss price</div>}
                {futMode === "auto" && fEntry > 0 && fTickSize > 0 && fTickValue > 0 && acct > 0 && fAutoTicks < 1 && <div style={{ color:"#f87171", marginBottom:4 }}>⚠️ Risk budget too small for {fContracts} contract{fContracts>1?"s":""}. Try fewer contracts or higher risk %</div>}
                {acct > 0 && fEntry > 0 && fTickSize > 0 && fTickValue > 0 && (futMode === "manual" ? fStop > 0 : true) && fAutoTicks >= 1 ? null :
                  (fTickSize > 0 && fTickValue > 0 && acct > 0 && fEntry > 0) ? null :
                  <div style={{ color:theme.textFaintest }}>Fill in the fields above to calculate</div>
                }
              </div>
            ) :
            "Fill in the fields above to calculate your position size"
          }
        </div>
      )}
    </div>
  );
}

function Dashboard({ trades, customFields, accountBalances, theme, logo, banner, dashWidgets, futuresSettings, prefs, onSavePrefs, wheelTrades, cashTransactions, dividends, hideBalances, setHideBalances, onNavigate, onNewTrade }) {
  const widgetConfig = useMemo(() => {
    if (!dashWidgets || dashWidgets.length === 0) return DEFAULT_DASH_WIDGETS;
    const merged = [];
    dashWidgets.forEach(w => { const def = DEFAULT_DASH_WIDGETS.find(d => d.id === w.id); if (def) merged.push({ ...def, ...w }); });
    DEFAULT_DASH_WIDGETS.forEach(d => { if (!merged.find(m => m.id === d.id)) merged.push(d); });
    return merged;
  }, [dashWidgets]);
  const wVis = (id) => { const w = widgetConfig.find(w => w.id === id); return w ? w.visible !== false : true; };
  const wOrder = (id) => { const idx = widgetConfig.findIndex(w => w.id === id); return idx >= 0 ? idx : 99; };
  // ── Filter State ──
  const [accountFilter, setAccountFilter] = useState("All");
  const [assetFilter, setAssetFilter] = useState("All");
  const [strategyFilter, setStrategyFilter] = useState("All");
  const [directionFilter, setDirectionFilter] = useState("All");
  const [timeframeFilter, setTimeframeFilter] = useState("All");
  const [dateRangePreset, setDateRangePreset] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [showRiskCalc, setShowRiskCalc] = useState(false);
  const [reconcileAccount, setReconcileAccount] = useState(null); // { name, currentBal }
  const [reconcileTarget, setReconcileTarget] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [pnlMode, setPnlMode] = useState("dollar"); // dollar | percent
  const [chartType, setChartType] = useState("equity"); // equity | balance | daily | weekly | monthly
  const [chartAccountFilter, setChartAccountFilter] = useState("All"); // independent chart-level account filter

  // ── Resolve effective starting capital based on filters ──
  // When filtering by a specific account, use that account's starting balance.
  // When "All" is selected, sum all account balances.
  const capVal = useMemo(() => {
    if (!accountBalances || Object.keys(accountBalances).length === 0) return 0;
    if (accountFilter !== "All") return parseFloat(accountBalances[accountFilter]) || 0;
    return Object.values(accountBalances).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  }, [accountBalances, accountFilter]);

  // ── Derive unique filter values from trade data ──
  const uniqueAccounts = useMemo(() => [...new Set(trades.filter(t=>t.account).map(t=>t.account))], [trades]);
  const uniqueStrategies = useMemo(() => {
    const strats = new Set();
    trades.forEach(t => {
      if (t.assetType === "Options" && t.optionsStrategyType) strats.add(t.optionsStrategyType);
      else if (t.tradeStrategy) strats.add(t.tradeStrategy);
      else if (t.strategy) strats.add(t.strategy);
    });
    return [...strats];
  }, [trades]);
  const uniqueTimeframes = useMemo(() => [...new Set(trades.filter(t=>t.timeframe).map(t=>t.timeframe))], [trades]);

  // ── Resolve date range ──
  const dateRange = useMemo(() => {
    if (dateRangePreset === "custom") return { from: customDateFrom, to: customDateTo };
    return getDateRangeBounds(dateRangePreset);
  }, [dateRangePreset, customDateFrom, customDateTo]);

  // ── Apply Filters ──
  const filtered = useMemo(() => {
    const resets = prefs?.accountResets || {};
    return trades.filter(t => {
      // Account reset date filter — exclude pre-reset trades
      if (t.account && resets[t.account]?.resetDate && t.date < resets[t.account].resetDate) return false;
      // Date range filter
      if (dateRange.from && t.date < dateRange.from) return false;
      if (dateRange.to && t.date > dateRange.to) return false;
      if (accountFilter !== "All" && t.account !== accountFilter) return false;
      if (assetFilter !== "All" && t.assetType !== assetFilter) return false;
      if (directionFilter !== "All" && t.direction !== directionFilter) return false;
      if (timeframeFilter !== "All" && t.timeframe !== timeframeFilter) return false;
      if (strategyFilter !== "All") {
        const tStrat = t.assetType === "Options" ? t.optionsStrategyType : (t.tradeStrategy || t.strategy);
        if (tStrat !== strategyFilter) return false;
      }
      return true;
    });
  }, [trades, dateRange, accountFilter, assetFilter, strategyFilter, directionFilter, timeframeFilter]);

  // ── Compute per-account balance summaries ──
  const accountSummaries = useMemo(() => {
    if (!accountBalances || Object.keys(accountBalances).length === 0) return [];
    const holdingPrices = prefs?.holdingPrices || {};
    const balanceOverrides = prefs?.balanceOverrides || {};

    return Object.entries(accountBalances).map(([name, startBal]) => {
      const reset = prefs?.accountResets?.[name];
      const resetDate = reset?.resetDate || null;
      const start = reset ? (parseFloat(reset.resetBalance) || 0) : (parseFloat(startBal) || 0);
      const acctTrades = trades.filter(t => t.account === name && t.pnl !== null && t.pnl !== undefined && !isNaN(t.pnl) && (!resetDate || t.date >= resetDate));
      const realizedPnL = acctTrades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);

      // Calculate unrealized P&L from open positions with current prices
      const openTrades = trades.filter(t => t.account === name && t.status === "Open" && (!resetDate || t.date >= resetDate));
      let unrealizedPnL = 0;
      openTrades.forEach(t => {
        const curPrice = holdingPrices[t.ticker];
        if (curPrice && t.entryPrice && t.quantity) {
          const entry = parseFloat(t.entryPrice) || 0;
          const qty = parseFloat(t.quantity) || 0;
          const dir = t.direction === "Short" ? -1 : 1;
          unrealizedPnL += (curPrice - entry) * qty * dir;
        }
      });
      unrealizedPnL = Math.round(unrealizedPnL * 100) / 100;

      // Calculate wheel premium income for this account
      let wheelPremium = 0;
      (wheelTrades || []).filter(wt => wt.account === name && (!resetDate || wt.date >= resetDate)).forEach(wt => {
        if (wt.type === "CSP" || wt.type === "CC") {
          wheelPremium += ((parseFloat(wt.openPremium)||0) - (parseFloat(wt.closePremium)||0)) * (parseInt(wt.contracts)||0) * 100 - (parseFloat(wt.fees)||0);
        }
      });
      wheelPremium = Math.round(wheelPremium * 100) / 100;

      // Calculate cash deposits/withdrawals for this account
      let cashNet = 0;
      (cashTransactions || []).filter(ct => ct.account === name && (!resetDate || ct.date >= resetDate)).forEach(ct => {
        cashNet += ct.type === "deposit" ? (parseFloat(ct.amount) || 0) : -(parseFloat(ct.amount) || 0);
      });
      cashNet = Math.round(cashNet * 100) / 100;

      // Calculate cash dividend income for this account
      let dividendIncome = 0;
      (dividends || []).filter(d => d.type === "cash" && (d.account === name || (!d.account && name === Object.keys(accountBalances)[0])) && (!resetDate || d.date >= resetDate)).forEach(d => {
        dividendIncome += parseFloat(d.totalAmount) || 0;
      });
      dividendIncome = Math.round(dividendIncome * 100) / 100;

      const totalPnL = (realizedPnL || 0) + (unrealizedPnL || 0) + (wheelPremium || 0);

      // Sum reconciliation adjustments for this account
      const reconciliations = prefs?.reconciliations?.[name] || [];
      const reconcileAdj = reconciliations.filter(r => !resetDate || r.date >= resetDate).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

      // Manual override takes priority if set
      const override = balanceOverrides?.[name];
      const hasOverride = override !== undefined && override !== null && override !== "";
      const overrideVal = hasOverride ? parseFloat(override) : null;

      const currentBal = hasOverride ? (overrideVal || 0) : (start || 0) + (totalPnL || 0) + (cashNet || 0) + (dividendIncome || 0) + reconcileAdj;
      const returnPct = start > 0 ? ((currentBal - start - (cashNet || 0)) / start) * 100 : 0;

      return { name, startBal: start, currentBal, realizedPnL, unrealizedPnL, wheelPremium, cashNet, dividendIncome, totalPnL, returnPct, tradeCount: acctTrades.length, hasOverride, overrideVal, resetDate, reconcileAdj };
    });
  }, [accountBalances, trades, prefs, wheelTrades, cashTransactions, dividends]);

  // ── Compute Stats ──
  const stats = useMemo(() => {
    const closed = filtered.filter(t => t.pnl !== null);
    const open = filtered.filter(t => t.status === "Open");
    const totalPnL = closed.reduce((s,t) => s+t.pnl, 0);
    const wins = closed.filter(t => t.pnl > 0);
    const losses = closed.filter(t => t.pnl <= 0);
    const winRate = closed.length ? (wins.length/closed.length)*100 : 0;
    const avgWin = wins.length ? wins.reduce((s,t)=>s+t.pnl,0)/wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s,t)=>s+t.pnl,0)/losses.length : 0;
    const bestTrade = closed.length ? [...closed].sort((a,b)=>b.pnl-a.pnl)[0] : null;
    const worstTrade = closed.length ? [...closed].sort((a,b)=>a.pnl-b.pnl)[0] : null;
    const profitFactor = losses.length && losses.reduce((s,t)=>s+Math.abs(t.pnl),0) > 0
      ? wins.reduce((s,t)=>s+t.pnl,0) / losses.reduce((s,t)=>s+Math.abs(t.pnl),0) : wins.length > 0 ? Infinity : 0;
    
    // Streak calculation
    let currentStreak = 0, maxWinStreak = 0, maxLoseStreak = 0, tempWin = 0, tempLose = 0;
    const sortedClosed = [...closed].sort((a,b)=>new Date(a.date)-new Date(b.date));
    sortedClosed.forEach(t => {
      if (t.pnl > 0) { tempWin++; tempLose = 0; maxWinStreak = Math.max(maxWinStreak, tempWin); }
      else { tempLose++; tempWin = 0; maxLoseStreak = Math.max(maxLoseStreak, tempLose); }
    });
    if (sortedClosed.length > 0) {
      const last = sortedClosed[sortedClosed.length - 1];
      let streak = 0; const isWin = last.pnl > 0;
      for (let i = sortedClosed.length - 1; i >= 0; i--) {
        if ((sortedClosed[i].pnl > 0) === isWin) streak++; else break;
      }
      currentStreak = isWin ? streak : -streak;
    }

    // Equity curve — shows actual account balance if capital is set
    let cum = 0;
    const equityCurve = sortedClosed.map(t => {
      cum+=t.pnl;
      return {
        date:t.date,
        pnl:parseFloat(cum.toFixed(2)),
        balance: capVal > 0 ? parseFloat((capVal + cum).toFixed(2)) : null,
        pct: capVal > 0 ? parseFloat(((cum/capVal)*100).toFixed(2)) : 0
      };
    });

    // Daily aggregation
    const dailyMap = {};
    sortedClosed.forEach(t => { dailyMap[t.date] = (dailyMap[t.date]||0)+t.pnl; });
    Object.keys(dailyMap).forEach(k => { dailyMap[k] = parseFloat(dailyMap[k].toFixed(2)); });
    const dailyData = Object.entries(dailyMap).map(([date,pnl])=>({date, pnl, pct: capVal > 0 ? parseFloat(((pnl/capVal)*100).toFixed(2)) : 0 }));

    // Weekly aggregation
    const weeklyMap = {};
    sortedClosed.forEach(t => { const ws = getWeekStart(new Date(t.date + "T12:00:00")); weeklyMap[ws] = (weeklyMap[ws]||0)+t.pnl; });
    const weeklyData = Object.entries(weeklyMap).map(([w,pnl]) => ({ date:w, label: formatWeekLabel(w).replace("Week of ",""), pnl:parseFloat(pnl.toFixed(2)), pct: capVal > 0 ? parseFloat(((pnl/capVal)*100).toFixed(2)) : 0 })).sort((a,b)=>new Date(a.date)-new Date(b.date));

    // Monthly aggregation
    const monthlyMap = {};
    sortedClosed.forEach(t => { const m = t.date.substring(0,7); monthlyMap[m] = (monthlyMap[m]||0)+t.pnl; });
    const monthlyData = Object.entries(monthlyMap).map(([m,pnl]) => {
      const [y,mo] = m.split("-");
      return { date:m, label: new Date(parseInt(y), parseInt(mo)-1).toLocaleString("en-US",{month:"short",year:"2-digit"}), pnl:parseFloat(pnl.toFixed(2)), pct: capVal > 0 ? parseFloat(((pnl/capVal)*100).toFixed(2)) : 0 };
    }).sort((a,b)=>a.date.localeCompare(b.date));

    // Asset breakdown
    const byAsset = {};
    closed.forEach(t => { byAsset[t.assetType] = (byAsset[t.assetType]||0)+t.pnl; });

    // Max drawdown
    let peak = 0, maxDD = 0; cum = 0;
    sortedClosed.forEach(t => { cum += t.pnl; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDD) maxDD = dd; });

    return { closed, open, totalPnL, wins, losses, winRate, avgWin, avgLoss, bestTrade, worstTrade, profitFactor, currentStreak, maxWinStreak, maxLoseStreak, equityCurve, dailyMap, dailyData, weeklyData, monthlyData, byAsset, maxDD, sortedClosed };
  }, [filtered, capVal]);

  const activeFilterCount = [accountFilter, assetFilter, strategyFilter, directionFilter, timeframeFilter].filter(f => f !== "All").length + (dateRangePreset !== "all" ? 1 : 0);

  // ── Chart-specific account filtering (independent of global filters) ──
  const chartCapVal = useMemo(() => {
    if (!accountBalances || Object.keys(accountBalances).length === 0) return capVal;
    if (chartAccountFilter !== "All") return parseFloat(accountBalances[chartAccountFilter]) || 0;
    return capVal; // fall back to the global capVal (which already accounts for the global account filter)
  }, [accountBalances, chartAccountFilter, capVal]);

  const chartStats = useMemo(() => {
    // If chart account filter matches global state, just reuse main stats
    if (chartAccountFilter === "All") return stats;

    // Otherwise, compute chart data from globally-filtered trades further narrowed by chart account
    const chartFiltered = filtered.filter(t => t.account === chartAccountFilter);
    const closed = chartFiltered.filter(t => t.pnl !== null);
    const sortedClosed = [...closed].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Equity curve
    let cum = 0;
    const equityCurve = sortedClosed.map(t => {
      cum += t.pnl;
      return {
        date: t.date,
        pnl: parseFloat(cum.toFixed(2)),
        balance: chartCapVal > 0 ? parseFloat((chartCapVal + cum).toFixed(2)) : null,
        pct: chartCapVal > 0 ? parseFloat(((cum / chartCapVal) * 100).toFixed(2)) : 0
      };
    });

    // Daily
    const dailyMap = {};
    sortedClosed.forEach(t => { dailyMap[t.date] = (dailyMap[t.date] || 0) + t.pnl; });
    Object.keys(dailyMap).forEach(k => { dailyMap[k] = parseFloat(dailyMap[k].toFixed(2)); });
    const dailyData = Object.entries(dailyMap).map(([date, pnl]) => ({ date, pnl, pct: chartCapVal > 0 ? parseFloat(((pnl / chartCapVal) * 100).toFixed(2)) : 0 }));

    // Weekly
    const weeklyMap = {};
    sortedClosed.forEach(t => { const ws = getWeekStart(new Date(t.date + "T12:00:00")); weeklyMap[ws] = (weeklyMap[ws] || 0) + t.pnl; });
    const weeklyData = Object.entries(weeklyMap).map(([w, pnl]) => ({ date: w, label: formatWeekLabel(w).replace("Week of ", ""), pnl: parseFloat(pnl.toFixed(2)), pct: chartCapVal > 0 ? parseFloat(((pnl / chartCapVal) * 100).toFixed(2)) : 0 })).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Monthly
    const monthlyMap = {};
    sortedClosed.forEach(t => { const m = t.date.substring(0, 7); monthlyMap[m] = (monthlyMap[m] || 0) + t.pnl; });
    const monthlyData = Object.entries(monthlyMap).map(([m, pnl]) => {
      const [y, mo] = m.split("-");
      return { date: m, label: new Date(parseInt(y), parseInt(mo) - 1).toLocaleString("en-US", { month: "short", year: "2-digit" }), pnl: parseFloat(pnl.toFixed(2)), pct: chartCapVal > 0 ? parseFloat(((pnl / chartCapVal) * 100).toFixed(2)) : 0 };
    }).sort((a, b) => a.date.localeCompare(b.date));

    return { ...stats, equityCurve, dailyData, weeklyData, monthlyData, dailyMap };
  }, [chartAccountFilter, filtered, chartCapVal, stats]);

  const prevMonth = () => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y=>y-1); } else setCalendarMonth(m=>m-1); };
  const nextMonth = () => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y=>y+1); } else setCalendarMonth(m=>m+1); };

  const chartDataKey = pnlMode === "percent" ? "pct" : "pnl";
  const chartFormatter = pnlMode === "percent" ? (v => fmtPct(v)) : (v => fmt(v));
  const yTickFmt = pnlMode === "percent" ? (v => v.toFixed(1)+"%") : (v => "$"+v);

  const getChartData = () => {
    switch (chartType) {
      case "equity": return chartStats.equityCurve;
      case "balance": return chartStats.equityCurve;
      case "daily": return chartStats.dailyData;
      case "weekly": return chartStats.weeklyData;
      case "monthly": return chartStats.monthlyData;
      default: return chartStats.equityCurve;
    }
  };
  const chartData = getChartData();
  const isBarChart = chartType !== "equity" && chartType !== "balance";
  const isBalanceView = chartType === "balance";

  // ── Panel style shorthand ──
  const panel = (extra = {}) => ({ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:14, padding:"20px 22px", ...extra });

  return (
    <div style={{ display:"flex", flexDirection:"column" }}>
      {/* ═══════ FIRST-TIME WELCOME (no trades) ═══════ */}
      {trades.length === 0 && (
        <div style={{ maxWidth:640, margin:"40px auto", textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📊</div>
          <div style={{ fontSize:24, fontWeight:800, color:theme.text, marginBottom:8 }}>Welcome to TradePulse</div>
          <div style={{ fontSize:14, color:theme.textMuted, lineHeight:1.7, marginBottom:32, maxWidth:480, margin:"0 auto 32px" }}>Your personal trading journal. Track trades, analyze performance, and grow as a trader. Get started in three easy steps.</div>
          
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:16, marginBottom:32 }}>
            <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:12, padding:"20px 16px" }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"rgba(99,102,241,0.12)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}><span style={{ fontSize:16, fontWeight:800, color:"#a5b4fc" }}>1</span></div>
              <div style={{ fontSize:13, fontWeight:700, color:theme.text, marginBottom:4 }}>Set Up Accounts</div>
              <div style={{ fontSize:11, color:theme.textFaint, lineHeight:1.5 }}>Go to Settings → Account Balances and add your starting capital</div>
            </div>
            <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:12, padding:"20px 16px" }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"rgba(74,222,128,0.12)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}><span style={{ fontSize:16, fontWeight:800, color:"#4ade80" }}>2</span></div>
              <div style={{ fontSize:13, fontWeight:700, color:theme.text, marginBottom:4 }}>Import or Log Trades</div>
              <div style={{ fontSize:11, color:theme.textFaint, lineHeight:1.5 }}>Import from your broker (CSV or PDF) or log trades manually</div>
            </div>
            <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:12, padding:"20px 16px" }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"rgba(234,179,8,0.12)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}><span style={{ fontSize:16, fontWeight:800, color:"#eab308" }}>3</span></div>
              <div style={{ fontSize:13, fontWeight:700, color:theme.text, marginBottom:4 }}>Track & Improve</div>
              <div style={{ fontSize:11, color:theme.textFaint, lineHeight:1.5 }}>Review your stats, set goals, and refine your edge over time</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
            <button onClick={()=>onNavigate && onNavigate("settings")} style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#059669,#34d399)", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:600, boxShadow:"0 4px 14px rgba(5,150,105,0.3)" }}><Upload size={16}/> Import from Broker</button>
            <button onClick={()=>onNewTrade && onNewTrade()} style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 24px", borderRadius:10, border:"1px solid rgba(99,102,241,0.4)", background:"rgba(99,102,241,0.08)", color:"#a5b4fc", cursor:"pointer", fontSize:14, fontWeight:600 }}><Plus size={16}/> Log First Trade</button>
          </div>
        </div>
      )}

      {/* ═══════ PERSONALIZED HEADER ═══════ */}
      {(logo || banner) && (
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20, padding:"12px 0", overflow:"hidden", borderRadius:12, order:-1 }}>
          {logo && <img src={logo} alt="Logo" style={{ height:52, maxWidth:180, objectFit:"contain", borderRadius:6, flexShrink:0 }}/>}
          {banner && <div style={{ flex:1, height:52, borderRadius:8, overflow:"hidden", background:theme.inputBg }}><img src={banner} alt="Banner" style={{ width:"100%", height:"100%", objectFit:"cover" }}/></div>}
        </div>
      )}

      {/* ═══════ RISK CALCULATOR TOGGLE ═══════ */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom: showRiskCalc ? 0 : 12, order:-1 }}>
        <button onClick={()=>setShowRiskCalc(!showRiskCalc)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8, border:`1px solid ${showRiskCalc ? "rgba(99,102,241,0.4)" : theme.borderLight}`, background: showRiskCalc ? "rgba(99,102,241,0.12)" : theme.inputBg, color: showRiskCalc ? "#a5b4fc" : theme.textMuted, cursor:"pointer", fontSize:12, fontWeight:600 }}>
          <Calculator size={14}/> Risk Calculator {showRiskCalc ? "▾" : "▸"}
        </button>
      </div>
      {showRiskCalc && <RiskCalculator theme={theme} accountBalances={accountBalances} futuresSettings={futuresSettings} customFields={customFields} accountSummaries={accountSummaries}/>}

      {/* ═══════ ACCOUNT BALANCE CARDS ═══════ */}
      {wVis("accounts") && accountSummaries.length > 0 && (
        <div style={{ marginBottom:18, order:wOrder("accounts") }}>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:6 }}>
            <button onClick={()=>setHideBalances(!hideBalances)} style={{ background:"none", border:"1px solid var(--tp-border-l)", borderRadius:6, padding:"4px 8px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, color:hideBalances?"#a5b4fc":"var(--tp-faint)", fontSize:10, transition:"all 0.15s" }} title={hideBalances?"Show balances":"Hide balances"}>
              {hideBalances ? <EyeOff size={12}/> : <Eye size={12}/>}
              {hideBalances ? "Hidden" : "Hide"}
            </button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:`repeat(auto-fit, minmax(${accountSummaries.length === 1 ? "300px" : "220px"}, 1fr))`, gap:10 }}>
            {(accountFilter === "All" ? accountSummaries : accountSummaries.filter(a => a.name === accountFilter)).map(acct => (
              <div key={acct.name} style={{
                background:theme.panelBg, borderRadius:12, padding:"16px 18px",
                border:`1px solid ${acct.totalPnL >= 0 ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)"}`,
                cursor:"pointer", transition:"all 0.2s",
                outline: accountFilter === acct.name ? "2px solid rgba(99,102,241,0.5)" : "none", outlineOffset:1
              }}
                onClick={()=>setAccountFilter(accountFilter === acct.name ? "All" : acct.name)}
                onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.35)"}
                onMouseLeave={e=>e.currentTarget.style.borderColor=acct.totalPnL >= 0 ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)"}
              >
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:theme.text }}>{acct.name}</div>
                  <span style={{ fontSize:9, fontWeight:600, color: acct.returnPct >= 0 ? "#4ade80" : "#f87171", background: acct.returnPct >= 0 ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", padding:"2px 8px", borderRadius:10, fontFamily:"'JetBrains Mono', monospace" }}>
                    {hideBalances ? "•••" : `${acct.returnPct >= 0 ? "+" : ""}${(isNaN(acct.returnPct) ? 0 : acct.returnPct).toFixed(1)}%`}
                  </span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"end" }}>
                  <div>
                    <div style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", letterSpacing:0.5, marginBottom:2 }}>Current Balance {acct.hasOverride && <span style={{ color:"#eab308" }}>(Override)</span>}</div>
                    <div style={{ fontSize:20, fontWeight:700, color: acct.currentBal >= acct.startBal ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>
                      {hideBalances ? "$•••••" : `$${(isNaN(acct.currentBal) ? 0 : acct.currentBal).toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2})}`}
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:9, color:theme.textFaintest, textTransform:"uppercase", letterSpacing:0.5, marginBottom:2 }}>P&L</div>
                    <div style={{ fontSize:13, fontWeight:600, color: acct.totalPnL >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{hideBalances ? "$•••••" : fmt(acct.totalPnL)}</div>
                    {!hideBalances && (acct.unrealizedPnL !== 0 || acct.wheelPremium !== 0 || acct.cashNet !== 0 || acct.dividendIncome > 0 || acct.reconcileAdj !== 0) && !acct.hasOverride && !prefs.compactBalances && (
                      <div style={{ fontSize:9, color:theme.textFaintest, marginTop:2 }}>
                        <span style={{ color: acct.realizedPnL >= 0 ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)" }}>R: {fmt(acct.realizedPnL)}</span>
                        {acct.unrealizedPnL !== 0 && <>
                          {" · "}
                          <span style={{ color: acct.unrealizedPnL >= 0 ? "rgba(96,165,250,0.7)" : "rgba(248,113,113,0.6)" }}>U: {fmt(acct.unrealizedPnL)}</span>
                        </>}
                        {acct.wheelPremium !== 0 && <>
                          {" · "}
                          <span style={{ color:"rgba(167,139,250,0.7)" }}>W: {fmt(acct.wheelPremium)}</span>
                        </>}
                        {acct.cashNet !== 0 && <>
                          {" · "}
                          <span style={{ color:"rgba(234,179,8,0.7)" }}>C: {fmt(acct.cashNet)}</span>
                        </>}
                        {acct.dividendIncome > 0 && <>
                          {" · "}
                          <span style={{ color:"rgba(52,211,153,0.7)" }}>D: {fmt(acct.dividendIncome)}</span>
                        </>}
                        {acct.reconcileAdj !== 0 && <>
                          {" · "}
                          <span style={{ color:"rgba(251,146,60,0.7)" }}>Adj: {fmt(acct.reconcileAdj)}</span>
                        </>}
                      </div>
                    )}
                    <div style={{ fontSize:9, color:theme.textFaintest, marginTop:2 }}>{hideBalances ? "started $••••• · " : `started $${acct.startBal.toLocaleString()} · `}{acct.tradeCount} trades</div>
                    {!hideBalances && <button onClick={e=>{e.stopPropagation();setReconcileAccount(acct);setReconcileTarget("");}} style={{ background:"none", border:"none", color:"rgba(251,146,60,0.5)", cursor:"pointer", fontSize:8, padding:"2px 0", marginTop:2, textDecoration:"underline", textUnderlineOffset:2 }} onMouseEnter={e=>e.currentTarget.style.color="rgba(251,146,60,0.9)"} onMouseLeave={e=>e.currentTarget.style.color="rgba(251,146,60,0.5)"}>Reconcile</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ RECONCILE MODAL ═══════ */}
      {reconcileAccount && (() => {
        const diff = reconcileTarget !== "" ? (parseFloat(reconcileTarget) - reconcileAccount.currentBal) : null;
        const existingAdjs = prefs?.reconciliations?.[reconcileAccount.name] || [];
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={()=>setReconcileAccount(null)}>
            <div onClick={e=>e.stopPropagation()} style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"24px 28px", maxWidth:420, width:"100%" }}>
              <div style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)", marginBottom:4 }}>Reconcile: {reconcileAccount.name}</div>
              <div style={{ fontSize:11, color:"var(--tp-faint)", marginBottom:16 }}>Enter your broker's actual balance to create an adjustment</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>App Balance</div>
                  <div style={{ fontSize:18, fontWeight:700, color:"var(--tp-muted)", fontFamily:"'JetBrains Mono', monospace" }}>${reconcileAccount.currentBal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                </div>
                <div>
                  <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Broker Balance</div>
                  <input type="number" value={reconcileTarget} onChange={e=>setReconcileTarget(e.target.value)} placeholder="Enter actual balance" autoFocus step="0.01" style={{ width:"100%", padding:"8px 10px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:14, fontFamily:"'JetBrains Mono', monospace", outline:"none", boxSizing:"border-box" }}/>
                </div>
              </div>
              {diff !== null && !isNaN(diff) && (
                <div style={{ background: diff === 0 ? "rgba(74,222,128,0.08)" : "rgba(251,146,60,0.08)", border:`1px solid ${diff === 0 ? "rgba(74,222,128,0.2)" : "rgba(251,146,60,0.2)"}`, borderRadius:8, padding:"10px 14px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:11, color:"var(--tp-faint)" }}>Adjustment needed</span>
                  <span style={{ fontSize:16, fontWeight:700, fontFamily:"'JetBrains Mono', monospace", color: diff === 0 ? "#4ade80" : diff > 0 ? "#4ade80" : "#f87171" }}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button onClick={()=>setReconcileAccount(null)} style={{ padding:"8px 16px", borderRadius:6, border:"1px solid var(--tp-border-l)", background:"transparent", color:"var(--tp-faint)", cursor:"pointer", fontSize:12 }}>Cancel</button>
                <button disabled={diff === null || isNaN(diff) || diff === 0} onClick={()=>{
                  const adj = { id: Date.now(), date: new Date().toISOString().split("T")[0], amount: parseFloat(diff.toFixed(2)), brokerBal: parseFloat(reconcileTarget), appBal: reconcileAccount.currentBal };
                  onSavePrefs(p => ({ ...p, reconciliations: { ...(p.reconciliations||{}), [reconcileAccount.name]: [...((p.reconciliations||{})[reconcileAccount.name]||[]), adj] } }));
                  setReconcileAccount(null);
                }} style={{ padding:"8px 18px", borderRadius:6, border:"none", background: (diff && diff !== 0) ? "linear-gradient(135deg,#f97316,#fb923c)" : "rgba(100,100,100,0.3)", color:"#fff", cursor: (diff && diff !== 0) ? "pointer" : "default", fontSize:12, fontWeight:600, opacity: (diff === null || isNaN(diff) || diff === 0) ? 0.4 : 1 }}>Apply Adjustment</button>
              </div>
              {existingAdjs.length > 0 && (
                <div style={{ marginTop:16, borderTop:"1px solid var(--tp-border-l)", paddingTop:12 }}>
                  <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>Adjustment History</div>
                  {existingAdjs.map(adj => (
                    <div key={adj.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0", fontSize:10, color:"var(--tp-faint)" }}>
                      <span>{adj.date}</span>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontFamily:"'JetBrains Mono', monospace", color: adj.amount >= 0 ? "#4ade80" : "#f87171" }}>{adj.amount >= 0 ? "+" : ""}{adj.amount.toFixed(2)}</span>
                        <button onClick={()=>onSavePrefs(p=>({...p,reconciliations:{...(p.reconciliations||{}),[reconcileAccount.name]:((p.reconciliations||{})[reconcileAccount.name]||[]).filter(r=>r.id!==adj.id)}}))} style={{ background:"none", border:"none", color:"var(--tp-faintest)", cursor:"pointer", padding:0 }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="var(--tp-faintest)"}><X size={10}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ═══════ FILTER BAR ═══════ */}
      {wVis("filters") && <div style={{ ...panel(), marginBottom:18, padding:"14px 18px", order:wOrder("filters") }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <Filter size={13} color="#6366f1"/>
            <span style={{ fontSize:11, color:"#6366f1", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8 }}>Filters</span>
            {activeFilterCount > 0 && <span style={{ fontSize:10, fontWeight:700, color:theme.text, background:"#6366f1", borderRadius:10, padding:"1px 7px", minWidth:16, textAlign:"center" }}>{activeFilterCount}</span>}
          </div>
          {activeFilterCount > 0 && <button onClick={()=>{setAccountFilter("All");setAssetFilter("All");setStrategyFilter("All");setDirectionFilter("All");setTimeframeFilter("All");setDateRangePreset("all");setCustomDateFrom("");setCustomDateTo("");}} style={{ padding:"3px 10px", borderRadius:12, border:"1px solid rgba(248,113,113,0.25)", background:"rgba(248,113,113,0.08)", color:"#f87171", cursor:"pointer", fontSize:10, fontWeight:500 }}>Clear All</button>}
          {capVal > 0 && (
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:10, color:theme.textFaint }}>Capital:</span>
              <span style={{ fontSize:11, fontWeight:600, color:"#eab308", fontFamily:"'JetBrains Mono', monospace" }}>${capVal.toLocaleString()}</span>
              {accountFilter !== "All" && <span style={{ fontSize:9, color:theme.textFaintest }}>({accountFilter})</span>}
            </div>
          )}
        </div>

        {/* Date range filter */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:10, color:theme.textFaint, minWidth:62, textTransform:"uppercase", letterSpacing:0.6 }}>Period</span>
          {[{id:"all",label:"All Time"},{id:"today",label:"Today"},{id:"this_week",label:"This Week"},{id:"this_month",label:"This Month"},{id:"last_30",label:"Last 30d"},{id:"last_90",label:"Last 90d"},{id:"ytd",label:"YTD"},{id:"custom",label:"Custom"}].map(dr => (
            <FilterPill key={dr.id} label={dr.label} active={dateRangePreset===dr.id} onClick={()=>setDateRangePreset(dateRangePreset===dr.id && dr.id!=="all" ? "all" : dr.id)} color="#34d399"/>
          ))}
          {dateRangePreset === "custom" && (
            <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:4 }}>
              <input type="date" value={customDateFrom} onChange={e=>setCustomDateFrom(e.target.value)} style={{ padding:"4px 8px", background:theme.inputBg, border:"1px solid rgba(52,211,153,0.25)", borderRadius:6, color:theme.text, fontSize:11, outline:"none" }}/>
              <span style={{ fontSize:10, color:theme.textFaintest }}>to</span>
              <input type="date" value={customDateTo} onChange={e=>setCustomDateTo(e.target.value)} style={{ padding:"4px 8px", background:theme.inputBg, border:"1px solid rgba(52,211,153,0.25)", borderRadius:6, color:theme.text, fontSize:11, outline:"none" }}/>
            </div>
          )}
        </div>

        {/* Account filter */}
        {uniqueAccounts.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, color:theme.textFaint, minWidth:62, textTransform:"uppercase", letterSpacing:0.6 }}>Account</span>
            <FilterPill label="All" active={accountFilter==="All"} onClick={()=>setAccountFilter("All")}/>
            {uniqueAccounts.map(a => <FilterPill key={a} label={a} active={accountFilter===a} onClick={()=>setAccountFilter(accountFilter===a?"All":a)} color="#60a5fa"/>)}
          </div>
        )}

        {/* Asset type filter */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:10, color:theme.textFaint, minWidth:62, textTransform:"uppercase", letterSpacing:0.6 }}>Asset</span>
          <FilterPill label="All" active={assetFilter==="All"} onClick={()=>setAssetFilter("All")}/>
          {ASSET_TYPES.map(a => <FilterPill key={a} label={a} active={assetFilter===a} onClick={()=>setAssetFilter(assetFilter===a?"All":a)} color={a==="Stock"?"#4ade80":a==="Options"?"#a78bfa":"#eab308"}/>)}
        </div>

        {/* Direction filter */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:10, color:theme.textFaint, minWidth:62, textTransform:"uppercase", letterSpacing:0.6 }}>Direction</span>
          <FilterPill label="All" active={directionFilter==="All"} onClick={()=>setDirectionFilter("All")}/>
          <FilterPill label="Long" active={directionFilter==="Long"} onClick={()=>setDirectionFilter(directionFilter==="Long"?"All":"Long")} color="#60a5fa"/>
          <FilterPill label="Short" active={directionFilter==="Short"} onClick={()=>setDirectionFilter(directionFilter==="Short"?"All":"Short")} color="#f472b6"/>
        </div>

        {/* Strategy filter */}
        {uniqueStrategies.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, color:theme.textFaint, minWidth:62, textTransform:"uppercase", letterSpacing:0.6 }}>Strategy</span>
            <FilterPill label="All" active={strategyFilter==="All"} onClick={()=>setStrategyFilter("All")}/>
            {uniqueStrategies.map(s => <FilterPill key={s} label={s} active={strategyFilter===s} onClick={()=>setStrategyFilter(strategyFilter===s?"All":s)} color="#c084fc"/>)}
          </div>
        )}

        {/* Timeframe filter */}
        {uniqueTimeframes.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, color:theme.textFaint, minWidth:62, textTransform:"uppercase", letterSpacing:0.6 }}>Timeframe</span>
            <FilterPill label="All" active={timeframeFilter==="All"} onClick={()=>setTimeframeFilter("All")}/>
            {uniqueTimeframes.map(tf => <FilterPill key={tf} label={tf} active={timeframeFilter===tf} onClick={()=>setTimeframeFilter(timeframeFilter===tf?"All":tf)} color="#fb923c"/>)}
          </div>
        )}
      </div>}

      {/* ═══════ STAT CARDS ═══════ */}
      {wVis("stats") && <div className="tp-stat-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(195px, 1fr))", gap:12, marginBottom:18, order:wOrder("stats") }}>
        <StatCard label="Total P&L" value={pnlMode==="percent"&&capVal>0 ? fmtPct((stats.totalPnL/capVal)*100) : fmt(stats.totalPnL)} sub={`${stats.closed.length} closed · ${stats.open.length} open`} color={stats.totalPnL>=0?"#4ade80":"#f87171"} icon={TrendingUp}/>
        <StatCard label="Win Rate" value={fmtPct(stats.winRate)} sub={`${stats.wins.length}W / ${stats.losses.length}L`} color="#60a5fa" icon={Target}/>
        <StatCard label="Avg Win" value={fmt(stats.avgWin)} sub="per winning trade" color="#4ade80" icon={Award}/>
        <StatCard label="Avg Loss" value={fmt(stats.avgLoss)} sub="per losing trade" color="#f87171" icon={Activity}/>
        <StatCard label="Profit Factor" value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} sub="win $ / loss $" color="#a78bfa" icon={Layers}/>
      </div>}

      {/* ═══════ SECONDARY STATS ROW ═══════ */}
      {wVis("secondary") && <div style={{ ...panel(), marginBottom:18, padding:"10px 16px", order:wOrder("secondary") }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(110px, 1fr))", gap:0, alignItems:"center" }}>
          <MiniStat label="Best Trade" value={stats.bestTrade ? fmt(stats.bestTrade.pnl) : "—"} color="#4ade80" sub={stats.bestTrade?.ticker}/>
          <MiniStat label="Worst Trade" value={stats.worstTrade ? fmt(stats.worstTrade.pnl) : "—"} color="#f87171" sub={stats.worstTrade?.ticker}/>
          <MiniStat label="Max Drawdown" value={fmt(-stats.maxDD)} color="#f87171"/>
          <MiniStat label="Current Streak" value={stats.currentStreak > 0 ? `${stats.currentStreak}W` : stats.currentStreak < 0 ? `${Math.abs(stats.currentStreak)}L` : "—"} color={stats.currentStreak > 0 ? "#4ade80" : stats.currentStreak < 0 ? "#f87171" : "#5c6070"}/>
          <MiniStat label="Best Streak" value={stats.maxWinStreak > 0 ? `${stats.maxWinStreak}W` : "—"} color="#4ade80"/>
          <MiniStat label="Worst Streak" value={stats.maxLoseStreak > 0 ? `${stats.maxLoseStreak}L` : "—"} color="#f87171"/>
          {Object.entries(stats.byAsset).map(([k,v]) => (
            <MiniStat key={k} label={k} value={fmt(v)} color={v>=0?"#4ade80":"#f87171"} sub={`${stats.closed.filter(t=>t.assetType===k).length} trades`}/>
          ))}
        </div>
      </div>}

      {/* ═══════ CHART SECTION ═══════ */}
      {wVis("chart") && stats.closed.length > 0 && (
        <div style={{ ...panel(), marginBottom:18, order:wOrder("chart") }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <BarChart3 size={15} color="#8a8f9e"/>
              <span style={{ fontSize:13, color:theme.textMuted, fontWeight:500 }}>
                {chartType === "equity" ? "Equity Curve" : chartType === "balance" ? "Account Balance" : chartType === "daily" ? "Daily P&L" : chartType === "weekly" ? "Weekly P&L" : "Monthly P&L"}
                {chartAccountFilter !== "All" && <span style={{ fontSize:11, color:"#60a5fa", marginLeft:6 }}>— {chartAccountFilter}</span>}
              </span>
            </div>
            <div style={{ display:"flex", gap:4 }}>
              {/* Chart type toggles */}
              {[{id:"equity",label:"Equity"},{id:"balance",label:"Balance"},{id:"daily",label:"Daily"},{id:"weekly",label:"Weekly"},{id:"monthly",label:"Monthly"}].filter(ct => ct.id !== "balance" || chartCapVal > 0).map(ct => (
                <button key={ct.id} onClick={()=>setChartType(ct.id)} style={{
                  padding:"4px 12px", borderRadius:6, border:"none",
                  background: chartType===ct.id ? "rgba(99,102,241,0.18)" : "var(--tp-card)",
                  color: chartType===ct.id ? "#a5b4fc" : "#5c6070", cursor:"pointer", fontSize:11, fontWeight: chartType===ct.id ? 600 : 400
                }}>{ct.label}</button>
              ))}
              <div style={{ width:1, background:"var(--tp-border-l)", margin:"0 4px" }}/>
              {/* $ / % toggle */}
              <button onClick={()=>setPnlMode(pnlMode==="dollar"?"percent":"dollar")} style={{
                padding:"4px 10px", borderRadius:6, border:"1px solid rgba(234,179,8,0.2)",
                background: pnlMode==="percent" ? "rgba(234,179,8,0.12)" : "transparent",
                color:"#eab308", cursor:"pointer", fontSize:11, fontWeight:500, display:"flex", alignItems:"center", gap:3
              }}>
                {pnlMode==="dollar" ? <><DollarSign size={10}/> $</> : <><Percent size={10}/> %</>}
              </button>
            </div>
          </div>

          {/* Chart-level account filter */}
          {uniqueAccounts.length > 0 && (
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12, flexWrap:"wrap" }}>
              <span style={{ fontSize:10, color:theme.textFaint, textTransform:"uppercase", letterSpacing:0.6 }}>Account</span>
              <button onClick={()=>setChartAccountFilter("All")} style={{
                padding:"4px 12px", borderRadius:14, border:`1px solid ${chartAccountFilter==="All" ? "#6366f1" : "var(--tp-border-l)"}`,
                background: chartAccountFilter==="All" ? "rgba(99,102,241,0.12)" : "var(--tp-card)",
                color: chartAccountFilter==="All" ? "#a5b4fc" : "#5c6070", cursor:"pointer", fontSize:11, fontWeight: chartAccountFilter==="All" ? 600 : 400
              }}>All Accounts</button>
              {uniqueAccounts.map(a => {
                const isActive = chartAccountFilter === a;
                const acctBal = accountBalances[a];
                return (
                  <button key={a} onClick={()=>setChartAccountFilter(isActive ? "All" : a)} style={{
                    padding:"4px 12px", borderRadius:14, border:`1px solid ${isActive ? "#60a5fa" : "var(--tp-border-l)"}`,
                    background: isActive ? "rgba(96,165,250,0.12)" : "var(--tp-card)",
                    color: isActive ? "#60a5fa" : "#6b7080", cursor:"pointer", fontSize:11, fontWeight: isActive ? 600 : 400,
                    display:"flex", alignItems:"center", gap:5
                  }}>
                    {a}
                    {acctBal !== undefined && <span style={{ fontSize:9, color: isActive ? "rgba(96,165,250,0.7)" : "#4a4e5a", fontFamily:"'JetBrains Mono', monospace" }}>${parseFloat(acctBal).toLocaleString()}</span>}
                  </button>
                );
              })}
              {chartAccountFilter !== "All" && (
                <span style={{ fontSize:10, color:theme.textFaintest, marginLeft:4, fontStyle:"italic" }}>
                  Showing {chartAccountFilter} only on chart
                </span>
              )}
            </div>
          )}

          {pnlMode === "percent" && chartCapVal === 0 && (
            <div style={{ padding:"10px 14px", marginBottom:14, borderRadius:8, background:"rgba(234,179,8,0.08)", border:"1px solid rgba(234,179,8,0.15)", fontSize:12, color:"#eab308", display:"flex", alignItems:"center", gap:8 }}>
              <DollarSign size={14}/> Set account starting balances in Settings → Account Balances to see % returns.
            </div>
          )}

          <ResponsiveContainer width="100%" height={220}>
            {isBarChart ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--tp-input)"/>
                <XAxis dataKey={chartType==="weekly"||chartType==="monthly"?"label":"date"} tick={{fill:"#5c6070",fontSize:10}} axisLine={false} tickLine={false} interval={chartData.length > 20 ? Math.floor(chartData.length/12) : 0}/>
                <YAxis tick={{fill:"#5c6070",fontSize:10}} axisLine={false} tickLine={false} tickFormatter={yTickFmt}/>
                <Tooltip contentStyle={{background:theme.tooltipBg,border:`1px solid ${theme.borderLight}`,borderRadius:8,color:theme.text,fontSize:12}} formatter={v=>[chartFormatter(v),"P&L"]}/>
                <Bar dataKey={chartDataKey} radius={[3,3,0,0]}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry[chartDataKey] >= 0 ? "#4ade80" : "#f87171"}/>
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="eqGradDash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isBalanceView?"#4ade80":"#6366f1"} stopOpacity={0.35}/>
                    <stop offset="100%" stopColor={isBalanceView?"#4ade80":"#6366f1"} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--tp-input)"/>
                <XAxis dataKey="date" tick={{fill:"#5c6070",fontSize:10}} axisLine={false} tickLine={false} interval={chartData.length > 20 ? Math.floor(chartData.length/12) : 0}/>
                <YAxis tick={{fill:"#5c6070",fontSize:10}} axisLine={false} tickLine={false} tickFormatter={isBalanceView ? (v=>"$"+v.toLocaleString()) : yTickFmt}/>
                <Tooltip contentStyle={{background:theme.tooltipBg,border:`1px solid ${theme.borderLight}`,borderRadius:8,color:theme.text,fontSize:12}} formatter={v=>[isBalanceView ? "$"+parseFloat(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : chartFormatter(v), isBalanceView?"Balance":"Equity"]}/>
                <Area type="monotone" dataKey={isBalanceView?"balance":chartDataKey} stroke={isBalanceView?"#4ade80":"#6366f1"} strokeWidth={2} fill="url(#eqGradDash)"/>
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* ═══════ CALENDAR HEATMAP ═══════ */}
      {wVis("calendar") && stats.closed.length > 0 && (
        <div style={{ ...panel(), marginBottom:18, order:wOrder("calendar") }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Calendar size={15} color="#8a8f9e"/>
              <span style={{ fontSize:13, color:theme.textMuted, fontWeight:500 }}>P&L Calendar</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <button onClick={prevMonth} style={{ background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:6, color:theme.textMuted, cursor:"pointer", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}><ChevronLeft size={14}/></button>
              <button onClick={()=>{setCalendarMonth(new Date().getMonth());setCalendarYear(new Date().getFullYear());}} style={{ padding:"4px 12px", borderRadius:6, border:"1px solid rgba(99,102,241,0.2)", background:"rgba(99,102,241,0.08)", color:"#a5b4fc", cursor:"pointer", fontSize:10, fontWeight:500 }}>Today</button>
              <button onClick={nextMonth} style={{ background:theme.inputBg, border:`1px solid ${theme.borderLight}`, borderRadius:6, color:theme.textMuted, cursor:"pointer", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}><ChevronRight size={14}/></button>
            </div>
          </div>
          <CalendarHeatmap dailyMap={stats.dailyMap} month={calendarMonth} year={calendarYear} startingCapital={capVal}/>
          
          {/* Month legend */}
          <div style={{ display:"flex", justifyContent:"center", gap:16, marginTop:14, paddingTop:12, borderTop:"1px solid var(--tp-border)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:10, height:10, borderRadius:2, background:"rgba(248,113,113,0.5)" }}/><span style={{ fontSize:10, color:theme.textFaint }}>Loss</span></div>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:10, height:10, borderRadius:2, background:theme.inputBg }}/><span style={{ fontSize:10, color:theme.textFaint }}>Break-even</span></div>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:10, height:10, borderRadius:2, background:"rgba(74,222,128,0.5)" }}/><span style={{ fontSize:10, color:theme.textFaint }}>Win</span></div>
          </div>
        </div>
      )}

      {/* ═══════ DAILY BREAKDOWN TABLE ═══════ */}
      {wVis("breakdown") && stats.dailyData.length > 0 && (
        <div style={{ ...panel(), order:wOrder("breakdown") }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <Zap size={15} color="#8a8f9e"/>
            <span style={{ fontSize:13, color:theme.textMuted, fontWeight:500 }}>Daily & Monthly Breakdown</span>
          </div>

          {/* Monthly summary table */}
          {stats.monthlyData.length > 0 && (
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:11, color:theme.textFaint, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8, fontWeight:600 }}>Monthly Summary</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:8 }}>
                {stats.monthlyData.map(m => (
                  <div key={m.date} style={{
                    background: m.pnl >= 0 ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)",
                    border:`1px solid ${m.pnl >= 0 ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}`,
                    borderRadius:8, padding:"10px 12px"
                  }}>
                    <div style={{ fontSize:11, color:theme.textMuted, marginBottom:4 }}>{m.label}</div>
                    <div style={{ fontSize:16, fontWeight:700, color: m.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(m.pnl)}</div>
                    {capVal > 0 && <div style={{ fontSize:11, color: m.pct >= 0 ? "rgba(74,222,128,0.65)" : "rgba(248,113,113,0.65)", fontFamily:"'JetBrains Mono', monospace", marginTop:2 }}>{fmtPct(m.pct)}</div>}
                    <div style={{ fontSize:10, color:theme.textFaintest, marginTop:3 }}>{stats.closed.filter(t=>t.date.startsWith(m.date)).length} trades</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent daily P&L list */}
          <div style={{ fontSize:11, color:theme.textFaint, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8, fontWeight:600 }}>Recent Daily P&L</div>
          <div style={{ maxHeight:260, overflowY:"auto", paddingRight:4 }}>
            {[...stats.dailyData].reverse().slice(0,30).map(d => {
              const dayTrades = stats.closed.filter(t=>t.date===d.date);
              const dayOfWeek = new Date(d.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"});
              return (
                <div key={d.date} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 10px", borderBottom:`1px solid ${theme.borderFaint}`, transition:"background 0.15s" }}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--tp-card)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:11, color:theme.textFaint, minWidth:32 }}>{dayOfWeek}</span>
                    <span style={{ fontSize:12, color:theme.textSecondary }}>{d.date}</span>
                    <span style={{ fontSize:10, color:theme.textFaintest }}>{dayTrades.length} trade{dayTrades.length!==1?"s":""}</span>
                    <div style={{ display:"flex", gap:3 }}>
                      {[...new Set(dayTrades.map(t=>t.ticker))].slice(0,4).map(tk => (
                        <span key={tk} style={{ fontSize:9, color:theme.textFaint, background:theme.inputBg, padding:"1px 5px", borderRadius:3 }}>{tk}</span>
                      ))}
                      {[...new Set(dayTrades.map(t=>t.ticker))].length > 4 && <span style={{ fontSize:9, color:theme.textFaintest }}>+{[...new Set(dayTrades.map(t=>t.ticker))].length - 4}</span>}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:13, fontWeight:700, color: d.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(d.pnl)}</span>
                    {capVal > 0 && <span style={{ fontSize:10, color: d.pct >= 0 ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)", fontFamily:"'JetBrains Mono', monospace", minWidth:48, textAlign:"right" }}>{fmtPct(d.pct)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════ EMPTY STATE ═══════ */}
      {stats.closed.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:theme.textFaint }}>
          <Activity size={48} style={{ margin:"0 auto 16px", opacity:0.4 }}/>
          <p style={{ margin:0, fontSize:15 }}>
            {activeFilterCount > 0 ? "No closed trades match your filters." : "No closed trades yet. Start logging trades to see your dashboard."}
          </p>
          {activeFilterCount > 0 && <button onClick={()=>{setAccountFilter("All");setAssetFilter("All");setStrategyFilter("All");setDirectionFilter("All");setTimeframeFilter("All");setDateRangePreset("all");setCustomDateFrom("");setCustomDateTo("");}} style={{ marginTop:12, padding:"8px 18px", borderRadius:8, border:"1px solid rgba(99,102,241,0.3)", background:"rgba(99,102,241,0.1)", color:"#a5b4fc", cursor:"pointer", fontSize:13, fontWeight:500 }}>Clear Filters</button>}
        </div>
      )}
    </div>
  );
}

// ─── TRADE LOG ────────────────────────────────────────────────────────────────
function TradeLog({ trades, onEdit, onDelete, prefs }) {
  const [filter, setFilter] = useState({ type:"All", direction:"All", status:"All", account:"All" });
  const [sort, setSort] = useState({ key:"date", dir:-1 });
  const [search, setSearch] = useState("");

  const uniqueAccounts = useMemo(() => [...new Set(trades.filter(t => t.account).map(t => t.account))].sort(), [trades]);

  // Live-enrich closed options trades so P&L always reflects current leg data
  const enriched = useMemo(() => trades.map(t => {
    if (t.status === "Closed" && t.assetType === "Options" && t.legs && t.legs.length > 0) return { ...t, pnl: calcPnL(t) };
    return t;
  }), [trades]);

  const filtered = enriched.filter(t => {
    if (filter.type !== "All" && t.assetType !== filter.type) return false;
    if (filter.direction !== "All" && t.direction !== filter.direction) return false;
    if (filter.status !== "All" && t.status !== filter.status) return false;
    if (filter.account !== "All" && t.account !== filter.account) return false;
    if (search && !t.ticker.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const sorted = [...filtered].sort((a,b) => {
    let av = a[sort.key], bv = b[sort.key];
    if (sort.key === "date") { av = new Date(av); bv = new Date(bv); }
    if (sort.key === "pnl") { av = av ?? -Infinity; bv = bv ?? -Infinity; }
    if (av < bv) return -1*sort.dir; if (av > bv) return 1*sort.dir; return 0;
  });
  const toggleSort = k => setSort(s => s.key===k ? {key:k,dir:s.dir*-1} : {key:k,dir:-1});
  const gradeColor = g => { if(!g) return "#5c6070"; if(g.startsWith("A")) return "#4ade80"; if(g==="B+"||g==="B") return "#60a5fa"; if(g==="C") return "#eab308"; return "#f87171"; };
  const colStyle = (flex=1) => ({ flex, display:"flex", alignItems:"center", fontSize:13, color:"var(--tp-text2)", padding:"0 8px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" });
  const headerStyle = (flex=1) => ({ flex, fontSize:10.5, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, padding:"0 8px", cursor:"pointer", userSelect:"none" });

  const strategyLabel = (t) => {
    if (t.assetType === "Options" && t.optionsStrategyType) return t.optionsStrategyType;
    return t.strategy || "—";
  };

  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ position:"relative", flex:"1 1 180px", minWidth:160 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ticker…" style={{ width:"100%", padding:"8px 12px 8px 36px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
          <Filter size={14} color="#5c6070" style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)" }}/>
        </div>
        {[{label:"Type",key:"type",options:["All",...ASSET_TYPES]},{label:"Direction",key:"direction",options:["All",...DIRECTIONS]},{label:"Status",key:"status",options:["All",...STATUSES]},{label:"Account",key:"account",options:["All",...uniqueAccounts]}].map(f=>(
          <select key={f.key} value={filter[f.key]} onChange={e=>setFilter(p=>({...p,[f.key]:e.target.value}))} style={{ padding:"8px 28px 8px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-muted)", fontSize:12, outline:"none", cursor:"pointer", appearance:"none" }}>
            {f.options.map(o=><option key={o} value={o} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>{o==="All"?`All ${f.label}`:o}</option>)}
          </select>
        ))}
      </div>

      {/* Table header */}
      <div style={{ display:"flex", borderBottom:"1px solid var(--tp-border)", paddingBottom:8, marginBottom:4 }}>
        <div style={headerStyle(0.7)} onClick={()=>toggleSort("date")}>Date {sort.key==="date"?(sort.dir===-1?"↓":"↑"):""}</div>
        <div style={headerStyle(1)} onClick={()=>toggleSort("ticker")}>Ticker</div>
        <div style={headerStyle(1.1)}>Strategy</div>
        <div style={headerStyle(0.6)}>Dir</div>
        <div style={headerStyle(0.65)}>Entry</div>
        <div style={headerStyle(0.65)}>Exit</div>
        <div style={headerStyle(0.5)}>Qty</div>
        <div style={headerStyle(0.75)} onClick={()=>toggleSort("pnl")}>P&L {sort.key==="pnl"?(sort.dir===-1?"↓":"↑"):""}</div>
        <div style={headerStyle(0.45)}>Grade</div>
        <div style={{ flex:0.5 }}/>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign:"center", padding:"50px 20px", color:"var(--tp-faint)" }}><List size={36} style={{ margin:"0 auto 12px", opacity:0.4 }}/><p style={{ margin:0, fontSize:14 }}>No trades match your filters.</p></div>
      ) : sorted.map((t, i) => {
        const isPos = t.pnl !== null && t.pnl > 0, isNeg = t.pnl !== null && t.pnl < 0;
        const resets = prefs?.accountResets || {};
        const isArchived = t.account && resets[t.account]?.resetDate && t.date < resets[t.account].resetDate;
        const isMultiLeg = t.assetType === "Options" && t.legs && t.legs.length > 1;
        const isOptions = t.assetType === "Options" && t.legs && t.legs.length > 0;
        let entryDisp, exitDisp, qtyDisp;
        if (isOptions) {
          // Show net entry/exit premium and total contracts
          const totalContracts = t.legs.reduce((s, l) => s + (parseInt(l.contracts) || 1), 0);
          const netEntry = t.legs.reduce((s, l) => {
            const p = parseFloat(l.entryPremium) || 0;
            return s + (l.action === "Sell" ? -p : p);
          }, 0);
          const netExit = t.legs.reduce((s, l) => {
            const p = parseFloat(l.exitPremium) || 0;
            return s + (l.action === "Sell" ? -p : p);
          }, 0);
          const hasExit = t.legs.some(l => (l.partialCloses && l.partialCloses.length > 0) || (l.exitPremium && parseFloat(l.exitPremium) > 0));
          const totalClosed = t.legs.reduce((s, l) => s + (l.partialCloses || []).reduce((s2, pc) => s2 + (parseInt(pc.qty) || 0), 0), 0);
          const totalOpen = totalContracts - totalClosed;
          entryDisp = netEntry !== 0 ? `$${Math.abs(netEntry).toFixed(2)}` : (t.entryPrice || "—");
          exitDisp = hasExit ? (totalOpen > 0 ? `${totalClosed}/${totalContracts}` : `$${Math.abs(netExit).toFixed(2)}`) : (t.exitPrice || "—");
          qtyDisp = isMultiLeg ? `${totalContracts}×${t.legs.length}L` : `${totalContracts}`;
        } else {
          entryDisp = t.entryPrice || "—";
          exitDisp = t.exitPrice || "—";
          qtyDisp = t.quantity || "—";
        }

        return (
          <div key={t.id} style={{ display:"flex", alignItems:"center", padding:"10px 0", borderBottom:"1px solid var(--tp-border)", background:i%2===0?"var(--tp-card)":"transparent", borderRadius:6, cursor:"pointer", transition:"background 0.15s", opacity: isArchived ? 0.4 : 1, position:"relative" }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(99,102,241,0.07)"; if(isArchived) e.currentTarget.style.opacity="0.7";}} onMouseLeave={e=>{e.currentTarget.style.background=i%2===0?"var(--tp-card)":"transparent"; if(isArchived) e.currentTarget.style.opacity="0.4";}}
            onClick={()=>onEdit(t)}>
            {isArchived && <span style={{ position:"absolute", left:4, top:3, fontSize:7, color:"#eab308", background:"rgba(234,179,8,0.15)", padding:"1px 4px", borderRadius:3, fontWeight:600, letterSpacing:0.3 }}>ARCHIVED</span>}
            <div style={colStyle(0.7)}><span style={{ color:"var(--tp-faint)", fontSize:12 }}>{t.date?.slice(5)}{t.exitDate && t.exitDate !== t.date ? <span style={{ color:"var(--tp-faintest)" }}>{" → "}{t.exitDate.slice(5)}</span> : ""}</span></div>
            <div style={colStyle(1)}>
              <span style={{ fontWeight:600, color:"var(--tp-text)" }}>{t.ticker}</span>
              {t.assetType==="Options" && <span style={{ fontSize:10, color:"#6366f1", marginLeft:6, background:"rgba(99,102,241,0.15)", padding:"2px 6px", borderRadius:4 }}>OPT</span>}
              {t.assetType==="Futures" && <span style={{ fontSize:10, color:"#eab308", marginLeft:6, background:"rgba(234,179,8,0.15)", padding:"2px 6px", borderRadius:4 }}>FUT</span>}
              {(t.screenshots && t.screenshots.length > 0) && <Camera size={10} color="#6b7080" style={{ marginLeft:5, opacity:0.7 }}/>}
            </div>
            <div style={colStyle(1.1)}>
              <span style={{ color:"var(--tp-muted)", fontSize:12 }}>{strategyLabel(t)}</span>
              {isMultiLeg && <span style={{ fontSize:9, color:"#6366f1", marginLeft:5, background:"rgba(99,102,241,0.12)", padding:"1px 5px", borderRadius:3 }}>{t.legs.length}L</span>}
            </div>
            <div style={colStyle(0.6)}>
              {isMultiLeg ? <span style={{ fontSize:10, color:"var(--tp-faint)" }}>—</span> : <span style={{ fontSize:11, fontWeight:600, color:t.direction==="Long"?"#60a5fa":"#f472b6", background:t.direction==="Long"?"rgba(96,165,250,0.12)":"rgba(244,114,182,0.12)", padding:"2px 7px", borderRadius:4 }}>{t.direction}</span>}
            </div>
            <div style={colStyle(0.65)}><span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:12, color:"var(--tp-text2)" }}>{entryDisp}</span></div>
            <div style={colStyle(0.65)}><span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:12, color:"var(--tp-text2)" }}>{exitDisp}</span></div>
            <div style={colStyle(0.5)}><span style={{ fontSize:12, color:"var(--tp-muted)" }}>{qtyDisp}</span></div>
            <div style={colStyle(0.75)}>
              <span style={{ fontFamily:"'JetBrains Mono', monospace", fontWeight:600, fontSize:13, color:isPos?"#4ade80":isNeg?"#f87171":"#5c6070" }}>
                {t.pnl !== null ? fmt(t.pnl) : t.status==="Open" ? <span style={{ color:"#eab308", fontSize:11 }}>Open</span> : "—"}
              </span>
            </div>
            <div style={colStyle(0.45)}>{t.grade && <span style={{ fontSize:12, fontWeight:700, color:gradeColor(t.grade) }}>{t.grade}</span>}</div>
            <div style={{ flex:0.5, display:"flex", justifyContent:"center" }}>
              <button onClick={e=>{e.stopPropagation();onDelete(t.id);}} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--tp-faint)", padding:4 }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><Trash2 size={14}/></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── WATCHLIST TICKER MODAL ───────────────────────────────────────────────────
function TickerModal({ onSave, onClose, editItem }) {
  const [item, setItem] = useState(editItem || { id:Date.now(), ticker:"", assetType:"Stock", direction:"Long", entryCriteria:"", exitCriteria:"", notes:"", priority:"Medium" });
  const set = k => v => setItem(p=>({...p,[k]:v}));
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(3px)" }}>
      <div style={{ background:"var(--tp-sel-bg)", borderRadius:16, width:"min(96vw, 520px)", padding:28, border:"1px solid var(--tp-border-l)", boxShadow:"0 24px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <h3 style={{ color:"var(--tp-text)", fontSize:17, fontWeight:600, margin:0 }}>{editItem?"Edit Ticker Plan":"Add Ticker"}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={20}/></button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1.6fr 1fr 1fr 0.8fr", gap:10, marginBottom:14 }}>
          <Input label="Ticker" value={item.ticker} onChange={v=>set("ticker")(v.toUpperCase())} placeholder="TSLA"/>
          <Input label="Asset Type" value={item.assetType} onChange={set("assetType")} options={ASSET_TYPES}/>
          <Input label="Direction" value={item.direction} onChange={set("direction")} options={DIRECTIONS}/>
          <Input label="Priority" value={item.priority} onChange={set("priority")} options={["High","Medium","Low"]}/>
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:11, color:"#4ade80", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5, fontWeight:600 }}>📈 Entry Criteria</label>
          <textarea value={item.entryCriteria} onChange={e=>set("entryCriteria")(e.target.value)} placeholder="e.g. Price breaks above $180 with volume confirmation…" rows={3} style={{ width:"100%", padding:"10px 12px", background:"rgba(74,222,128,0.05)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", lineHeight:1.5 }}/>
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:11, color:"#f87171", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5, fontWeight:600 }}>📉 Exit Criteria</label>
          <textarea value={item.exitCriteria} onChange={e=>set("exitCriteria")(e.target.value)} placeholder="e.g. Take profit at $195. Stop loss at $172…" rows={3} style={{ width:"100%", padding:"10px 12px", background:"rgba(248,113,113,0.05)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", lineHeight:1.5 }}/>
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 }}>Additional Notes</label>
          <textarea value={item.notes} onChange={e=>set("notes")(e.target.value)} placeholder="Earnings date, catalysts…" rows={2} style={{ width:"100%", padding:"10px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", lineHeight:1.5 }}/>
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
          <button onClick={onClose} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Cancel</button>
          <button onClick={()=>{if(item.ticker.trim()) onSave(item);}} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}>{editItem?"Update":"Add Ticker"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── WATCHLIST ────────────────────────────────────────────────────────────────
function Watchlist({ watchlists, onSave, onPromoteTrade }) {
  const [selectedWeek, setSelectedWeek] = useState(getWeekStart());
  const [showTickerModal, setShowTickerModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [addingSector, setAddingSector] = useState(null);
  const [collapsedSectors, setCollapsedSectors] = useState({});
  const [newSectorInput, setNewSectorInput] = useState("");
  const [showNewSector, setShowNewSector] = useState(false);

  const current = watchlists.find(w=>w.weekStart===selectedWeek) || { weekStart:selectedWeek, sectors:[] };
  const toggleCollapse = s => setCollapsedSectors(p=>({...p,[s]:!p[s]}));
  const persistWatchlist = upd => { const idx=watchlists.findIndex(w=>w.weekStart===selectedWeek); const u=idx>=0?[...watchlists]:[...watchlists,upd]; if(idx>=0) u[idx]=upd; onSave(u); };
  const addSector = () => { const n=newSectorInput.trim(); if(!n||current.sectors.find(s=>s.name.toLowerCase()===n.toLowerCase())) return; persistWatchlist({...current,sectors:[...current.sectors,{name:n,tickers:[]}]}); setNewSectorInput(""); setShowNewSector(false); };
  const deleteSector = sn => persistWatchlist({...current,sectors:current.sectors.filter(s=>s.name!==sn)});
  const handleTickerSave = item => { const sn=addingSector||(editingItem&&editingItem._sector); const sectors=current.sectors.map(s=>{ if(s.name!==sn) return s; if(editingItem&&editingItem.id===item.id) return {...s,tickers:s.tickers.map(t=>t.id===item.id?item:t)}; return {...s,tickers:[...s.tickers,item]}; }); persistWatchlist({...current,sectors}); setShowTickerModal(false); setEditingItem(null); setAddingSector(null); };
  const deleteTicker = (sn,id) => persistWatchlist({...current,sectors:current.sectors.map(s=>s.name===sn?{...s,tickers:s.tickers.filter(t=>t.id!==id)}:s)});

  const priorityColor = p => ({High:"#f87171",Medium:"#eab308",Low:"#60a5fa"}[p]||"#5c6070");
  const priorityBg = p => ({High:"rgba(248,113,113,0.12)",Medium:"rgba(234,179,8,0.12)",Low:"rgba(96,165,250,0.12)"}[p]||"");
  const prevWeek = () => { const d=new Date(selectedWeek); d.setDate(d.getDate()-7); setSelectedWeek(d.toISOString().split("T")[0]); };
  const nextWeek = () => { const d=new Date(selectedWeek); d.setDate(d.getDate()+7); setSelectedWeek(d.toISOString().split("T")[0]); };
  const isCurrentWeek = selectedWeek===getWeekStart();

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={prevWeek} style={{ background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-muted)", cursor:"pointer", width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center" }}><ChevronRight size={16} style={{ transform:"rotate(180deg)" }}/></button>
          <div style={{ textAlign:"center" }}><div style={{ fontSize:15, fontWeight:600, color:"var(--tp-text)" }}>{formatWeekLabel(selectedWeek)}</div>{isCurrentWeek && <span style={{ fontSize:10, color:"#6366f1", textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>● Current Week</span>}</div>
          <button onClick={nextWeek} style={{ background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-muted)", cursor:"pointer", width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center" }}><ChevronRight size={16}/></button>
        </div>
        <button onClick={()=>setShowNewSector(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:12, fontWeight:500 }}><Plus size={13}/> Add Sector</button>
      </div>

      {showNewSector && (
        <div style={{ background:"rgba(30,32,38,0.9)", border:"1px solid rgba(99,102,241,0.25)", borderRadius:10, padding:"14px 16px", marginBottom:16, display:"flex", gap:10, alignItems:"center" }}>
          <select value={newSectorInput} onChange={e=>setNewSectorInput(e.target.value)} style={{ flex:1, padding:"8px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:newSectorInput?"#fff":"#5c6070", fontSize:13, outline:"none", appearance:"none", cursor:"pointer" }}>
            <option value="" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-faint)" }}>Select a sector…</option>
            {SECTORS.filter(s=>!current.sectors.find(cs=>cs.name.toLowerCase()===s.toLowerCase())).map(s=><option key={s} value={s} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>{s}</option>)}
            <option value="__custom__" style={{ background:"var(--tp-sel-bg)", color:"#6366f1" }}>+ Custom Sector…</option>
          </select>
          {newSectorInput==="__custom__" && <input autoFocus placeholder="Sector name" onChange={e=>setNewSectorInput(e.target.value===""?"__custom__":e.target.value)} style={{ flex:1, padding:"8px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none" }}/>}
          <button onClick={addSector} style={{ padding:"8px 18px", borderRadius:8, border:"none", background:"#6366f1", color:"var(--tp-text)", cursor:"pointer", fontSize:12, fontWeight:600 }}>Add</button>
          <button onClick={()=>{setShowNewSector(false);setNewSectorInput("");}} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={18}/></button>
        </div>
      )}

      {current.sectors.length===0 && <div style={{ textAlign:"center", padding:"70px 20px", color:"var(--tp-faint)" }}><Crosshair size={44} style={{ margin:"0 auto 16px", opacity:0.35 }}/><p style={{ margin:0, fontSize:15, lineHeight:1.6 }}>No sectors yet for this week.<br/><span style={{ fontSize:13 }}>Add a sector above, then add tickers with your trade plans.</span></p></div>}

      {current.sectors.map(sector => {
        const isCollapsed = collapsedSectors[sector.name];
        return (
          <div key={sector.name} style={{ marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"2px solid rgba(99,102,241,0.25)", marginBottom:isCollapsed?0:10, cursor:"pointer" }} onClick={()=>toggleCollapse(sector.name)}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                {isCollapsed?<ChevronRight size={15} color="#6366f1"/>:<ChevronDown size={15} color="#6366f1"/>}
                <span style={{ fontSize:14, fontWeight:600, color:"#a5b4fc", textTransform:"uppercase", letterSpacing:0.8 }}>{sector.name}</span>
                <span style={{ fontSize:11, color:"var(--tp-faint)", background:"var(--tp-input)", padding:"2px 8px", borderRadius:10 }}>{sector.tickers.length} ticker{sector.tickers.length!==1?"s":""}</span>
              </div>
              <div style={{ display:"flex", gap:6 }} onClick={e=>e.stopPropagation()}>
                <button onClick={()=>{setAddingSector(sector.name);setEditingItem(null);setShowTickerModal(true);}} style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 10px", borderRadius:6, border:"1px solid rgba(99,102,241,0.3)", background:"rgba(99,102,241,0.08)", color:"#a5b4fc", cursor:"pointer", fontSize:11, fontWeight:500 }}><Plus size={11}/> Ticker</button>
                <button onClick={()=>deleteSector(sector.name)} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer", padding:"5px 4px" }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><Trash2 size={13}/></button>
              </div>
            </div>
            {!isCollapsed && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:10 }}>
                {sector.tickers.map(item => (
                  <div key={item.id} style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"14px 16px", transition:"border-color 0.2s" }} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.3)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)" }}>{item.ticker}</span>
                        <span style={{ fontSize:9, fontWeight:600, color:item.direction==="Long"?"#60a5fa":"#f472b6", background:item.direction==="Long"?"rgba(96,165,250,0.12)":"rgba(244,114,182,0.12)", padding:"2px 7px", borderRadius:4, textTransform:"uppercase" }}>{item.direction}</span>
                        {item.assetType!=="Stock" && <span style={{ fontSize:9, color:item.assetType==="Options"?"#6366f1":"#eab308", background:item.assetType==="Options"?"rgba(99,102,241,0.15)":"rgba(234,179,8,0.15)", padding:"2px 6px", borderRadius:4 }}>{item.assetType==="Options"?"OPT":"FUT"}</span>}
                      </div>
                      <span style={{ fontSize:9, fontWeight:600, color:priorityColor(item.priority), background:priorityBg(item.priority), padding:"2px 8px", borderRadius:10, textTransform:"uppercase" }}>{item.priority}</span>
                    </div>
                    {item.entryCriteria && <div style={{ marginBottom:8 }}><div style={{ fontSize:9, color:"#4ade80", textTransform:"uppercase", letterSpacing:0.6, fontWeight:600, marginBottom:3 }}>📈 Entry</div><div style={{ fontSize:12, color:"#c0c4cf", lineHeight:1.5 }}>{item.entryCriteria}</div></div>}
                    {item.exitCriteria && <div style={{ marginBottom:8 }}><div style={{ fontSize:9, color:"#f87171", textTransform:"uppercase", letterSpacing:0.6, fontWeight:600, marginBottom:3 }}>📉 Exit</div><div style={{ fontSize:12, color:"#c0c4cf", lineHeight:1.5 }}>{item.exitCriteria}</div></div>}
                    {item.notes && <div style={{ fontSize:11, color:"var(--tp-faint)", borderTop:"1px solid var(--tp-border)", paddingTop:8, marginTop:4, lineHeight:1.5 }}>{item.notes}</div>}
                    <div style={{ display:"flex", gap:6, marginTop:12, paddingTop:10, borderTop:"1px solid var(--tp-border)" }}>
                      <button onClick={()=>{setEditingItem({...item,_sector:sector.name});setAddingSector(sector.name);setShowTickerModal(true);}} style={{ flex:1, padding:"6px 0", borderRadius:6, border:"1px solid var(--tp-border-l)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}><Eye size={11}/> Edit</button>
                      <button onClick={()=>onPromoteTrade({ticker:item.ticker,assetType:item.assetType,direction:item.direction})} style={{ flex:1, padding:"6px 0", borderRadius:6, border:"none", background:"rgba(99,102,241,0.15)", color:"#a5b4fc", cursor:"pointer", fontSize:11, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}><Plus size={11}/> Trade</button>
                      <button onClick={()=>deleteTicker(sector.name,item.id)} style={{ padding:"6px 8px", borderRadius:6, border:"none", background:"transparent", color:"var(--tp-faint)", cursor:"pointer" }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><Trash2 size={12}/></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {showTickerModal && <TickerModal editItem={editingItem?{...editingItem,_sector:undefined}:null} onSave={handleTickerSave} onClose={()=>{setShowTickerModal(false);setEditingItem(null);setAddingSector(null);}}/>}

      {/* ── WEEKLY NOTES ── */}
      <div style={{ marginTop:24, background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
          <Clipboard size={15} color="#a5b4fc"/>
          <span style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)" }}>Weekly Notes</span>
          <span style={{ fontSize:10, color:"var(--tp-faintest)", marginLeft:"auto" }}>Earnings, events, market notes, charts…</span>
        </div>

        <textarea
          value={current.weeklyNotes || ""}
          onChange={e => persistWatchlist({ ...current, weeklyNotes: e.target.value })}
          placeholder="Jot down earnings dates, FOMC schedule, key levels, market thesis, anything useful for the week…"
          rows={5}
          style={{ width:"100%", padding:"12px 14px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:10, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", lineHeight:1.7, marginBottom:12 }}
        />

        {/* Image uploads */}
        <div style={{ marginBottom:8 }}>
          <label style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, border:"1px solid var(--tp-border-l)", background:"var(--tp-input)", color:"var(--tp-muted)", cursor:"pointer", fontSize:12, fontWeight:500, transition:"border-color 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.4)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--tp-border-l)"}>
            <Image size={13}/> Add Image
            <input type="file" accept="image/*" multiple hidden onChange={e => {
              const files = Array.from(e.target.files || []);
              if (files.length === 0) return;
              const existing = current.weeklyImages || [];
              files.forEach(file => {
                const reader = new FileReader();
                reader.onload = ev => {
                  const img = { id: Date.now() + Math.random(), src: ev.target.result, name: file.name, addedAt: new Date().toISOString() };
                  persistWatchlist({ ...current, weeklyImages: [...(current.weeklyImages || []), img] });
                };
                reader.readAsDataURL(file);
              });
              e.target.value = "";
            }}/>
          </label>
        </div>

        {(current.weeklyImages || []).length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:10, marginTop:8 }}>
            {(current.weeklyImages || []).map(img => (
              <div key={img.id} style={{ position:"relative", borderRadius:10, overflow:"hidden", border:"1px solid var(--tp-border-l)", background:"var(--tp-card)" }}>
                <img
                  src={img.src}
                  alt={img.name || "Note image"}
                  onClick={() => {
                    const overlay = document.createElement("div");
                    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;backdrop-filter:blur(4px)";
                    const fullImg = document.createElement("img");
                    fullImg.src = img.src;
                    fullImg.style.cssText = "max-width:90vw;max-height:90vh;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,0.5)";
                    overlay.appendChild(fullImg);
                    overlay.onclick = () => document.body.removeChild(overlay);
                    document.body.appendChild(overlay);
                  }}
                  style={{ width:"100%", height:140, objectFit:"cover", cursor:"zoom-in", display:"block" }}
                />
                <div style={{ padding:"6px 10px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:10, color:"var(--tp-faint)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{img.name || "Image"}</span>
                  <button onClick={() => persistWatchlist({ ...current, weeklyImages: (current.weeklyImages || []).filter(i => i.id !== img.id) })}
                    style={{ background:"none", border:"none", cursor:"pointer", color:"var(--tp-faint)", padding:2 }}
                    onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="var(--tp-faint)"}><X size={12}/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WHEEL TAB ────────────────────────────────────────────────────────────────
function WheelTab({ wheelTrades, onSave, accounts, trades, onSaveTrades, prefs, accountBalances, onEditTrade }) {
  const [subTab, setSubTab] = useState("overview");
  const [accountFilter, setAccountFilter] = useState("All");
  const allAccounts = useMemo(() => [...new Set([...(accounts||[]), ...wheelTrades.map(t=>t.account).filter(Boolean)])], [accounts, wheelTrades]);

  const overviewData = useMemo(() => {
    const resets = prefs?.accountResets || {};
    const premiumTrades = trades.filter(t => {
      if (t.assetType !== "Options" || !t.legs?.length) return false;
      if (accountFilter !== "All" && t.account !== accountFilter) return false;
      if (t.account && resets[t.account]?.resetDate && t.date < resets[t.account].resetDate) return false;
      // Only include trades that have a sell leg (net premium sellers)
      return t.legs.some(l => l.action === "Sell");
    });
    const filteredWheel = wheelTrades.filter(wt => {
      if (accountFilter !== "All" && wt.account !== accountFilter) return false;
      if (wt.account && resets[wt.account]?.resetDate && wt.date < resets[wt.account].resetDate) return false;
      return (wt.type === "CSP" || wt.type === "CC");
    });

    let totalCollected = 0, totalKept = 0, closedCount = 0, winCount = 0;
    const strategyMap = {}, tickerMap = {}, weekMap = {};

    premiumTrades.forEach(t => {
      let collected = 0, kept = 0, isClosed = false;
      t.legs.forEach(leg => {
        const entry = parseFloat(leg.entryPremium) || 0;
        const contracts = parseInt(leg.contracts) || 1;
        const partials = leg.partialCloses || [];
        const sign = leg.action === "Sell" ? 1 : -1;
        if (leg.action === "Sell") collected += entry * contracts * 100;
        if (partials.length > 0) {
          const closedQty = partials.reduce((s,pc) => s + (parseInt(pc.qty)||0), 0);
          if (closedQty >= contracts) isClosed = true;
          partials.forEach(pc => { kept += sign * (entry - (parseFloat(pc.exitPremium)||0)) * (parseInt(pc.qty)||1) * 100; });
        } else {
          const exit = parseFloat(leg.exitPremium);
          if (!isNaN(exit)) { isClosed = true; kept += sign * (entry - exit) * contracts * 100; }
          else if (leg.action === "Sell") { kept += entry * contracts * 100; }
        }
        if (leg.action === "Sell" && leg.rolls?.length) {
          leg.rolls.forEach(roll => {
            const sell = parseFloat(roll.sellPremium) || 0;
            const buyback = parseFloat(roll.buybackPremium) || 0;
            const rqty = parseInt(roll.contracts) || contracts;
            collected += sell * rqty * 100;
            kept += (sell - buyback) * rqty * 100;
          });
        }
      });
      totalCollected += collected; totalKept += kept;
      if (isClosed) closedCount++;
      const pnl = calcPnL(t);
      if (pnl !== null && pnl > 0) winCount++;

      const strat = t.optionsStrategyType || "Unknown";
      const label = strat === "Vertical Spread" ? (t.legs[0]?.action === "Sell" ? "Credit Spread" : strat)
        : strat === "Diagonal" || strat === "PMCC / Diagonal" ? "PMCC" : strat === "Calendar" || strat === "Calendar Press" ? "Cal Press" : strat === "Single Leg" ? (t.legs[0]?.action === "Sell" ? (t.legs[0]?.type === "Put" ? "CSP" : "CC") : strat) : strat;

      if (!strategyMap[label]) strategyMap[label] = { trades:0, collected:0, kept:0, wins:0 };
      strategyMap[label].trades++; strategyMap[label].collected += collected; strategyMap[label].kept += kept;
      if (pnl !== null && pnl > 0) strategyMap[label].wins++;

      if (!tickerMap[t.ticker]) tickerMap[t.ticker] = { trades:0, kept:0 };
      tickerMap[t.ticker].trades++; tickerMap[t.ticker].kept += kept;

      const d = new Date(t.date); const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      const wk = ws.toISOString().split("T")[0];
      if (!weekMap[wk]) weekMap[wk] = { collected:0, kept:0, trades:0 };
      weekMap[wk].collected += collected; weekMap[wk].kept += kept; weekMap[wk].trades++;
    });

    filteredWheel.forEach(wt => {
      const contracts = parseInt(wt.contracts) || 0;
      const openP = (parseFloat(wt.openPremium) || 0) * contracts * 100;
      const closeP = (parseFloat(wt.closePremium) || 0) * contracts * 100;
      const fees = parseFloat(wt.fees) || 0;
      const net = openP - closeP - fees;
      totalCollected += openP; totalKept += net; closedCount++;
      if (net > 0) winCount++;
      const label = wt.type;
      if (!strategyMap[label]) strategyMap[label] = { trades:0, collected:0, kept:0, wins:0 };
      strategyMap[label].trades++; strategyMap[label].collected += openP; strategyMap[label].kept += net;
      if (net > 0) strategyMap[label].wins++;
      if (!tickerMap[wt.ticker]) tickerMap[wt.ticker] = { trades:0, kept:0 };
      tickerMap[wt.ticker].trades++; tickerMap[wt.ticker].kept += net;
      const d = new Date(wt.date); const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      const wk = ws.toISOString().split("T")[0];
      if (!weekMap[wk]) weekMap[wk] = { collected:0, kept:0, trades:0 };
      weekMap[wk].collected += openP; weekMap[wk].kept += net; weekMap[wk].trades++;
    });

    const totalTrades = premiumTrades.length + filteredWheel.length;
    const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;
    const avgPerTrade = totalTrades > 0 ? totalKept / totalTrades : 0;
    const slippage = totalCollected - totalKept;
    const strategies = Object.entries(strategyMap).map(([name, s]) => ({ name, trades:s.trades, collected:s.collected, kept:s.kept, slippage:s.collected-s.kept, avg:s.trades>0?s.kept/s.trades:0, winRate:s.trades>0?(s.wins/s.trades)*100:0 })).sort((a,b) => b.kept - a.kept);
    const tickers = Object.entries(tickerMap).map(([ticker, t]) => ({ ticker, trades:t.trades, kept:t.kept })).sort((a,b) => b.kept - a.kept);
    const weeks = Object.entries(weekMap).sort((a,b) => a[0].localeCompare(b[0])).map(([wk, w]) => ({ week:wk, ...w }));
    return { totalCollected, totalKept, totalTrades, closedCount, winCount, winRate, avgPerTrade, slippage, strategies, tickers, weeks };
  }, [trades, wheelTrades, accountFilter, prefs]);

  const subTabs = [{ id:"overview", label:"Overview", icon:BarChart3 },{ id:"wheel", label:"Wheel", icon:RefreshCw },{ id:"pmcc", label:"PMCC", icon:Layers },{ id:"calpress", label:"Cal Press", icon:Calendar },{ id:"spreads", label:"Spreads", icon:Activity }];

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:"var(--tp-text)", display:"flex", alignItems:"center", gap:8 }}><DollarSign size={20} color="#4ade80"/> Premium Selling</div>
          <div style={{ fontSize:12, color:"var(--tp-faint)", marginTop:2 }}>Track options income across all strategies</div>
        </div>
        {allAccounts.length > 0 && (
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <span style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", letterSpacing:0.5 }}>Acct:</span>
            <button onClick={()=>setAccountFilter("All")} style={{ padding:"3px 10px", borderRadius:5, border:`1px solid ${accountFilter==="All"?"#6366f1":"var(--tp-border-l)"}`, background:accountFilter==="All"?"rgba(99,102,241,0.12)":"transparent", color:accountFilter==="All"?"#a5b4fc":"var(--tp-faint)", cursor:"pointer", fontSize:10, fontWeight:600 }}>All</button>
            {allAccounts.map(a => <button key={a} onClick={()=>setAccountFilter(a)} style={{ padding:"3px 10px", borderRadius:5, border:`1px solid ${accountFilter===a?"#6366f1":"var(--tp-border-l)"}`, background:accountFilter===a?"rgba(99,102,241,0.12)":"transparent", color:accountFilter===a?"#a5b4fc":"var(--tp-faint)", cursor:"pointer", fontSize:10, fontWeight:600 }}>{a}</button>)}
          </div>
        )}
      </div>

      <div style={{ display:"flex", gap:4, marginBottom:16, borderBottom:"1px solid var(--tp-border)", paddingBottom:8 }}>
        {subTabs.map(st => <button key={st.id} onClick={()=>setSubTab(st.id)} style={{ padding:"7px 14px", borderRadius:8, border:"none", background:subTab===st.id?"rgba(99,102,241,0.15)":"transparent", color:subTab===st.id?"#a5b4fc":"var(--tp-faint)", cursor:"pointer", fontSize:12, fontWeight:subTab===st.id?600:400, display:"flex", alignItems:"center", gap:5, transition:"all 0.15s" }}><st.icon size={13}/> {st.label}</button>)}
      </div>

      {subTab === "overview" && <PremiumOverview data={overviewData}/>}
      {subTab === "wheel" && <WheelSubTab wheelTrades={wheelTrades} onSave={onSave} accounts={accounts} trades={trades} onSaveTrades={onSaveTrades} accountFilter={accountFilter}/>}
      {subTab === "pmcc" && <DiagonalPositionTracker trades={trades} accountFilter={accountFilter} strategyType="PMCC" label="Poor Man's Covered Call" description="Long LEAP call + short calls sold for income. Log as 'Diagonal' strategy" prefs={prefs} onEditTrade={onEditTrade}/>}
      {subTab === "calpress" && <DiagonalPositionTracker trades={trades} accountFilter={accountFilter} strategyType="CalPress" label="Calendar Press" description="Long dated OTM option + short weeklies sold for premium. Log as 'Calendar' strategy" prefs={prefs} onEditTrade={onEditTrade}/>}
      {subTab === "spreads" && <SpreadsSubTab trades={trades} accountFilter={accountFilter} prefs={prefs} onEditTrade={onEditTrade}/>}
    </div>
  );
}

function PremiumOverview({ data }) {
  if (data.totalTrades === 0) return (
    <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--tp-faint)" }}>
      <DollarSign size={48} style={{ margin:"0 auto 16px", opacity:0.3 }}/>
      <p style={{ fontSize:15, margin:"0 0 6px" }}>No premium trades yet</p>
      <p style={{ fontSize:12, color:"var(--tp-faintest)", margin:0 }}>Log options trades with sell legs, or add wheel positions in the Wheel sub-tab</p>
    </div>
  );
  return (
    <div>
      <div className="tp-prem-summary" style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:16 }}>
        <div style={{ background:"var(--tp-panel)", border:"1px solid rgba(74,222,128,0.15)", borderRadius:12, padding:"18px 20px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"#4ade80", textTransform:"uppercase", letterSpacing:0.8, fontWeight:600, marginBottom:6 }}>Net Premium Kept</div>
          <div style={{ fontSize:26, fontWeight:800, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>${data.totalKept.toLocaleString("en-US",{maximumFractionDigits:0})}</div>
          <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:4 }}>Final prem across all trades</div>
        </div>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, fontWeight:600, marginBottom:6 }}>Total Trades</div>
          <div style={{ fontSize:26, fontWeight:800, color:"var(--tp-text)", fontFamily:"'JetBrains Mono', monospace" }}>{data.totalTrades}</div>
          <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:4 }}>Across {data.strategies.length} strategies</div>
        </div>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, fontWeight:600, marginBottom:6 }}>Win Rate</div>
          <div style={{ fontSize:26, fontWeight:800, color:data.winRate>=80?"#4ade80":data.winRate>=50?"#eab308":"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{data.winRate.toFixed(1)}%</div>
          <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:4 }}>{data.winCount} wins · {data.closedCount-data.winCount} losses</div>
        </div>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, fontWeight:600, marginBottom:6 }}>Avg Premium / Trade</div>
          <div style={{ fontSize:26, fontWeight:800, color:"var(--tp-text)", fontFamily:"'JetBrains Mono', monospace" }}>${data.avgPerTrade.toFixed(0)}</div>
          <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:4 }}>Net kept per position</div>
        </div>
      </div>

      <div className="tp-prem-mid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:14 }}>📅 Weekly Breakdown</div>
          <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4 }}>
            {data.weeks.slice(-6).map((w, i) => {
              const d = new Date(w.week+"T12:00:00"); const ed = new Date(d); ed.setDate(d.getDate()+6);
              return (<div key={i} style={{ textAlign:"center", minWidth:90, padding:"10px 12px", background:"var(--tp-card)", borderRadius:10, border:"1px solid var(--tp-border)" }}>
                <div style={{ fontSize:8, color:"var(--tp-faintest)", textTransform:"uppercase", marginBottom:4 }}>Week {data.weeks.indexOf(w)+1}</div>
                <div style={{ fontSize:8, color:"var(--tp-faintest)", marginBottom:6 }}>{d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}–{ed.getDate()}</div>
                <div style={{ fontSize:18, fontWeight:800, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>${w.kept.toLocaleString("en-US",{maximumFractionDigits:0})}</div>
                <div style={{ fontSize:9, color:"var(--tp-faintest)", marginTop:3 }}>{w.trades} trades</div>
              </div>);
            })}
          </div>
        </div>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:14 }}>🎯 Win Rate</div>
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <div style={{ position:"relative", width:90, height:90 }}>
              <svg width="90" height="90" viewBox="0 0 90 90"><circle cx="45" cy="45" r="38" fill="none" stroke="var(--tp-border)" strokeWidth="8"/><circle cx="45" cy="45" r="38" fill="none" stroke="#4ade80" strokeWidth="8" strokeDasharray={`${data.winRate*2.39} 239`} transform="rotate(-90 45 45)" strokeLinecap="round"/></svg>
              <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>{data.winRate.toFixed(0)}%</div>
                <div style={{ fontSize:7, color:"var(--tp-faintest)", textTransform:"uppercase" }}>Win Rate</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize:12, color:"#4ade80", marginBottom:6 }}>✅ {data.winCount} winning trades</div>
              <div style={{ fontSize:12, color:"#f87171" }}>❌ {data.closedCount-data.winCount} losing trades</div>
              {data.slippage > 0 && <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:8, padding:"6px 10px", background:"var(--tp-card)", borderRadius:6, lineHeight:1.5 }}>Slippage: ${data.slippage.toLocaleString("en-US",{maximumFractionDigits:0})} — cost of early closes</div>}
            </div>
          </div>
        </div>
      </div>

      {data.strategies.length > 0 && (
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px", marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:14 }}>📊 Performance by Strategy</div>
          <div className="tp-prem-strat-hdr" style={{ display:"grid", gridTemplateColumns:"100px 55px 95px 85px 85px 85px 65px", gap:6, padding:"8px 12px", fontSize:9, color:"var(--tp-faintest)", fontWeight:600, textTransform:"uppercase", letterSpacing:0.5 }}>
            <span>Strategy</span><span style={{textAlign:"center"}}>Trades</span><span style={{textAlign:"right"}}>Collected</span><span style={{textAlign:"right"}}>Net Kept</span><span style={{textAlign:"right"}}>Slippage</span><span style={{textAlign:"right"}}>Avg/Trade</span><span style={{textAlign:"right"}}>Win%</span>
          </div>
          {data.strategies.map(s => (
            <div key={s.name} className="tp-prem-strat-row" style={{ display:"grid", gridTemplateColumns:"100px 55px 95px 85px 85px 85px 65px", gap:6, padding:"10px 12px", background:"var(--tp-card)", borderRadius:8, marginBottom:4, alignItems:"center", fontSize:12 }}>
              <span><span style={{ padding:"2px 8px", borderRadius:4, fontSize:10, fontWeight:600, background:"rgba(99,102,241,0.12)", color:"#a5b4fc" }}>{s.name}</span></span>
              <span style={{ textAlign:"center", color:"var(--tp-muted)" }}>{s.trades}</span>
              <span style={{ textAlign:"right", color:"var(--tp-muted)", fontFamily:"'JetBrains Mono', monospace" }}>${s.collected.toLocaleString("en-US",{maximumFractionDigits:0})}</span>
              <span style={{ textAlign:"right", color:"#4ade80", fontWeight:700, fontFamily:"'JetBrains Mono', monospace" }}>${s.kept.toLocaleString("en-US",{maximumFractionDigits:0})}</span>
              <span style={{ textAlign:"right", color:"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>-${Math.abs(s.slippage).toLocaleString("en-US",{maximumFractionDigits:0})}</span>
              <span style={{ textAlign:"right", color:"var(--tp-text)", fontFamily:"'JetBrains Mono', monospace" }}>${s.avg.toFixed(0)}</span>
              <span style={{ textAlign:"right", color:s.winRate>=80?"#4ade80":s.winRate>=50?"#eab308":"#f87171", fontWeight:700, fontFamily:"'JetBrains Mono', monospace" }}>{s.winRate.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      {data.tickers.length > 0 && (
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:14 }}>📈 Performance by Ticker</div>
          {data.tickers.slice(0,12).map(t => {
            const maxKept = Math.max(...data.tickers.map(x => Math.abs(x.kept)), 1);
            return (<div key={t.ticker} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, padding:"6px 0" }}>
              <span style={{ width:50, fontSize:12, fontWeight:700, color:"var(--tp-text)" }}>{t.ticker}</span>
              <span style={{ width:55, fontSize:10, color:"var(--tp-faintest)" }}>{t.trades} trade{t.trades!==1?"s":""}</span>
              <div style={{ flex:1, height:20, background:"var(--tp-card)", borderRadius:4, overflow:"hidden" }}><div style={{ height:"100%", width:`${(Math.abs(t.kept)/maxKept)*100}%`, background:t.kept>=0?"rgba(99,102,241,0.4)":"rgba(248,113,113,0.4)", borderRadius:4 }}/></div>
              <span style={{ width:70, textAlign:"right", fontSize:12, fontWeight:700, color:t.kept>=0?"#4ade80":"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>${t.kept.toLocaleString("en-US",{maximumFractionDigits:0})}</span>
            </div>);
          })}
        </div>
      )}
    </div>
  );
}

function DiagonalPositionTracker({ trades, accountFilter, strategyType, label, description, prefs, onEditTrade }) {
  const resets = prefs?.accountResets || {};
  const stratFilter = strategyType === "PMCC" ? ["Diagonal", "PMCC / Diagonal"] : ["Calendar", "Calendar Press"];
  const positions = useMemo(() => {
    const matching = trades.filter(t => {
      if (t.assetType !== "Options" || !stratFilter.includes(t.optionsStrategyType)) return false;
      if (accountFilter !== "All" && t.account !== accountFilter) return false;
      if (t.account && resets[t.account]?.resetDate && t.date < resets[t.account].resetDate) return false;
      return true;
    });
    const grouped = {};
    matching.forEach(t => {
      const key = `${t.ticker}|${t.account || ""}`;
      if (!grouped[key]) grouped[key] = { ticker:t.ticker, account:t.account||"", trades:[] };
      grouped[key].trades.push(t);
    });
    return Object.values(grouped).map(g => {
      let anchorCost=0, anchorExit=0, totalPremCollected=0, totalPremKept=0, shortLegs=0;
      g.trades.forEach(t => {
        (t.legs||[]).forEach(leg => {
          const entry = parseFloat(leg.entryPremium)||0, contracts = parseInt(leg.contracts)||1;
          const partials = leg.partialCloses||[];
          if (leg.action === "Buy") {
            anchorCost += entry * contracts * 100;
            const exitP = parseFloat(leg.exitPremium);
            if (!isNaN(exitP)) anchorExit += exitP * contracts * 100;
          }
          else {
            shortLegs++; totalPremCollected += entry * contracts * 100;
            if (partials.length > 0) partials.forEach(pc => totalPremKept += (entry - (parseFloat(pc.exitPremium)||0)) * (parseInt(pc.qty)||1) * 100);
            else { const exit = parseFloat(leg.exitPremium); totalPremKept += !isNaN(exit) ? (entry-exit)*contracts*100 : entry*contracts*100; }
            if (leg.rolls?.length) leg.rolls.forEach(roll => {
              const sell=parseFloat(roll.sellPremium)||0, buyback=parseFloat(roll.buybackPremium)||0, rqty=parseInt(roll.contracts)||contracts;
              totalPremCollected += sell*rqty*100; totalPremKept += (sell-buyback)*rqty*100;
            });
          }
        });
      });
      const netAnchorCost = anchorCost - anchorExit;
      const roi = netAnchorCost > 0 ? (totalPremKept/netAnchorCost)*100 : anchorCost > 0 ? (totalPremKept/anchorCost)*100 : 0;
      return { ...g, anchorCost, anchorExit, totalPremCollected, totalPremKept, shortLegs, roi, netPosition:totalPremKept-anchorCost+anchorExit };
    }).sort((a,b) => b.totalPremKept - a.totalPremKept);
  }, [trades, accountFilter, stratFilter, resets]);

  if (positions.length === 0) return (
    <div>
      <div style={{ fontSize:14, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:12, color:"var(--tp-faint)", marginBottom:16 }}>{description}</div>
      <div style={{ textAlign:"center", padding:"50px 20px", color:"var(--tp-faint)" }}>
        <Layers size={36} style={{ margin:"0 auto 12px", opacity:0.3 }}/>
        <p style={{ fontSize:13, margin:"0 0 6px" }}>No {label} positions found.</p>
        <p style={{ fontSize:11, color:"var(--tp-faintest)", margin:0 }}>Log a trade with the "{stratFilter.join(" or ")}" strategy type to see it here.</p>
      </div>
    </div>
  );
  return (
    <div>
      <div style={{ fontSize:14, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:12, color:"var(--tp-faint)", marginBottom:16 }}>{description}</div>
      <div style={{ display:"grid", gap:12 }}>
        {positions.map(pos => (
          <div key={`${pos.ticker}-${pos.account}`} style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", marginBottom:14 }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:18, fontWeight:700, color:"var(--tp-text)" }}>{pos.ticker}</span>
                  {pos.account && <span style={{ fontSize:9, fontWeight:600, color:"#a5b4fc", background:"rgba(99,102,241,0.12)", padding:"2px 8px", borderRadius:4 }}>{pos.account}</span>}
                  <span style={{ fontSize:9, color:"var(--tp-faintest)" }}>{pos.trades.length} trade{pos.trades.length!==1?"s":""} · {pos.shortLegs} short leg{pos.shortLegs!==1?"s":""}</span>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:20, fontWeight:800, color:pos.netPosition>=0?"#4ade80":"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{pos.netPosition>=0?"+":""}${pos.netPosition.toFixed(0)}</div>
                <div style={{ fontSize:9, color:"var(--tp-faintest)" }}>net P&L</div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10 }}>
              {[{l:pos.anchorExit>0?"Net Anchor":"Anchor Cost",v:pos.anchorExit>0?(pos.anchorExit>=pos.anchorCost?"+":"-")+`$${Math.abs(pos.anchorCost-pos.anchorExit).toFixed(0)}`:`-$${pos.anchorCost.toFixed(0)}`,c:pos.anchorExit>=pos.anchorCost?"#4ade80":"#f87171"},{l:"Prem Collected",v:`$${pos.totalPremCollected.toFixed(0)}`,c:"var(--tp-muted)"},{l:"Net Kept",v:`$${pos.totalPremKept.toFixed(0)}`,c:"#4ade80"},{l:"ROI on Anchor",v:`${pos.roi.toFixed(0)}%`,c:pos.roi>=100?"#4ade80":"#eab308"}].map((s,i) => (
                <div key={i} style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:8, color:"var(--tp-faintest)", textTransform:"uppercase", marginBottom:3 }}>{s.l}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:s.c, fontFamily:"'JetBrains Mono', monospace" }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>Trade History</div>
              {pos.trades.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t => {
                const buyLeg = t.legs?.find(l=>l.action==="Buy"); const sellLeg = t.legs?.find(l=>l.action==="Sell");
                // Compute premium-aware P&L: anchor cost vs all sell income
                let tradePnL = null;
                if (t.legs?.length) {
                  let cost = 0, income = 0;
                  t.legs.forEach(leg => {
                    const entry = parseFloat(leg.entryPremium)||0, contracts = parseInt(leg.contracts)||1;
                    if (leg.action === "Buy") { cost += entry * contracts * 100; const exitP = parseFloat(leg.exitPremium); if (!isNaN(exitP)) cost -= exitP * contracts * 100; }
                    else {
                      const partials = leg.partialCloses || [];
                      if (partials.length > 0) partials.forEach(pc => income += (entry - (parseFloat(pc.exitPremium)||0)) * (parseInt(pc.qty)||1) * 100);
                      else { const exit = parseFloat(leg.exitPremium); income += !isNaN(exit) ? (entry - exit) * contracts * 100 : entry * contracts * 100; }
                      if (leg.rolls?.length) leg.rolls.forEach(r => { income += ((parseFloat(r.sellPremium)||0) - (parseFloat(r.buybackPremium)||0)) * (parseInt(r.contracts)||contracts) * 100; });
                    }
                  });
                  tradePnL = income - cost - (parseFloat(t.fees)||0);
                }
                return (<div key={t.id} onClick={()=>onEditTrade && onEditTrade(t)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 10px", background:"var(--tp-card)", borderRadius:6, marginBottom:3, fontSize:11, cursor:onEditTrade?"pointer":"default", transition:"background 0.15s" }} onMouseEnter={e=>{if(onEditTrade)e.currentTarget.style.background="rgba(99,102,241,0.1)"}} onMouseLeave={e=>e.currentTarget.style.background="var(--tp-card)"}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ color:"var(--tp-faintest)", fontFamily:"'JetBrains Mono', monospace" }}>{t.date}</span>
                    {buyLeg && <span style={{ color:"#60a5fa" }}>B {buyLeg.strike}{buyLeg.type[0]} @{buyLeg.entryPremium}</span>}
                    {sellLeg && <span style={{ color:"#f87171" }}>S {sellLeg.strike}{sellLeg.type[0]} @{sellLeg.entryPremium}</span>}
                    {sellLeg?.rolls?.length > 0 && <span style={{ color:"#eab308", fontSize:9 }}>({sellLeg.rolls.length} roll{sellLeg.rolls.length!==1?"s":""})</span>}
                  </div>
                  <span style={{ fontWeight:600, color:tradePnL>0?"#4ade80":tradePnL<0?"#f87171":"var(--tp-faint)", fontFamily:"'JetBrains Mono', monospace" }}>{tradePnL!==null?`${tradePnL>=0?"+":""}$${tradePnL.toFixed(0)}`:"—"}</span>
                </div>);
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpreadsSubTab({ trades, accountFilter, prefs, onEditTrade }) {
  const resets = prefs?.accountResets || {};
  const spreadTrades = useMemo(() => trades.filter(t => {
    if (t.assetType !== "Options" || t.optionsStrategyType !== "Vertical Spread") return false;
    if (accountFilter !== "All" && t.account !== accountFilter) return false;
    if (t.account && resets[t.account]?.resetDate && t.date < resets[t.account].resetDate) return false;
    return t.legs?.some(l => l.action === "Sell");
  }).sort((a,b) => new Date(b.date)-new Date(a.date)), [trades, accountFilter, resets]);

  return (
    <div>
      <div style={{ fontSize:14, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Credit Spreads</div>
      <div style={{ fontSize:12, color:"var(--tp-faint)", marginBottom:16 }}>Put credit spreads and call credit spreads from your Trade Log</div>
      {spreadTrades.length === 0 ? (
        <div style={{ textAlign:"center", padding:"50px 20px", color:"var(--tp-faint)" }}><Activity size={36} style={{ margin:"0 auto 12px", opacity:0.3 }}/><p style={{ fontSize:13 }}>No credit spreads found. Log a Vertical Spread with a sell leg.</p></div>
      ) : spreadTrades.map(t => {
        const pnl = calcPnL(t);
        const netCollected = t.legs.reduce((s,l) => s + (l.action==="Sell"?1:-1) * (parseFloat(l.entryPremium)||0) * (parseInt(l.contracts)||1) * 100, 0);
        return (
          <div key={t.id} onClick={()=>onEditTrade && onEditTrade(t)} style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 18px", marginBottom:8, cursor:onEditTrade?"pointer":"default", transition:"border-color 0.15s" }} onMouseEnter={e=>{if(onEditTrade)e.currentTarget.style.borderColor="rgba(99,102,241,0.35)"}} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--tp-panel-b)"}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:15, fontWeight:700, color:"var(--tp-text)" }}>{t.ticker}</span>
                <span style={{ fontSize:9, padding:"2px 8px", borderRadius:4, background:t.legs[0]?.type==="Put"?"rgba(74,222,128,0.1)":"rgba(248,113,113,0.1)", color:t.legs[0]?.type==="Put"?"#4ade80":"#f87171", fontWeight:600 }}>{t.legs[0]?.type==="Put"?"PCS":"CCS"}</span>
                <span style={{ fontSize:10, color:"var(--tp-faintest)" }}>{t.date}</span>
                <span style={{ fontSize:10, color:"var(--tp-faintest)" }}>{t.legs.map(l=>`${l.action[0]} ${l.strike}${l.type[0]}`).join(" / ")}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ textAlign:"right" }}><div style={{ fontSize:10, color:"var(--tp-faintest)" }}>Collected</div><div style={{ fontSize:13, fontWeight:600, color:"var(--tp-muted)", fontFamily:"'JetBrains Mono', monospace" }}>${netCollected.toFixed(0)}</div></div>
                <div style={{ textAlign:"right" }}><div style={{ fontSize:10, color:"var(--tp-faintest)" }}>P&L</div><div style={{ fontSize:13, fontWeight:700, color:pnl>=0?"#4ade80":"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{pnl!==null?`${pnl>=0?"+":""}$${pnl.toFixed(0)}`:"Open"}</div></div>
                <span style={{ fontSize:9, padding:"3px 8px", borderRadius:4, background:t.status==="Open"?"rgba(234,179,8,0.1)":"rgba(74,222,128,0.1)", color:t.status==="Open"?"#eab308":"#4ade80", fontWeight:600 }}>{t.status||"Open"}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WheelSubTab({ wheelTrades, onSave, accounts, trades, onSaveTrades, accountFilter }) {
  const [collapsed, setCollapsed] = useState({});
  const [showAddPositionModal, setShowAddPositionModal] = useState(false);
  const [showAddTradeModal, setShowAddTradeModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState("");
  const positions = useMemo(() => {
    const grouped = {};
    const filtered = accountFilter === "All" ? wheelTrades : wheelTrades.filter(t => t.account === accountFilter);
    filtered.forEach(trade => {
      const key = `${trade.ticker}|${trade.account || "Unassigned"}`;
      if (!grouped[key]) grouped[key] = { ticker:trade.ticker, account:trade.account||"Unassigned", trades:[] };
      grouped[key].trades.push(trade);
    });
    return Object.values(grouped).map(g => ({ ...g, trades:g.trades.sort((a,b) => new Date(b.date)-new Date(a.date)) }));
  }, [wheelTrades, accountFilter]);

  useEffect(() => {
    if (!onSaveTrades || !wheelTrades.length) return;
    const needsSync = wheelTrades.filter(wt => {
      if (wt.type === "CSP" && wt.assigned) return true;
      if (wt.type === "Shares" && (parseInt(wt.shares)||0) > 0) return true;
      return false;
    });
    const missing = needsSync.filter(wt => !trades.find(t => t.id === `wheel-assigned-${wt.id}`));
    if (missing.length === 0) return;
    onSaveTrades(prev => {
      const newH = missing.filter(wt => !prev.find(t => t.id === `wheel-assigned-${wt.id}`)).map(wt => {
        if (wt.type === "CSP") {
          const shares = (parseInt(wt.contracts)||1)*100, strike = parseFloat(wt.strike)||0, prem = parseFloat(wt.openPremium)||0;
          return { id:`wheel-assigned-${wt.id}`, ticker:wt.ticker, date:wt.expiry||wt.date, assetType:"Stocks", direction:"Long", status:"Open",
            entryPrice:String((strike-prem).toFixed(2)), quantity:String(shares), account:wt.account||"", timeframe:"Swing",
            notes:`Wheel assignment from CSP @ $${strike} strike. Premium received: $${prem}/contract.`, tradeStrategy:"Wheel Strategy", source:"wheel-assignment" };
        } else {
          // Shares type
          const shares = parseInt(wt.shares)||0, price = parseFloat(wt.avgPrice)||0;
          return { id:`wheel-assigned-${wt.id}`, ticker:wt.ticker, date:wt.date, assetType:"Stocks", direction:"Long", status:"Open",
            entryPrice:String(price.toFixed(2)), quantity:String(shares), account:wt.account||"", timeframe:"Swing",
            notes:wt.notes || `Wheel shares purchased @ $${price.toFixed(2)}`, tradeStrategy:"Wheel Strategy", source:"wheel-assignment" };
        }
      });
      return [...newH, ...prev];
    });
  }, []);


  const handleSaveTrade = (trade) => {
    onSave(prev => {
      const idx = prev.findIndex(t => t.id === trade.id);
      if (idx >= 0) { const u = [...prev]; u[idx] = trade; return u; }
      return [trade, ...prev];
    });
    if (trade.type === "CSP" && trade.assigned && onSaveTrades) {
      const holdingId = `wheel-assigned-${trade.id}`;
      const shares = (parseInt(trade.contracts)||1)*100, strike = parseFloat(trade.strike)||0, premiumCredit = parseFloat(trade.openPremium)||0;
      const costBasis = strike - premiumCredit;
      onSaveTrades(prev => {
        const existing = prev.find(t => t.id === holdingId);
        const ht = { id:holdingId, ticker:trade.ticker, date:trade.expiry||trade.date, assetType:"Stocks", direction:"Long", status:"Open",
          entryPrice:String(costBasis.toFixed(2)), quantity:String(shares), account:trade.account||"", timeframe:"Swing",
          notes:`Wheel assignment from CSP @ $${strike} strike. Premium received: $${premiumCredit}/contract.`, tradeStrategy:"Wheel Strategy", source:"wheel-assignment" };
        if (existing) return prev.map(t => t.id === holdingId ? {...t,...ht} : t);
        return [ht, ...prev];
      });
    }
    if (trade.type === "CSP" && !trade.assigned && onSaveTrades) onSaveTrades(prev => prev.filter(t => t.id !== `wheel-assigned-${trade.id}`));
    // Sync Shares-type wheel trades to Holdings
    if (trade.type === "Shares" && onSaveTrades) {
      const holdingId = `wheel-assigned-${trade.id}`;
      const shares = parseInt(trade.shares)||0;
      const price = parseFloat(trade.avgPrice)||0;
      if (shares > 0) {
        onSaveTrades(prev => {
          const existing = prev.find(t => t.id === holdingId);
          const ht = { id:holdingId, ticker:trade.ticker, date:trade.date, assetType:"Stocks", direction:"Long", status:"Open",
            entryPrice:String(price.toFixed(2)), quantity:String(shares), account:trade.account||"", timeframe:"Swing",
            notes:trade.notes || `Wheel shares purchased @ $${price.toFixed(2)}`, tradeStrategy:"Wheel Strategy", source:"wheel-assignment" };
          if (existing) return prev.map(t => t.id === holdingId ? {...t,...ht} : t);
          return [ht, ...prev];
        });
      } else {
        // Shares set to 0 = remove
        onSaveTrades(prev => prev.filter(t => t.id !== holdingId));
      }
    }
    if (trade.type === "CC" && trade.calledAway && onSaveTrades) {
      const sharesCalledAway = parseInt(trade.sharesCalledAway) || ((parseInt(trade.contracts)||1)*100);
      const callStrike = parseFloat(trade.strike)||0;
      onSaveTrades(prev => {
        const match = prev.find(t => t.source === "wheel-assignment" && t.ticker === trade.ticker && t.account === (trade.account||"") && t.status === "Open");
        if (match) {
          const es = parseInt(match.quantity)||0;
          if (sharesCalledAway >= es) return prev.map(t => t.id===match.id?{...t, status:"Closed", exitPrice:String(callStrike), exitDate:trade.expiry||trade.date}:t);
          else return prev.map(t => t.id===match.id?{...t, quantity:String(es-sharesCalledAway)}:t);
        }
        return prev;
      });
    }
    setShowAddTradeModal(false); setEditingTrade(null); setSelectedTicker(null); setSelectedAccount("");
  };

  const handleDeleteTrade = (id) => onSave(prev => prev.filter(t => t.id !== id));
  const handleDeletePosition = (ticker, account) => onSave(prev => prev.filter(t => !(t.ticker === ticker && (t.account || "Unassigned") === account)));
  const openNewPosition = () => setShowAddPositionModal(true);
  const openNewTrade = (ticker, account) => { setSelectedTicker(ticker); setSelectedAccount(account||""); setEditingTrade(null); setShowAddTradeModal(true); };
  const openEditTrade = (trade) => { setEditingTrade(trade); setShowAddTradeModal(true); };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div><div style={{ fontSize:16, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Wheel Strategy Tracker</div><div style={{ fontSize:12, color:"var(--tp-faint)" }}>Track CSPs, covered calls, and share assignments</div></div>
        <button onClick={openNewPosition} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}><Plus size={15}/> New Position</button>
      </div>
      {positions.length === 0 ? (
        <div style={{ textAlign:"center", padding:"70px 20px", color:"var(--tp-faint)" }}><RefreshCw size={48} style={{ margin:"0 auto 16px", opacity:0.35 }}/><p style={{ margin:0, fontSize:15 }}>No wheel positions yet.</p></div>
      ) : (
        <div style={{ display:"grid", gap:14 }}>
          {positions.map(pos => <WheelPositionCard key={`${pos.ticker}-${pos.account}`} position={pos} collapsed={collapsed[`${pos.ticker}-${pos.account}`]} onToggle={()=>setCollapsed(p=>({...p,[`${pos.ticker}-${pos.account}`]:!p[`${pos.ticker}-${pos.account}`]}))} onAddTrade={()=>openNewTrade(pos.ticker, pos.account)} onEditTrade={openEditTrade} onDeleteTrade={handleDeleteTrade} onDeletePosition={()=>handleDeletePosition(pos.ticker, pos.account)}/>)}
        </div>
      )}
      {showAddPositionModal && <NewPositionModal onSave={(ticker, account)=>{openNewTrade(ticker, account);setShowAddPositionModal(false);}} onClose={()=>setShowAddPositionModal(false)} accounts={accounts||[]}/>}
      {showAddTradeModal && <WheelTradeModal ticker={selectedTicker||editingTrade?.ticker} onSave={handleSaveTrade} onClose={()=>{setShowAddTradeModal(false);setEditingTrade(null);setSelectedTicker(null);setSelectedAccount("");}} editTrade={editingTrade} accounts={accounts||[]} defaultAccount={selectedAccount||editingTrade?.account||""}/>}
    </div>
  );
}


function WheelPositionCard({ position, collapsed, onToggle, onAddTrade, onEditTrade, onDeleteTrade, onDeletePosition }) {
  const { ticker, trades, account } = position;
  
  // Calculate totals across all trades
  let totalPremium = 0;
  let ownedShares = 0;
  let totalCost = 0;
  
  trades.forEach(trade => {
    if (trade.type === "CSP") {
      const net = ((parseFloat(trade.openPremium)||0) - (parseFloat(trade.closePremium)||0)) * (parseInt(trade.contracts)||0) * 100 - (parseFloat(trade.fees)||0);
      totalPremium += net;
      if (trade.assigned) {
        const shares = (parseInt(trade.contracts)||0) * 100;
        ownedShares += shares;
        totalCost += shares * (parseFloat(trade.strike)||0);
      }
    } else if (trade.type === "CC") {
      const net = ((parseFloat(trade.openPremium)||0) - (parseFloat(trade.closePremium)||0)) * (parseInt(trade.contracts)||0) * 100 - (parseFloat(trade.fees)||0);
      totalPremium += net;
      if (trade.calledAway) {
        ownedShares -= (parseInt(trade.sharesCalledAway)||0);
      }
    } else if (trade.type === "Shares") {
      const shares = parseInt(trade.shares)||0;
      ownedShares += shares;
      totalCost += shares * (parseFloat(trade.avgPrice)||0);
    }
  });
  
  const adjCostPerShare = ownedShares > 0 ? (totalCost - totalPremium) / ownedShares : 0;
  const status = ownedShares > 0 ? "Active" : totalPremium > 0 ? "Collecting" : "Closed";

  return (
    <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, overflow:"hidden", transition:"border-color 0.2s" }} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.3)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"}>
      {/* Summary Header (always visible) */}
      <div style={{ padding:"18px 20px", cursor:"pointer" }} onClick={onToggle}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {collapsed ? <ChevronRight size={16} color="#6366f1"/> : <ChevronDown size={16} color="#6366f1"/>}
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ fontSize:18, fontWeight:700, color:"var(--tp-text)" }}>{ticker}</div>
                <span style={{ fontSize:10, fontWeight:600, color: status==="Active"?"#60a5fa":status==="Collecting"?"#4ade80":"#8a8f9e", background: status==="Active"?"rgba(96,165,250,0.15)":status==="Collecting"?"rgba(74,222,128,0.15)":"rgba(138,143,158,0.15)", padding:"2px 8px", borderRadius:4, textTransform:"uppercase", letterSpacing:0.5 }}>{status}</span>
                {account && account !== "Unassigned" && <span style={{ fontSize:9, fontWeight:600, color:"#a5b4fc", background:"rgba(99,102,241,0.12)", padding:"2px 8px", borderRadius:4 }}>{account}</span>}
                <span style={{ fontSize:11, color:"var(--tp-faint)" }}>{trades.length} trade{trades.length!==1?"s":""}</span>
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:6 }} onClick={e=>e.stopPropagation()}>
            <button onClick={onAddTrade} style={{ padding:"6px 10px", borderRadius:6, border:"1px solid rgba(99,102,241,0.3)", background:"rgba(99,102,241,0.1)", color:"#a5b4fc", cursor:"pointer", fontSize:11, fontWeight:500 }}>+ Trade</button>
            <button onClick={onDeletePosition} style={{ padding:"6px 8px", borderRadius:6, border:"none", background:"transparent", color:"var(--tp-faint)", cursor:"pointer" }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><Trash2 size={13}/></button>
          </div>
        </div>

        {/* Summary Metrics */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:10 }}>
          <div style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.18)", borderRadius:8, padding:"10px 12px" }}><div style={{ fontSize:9, color:"#6366f1", textTransform:"uppercase", letterSpacing:0.6, marginBottom:3, fontWeight:600 }}>Shares Owned</div><div style={{ fontSize:15, fontWeight:700, color:"#6366f1", fontFamily:"'JetBrains Mono', monospace" }}>{ownedShares}</div></div>
          {ownedShares > 0 && <div style={{ background:"rgba(234,179,8,0.08)", border:"1px solid rgba(234,179,8,0.18)", borderRadius:8, padding:"10px 12px" }}><div style={{ fontSize:9, color:"#eab308", textTransform:"uppercase", letterSpacing:0.6, marginBottom:3, fontWeight:600 }}>Adj. Cost/Share</div><div style={{ fontSize:15, fontWeight:700, color:"#eab308", fontFamily:"'JetBrains Mono', monospace" }}>${adjCostPerShare.toFixed(2)}</div></div>}
          <div style={{ background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.18)", borderRadius:8, padding:"10px 12px" }}><div style={{ fontSize:9, color:"#4ade80", textTransform:"uppercase", letterSpacing:0.6, marginBottom:3, fontWeight:600 }}>Total Premium</div><div style={{ fontSize:15, fontWeight:700, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>${totalPremium.toFixed(2)}</div></div>
        </div>
      </div>

      {/* Trade History (collapsible) */}
      {!collapsed && (
        <div style={{ borderTop:"1px solid var(--tp-border)", background:"rgba(0,0,0,0.2)", padding:"14px 20px" }}>
          <div style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10, fontWeight:600 }}>Trade History</div>
          <div style={{ display:"grid", gap:8 }}>
            {trades.map(trade => <TradeHistoryRow key={trade.id} trade={trade} onEdit={()=>onEditTrade(trade)} onDelete={()=>onDeleteTrade(trade.id)}/>)}
          </div>
        </div>
      )}
    </div>
  );
}

function TradeHistoryRow({ trade, onEdit, onDelete }) {
  const typeColor = { CSP:"#60a5fa", CC:"#eab308", Shares:"#6366f1" }[trade.type] || "#8a8f9e";
  const typeBg = { CSP:"rgba(96,165,250,0.12)", CC:"rgba(234,179,8,0.12)", Shares:"rgba(99,102,241,0.12)" }[trade.type] || "rgba(138,143,158,0.12)";
  
  let summary = "";
  if (trade.type === "CSP") {
    const net = ((parseFloat(trade.openPremium)||0) - (parseFloat(trade.closePremium)||0)) * (parseInt(trade.contracts)||0) * 100 - (parseFloat(trade.fees)||0);
    summary = `${trade.contracts} contracts @ $${trade.strike} → $${net.toFixed(2)}`;
    if (parseFloat(trade.fees) > 0) summary += ` (fees: $${parseFloat(trade.fees).toFixed(2)})`;
    if (trade.assigned) summary += " (Assigned)";
  } else if (trade.type === "CC") {
    const net = ((parseFloat(trade.openPremium)||0) - (parseFloat(trade.closePremium)||0)) * (parseInt(trade.contracts)||0) * 100 - (parseFloat(trade.fees)||0);
    summary = `${trade.contracts} contracts @ $${trade.strike} → $${net.toFixed(2)}`;
    if (parseFloat(trade.fees) > 0) summary += ` (fees: $${parseFloat(trade.fees).toFixed(2)})`;
    if (trade.calledAway) summary += ` (Called ${trade.sharesCalledAway})`;
  } else if (trade.type === "Shares") {
    summary = `${trade.shares} shares @ $${trade.avgPrice}`;
    if (parseFloat(trade.fees) > 0) summary += ` (fees: $${parseFloat(trade.fees).toFixed(2)})`;
  }

  return (
    <div style={{ background:"var(--tp-card)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:8, padding:"10px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div style={{ flex:1 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
          <span style={{ fontSize:10, fontWeight:600, color:typeColor, background:typeBg, padding:"2px 6px", borderRadius:4, textTransform:"uppercase" }}>{trade.type}</span>
          <span style={{ fontSize:11, color:"var(--tp-faint)" }}>{trade.date}</span>
          {trade.expiry && <span style={{ fontSize:11, color:"var(--tp-faint)" }}>Exp: {trade.expiry}</span>}
        </div>
        <div style={{ fontSize:12, color:"var(--tp-text2)" }}>{summary}</div>
        {trade.notes && <div style={{ fontSize:11, color:"var(--tp-faint)", marginTop:4, fontStyle:"italic" }}>{trade.notes}</div>}
      </div>
      <div style={{ display:"flex", gap:4 }}>
        <button onClick={onEdit} style={{ padding:"4px 8px", borderRadius:4, border:"1px solid var(--tp-border-l)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:10 }}>Edit</button>
        <button onClick={onDelete} style={{ padding:"4px 6px", borderRadius:4, border:"none", background:"transparent", color:"var(--tp-faint)", cursor:"pointer" }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><Trash2 size={11}/></button>
      </div>
    </div>
  );
}

function NewPositionModal({ onSave, onClose, accounts, prefillTicker, prefillAccount }) {
  const [ticker, setTicker] = useState(prefillTicker || "");
  const [account, setAccount] = useState(prefillAccount || "");
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(3px)" }}>
      <div style={{ background:"var(--tp-sel-bg)", borderRadius:16, width:"min(96vw, 420px)", padding:28, border:"1px solid var(--tp-border-l)", boxShadow:"0 24px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}><h3 style={{ color:"var(--tp-text)", fontSize:17, fontWeight:600, margin:0 }}>New Wheel Position</h3><button onClick={onClose} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={20}/></button></div>
        <Input label="Ticker" value={ticker} onChange={v=>setTicker(v.toUpperCase())} placeholder="AAPL" style={{ marginBottom:14 }}/>
        {accounts.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 }}>Account</label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {accounts.map(a => (
                <button key={a} onClick={()=>setAccount(a)} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${account===a?"#6366f1":"var(--tp-border-l)"}`, background:account===a?"rgba(99,102,241,0.12)":"transparent", color:account===a?"#a5b4fc":"var(--tp-faint)", cursor:"pointer", fontSize:12, fontWeight:account===a?600:400 }}>{a}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
          <button onClick={onClose} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Cancel</button>
          <button onClick={()=>{if(ticker.trim()) onSave(ticker.trim(), account);}} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}>Continue</button>
        </div>
      </div>
    </div>
  );
}

function WheelTradeModal({ ticker, onSave, onClose, editTrade, accounts, defaultAccount }) {
  const [t, setT] = useState(editTrade || { id:Date.now(), ticker, type:"CSP", date:new Date().toISOString().split("T")[0], contracts:"", strike:"", openPremium:"", closePremium:"", expiry:"", assigned:false, calledAway:false, sharesCalledAway:"", shares:"", avgPrice:"", notes:"", account: defaultAccount || "", fees:"" });
  const set = k => v => setT(p=>({...p,[k]:v}));
  
  const fees = parseFloat(t.fees) || 0;
  const netPremium = t.type==="CSP" || t.type==="CC" ? ((parseFloat(t.openPremium)||0) - (parseFloat(t.closePremium)||0)) * (parseInt(t.contracts)||0) * 100 - fees : 0;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(3px)" }}>
      <div style={{ background:"var(--tp-sel-bg)", borderRadius:16, width:"min(96vw, 580px)", maxHeight:"92vh", overflowY:"auto", padding:28, border:"1px solid var(--tp-border-l)", boxShadow:"0 24px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}><h3 style={{ color:"var(--tp-text)", fontSize:17, fontWeight:600, margin:0 }}>{editTrade?"Edit":"New"} Trade - {ticker}</h3><button onClick={onClose} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={20}/></button></div>
        
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
          <div><label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 }}>Trade Type</label><select value={t.type} onChange={e=>set("type")(e.target.value)} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box" }}><option value="CSP" style={{ background:"var(--tp-sel-bg)" }}>Cash-Secured Put</option><option value="CC" style={{ background:"var(--tp-sel-bg)" }}>Covered Call</option><option value="Shares" style={{ background:"var(--tp-sel-bg)" }}>Buy/Sell Shares</option></select></div>
          <Input label="Date" value={t.date} onChange={set("date")} type="date"/>
          <div><label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 }}>Account</label><select value={t.account || ""} onChange={e=>set("account")(e.target.value)} style={{ width:"100%", padding:"9px 12px", background: t.account ? "rgba(99,102,241,0.06)" : "var(--tp-input)", border:`1px solid ${t.account ? "rgba(99,102,241,0.2)" : "var(--tp-border-l)"}`, borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box" }}><option value="" style={{ background:"var(--tp-sel-bg)" }}>— No Account —</option>{(accounts||[]).map(a => <option key={a} value={a} style={{ background:"var(--tp-sel-bg)" }}>{a}</option>)}</select></div>
        </div>

        {(t.type==="CSP" || t.type==="CC") && (
          <div style={{ background:"rgba(96,165,250,0.06)", borderRadius:10, padding:"14px 16px", marginBottom:14, border:"1px solid rgba(96,165,250,0.15)" }}>
            <div style={{ fontSize:11, color:"#60a5fa", fontWeight:600, marginBottom:10, textTransform:"uppercase", letterSpacing:0.8 }}>{t.type==="CSP"?"Cash-Secured Put":"Covered Call"} Details</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:10 }}>
              <Input label="Contracts" value={t.contracts} onChange={set("contracts")} type="number" placeholder="1"/>
              <Input label="Strike" value={t.strike} onChange={set("strike")} type="number" placeholder="150"/>
              <Input label="Expiry" value={t.expiry} onChange={set("expiry")} type="date"/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:10 }}>
              <Input label="Open Premium (per contract)" value={t.openPremium} onChange={set("openPremium")} type="number" placeholder="0.50"/>
              <Input label="Close Premium (if closed)" value={t.closePremium} onChange={set("closePremium")} type="number" placeholder="0.10"/>
              <Input label="Fees / Commissions" value={t.fees} onChange={set("fees")} type="number" placeholder="0.00"/>
            </div>
            {netPremium !== 0 && <div style={{ fontSize:12, color: netPremium > 0 ? "#4ade80" : "#f87171", fontWeight:600 }}>Net Premium: ${netPremium.toFixed(2)}{fees > 0 ? ` (after $${fees.toFixed(2)} fees)` : ""}</div>}
            {t.type==="CSP" && (
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, paddingTop:10, borderTop:"1px solid var(--tp-border)" }}>
                <input type="checkbox" checked={t.assigned} onChange={e=>set("assigned")(e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }}/>
                <label style={{ fontSize:13, color:"var(--tp-text2)", cursor:"pointer" }} onClick={()=>set("assigned")(!t.assigned)}>Shares Were Assigned</label>
              </div>
            )}
            {t.type==="CC" && (
              <div style={{ paddingTop:10, borderTop:"1px solid var(--tp-border)", marginTop:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <input type="checkbox" checked={t.calledAway} onChange={e=>set("calledAway")(e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }}/>
                  <label style={{ fontSize:13, color:"var(--tp-text2)", cursor:"pointer" }} onClick={()=>set("calledAway")(!t.calledAway)}>Shares Were Called Away</label>
                </div>
                {t.calledAway && <Input label="Shares Called Away" value={t.sharesCalledAway} onChange={set("sharesCalledAway")} type="number" placeholder="100"/>}
              </div>
            )}
          </div>
        )}

        {t.type==="Shares" && (
          <div style={{ background:"rgba(99,102,241,0.06)", borderRadius:10, padding:"14px 16px", marginBottom:14, border:"1px solid rgba(99,102,241,0.15)" }}>
            <div style={{ fontSize:11, color:"#6366f1", fontWeight:600, marginBottom:10, textTransform:"uppercase", letterSpacing:0.8 }}>Shares Transaction</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              <Input label="Shares (+/- for buy/sell)" value={t.shares} onChange={set("shares")} type="number" placeholder="100"/>
              <Input label="Avg Price" value={t.avgPrice} onChange={set("avgPrice")} type="number" placeholder="10.13"/>
              <Input label="Fees" value={t.fees} onChange={set("fees")} type="number" placeholder="0.00"/>
            </div>
          </div>
        )}

        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 }}>Notes</label>
          <textarea value={t.notes} onChange={e=>set("notes")(e.target.value)} placeholder="Optional notes..." rows={2} style={{ width:"100%", padding:"10px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", lineHeight:1.5 }}/>
        </div>

        <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
          <button onClick={onClose} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Cancel</button>
          <button onClick={()=>onSave(t)} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}>{editTrade?"Update":"Save"}</button>
        </div>
      </div>
    </div>
  );
}
// ─── DAILY GOAL TRACKER ─────────────────────────────────────────────────────
function GoalTracker({ goals, onSave, trades, theme, accounts, prefs }) {
  const defaultGoal = { startingBalance: 200, profitPct: 2, stopPct: 1, dailyLog: {} };

  // Migrate old flat structure → per-account structure
  const goalsData = useMemo(() => {
    if (!goals || typeof goals !== "object" || Array.isArray(goals)) return { accounts: {}, selectedAccount: "All" };
    // Already new format
    if (goals.accounts && typeof goals.accounts === "object") return goals;
    // Old format — migrate to "All Accounts"
    if (goals.startingBalance !== undefined) {
      return { accounts: { All: { startingBalance: goals.startingBalance, profitPct: goals.profitPct, stopPct: goals.stopPct, dailyLog: goals.dailyLog || {} } }, selectedAccount: "All" };
    }
    return { accounts: {}, selectedAccount: "All" };
  }, [goals]);

  const [selectedAccount, setSelectedAccount] = useState(goalsData.selectedAccount || "All");
  const allAccountNames = useMemo(() => {
    const names = new Set(["All", ...Object.keys(goalsData.accounts || {})]);
    (accounts || []).forEach(a => names.add(a));
    return [...names];
  }, [goalsData, accounts]);

  // Get or create goal config for selected account
  const g = useMemo(() => goalsData.accounts?.[selectedAccount] || defaultGoal, [goalsData, selectedAccount]);

  const [startingBalance, setStartingBalance] = useState(g.startingBalance);
  const [profitPct, setProfitPct] = useState(g.profitPct);
  const [stopPct, setStopPct] = useState(g.stopPct);
  const [dailyLog, setDailyLog] = useState(g.dailyLog || {});
  const [showProjection, setShowProjection] = useState(false);
  const [projectionDays, setProjectionDays] = useState(30);
  const [showBacklog, setShowBacklog] = useState(false);
  const [backlogDate, setBacklogDate] = useState("");

  // Sync when account changes
  useEffect(() => {
    const acctGoal = goalsData.accounts?.[selectedAccount] || defaultGoal;
    setStartingBalance(acctGoal.startingBalance || 200);
    setProfitPct(acctGoal.profitPct || 2);
    setStopPct(acctGoal.stopPct || 1);
    setDailyLog(acctGoal.dailyLog || {});
  }, [selectedAccount, goalsData]);

  // Save per-account
  const saveGoals = useCallback((overrides = {}) => {
    const acctData = { startingBalance, profitPct, stopPct, dailyLog, ...overrides };
    const updated = {
      ...goalsData,
      selectedAccount,
      accounts: { ...(goalsData.accounts || {}), [selectedAccount]: acctData }
    };
    onSave(updated);
  }, [startingBalance, profitPct, stopPct, dailyLog, onSave, selectedAccount, goalsData]);

  // Compute running balance from daily log
  const sortedDays = useMemo(() => Object.keys(dailyLog).sort(), [dailyLog]);
  const runningBalances = useMemo(() => {
    const bals = [];
    let bal = startingBalance;
    sortedDays.forEach(date => {
      const entry = dailyLog[date];
      const pnl = entry.pnl || 0;
      const prevBal = bal;
      bal += pnl;
      const pctPnL = prevBal > 0 ? (pnl / prevBal) * 100 : 0;
      bals.push({ date, pnl, hit: entry.hit, balance: bal, note: entry.note || "", pctPnL });
    });
    return bals;
  }, [sortedDays, dailyLog, startingBalance]);

  const currentBalance = runningBalances.length > 0 ? runningBalances[runningBalances.length - 1].balance : startingBalance;
  const totalPnL = currentBalance - startingBalance;
  const totalPct = startingBalance > 0 ? ((currentBalance - startingBalance) / startingBalance) * 100 : 0;
  const daysTraded = sortedDays.length;
  const daysHit = sortedDays.filter(d => dailyLog[d].hit === true).length;
  const daysMissed = sortedDays.filter(d => dailyLog[d].hit === false).length;

  // Today's calculations
  const todayTarget = currentBalance * (profitPct / 100);
  const todayStop = currentBalance * (stopPct / 100);
  const todayStr = new Date().toISOString().split("T")[0];
  const todayEntry = dailyLog[todayStr];

  // Auto-pull trades for a specific date (filtered by account + reset date)
  const getTradesForDate = useCallback((dateStr) => {
    const resets = prefs?.accountResets || {};
    return trades.filter(t => {
      if (t.date !== dateStr) return false;
      if (selectedAccount !== "All" && t.account !== selectedAccount) return false;
      // Respect reset dates
      if (t.account && resets[t.account]?.resetDate && t.date < resets[t.account].resetDate) return false;
      return true;
    });
  }, [trades, selectedAccount, prefs]);

  const todayTrades = useMemo(() => getTradesForDate(todayStr), [getTradesForDate, todayStr]);
  const todayTradesPnL = todayTrades.filter(t => t.pnl !== null).reduce((s, t) => s + t.pnl, 0);

  // Backlog date trades
  const backlogTrades = useMemo(() => backlogDate ? getTradesForDate(backlogDate) : [], [getTradesForDate, backlogDate]);
  const backlogTradesPnL = backlogTrades.filter(t => t.pnl !== null).reduce((s, t) => s + t.pnl, 0);

  const logDay = (date, pnl, hit) => {
    const updated = { ...dailyLog, [date]: { ...dailyLog[date], pnl, hit, note: dailyLog[date]?.note || "" } };
    setDailyLog(updated);
    saveGoals({ dailyLog: updated });
  };

  const updateNote = (date, note) => {
    const updated = { ...dailyLog, [date]: { ...dailyLog[date], note } };
    setDailyLog(updated);
    saveGoals({ dailyLog: updated });
  };

  const removeDay = (date) => {
    const updated = { ...dailyLog };
    delete updated[date];
    setDailyLog(updated);
    saveGoals({ dailyLog: updated });
  };

  // Projection data
  const projectionData = useMemo(() => {
    const data = [];
    let bal = currentBalance;
    for (let i = 0; i <= projectionDays; i++) {
      data.push({ day: i, balance: Math.round(bal * 100) / 100 });
      bal += bal * (profitPct / 100);
    }
    return data;
  }, [currentBalance, profitPct, projectionDays]);

  const inputStyle = { padding:"8px 10px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:14, outline:"none", fontFamily:"'JetBrains Mono', monospace", textAlign:"center", boxSizing:"border-box" };

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Target size={20} color="#4ade80"/>
          <span style={{ fontSize:20, fontWeight:700, color:"var(--tp-text)" }}>Daily Goal Tracker</span>
        </div>
      </div>

      {/* Account Selector */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, fontWeight:600, marginRight:4 }}>Account:</span>
        {allAccountNames.map(a => (
          <button key={a} onClick={()=>{ setSelectedAccount(a); onSave({ ...goalsData, selectedAccount: a }); }} style={{ padding:"5px 14px", borderRadius:6, border:`1px solid ${selectedAccount===a?"#6366f1":"var(--tp-border-l)"}`, background:selectedAccount===a?"rgba(99,102,241,0.12)":"transparent", color:selectedAccount===a?"#a5b4fc":"var(--tp-faint)", cursor:"pointer", fontSize:11, fontWeight:selectedAccount===a?600:400, transition:"all 0.15s" }}>{a === "All" ? "All Accounts" : a}</button>
        ))}
      </div>

      {/* Setup Row */}
      <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 22px", marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:14 }}>
          {selectedAccount === "All" ? "All Accounts" : selectedAccount} — Goal Setup
        </div>
        <div className="tp-goals-setup" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
          <div>
            <div style={{ fontSize:11, color:"var(--tp-faint)", marginBottom:5 }}>Starting Balance</div>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--tp-faintest)", fontSize:14, fontFamily:"'JetBrains Mono', monospace" }}>$</span>
              <input type="number" value={startingBalance} onChange={e=>{const v=parseFloat(e.target.value)||0;setStartingBalance(v);}} onBlur={()=>saveGoals()} style={{ ...inputStyle, width:"100%", paddingLeft:22 }}/>
            </div>
          </div>
          <div>
            <div style={{ fontSize:11, color:"#4ade80", marginBottom:5, fontWeight:600 }}>Daily Profit Target %</div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <input type="range" min={0.5} max={10} step={0.5} value={profitPct} onChange={e=>{setProfitPct(parseFloat(e.target.value));}} onMouseUp={()=>saveGoals()} style={{ flex:1, accentColor:"#4ade80" }}/>
              <span style={{ fontSize:16, fontWeight:700, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace", minWidth:50, textAlign:"right" }}>{profitPct}%</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize:11, color:"#f87171", marginBottom:5, fontWeight:600 }}>Daily Stop Loss %</div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <input type="range" min={0.5} max={10} step={0.5} value={stopPct} onChange={e=>{setStopPct(parseFloat(e.target.value));}} onMouseUp={()=>saveGoals()} style={{ flex:1, accentColor:"#f87171" }}/>
              <span style={{ fontSize:16, fontWeight:700, color:"#f87171", fontFamily:"'JetBrains Mono', monospace", minWidth:50, textAlign:"right" }}>{stopPct}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tp-goals-main" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        {/* Today's Numbers - the big display */}
        <div style={{ background:"var(--tp-panel)", border:"1px solid rgba(74,222,128,0.15)", borderRadius:14, padding:"22px 24px" }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#4ade80", textTransform:"uppercase", letterSpacing:0.8, marginBottom:16, display:"flex", alignItems:"center", gap:6 }}><Target size={13}/> Today's Targets</div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
            <div>
              <div style={{ fontSize:10, color:"var(--tp-faint)", marginBottom:3 }}>CURRENT BALANCE</div>
              <div style={{ fontSize:28, fontWeight:800, color:"var(--tp-text)", fontFamily:"'JetBrains Mono', monospace" }}>${currentBalance.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              <div style={{ fontSize:11, color: totalPnL >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace", marginTop:2 }}>{totalPnL >= 0 ? "+" : ""}{fmt(totalPnL)} ({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(1)}%) from start</div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div style={{ background:"rgba(74,222,128,0.06)", border:"1px solid rgba(74,222,128,0.15)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:"#4ade80", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6 }}>Profit Target ({profitPct}%)</div>
              <div style={{ fontSize:22, fontWeight:800, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>+${todayTarget.toFixed(2)}</div>
              <div style={{ fontSize:10, color:"var(--tp-faint)", marginTop:4 }}>Exit at ${(currentBalance + todayTarget).toFixed(2)}</div>
            </div>
            <div style={{ background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.15)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:"#f87171", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6 }}>Max Loss ({stopPct}%)</div>
              <div style={{ fontSize:22, fontWeight:800, color:"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>-${todayStop.toFixed(2)}</div>
              <div style={{ fontSize:10, color:"var(--tp-faint)", marginTop:4 }}>Stop at ${(currentBalance - todayStop).toFixed(2)}</div>
            </div>
          </div>
          {/* Quick R:R display */}
          <div style={{ marginTop:14, padding:"10px 14px", background:"var(--tp-card)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:11, color:"var(--tp-faint)" }}>Risk / Reward Ratio</span>
            <span style={{ fontSize:14, fontWeight:700, color:"#a5b4fc", fontFamily:"'JetBrains Mono', monospace" }}>1 : {(profitPct / stopPct).toFixed(1)}</span>
          </div>
        </div>

        {/* Stats + Today's log */}
        <div style={{ display:"grid", gap:14 }}>
          {/* Stats overview */}
          <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:12 }}>Progress</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:800, color:"var(--tp-text)", fontFamily:"'JetBrains Mono', monospace" }}>{daysTraded}</div>
                <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Days Traded</div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:800, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>{daysHit}</div>
                <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Goals Hit ✓</div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:800, color:"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{daysMissed}</div>
                <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Goals Missed</div>
              </div>
            </div>
            {daysTraded > 0 && (
              <div style={{ marginTop:12, height:6, borderRadius:3, background:"var(--tp-input)", overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:3, background:"linear-gradient(90deg,#4ade80,#22c55e)", width:`${(daysHit/daysTraded)*100}%`, transition:"width 0.4s" }}/>
              </div>
            )}
            {daysTraded > 0 && <div style={{ fontSize:10, color:"var(--tp-faint)", marginTop:6, textAlign:"center" }}>{((daysHit/daysTraded)*100).toFixed(0)}% hit rate</div>}
          </div>

          {/* Log today */}
          <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Log Today's Result</div>
            {todayTrades.length > 0 && (
              <div style={{ fontSize:11, color:"var(--tp-muted)", marginBottom:8, padding:"6px 10px", background:"var(--tp-card)", borderRadius:6 }}>
                Auto-detected: {todayTrades.length} trade{todayTrades.length!==1?"s":""} today → <span style={{ color: todayTradesPnL >= 0 ? "#4ade80" : "#f87171", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{fmt(todayTradesPnL)}</span>
                {!todayEntry && <button onClick={()=>logDay(todayStr, todayTradesPnL, todayTradesPnL >= todayTarget)} style={{ marginLeft:8, padding:"2px 8px", borderRadius:4, border:"1px solid #6366f1", background:"rgba(99,102,241,0.1)", color:"#a5b4fc", cursor:"pointer", fontSize:10 }}>Use this</button>}
              </div>
            )}
            {todayEntry ? (
              <div style={{ padding:"10px 14px", borderRadius:10, background: todayEntry.hit ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)", border: todayEntry.hit ? "1px solid rgba(74,222,128,0.15)" : "1px solid rgba(248,113,113,0.15)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:13, fontWeight:600, color: todayEntry.hit ? "#4ade80" : "#f87171" }}>{todayEntry.hit ? "✓ Goal Hit" : "✗ Goal Missed"} — {fmt(todayEntry.pnl)}{(() => { const prevBal = currentBalance - (todayEntry.pnl||0); return prevBal > 0 ? ` (${((todayEntry.pnl||0) / prevBal * 100).toFixed(1)}%)` : ""; })()}</span>
                  <button onClick={()=>removeDay(todayStr)} style={{ background:"none", border:"none", color:"var(--tp-faintest)", cursor:"pointer", fontSize:11 }}>Reset</button>
                </div>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, alignItems:"end" }}>
                <div>
                  <div style={{ fontSize:10, color:"var(--tp-faint)", marginBottom:4 }}>P&L ($)</div>
                  <input id="goal-pnl-input" type="number" step="0.01" placeholder="0.00" style={{ ...inputStyle, width:"100%", textAlign:"left" }}/>
                </div>
                <button onClick={()=>{const v=parseFloat(document.getElementById("goal-pnl-input")?.value)||0;logDay(todayStr,v,v>=todayTarget);}} style={{ padding:"9px 16px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#059669,#34d399)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>✓ Hit Goal</button>
                <button onClick={()=>{const v=parseFloat(document.getElementById("goal-pnl-input")?.value)||0;logDay(todayStr,v,false);}} style={{ padding:"9px 16px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#dc2626,#f87171)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>✗ Missed</button>
              </div>
            )}
          </div>

          {/* Log Previous Day */}
          <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"18px 20px" }}>
            {!showBacklog ? (
              <button onClick={()=>{setShowBacklog(true); setBacklogDate("");}} style={{ width:"100%", padding:"10px", borderRadius:8, border:"1px dashed var(--tp-border-l)", background:"transparent", color:"var(--tp-faint)", cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <Calendar size={13}/> Log a Previous Day
              </button>
            ) : (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8 }}>Log Previous Day</div>
                  <button onClick={()=>setShowBacklog(false)} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={14}/></button>
                </div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10, color:"var(--tp-faint)", marginBottom:4 }}>Select Date</div>
                  <input type="date" value={backlogDate} onChange={e=>setBacklogDate(e.target.value)} max={todayStr} style={{ ...inputStyle, width:"100%", textAlign:"left" }}/>
                </div>
                {backlogDate && dailyLog[backlogDate] && (
                  <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(234,179,8,0.06)", border:"1px solid rgba(234,179,8,0.15)", marginBottom:8, fontSize:11, color:"#eab308", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span>Already logged: {fmt(dailyLog[backlogDate].pnl)} — {dailyLog[backlogDate].hit ? "✓ Hit" : "✗ Missed"}</span>
                    <button onClick={()=>removeDay(backlogDate)} style={{ fontSize:10, color:"#f87171", background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:4, padding:"2px 8px", cursor:"pointer" }}>Remove</button>
                  </div>
                )}
                {backlogDate && !dailyLog[backlogDate] && (
                  <div>
                    {backlogTrades.length > 0 && (
                      <div style={{ fontSize:11, color:"var(--tp-muted)", marginBottom:8, padding:"6px 10px", background:"var(--tp-card)", borderRadius:6 }}>
                        Found {backlogTrades.length} trade{backlogTrades.length!==1?"s":""} on {backlogDate.slice(5)} → <span style={{ color: backlogTradesPnL >= 0 ? "#4ade80" : "#f87171", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{fmt(backlogTradesPnL)}</span>
                        <button onClick={()=>{logDay(backlogDate, backlogTradesPnL, backlogTradesPnL >= (currentBalance * (profitPct/100))); setShowBacklog(false); setBacklogDate("");}} style={{ marginLeft:8, padding:"2px 8px", borderRadius:4, border:"1px solid #6366f1", background:"rgba(99,102,241,0.1)", color:"#a5b4fc", cursor:"pointer", fontSize:10 }}>Use this</button>
                      </div>
                    )}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, alignItems:"end" }}>
                      <div>
                        <div style={{ fontSize:10, color:"var(--tp-faint)", marginBottom:4 }}>P&L ($)</div>
                        <input id="goal-backlog-pnl" type="number" step="0.01" placeholder="0.00" defaultValue={backlogTrades.length > 0 ? backlogTradesPnL.toFixed(2) : ""} style={{ ...inputStyle, width:"100%", textAlign:"left" }}/>
                      </div>
                      <button onClick={()=>{const v=parseFloat(document.getElementById("goal-backlog-pnl")?.value)||0;logDay(backlogDate,v,v>=(currentBalance*(profitPct/100)));setShowBacklog(false);setBacklogDate("");}} style={{ padding:"9px 16px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#059669,#34d399)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>✓ Hit</button>
                      <button onClick={()=>{const v=parseFloat(document.getElementById("goal-backlog-pnl")?.value)||0;logDay(backlogDate,v,false);setShowBacklog(false);setBacklogDate("");}} style={{ padding:"9px 16px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#dc2626,#f87171)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>✗ Missed</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Projection toggle */}
      <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 22px", marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: showProjection ? 14 : 0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)" }}>📈 Compound Growth Projection</span>
            <span style={{ fontSize:11, color:"var(--tp-faint)" }}>What if you hit {profitPct}% every trading day?</span>
          </div>
          <button onClick={()=>setShowProjection(!showProjection)} style={{ padding:"5px 12px", borderRadius:6, border:"1px solid var(--tp-border-l)", background: showProjection ? "rgba(99,102,241,0.1)" : "var(--tp-input)", color: showProjection ? "#a5b4fc" : "var(--tp-faint)", cursor:"pointer", fontSize:11 }}>{showProjection ? "Hide" : "Show"}</button>
        </div>
        {showProjection && (
          <div>
            <div style={{ display:"flex", gap:4, marginBottom:12 }}>
              {[10,20,30,60,90,180,252].map(d => (
                <button key={d} onClick={()=>setProjectionDays(d)} style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${projectionDays===d?"#6366f1":"var(--tp-border-l)"}`, background: projectionDays===d?"rgba(99,102,241,0.1)":"transparent", color: projectionDays===d?"#a5b4fc":"var(--tp-faint)", cursor:"pointer", fontSize:10, fontWeight:projectionDays===d?600:400 }}>{d===252?"1yr":`${d}d`}</button>
              ))}
            </div>
            <div style={{ height:180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projectionData} margin={{ top:5, right:5, bottom:5, left:5 }}>
                  <defs><linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4ade80" stopOpacity={0.3}/><stop offset="100%" stopColor="#4ade80" stopOpacity={0.02}/></linearGradient></defs>
                  <XAxis dataKey="day" tick={{ fill:"var(--tp-faintest)", fontSize:9 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill:"var(--tp-faintest)", fontSize:9 }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v>=1000?(v/1000).toFixed(1)+"k":v.toFixed(0)}`}/>
                  <Tooltip contentStyle={{ background:"var(--tp-bg2)", border:"1px solid var(--tp-border-l)", borderRadius:8, fontSize:12 }} formatter={v=>[`$${v.toFixed(2)}`, "Balance"]} labelFormatter={v=>`Day ${v}`}/>
                  <Area type="monotone" dataKey="balance" stroke="#4ade80" fill="url(#projGrad)" strokeWidth={2}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:12 }}>
              {[10,30,90,252].filter(d=>d<=projectionDays).map(d => {
                const bal = currentBalance * Math.pow(1 + profitPct/100, d);
                return (
                  <div key={d} style={{ textAlign:"center", padding:"8px", background:"var(--tp-card)", borderRadius:8 }}>
                    <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:3 }}>{d===252?"1 Year":`${d} Days`}</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>${bal>=1000?(bal/1000).toFixed(1)+"k":bal.toFixed(2)}</div>
                    <div style={{ fontSize:9, color:"var(--tp-faintest)" }}>+{((bal-currentBalance)/currentBalance*100).toFixed(0)}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Daily Log History */}
      {runningBalances.length > 0 && (
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 22px" }}>
          <div style={{ fontSize:12, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:14 }}>Daily Log</div>

          {/* Balance chart */}
          <div style={{ height:140, marginBottom:16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={runningBalances} margin={{ top:5, right:5, bottom:5, left:5 }}>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="100%" stopColor="#6366f1" stopOpacity={0.02}/></linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill:"var(--tp-faintest)", fontSize:8 }} axisLine={false} tickLine={false} tickFormatter={d => d.slice(5)}/>
                <YAxis tick={{ fill:"var(--tp-faintest)", fontSize:9 }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v.toFixed(0)}`} domain={["dataMin - 5","dataMax + 5"]}/>
                <Tooltip contentStyle={{ background:"var(--tp-bg2)", border:"1px solid var(--tp-border-l)", borderRadius:8, fontSize:12 }} formatter={v=>[`$${v.toFixed(2)}`, "Balance"]}/>
                <Area type="monotone" dataKey="balance" stroke="#6366f1" fill="url(#balGrad)" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Day rows */}
          <div style={{ display:"grid", gap:4 }}>
            <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 80px 50px 80px 80px 28px", gap:8, padding:"6px 10px", fontSize:9, color:"var(--tp-faintest)", fontWeight:600, textTransform:"uppercase", letterSpacing:0.5 }}>
              <span>Date</span><span>Note</span><span style={{ textAlign:"right" }}>P&L</span><span style={{ textAlign:"right" }}>%</span><span style={{ textAlign:"right" }}>Balance</span><span style={{ textAlign:"center" }}>Goal</span><span/>
            </div>
            {[...runningBalances].reverse().map(row => (
              <div key={row.date} style={{ display:"grid", gridTemplateColumns:"90px 1fr 80px 50px 80px 80px 28px", gap:8, padding:"8px 10px", background:"var(--tp-card)", borderRadius:6, alignItems:"center", borderLeft: row.hit ? "3px solid #4ade80" : row.hit === false ? "3px solid #f87171" : "3px solid var(--tp-border)" }}>
                <span style={{ fontSize:11, color:"var(--tp-muted)", fontFamily:"'JetBrains Mono', monospace" }}>{row.date.slice(5)}</span>
                <input value={row.note} onChange={e=>updateNote(row.date, e.target.value)} placeholder="Quick note..." style={{ padding:"3px 6px", background:"transparent", border:"1px solid transparent", borderRadius:4, color:"var(--tp-text2)", fontSize:11, outline:"none", boxSizing:"border-box" }} onFocus={e=>e.target.style.borderColor="var(--tp-border-l)"} onBlur={e=>e.target.style.borderColor="transparent"}/>
                <span style={{ textAlign:"right", fontSize:12, fontWeight:600, color: row.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(2)}</span>
                <span style={{ textAlign:"right", fontSize:10, color: row.pctPnL >= 0 ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)", fontFamily:"'JetBrains Mono', monospace" }}>{row.pctPnL >= 0 ? "+" : ""}{row.pctPnL.toFixed(1)}%</span>
                <span style={{ textAlign:"right", fontSize:12, fontWeight:600, color:"var(--tp-text)", fontFamily:"'JetBrains Mono', monospace" }}>${row.balance.toFixed(2)}</span>
                <span style={{ textAlign:"center", fontSize:14 }}>{row.hit === true ? "✅" : row.hit === false ? "❌" : "—"}</span>
                <button onClick={()=>removeDay(row.date)} style={{ background:"none", border:"none", color:"var(--tp-faintest)", cursor:"pointer", padding:0 }}><Trash2 size={12}/></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── JOURNAL TAB ─────────────────────────────────────────────────────────────
const MOOD_OPTIONS = [
  { emoji:"🔥", label:"On Fire", value:5 },
  { emoji:"😊", label:"Confident", value:4 },
  { emoji:"😐", label:"Neutral", value:3 },
  { emoji:"😰", label:"Anxious", value:2 },
  { emoji:"😤", label:"Tilted", value:1 },
];
const JOURNAL_CONDITIONS = ["Trending Up","Trending Down","Range-Bound","High Volatility","Low Volatility","Choppy","Breakout","Gap Up","Gap Down","FOMC","Earnings Season","Opex"];

const emptyEntry = (date) => ({
  id: Date.now() + Math.random(),
  date: date || new Date().toISOString().split("T")[0],
  premarketPlan: "",
  watchlistNotes: "",
  gameplan: "",
  endOfDayReview: "",
  wentWell: "",
  mistakes: "",
  lessonsLearned: "",
  mood: 3,
  energy: 3,
  marketConditions: [],
  screenshots: [],
  weeklyGoal: "",
  tags: [],
});

function JournalTab({ journal, onSave, trades, theme }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [view, setView] = useState("daily"); // daily | weekly | calendar
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [editingTag, setEditingTag] = useState("");
  const [viewingSrc, setViewingSrc] = useState(null);

  // Current entry for selected date
  const entry = useMemo(() => journal.find(e => e.date === selectedDate) || null, [journal, selectedDate]);
  const [draft, setDraft] = useState(null);

  useEffect(() => { setDraft(entry ? { ...entry } : emptyEntry(selectedDate)); }, [entry, selectedDate]);

  const isModified = useMemo(() => {
    if (!draft) return false;
    if (!entry) return draft.premarketPlan || draft.endOfDayReview || draft.wentWell || draft.mistakes || draft.lessonsLearned || draft.watchlistNotes || draft.gameplan || draft.weeklyGoal;
    return JSON.stringify(draft) !== JSON.stringify(entry);
  }, [draft, entry]);

  const save = () => {
    if (!draft) return;
    const updated = { ...draft, date: selectedDate };
    onSave(prev => {
      const idx = prev.findIndex(e => e.date === selectedDate);
      if (idx >= 0) { const u = [...prev]; u[idx] = updated; return u; }
      return [...prev, updated];
    });
  };

  const deleteEntry = () => {
    onSave(prev => prev.filter(e => e.date !== selectedDate));
    setDraft(emptyEntry(selectedDate));
  };

  // Trades for selected date
  const dayTrades = useMemo(() => trades.filter(t => t.date === selectedDate), [trades, selectedDate]);
  const dayPnL = dayTrades.filter(t => t.pnl !== null).reduce((s, t) => s + t.pnl, 0);
  const dayWins = dayTrades.filter(t => t.pnl > 0).length;
  const dayLosses = dayTrades.filter(t => t.pnl < 0).length;

  // Navigate dates
  const goDay = (offset) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const goToday = () => setSelectedDate(new Date().toISOString().split("T")[0]);
  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  // Dates with journal entries for calendar dots
  const entryDates = useMemo(() => new Set(journal.map(e => e.date)), [journal]);
  const tradeDates = useMemo(() => new Set(trades.map(t => t.date)), [trades]);

  // Weekly summary
  const weekEntries = useMemo(() => {
    const d = new Date(selectedDate + "T12:00:00");
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const week = [];
    for (let i = 0; i < 7; i++) {
      const wd = new Date(monday);
      wd.setDate(monday.getDate() + i);
      const dateStr = wd.toISOString().split("T")[0];
      const je = journal.find(e => e.date === dateStr);
      const dt = trades.filter(t => t.date === dateStr);
      week.push({ date: dateStr, entry: je, trades: dt, dayName: wd.toLocaleDateString("en-US", { weekday: "short" }), dayNum: wd.getDate() });
    }
    return week;
  }, [selectedDate, journal, trades]);

  const weekPnL = weekEntries.reduce((s, d) => s + d.trades.filter(t => t.pnl !== null).reduce((s2, t) => s2 + t.pnl, 0), 0);
  const weekTradeCount = weekEntries.reduce((s, d) => s + d.trades.length, 0);
  const weekAvgMood = (() => { const moods = weekEntries.filter(d => d.entry).map(d => d.entry.mood); return moods.length ? (moods.reduce((s, m) => s + m, 0) / moods.length) : 0; })();

  // Screenshot handling
  const handleScreenshot = (file) => {
    if (!file || !draft) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        setDraft(prev => ({ ...prev, screenshots: [...(prev.screenshots || []), { id: Date.now() + Math.random(), data: dataUrl }] }));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const addTag = () => {
    if (!editingTag.trim() || !draft) return;
    const tag = editingTag.trim().startsWith("#") ? editingTag.trim() : "#" + editingTag.trim();
    if (!(draft.tags || []).includes(tag)) setDraft(prev => ({ ...prev, tags: [...(prev.tags || []), tag] }));
    setEditingTag("");
  };

  const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const shortDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const textArea = (field, placeholder, minH = 80) => (
    <textarea value={draft?.[field] || ""} onChange={e => setDraft(prev => ({ ...prev, [field]: e.target.value }))} placeholder={placeholder} style={{ width:"100%", minHeight:minH, background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, padding:"10px 12px", outline:"none", resize:"vertical", fontFamily:"inherit", lineHeight:1.6, boxSizing:"border-box" }}/>
  );

  const sectionLabel = (text, icon) => (
    <div style={{ fontSize:10, color:"var(--tp-faint)", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6, display:"flex", alignItems:"center", gap:5 }}>{icon}{text}</div>
  );

  // ── Calendar mini-view ──
  const renderCalendar = () => {
    const firstDay = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const startDow = firstDay.getDay();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, date: dateStr, hasEntry: entryDates.has(dateStr), hasTrades: tradeDates.has(dateStr), isSelected: dateStr === selectedDate, isToday: dateStr === new Date().toISOString().split("T")[0] });
    }
    return cells;
  };

  return (
    <div>
      {/* Header bar */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Clipboard size={20} color="#a5b4fc"/>
          <span style={{ fontSize:20, fontWeight:700, color:"var(--tp-text)" }}>Trading Journal</span>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {[{id:"daily",label:"Daily"},{id:"weekly",label:"Weekly"},{id:"calendar",label:"Calendar"}].map(v => (
            <button key={v.id} onClick={()=>setView(v.id)} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${view===v.id?"#6366f1":"var(--tp-border-l)"}`, background:view===v.id?"rgba(99,102,241,0.12)":"transparent", color:view===v.id?"#a5b4fc":"var(--tp-faint)", cursor:"pointer", fontSize:12, fontWeight:view===v.id?600:400 }}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* Date navigator */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, padding:"10px 16px", background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10 }}>
        <button onClick={()=>goDay(-1)} style={{ width:32, height:32, borderRadius:8, border:"1px solid var(--tp-border-l)", background:"var(--tp-input)", color:"var(--tp-muted)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><ChevronLeft size={16}/></button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)" }}>{fmtDate(selectedDate)}</div>
          <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"center", marginTop:3 }}>
            {!isToday && <button onClick={goToday} style={{ fontSize:10, color:"#6366f1", background:"rgba(99,102,241,0.08)", border:"none", padding:"2px 8px", borderRadius:4, cursor:"pointer" }}>Today</button>}
            {dayTrades.length > 0 && <span style={{ fontSize:11, color:"var(--tp-faint)" }}>{dayTrades.length} trade{dayTrades.length!==1?"s":""} · <span style={{ color: dayPnL >= 0 ? "#4ade80" : "#f87171", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{fmt(dayPnL)}</span></span>}
            {entry && <span style={{ fontSize:11, color:"#a5b4fc" }}>✏️ Entry saved</span>}
          </div>
        </div>
        <button onClick={()=>goDay(1)} style={{ width:32, height:32, borderRadius:8, border:"1px solid var(--tp-border-l)", background:"var(--tp-input)", color:"var(--tp-muted)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><ChevronRight size={16}/></button>
      </div>

      <div className="tp-journal-layout" style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:16, alignItems:"start" }}>
        {/* ── LEFT: Main Content ── */}
        <div style={{ display:"grid", gap:14 }}>

          {/* ═══ DAILY VIEW ═══ */}
          {view === "daily" && draft && (
            <>
              {/* Pre-Market Plan */}
              <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)", display:"flex", alignItems:"center", gap:7 }}><span style={{ fontSize:16 }}>🌅</span> Pre-Market Plan</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:10, color:"var(--tp-faintest)" }}>Mood</span>
                    {MOOD_OPTIONS.map(m => (
                      <button key={m.value} onClick={()=>setDraft(p=>({...p,mood:m.value}))} title={m.label} style={{ fontSize: draft.mood===m.value ? 20 : 14, cursor:"pointer", background:"none", border:"none", opacity: draft.mood===m.value ? 1 : 0.4, transition:"all 0.15s", filter: draft.mood===m.value ? "none" : "grayscale(0.5)" }}>{m.emoji}</button>
                    ))}
                  </div>
                </div>

                {sectionLabel("Market Outlook & Bias", <TrendingUp size={10}/>)}
                {textArea("premarketPlan", "What's the market doing? What's your bias for today? Key levels (SPY, QQQ)...")}

                <div style={{ marginTop:12 }}>{sectionLabel("Watchlist & Tickers", <Crosshair size={10}/>)}</div>
                {textArea("watchlistNotes", "What tickers are you watching? What setups are you looking for?", 60)}

                <div style={{ marginTop:12 }}>{sectionLabel("Game Plan", <Target size={10}/>)}</div>
                {textArea("gameplan", "Rules for today: max trades, risk limits, what you'll avoid, when you'll stop...", 60)}
              </div>

              {/* End-of-Day Review */}
              <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)", display:"flex", alignItems:"center", gap:7 }}><span style={{ fontSize:16 }}>🌙</span> End-of-Day Review</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:10, color:"var(--tp-faintest)" }}>Energy</span>
                    {[1,2,3,4,5].map(e => (
                      <button key={e} onClick={()=>setDraft(p=>({...p,energy:e}))} style={{ fontSize:14, cursor:"pointer", background:"none", border:"none", color: e <= (draft.energy||0) ? "#eab308" : "var(--tp-faintest)", transition:"color 0.15s" }}>★</button>
                    ))}
                  </div>
                </div>

                {sectionLabel("What went well?", <Check size={10} color="#4ade80"/>)}
                {textArea("wentWell", "Trades executed well, good discipline, setups that worked...", 60)}

                <div style={{ marginTop:12 }}>{sectionLabel("Mistakes made", <AlertTriangle size={10} color="#f87171"/>)}</div>
                {textArea("mistakes", "Broke rules, revenge traded, oversized, chased entries...", 60)}

                <div style={{ marginTop:12 }}>{sectionLabel("Lessons learned", <Lightbulb size={10} color="#eab308"/>)}</div>
                {textArea("lessonsLearned", "Key takeaways to improve tomorrow...", 60)}

                <div style={{ marginTop:12 }}>{sectionLabel("Overall review")}</div>
                {textArea("endOfDayReview", "General notes, observations about the market, personal reflections...", 80)}
              </div>

              {/* Market Conditions + Tags */}
              <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px" }}>
                {sectionLabel("Market Conditions")}
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
                  {JOURNAL_CONDITIONS.map(mc => {
                    const active = (draft.marketConditions || []).includes(mc);
                    return <button key={mc} onClick={()=>setDraft(p=>({...p, marketConditions: active ? (p.marketConditions||[]).filter(c=>c!==mc) : [...(p.marketConditions||[]),mc]}))} style={{ padding:"5px 11px", borderRadius:6, border:`1px solid ${active ? "#6366f1" : "var(--tp-border-l)"}`, background: active ? "rgba(99,102,241,0.12)" : "var(--tp-input)", color: active ? "#a5b4fc" : "var(--tp-muted)", cursor:"pointer", fontSize:11, fontWeight: active?600:400 }}>{mc}</button>;
                  })}
                </div>
                {sectionLabel("Tags")}
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
                  {(draft.tags || []).map(tag => (
                    <span key={tag} style={{ fontSize:11, color:"#a5b4fc", background:"rgba(99,102,241,0.1)", padding:"4px 10px", borderRadius:6, display:"flex", alignItems:"center", gap:4 }}>{tag}<button onClick={()=>setDraft(p=>({...p,tags:(p.tags||[]).filter(t=>t!==tag)}))} style={{ background:"none", border:"none", color:"#a5b4fc", cursor:"pointer", padding:0, fontSize:13, lineHeight:1 }}>×</button></span>
                  ))}
                  <input value={editingTag} onChange={e=>setEditingTag(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addTag();}} placeholder="Add tag..." style={{ padding:"4px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:11, outline:"none", width:90 }}/>
                </div>
              </div>

              {/* Screenshots */}
              <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px" }}>
                {sectionLabel("Charts & Screenshots", <Camera size={10}/>)}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
                  {(draft.screenshots || []).map(s => (
                    <div key={s.id} style={{ position:"relative", borderRadius:8, overflow:"hidden", border:"1px solid var(--tp-border-l)", width:140, height:90, cursor:"pointer" }} onClick={()=>setViewingSrc(s.data)}>
                      <img src={s.data} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                      <button onClick={e=>{e.stopPropagation();setDraft(p=>({...p,screenshots:(p.screenshots||[]).filter(ss=>ss.id!==s.id)}));}} style={{ position:"absolute", top:2, right:2, width:18, height:18, borderRadius:9, background:"rgba(0,0,0,0.7)", border:"none", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10 }}>×</button>
                    </div>
                  ))}
                  <label style={{ width:140, height:90, borderRadius:8, border:"2px dashed var(--tp-border-l)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", background:"var(--tp-input)", flexDirection:"column", gap:4 }}>
                    <Camera size={18} color="var(--tp-faintest)"/>
                    <span style={{ fontSize:9, color:"var(--tp-faintest)" }}>Add chart</span>
                    <input type="file" accept="image/*" onChange={e=>handleScreenshot(e.target.files?.[0])} style={{ display:"none" }}/>
                  </label>
                </div>
              </div>

              {/* Save bar */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  {entry && <button onClick={deleteEntry} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:8, border:"1px solid rgba(248,113,113,0.25)", background:"rgba(248,113,113,0.06)", color:"#f87171", cursor:"pointer", fontSize:12 }}><Trash2 size={12}/> Delete Entry</button>}
                </div>
                <button onClick={save} disabled={!isModified} style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 24px", borderRadius:8, border:"none", background: isModified ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "var(--tp-input)", color: isModified ? "#fff" : "var(--tp-faintest)", cursor: isModified ? "pointer" : "default", fontSize:13, fontWeight:600, boxShadow: isModified ? "0 4px 14px rgba(99,102,241,0.3)" : "none" }}><Check size={14}/> {entry ? "Update Entry" : "Save Entry"}</button>
              </div>
            </>
          )}

          {/* ═══ WEEKLY VIEW ═══ */}
          {view === "weekly" && (
            <div>
              {/* Weekly summary header */}
              <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"18px 20px", marginBottom:14 }}>
                <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)", marginBottom:10 }}>📊 Weekly Summary</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10 }}>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>P&L</div><div style={{ fontSize:18, fontWeight:700, color: weekPnL >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(weekPnL)}</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Trades</div><div style={{ fontSize:18, fontWeight:700, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>{weekTradeCount}</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Entries</div><div style={{ fontSize:18, fontWeight:700, color:"#a5b4fc", fontFamily:"'JetBrains Mono', monospace" }}>{weekEntries.filter(d=>d.entry).length}/7</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Avg Mood</div><div style={{ fontSize:18 }}>{weekAvgMood ? MOOD_OPTIONS.find(m=>m.value===Math.round(weekAvgMood))?.emoji || "—" : "—"}</div></div>
                </div>
              </div>

              {/* Weekly goal */}
              <div style={{ background:"var(--tp-panel)", border:"1px solid rgba(99,102,241,0.15)", borderRadius:12, padding:"16px 20px", marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#a5b4fc", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6, display:"flex", alignItems:"center", gap:5 }}><Target size={11}/> Weekly Goal</div>
                <textarea value={draft?.weeklyGoal || ""} onChange={e=>setDraft(p=>({...p,weeklyGoal:e.target.value}))} placeholder="What's your main goal this week? (e.g., 'Follow my stops', 'Only A+ setups', 'Max 3 trades per day')" style={{ width:"100%", minHeight:50, background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, padding:"10px 12px", outline:"none", resize:"vertical", fontFamily:"inherit", lineHeight:1.6, boxSizing:"border-box" }}/>
                <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
                  <button onClick={save} disabled={!isModified} style={{ padding:"6px 16px", borderRadius:6, border:"none", background: isModified ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "var(--tp-input)", color: isModified ? "#fff" : "var(--tp-faintest)", cursor: isModified ? "pointer" : "default", fontSize:11, fontWeight:600 }}>Save</button>
                </div>
              </div>

              {/* Day-by-day breakdown */}
              <div style={{ display:"grid", gap:8 }}>
                {weekEntries.map(day => {
                  const pnl = day.trades.filter(t=>t.pnl!==null).reduce((s,t)=>s+t.pnl, 0);
                  const hasContent = day.entry && (day.entry.premarketPlan || day.entry.endOfDayReview || day.entry.wentWell || day.entry.mistakes || day.entry.lessonsLearned);
                  return (
                    <div key={day.date} onClick={()=>{setSelectedDate(day.date);setView("daily");}} style={{ background:"var(--tp-panel)", border:`1px solid ${day.date===selectedDate?"#6366f1":"var(--tp-panel-b)"}`, borderRadius:10, padding:"12px 16px", cursor:"pointer", transition:"border-color 0.15s" }} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.3)"} onMouseLeave={e=>e.currentTarget.style.borderColor=day.date===selectedDate?"#6366f1":"var(--tp-panel-b)"}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:36, textAlign:"center" }}>
                            <div style={{ fontSize:10, color:"var(--tp-faint)", fontWeight:600 }}>{day.dayName}</div>
                            <div style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)" }}>{day.dayNum}</div>
                          </div>
                          {day.entry && <span style={{ fontSize:16 }}>{MOOD_OPTIONS.find(m=>m.value===day.entry.mood)?.emoji || ""}</span>}
                          {hasContent && <div style={{ maxWidth:320, fontSize:12, color:"var(--tp-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{day.entry.premarketPlan || day.entry.endOfDayReview || day.entry.lessonsLearned}</div>}
                          {!hasContent && !day.trades.length && <span style={{ fontSize:11, color:"var(--tp-faintest)", fontStyle:"italic" }}>No entry</span>}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          {day.trades.length > 0 && <span style={{ fontSize:11, color:"var(--tp-faint)" }}>{day.trades.length} trade{day.trades.length!==1?"s":""}</span>}
                          {day.trades.length > 0 && <span style={{ fontSize:12, fontWeight:600, color: pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(pnl)}</span>}
                          {hasContent && <Clipboard size={11} color="#6366f1"/>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ CALENDAR VIEW ═══ */}
          {view === "calendar" && (
            <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"20px 22px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}} style={{ width:28, height:28, borderRadius:6, border:"1px solid var(--tp-border-l)", background:"var(--tp-input)", color:"var(--tp-muted)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><ChevronLeft size={14}/></button>
              <span style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)" }}>{new Date(calYear, calMonth).toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
                <button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}} style={{ width:28, height:28, borderRadius:6, border:"1px solid var(--tp-border-l)", background:"var(--tp-input)", color:"var(--tp-muted)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><ChevronRight size={14}/></button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:4 }}>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} style={{ textAlign:"center", fontSize:10, color:"var(--tp-faintest)", fontWeight:600, paddingBottom:6 }}>{d}</div>)}
                {renderCalendar().map((cell, i) => {
                  if (!cell) return <div key={`e${i}`} style={{ aspectRatio:"1" }}/>;
                  const dayTradesForCell = trades.filter(t => t.date === cell.date);
                  const pnl = dayTradesForCell.filter(t=>t.pnl!==null).reduce((s,t)=>s+t.pnl,0);
                  return (
                    <div key={cell.date} onClick={()=>{setSelectedDate(cell.date);setView("daily");}} style={{
                      aspectRatio:"1", borderRadius:8, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", position:"relative", transition:"all 0.15s", minHeight:48,
                      background: cell.isSelected ? "rgba(99,102,241,0.15)" : cell.hasEntry ? "rgba(99,102,241,0.05)" : "var(--tp-card)",
                      border: cell.isToday ? "1.5px solid #6366f1" : cell.isSelected ? "1px solid #6366f1" : "1px solid var(--tp-border)",
                    }} onMouseEnter={e=>e.currentTarget.style.background="rgba(99,102,241,0.1)"} onMouseLeave={e=>e.currentTarget.style.background=cell.isSelected?"rgba(99,102,241,0.15)":cell.hasEntry?"rgba(99,102,241,0.05)":"var(--tp-card)"}>
                      <span style={{ fontSize:12, fontWeight: cell.isToday || cell.isSelected ? 700 : 400, color: cell.isSelected ? "#a5b4fc" : cell.isToday ? "#6366f1" : "var(--tp-text2)" }}>{cell.day}</span>
                      <div style={{ display:"flex", gap:3, marginTop:2 }}>
                        {cell.hasEntry && <div style={{ width:4, height:4, borderRadius:2, background:"#6366f1" }}/>}
                        {cell.hasTrades && <div style={{ width:4, height:4, borderRadius:2, background: pnl >= 0 ? "#4ade80" : "#f87171" }}/>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display:"flex", gap:14, marginTop:14, justifyContent:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--tp-faint)" }}><div style={{ width:6, height:6, borderRadius:3, background:"#6366f1" }}/> Journal entry</div>
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--tp-faint)" }}><div style={{ width:6, height:6, borderRadius:3, background:"#4ade80" }}/> Green day</div>
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--tp-faint)" }}><div style={{ width:6, height:6, borderRadius:3, background:"#f87171" }}/> Red day</div>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="tp-journal-sidebar" style={{ display:"grid", gap:14 }}>
          {/* Mini calendar */}
          {view !== "calendar" && (
            <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"14px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><ChevronLeft size={14}/></button>
                <span style={{ fontSize:12, fontWeight:600, color:"var(--tp-text)" }}>{new Date(calYear, calMonth).toLocaleString("en-US", { month: "short", year: "numeric" })}</span>
                <button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><ChevronRight size={14}/></button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2 }}>
                {["S","M","T","W","T","F","S"].map((d,i) => <div key={i} style={{ textAlign:"center", fontSize:8, color:"var(--tp-faintest)", fontWeight:600, paddingBottom:2 }}>{d}</div>)}
                {renderCalendar().map((cell, i) => {
                  if (!cell) return <div key={`e${i}`} style={{ width:28, height:28 }}/>;
                  return (
                    <div key={cell.date} onClick={()=>{setSelectedDate(cell.date);if(view==="calendar")setView("daily");}} style={{
                      width:28, height:28, borderRadius:6, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontSize:10,
                      fontWeight: cell.isSelected || cell.isToday ? 700 : 400,
                      color: cell.isSelected ? "#a5b4fc" : cell.isToday ? "#6366f1" : "var(--tp-muted)",
                      background: cell.isSelected ? "rgba(99,102,241,0.15)" : "transparent",
                      border: cell.isToday ? "1px solid #6366f1" : "1px solid transparent"
                    }}>
                      {cell.day}
                      {(cell.hasEntry || cell.hasTrades) && <div style={{ display:"flex", gap:1, marginTop:0 }}>{cell.hasEntry && <div style={{ width:3, height:3, borderRadius:2, background:"#6366f1" }}/>}{cell.hasTrades && <div style={{ width:3, height:3, borderRadius:2, background:"#4ade80" }}/>}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Day's trades */}
          <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"14px 16px" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}><Activity size={11}/> Trades on {shortDate(selectedDate)}</div>
            {dayTrades.length === 0 ? (
              <div style={{ fontSize:11, color:"var(--tp-faintest)", fontStyle:"italic", padding:"8px 0" }}>No trades this day</div>
            ) : (
              <div style={{ display:"grid", gap:4 }}>
                {dayTrades.map(t => (
                  <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 8px", background:"var(--tp-card)", borderRadius:6 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:"var(--tp-text)" }}>{t.ticker}</span>
                      <span style={{ fontSize:9, fontWeight:600, color:t.direction==="Long"?"#60a5fa":"#f472b6" }}>{t.direction}</span>
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, color: t.pnl > 0 ? "#4ade80" : t.pnl < 0 ? "#f87171" : "var(--tp-faint)", fontFamily:"'JetBrains Mono', monospace" }}>{t.pnl !== null ? fmt(t.pnl) : t.status}</span>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 8px", borderTop:"1px solid var(--tp-border)", marginTop:2 }}>
                  <span style={{ fontSize:10, fontWeight:600, color:"var(--tp-faint)" }}>{dayWins}W / {dayLosses}L</span>
                  <span style={{ fontSize:11, fontWeight:700, color: dayPnL >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(dayPnL)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Streak info */}
          <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"14px 16px" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}><Zap size={11}/> Journal Streak</div>
            {(() => {
              let streak = 0;
              const today = new Date();
              for (let i = 0; i < 365; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const ds = d.toISOString().split("T")[0];
                const dow = d.getDay();
                if (dow === 0 || dow === 6) continue; // skip weekends
                if (entryDates.has(ds)) streak++;
                else break;
              }
              return (
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:32, fontWeight:800, color: streak >= 5 ? "#4ade80" : streak >= 1 ? "#eab308" : "var(--tp-faintest)", fontFamily:"'JetBrains Mono', monospace" }}>{streak}</div>
                  <div style={{ fontSize:11, color:"var(--tp-faint)" }}>trading day{streak !== 1 ? "s" : ""} in a row</div>
                  {streak >= 5 && <div style={{ fontSize:10, color:"#4ade80", marginTop:4 }}>🔥 Keep it up!</div>}
                  {streak === 0 && <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:4 }}>Start journaling to build a streak</div>}
                </div>
              );
            })()}
          </div>

          {/* Recent lessons */}
          {(() => {
            const recentLessons = journal.filter(e => e.lessonsLearned).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 4);
            if (recentLessons.length === 0) return null;
            return (
              <div style={{ background:"var(--tp-panel)", border:"1px solid rgba(234,179,8,0.12)", borderRadius:12, padding:"14px 16px" }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#eab308", textTransform:"uppercase", letterSpacing:0.6, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}><Lightbulb size={11}/> Recent Lessons</div>
                <div style={{ display:"grid", gap:6 }}>
                  {recentLessons.map(e => (
                    <div key={e.date} style={{ fontSize:11, color:"var(--tp-muted)", lineHeight:1.5, paddingBottom:6, borderBottom:"1px solid var(--tp-border)" }}>
                      <span style={{ fontSize:9, color:"var(--tp-faintest)" }}>{shortDate(e.date)}</span>
                      <div style={{ marginTop:2, overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{e.lessonsLearned}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {viewingSrc && <ScreenshotLightbox src={viewingSrc} onClose={()=>setViewingSrc(null)}/>}
    </div>
  );
}

// ─── HOLDINGS TAB ────────────────────────────────────────────────────────────
function HoldingsTab({ trades, accountBalances, onEditTrade, theme, dividends, onSaveDividends, onSaveTrades, prefs, onSavePrefs, onStartWheel }) {
  const [accountFilter, setAccountFilter] = useState("All");
  const [expandedTicker, setExpandedTicker] = useState(null);
  const [viewingSrc, setViewingSrc] = useState(null);
  const [currentPrices, setCurrentPrices] = useState(prefs?.holdingPrices || {});
  const [lookupLoading, setLookupLoading] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [holdingsSection, setHoldingsSection] = useState("positions"); // positions | dividends
  const [showDivModal, setShowDivModal] = useState(false);
  const [editingDiv, setEditingDiv] = useState(null);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellTarget, setSellTarget] = useState(null); // { ticker, totalShares, avgEntry, direction, account, stockTrades }

  const accounts = useMemo(() => {
    const accts = new Set();
    trades.forEach(t => { if (t.account) accts.add(t.account); });
    Object.keys(accountBalances || {}).forEach(a => accts.add(a));
    return [...accts];
  }, [trades, accountBalances]);

  const openTrades = useMemo(() => {
    return trades.filter(t => t.status === "Open" && (accountFilter === "All" || t.account === accountFilter));
  }, [trades, accountFilter]);

  // Group by account, then by ticker
  const holdings = useMemo(() => {
    const acctMap = {};

    openTrades.forEach(t => {
      const acct = t.account || "Unassigned";
      if (!acctMap[acct]) acctMap[acct] = {};
      if (!acctMap[acct][t.ticker]) acctMap[acct][t.ticker] = { ticker: t.ticker, stocks: [], options: [], futures: [] };

      if (t.assetType === "Options") acctMap[acct][t.ticker].options.push(t);
      else if (t.assetType === "Futures") acctMap[acct][t.ticker].futures.push(t);
      else acctMap[acct][t.ticker].stocks.push(t);
    });

    // Compute aggregated stats per ticker per account
    const result = {};
    Object.entries(acctMap).forEach(([acct, tickers]) => {
      result[acct] = Object.values(tickers).map(group => {
        // Stock aggregation
        let totalShares = 0, totalCost = 0;
        group.stocks.forEach(t => {
          const qty = parseFloat(t.quantity) || 0;
          const entry = parseFloat(t.entryPrice) || 0;
          const dir = t.direction === "Short" ? -1 : 1;
          totalShares += qty * dir;
          totalCost += entry * qty;
        });
        const avgEntry = totalShares !== 0 ? totalCost / Math.abs(totalShares) : 0;
        const costBasis = Math.abs(totalCost);

        // Options summary
        const optionsSummary = group.options.map(t => {
          const legs = (t.legs || []).map(leg => ({
            action: leg.action,
            type: leg.type,
            strike: leg.strike,
            expiration: leg.expiration,
            contracts: parseInt(leg.contracts) || 1,
            entryPremium: parseFloat(leg.entryPremium) || 0,
            strategy: t.optionsStrategyType
          }));
          return { id: t.id, date: t.date, strategy: t.optionsStrategyType, direction: t.direction, legs, trade: t };
        });

        // Futures summary
        const futuresSummary = group.futures.map(t => ({
          id: t.id, date: t.date, direction: t.direction,
          contracts: parseFloat(t.quantity) || 0,
          entryPrice: parseFloat(t.entryPrice) || 0,
          contract: t.futuresContract,
          trade: t
        }));

        return {
          ticker: group.ticker,
          totalShares: Math.abs(totalShares),
          netDirection: totalShares >= 0 ? "Long" : "Short",
          avgEntry,
          costBasis,
          stockTrades: group.stocks,
          options: optionsSummary,
          futures: futuresSummary,
          tradeCount: group.stocks.length + group.options.length + group.futures.length
        };
      }).sort((a, b) => b.costBasis - a.costBasis);
    });

    return result;
  }, [openTrades]);

  // All unique tickers across holdings
  const allTickers = useMemo(() => {
    const set = new Set();
    Object.values(holdings).forEach(tickers => tickers.forEach(h => { if (h.totalShares > 0) set.add(h.ticker); }));
    return [...set];
  }, [holdings]);

  // AI price lookup
  // Persist prices to prefs whenever they change
  const updatePrices = (updater) => {
    setCurrentPrices(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (onSavePrefs) onSavePrefs(p => ({ ...p, holdingPrices: next }));
      return next;
    });
  };

  // Fetch prices via server-side API (Schwab → Finnhub fallback)
  const fetchPrice = async (ticker) => {
    try {
      const resp = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [ticker] }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.prices?.[ticker]) return data.prices[ticker];
      }
    } catch {}
    return null;
  };

  const lookupPrice = async (ticker) => {
    setLookupLoading(ticker);
    setLookupError("");
    try {
      const price = await fetchPrice(ticker);
      if (price) {
        updatePrices(prev => ({ ...prev, [ticker]: price }));
      } else {
        setLookupError(`Could not find price for ${ticker} — try entering it manually`);
      }
    } catch (err) {
      setLookupError(`Lookup failed for ${ticker} — try entering it manually`);
    }
    setLookupLoading(null);
  };

  const lookupAll = async () => {
    setLookupLoading("all");
    setLookupError("");
    try {
      // Batch fetch all tickers in one API call
      const resp = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: allTickers }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.prices && Object.keys(data.prices).length > 0) {
          updatePrices(prev => ({ ...prev, ...data.prices }));
        }
        if (data.missing?.length > 0) {
          setLookupError(`Could not find prices for: ${data.missing.join(', ')}`);
        }
      } else {
        setLookupError('Quote API error — check Schwab connection');
      }
    } catch (err) {
      setLookupError('Lookup failed — try again');
    }
    setLookupLoading(null);
  };

  const setManualPrice = (ticker, val) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) updatePrices(prev => ({ ...prev, [ticker]: num }));
    else if (val === "") updatePrices(prev => { const n = { ...prev }; delete n[ticker]; return n; });
  };

  // Compute unrealized P&L for a holding
  const getUnrealizedPnL = (h) => {
    const price = currentPrices[h.ticker];
    if (!price || h.totalShares === 0) return null;
    const dir = h.netDirection === "Long" ? 1 : -1;
    return (price - h.avgEntry) * h.totalShares * dir;
  };

  const getUnrealizedPct = (h) => {
    const pnl = getUnrealizedPnL(h);
    if (pnl === null || h.costBasis === 0) return null;
    return (pnl / h.costBasis) * 100;
  };

  const getMarketValue = (h) => {
    const price = currentPrices[h.ticker];
    if (!price || h.totalShares === 0) return null;
    return price * h.totalShares;
  };

  // Portfolio-wide unrealized
  const totalUnrealized = useMemo(() => {
    let total = 0, hasAny = false;
    Object.values(holdings).forEach(tickers => tickers.forEach(h => {
      const pnl = getUnrealizedPnL(h);
      if (pnl !== null) { total += pnl; hasAny = true; }
    }));
    return hasAny ? total : null;
  }, [holdings, currentPrices]);

  const totalMarketValue = useMemo(() => {
    let total = 0, hasAny = false;
    Object.values(holdings).forEach(tickers => tickers.forEach(h => {
      const mv = getMarketValue(h);
      if (mv !== null) { total += mv; hasAny = true; }
    }));
    return hasAny ? total : null;
  }, [holdings, currentPrices]);

  const accountOrder = accountFilter === "All" ? Object.keys(holdings) : [accountFilter].filter(a => holdings[a]);

  const totalOpenTrades = openTrades.length;
  const totalCostBasis = Object.values(holdings).reduce((s, tickers) => s + tickers.reduce((s2, h) => s2 + h.costBasis, 0), 0);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", marginBottom:20 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
            <Briefcase size={20} color="#a5b4fc"/>
            <span style={{ fontSize:20, fontWeight:700, color:"var(--tp-text)" }}>Holdings</span>
          </div>
          <div style={{ fontSize:13, color:"var(--tp-faint)" }}>Current open positions across your accounts</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:11, color:"var(--tp-faint)" }}>{totalOpenTrades} open positions</div>
          {totalCostBasis > 0 && <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>${totalCostBasis.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
          <div style={{ fontSize:10, color:"var(--tp-faintest)" }}>total cost basis</div>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:20, borderBottom:"1px solid var(--tp-border)", paddingBottom:2 }}>
        {[{id:"positions",label:"Positions",icon:Briefcase},{id:"dividends",label:"Dividends",icon:DollarSign}].map(s => (
          <button key={s.id} onClick={()=>setHoldingsSection(s.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", border:"none", background:holdingsSection===s.id?"rgba(99,102,241,0.15)":"transparent", color:holdingsSection===s.id?"#a5b4fc":"#6b7080", cursor:"pointer", fontSize:13, fontWeight:600, borderRadius:"6px 6px 0 0", borderBottom:holdingsSection===s.id?"2px solid #6366f1":"none" }}><s.icon size={14}/> {s.label}</button>
        ))}
      </div>

      {/* ═══════ POSITIONS ═══════ */}
      {holdingsSection === "positions" && <>

      {/* Unrealized P&L banner when prices are entered */}
      {totalUnrealized !== null && (
        <div className="tp-unrealized-banner" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
          <div style={{ background:"var(--tp-panel)", border:`1px solid ${totalUnrealized >= 0 ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}`, borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Unrealized P&L</div>
            <div style={{ fontSize:20, fontWeight:800, color: totalUnrealized >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(totalUnrealized)}</div>
          </div>
          {totalMarketValue !== null && (
            <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
              <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Market Value</div>
              <div style={{ fontSize:20, fontWeight:800, color:"var(--tp-text)", fontFamily:"'JetBrains Mono', monospace" }}>${totalMarketValue.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
            </div>
          )}
          <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Cost Basis</div>
            <div style={{ fontSize:20, fontWeight:800, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>${totalCostBasis.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          </div>
        </div>
      )}

      {/* Account filter + AI Lookup button */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
          {accounts.length > 0 && <>
            <span style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6 }}>Account</span>
            <FilterPill label="All" active={accountFilter==="All"} onClick={()=>setAccountFilter("All")}/>
            {accounts.map(a => <FilterPill key={a} label={a} active={accountFilter===a} onClick={()=>setAccountFilter(accountFilter===a?"All":a)} color="#60a5fa"/>)}
          </>}
        </div>
        {allTickers.length > 0 && (
          <button onClick={lookupAll} disabled={lookupLoading==="all"} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, border:"1px solid rgba(99,102,241,0.3)", background:"rgba(99,102,241,0.06)", color: lookupLoading==="all" ? "var(--tp-faintest)" : "#a5b4fc", cursor: lookupLoading==="all"?"default":"pointer", fontSize:11, fontWeight:600 }}>
            {lookupLoading==="all" ? <><span style={{ display:"inline-block", width:12, height:12, borderRadius:6, border:"2px solid #a5b4fc", borderTopColor:"transparent", animation:"spin 0.8s linear infinite" }}/> Fetching prices...</> : <><Zap size={12}/> Fetch All Prices</>}
          </button>
        )}
      </div>

      {lookupError && <div style={{ fontSize:11, color:"#f87171", marginBottom:10 }}>{lookupError}</div>}

      {totalOpenTrades === 0 ? (
        <div style={{ textAlign:"center", padding:"70px 20px", color:"var(--tp-faint)" }}>
          <Briefcase size={48} style={{ margin:"0 auto 16px", opacity:0.35 }}/>
          <p style={{ fontSize:15, margin:0 }}>No open positions{accountFilter !== "All" ? ` in ${accountFilter}` : ""}.</p>
          <p style={{ fontSize:12, color:"var(--tp-faintest)", margin:"6px 0 0" }}>Open trades will appear here grouped by account and ticker.</p>
        </div>
      ) : (
        <div style={{ display:"grid", gap:20 }}>
          {accountOrder.map(acct => {
            const tickers = holdings[acct];
            if (!tickers || tickers.length === 0) return null;
            const acctBal = accountBalances?.[acct] ? parseFloat(accountBalances[acct]) : 0;
            const acctCostBasis = tickers.reduce((s, h) => s + h.costBasis, 0);

            return (
              <div key={acct}>
                {/* Account header */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, paddingBottom:8, borderBottom:"1px solid var(--tp-border)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:5, background:"#60a5fa" }}/>
                    <span style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)" }}>{acct}</span>
                    <span style={{ fontSize:12, color:"var(--tp-faint)" }}>{tickers.length} ticker{tickers.length !== 1 ? "s" : ""} · {tickers.reduce((s,h)=>s+h.tradeCount,0)} positions</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    {acctBal > 0 && <span style={{ fontSize:11, color:"var(--tp-faintest)" }}>Balance: <span style={{ color:"var(--tp-muted)", fontFamily:"'JetBrains Mono', monospace" }}>${acctBal.toLocaleString()}</span></span>}
                    <span style={{ fontSize:12, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace", fontWeight:600 }}>Cost: ${acctCostBasis.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                  </div>
                </div>

                {/* Ticker cards */}
                <div style={{ display:"grid", gap:8 }}>
                  {tickers.map(h => {
                    const isExpanded = expandedTicker === `${acct}-${h.ticker}`;
                    const hasOptions = h.options.length > 0;
                    const hasFutures = h.futures.length > 0;
                    const hasStocks = h.stockTrades.length > 0;
                    const curPrice = currentPrices[h.ticker];
                    const unrealized = getUnrealizedPnL(h);
                    const unrealizedPct = getUnrealizedPct(h);
                    const marketVal = getMarketValue(h);
                    const isLookingUp = lookupLoading === h.ticker;

                    return (
                      <div key={h.ticker} style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, overflow:"hidden", transition:"border-color 0.2s" }}
                        onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.25)"}
                        onMouseLeave={e=>e.currentTarget.style.borderColor="var(--tp-panel-b)"}>
                        
                        {/* Summary row */}
                        <div style={{ padding:"14px 18px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }} onClick={()=>setExpandedTicker(isExpanded?null:`${acct}-${h.ticker}`)}>
                          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                            {isExpanded ? <ChevronDown size={14} color="var(--tp-faint)"/> : <ChevronRight size={14} color="var(--tp-faint)"/>}
                            <div>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                                <span style={{ fontSize:17, fontWeight:700, color:"var(--tp-text)" }}>{h.ticker}</span>
                                {hasStocks && <span style={{ fontSize:9, fontWeight:600, color: h.netDirection==="Long"?"#60a5fa":"#f472b6", background: h.netDirection==="Long"?"rgba(96,165,250,0.12)":"rgba(244,114,182,0.12)", padding:"2px 7px", borderRadius:4 }}>{h.netDirection}</span>}
                                {h.stockTrades.some(s => s.source === "wheel-assignment") && <span style={{ fontSize:9, fontWeight:600, color:"#eab308", background:"rgba(234,179,8,0.12)", padding:"2px 7px", borderRadius:4 }}>WHEEL</span>}
                                {hasOptions && <span style={{ fontSize:9, fontWeight:600, color:"#a78bfa", background:"rgba(167,139,250,0.12)", padding:"2px 7px", borderRadius:4 }}>OPT ×{h.options.length}</span>}
                                {hasFutures && <span style={{ fontSize:9, fontWeight:600, color:"#eab308", background:"rgba(234,179,8,0.12)", padding:"2px 7px", borderRadius:4 }}>FUT</span>}
                              </div>
                              <div style={{ fontSize:11, color:"var(--tp-faint)" }}>
                                {hasStocks && <span>{h.totalShares.toLocaleString()} shares @ ${h.avgEntry.toFixed(2)} avg</span>}
                                {hasStocks && (hasOptions || hasFutures) && <span style={{ margin:"0 6px" }}>·</span>}
                                {hasOptions && <span>{h.options.reduce((s,o)=>s+o.legs.reduce((s2,l)=>s2+l.contracts,0),0)} option contracts</span>}
                                {hasFutures && <span>{h.futures.reduce((s,f)=>s+f.contracts,0)} futures contracts</span>}
                              </div>
                            </div>
                          </div>

                          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                            {/* Unrealized P&L display */}
                            {unrealized !== null && (
                              <div style={{ textAlign:"right" }}>
                                <div style={{ fontSize:14, fontWeight:700, color: unrealized >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(unrealized)}</div>
                                <div style={{ fontSize:10, color: unrealizedPct >= 0 ? "rgba(74,222,128,0.7)" : "rgba(248,113,113,0.7)" }}>{unrealizedPct >= 0?"+":""}{unrealizedPct.toFixed(2)}%</div>
                              </div>
                            )}
                            <div style={{ textAlign:"right" }}>
                              {marketVal !== null ? (
                                <>
                                  <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>${marketVal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                                  <div style={{ fontSize:10, color:"var(--tp-faintest)" }}>mkt value</div>
                                </>
                              ) : (
                                <>
                                  {h.costBasis > 0 && <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>${h.costBasis.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>}
                                  <div style={{ fontSize:10, color:"var(--tp-faintest)" }}>{h.tradeCount} open trade{h.tradeCount!==1?"s":""}</div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Price input row - always visible for stocks */}
                        {hasStocks && (
                          <div style={{ padding:"0 18px 12px", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }} onClick={e=>e.stopPropagation()}>
                            <span style={{ fontSize:10, color:"var(--tp-faint)", whiteSpace:"nowrap" }}>Current Price:</span>
                            <div style={{ position:"relative", width:110 }}>
                              <span style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", color:"var(--tp-faintest)", fontSize:12 }}>$</span>
                              <input type="number" step="0.01" value={curPrice || ""} onChange={e=>setManualPrice(h.ticker, e.target.value)} placeholder="0.00" style={{ width:"100%", padding:"5px 8px 5px 20px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, fontFamily:"'JetBrains Mono', monospace", outline:"none", boxSizing:"border-box" }}/>
                            </div>
                            <button onClick={()=>lookupPrice(h.ticker)} disabled={isLookingUp || lookupLoading==="all"} style={{ padding:"5px 10px", borderRadius:6, border:"1px solid rgba(99,102,241,0.2)", background:"rgba(99,102,241,0.05)", color: isLookingUp ? "var(--tp-faintest)" : "#a5b4fc", cursor: isLookingUp ? "default" : "pointer", fontSize:10, display:"flex", alignItems:"center", gap:4 }}>
                              {isLookingUp ? "..." : <><Zap size={10}/> Fetch</>}
                            </button>
                            {curPrice && unrealized !== null && (
                              <span style={{ fontSize:11, color: unrealized >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace", fontWeight:600 }}>
                                {unrealized >= 0 ? "▲" : "▼"} {fmt(unrealized)} ({unrealizedPct >= 0?"+":""}{unrealizedPct.toFixed(2)}%)
                              </span>
                            )}
                            <button onClick={()=>{setSellTarget({ ticker:h.ticker, totalShares:h.totalShares, avgEntry:h.avgEntry, direction:h.netDirection, account:acct, stockTrades:h.stockTrades }); setShowSellModal(true);}} style={{ marginLeft:"auto", padding:"5px 14px", borderRadius:6, border:"1px solid rgba(248,113,113,0.25)", background:"rgba(248,113,113,0.06)", color:"#f87171", cursor:"pointer", fontSize:10, fontWeight:600, display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap" }}>
                              <TrendingDown size={10}/> Sell / Close
                            </button>
                            {h.totalShares >= 100 && onStartWheel && (
                              <button onClick={()=>onStartWheel(h.ticker, acct, h.totalShares, h.avgEntry)} style={{ padding:"5px 14px", borderRadius:6, border:"1px solid rgba(99,102,241,0.25)", background:"rgba(99,102,241,0.06)", color:"#a5b4fc", cursor:"pointer", fontSize:10, fontWeight:600, display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap" }}>
                                <RefreshCw size={10}/> Start Wheel
                              </button>
                            )}
                          </div>
                        )}

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div style={{ borderTop:"1px solid var(--tp-border)", padding:"14px 18px", background:"rgba(0,0,0,0.12)" }}>
                            {/* Stock positions */}
                            {hasStocks && (
                              <div style={{ marginBottom: hasOptions || hasFutures ? 14 : 0 }}>
                                <div style={{ fontSize:10, color:"#60a5fa", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
                                  <TrendingUp size={11}/> Stock Positions
                                </div>
                                {h.stockTrades.map(t => (
                                  <div key={t.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", marginBottom:4, background:"var(--tp-card)", borderRadius:8, cursor:"pointer", transition:"background 0.15s" }}
                                    onMouseEnter={e=>e.currentTarget.style.background="rgba(99,102,241,0.06)"}
                                    onMouseLeave={e=>e.currentTarget.style.background="var(--tp-card)"}
                                    onClick={()=>onEditTrade(t)}>
                                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                      <span style={{ fontSize:10, color:"var(--tp-faint)" }}>{t.date}</span>
                                      <span style={{ fontSize:10, fontWeight:600, color: t.direction==="Long"?"#60a5fa":"#f472b6" }}>{t.direction}</span>
                                      <span style={{ fontSize:12, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>{t.quantity} shares</span>
                                      <span style={{ fontSize:11, color:"var(--tp-muted)" }}>@ ${parseFloat(t.entryPrice).toFixed(2)}</span>
                                    </div>
                                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                      {t.stopLoss && <span style={{ fontSize:10, color:"#f87171" }}>SL: ${t.stopLoss}</span>}
                                      {t.takeProfit && <span style={{ fontSize:10, color:"#4ade80" }}>TP: ${t.takeProfit}</span>}
                                      {curPrice && (() => { const qty = parseFloat(t.quantity)||0; const entry = parseFloat(t.entryPrice)||0; const dir = t.direction==="Short"?-1:1; const lotPnl = (curPrice - entry) * qty * dir; return <span style={{ fontSize:11, color: lotPnl>=0?"#4ade80":"#f87171", fontFamily:"'JetBrains Mono', monospace", fontWeight:600 }}>{fmt(lotPnl)}</span>; })()}
                                      {!curPrice && <span style={{ fontSize:11, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace", fontWeight:600 }}>${(parseFloat(t.entryPrice)*parseFloat(t.quantity)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>}
                                      {t.playbook && <span style={{ fontSize:9, color:"#a5b4fc", background:"rgba(99,102,241,0.1)", padding:"1px 6px", borderRadius:3 }}>{t.playbook}</span>}
                                      {(t.screenshots||[]).length > 0 && <Camera size={10} color="var(--tp-faint)"/>}
                                    </div>
                                  </div>
                                ))}
                                {h.stockTrades.length > 1 && (
                                  <div style={{ padding:"6px 12px", fontSize:11, color:"#60a5fa", fontWeight:600, display:"flex", justifyContent:"space-between" }}>
                                    <span>Total: {h.totalShares.toLocaleString()} shares, avg ${h.avgEntry.toFixed(2)}</span>
                                    <span>Cost Basis: ${h.costBasis.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Options positions */}
                            {hasOptions && (
                              <div style={{ marginBottom: hasFutures ? 14 : 0 }}>
                                <div style={{ fontSize:10, color:"#a78bfa", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
                                  <Target size={11}/> Options Positions
                                </div>
                                {h.options.map(opt => (
                                  <div key={opt.id} style={{ background:"rgba(167,139,250,0.04)", border:"1px solid rgba(167,139,250,0.1)", borderRadius:8, padding:"10px 12px", marginBottom:6, cursor:"pointer" }}
                                    onClick={()=>onEditTrade(opt.trade)}>
                                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                        <span style={{ fontSize:10, color:"var(--tp-faint)" }}>{opt.date}</span>
                                        <span style={{ fontSize:10, fontWeight:600, color:"#a78bfa", background:"rgba(167,139,250,0.15)", padding:"1px 6px", borderRadius:3 }}>{opt.strategy}</span>
                                        {(opt.trade.screenshots||[]).length > 0 && <Camera size={10} color="var(--tp-faint)"/>}
                                      </div>
                                      {opt.trade.notes && <span style={{ fontSize:9, color:"var(--tp-faintest)", fontStyle:"italic", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{opt.trade.notes}</span>}
                                    </div>
                                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                                      {opt.legs.map((leg, li) => (
                                        <div key={li} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 8px", background:"var(--tp-card)", borderRadius:5, border:"1px solid var(--tp-border)" }}>
                                          <span style={{ fontSize:10, fontWeight:600, color: leg.action==="Buy"?"#4ade80":"#f87171" }}>{leg.action}</span>
                                          <span style={{ fontSize:10, color:"var(--tp-text2)" }}>{leg.contracts}x</span>
                                          <span style={{ fontSize:10, color:"var(--tp-text)", fontWeight:600 }}>${leg.strike} {leg.type}</span>
                                          {leg.expiration && <span style={{ fontSize:9, color:"var(--tp-faint)" }}>{leg.expiration}</span>}
                                          {leg.entryPremium > 0 && <span style={{ fontSize:9, color:"var(--tp-muted)", fontFamily:"'JetBrains Mono', monospace" }}>@${leg.entryPremium.toFixed(2)}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Futures positions */}
                            {hasFutures && (
                              <div>
                                <div style={{ fontSize:10, color:"#eab308", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
                                  <BarChart3 size={11}/> Futures Positions
                                </div>
                                {h.futures.map(fut => (
                                  <div key={fut.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", background:"rgba(234,179,8,0.04)", border:"1px solid rgba(234,179,8,0.08)", borderRadius:8, marginBottom:4, cursor:"pointer" }}
                                    onClick={()=>onEditTrade(fut.trade)}>
                                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                      <span style={{ fontSize:10, color:"var(--tp-faint)" }}>{fut.date}</span>
                                      <span style={{ fontSize:10, fontWeight:600, color: fut.direction==="Long"?"#60a5fa":"#f472b6" }}>{fut.direction}</span>
                                      <span style={{ fontSize:12, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>{fut.contracts} contracts</span>
                                      <span style={{ fontSize:11, color:"var(--tp-muted)" }}>@ {fut.entryPrice}</span>
                                      {fut.contract && <span style={{ fontSize:9, color:"#eab308", background:"rgba(234,179,8,0.12)", padding:"1px 6px", borderRadius:3 }}>{fut.contract}</span>}
                                    </div>
                                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                      {fut.trade.stopLoss && <span style={{ fontSize:10, color:"#f87171" }}>SL: {fut.trade.stopLoss}</span>}
                                      {fut.trade.takeProfit && <span style={{ fontSize:10, color:"#4ade80" }}>TP: {fut.trade.takeProfit}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>}

      {/* ═══════ DIVIDENDS ═══════ */}
      {holdingsSection === "dividends" && <DividendTracker
        dividends={dividends || []}
        onSave={onSaveDividends}
        trades={trades}
        onSaveTrades={onSaveTrades}
        holdings={holdings}
        accountBalances={accountBalances}
        showModal={showDivModal}
        setShowModal={setShowDivModal}
        editingDiv={editingDiv}
        setEditingDiv={setEditingDiv}
      />}

      {showSellModal && sellTarget && <SellPositionModal
        target={sellTarget}
        onClose={()=>{setShowSellModal(false);setSellTarget(null);}}
        onSaveTrades={onSaveTrades}
      />}

      {viewingSrc && <ScreenshotLightbox src={viewingSrc} onClose={()=>setViewingSrc(null)}/>}
    </div>
  );
}

// ─── SELL / CLOSE POSITION MODAL ─────────────────────────────────────────────
function SellPositionModal({ target, onClose, onSaveTrades }) {
  const [sellQty, setSellQty] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellDate, setSellDate] = useState(new Date().toISOString().split("T")[0]);
  const [sellTime, setSellTime] = useState("");
  const [notes, setNotes] = useState("");

  const qty = parseFloat(sellQty) || 0;
  const price = parseFloat(sellPrice) || 0;
  const isValid = qty > 0 && qty <= target.totalShares && price > 0;
  const isFullClose = qty === target.totalShares;

  // Calculate P&L
  const pnl = isValid ? (
    target.direction === "Long"
      ? Math.round((price - target.avgEntry) * qty * 100) / 100
      : Math.round((target.avgEntry - price) * qty * 100) / 100
  ) : null;

  const handleSell = () => {
    if (!isValid) return;

    // FIFO: close lots from oldest to newest
    const sortedLots = [...target.stockTrades].sort((a, b) => new Date(a.date) - new Date(b.date));
    let remainingToSell = qty;
    const closedTrades = [];
    const affectedLotIds = new Set(); // Track which original lots were fully or partially consumed
    const updatedLots = []; // Partially consumed lots with reduced quantity

    sortedLots.forEach(lot => {
      if (remainingToSell <= 0) return;
      const lotQty = parseFloat(lot.quantity) || 0;
      const lotEntry = parseFloat(lot.entryPrice) || 0;

      if (lotQty <= remainingToSell) {
        // Close entire lot — mark original for removal
        affectedLotIds.add(lot.id);
        const lotPnl = target.direction === "Long"
          ? Math.round((price - lotEntry) * lotQty * 100) / 100
          : Math.round((lotEntry - price) * lotQty * 100) / 100;

        closedTrades.push({
          ...lot,
          id: Date.now() + Math.random(), // New ID for the closed trade entry
          status: "Closed",
          exitPrice: String(price),
          exitDate: sellDate,
          exitTime: sellTime,
          pnl: lotPnl,
          notes: (lot.notes ? lot.notes + " | " : "") + (notes || `Sold ${lotQty} shares @ $${price.toFixed(2)}`),
        });
        remainingToSell -= lotQty;
      } else {
        // Partial close: split the lot
        affectedLotIds.add(lot.id);
        const partialPnl = target.direction === "Long"
          ? Math.round((price - lotEntry) * remainingToSell * 100) / 100
          : Math.round((lotEntry - price) * remainingToSell * 100) / 100;

        // Closed portion — new trade entry
        closedTrades.push({
          ...lot,
          id: Date.now() + Math.random(),
          status: "Closed",
          quantity: String(remainingToSell),
          exitPrice: String(price),
          exitDate: sellDate,
          exitTime: sellTime,
          pnl: partialPnl,
          notes: (notes || `Partial sell: ${remainingToSell} of ${lotQty} shares @ $${price.toFixed(2)}`),
        });

        // Remaining open portion — keeps original ID so it stays in place
        updatedLots.push({
          ...lot,
          quantity: String(lotQty - remainingToSell),
        });
        remainingToSell = 0;
      }
    });

    // Apply changes to trades array
    onSaveTrades(prev => {
      // Remove only the affected original lots
      let next = prev.filter(t => !affectedLotIds.has(t.id));
      // Add back: reduced-qty lots (partial splits) + new closed trade entries
      return [...closedTrades, ...updatedLots, ...next];
    });

    onClose();
  };

  const inputStyle = { width:"100%", padding:"10px 14px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", boxSizing:"border-box" };
  const labelStyle = { fontSize:11, color:"var(--tp-faint)", fontWeight:600, textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:5 };

  return (
    <div className="tp-modal-overlay" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(4px)" }} onClick={onClose}>
      <div className="tp-modal" style={{ background:"var(--tp-bg2)", borderRadius:18, width:"min(92vw, 440px)", maxHeight:"90vh", overflowY:"auto", padding:"28px 24px", boxShadow:"0 24px 60px rgba(0,0,0,0.5)" }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <h3 style={{ color:"var(--tp-text)", fontSize:18, fontWeight:700, margin:0 }}>Sell / Close Position</h3>
            <div style={{ fontSize:12, color:"var(--tp-faint)", marginTop:4 }}>
              {target.ticker} · {target.totalShares.toLocaleString()} shares @ ${target.avgEntry.toFixed(2)} avg · {target.account}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={20}/></button>
        </div>

        {/* Quick fill buttons */}
        <div style={{ marginBottom:16 }}>
          <label style={labelStyle}>Shares to Sell</label>
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <button onClick={()=>setSellQty(String(target.totalShares))} style={{ padding:"6px 12px", borderRadius:6, border:"1px solid rgba(248,113,113,0.2)", background: qty===target.totalShares?"rgba(248,113,113,0.12)":"transparent", color:"#f87171", cursor:"pointer", fontSize:11, fontWeight:600 }}>All ({target.totalShares})</button>
            <button onClick={()=>setSellQty(String(Math.floor(target.totalShares/2)))} style={{ padding:"6px 12px", borderRadius:6, border:"1px solid var(--tp-border-l)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:11, fontWeight:600 }}>Half ({Math.floor(target.totalShares/2)})</button>
            <button onClick={()=>setSellQty(String(Math.floor(target.totalShares/4)))} style={{ padding:"6px 12px", borderRadius:6, border:"1px solid var(--tp-border-l)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:11, fontWeight:600 }}>Quarter ({Math.floor(target.totalShares/4)})</button>
          </div>
          <input type="number" value={sellQty} onChange={e=>setSellQty(e.target.value)} placeholder={`Max: ${target.totalShares}`} style={inputStyle} min="0" max={target.totalShares} step="1"/>
          {qty > target.totalShares && <div style={{ fontSize:11, color:"#f87171", marginTop:4 }}>Cannot sell more than {target.totalShares} shares</div>}
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={labelStyle}>Sell Price</label>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--tp-faintest)", fontSize:13 }}>$</span>
            <input type="number" value={sellPrice} onChange={e=>setSellPrice(e.target.value)} placeholder="0.00" style={{ ...inputStyle, paddingLeft:24 }} step="0.01"/>
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={sellDate} onChange={e=>setSellDate(e.target.value)} style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Time (optional)</label>
            <input type="time" value={sellTime} onChange={e=>setSellTime(e.target.value)} style={inputStyle}/>
          </div>
        </div>

        <div style={{ marginBottom:20 }}>
          <label style={labelStyle}>Notes (optional)</label>
          <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Reason for selling..." style={inputStyle}/>
        </div>

        {/* P&L Preview */}
        {isValid && (
          <div style={{ background: pnl >= 0 ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)", border:`1px solid ${pnl >= 0 ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`, borderRadius:12, padding:"16px 18px", marginBottom:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <span style={{ fontSize:12, color:"var(--tp-muted)" }}>{isFullClose ? "Close entire position" : `Sell ${qty} of ${target.totalShares} shares`}</span>
              <span style={{ fontSize:20, fontWeight:700, color: pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(pnl)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--tp-faint)" }}>
              <span>Avg entry: ${target.avgEntry.toFixed(2)} → Sell: ${price.toFixed(2)}</span>
              <span>{target.avgEntry > 0 ? ((pnl / (target.avgEntry * qty)) * 100).toFixed(2) : "0.00"}%</span>
            </div>
            {!isFullClose && (
              <div style={{ marginTop:8, fontSize:11, color:"#60a5fa" }}>
                Remaining: {(target.totalShares - qty).toLocaleString()} shares will stay open
              </div>
            )}
          </div>
        )}

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:"12px 0", borderRadius:10, border:"1px solid var(--tp-border-l)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13, fontWeight:600 }}>Cancel</button>
          <button onClick={handleSell} disabled={!isValid} style={{ flex:1, padding:"12px 0", borderRadius:10, border:"none", background: isValid ? "linear-gradient(135deg,#ef4444,#f87171)" : "var(--tp-input)", color: isValid ? "#fff" : "#5c6070", cursor: isValid ? "pointer" : "default", fontSize:13, fontWeight:700, boxShadow: isValid ? "0 4px 14px rgba(239,68,68,0.3)" : "none" }}>
            {isFullClose ? "Close Position" : `Sell ${qty || 0} Shares`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DIVIDEND TRACKER ────────────────────────────────────────────────────────
function DividendTracker({ dividends, onSave, trades, onSaveTrades, holdings, accountBalances, showModal, setShowModal, editingDiv, setEditingDiv }) {
  const [sortBy, setSortBy] = useState("date"); // date | ticker | amount

  // All tickers from current holdings (stocks only)
  const holdingTickers = useMemo(() => {
    const map = {};
    Object.entries(holdings || {}).forEach(([acct, tickers]) => {
      tickers.forEach(h => {
        if (h.totalShares > 0) {
          if (!map[h.ticker]) map[h.ticker] = { shares: 0, accounts: [] };
          map[h.ticker].shares += h.totalShares;
          map[h.ticker].accounts.push(acct);
        }
      });
    });
    return map;
  }, [holdings]);

  // Dividend summary stats
  const stats = useMemo(() => {
    const all = dividends || [];
    const totalCash = all.filter(d => d.type === "cash").reduce((s, d) => s + (parseFloat(d.totalAmount) || 0), 0);
    const totalDrip = all.filter(d => d.type === "drip").reduce((s, d) => s + (parseFloat(d.totalAmount) || 0), 0);
    const totalDripShares = all.filter(d => d.type === "drip").reduce((s, d) => s + (parseFloat(d.dripShares) || 0), 0);
    const byTicker = {};
    all.forEach(d => {
      if (!byTicker[d.ticker]) byTicker[d.ticker] = { total: 0, count: 0, drip: 0, cash: 0 };
      byTicker[d.ticker].total += parseFloat(d.totalAmount) || 0;
      byTicker[d.ticker].count++;
      if (d.type === "drip") byTicker[d.ticker].drip += parseFloat(d.totalAmount) || 0;
      else byTicker[d.ticker].cash += parseFloat(d.totalAmount) || 0;
    });
    // YTD
    const now = new Date();
    const ytdStart = `${now.getFullYear()}-01-01`;
    const ytd = all.filter(d => d.date >= ytdStart).reduce((s, d) => s + (parseFloat(d.totalAmount) || 0), 0);
    return { totalCash, totalDrip, totalDripShares, total: totalCash + totalDrip, ytd, count: all.length, byTicker };
  }, [dividends]);

  const sorted = useMemo(() => {
    const list = [...(dividends || [])];
    if (sortBy === "date") list.sort((a, b) => b.date?.localeCompare(a.date));
    else if (sortBy === "ticker") list.sort((a, b) => a.ticker?.localeCompare(b.ticker));
    else if (sortBy === "amount") list.sort((a, b) => (parseFloat(b.totalAmount)||0) - (parseFloat(a.totalAmount)||0));
    return list;
  }, [dividends, sortBy]);

  const handleSaveDiv = (div) => {
    onSave(prev => {
      const existing = prev.findIndex(d => d.id === div.id);
      if (existing >= 0) { const u = [...prev]; u[existing] = div; return u; }
      return [div, ...prev];
    });

    // If DRIP, add shares to the holding by creating/updating a trade
    if (div.type === "drip" && div.dripShares > 0 && div.dripPrice > 0) {
      // Create a synthetic "DRIP" trade that adds shares
      const dripTrade = {
        id: `drip-${div.id}`,
        date: div.date,
        ticker: div.ticker,
        direction: "Long",
        assetType: "Stock",
        entryPrice: String(div.dripPrice),
        quantity: String(div.dripShares),
        account: div.account || "",
        status: "Open",
        pnl: null,
        notes: `DRIP reinvestment: ${div.dripShares} shares @ $${parseFloat(div.dripPrice).toFixed(2)} from $${parseFloat(div.totalAmount).toFixed(2)} dividend`,
        exitPrice: "", stopLoss: "", takeProfit: "", grade: "", playbook: "",
        emotions: [], screenshots: [], tags: ["DRIP"],
        optionsStrategyType: "Single Leg", legs: [],
        futuresContract: "", tickSize: "", tickValue: "",
        entryTime: "", exitTime: ""
      };
      onSaveTrades(prev => {
        const idx = prev.findIndex(t => t.id === dripTrade.id);
        if (idx >= 0) { const u = [...prev]; u[idx] = dripTrade; return u; }
        return [dripTrade, ...prev];
      });
    }
    setShowModal(false);
    setEditingDiv(null);
  };

  const handleDeleteDiv = (id) => {
    onSave(prev => prev.filter(d => d.id !== id));
    // Also remove synthetic DRIP trade
    onSaveTrades(prev => prev.filter(t => t.id !== `drip-${id}`));
  };

  return (
    <div>
      {/* Summary banner */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))", gap:10, marginBottom:20 }}>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Total Dividends</div>
          <div style={{ fontSize:20, fontWeight:800, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>${stats.total.toFixed(2)}</div>
          <div style={{ fontSize:10, color:"var(--tp-faintest)" }}>{stats.count} payments</div>
        </div>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>YTD Income</div>
          <div style={{ fontSize:20, fontWeight:800, color:"#60a5fa", fontFamily:"'JetBrains Mono', monospace" }}>${stats.ytd.toFixed(2)}</div>
        </div>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Cash Payouts</div>
          <div style={{ fontSize:20, fontWeight:800, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>${stats.totalCash.toFixed(2)}</div>
        </div>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>DRIP Reinvested</div>
          <div style={{ fontSize:20, fontWeight:800, color:"#a5b4fc", fontFamily:"'JetBrains Mono', monospace" }}>${stats.totalDrip.toFixed(2)}</div>
          {stats.totalDripShares > 0 && <div style={{ fontSize:10, color:"var(--tp-faintest)" }}>{stats.totalDripShares.toFixed(4)} shares added</div>}
        </div>
      </div>

      {/* Per-ticker breakdown (if dividends exist) */}
      {Object.keys(stats.byTicker).length > 0 && (
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"16px 18px", marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--tp-text)", marginBottom:10, textTransform:"uppercase", letterSpacing:0.8 }}>Income by Ticker</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {Object.entries(stats.byTicker).sort((a,b) => b[1].total - a[1].total).map(([ticker, d]) => (
              <div key={ticker} style={{ background:"var(--tp-card)", borderRadius:8, padding:"8px 14px", minWidth:90, textAlign:"center" }}>
                <div style={{ fontSize:13, fontWeight:700, color:"var(--tp-text)", marginBottom:2 }}>{ticker}</div>
                <div style={{ fontSize:14, fontWeight:800, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>${d.total.toFixed(2)}</div>
                <div style={{ fontSize:9, color:"var(--tp-faintest)" }}>{d.count} payment{d.count !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add + sort controls */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ display:"flex", gap:6 }}>
          {["date","ticker","amount"].map(s => (
            <button key={s} onClick={()=>setSortBy(s)} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${sortBy===s?"#6366f1":"var(--tp-border-l)"}`, background:sortBy===s?"rgba(99,102,241,0.12)":"transparent", color:sortBy===s?"#a5b4fc":"var(--tp-muted)", cursor:"pointer", fontSize:11, fontWeight:600, textTransform:"capitalize" }}>{s}</button>
          ))}
        </div>
        <button onClick={()=>{setEditingDiv(null);setShowModal(true);}} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}>
          <Plus size={14}/> Log Dividend
        </button>
      </div>

      {/* Dividend log */}
      {sorted.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--tp-faint)" }}>
          <DollarSign size={48} style={{ margin:"0 auto 16px", opacity:0.35 }}/>
          <p style={{ fontSize:15, margin:0 }}>No dividends logged yet.</p>
          <p style={{ fontSize:12, color:"var(--tp-faintest)", margin:"6px 0 0" }}>Click "Log Dividend" to record a payment. Choose Cash to add to your account balance, or DRIP to add shares to your position.</p>
        </div>
      ) : (
        <div style={{ display:"grid", gap:8 }}>
          {sorted.map(d => (
            <div key={d.id} style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 18px", display:"grid", gridTemplateColumns:"90px 70px 1fr auto auto", gap:12, alignItems:"center" }}>
              <div style={{ fontSize:12, color:"var(--tp-muted)", fontFamily:"'JetBrains Mono', monospace" }}>{d.date}</div>
              <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)" }}>{d.ticker}</div>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4, background: d.type === "drip" ? "rgba(165,180,252,0.12)" : "rgba(74,222,128,0.12)", color: d.type === "drip" ? "#a5b4fc" : "#4ade80", textTransform:"uppercase" }}>{d.type}</span>
                  <span style={{ fontSize:11, color:"var(--tp-faint)" }}>{d.shares} shares × ${parseFloat(d.perShare).toFixed(4)}/sh</span>
                </div>
                {d.type === "drip" && d.dripShares && (
                  <div style={{ fontSize:10, color:"#a5b4fc", marginTop:3 }}>+{parseFloat(d.dripShares).toFixed(4)} shares @ ${parseFloat(d.dripPrice).toFixed(2)}</div>
                )}
                {d.account && <div style={{ fontSize:9, color:"var(--tp-faintest)", marginTop:2 }}>{d.account}</div>}
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace", textAlign:"right" }}>${parseFloat(d.totalAmount).toFixed(2)}</div>
              <div style={{ display:"flex", gap:4 }}>
                <button onClick={()=>{setEditingDiv(d);setShowModal(true);}} style={{ width:28, height:28, borderRadius:6, border:"1px solid var(--tp-border-l)", background:"transparent", color:"var(--tp-faint)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }} title="Edit"><FileText size={12}/></button>
                <button onClick={()=>handleDeleteDiv(d.id)} style={{ width:28, height:28, borderRadius:6, border:"1px solid rgba(248,113,113,0.2)", background:"transparent", color:"#f87171", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }} title="Delete"><Trash2 size={12}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dividend Modal */}
      {showModal && <DividendModal
        onSave={handleSaveDiv}
        onClose={()=>{setShowModal(false);setEditingDiv(null);}}
        editDiv={editingDiv}
        holdingTickers={holdingTickers}
        accountBalances={accountBalances}
      />}
    </div>
  );
}

// ─── DIVIDEND MODAL ─────────────────────────────────────────────────────────
function DividendModal({ onSave, onClose, editDiv, holdingTickers, accountBalances }) {
  const [div, setDiv] = useState(editDiv || {
    id: Date.now(), date: new Date().toISOString().split("T")[0],
    ticker: "", perShare: "", shares: "", totalAmount: "",
    type: "cash", dripPrice: "", dripShares: "",
    account: "", notes: ""
  });
  const [customTicker, setCustomTicker] = useState(false);

  const set = (k) => (v) => setDiv(prev => {
    const next = { ...prev, [k]: typeof v === "object" && v.target ? v.target.value : v };
    // Auto-calculate total when perShare or shares change
    if (k === "perShare" || k === "shares") {
      const ps = parseFloat(k === "perShare" ? (typeof v === "object" ? v.target.value : v) : next.perShare) || 0;
      const sh = parseFloat(k === "shares" ? (typeof v === "object" ? v.target.value : v) : next.shares) || 0;
      next.totalAmount = ps > 0 && sh > 0 ? (ps * sh).toFixed(2) : next.totalAmount;
    }
    // Auto-calculate DRIP shares when dripPrice changes
    if ((k === "dripPrice" || k === "totalAmount") && next.type === "drip") {
      const total = parseFloat(k === "totalAmount" ? (typeof v === "object" ? v.target.value : v) : next.totalAmount) || 0;
      const dp = parseFloat(k === "dripPrice" ? (typeof v === "object" ? v.target.value : v) : next.dripPrice) || 0;
      if (total > 0 && dp > 0) next.dripShares = (total / dp).toFixed(4);
    }
    return next;
  });

  // Auto-fill shares when ticker selected from holdings
  const handleTickerChange = (ticker) => {
    const h = holdingTickers[ticker];
    setDiv(prev => ({
      ...prev,
      ticker,
      shares: h ? String(h.shares) : prev.shares,
      account: h?.accounts?.[0] || prev.account
    }));
  };

  const allAccounts = Object.keys(accountBalances || {});
  const tickerList = Object.keys(holdingTickers);
  const total = parseFloat(div.totalAmount) || 0;
  const dripShares = parseFloat(div.dripShares) || 0;

  const canSave = div.ticker && div.date && total > 0;

  const inputStyle = { width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"'JetBrains Mono', monospace", boxSizing:"border-box" };
  const labelStyle = { fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(3px)" }}>
      <div style={{ background:"var(--tp-sel-bg)", borderRadius:16, width:"min(96vw, 520px)", maxHeight:"90vh", overflow:"auto", padding:28, border:"1px solid var(--tp-border-l)", boxShadow:"0 24px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <h3 style={{ color:"var(--tp-text)", fontSize:17, fontWeight:600, margin:0 }}>{editDiv ? "Edit Dividend" : "Log Dividend Payment"}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={20}/></button>
        </div>

        {/* Row 1: Ticker + Date + Account */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
          <div>
            <label style={labelStyle}>Ticker</label>
            {tickerList.length > 0 && !customTicker ? (
              <select value={div.ticker} onChange={e=>{if(e.target.value==="_custom"){setCustomTicker(true);setDiv(p=>({...p,ticker:""}));}else{handleTickerChange(e.target.value);}}} style={{ ...inputStyle, appearance:"none", cursor:"pointer" }}>
                <option value="" style={{ background:"var(--tp-sel-bg)" }}>Select...</option>
                {tickerList.map(t => <option key={t} value={t} style={{ background:"var(--tp-sel-bg)" }}>{t} ({holdingTickers[t].shares} shares)</option>)}
                <option value="_custom" style={{ background:"var(--tp-sel-bg)" }}>Other ticker...</option>
              </select>
            ) : (
              <div style={{ display:"flex", gap:6 }}>
                <input type="text" value={div.ticker} onChange={e=>setDiv(p=>({...p, ticker:e.target.value.toUpperCase()}))} placeholder="AAPL" style={{ ...inputStyle, flex:1 }} maxLength={10} autoFocus/>
                {tickerList.length > 0 && <button onClick={()=>{setCustomTicker(false);setDiv(p=>({...p,ticker:""}));}} style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--tp-border-l)", background:"var(--tp-input)", color:"var(--tp-faint)", cursor:"pointer", fontSize:10, whiteSpace:"nowrap" }}>List</button>}
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Payment Date</label>
            <input type="date" value={div.date} onChange={set("date")} style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Account</label>
            <select value={div.account} onChange={set("account")} style={{ ...inputStyle, appearance:"none", cursor:"pointer" }}>
              <option value="" style={{ background:"var(--tp-sel-bg)" }}>—</option>
              {allAccounts.map(a => <option key={a} value={a} style={{ background:"var(--tp-sel-bg)" }}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Row 2: Per Share + Shares + Total */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
          <div>
            <label style={labelStyle}>$ Per Share</label>
            <input type="number" value={div.perShare} onChange={set("perShare")} placeholder="0.96" step="0.0001" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Shares Held</label>
            <input type="number" value={div.shares} onChange={set("shares")} placeholder="100" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Total Amount</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--tp-faintest)", fontSize:13 }}>$</span>
              <input type="number" value={div.totalAmount} onChange={set("totalAmount")} placeholder="96.00" step="0.01" style={{ ...inputStyle, paddingLeft:22, fontWeight:700, color:"#4ade80" }}/>
            </div>
          </div>
        </div>

        {/* Row 3: Type toggle */}
        <div style={{ marginBottom:12 }}>
          <label style={labelStyle}>Payout Type</label>
          <div style={{ display:"flex", gap:0, borderRadius:8, overflow:"hidden", border:"1px solid var(--tp-border-l)" }}>
            <button onClick={()=>setDiv(p=>({...p, type:"cash"}))} style={{ flex:1, padding:"10px 0", border:"none", background:div.type==="cash"?"rgba(74,222,128,0.15)":"var(--tp-card)", color:div.type==="cash"?"#4ade80":"var(--tp-faint)", cursor:"pointer", fontSize:12, fontWeight:700 }}>
              💵 Cash Payout
            </button>
            <button onClick={()=>setDiv(p=>({...p, type:"drip"}))} style={{ flex:1, padding:"10px 0", border:"none", borderLeft:"1px solid var(--tp-border-l)", background:div.type==="drip"?"rgba(165,180,252,0.15)":"var(--tp-card)", color:div.type==="drip"?"#a5b4fc":"var(--tp-faint)", cursor:"pointer", fontSize:12, fontWeight:700 }}>
              🔄 DRIP Reinvest
            </button>
          </div>
        </div>

        {/* DRIP fields */}
        {div.type === "drip" && (
          <div style={{ background:"rgba(165,180,252,0.05)", border:"1px solid rgba(165,180,252,0.12)", borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#a5b4fc", marginBottom:10 }}>DRIP Reinvestment Details</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <label style={labelStyle}>Reinvestment Price</label>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--tp-faintest)", fontSize:13 }}>$</span>
                  <input type="number" value={div.dripPrice} onChange={set("dripPrice")} placeholder="150.25" step="0.01" style={{ ...inputStyle, paddingLeft:22 }}/>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Shares Added</label>
                <input type="number" value={div.dripShares} onChange={set("dripShares")} placeholder="0.6389" step="0.0001" style={{ ...inputStyle, fontWeight:700, color:"#a5b4fc" }} readOnly={parseFloat(div.dripPrice) > 0 && total > 0}/>
              </div>
            </div>
            {total > 0 && dripShares > 0 && (
              <div style={{ marginTop:10, fontSize:11, color:"var(--tp-faint)", lineHeight:1.6 }}>
                ${total.toFixed(2)} ÷ ${parseFloat(div.dripPrice).toFixed(2)} = <strong style={{ color:"#a5b4fc" }}>{dripShares.toFixed(4)} shares</strong> added to your {div.ticker} position
              </div>
            )}
          </div>
        )}

        {/* Cash payout info */}
        {div.type === "cash" && total > 0 && (
          <div style={{ background:"rgba(74,222,128,0.05)", border:"1px solid rgba(74,222,128,0.12)", borderRadius:10, padding:"12px 16px", marginBottom:12, fontSize:11, color:"#4ade80" }}>
            💵 ${total.toFixed(2)} will be recorded as cash income{div.account ? ` in ${div.account}` : ""}
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom:16 }}>
          <label style={labelStyle}>Notes (optional)</label>
          <input type="text" value={div.notes || ""} onChange={set("notes")} placeholder="Quarterly dividend, special dividend, etc." style={inputStyle}/>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
          <button onClick={onClose} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--tp-border-l)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Cancel</button>
          <button onClick={()=>canSave && onSave(div)} disabled={!canSave} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:canSave?"linear-gradient(135deg,#6366f1,#8b5cf6)":"var(--tp-card)", color:canSave?"#fff":"var(--tp-faintest)", cursor:canSave?"pointer":"not-allowed", fontSize:13, fontWeight:600, boxShadow:canSave?"0 4px 14px rgba(99,102,241,0.3)":"none" }}>
            {editDiv ? "Update" : "Log Dividend"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── REVIEW TAB ──────────────────────────────────────────────────────────────
function ReviewTab({ trades, accountBalances, prefs, journal, goals, playbooks }) {
  const [section, setSection] = useState("risk"); // risk | performance | insights | replay | coach
  const [replayIdx, setReplayIdx] = useState(0);
  const [replayFilter, setReplayFilter] = useState("all"); // all | wins | losses
  const [viewingSrc, setViewingSrc] = useState(null);

  const closed = useMemo(() => {
    const resets = prefs?.accountResets || {};
    return trades.filter(t => {
      if (t.pnl === null) return false;
      if (t.account && resets[t.account]?.resetDate && t.date < resets[t.account].resetDate) return false;
      return true;
    }).sort((a,b)=>new Date(a.date)-new Date(b.date));
  }, [trades, prefs]);
  const totalCapital = useMemo(() => Object.values(accountBalances||{}).reduce((s,v)=>s+(parseFloat(v)||0),0), [accountBalances]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  RISK MANAGEMENT ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  const riskStats = useMemo(() => {
    if (closed.length === 0) return null;
    
    const withStop = closed.filter(t => t.stopLoss && parseFloat(t.stopLoss) > 0);
    const withTP = closed.filter(t => t.takeProfit && parseFloat(t.takeProfit) > 0);
    
    // Stop honor rate: if you had a stop and the loss was <= the planned stop loss amount
    let stopsHonored = 0, stopsBroken = 0;
    withStop.forEach(t => {
      const entry = parseFloat(t.entryPrice);
      const stop = parseFloat(t.stopLoss);
      if (isNaN(entry) || isNaN(stop) || t.pnl === null) return;
      const plannedRisk = Math.abs(entry - stop) * (parseFloat(t.quantity) || 1);
      const actualLoss = t.pnl < 0 ? Math.abs(t.pnl) : 0;
      if (t.pnl >= 0 || actualLoss <= plannedRisk * 1.15) stopsHonored++; else stopsBroken++;
    });
    
    // Risk per trade as % of account
    const riskPerTrade = closed.map(t => {
      const acctBal = t.account && accountBalances[t.account] ? parseFloat(accountBalances[t.account]) : totalCapital;
      if (!acctBal || acctBal === 0) return null;
      const loss = t.pnl < 0 ? Math.abs(t.pnl) : 0;
      return { ...t, riskPct: (loss / acctBal) * 100, acctBal };
    }).filter(Boolean);
    
    const oversizedTrades = riskPerTrade.filter(t => t.riskPct > 3);
    const avgRiskPct = riskPerTrade.length ? riskPerTrade.filter(t=>t.pnl<0).reduce((s,t)=>s+t.riskPct,0) / (riskPerTrade.filter(t=>t.pnl<0).length||1) : 0;
    
    // Planned R:R vs actual
    const rrTrades = closed.filter(t => t.stopLoss && t.takeProfit && parseFloat(t.stopLoss) > 0 && parseFloat(t.takeProfit) > 0).map(t => {
      const rr = calcRiskReward(t);
      return rr ? { ...t, plannedRR: rr.ratio, plannedRisk: rr.maxRisk, plannedReward: rr.maxReward } : null;
    }).filter(Boolean);
    
    const avgPlannedRR = rrTrades.length ? rrTrades.reduce((s,t)=>s+(t.plannedRR||0),0)/rrTrades.length : 0;
    
    // Largest loss
    const biggestLoss = closed.reduce((worst, t) => t.pnl < (worst?.pnl ?? 0) ? t : worst, null);
    const biggestWin = closed.reduce((best, t) => t.pnl > (best?.pnl ?? 0) ? t : best, null);
    
    // Consecutive loss analysis
    let maxConsecLoss = 0, maxConsecLossAmount = 0, tempLoss = 0, tempLossAmt = 0;
    closed.forEach(t => {
      if (t.pnl < 0) { tempLoss++; tempLossAmt += t.pnl; maxConsecLoss = Math.max(maxConsecLoss, tempLoss); maxConsecLossAmount = Math.min(maxConsecLossAmount, tempLossAmt); }
      else { tempLoss = 0; tempLossAmt = 0; }
    });

    return { withStop:withStop.length, withTP:withTP.length, stopsHonored, stopsBroken, oversizedTrades, avgRiskPct, rrTrades, avgPlannedRR, biggestLoss, biggestWin, maxConsecLoss, maxConsecLossAmount, stopRate: (withStop.length > 0 ? (stopsHonored/(stopsHonored+stopsBroken))*100 : null), riskPerTrade };
  }, [closed, accountBalances, totalCapital]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  CORRELATION INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════════
  const insights = useMemo(() => {
    if (closed.length < 3) return [];
    const results = [];
    
    // Day of week analysis
    const byDay = {};
    closed.forEach(t => { const d = new Date(t.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long"}); if(!byDay[d]) byDay[d]={wins:0,losses:0,pnl:0}; if(t.pnl>0)byDay[d].wins++; else byDay[d].losses++; byDay[d].pnl+=t.pnl; });
    const dayEntries = Object.entries(byDay).filter(([,v])=>(v.wins+v.losses)>=2);
    const bestDay = dayEntries.sort((a,b)=>(b[1].wins/(b[1].wins+b[1].losses))-(a[1].wins/(a[1].wins+a[1].losses)))[0];
    const worstDay = dayEntries.sort((a,b)=>(a[1].wins/(a[1].wins+a[1].losses))-(b[1].wins/(b[1].wins+b[1].losses)))[0];
    if (bestDay) { const wr = (bestDay[1].wins/(bestDay[1].wins+bestDay[1].losses)*100); if(wr > 55) results.push({ type:"positive", icon:"📅", text:`Your best day is ${bestDay[0]} with a ${wr.toFixed(0)}% win rate (${bestDay[1].wins}W/${bestDay[1].losses}L)`, data:{day:bestDay[0],wr,pnl:bestDay[1].pnl} }); }
    if (worstDay && worstDay[0]!==bestDay?.[0]) { const wr = (worstDay[1].wins/(worstDay[1].wins+worstDay[1].losses)*100); if(wr < 45) results.push({ type:"warning", icon:"📅", text:`${worstDay[0]}s are tough — ${wr.toFixed(0)}% win rate (${worstDay[1].wins}W/${worstDay[1].losses}L), total ${fmt(worstDay[1].pnl)}`, data:{day:worstDay[0],wr} }); }
    
    // Emotion analysis
    const emotionStats = {};
    closed.forEach(t => { (t.emotions||[]).forEach(e => { if(!emotionStats[e]) emotionStats[e]={wins:0,losses:0,pnl:0,count:0}; emotionStats[e].count++; if(t.pnl>0)emotionStats[e].wins++; else emotionStats[e].losses++; emotionStats[e].pnl+=t.pnl; }); });
    Object.entries(emotionStats).filter(([,v])=>v.count>=2).forEach(([emotion,v]) => {
      const wr = (v.wins/v.count)*100;
      if (wr < 40) results.push({ type:"danger", icon:"😤", text:`When feeling "${emotion}", your win rate drops to ${wr.toFixed(0)}% with avg P&L of ${fmt(v.pnl/v.count)} (${v.count} trades)`, data:{emotion,wr} });
      if (wr > 65) results.push({ type:"positive", icon:"😊", text:`"${emotion}" trades have a ${wr.toFixed(0)}% win rate, averaging ${fmt(v.pnl/v.count)} per trade (${v.count} trades)`, data:{emotion,wr} });
    });
    
    // Timeframe analysis
    const tfStats = {};
    closed.forEach(t => { const tf = t.timeframe; if(!tf) return; if(!tfStats[tf]) tfStats[tf]={wins:0,losses:0,pnl:0,count:0}; tfStats[tf].count++; if(t.pnl>0)tfStats[tf].wins++; else tfStats[tf].losses++; tfStats[tf].pnl+=t.pnl; });
    Object.entries(tfStats).filter(([,v])=>v.count>=3).forEach(([tf,v]) => {
      const wr = (v.wins/v.count)*100;
      const avgPnl = v.pnl/v.count;
      if (avgPnl > 0) results.push({ type:"positive", icon:"⏱️", text:`${tf} trades average ${fmt(avgPnl)} with ${wr.toFixed(0)}% win rate across ${v.count} trades`, data:{tf,wr,avgPnl} });
      else if (v.count >= 5) results.push({ type:"warning", icon:"⏱️", text:`${tf} trades are net negative: ${fmt(avgPnl)} avg, ${wr.toFixed(0)}% win rate (${v.count} trades)`, data:{tf,wr,avgPnl} });
    });
    
    // Asset type analysis
    const assetStats = {};
    closed.forEach(t => { const a = t.assetType; if(!assetStats[a]) assetStats[a]={wins:0,losses:0,pnl:0,count:0}; assetStats[a].count++; if(t.pnl>0)assetStats[a].wins++; else assetStats[a].losses++; assetStats[a].pnl+=t.pnl; });
    Object.entries(assetStats).filter(([,v])=>v.count>=3).forEach(([asset,v]) => {
      const wr = (v.wins/v.count)*100;
      results.push({ type: v.pnl > 0 ? "positive" : "warning", icon: asset==="Stock"?"📈":asset==="Options"?"🎯":"📊", text:`${asset} trades: ${wr.toFixed(0)}% win rate, ${fmt(v.pnl)} total across ${v.count} trades`, data:{asset,wr,pnl:v.pnl} });
    });

    // Time of day analysis (if entry times exist)
    const amTrades = closed.filter(t => t.entryTime && parseInt(t.entryTime.split(":")[0]) < 12);
    const pmTrades = closed.filter(t => t.entryTime && parseInt(t.entryTime.split(":")[0]) >= 12);
    if (amTrades.length >= 3 && pmTrades.length >= 3) {
      const amWR = (amTrades.filter(t=>t.pnl>0).length/amTrades.length)*100;
      const pmWR = (pmTrades.filter(t=>t.pnl>0).length/pmTrades.length)*100;
      if (Math.abs(amWR - pmWR) > 15) {
        const better = amWR > pmWR ? "morning" : "afternoon";
        const betterWR = Math.max(amWR, pmWR);
        results.push({ type:"positive", icon:"🕐", text:`You perform better in the ${better} with a ${betterWR.toFixed(0)}% win rate vs ${Math.min(amWR,pmWR).toFixed(0)}% in the ${better==="morning"?"afternoon":"morning"}`, data:{amWR,pmWR} });
      }
    }

    // Grade analysis
    const gradeStats = {};
    closed.forEach(t => { const g = t.grade; if(!g) return; if(!gradeStats[g]) gradeStats[g]={wins:0,losses:0,pnl:0,count:0}; gradeStats[g].count++; if(t.pnl>0)gradeStats[g].wins++; else gradeStats[g].losses++; gradeStats[g].pnl+=t.pnl; });
    const goodGrades = ["A+","A"].filter(g=>gradeStats[g]&&gradeStats[g].count>=2);
    const badGrades = ["D","F"].filter(g=>gradeStats[g]&&gradeStats[g].count>=2);
    if (goodGrades.length > 0) {
      const combined = goodGrades.reduce((s,g)=>({wins:s.wins+gradeStats[g].wins,count:s.count+gradeStats[g].count,pnl:s.pnl+gradeStats[g].pnl}),{wins:0,count:0,pnl:0});
      results.push({ type:"positive", icon:"⭐", text:`A-grade trades: ${((combined.wins/combined.count)*100).toFixed(0)}% win rate, ${fmt(combined.pnl)} total — trust your best setups`, data:{grades:goodGrades} });
    }
    if (badGrades.length > 0) {
      const combined = badGrades.reduce((s,g)=>({wins:s.wins+gradeStats[g].wins,count:s.count+gradeStats[g].count,pnl:s.pnl+gradeStats[g].pnl}),{wins:0,count:0,pnl:0});
      results.push({ type:"danger", icon:"⚠️", text:`D/F-grade trades cost you ${fmt(combined.pnl)} across ${combined.count} trades — consider your entry criteria`, data:{grades:badGrades} });
    }

    // Playbook performance
    const pbStats = {};
    closed.forEach(t => { const p = t.playbook; if(!p) return; if(!pbStats[p]) pbStats[p]={wins:0,count:0,pnl:0}; pbStats[p].count++; if(t.pnl>0)pbStats[p].wins++; pbStats[p].pnl+=t.pnl; });
    Object.entries(pbStats).filter(([,v])=>v.count>=3).forEach(([name,v]) => {
      const wr = (v.wins/v.count)*100;
      results.push({ type: wr >= 55 ? "positive" : wr < 40 ? "danger" : "neutral", icon:"📋", text:`"${name}" playbook: ${wr.toFixed(0)}% win rate, ${fmt(v.pnl/v.count)} avg across ${v.count} trades`, data:{playbook:name,wr} });
    });

    return results.sort((a,b) => { const order = {danger:0,warning:1,positive:2,neutral:3}; return (order[a.type]||3)-(order[b.type]||3); });
  }, [closed]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  PERFORMANCE ANALYTICS (Holding Period + Asset Type + Risk Score)
  // ═══════════════════════════════════════════════════════════════════════════
  const perfStats = useMemo(() => {
    if (closed.length < 2) return null;

    // ── Holding Period Analysis ──
    const withDuration = closed.map(t => {
      const entry = new Date(t.date + "T12:00:00");
      const exit = t.exitDate ? new Date(t.exitDate + "T12:00:00") : entry;
      const days = Math.max(0, Math.round((exit - entry) / 86400000));
      return { ...t, holdDays: days };
    });

    const winners = withDuration.filter(t => t.pnl > 0);
    const losers = withDuration.filter(t => t.pnl < 0);
    const avgHoldWin = winners.length ? winners.reduce((s, t) => s + t.holdDays, 0) / winners.length : 0;
    const avgHoldLoss = losers.length ? losers.reduce((s, t) => s + t.holdDays, 0) / losers.length : 0;

    // By trade style
    const byStyle = {};
    withDuration.forEach(t => {
      const style = t.strategy || "Untagged";
      if (!byStyle[style]) byStyle[style] = { wins: 0, losses: 0, pnl: 0, count: 0, holdDays: 0, trades: [] };
      byStyle[style].count++;
      byStyle[style].holdDays += t.holdDays;
      byStyle[style].pnl += t.pnl;
      if (t.pnl > 0) byStyle[style].wins++; else byStyle[style].losses++;
      byStyle[style].trades.push(t);
    });

    // Holding period buckets for scatter
    const holdBuckets = [
      { label: "Intraday", min: 0, max: 0 },
      { label: "1-2 Days", min: 1, max: 2 },
      { label: "3-5 Days", min: 3, max: 5 },
      { label: "1-2 Weeks", min: 6, max: 14 },
      { label: "2+ Weeks", min: 15, max: Infinity },
    ].map(b => {
      const trades = withDuration.filter(t => t.holdDays >= b.min && t.holdDays <= b.max);
      const w = trades.filter(t => t.pnl > 0).length;
      return {
        ...b,
        count: trades.length,
        wins: w,
        wr: trades.length > 0 ? (w / trades.length) * 100 : 0,
        avgPnl: trades.length > 0 ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0,
        totalPnl: trades.reduce((s, t) => s + t.pnl, 0),
      };
    }).filter(b => b.count > 0);

    // ── Asset Type Breakdown ──
    const byAsset = {};
    closed.forEach(t => {
      const a = t.assetType || "Stock";
      if (!byAsset[a]) byAsset[a] = { wins: 0, losses: 0, pnl: 0, count: 0, avgPnl: 0, pf: 0 };
      byAsset[a].count++;
      if (t.pnl > 0) { byAsset[a].wins++; byAsset[a].pnl += t.pnl; }
      else { byAsset[a].losses++; byAsset[a].pnl += t.pnl; }
    });
    Object.values(byAsset).forEach(v => {
      v.avgPnl = v.count > 0 ? v.pnl / v.count : 0;
      const grossWin = closed.filter(t => (t.assetType || "Stock") === Object.keys(byAsset).find(k => byAsset[k] === v) && t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
      const grossLoss = Math.abs(closed.filter(t => (t.assetType || "Stock") === Object.keys(byAsset).find(k => byAsset[k] === v) && t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
      v.pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    });

    // Options strategy breakdown
    const byOptStrat = {};
    closed.filter(t => t.assetType === "Options").forEach(t => {
      const s = t.optionsStrategyType || "Single Leg";
      if (!byOptStrat[s]) byOptStrat[s] = { wins: 0, losses: 0, pnl: 0, count: 0 };
      byOptStrat[s].count++;
      byOptStrat[s].pnl += t.pnl;
      if (t.pnl > 0) byOptStrat[s].wins++; else byOptStrat[s].losses++;
    });

    // ── Per-Trade Risk Score ──
    const scored = closed.map(t => {
      const acctBal = t.account && accountBalances[t.account] ? parseFloat(accountBalances[t.account]) : totalCapital;
      if (!acctBal || acctBal <= 0) return { ...t, riskScore: null, riskPct: null, riskLabel: "N/A" };
      
      let dollarRisk = 0;
      const entry = parseFloat(t.entryPrice) || 0;
      const stop = parseFloat(t.stopLoss) || 0;
      const qty = parseFloat(t.quantity) || 1;

      if (stop > 0 && entry > 0) {
        dollarRisk = Math.abs(entry - stop) * qty;
      } else if (t.pnl < 0) {
        dollarRisk = Math.abs(t.pnl);
      } else {
        dollarRisk = entry * qty * 0.02; // Estimate 2% move if no stop
      }

      const riskPct = (dollarRisk / acctBal) * 100;
      let riskLabel, riskColor;
      if (riskPct <= 1) { riskLabel = "Conservative"; riskColor = "#4ade80"; }
      else if (riskPct <= 2) { riskLabel = "Moderate"; riskColor = "#60a5fa"; }
      else if (riskPct <= 5) { riskLabel = "Elevated"; riskColor = "#eab308"; }
      else { riskLabel = "Oversized"; riskColor = "#f87171"; }

      return { ...t, riskPct, riskLabel, riskColor, dollarRisk };
    });

    // Risk score stats
    const riskBuckets = [
      { label: "Conservative", color: "#4ade80", min: 0, max: 1 },
      { label: "Moderate", color: "#60a5fa", min: 1, max: 2 },
      { label: "Elevated", color: "#eab308", min: 2, max: 5 },
      { label: "Oversized", color: "#f87171", min: 5, max: Infinity },
    ].map(b => {
      const trades = scored.filter(t => t.riskPct !== null && t.riskPct >= b.min && t.riskPct < b.max);
      const w = trades.filter(t => t.pnl > 0).length;
      return {
        ...b,
        count: trades.length,
        wins: w,
        wr: trades.length > 0 ? (w / trades.length) * 100 : 0,
        avgPnl: trades.length > 0 ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0,
        totalPnl: trades.reduce((s, t) => s + t.pnl, 0),
      };
    });

    return { withDuration, avgHoldWin, avgHoldLoss, byStyle, holdBuckets, byAsset, byOptStrat, scored, riskBuckets };
  }, [closed, accountBalances, totalCapital]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  TRADE REPLAY
  // ═══════════════════════════════════════════════════════════════════════════
  const replayTrades = useMemo(() => {
    let list = [...closed].sort((a,b)=>new Date(b.date)-new Date(a.date));
    if (replayFilter === "wins") list = list.filter(t => t.pnl > 0);
    if (replayFilter === "losses") list = list.filter(t => t.pnl < 0);
    return list;
  }, [closed, replayFilter]);

  const currentTrade = replayTrades[replayIdx] || null;

  const panel = (extra = {}) => ({ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 22px", ...extra });
  const insightColor = { positive:"#4ade80", warning:"#eab308", danger:"#f87171", neutral:"#8a8f9e" };
  const insightBg = { positive:"rgba(74,222,128,0.06)", warning:"rgba(234,179,8,0.06)", danger:"rgba(248,113,113,0.06)", neutral:"var(--tp-card)" };
  const insightBorder = { positive:"rgba(74,222,128,0.15)", warning:"rgba(234,179,8,0.15)", danger:"rgba(248,113,113,0.15)", neutral:"var(--tp-border-l)" };
  const gradeColor = g => { if(!g) return "#5c6070"; if(g.startsWith("A")) return "#4ade80"; if(g==="B+"||g==="B") return "#60a5fa"; if(g==="C") return "#eab308"; return "#f87171"; };

  return (
    <div>
      {/* Section tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:24, borderBottom:"1px solid var(--tp-border)", paddingBottom:2, flexWrap:"wrap" }}>
        {[{id:"risk",label:"Risk Management",icon:Shield},{id:"performance",label:"Performance",icon:BarChart3},{id:"insights",label:"Insights",icon:Lightbulb},{id:"replay",label:"Trade Replay",icon:Eye},{id:"coach",label:"AI Coach",icon:Zap}].map(s => (
          <button key={s.id} onClick={()=>setSection(s.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", border:"none", background:section===s.id?"rgba(99,102,241,0.15)":"transparent", color:section===s.id?"#a5b4fc":"#6b7080", cursor:"pointer", fontSize:13, fontWeight:600, borderRadius:"6px 6px 0 0", borderBottom:section===s.id?"2px solid #6366f1":"none", whiteSpace:"nowrap" }}><s.icon size={14}/> {s.label}</button>
        ))}
      </div>

      {/* ═══════ RISK MANAGEMENT ═══════ */}
      {section === "risk" && (
        <div>
          {!riskStats ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--tp-faint)" }}><Shield size={48} style={{ margin:"0 auto 16px", opacity:0.35 }}/><p style={{ fontSize:15, margin:0 }}>Need closed trades to analyze risk management.</p></div>
          ) : (
            <div>
              {/* Key metrics */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10, marginBottom:18 }}>
                <div style={panel({textAlign:"center",padding:"16px"})}><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>Stop Loss Usage</div><div style={{ fontSize:22, fontWeight:700, color: riskStats.withStop > closed.length*0.5 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{riskStats.withStop}/{closed.length}</div><div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:2 }}>trades with stops set</div></div>
                
                {riskStats.stopRate !== null && <div style={panel({textAlign:"center",padding:"16px"})}><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>Stop Honor Rate</div><div style={{ fontSize:22, fontWeight:700, color: riskStats.stopRate >= 80 ? "#4ade80" : riskStats.stopRate >= 60 ? "#eab308" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{riskStats.stopRate.toFixed(0)}%</div><div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:2 }}>{riskStats.stopsHonored} honored / {riskStats.stopsBroken} broken</div></div>}
                
                {totalCapital > 0 && <div style={panel({textAlign:"center",padding:"16px"})}><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>Avg Loss / Account</div><div style={{ fontSize:22, fontWeight:700, color: riskStats.avgRiskPct <= 2 ? "#4ade80" : riskStats.avgRiskPct <= 4 ? "#eab308" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{riskStats.avgRiskPct.toFixed(1)}%</div><div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:2 }}>target: ≤ 2%</div></div>}
                
                <div style={panel({textAlign:"center",padding:"16px"})}><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>Avg Planned R:R</div><div style={{ fontSize:22, fontWeight:700, color: riskStats.avgPlannedRR >= 2 ? "#4ade80" : riskStats.avgPlannedRR >= 1 ? "#eab308" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{riskStats.avgPlannedRR > 0 ? riskStats.avgPlannedRR.toFixed(1)+"x" : "—"}</div><div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:2 }}>{riskStats.rrTrades.length} trades with R:R data</div></div>

                <div style={panel({textAlign:"center",padding:"16px"})}><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>Max Consecutive Losses</div><div style={{ fontSize:22, fontWeight:700, color:"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{riskStats.maxConsecLoss}</div><div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:2 }}>totaling {fmt(riskStats.maxConsecLossAmount)}</div></div>

                <div style={panel({textAlign:"center",padding:"16px"})}><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>Biggest Loss</div><div style={{ fontSize:22, fontWeight:700, color:"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{riskStats.biggestLoss ? fmt(riskStats.biggestLoss.pnl) : "—"}</div><div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:2 }}>{riskStats.biggestLoss?.ticker} {riskStats.biggestLoss?.date}</div></div>
              </div>

              {/* Oversized trades warning */}
              {riskStats.oversizedTrades.length > 0 && (
                <div style={panel({marginBottom:18, borderColor:"rgba(248,113,113,0.2)"})}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                    <AlertTriangle size={16} color="#f87171"/>
                    <span style={{ fontSize:13, color:"#f87171", fontWeight:600 }}>Oversized Trades ({riskStats.oversizedTrades.length})</span>
                    <span style={{ fontSize:11, color:"var(--tp-faint)" }}>— losses exceeding 3% of account</span>
                  </div>
                  <div style={{ maxHeight:160, overflowY:"auto" }}>
                    {riskStats.oversizedTrades.map(t => (
                      <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid var(--tp-border)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:12, color:"var(--tp-text2)", fontWeight:600 }}>{t.ticker}</span>
                          <span style={{ fontSize:11, color:"var(--tp-faint)" }}>{t.date}</span>
                          <span style={{ fontSize:10, color:"var(--tp-muted)" }}>{t.assetType}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(t.pnl)}</span>
                          <span style={{ fontSize:10, fontWeight:700, color:"#f87171", background:"rgba(248,113,113,0.12)", padding:"2px 8px", borderRadius:4, fontFamily:"'JetBrains Mono', monospace" }}>{t.riskPct.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rules reminder */}
              <div style={panel({background:"rgba(99,102,241,0.04)",borderColor:"rgba(99,102,241,0.15)"})}>
                <div style={{ fontSize:11, color:"#a5b4fc", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Risk Management Rules</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.7 }}>
                    <div style={{ marginBottom:4 }}><span style={{ color: riskStats.withStop >= closed.length * 0.8 ? "#4ade80" : "#f87171" }}>●</span> Always set a stop loss</div>
                    <div style={{ marginBottom:4 }}><span style={{ color: riskStats.avgRiskPct <= 2 ? "#4ade80" : "#f87171" }}>●</span> Risk ≤ 2% per trade</div>
                    <div><span style={{ color: riskStats.stopRate >= 80 ? "#4ade80" : "#f87171" }}>●</span> Honor your stops</div>
                  </div>
                  <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.7 }}>
                    <div style={{ marginBottom:4 }}><span style={{ color: riskStats.avgPlannedRR >= 2 ? "#4ade80" : "#eab308" }}>●</span> Minimum 2:1 reward-to-risk</div>
                    <div style={{ marginBottom:4 }}><span style={{ color: riskStats.withTP >= closed.length * 0.5 ? "#4ade80" : "#eab308" }}>●</span> Set take-profit targets</div>
                    <div><span style={{ color:"#60a5fa" }}>●</span> Review after 3 consecutive losses</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ PERFORMANCE ═══════ */}
      {section === "performance" && (
        <div>
          {!perfStats ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--tp-faint)" }}><BarChart3 size={48} style={{ margin:"0 auto 16px", opacity:0.35 }}/><p style={{ fontSize:15, margin:0 }}>Need at least 2 closed trades to analyze performance.</p></div>
          ) : (
            <div>
              {/* ── HOLDING PERIOD ANALYSIS ── */}
              <div style={panel({ marginBottom:16 })}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}><Clock size={15} color="#a5b4fc"/><span style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)" }}>Holding Period Analysis</span></div>
                
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                  <div style={{ background:"rgba(74,222,128,0.06)", border:"1px solid rgba(74,222,128,0.15)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
                    <div style={{ fontSize:9, color:"#4ade80", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Avg Hold — Winners</div>
                    <div style={{ fontSize:24, fontWeight:800, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>{perfStats.avgHoldWin.toFixed(1)}<span style={{ fontSize:12, fontWeight:400 }}> days</span></div>
                  </div>
                  <div style={{ background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.15)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
                    <div style={{ fontSize:9, color:"#f87171", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Avg Hold — Losers</div>
                    <div style={{ fontSize:24, fontWeight:800, color:"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{perfStats.avgHoldLoss.toFixed(1)}<span style={{ fontSize:12, fontWeight:400 }}> days</span></div>
                  </div>
                </div>

                <div style={{ fontSize:11, color:"var(--tp-faint)", fontWeight:600, textTransform:"uppercase", letterSpacing:0.6, marginBottom:8 }}>P&L by Holding Period</div>
                <div style={{ display:"grid", gap:6, marginBottom:16 }}>
                  {perfStats.holdBuckets.map(b => (
                    <div key={b.label} style={{ display:"grid", gridTemplateColumns:"100px 1fr 60px 70px 80px", gap:10, alignItems:"center", padding:"8px 12px", background:"var(--tp-card)", borderRadius:8, fontSize:12 }}>
                      <span style={{ color:"var(--tp-text2)", fontWeight:600 }}>{b.label}</span>
                      <div style={{ height:6, borderRadius:3, background:"var(--tp-input)", overflow:"hidden" }}>
                        <div style={{ height:"100%", borderRadius:3, width:`${Math.min(b.wr, 100)}%`, background: b.wr >= 55 ? "#4ade80" : b.wr >= 45 ? "#eab308" : "#f87171", transition:"width 0.3s" }}/>
                      </div>
                      <span style={{ color:"var(--tp-faint)", fontFamily:"'JetBrains Mono', monospace", fontSize:11, textAlign:"right" }}>{b.wr.toFixed(0)}% WR</span>
                      <span style={{ color:"var(--tp-muted)", fontFamily:"'JetBrains Mono', monospace", fontSize:11, textAlign:"right" }}>{b.count} trades</span>
                      <span style={{ color: b.totalPnl >= 0 ? "#4ade80" : "#f87171", fontWeight:600, fontFamily:"'JetBrains Mono', monospace", fontSize:11, textAlign:"right" }}>{fmt(b.totalPnl)}</span>
                    </div>
                  ))}
                </div>

                {(() => {
                  const best = [...perfStats.holdBuckets].filter(b => b.count >= 2).sort((a, b) => b.avgPnl - a.avgPnl)[0];
                  return best ? (
                    <div style={{ padding:"10px 14px", background:"rgba(99,102,241,0.06)", border:"1px solid rgba(99,102,241,0.15)", borderRadius:8, fontSize:12, color:"var(--tp-text2)" }}>
                      💡 <strong style={{ color:"#a5b4fc" }}>Sweet Spot:</strong> Your best results come from <strong>{best.label}</strong> holds — {best.wr.toFixed(0)}% win rate with {fmt(best.avgPnl)} avg P&L
                    </div>
                  ) : null;
                })()}
              </div>

              {/* ── TRADE STYLE BREAKDOWN ── */}
              {Object.keys(perfStats.byStyle).length > 1 && (
                <div style={panel({ marginBottom:16 })}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}><Activity size={15} color="#a5b4fc"/><span style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)" }}>Trade Style Comparison</span></div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:10 }}>
                    {Object.entries(perfStats.byStyle).map(([style, v]) => {
                      const wr = v.count > 0 ? (v.wins / v.count) * 100 : 0;
                      const avgHold = v.count > 0 ? v.holdDays / v.count : 0;
                      return (
                        <div key={style} style={{ background:"var(--tp-card)", borderRadius:10, padding:"14px 16px", border:"1px solid var(--tp-border)", textAlign:"center" }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"var(--tp-text)", marginBottom:8 }}>{style}</div>
                          <div style={{ fontSize:20, fontWeight:800, color: v.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace", marginBottom:4 }}>{fmt(v.pnl)}</div>
                          <div style={{ fontSize:10, color:"var(--tp-faint)", lineHeight:1.8 }}>
                            {v.count} trades · {wr.toFixed(0)}% WR<br/>
                            {v.wins}W / {v.losses}L · {avgHold.toFixed(1)}d avg hold
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── ASSET TYPE BREAKDOWN ── */}
              <div style={panel({ marginBottom:16 })}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}><Layers size={15} color="#a5b4fc"/><span style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)" }}>Asset Type Performance</span></div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10 }}>
                  {Object.entries(perfStats.byAsset).map(([asset, v]) => {
                    const wr = v.count > 0 ? (v.wins / v.count) * 100 : 0;
                    const icon = asset === "Stock" ? "📈" : asset === "Options" ? "🎯" : "📊";
                    return (
                      <div key={asset} style={{ background:"var(--tp-card)", borderRadius:10, padding:"16px 18px", border: v.pnl >= 0 ? "1px solid rgba(74,222,128,0.15)" : "1px solid rgba(248,113,113,0.15)" }}>
                        <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)", marginBottom:10 }}>{icon} {asset}</div>
                        <div style={{ fontSize:22, fontWeight:800, color: v.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace", marginBottom:6 }}>{fmt(v.pnl)}</div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, fontSize:11 }}>
                          <div><span style={{ color:"var(--tp-faint)" }}>Win Rate</span><div style={{ color:"var(--tp-text2)", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{wr.toFixed(0)}%</div></div>
                          <div><span style={{ color:"var(--tp-faint)" }}>Trades</span><div style={{ color:"var(--tp-text2)", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{v.count}</div></div>
                          <div><span style={{ color:"var(--tp-faint)" }}>Avg P&L</span><div style={{ color: v.avgPnl >= 0 ? "#4ade80" : "#f87171", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{fmt(v.avgPnl)}</div></div>
                          <div><span style={{ color:"var(--tp-faint)" }}>Profit Factor</span><div style={{ color: v.pf >= 1.5 ? "#4ade80" : v.pf >= 1 ? "#eab308" : "#f87171", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{v.pf === Infinity ? "∞" : v.pf.toFixed(2)}</div></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {Object.keys(perfStats.byOptStrat).length > 0 && (
                  <div style={{ marginTop:14, padding:"14px 16px", background:"rgba(99,102,241,0.04)", borderRadius:10, border:"1px solid rgba(99,102,241,0.12)" }}>
                    <div style={{ fontSize:11, color:"#6366f1", fontWeight:600, textTransform:"uppercase", letterSpacing:0.6, marginBottom:10 }}>Options Strategy Breakdown</div>
                    <div style={{ display:"grid", gap:4 }}>
                      {Object.entries(perfStats.byOptStrat).sort((a, b) => b[1].pnl - a[1].pnl).map(([strat, v]) => {
                        const wr = v.count > 0 ? (v.wins / v.count) * 100 : 0;
                        return (
                          <div key={strat} style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr 70px 80px", gap:8, alignItems:"center", padding:"6px 10px", background:"var(--tp-card)", borderRadius:6, fontSize:11 }}>
                            <span style={{ color:"var(--tp-text2)", fontWeight:600 }}>{strat}</span>
                            <div style={{ height:5, borderRadius:3, background:"var(--tp-input)", overflow:"hidden" }}>
                              <div style={{ height:"100%", borderRadius:3, width:`${Math.min(wr, 100)}%`, background: wr >= 55 ? "#4ade80" : wr >= 45 ? "#eab308" : "#f87171" }}/>
                            </div>
                            <span style={{ color:"var(--tp-faint)", fontFamily:"'JetBrains Mono', monospace", textAlign:"right" }}>{wr.toFixed(0)}% ({v.count})</span>
                            <span style={{ color: v.pnl >= 0 ? "#4ade80" : "#f87171", fontWeight:600, fontFamily:"'JetBrains Mono', monospace", textAlign:"right" }}>{fmt(v.pnl)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── RISK SCORE ANALYSIS ── */}
              <div style={panel({ marginBottom:16 })}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}><Shield size={15} color="#a5b4fc"/><span style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)" }}>Risk Score Analysis</span></div>
                <div style={{ fontSize:11, color:"var(--tp-faint)", marginBottom:14 }}>Based on position risk vs account balance. {totalCapital > 0 ? `Total capital: ${fmt(totalCapital)}` : "Set account balances in Settings for accurate scoring."}</div>

                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:10, marginBottom:16 }}>
                  {perfStats.riskBuckets.map(b => (
                    <div key={b.label} style={{ background:"var(--tp-card)", borderRadius:10, padding:"14px 16px", textAlign:"center", borderLeft:`3px solid ${b.color}` }}>
                      <div style={{ fontSize:10, color:b.color, fontWeight:700, textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>{b.label}</div>
                      <div style={{ fontSize:9, color:"var(--tp-faintest)", marginBottom:8 }}>{b.label === "Conservative" ? "≤1%" : b.label === "Moderate" ? "1-2%" : b.label === "Elevated" ? "2-5%" : ">5%"} of account</div>
                      <div style={{ fontSize:20, fontWeight:800, color:"var(--tp-text)", fontFamily:"'JetBrains Mono', monospace" }}>{b.count}</div>
                      <div style={{ fontSize:10, color:"var(--tp-faint)", marginTop:2 }}>trades</div>
                      {b.count > 0 && <div style={{ marginTop:6, fontSize:11 }}>
                        <span style={{ color: b.wr >= 50 ? "#4ade80" : "#f87171", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{b.wr.toFixed(0)}% WR</span>
                        <span style={{ color:"var(--tp-faintest)", margin:"0 4px" }}>·</span>
                        <span style={{ color: b.totalPnl >= 0 ? "#4ade80" : "#f87171", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{fmt(b.totalPnl)}</span>
                      </div>}
                    </div>
                  ))}
                </div>

                {(() => {
                  const oversized = perfStats.riskBuckets.find(b => b.label === "Oversized");
                  const conservative = perfStats.riskBuckets.find(b => b.label === "Conservative");
                  if (oversized && oversized.count >= 2 && conservative && conservative.count >= 2) {
                    return (
                      <div style={{ padding:"10px 14px", background: oversized.wr < conservative.wr ? "rgba(248,113,113,0.06)" : "rgba(74,222,128,0.06)", border: `1px solid ${oversized.wr < conservative.wr ? "rgba(248,113,113,0.15)" : "rgba(74,222,128,0.15)"}`, borderRadius:8, fontSize:12, color:"var(--tp-text2)", marginBottom:12 }}>
                        {oversized.wr < conservative.wr
                          ? <span>⚠️ Your <strong style={{ color:"#f87171" }}>oversized</strong> trades have a {oversized.wr.toFixed(0)}% win rate vs {conservative.wr.toFixed(0)}% on <strong style={{ color:"#4ade80" }}>conservative</strong> sizes. Smaller positions = better results.</span>
                          : <span>✅ Your larger positions are performing well ({oversized.wr.toFixed(0)}% WR), but watch for drawdowns.</span>
                        }
                      </div>
                    );
                  }
                  return null;
                })()}

                <div style={{ fontSize:11, color:"var(--tp-faint)", fontWeight:600, textTransform:"uppercase", letterSpacing:0.6, marginBottom:8 }}>Recent Trades — Risk Scores</div>
                <div style={{ display:"grid", gap:3, maxHeight:300, overflowY:"auto" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"70px 1fr 70px 70px 80px", gap:8, padding:"5px 10px", fontSize:9, color:"var(--tp-faintest)", fontWeight:600, textTransform:"uppercase" }}>
                    <span>Date</span><span>Ticker</span><span style={{ textAlign:"right" }}>Risk %</span><span style={{ textAlign:"center" }}>Score</span><span style={{ textAlign:"right" }}>P&L</span>
                  </div>
                  {[...perfStats.scored].filter(t => t.riskPct !== null).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20).map((t, i) => (
                    <div key={t.id || i} style={{ display:"grid", gridTemplateColumns:"70px 1fr 70px 70px 80px", gap:8, padding:"6px 10px", background: i % 2 === 0 ? "var(--tp-card)" : "transparent", borderRadius:4, fontSize:11, alignItems:"center" }}>
                      <span style={{ color:"var(--tp-faint)", fontFamily:"'JetBrains Mono', monospace", fontSize:10 }}>{(t.date||"").slice(5)}</span>
                      <span style={{ color:"var(--tp-text2)", fontWeight:600 }}>{t.ticker}</span>
                      <span style={{ color: t.riskColor, fontWeight:600, fontFamily:"'JetBrains Mono', monospace", textAlign:"right" }}>{t.riskPct.toFixed(1)}%</span>
                      <span style={{ textAlign:"center" }}><span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, background:`${t.riskColor}15`, color:t.riskColor, fontWeight:600 }}>{t.riskLabel}</span></span>
                      <span style={{ color: t.pnl >= 0 ? "#4ade80" : "#f87171", fontWeight:600, fontFamily:"'JetBrains Mono', monospace", textAlign:"right" }}>{fmt(t.pnl)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ INSIGHTS ═══════ */}
      {section === "insights" && (
        <div>
          {insights.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--tp-faint)" }}><Lightbulb size={48} style={{ margin:"0 auto 16px", opacity:0.35 }}/><p style={{ fontSize:15, margin:0 }}>Need more trades with details (emotions, times, grades) to surface insights.</p><p style={{ fontSize:12, color:"var(--tp-faintest)", margin:"8px 0 0" }}>Keep logging trades with full details and patterns will emerge.</p></div>
          ) : (
            <div>
              <div style={{ fontSize:12, color:"var(--tp-faint)", marginBottom:16 }}>{insights.length} insight{insights.length!==1?"s":""} discovered from {closed.length} closed trades</div>
              <div style={{ display:"grid", gap:10 }}>
                {insights.map((insight, i) => (
                  <div key={i} style={{ background:insightBg[insight.type], border:`1px solid ${insightBorder[insight.type]}`, borderRadius:10, padding:"14px 16px", display:"flex", alignItems:"start", gap:12 }}>
                    <span style={{ fontSize:20, flexShrink:0, lineHeight:1 }}>{insight.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color:"var(--tp-text2)", lineHeight:1.6 }}>{insight.text}</div>
                    </div>
                    <div style={{ width:6, height:6, borderRadius:3, background:insightColor[insight.type], flexShrink:0, marginTop:6 }}/>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ TRADE REPLAY ═══════ */}
      {section === "replay" && (
        <div>
          {replayTrades.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--tp-faint)" }}><Eye size={48} style={{ margin:"0 auto 16px", opacity:0.35 }}/><p style={{ fontSize:15, margin:0 }}>No closed trades to replay.</p></div>
          ) : (
            <div>
              {/* Controls */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
                <div style={{ display:"flex", gap:6 }}>
                  {[{id:"all",label:"All"},{id:"wins",label:"Winners"},{id:"losses",label:"Losers"}].map(f => (
                    <button key={f.id} onClick={()=>{setReplayFilter(f.id);setReplayIdx(0);}} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${replayFilter===f.id?"#6366f1":"var(--tp-border-l)"}`, background:replayFilter===f.id?"rgba(99,102,241,0.12)":"transparent", color:replayFilter===f.id?"#a5b4fc":"#5c6070", cursor:"pointer", fontSize:12, fontWeight:replayFilter===f.id?600:400 }}>{f.label}</button>
                  ))}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <button onClick={()=>setReplayIdx(Math.max(0,replayIdx-1))} disabled={replayIdx===0} style={{ width:32, height:32, borderRadius:8, border:"1px solid var(--tp-border-l)", background:"var(--tp-card)", color:replayIdx===0?"#3a3e4a":"#8a8f9e", cursor:replayIdx===0?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><SkipBack size={14}/></button>
                  <span style={{ fontSize:13, color:"var(--tp-muted)", fontFamily:"'JetBrains Mono', monospace", minWidth:60, textAlign:"center" }}>{replayIdx+1} / {replayTrades.length}</span>
                  <button onClick={()=>setReplayIdx(Math.min(replayTrades.length-1,replayIdx+1))} disabled={replayIdx>=replayTrades.length-1} style={{ width:32, height:32, borderRadius:8, border:"1px solid var(--tp-border-l)", background:"var(--tp-card)", color:replayIdx>=replayTrades.length-1?"#3a3e4a":"#8a8f9e", cursor:replayIdx>=replayTrades.length-1?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><SkipForward size={14}/></button>
                </div>
              </div>

              {/* Trade card */}
              {currentTrade && (
                <div style={panel({padding:"28px 30px"})}>
                  {/* Header */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", marginBottom:20 }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                        <span style={{ fontSize:24, fontWeight:700, color:"var(--tp-text)" }}>{currentTrade.ticker}</span>
                        <span style={{ fontSize:11, fontWeight:600, color:currentTrade.direction==="Long"?"#60a5fa":"#f472b6", background:currentTrade.direction==="Long"?"rgba(96,165,250,0.12)":"rgba(244,114,182,0.12)", padding:"3px 10px", borderRadius:4 }}>{currentTrade.direction}</span>
                        <span style={{ fontSize:10, color:"var(--tp-muted)", background:"var(--tp-input)", padding:"3px 8px", borderRadius:4 }}>{currentTrade.assetType}</span>
                        {currentTrade.grade && <span style={{ fontSize:14, fontWeight:800, color:gradeColor(currentTrade.grade) }}>{currentTrade.grade}</span>}
                      </div>
                      <div style={{ fontSize:12, color:"var(--tp-faint)" }}>
                        {currentTrade.date}{currentTrade.entryTime ? ` · ${currentTrade.entryTime}` : ""}{currentTrade.exitDate && currentTrade.exitDate !== currentTrade.date ? ` → ${currentTrade.exitDate}` : ""}{currentTrade.exitTime ? ` · ${currentTrade.exitTime}` : ""}
                        {currentTrade.playbook && <span style={{ color:"#a5b4fc", marginLeft:8 }}>📋 {currentTrade.playbook}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:28, fontWeight:700, color: currentTrade.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(currentTrade.pnl)}</div>
                      {currentTrade.account && totalCapital > 0 && <div style={{ fontSize:11, color:"var(--tp-faint)" }}>{((currentTrade.pnl / (parseFloat(accountBalances[currentTrade.account])||totalCapital))*100).toFixed(2)}% of account</div>}
                    </div>
                  </div>

                  {/* Trade details grid */}
                  <div className="tp-replay-detail-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))", gap:8, marginBottom:20, padding:"14px 16px", background:"var(--tp-card)", borderRadius:10 }}>
                    {currentTrade.entryPrice && <div><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Entry</div><div style={{ fontSize:14, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>${currentTrade.entryPrice}</div></div>}
                    {currentTrade.exitPrice && <div><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Exit</div><div style={{ fontSize:14, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>${currentTrade.exitPrice}</div></div>}
                    {currentTrade.stopLoss && <div><div style={{ fontSize:9, color:"#f87171", textTransform:"uppercase" }}>Stop</div><div style={{ fontSize:14, color:"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>${currentTrade.stopLoss}</div></div>}
                    {currentTrade.takeProfit && <div><div style={{ fontSize:9, color:"#4ade80", textTransform:"uppercase" }}>Target</div><div style={{ fontSize:14, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>${currentTrade.takeProfit}</div></div>}
                    {currentTrade.quantity && <div><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Qty</div><div style={{ fontSize:14, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>{currentTrade.quantity}</div></div>}
                    {currentTrade.account && <div><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Account</div><div style={{ fontSize:14, color:"#60a5fa" }}>{currentTrade.account}</div></div>}
                    {<div><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Entry Time</div><div style={{ fontSize:14, color: currentTrade.entryTime ? "var(--tp-text2)" : "var(--tp-faintest)", fontFamily:"'JetBrains Mono', monospace" }}>{currentTrade.entryTime || "—"}</div></div>}
                    {<div><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Exit Time</div><div style={{ fontSize:14, color: currentTrade.exitTime ? "var(--tp-text2)" : "var(--tp-faintest)", fontFamily:"'JetBrains Mono', monospace" }}>{currentTrade.exitTime || "—"}</div></div>}
                    {currentTrade.timeframe && <div><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Timeframe</div><div style={{ fontSize:14, color:"var(--tp-text2)" }}>{currentTrade.timeframe}</div></div>}
                    {currentTrade.strategy && <div><div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Style</div><div style={{ fontSize:14, color:"var(--tp-text2)" }}>{currentTrade.strategy}</div></div>}
                  </div>

                  {/* Emotions */}
                  {(currentTrade.emotions||[]).length > 0 && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6 }}>Emotions</div>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {currentTrade.emotions.map(e => <span key={e} style={{ fontSize:11, color:"#f472b6", background:"rgba(244,114,182,0.12)", padding:"4px 10px", borderRadius:6 }}>{e}</span>)}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {currentTrade.notes && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6 }}>Notes & Lessons</div>
                      <div style={{ fontSize:13, color:"#b0b5c4", lineHeight:1.7, whiteSpace:"pre-wrap", padding:"12px 14px", background:"rgba(99,102,241,0.04)", borderRadius:8, border:"1px solid rgba(99,102,241,0.1)" }}>{currentTrade.notes}</div>
                    </div>
                  )}

                  {/* Screenshots */}
                  {(currentTrade.screenshots||[]).length > 0 && (
                    <div>
                      <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, marginBottom:8 }}>Screenshots</div>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        {currentTrade.screenshots.map(s => (
                          <div key={s.id} style={{ borderRadius:8, overflow:"hidden", border:"1px solid var(--tp-border-l)", cursor:"pointer", width:200, height:130 }} onClick={()=>setViewingSrc(s.data)}>
                            <img src={s.data} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════ AI COACH ═══════ */}
      {section === "coach" && <AICoach trades={trades} accountBalances={accountBalances} journal={journal} goals={goals} playbooks={playbooks} prefs={prefs}/>}

      {viewingSrc && <ScreenshotLightbox src={viewingSrc} onClose={()=>setViewingSrc(null)}/>}
    </div>
  );
}

// ─── AI TRADE COACH ─────────────────────────────────────────────────────────
const COACH_DAILY_LIMIT = 10;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_FREE_KEY = "";

function AICoach({ trades, accountBalances, journal, goals, playbooks, prefs }) {
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [usageToday, setUsageToday] = useState(0);

  const aiProvider = prefs?.aiProvider || "gemini"; // gemini | claude
  const claudeKey = prefs?.claudeApiKey || "";
  const hasClaudeKey = claudeKey.startsWith("sk-ant-");

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("tp_coach_usage") || "{}");
      const today = new Date().toISOString().split("T")[0];
      setUsageToday(stored.date === today ? (stored.count || 0) : 0);
    } catch(e) { setUsageToday(0); }
  }, []);

  const incrementUsage = () => {
    const today = new Date().toISOString().split("T")[0];
    const next = usageToday + 1;
    setUsageToday(next);
    localStorage.setItem("tp_coach_usage", JSON.stringify({ date: today, count: next }));
  };

  // ── Build trade statistics ──
  const buildStats = (scope) => {
    const closed = (trades || []).filter(t => t.pnl !== null);
    if (closed.length === 0) return null;
    const sorted = [...closed].sort((a,b) => new Date(b.date) - new Date(a.date));
    const scopeTrades = scope === "week"
      ? sorted.filter(t => { const diff = (new Date() - new Date(t.date)) / (1000*60*60*24); return diff <= 7; })
      : scope === "recent" ? sorted.slice(0, 10) : sorted;
    if (scopeTrades.length === 0) return null;

    const wins = scopeTrades.filter(t => t.pnl > 0);
    const losses = scopeTrades.filter(t => t.pnl < 0);
    const totalPnL = scopeTrades.reduce((s,t) => s + t.pnl, 0);
    const avgWin = wins.length > 0 ? wins.reduce((s,t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s,t) => s + t.pnl, 0) / losses.length : 0;
    const totalCap = Object.values(accountBalances || {}).reduce((s,v) => s + (parseFloat(v) || 0), 0);

    const bySetup = {};
    scopeTrades.forEach(t => {
      const key = t.playbook || "(no setup tagged)";
      if (!bySetup[key]) bySetup[key] = { count:0, wins:0, pnl:0, tickers:new Set() };
      bySetup[key].count++; if (t.pnl > 0) bySetup[key].wins++; bySetup[key].pnl += t.pnl; bySetup[key].tickers.add(t.ticker);
    });
    const byDay = {};
    scopeTrades.forEach(t => {
      const day = new Date(t.date).toLocaleDateString("en-US",{weekday:"short"});
      if (!byDay[day]) byDay[day] = { count:0, wins:0, pnl:0 };
      byDay[day].count++; if (t.pnl > 0) byDay[day].wins++; byDay[day].pnl += t.pnl;
    });
    const byHour = {};
    scopeTrades.forEach(t => {
      if (t.entryTime) {
        const hr = parseInt(t.entryTime.split(":")[0]);
        const bucket = hr < 10 ? "Pre-10AM" : hr < 12 ? "10AM-12PM" : hr < 14 ? "12PM-2PM" : "After 2PM";
        if (!byHour[bucket]) byHour[bucket] = { count:0, wins:0, pnl:0 };
        byHour[bucket].count++; if (t.pnl > 0) byHour[bucket].wins++; byHour[bucket].pnl += t.pnl;
      }
    });
    const byEmotion = {};
    scopeTrades.forEach(t => { (t.emotions||[]).forEach(e => { if (!byEmotion[e]) byEmotion[e] = { count:0, wins:0, pnl:0 }; byEmotion[e].count++; if (t.pnl > 0) byEmotion[e].wins++; byEmotion[e].pnl += t.pnl; }); });

    let maxConsecLosses = 0, curr = 0;
    const sameDayMultiLoss = {};
    sorted.forEach(t => {
      if (t.pnl < 0) { curr++; maxConsecLosses = Math.max(maxConsecLosses, curr); } else curr = 0;
      const key = `${t.date}-${t.ticker}`;
      if (t.pnl < 0) sameDayMultiLoss[key] = (sameDayMultiLoss[key]||0) + 1;
    });
    const revengeTradeCandidates = Object.entries(sameDayMultiLoss).filter(([,v]) => v >= 2).length;

    const byGrade = {};
    scopeTrades.forEach(t => { if (t.grade) { if (!byGrade[t.grade]) byGrade[t.grade] = { count:0, pnl:0 }; byGrade[t.grade].count++; byGrade[t.grade].pnl += t.pnl; }});

    const recentDetail = sorted.slice(0,10).map(t => ({
      date:t.date, ticker:t.ticker, direction:t.direction, pnl:t.pnl, setup:t.playbook||"none", grade:t.grade||"—", assetType:t.assetType,
      entryTime:t.entryTime||"", exitTime:t.exitTime||"", stopLoss:t.stopLoss, takeProfit:t.takeProfit, entryPrice:t.entryPrice, exitPrice:t.exitPrice,
      emotions:(t.emotions||[]).join(", ")||"none logged"
    }));

    const tradesByDate = {};
    scopeTrades.forEach(t => { tradesByDate[t.date] = (tradesByDate[t.date]||0) + 1; });
    const tradeDays = Object.keys(tradesByDate).length;

    return {
      scope: scope === "week" ? "Last 7 days" : scope === "recent" ? "Last 10 trades" : "All time",
      totalTrades: scopeTrades.length, winRate: ((wins.length/scopeTrades.length)*100).toFixed(1),
      wins: wins.length, losses: losses.length, totalPnL: totalPnL.toFixed(2),
      avgWin: avgWin.toFixed(2), avgLoss: avgLoss.toFixed(2),
      profitFactor: losses.length > 0 && avgLoss !== 0 ? (Math.abs(wins.reduce((s,t)=>s+t.pnl,0)) / Math.abs(losses.reduce((s,t)=>s+t.pnl,0))).toFixed(2) : "∞",
      totalCapital: totalCap > 0 ? totalCap.toFixed(0) : "not set",
      returnPct: totalCap > 0 ? ((totalPnL/totalCap)*100).toFixed(2)+"%" : "N/A",
      avgTradesPerDay: tradeDays > 0 ? (scopeTrades.length/tradeDays).toFixed(1) : "0",
      maxTradesOneDay: Math.max(...Object.values(tradesByDate), 0),
      bySetup: Object.entries(bySetup).map(([name,d]) => `${name}: ${d.count} trades, ${d.wins}W/${d.count-d.wins}L, $${d.pnl.toFixed(0)}, tickers: ${[...d.tickers].join(",")}`).join("\n"),
      byDay: Object.entries(byDay).map(([day,d]) => `${day}: ${d.count} trades, ${((d.wins/d.count)*100).toFixed(0)}% WR, $${d.pnl.toFixed(0)}`).join("; "),
      byHour: Object.entries(byHour).map(([h,d]) => `${h}: ${d.count} trades, ${((d.wins/d.count)*100).toFixed(0)}% WR, $${d.pnl.toFixed(0)}`).join("; "),
      byEmotion: Object.entries(byEmotion).length > 0 ? Object.entries(byEmotion).map(([e,d]) => `${e}: ${d.count} trades, ${((d.wins/d.count)*100).toFixed(0)}% WR, $${d.pnl.toFixed(0)}`).join("; ") : "No emotions logged",
      maxConsecLosses, revengeTradeCandidates,
      byGrade: Object.entries(byGrade).map(([g,d]) => `${g}: ${d.count} trades, $${d.pnl.toFixed(0)}`).join("; "),
      recentDetail: JSON.stringify(recentDetail, null, 0)
    };
  };

  const getJournalContext = () => {
    if (!journal || journal.length === 0) return "No journal entries.";
    const recent = [...journal].sort((a,b) => b.date?.localeCompare(a.date)).slice(0, 5);
    return recent.map(j => `${j.date}: mood=${j.mood||"?"}, market=${(j.marketConditions||[]).join(",")}, went well="${(j.wentWell||"").slice(0,100)}", improve="${(j.toImprove||"").slice(0,100)}", lessons="${(j.lessons||"").slice(0,100)}"`).join("\n");
  };

  const getGoalsContext = () => {
    if (!goals || !goals.dailyTargetPct) return "No goals set.";
    return `Daily target: ${goals.dailyTargetPct}%, Daily stop: ${goals.dailyStopPct||"not set"}%, Starting balance: $${goals.startingBalance||"not set"}`;
  };

  const buildPrompt = (analysisMode) => {
    const stats = buildStats(analysisMode === "quick" ? "recent" : analysisMode === "weekly" ? "week" : "all");
    if (!stats) return null;
    const base = `You are an expert trading coach analyzing a trader's performance data. Be direct, specific, and actionable. Reference actual numbers from the data. Use a supportive but honest tone — point out strengths AND weaknesses. Keep your response concise (3-5 paragraphs max). Do NOT use bullet point lists — write in natural prose paragraphs.`;

    if (analysisMode === "quick") {
      return { system: base, user: `QUICK DEBRIEF — Analyze my last 10 trades and give me immediate feedback.\n\nSTATS: ${stats.totalTrades} trades | ${stats.winRate}% WR | ${stats.wins}W/${stats.losses}L | P&L: $${stats.totalPnL} | Avg Win: $${stats.avgWin} | Avg Loss: $${stats.avgLoss} | PF: ${stats.profitFactor}\n\nTRADE DETAILS:\n${stats.recentDetail}\n\nSETUP BREAKDOWN:\n${stats.bySetup}\n\nTell me: What am I doing well? What's my biggest leak? What should I do differently on my next trade? If you see emotional patterns or poor risk management, call it out.` };
    }
    if (analysisMode === "weekly") {
      return { system: base, user: `WEEKLY REVIEW — Analyze my past week.\n\nSTATS (7 days): ${stats.totalTrades} trades | ${stats.winRate}% WR | P&L: $${stats.totalPnL} | Return: ${stats.returnPct} | Avg Win: $${stats.avgWin} | Avg Loss: $${stats.avgLoss} | PF: ${stats.profitFactor}\nAvg trades/day: ${stats.avgTradesPerDay} | Max trades one day: ${stats.maxTradesOneDay}\n\nBY DAY: ${stats.byDay}\nBY TIME: ${stats.byHour}\nSETUPS:\n${stats.bySetup}\nEMOTIONS: ${stats.byEmotion}\nGRADES: ${stats.byGrade}\n\nJOURNAL:\n${getJournalContext()}\n\nGOALS: ${getGoalsContext()}\n\nHow did I perform vs goals? Day/time patterns? Emotional patterns? What should I focus on next week?` };
    }
    if (analysisMode === "setup") {
      return { system: base, user: `SETUP ANALYSIS — Analyze performance by strategy.\n\nOVERALL: ${stats.totalTrades} trades | ${stats.winRate}% WR | P&L: $${stats.totalPnL} | Capital: $${stats.totalCapital}\n\nSETUPS:\n${stats.bySetup}\n\nBY DAY: ${stats.byDay}\nBY TIME: ${stats.byHour}\n\nWhich setups are my edge? Which should I stop trading? Any day/time patterns per setup? If trades are untagged, remind me to tag setups.` };
    }
    if (analysisMode === "patterns") {
      return { system: base, user: `BEHAVIORAL PATTERN ANALYSIS — Look for hidden patterns.\n\nSTATS: ${stats.totalTrades} total | ${stats.winRate}% WR | P&L: $${stats.totalPnL} | PF: ${stats.profitFactor}\nAvg trades/day: ${stats.avgTradesPerDay} | Max one day: ${stats.maxTradesOneDay}\nMax consec losses: ${stats.maxConsecLosses}\nPotential revenge trades: ${stats.revengeTradeCandidates}\n\nBY DAY: ${stats.byDay}\nBY TIME: ${stats.byHour}\nBY EMOTION: ${stats.byEmotion}\nBY GRADE: ${stats.byGrade}\nSETUPS:\n${stats.bySetup}\n\nRECENT:\n${stats.recentDetail}\n\nLook for: revenge trading, overtrading, emotional decisions, position sizing issues, time-of-day tendencies, grade vs P&L correlation. Give me 2-3 specific rules to adopt.` };
    }
    return null;
  };

  // ── Call Gemini API ──
  const callGemini = async (prompt) => {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${prefs?.geminiApiKey || GEMINI_FREE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: prompt.system }] },
        contents: [{ parts: [{ text: prompt.user }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.7 }
      })
    });
    if (!resp.ok) { const err = await resp.json().catch(()=>({})); throw new Error(err.error?.message || `Gemini error: ${resp.status}`); }
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "No response received.";
  };

  // ── Call Claude API (BYOK) ──
  const callClaude = async (prompt) => {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1024, system: prompt.system, messages: [{ role: "user", content: prompt.user }] })
    });
    if (!resp.ok) { const err = await resp.json().catch(()=>({})); throw new Error(err.error?.message || `Claude error: ${resp.status}`); }
    const data = await resp.json();
    return data.content?.map(c => c.type === "text" ? c.text : "").join("") || "No response received.";
  };

  const runAnalysis = async (analysisMode) => {
    if (usageToday >= COACH_DAILY_LIMIT) { setError(`Daily limit reached (${COACH_DAILY_LIMIT}/day). Try again tomorrow.`); return; }
    const prompt = buildPrompt(analysisMode);
    if (!prompt) { setError("Not enough trade data. Log more trades first."); return; }

    setMode(analysisMode); setLoading(true); setResult(null); setError(null);

    try {
      const useProvider = (aiProvider === "claude" && hasClaudeKey) ? "claude" : "gemini";
      const text = useProvider === "claude" ? await callClaude(prompt) : await callGemini(prompt);
      setResult({ text, provider: useProvider });
      incrementUsage();
    } catch (err) {
      setError(err.message || "Analysis failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const closedCount = (trades || []).filter(t => t.pnl !== null).length;
  const modeLabels = {
    quick: { title:"Quick Debrief", desc:"Your last 10 trades", icon:"⚡", color:"#a5b4fc" },
    weekly: { title:"Weekly Review", desc:"Past 7 days + journal", icon:"📅", color:"#4ade80" },
    setup: { title:"Setup Analysis", desc:"Performance by strategy", icon:"📊", color:"#60a5fa" },
    patterns: { title:"Pattern Detection", desc:"Hidden behavioral patterns", icon:"🔍", color:"#f59e0b" }
  };
  const activeProvider = (aiProvider === "claude" && hasClaudeKey) ? "claude" : "gemini";

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
        <Zap size={20} color="#a5b4fc"/>
        <span style={{ fontSize:18, fontWeight:700, color:"var(--tp-text)" }}>AI Trade Coach</span>
        <span style={{ fontSize:10, color:"var(--tp-faintest)", background:"var(--tp-card)", padding:"3px 8px", borderRadius:4, fontWeight:600 }}>{usageToday}/{COACH_DAILY_LIMIT} today</span>
        <span style={{ fontSize:9, padding:"3px 8px", borderRadius:4, fontWeight:700, background: activeProvider === "claude" ? "rgba(165,180,252,0.12)" : "rgba(74,222,128,0.12)", color: activeProvider === "claude" ? "#a5b4fc" : "#4ade80", textTransform:"uppercase", letterSpacing:0.5 }}>
          {activeProvider === "claude" ? "Claude" : "Gemini Flash"}
        </span>
      </div>
      <p style={{ fontSize:13, color:"var(--tp-faint)", marginBottom:20, lineHeight:1.6 }}>
        {activeProvider === "gemini"
          ? "Free AI coaching powered by Gemini Flash. For deeper behavioral analysis, connect your Claude API key in Settings → AI Integration."
          : "Advanced AI coaching powered by Claude. Using your API key for premium analysis."}
      </p>

      {!loading && !result && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:12, marginBottom:20 }}>
          {Object.entries(modeLabels).map(([key, m]) => (
            <button key={key} onClick={()=>runAnalysis(key)} disabled={closedCount < 3 || usageToday >= COACH_DAILY_LIMIT}
              style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:12, padding:"20px 18px", cursor: closedCount < 3 ? "not-allowed" : "pointer", textAlign:"left", transition:"border-color 0.2s, transform 0.15s", opacity: closedCount < 3 ? 0.5 : 1 }}
              onMouseEnter={e=>{if(closedCount>=3){e.currentTarget.style.borderColor="rgba(99,102,241,0.4)";e.currentTarget.style.transform="translateY(-2px)";}}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.07)";e.currentTarget.style.transform="translateY(0)";}}>
              <div style={{ fontSize:28, marginBottom:8 }}>{m.icon}</div>
              <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)", marginBottom:4 }}>{m.title}</div>
              <div style={{ fontSize:11, color:"var(--tp-faint)", lineHeight:1.4 }}>{m.desc}</div>
            </button>
          ))}
        </div>
      )}

      {closedCount < 3 && !loading && !result && (
        <div style={{ textAlign:"center", padding:"20px", background:"rgba(234,179,8,0.06)", border:"1px solid rgba(234,179,8,0.15)", borderRadius:10, color:"#eab308", fontSize:12 }}>
          Need at least 3 closed trades to run analysis. You have {closedCount} so far.
        </div>
      )}

      {loading && (
        <div style={{ textAlign:"center", padding:"60px 20px" }}>
          <div style={{ width:40, height:40, border:"3px solid rgba(99,102,241,0.2)", borderTop:"3px solid #6366f1", borderRadius:"50%", margin:"0 auto 16px", animation:"spin 1s linear infinite" }}/>
          <div style={{ fontSize:14, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Analyzing your trades...</div>
          <div style={{ fontSize:11, color:"var(--tp-faint)" }}>{modeLabels[mode]?.title} via {activeProvider === "claude" ? "Claude" : "Gemini Flash"}</div>
        </div>
      )}

      {error && (
        <div style={{ padding:"16px 20px", background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:10, marginBottom:16 }}>
          <div style={{ fontSize:13, color:"#f87171", fontWeight:600, marginBottom:4 }}>Analysis Error</div>
          <div style={{ fontSize:12, color:"#fca5a5" }}>{error}</div>
          <button onClick={()=>{setError(null);setMode(null);}} style={{ marginTop:10, padding:"6px 14px", borderRadius:6, border:"1px solid rgba(248,113,113,0.3)", background:"transparent", color:"#f87171", cursor:"pointer", fontSize:11, fontWeight:600 }}>Try Again</button>
        </div>
      )}

      {result && (
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:20 }}>{modeLabels[mode]?.icon}</span>
              <span style={{ fontSize:15, fontWeight:700, color:"var(--tp-text)" }}>{modeLabels[mode]?.title}</span>
              <span style={{ fontSize:9, padding:"2px 6px", borderRadius:3, background: result.provider === "claude" ? "rgba(165,180,252,0.12)" : "rgba(74,222,128,0.12)", color: result.provider === "claude" ? "#a5b4fc" : "#4ade80", fontWeight:600, textTransform:"uppercase" }}>{result.provider}</span>
            </div>
            <button onClick={()=>{setResult(null);setMode(null);}} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 14px", borderRadius:6, border:"1px solid var(--tp-border-l)", background:"var(--tp-card)", color:"var(--tp-muted)", cursor:"pointer", fontSize:11, fontWeight:600 }}>
              <ChevronLeft size={12}/> Back
            </button>
          </div>
          <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"22px 24px", lineHeight:1.8, fontSize:13, color:"var(--tp-text2)" }}>
            {result.text.split("\n\n").map((para, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : "14px 0 0 0" }}>{para}</p>
            ))}
          </div>
          <div style={{ marginTop:16, display:"flex", gap:8, flexWrap:"wrap" }}>
            {Object.entries(modeLabels).filter(([k]) => k !== mode).map(([key, m]) => (
              <button key={key} onClick={()=>runAnalysis(key)} disabled={usageToday >= COACH_DAILY_LIMIT}
                style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:7, border:"1px solid var(--tp-border-l)", background:"var(--tp-card)", color:"var(--tp-muted)", cursor:"pointer", fontSize:11, fontWeight:600 }}>
                {m.icon} {m.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PLAYBOOK TAB ────────────────────────────────────────────────────────────
const PLAYBOOK_CATEGORIES = ["Directional", "Options Income", "Options Spreads", "Scalp", "Swing", "Dividend", "Futures", "General"];
const RISK_LEVELS = ["Conservative", "Moderate", "Aggressive"];
const MARKET_CONDITIONS = ["Trending Up", "Trending Down", "Range-Bound", "High Volatility", "Low Volatility", "Breakout", "Choppy", "Any"];

const riskColor = (r) => ({ Conservative:"#4ade80", Moderate:"#eab308", Aggressive:"#f87171" }[r] || "#5c6070");
const catDot = (cat) => ({ Directional:"#60a5fa", "Options Income":"#4ade80", Scalp:"#f87171", Swing:"#a78bfa", Dividend:"#fb923c", Futures:"#eab308", General:"#8a8f9e" }[cat] || "#8a8f9e");

// ─── BUILT-IN STRATEGY LIBRARY ──────────────────────────────────────────────
const STRATEGY_LIBRARY = [
  // Directional
  { id:"lib-1", name:"Momentum Breakout", category:"Directional", risk:"Moderate", description:"Enter trades when price breaks above resistance on strong volume. Ride the momentum with a trailing stop.", entryRules:"• Price breaks above key resistance level\n• Volume surge (1.5x+ average)\n• Confirmation candle closes above level\n• RSI not extremely overbought (< 80)", exitRules:"• Trailing stop at 2x ATR\n• Take partial profits at 1:2 R:R\n• Exit if volume dries up on push\n• Hard stop below breakout level", priceAction:"Needs strong directional move with follow-through. Looking for expansion candles, not wicks. Volume confirms institutional participation. Works best in trending markets, not chop.", riskManagement:"Risk 1-2% of account per trade. Stop below breakout candle low. Scale out 50% at 2R, trail rest.", marketConditions:["Trending Up","Breakout"], tags:["momentum","breakout","volume"] },
  { id:"lib-2", name:"Trend Following", category:"Directional", risk:"Moderate", description:"Ride established trends using moving averages and trend indicators. Hold as long as the trend persists.", entryRules:"• Price above 20 EMA and 50 EMA\n• 20 EMA above 50 EMA (golden alignment)\n• Pullback to 20 EMA as entry\n• MACD histogram positive and rising", exitRules:"• Close below 20 EMA for quick trades\n• Close below 50 EMA for swing positions\n• Moving average crossover (death cross)\n• Trailing stop at 50 EMA", priceAction:"Requires sustained directional trend with higher highs and higher lows. Pullbacks to moving averages are entry opportunities, not exit signals. Let winners run.", riskManagement:"Risk 1% per trade. Wide stops (below 50 EMA). Smaller position size to accommodate wider stop. Add on pullbacks to EMA.", marketConditions:["Trending Up","Trending Down"], tags:["trend","ema","swing"] },
  { id:"lib-3", name:"Mean Reversion", category:"Directional", risk:"Moderate", description:"Trade extreme moves back toward the average. Buy oversold, sell overbought conditions expecting reversion to the mean.", entryRules:"• Price 2+ standard deviations from 20-day mean\n• RSI below 30 (oversold) or above 70 (overbought)\n• Bollinger Band touch or pierce\n• Volume spike on the extreme move", exitRules:"• Target: return to 20-day moving average\n• Stop: 1 ATR beyond entry extreme\n• Time stop: exit if no reversion in 3-5 days\n• Take profit at middle Bollinger Band", priceAction:"Price has made an extreme move and is statistically likely to revert. Not fighting the trend — looking for stretched rubber band snaps. Works poorly in strong trends.", riskManagement:"Smaller position size (0.5-1% risk). These can go further against you. Scale in rather than full position at once.", marketConditions:["Range-Bound","High Volatility"], tags:["mean-reversion","oversold","overbought","bollinger"] },
  { id:"lib-4", name:"Gap Fill", category:"Directional", risk:"Aggressive", description:"Trade gaps that are likely to fill — price returns to the previous close. Works best on overreaction gaps without fundamental catalysts.", entryRules:"• Gap up/down of 1-3% at open\n• No major news catalyst (earnings, FDA, etc.)\n• Pre-market volume is not extreme\n• Wait 5-15 min for direction confirmation", exitRules:"• Target: previous day's close (gap fill)\n• Stop: beyond the gap's high/low\n• Partial fill (50-75%) is acceptable exit\n• Time stop: exit by noon if no fill", priceAction:"Gap needs to show weakness within first 15 minutes. Fading gap ups require early selling pressure; fading gap downs need buying interest. Avoid gapping into major levels.", riskManagement:"Risk 1% max. These are aggressive trades. Use tight stops just beyond the gap extreme. Don't fight gaps with fundamental catalysts.", marketConditions:["High Volatility","Any"], tags:["gap","intraday","fade"] },

  // Options Income
  { id:"lib-5", name:"Covered Call", category:"Options Income", risk:"Conservative", description:"Sell call options against stock you already own to generate premium income. Best used in neutral-to-slightly-bullish markets. Reduces cost basis over time.", entryRules:"• Own 100+ shares of the underlying\n• Sell OTM calls (delta 0.20-0.35)\n• Choose 30-45 DTE for optimal theta decay\n• Sell on green days / after pops in IV", exitRules:"• Let expire worthless (ideal)\n• Buy back at 50-75% profit\n• Roll out and up if challenged\n• Accept assignment if above your target", priceAction:"Stock needs to stay flat or rise slowly. Sharp moves up mean missed upside (shares called away). Sharp moves down mean the premium only partially offsets losses.", riskManagement:"Only sell against shares you're willing to sell at the strike price. Don't sell too close to earnings. Keep some upside room — don't sell ATM unless very bearish.", marketConditions:["Range-Bound","Low Volatility","Trending Up"], tags:["covered-call","premium","income","theta"] },
  { id:"lib-6", name:"Cash-Secured Put", category:"Options Income", risk:"Conservative", description:"Sell put options with enough cash to buy the stock if assigned. Use when you want to acquire a stock at a lower price or collect premium.", entryRules:"• Sell OTM puts on stocks you want to own\n• Strike at price you'd be happy buying\n• 30-45 DTE, delta 0.20-0.30\n• Sell on red days / IV spikes", exitRules:"• Let expire worthless (collect full premium)\n• Buy back at 50% profit and re-sell\n• Roll down and out if challenged\n• Accept assignment and switch to covered calls", priceAction:"Need stock to stay above put strike. Flat or up is ideal. If assigned, you own shares at strike minus premium collected — a discount to current price.", riskManagement:"Must have cash to cover assignment (100 shares × strike). Only sell on stocks you genuinely want to own. Don't over-leverage — leave cash reserves.", marketConditions:["Range-Bound","Trending Up"], tags:["csp","put-selling","income","wheel","theta"] },
  { id:"lib-7", name:"Wheel Strategy", category:"Options Income", risk:"Moderate", description:"Cycle between selling cash-secured puts and covered calls on the same stock. Get assigned via put → sell covered calls → called away → repeat.", entryRules:"• Select stable stock you want to own long-term\n• Start by selling CSP at support level\n• If assigned, immediately sell covered call\n• If called away, start selling puts again", exitRules:"• Continuous cycle — no true exit\n• Pause if stock fundamentals deteriorate\n• Adjust strikes based on cost basis\n• Take profits on shares if big move up", priceAction:"Works best in range-bound to slightly bullish markets. Stock should oscillate around a mean. Avoid on stocks that trend hard in one direction — you'll be stuck holding or miss the run.", riskManagement:"Allocate capital per wheel position (100 shares worth). Track adjusted cost basis. Don't wheel on volatile or declining stocks. Keep premium collected as a running tally.", marketConditions:["Range-Bound","Low Volatility"], tags:["wheel","csp","covered-call","income","premium"] },
  { id:"lib-8", name:"Poor Man's Covered Call", category:"Options Income", risk:"Moderate", description:"Buy a deep ITM long-dated call (LEAPS) and sell short-dated OTM calls against it. A capital-efficient alternative to covered calls.", entryRules:"• Buy LEAPS call: delta 0.70-0.85, 6+ months out\n• Sell short-dated call: 30-45 DTE, delta 0.20-0.30\n• Cost of LEAPS should be < 75% of stock price\n• Enter when IV is low on the LEAPS", exitRules:"• Buy back short call at 50% profit, resell\n• Roll LEAPS when < 90 DTE remaining\n• Close entire position if LEAPS loses 50%\n• Take profit if stock runs significantly", priceAction:"Needs slow grind up or sideways. Sharp up moves are capped (but you keep LEAPS gains up to short strike). Sharp down moves hurt the LEAPS. Theta works for you on the short leg.", riskManagement:"Max risk = LEAPS cost minus premium collected. Never let short call go deeper ITM than your LEAPS strike. Keep an eye on extrinsic value of the LEAPS.", marketConditions:["Trending Up","Range-Bound"], tags:["pmcc","leaps","diagonal","income"] },

  // Scalp
  { id:"lib-9", name:"VWAP Reclaim", category:"Scalp", risk:"Aggressive", description:"Enter when price reclaims VWAP from below (long) or loses it from above (short). VWAP acts as institutional reference for fair value.", entryRules:"• Price crosses VWAP with conviction\n• Volume confirms the move\n• Reclaim happens in first 2 hours\n• Look for consolidation near VWAP before break", exitRules:"• Target: next technical level or HOD/LOD\n• Stop: below VWAP (long) or above (short)\n• Quick exit if no follow-through in 5-10 min\n• Trail stop tight for scalp", priceAction:"Price needs to decisively cross VWAP, not just wick through. Consolidation near VWAP followed by expansion is the ideal pattern. Avoid chasing extended moves away from VWAP.", riskManagement:"Risk 0.5-1% max. Tight stops. These are quick trades — if they don't work fast, they usually don't work at all. Scale out quickly.", marketConditions:["Any","High Volatility"], tags:["vwap","scalp","intraday","momentum"] },
  { id:"lib-10", name:"Opening Range Breakout", category:"Scalp", risk:"Aggressive", description:"Trade the breakout of the first 15-30 minutes opening range. Sets the tone for the trading day.", entryRules:"• Define opening range (first 15 or 30 min)\n• Enter on break above high or below low\n• Volume must confirm the breakout\n• Gap context matters (gap up = look for continuation)", exitRules:"• Target: 1-2x the opening range size\n• Stop: opposite side of opening range or midpoint\n• Exit if it reverses back into range\n• Time stop: exit by lunch if no extension", priceAction:"Opening range establishes the day's initial balance. Breakout direction often sets the trend for the day. Wide opening ranges are harder to break out of. Narrow ORs have better breakout potential.", riskManagement:"Risk 0.5-1%. Stop is often the midpoint of the opening range for tighter risk. Don't chase — wait for the break, not a move that's already extended.", marketConditions:["High Volatility","Breakout","Any"], tags:["orb","opening-range","scalp","intraday"] },
  { id:"lib-11", name:"Red-to-Green", category:"Scalp", risk:"Aggressive", description:"Enter long when a stock that opened red (below prior close) reverses and trades green. Signals strong buying pressure overcoming overnight selling.", entryRules:"• Stock opens red (below prior close)\n• Price reverses and breaks above prior close\n• Volume increasing on the reversal\n• Best on stocks with catalyst or sector strength", exitRules:"• Target: HOD or key resistance level\n• Stop: below the reversal low\n• Partial profits at 1R\n• Exit if it recrosses back to red", priceAction:"Stock gaps down or opens weak, finds support, then buying pressure overwhelms sellers and pushes through the prior close. The prior close becomes support. Strength begets strength.", riskManagement:"Risk 0.5-1%. Stop below the reversal candle low. Quick trade — should show continuation within minutes of going green.", marketConditions:["High Volatility","Any"], tags:["red-to-green","reversal","scalp","intraday"] },

  // Dividend
  { id:"lib-12", name:"Dividend Capture", category:"Dividend", risk:"Conservative", description:"Buy stocks before the ex-dividend date to capture the dividend payment, then sell after. Focus on high-yield, low-volatility stocks.", entryRules:"• Buy 1-3 days before ex-dividend date\n• Focus on stocks with 3%+ annual yield\n• Avoid stocks with high IV around ex-date\n• Check if dividend is qualified vs ordinary", exitRules:"• Sell on or after ex-dividend date\n• Accept the stock drop (usually = dividend amount)\n• Hold if stock recovers quickly\n• Don't hold through earnings if close", priceAction:"Stock typically drops by the dividend amount on ex-date. Strategy profits if the stock recovers that drop, or the dividend income exceeds any capital loss. Works better in stable markets.", riskManagement:"Use with large-cap, stable stocks. Position size for yield, not capital gains. Account for the ex-date price drop. Consider tax implications of short-term holds.", marketConditions:["Range-Bound","Low Volatility","Trending Up"], tags:["dividend","income","capture"] },
  { id:"lib-13", name:"DRIP & Hold", category:"Dividend", risk:"Conservative", description:"Long-term dividend growth investing with dividend reinvestment (DRIP). Build positions in quality dividend growers over time.", entryRules:"• Select companies with 10+ years of dividend increases\n• Payout ratio below 60%\n• Strong free cash flow growth\n• Buy on pullbacks to moving averages", exitRules:"• Dividend cut or freeze\n• Fundamentals deteriorate significantly\n• Payout ratio exceeds 80%\n• Better opportunity elsewhere", priceAction:"Long-term appreciation not the primary goal — dividend income and growth is. Compounding reinvested dividends over years builds significant positions. Ignore short-term price noise.", riskManagement:"Diversify across sectors (utilities, healthcare, staples, tech). Don't chase highest yield — focus on growth rate. Reinvest all dividends. Hold through volatility.", marketConditions:["Any"], tags:["drip","dividend","long-term","income","compounding"] },

  // Swing
  { id:"lib-14", name:"Support/Resistance Bounce", category:"Swing", risk:"Moderate", description:"Buy at established support levels and sell at resistance. Works best in range-bound markets with clearly defined levels.", entryRules:"• Price reaches established support (2+ touches)\n• Bullish candlestick pattern at support\n• Volume decreasing on approach (selling exhaustion)\n• RSI showing bullish divergence", exitRules:"• Target: previous resistance level\n• Stop: below support level (1 ATR buffer)\n• Partial profit at midpoint of range\n• Adjust if level breaks with conviction", priceAction:"Price oscillates between established support and resistance. Each bounce off support or rejection at resistance is a trade opportunity. The more times a level is tested, the more likely it breaks.", riskManagement:"Risk 1-2%. Stop just below support for longs, just above resistance for shorts. R:R should be at least 2:1 given the defined range.", marketConditions:["Range-Bound"], tags:["support","resistance","bounce","swing","range"] },
  { id:"lib-15", name:"Channel Trading", category:"Swing", risk:"Moderate", description:"Trade within a defined price channel — buy at the lower boundary, sell at the upper boundary. Consistent profits in established channels.", entryRules:"• Identify parallel channel (3+ touches each side)\n• Enter long at lower channel line\n• Enter short at upper channel line\n• Confirm with oscillator (RSI, Stochastic)", exitRules:"• Exit at opposite channel boundary\n• Stop: outside the channel (1 ATR)\n• Partial profits at channel midline\n• Exit all positions if channel breaks", priceAction:"Price respects channel boundaries, bouncing between upper and lower trendlines. Higher lows and higher highs (ascending) or lower lows and lower highs (descending) provide direction bias.", riskManagement:"Risk 1-1.5%. Channels eventually break — always use stops outside the channel. Reduce position size as the channel ages (more likely to break).", marketConditions:["Range-Bound","Trending Up","Trending Down"], tags:["channel","swing","trendline","range"] },
  { id:"lib-16", name:"Earnings Play", category:"Swing", risk:"Aggressive", description:"Take positions around earnings announcements. Can be directional bets or volatility plays using options.", entryRules:"• Research expected EPS and revenue estimates\n• Analyze whisper numbers and options flow\n• For IV play: enter 5-7 days before earnings\n• For directional: use risk-defined options spreads", exitRules:"• Close before earnings (IV crush play)\n• Or hold through and manage next day\n• Take profits on any 50%+ gain pre-earnings\n• Accept max loss on defined-risk trades", priceAction:"For IV plays: sell premium before earnings, buy it back after the IV crush. For directional: need to correctly predict the move AND magnitude. Options pricing often implies the expected move.", riskManagement:"Use defined-risk strategies (spreads, iron condors). Never risk more than 2% on an earnings play. Understand that earnings are binary events — anything can happen.", marketConditions:["High Volatility","Any"], tags:["earnings","volatility","iv-crush","options","event"] },
  { id:"lib-17", name:"Breakout Pullback", category:"Swing", risk:"Moderate", description:"Wait for a breakout, then enter on the first pullback to the breakout level. Higher probability than chasing the initial breakout.", entryRules:"• Price breaks above resistance on volume\n• Wait for pullback to former resistance (now support)\n• Enter when price bounces off the new support\n• Volume should decrease on pullback, increase on bounce", exitRules:"• Target: measured move (height of prior range)\n• Stop: below the pullback low\n• Trail stop as price advances\n• Exit if it breaks back below the breakout level", priceAction:"After a breakout, price often retests the breakout level before continuing. This pullback gives a better entry with a tighter stop. Failed retests (breaks back below) are stop-outs.", riskManagement:"Risk 1-2%. Tighter stops possible because you're entering at a defined level. Wait for the pullback — don't chase the initial breakout. Patience pays off.", marketConditions:["Breakout","Trending Up"], tags:["breakout","pullback","retest","swing"] },
  { id:"lib-18", name:"Bull Put Spread", category:"Options Spreads", risk:"Moderate", description:"Sell a put at a higher strike and buy a put at a lower strike. Collect net credit. Profitable if stock stays above the short put strike at expiration.", entryRules:"• Sell OTM put (delta 0.25-0.35)\n• Buy further OTM put 2-5 strikes below\n• 30-45 DTE for optimal theta\n• Enter when IV is elevated (IV rank > 30)", exitRules:"• Buy back at 50-75% of max profit\n• Close if stock drops below short strike\n• Roll down and out if tested early\n• Let expire if both strikes OTM near expiry", priceAction:"Stock needs to stay above the short put strike. Flat, slightly up, or even slightly down is fine as long as it doesn't breach the short strike. Time decay (theta) works in your favor every day.", riskManagement:"Max loss = width of strikes - credit received. Max gain = credit received. Keep position size so max loss is < 3% of account. Spread width determines risk/reward.", marketConditions:["Range-Bound","Trending Up","Low Volatility"], tags:["bull-put-spread","credit-spread","options","income","theta"] },

  // Options Spreads — Advanced multi-leg strategies
  { id:"lib-19", name:"Bear Call Spread", category:"Options Spreads", risk:"Moderate", description:"Sell a call at a lower strike and buy a call at a higher strike. Collect net credit. Profits when stock stays below the short call strike. Bearish or neutral outlook.", entryRules:"• Sell OTM call (delta 0.25-0.35)\n• Buy further OTM call 2-5 strikes above\n• 30-45 DTE for optimal theta decay\n• Enter when IV rank > 30\n• Short strike above key resistance", exitRules:"• Buy back at 50-75% of max profit\n• Close if stock rallies above short strike\n• Roll up and out if tested early\n• Let expire if both strikes OTM", priceAction:"Stock needs to stay below the short call strike. Flat, slightly down, or even slightly up is fine. Avoid on momentum stocks or ahead of catalysts that could cause a big up move.", riskManagement:"Max loss = spread width - credit received. Max gain = credit received. Keep max loss < 3% of account. Never sell calls below resistance.", marketConditions:["Trending Down","Range-Bound","Low Volatility"], tags:["bear-call-spread","credit-spread","bearish","options"] },
  { id:"lib-20", name:"Iron Condor", category:"Options Spreads", risk:"Moderate", description:"Sell an OTM put spread and an OTM call spread simultaneously. Profit from the stock staying within a range. Combines a bull put spread with a bear call spread.", entryRules:"• Sell OTM put (delta 0.15-0.25)\n• Buy further OTM put below\n• Sell OTM call (delta 0.15-0.25)\n• Buy further OTM call above\n• 30-45 DTE, IV rank > 30", exitRules:"• Buy back at 50% of max profit\n• Close tested side if stock approaches short strike\n• Roll untested side closer for more credit\n• Close entire position 7-10 DTE", priceAction:"Stock must stay between the two short strikes. Best on range-bound stocks with high IV. The wider the short strikes, the higher the probability of profit but the lower the credit collected. Time and volatility decay help.", riskManagement:"Max loss = wider spread width - total credit. Max gain = total credit. Position size so max loss < 3-5% of account. One side's margin covers both since only one can lose.", marketConditions:["Range-Bound","Low Volatility","High Volatility"], tags:["iron-condor","neutral","premium","theta","defined-risk"] },
  { id:"lib-21", name:"Iron Butterfly", category:"Options Spreads", risk:"Moderate", description:"Sell an ATM put and ATM call at the same strike, then buy OTM wings for protection. Higher credit than iron condor but narrower profit zone. Ideal when expecting a stock to pin at a specific price.", entryRules:"• Sell ATM put and ATM call (same strike)\n• Buy OTM put 5-10 strikes below\n• Buy OTM call 5-10 strikes above\n• 30-45 DTE\n• Best when IV is elevated", exitRules:"• Buy back at 25-50% of max profit\n• Close if stock moves past breakeven\n• Manage early — don't hold to expiration\n• Close by 14 DTE to avoid gamma risk", priceAction:"Stock must stay very close to the short strike at expiration for max profit. Wider wings reduce risk but lower credit. Higher credit than iron condor but requires more precise stock pinning.", riskManagement:"Max loss = wing width - credit received. Max gain = total credit. More aggressive than iron condor. Close early if profit target is reached — don't get greedy.", marketConditions:["Range-Bound","Low Volatility"], tags:["iron-butterfly","neutral","premium","defined-risk","atm"] },
  { id:"lib-22", name:"Long Straddle", category:"Options Spreads", risk:"Aggressive", description:"Buy an ATM call and ATM put at the same strike and expiration. Profit from a big move in either direction. Pay a debit upfront.", entryRules:"• Buy ATM call and ATM put (same strike)\n• 30-60 DTE to allow time for the move\n• Enter when IV is LOW (IV rank < 20)\n• Best before expected catalysts (earnings, FDA, etc.)", exitRules:"• Close when total position is up 50-100%\n• Close one leg if directional move is clear\n• Stop: close if position loses 50%\n• Time stop: close by 14 DTE if no move", priceAction:"Need a BIG move in either direction to overcome the cost of both options. Implied move must be larger than the straddle price. Rising IV benefits the position even without a price move.", riskManagement:"Max loss = total premium paid (both options). Large moves needed to profit. Best used sparingly before high-probability catalysts. Position size small (1-2% of account).", marketConditions:["High Volatility","Breakout"], tags:["straddle","long-straddle","volatility","big-move","earnings"] },
  { id:"lib-23", name:"Long Strangle", category:"Options Spreads", risk:"Aggressive", description:"Buy an OTM call and OTM put at different strikes. Cheaper than a straddle but requires a larger move to profit. Profits from big directional moves or IV expansion.", entryRules:"• Buy OTM call (delta 0.25-0.35)\n• Buy OTM put (delta 0.25-0.35)\n• 30-60 DTE\n• Enter when IV is low and expected to rise\n• Best before binary events", exitRules:"• Close at 50-100% gain on the position\n• Close one leg on a directional break\n• Stop: close if position loses 50%\n• Time stop: close by 14 DTE", priceAction:"Cheaper than a straddle but requires a bigger move. Stock needs to go past one of the strike prices by more than the combined premium. IV expansion helps even without a price move.", riskManagement:"Max loss = total premium paid. Cheaper than straddle but needs bigger move. Use before high-probability catalysts. Keep position size very small.", marketConditions:["High Volatility","Breakout"], tags:["strangle","long-strangle","volatility","big-move"] },
  { id:"lib-24", name:"Calendar Spread", category:"Options Spreads", risk:"Moderate", description:"Sell a short-dated option and buy a longer-dated option at the same strike. Profits from time decay difference and IV changes. Also called a horizontal or time spread.", entryRules:"• Sell front-month option (14-30 DTE)\n• Buy back-month option (45-60 DTE) same strike\n• ATM strike for max theta benefit\n• Enter when front-month IV > back-month IV", exitRules:"• Close at 25-50% profit on the spread\n• Close if stock moves far from the strike\n• Roll the short leg to next expiration if profitable\n• Close entire position before front-month expiry", priceAction:"Stock needs to stay near the strike price. Front option decays faster than back option, widening the spread value. Big moves in either direction hurt. IV increase in the back month helps.", riskManagement:"Max loss = net debit paid. Risk is limited but you can lose the entire debit. Best in stable, low-volatility environments. Small position sizes.", marketConditions:["Range-Bound","Low Volatility"], tags:["calendar","time-spread","horizontal","theta","neutral"] },
  { id:"lib-25", name:"Butterfly Spread", category:"Options Spreads", risk:"Moderate", description:"Buy 1 ITM option, sell 2 ATM options, buy 1 OTM option. All same expiration. Low cost, limited risk, profits if stock pins at the middle strike.", entryRules:"• Buy 1 lower strike option\n• Sell 2 middle strike options (ATM)\n• Buy 1 upper strike option\n• Equal distance between all strikes\n• 14-30 DTE for max gamma effect", exitRules:"• Close at 50-100% profit\n• Close if stock moves well beyond wings\n• Hold closer to expiration for max value\n• Always close before expiration to avoid assignment", priceAction:"Stock must pin very close to the middle strike at expiration. Cheap to enter with defined risk. Max profit is large relative to cost, but probability of max profit is low. Good for targeting a specific price.", riskManagement:"Max loss = net debit paid (usually small). Max gain = distance between strikes - debit. Low cost but low probability. Use for cheap directional bets or price targets.", marketConditions:["Range-Bound","Low Volatility"], tags:["butterfly","defined-risk","neutral","pin"] },
  { id:"lib-26", name:"Jade Lizard", category:"Options Spreads", risk:"Moderate", description:"Sell an OTM put and an OTM call spread (short call + long call). Collects premium with no upside risk if credit received exceeds the call spread width. Undefined risk to downside.", entryRules:"• Sell OTM put (delta 0.20-0.30)\n• Sell OTM call (delta 0.20-0.25)\n• Buy further OTM call (cap upside risk)\n• Total credit > call spread width (eliminates upside risk)\n• 30-45 DTE", exitRules:"• Buy back at 50% of max profit\n• Close put side if stock drops sharply\n• Roll if tested on either side\n• Close by 14 DTE", priceAction:"Stock stays between the short strikes. No risk to the upside if structured correctly (credit > call spread width). Downside risk is similar to a short put. Best on stocks you'd own.", riskManagement:"Upside risk = zero if credit > call spread width. Downside risk = short put strike - credit received. Only use on stocks you're willing to own at the put strike.", marketConditions:["Range-Bound","Trending Up"], tags:["jade-lizard","premium","neutral","undefined-risk"] },

  // More Directional
  { id:"lib-27", name:"ABCD Pattern", category:"Directional", risk:"Moderate", description:"Trade the classic ABCD harmonic pattern — a measured move where the CD leg mirrors the AB leg. Provides precise entry, stop, and target levels.", entryRules:"• Identify AB leg (initial move)\n• BC leg retraces 38.2-78.6% of AB\n• Enter at D when CD = AB in length\n• Volume should confirm at point D\n• Fibonacci extensions align at D", exitRules:"• Target: 127.2% or 161.8% extension of AD\n• Stop: below point D (long) or above D (short)\n• Partial profit at point A level\n• Trail remaining position", priceAction:"The AB and CD legs should be roughly equal in price and time. BC is a retracement. Point D is where the pattern completes and the reversal is expected. The more Fibonacci levels that converge at D, the stronger the setup.", riskManagement:"Risk 1-2%. Stop just beyond point D. R:R typically 2:1 or better. Pattern invalidation (break of D) = immediate exit.", marketConditions:["Trending Up","Trending Down","Any"], tags:["abcd","harmonic","fibonacci","pattern"] },
  { id:"lib-28", name:"Moving Average Crossover", category:"Directional", risk:"Moderate", description:"Enter trades when a faster moving average crosses a slower one. Classic trend-following signal. Golden cross (bullish) and death cross (bearish).", entryRules:"• Fast MA (9 or 20 EMA) crosses above slow MA (50 or 200 SMA)\n• Volume confirms the crossover\n• Price pulls back to the fast MA after cross\n• MACD confirms direction", exitRules:"• Fast MA crosses back below slow MA\n• Price closes below the slow MA\n• Trailing stop at 2x ATR\n• Exit if momentum divergence appears", priceAction:"Crossovers lag the actual turn but provide confirmation. Best used with additional confluence (support/resistance, volume, other indicators). Avoid in choppy, range-bound markets where crossovers whipsaw.", riskManagement:"Risk 1-2%. Wide stops required (below the slow MA). Smaller position size to accommodate. Best for swing trades, not scalps.", marketConditions:["Trending Up","Trending Down"], tags:["moving-average","crossover","golden-cross","trend"] },
  { id:"lib-29", name:"Fibonacci Retracement", category:"Directional", risk:"Moderate", description:"Enter at key Fibonacci retracement levels (38.2%, 50%, 61.8%) during pullbacks in a trend. The golden ratio provides natural support and resistance levels.", entryRules:"• Identify a clear impulsive move\n• Wait for pullback to 38.2%, 50%, or 61.8% level\n• Look for reversal candles at Fib level\n• Volume should decrease on pullback\n• Enter with confirmation candle", exitRules:"• Target: new high (long) or new low (short)\n• Stop: below 78.6% retracement\n• Partial profit at previous extreme\n• Trail stop using Fib extensions (127.2%, 161.8%)", priceAction:"Fibonacci levels act as natural support/resistance. The 61.8% (golden ratio) is the most watched level. Confluence with other support/resistance greatly increases probability.", riskManagement:"Risk 1-2%. Stop below the next Fib level. Best setups have multiple confluence factors at the same Fib level. Don't force — wait for price action confirmation.", marketConditions:["Trending Up","Trending Down"], tags:["fibonacci","retracement","pullback","golden-ratio"] },
  { id:"lib-30", name:"Parabolic SAR Reversal", category:"Directional", risk:"Moderate", description:"Use the Parabolic SAR indicator to identify trend direction and reversal points. Dots flip from above to below price (bullish) or below to above (bearish).", entryRules:"• SAR dots flip from above price to below (long)\n• Or from below price to above (short)\n• Confirm with volume and MACD\n• Enter at the close of the flip candle\n• Best when aligned with higher timeframe trend", exitRules:"• SAR dots flip to opposite side\n• Use SAR dots as a trailing stop\n• Exit at key support/resistance levels\n• Tighten stops in overbought/oversold conditions", priceAction:"SAR provides dynamic trailing stop levels. Best in trending markets. In choppy markets, the dots flip frequently causing whipsaws. Combine with trend filters to avoid false signals.", riskManagement:"Risk 1-2%. SAR dots define your stop level — the trade is wrong if price crosses the dots. Works best as a trend-following tool, not a reversal indicator.", marketConditions:["Trending Up","Trending Down"], tags:["parabolic-sar","reversal","trailing-stop","trend"] },

  // More Scalp strategies
  { id:"lib-31", name:"Level 2 / Tape Reading", category:"Scalp", risk:"Aggressive", description:"Read the Level 2 order book and time & sales to identify institutional buying/selling pressure. Scalp based on order flow, not chart patterns.", entryRules:"• Large bid stacking at a key level (support)\n• Heavy buying on time & sales (green prints)\n• Absorption of selling (bid holds)\n• Enter when buyers overwhelm sellers\n• Best in first 30 minutes of market", exitRules:"• Bid pulls away or thins out\n• Heavy selling hits the tape\n• Quick exit if no follow-through in 1-2 min\n• Target: next whole number or resistance", priceAction:"Pure order flow trading. Watch for iceberg orders, bid/ask stacking, and large prints on the tape. This is about reading the battle between buyers and sellers in real-time.", riskManagement:"Very tight stops (pennies). Risk 0.25-0.5%. These are quick scalps — seconds to minutes. Requires Level 2 data and fast execution. Not suitable for slow platforms.", marketConditions:["High Volatility","Any"], tags:["level-2","tape-reading","order-flow","scalp"] },
  { id:"lib-32", name:"Micro Pullback Scalp", category:"Scalp", risk:"Aggressive", description:"In a strong intraday trend, enter on tiny 1-2 candle pullbacks on the 1-minute chart. Ride the micro-momentum for quick profits.", entryRules:"• Stock in strong intraday trend (VWAP trending)\n• Wait for 1-2 red candle pullback (in uptrend)\n• Enter on first green candle after pullback\n• Volume should be declining on pullback\n• Use 9 EMA as dynamic support", exitRules:"• Quick profit: $0.10-$0.50 per share\n• Stop: below the pullback low\n• Exit if 9 EMA breaks\n• Time in trade: 1-5 minutes max", priceAction:"In a strong trend, tiny pullbacks are buying opportunities, not reversal signals. The 9 EMA on the 1-min chart acts as dynamic support. If the stock can't even pullback to 9 EMA, it's very strong.", riskManagement:"Risk 0.25-0.5%. Very tight stops. High frequency — may take 5-10 of these per day. Focus on high-volume, liquid stocks. Commission costs matter at this frequency.", marketConditions:["Trending Up","Trending Down","High Volatility"], tags:["micro-pullback","scalp","1-minute","momentum","9ema"] },

  // Futures specific
  { id:"lib-33", name:"ES/NQ Overnight Range", category:"Futures", risk:"Moderate", description:"Trade the breakout or fade of the overnight session range on S&P 500 (ES) or Nasdaq (NQ) futures at the regular session open.", entryRules:"• Define overnight high and low (6 PM - 9:30 AM ET)\n• Trade breakout above overnight high (long)\n• Trade breakout below overnight low (short)\n• Or fade into the range if rejection at extremes\n• Wait for first 5-min candle confirmation", exitRules:"• Target: measured move (overnight range size)\n• Stop: opposite side of overnight range or midpoint\n• Partial profit at 1:1 R:R\n• Time stop: close by noon if no extension", priceAction:"The overnight range establishes a balance area. A breakout with volume signals directional conviction. A rejection/fade back into range signals the breakout was a fakeout. Context (gap, news) matters.", riskManagement:"Risk 1-2 points on ES, 5-10 on NQ. Use proper futures position sizing based on point value ($50/pt ES, $20/pt NQ). One contract at a time for beginners.", marketConditions:["Any","High Volatility","Breakout"], tags:["futures","es","nq","overnight","range","breakout"] },
  { id:"lib-34", name:"Crude Oil Inventory Trade", category:"Futures", risk:"Aggressive", description:"Trade crude oil futures (CL) around the weekly EIA inventory report (Wednesday 10:30 AM ET). Volatility spikes provide quick scalp opportunities.", entryRules:"• Wait for EIA report at 10:30 AM ET\n• If draw > expected: go long (bullish)\n• If build > expected: go short (bearish)\n• Wait 30-60 seconds for initial spike to settle\n• Enter on first pullback after the move", exitRules:"• Target: $0.30-$0.80 per contract\n• Stop: beyond the post-report high/low\n• Quick trade: 2-15 minutes max\n• Don't hold into the afternoon session", priceAction:"EIA report causes instant volatility. Initial spike is often exaggerated and partially retraces. The second move after the pullback tends to be the real direction. Be patient — don't chase the spike.", riskManagement:"Risk 1 contract. Crude oil is $10/tick — very fast moving. Use hard stops. Don't overtrade. One clean entry and exit. Beginners should paper trade this first.", marketConditions:["High Volatility"], tags:["futures","crude-oil","cl","inventory","news","event"] },
  { id:"lib-35", name:"Market Profile Value Area", category:"Futures", risk:"Moderate", description:"Trade based on Market Profile concepts — Value Area High (VAH), Value Area Low (VAL), and Point of Control (POC). Price tends to revert to value areas.", entryRules:"• Identify prior day's VAH, VAL, and POC\n• Long at VAL if in balance/uptrend\n• Short at VAH if in balance/downtrend\n• Breakout trade if price opens outside value area\n• Confirmation: price acceptance or rejection", exitRules:"• Target: POC from VAL, or VAH from POC\n• Stop: 2-4 points beyond the level (ES)\n• Exit if price spends 2+ periods outside value\n• Close if thesis is invalidated", priceAction:"Price spends 70% of time within the value area. Trades at the edges of value are high-probability reversion trades. Breakouts outside value with acceptance signal trend days. POC acts as a magnet.", riskManagement:"Risk 2-3 points on ES. Position size based on account and futures margin. Value area trades have good R:R since stops are tight and targets are defined.", marketConditions:["Range-Bound","Any"], tags:["market-profile","value-area","poc","futures","es"] },

  // More advanced options
  { id:"lib-36", name:"Ratio Spread", category:"Options Spreads", risk:"Aggressive", description:"Buy 1 option and sell 2 (or more) options at a different strike. Creates a position with limited risk in one direction and unlimited risk in the other. Used for directional bias with premium collection.", entryRules:"• Buy 1 ATM or slightly ITM call\n• Sell 2 further OTM calls\n• Net debit should be small or zero-cost\n• 30-60 DTE\n• Enter when IV is elevated on the OTM strikes", exitRules:"• Close at 50% profit on the spread\n• Close if stock approaches the short strikes\n• Roll the short strikes up if needed\n• Never let both short options go ITM", priceAction:"Best when you expect a moderate move to the short strike price. Max profit at the short strike at expiration. Danger zone is above the short strikes where you have naked exposure.", riskManagement:"Unlimited risk above the short strikes (on call ratios). Must monitor closely. Position size small. Have a hard stop level planned. Not for beginners.", marketConditions:["Trending Up","Range-Bound"], tags:["ratio-spread","advanced","options","directional"] },
  { id:"lib-37", name:"0DTE Credit Spread", category:"Options Spreads", risk:"Aggressive", description:"Sell credit spreads on same-day expiration (0 DTE) on SPX, SPY, or QQQ. Rapid theta decay means quick profits — or quick losses. High-frequency income strategy.", entryRules:"• Sell OTM put or call spread on SPX/SPY/QQQ\n• 0 DTE (expires today)\n• Short strike at delta 0.10-0.15\n• $5-$10 wide spreads\n• Enter after 10 AM once direction is established", exitRules:"• Close at 50-80% of max profit\n• Stop: close at 2x credit received\n• Close if underlying approaches short strike\n• All positions close by 3:45 PM", priceAction:"Theta melts rapidly on expiration day. Need the underlying to stay away from short strikes. Gamma risk is enormous — positions can go from profit to loss in minutes. The afternoon theta burn is most aggressive.", riskManagement:"Max loss = spread width - credit. Risk 1-2% per trade max. Don't revenge trade. Set daily loss limits. This strategy has high win rates but the losses can be large relative to wins.", marketConditions:["Range-Bound","Low Volatility","Any"], tags:["0dte","zero-dte","same-day","credit-spread","spx","theta"] },
  { id:"lib-38", name:"Diagonal Spread", category:"Options Spreads", risk:"Moderate", description:"Buy a longer-dated option and sell a shorter-dated option at a different strike. Combines elements of calendar spreads and vertical spreads. Also called a diagonal calendar.", entryRules:"• Buy back-month option (60-90 DTE)\n• Sell front-month option (14-30 DTE)\n• Different strikes (diagonal)\n• For bullish: buy ITM call, sell OTM call\n• Net debit entry", exitRules:"• Close short leg at 50% profit, resell\n• Roll short leg to next expiration\n• Close entire position at 50% gain\n• Exit if long option loses 50% of value", priceAction:"Combines directional bias with theta decay. The short option decays faster than the long option. Stock should move slowly toward the short strike for maximum profit. Avoid big sudden moves.", riskManagement:"Max loss = net debit paid. Risk is defined. Manage the short leg actively — roll or close at 50% profit. Keep the long option as your safety net.", marketConditions:["Trending Up","Trending Down","Range-Bound"], tags:["diagonal","calendar","time-spread","options"] },
];

const emptyPlaybook = () => ({
  id: Date.now() + Math.random(),
  name: "",
  category: "Directional",
  risk: "Moderate",
  description: "",
  entryRules: "",
  exitRules: "",
  priceAction: "",
  riskManagement: "",
  marketConditions: [],
  tags: [],
  screenshots: [],
  isLibrary: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

function PlaybookTab({ playbooks, onSave, trades }) {
  const [showModal, setShowModal] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [viewingSrc, setViewingSrc] = useState(null);
  const [section, setSection] = useState("library"); // library | my_setups | analytics
  const [collapsedCats, setCollapsedCats] = useState({});

  const toggleCatCollapse = (cat) => setCollapsedCats(p => ({ ...p, [cat]: !p[cat] }));

  const handleSave = (pb) => {
    onSave(prev => {
      const idx = (prev||[]).findIndex(p => p.id === pb.id);
      if (idx >= 0) { const u = [...prev]; u[idx] = { ...pb, updatedAt: new Date().toISOString() }; return u; }
      return [...(prev||[]), pb];
    });
    setShowModal(false); setEditingPlaybook(null);
  };

  const handleDelete = (id) => onSave(prev => (prev||[]).filter(p => p.id !== id));

  const cloneToMySetups = (libEntry) => {
    const clone = { ...libEntry, id: Date.now() + Math.random(), isLibrary: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    onSave(prev => [...(prev||[]), clone]);
    setSection("my_setups");
  };

  // Merge sources based on section
  const allItems = section === "library" ? STRATEGY_LIBRARY : section === "my_setups" ? (playbooks || []) : [];

  const filtered = allItems.filter(pb => {
    if (categoryFilter !== "All" && pb.category !== categoryFilter) return false;
    if (riskFilter !== "All" && pb.risk !== riskFilter) return false;
    if (search && !pb.name.toLowerCase().includes(search.toLowerCase()) && !(pb.tags||[]).some(t=>t.toLowerCase().includes(search.toLowerCase())) && !(pb.description||"").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by category
  const grouped = {};
  filtered.forEach(pb => { if (!grouped[pb.category]) grouped[pb.category] = []; grouped[pb.category].push(pb); });
  const categoryOrder = PLAYBOOK_CATEGORIES;
  const sortedCategories = categoryOrder.filter(c => grouped[c]);

  // Per-playbook trade stats
  const getPlaybookStats = (pbName) => {
    const pbTrades = trades.filter(t => t.playbook === pbName && t.pnl !== null);
    if (pbTrades.length === 0) return null;
    const wins = pbTrades.filter(t => t.pnl > 0);
    const totalPnL = pbTrades.reduce((s,t) => s+t.pnl, 0);
    return { count: pbTrades.length, winRate: (wins.length / pbTrades.length) * 100, totalPnL, avgPnL: totalPnL / pbTrades.length, wins: wins.length, losses: pbTrades.length - wins.length };
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", marginBottom:20 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <BookOpen size={22} color="#a5b4fc"/>
            <span style={{ fontSize:20, fontWeight:700, color:"var(--tp-text)" }}>{section === "library" ? "Strategy Library" : "My Setups"}</span>
          </div>
          <div style={{ fontSize:13, color:"var(--tp-faint)" }}>
            {section === "library" ? "Browse pre-built strategies — use as templates for your own setups" : "Your personal playbook — tag trades to track performance per setup"}
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {section === "my_setups" && (
            <button onClick={()=>{setEditingPlaybook(null);setShowModal(true);}} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}><Plus size={15}/> New Setup</button>
          )}
        </div>
      </div>

      {/* Section toggle + filters */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        {/* Library / My Setups toggle */}
        <div style={{ display:"flex", borderRadius:8, overflow:"hidden", border:"1px solid var(--tp-border-l)" }}>
          <button onClick={()=>setSection("library")} style={{ padding:"7px 16px", border:"none", background:section==="library"?"rgba(99,102,241,0.2)":"var(--tp-card)", color:section==="library"?"#a5b4fc":"#5c6070", cursor:"pointer", fontSize:12, fontWeight:600 }}>📚 Library</button>
          <button onClick={()=>setSection("my_setups")} style={{ padding:"7px 16px", border:"none", background:section==="my_setups"?"rgba(99,102,241,0.2)":"var(--tp-card)", color:section==="my_setups"?"#a5b4fc":"#5c6070", cursor:"pointer", fontSize:12, fontWeight:600, borderLeft:"1px solid rgba(255,255,255,0.08)" }}>⚡ My Setups</button>
          <button onClick={()=>setSection("analytics")} style={{ padding:"7px 16px", border:"none", background:section==="analytics"?"rgba(99,102,241,0.2)":"var(--tp-card)", color:section==="analytics"?"#a5b4fc":"#5c6070", cursor:"pointer", fontSize:12, fontWeight:600, borderLeft:"1px solid rgba(255,255,255,0.08)" }}>📊 Analytics</button>
        </div>

        {/* Category filter */}
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ fontSize:10, color:"var(--tp-faint)" }}>Category:</span>
          <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} style={{ padding:"6px 24px 6px 10px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-muted)", fontSize:12, outline:"none", cursor:"pointer", appearance:"none" }}>
            <option value="All" style={{ background:"var(--tp-sel-bg)" }}>All</option>
            {PLAYBOOK_CATEGORIES.map(c => <option key={c} value={c} style={{ background:"var(--tp-sel-bg)" }}>{c}</option>)}
          </select>
        </div>

        {/* Risk filter */}
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ fontSize:10, color:"var(--tp-faint)" }}>Risk:</span>
          <select value={riskFilter} onChange={e=>setRiskFilter(e.target.value)} style={{ padding:"6px 24px 6px 10px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-muted)", fontSize:12, outline:"none", cursor:"pointer", appearance:"none" }}>
            <option value="All" style={{ background:"var(--tp-sel-bg)" }}>All</option>
            {RISK_LEVELS.map(r => <option key={r} value={r} style={{ background:"var(--tp-sel-bg)" }}>{r}</option>)}
          </select>
        </div>

        {/* Search */}
        <div style={{ position:"relative", flex:"1 1 180px", minWidth:160, marginLeft:"auto" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ width:"100%", padding:"7px 12px 7px 32px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
          <Filter size={13} color="#5c6070" style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)" }}/>
        </div>

        <span style={{ fontSize:11, color:"var(--tp-faintest)" }}>{filtered.length} {filtered.length===1?"strategy":"strategies"}</span>
      </div>

      {/* Category-grouped cards */}
      {sortedCategories.length === 0 ? (
        <div style={{ textAlign:"center", padding:"70px 20px", color:"var(--tp-faint)" }}>
          <BookOpen size={48} style={{ margin:"0 auto 16px", opacity:0.35 }}/>
          <p style={{ margin:0, fontSize:15 }}>{section==="my_setups" && (playbooks||[]).length===0 ? "No personal setups yet. Create one or clone from the Strategy Library." : "No strategies match your filters."}</p>
        </div>
      ) : (
        <div style={{ display:"grid", gap:20 }}>
          {sortedCategories.map(cat => {
            const items = grouped[cat];
            const isCollapsed = collapsedCats[cat];
            return (
              <div key={cat}>
                {/* Category header */}
                <div onClick={()=>toggleCatCollapse(cat)} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:isCollapsed?0:12, paddingBottom:8, borderBottom:"1px solid var(--tp-border)" }}>
                  {isCollapsed ? <ChevronRight size={16} color="#8a8f9e"/> : <ChevronDown size={16} color="#8a8f9e"/>}
                  <span style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)" }}>{cat}</span>
                  <span style={{ fontSize:12, color:"var(--tp-faint)" }}>({items.length})</span>
                </div>

                {!isCollapsed && (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(270px, 1fr))", gap:10 }}>
                    {items.map(pb => {
                      const stats = getPlaybookStats(pb.name);
                      const isExpanded = expandedId === pb.id;
                      const dot = catDot(pb.category);

                      return (
                        <div key={pb.id} style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, overflow:"hidden", cursor:"pointer", transition:"border-color 0.2s" }}
                          onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.3)"}
                          onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"}
                          onClick={()=>setExpandedId(isExpanded?null:pb.id)}>
                          <div style={{ padding:"14px 16px" }}>
                            {/* Title row */}
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                              <div style={{ width:8, height:8, borderRadius:4, background:dot, flexShrink:0 }}/>
                              <span style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)", flex:1 }}>{pb.name}</span>
                              {(pb.screenshots||[]).length > 0 && <Camera size={11} color="#5c6070"/>}
                            </div>

                            {/* Badges */}
                            <div style={{ display:"flex", gap:5, marginBottom:8, flexWrap:"wrap" }}>
                              {pb.risk && <span style={{ fontSize:9, fontWeight:700, color:riskColor(pb.risk), background:riskColor(pb.risk)+"18", padding:"2px 8px", borderRadius:4, letterSpacing:0.3 }}>{pb.risk}</span>}
                              {stats && <span style={{ fontSize:9, fontWeight:600, color:"#60a5fa", background:"rgba(96,165,250,0.12)", padding:"2px 8px", borderRadius:4, display:"flex", alignItems:"center", gap:3 }}>⚡ {stats.count} trades · {stats.winRate.toFixed(0)}%</span>}
                              {section === "library" && (playbooks||[]).some(p=>p.name===pb.name) && <span style={{ fontSize:9, fontWeight:600, color:"#4ade80", background:"rgba(74,222,128,0.12)", padding:"2px 8px", borderRadius:4 }}>🔗 Added</span>}
                            </div>

                            {/* Description */}
                            <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.55, display:"-webkit-box", WebkitLineClamp:isExpanded?99:3, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                              {pb.description}
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div style={{ borderTop:"1px solid var(--tp-border)", padding:"14px 16px", background:"var(--tp-card)" }} onClick={e=>e.stopPropagation()}>
                              {/* Entry/Exit rules */}
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:pb.priceAction?10:0 }}>
                                {pb.entryRules && (
                                  <div style={{ background:"rgba(74,222,128,0.04)", border:"1px solid rgba(74,222,128,0.1)", borderRadius:8, padding:"10px 12px" }}>
                                    <div style={{ fontSize:9, color:"#4ade80", fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>📈 Entry Rules</div>
                                    <div style={{ fontSize:11, color:"#b0b5c4", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{pb.entryRules}</div>
                                  </div>
                                )}
                                {pb.exitRules && (
                                  <div style={{ background:"rgba(248,113,113,0.04)", border:"1px solid rgba(248,113,113,0.1)", borderRadius:8, padding:"10px 12px" }}>
                                    <div style={{ fontSize:9, color:"#f87171", fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>📉 Exit Rules</div>
                                    <div style={{ fontSize:11, color:"#b0b5c4", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{pb.exitRules}</div>
                                  </div>
                                )}
                              </div>

                              {pb.priceAction && (
                                <div style={{ background:"rgba(99,102,241,0.04)", border:"1px solid rgba(99,102,241,0.1)", borderRadius:8, padding:"10px 12px", marginBottom:pb.riskManagement?10:0 }}>
                                  <div style={{ fontSize:9, color:"#a5b4fc", fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>📊 Price Action / How It Works</div>
                                  <div style={{ fontSize:11, color:"#b0b5c4", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{pb.priceAction}</div>
                                </div>
                              )}

                              {pb.riskManagement && (
                                <div style={{ background:"rgba(234,179,8,0.04)", border:"1px solid rgba(234,179,8,0.1)", borderRadius:8, padding:"10px 12px", marginBottom:10 }}>
                                  <div style={{ fontSize:9, color:"#eab308", fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>🛡️ Risk Management</div>
                                  <div style={{ fontSize:11, color:"#b0b5c4", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{pb.riskManagement}</div>
                                </div>
                              )}

                              {/* Market conditions + tags */}
                              <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:10 }}>
                                {(pb.marketConditions||[]).length > 0 && (
                                  <div>
                                    <div style={{ fontSize:9, color:"var(--tp-faint)", fontWeight:600, textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Conditions</div>
                                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                      {pb.marketConditions.map(mc => <span key={mc} style={{ fontSize:10, color:"var(--tp-text2)", background:"var(--tp-input)", padding:"3px 8px", borderRadius:4 }}>{mc}</span>)}
                                    </div>
                                  </div>
                                )}
                                {(pb.tags||[]).length > 0 && (
                                  <div>
                                    <div style={{ fontSize:9, color:"var(--tp-faint)", fontWeight:600, textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Tags</div>
                                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                      {pb.tags.map(tag => <span key={tag} style={{ fontSize:10, color:"var(--tp-faint)", background:"var(--tp-input)", padding:"3px 8px", borderRadius:10 }}>#{tag}</span>)}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Screenshots */}
                              {(pb.screenshots||[]).length > 0 && (
                                <div style={{ marginBottom:10 }}>
                                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                                    {pb.screenshots.map(s => (
                                      <div key={s.id} style={{ borderRadius:6, overflow:"hidden", border:"1px solid var(--tp-border-l)", cursor:"pointer", width:120, height:75 }} onClick={()=>setViewingSrc(s.data)}>
                                        <img src={s.data} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Performance stats (my setups only) */}
                              {stats && section === "my_setups" && (
                                <div style={{ paddingTop:10, borderTop:"1px solid var(--tp-border)" }}>
                                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:6 }}>
                                    <div style={{ background:"var(--tp-card)", borderRadius:6, padding:"8px", textAlign:"center" }}><div style={{ fontSize:8, color:"var(--tp-faint)", textTransform:"uppercase" }}>Total P&L</div><div style={{ fontSize:14, fontWeight:700, color:stats.totalPnL>=0?"#4ade80":"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(stats.totalPnL)}</div></div>
                                    <div style={{ background:"var(--tp-card)", borderRadius:6, padding:"8px", textAlign:"center" }}><div style={{ fontSize:8, color:"var(--tp-faint)", textTransform:"uppercase" }}>Avg P&L</div><div style={{ fontSize:14, fontWeight:700, color:stats.avgPnL>=0?"#4ade80":"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(stats.avgPnL)}</div></div>
                                    <div style={{ background:"var(--tp-card)", borderRadius:6, padding:"8px", textAlign:"center" }}><div style={{ fontSize:8, color:"var(--tp-faint)", textTransform:"uppercase" }}>Win Rate</div><div style={{ fontSize:14, fontWeight:700, color:stats.winRate>=50?"#4ade80":"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{stats.winRate.toFixed(0)}%</div></div>
                                    <div style={{ background:"var(--tp-card)", borderRadius:6, padding:"8px", textAlign:"center" }}><div style={{ fontSize:8, color:"var(--tp-faint)", textTransform:"uppercase" }}>Record</div><div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace" }}>{stats.wins}W/{stats.losses}L</div></div>
                                  </div>
                                </div>
                              )}

                              {/* Action buttons */}
                              <div style={{ display:"flex", gap:6, marginTop:10, justifyContent:"flex-end" }}>
                                {section === "library" && (
                                  <button onClick={()=>cloneToMySetups(pb)} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid rgba(99,102,241,0.3)", background:"rgba(99,102,241,0.1)", color:"#a5b4fc", cursor:"pointer", fontSize:11, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                                    <Plus size={11}/> Use as Template
                                  </button>
                                )}
                                {section === "my_setups" && (
                                  <>
                                    <button onClick={()=>{setEditingPlaybook(pb);setShowModal(true);}} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid var(--tp-border-l)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:11 }}>Edit</button>
                                    <button onClick={()=>handleDelete(pb.id)} style={{ padding:"6px 10px", borderRadius:6, border:"none", background:"transparent", color:"var(--tp-faint)", cursor:"pointer" }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><Trash2 size={12}/></button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ SETUP ANALYTICS ═══════ */}
      {section === "analytics" && <SetupAnalytics trades={trades} playbooks={playbooks}/>}

      {showModal && <PlaybookModal playbook={editingPlaybook} onSave={handleSave} onClose={()=>{setShowModal(false);setEditingPlaybook(null);}}/>}
      {viewingSrc && <ScreenshotLightbox src={viewingSrc} onClose={()=>setViewingSrc(null)}/>}
    </div>
  );
}

// ─── SETUP ANALYTICS ────────────────────────────────────────────────────────
function SetupAnalytics({ trades, playbooks }) {
  const [expandedSetup, setExpandedSetup] = useState(null);
  const [sortBy, setSortBy] = useState("count"); // count | winRate | pnl | avg

  // Compute per-setup stats
  const setupStats = useMemo(() => {
    const closed = (trades || []).filter(t => t.pnl !== null && t.playbook);
    const map = {};
    closed.forEach(t => {
      const key = t.playbook;
      if (!map[key]) map[key] = { name: key, trades: [], wins: 0, losses: 0, breakeven: 0, totalPnL: 0, grossWin: 0, grossLoss: 0, bestTrade: null, worstTrade: null, streak: 0, maxWinStreak: 0, maxLoseStreak: 0, currentStreak: 0, byDay: {}, byAsset: {} };
      const s = map[key];
      s.trades.push(t);
      s.totalPnL += t.pnl;
      if (t.pnl > 0) { s.wins++; s.grossWin += t.pnl; }
      else if (t.pnl < 0) { s.losses++; s.grossLoss += Math.abs(t.pnl); }
      else s.breakeven++;
      if (!s.bestTrade || t.pnl > s.bestTrade.pnl) s.bestTrade = t;
      if (!s.worstTrade || t.pnl < s.worstTrade.pnl) s.worstTrade = t;
      // Day of week
      const day = new Date(t.date).toLocaleDateString("en-US", { weekday: "short" });
      if (!s.byDay[day]) s.byDay[day] = { count: 0, pnl: 0, wins: 0 };
      s.byDay[day].count++;
      s.byDay[day].pnl += t.pnl;
      if (t.pnl > 0) s.byDay[day].wins++;
      // Asset type
      if (!s.byAsset[t.assetType]) s.byAsset[t.assetType] = { count: 0, pnl: 0 };
      s.byAsset[t.assetType].count++;
      s.byAsset[t.assetType].pnl += t.pnl;
    });

    // Compute streaks and derived metrics
    return Object.values(map).map(s => {
      const count = s.trades.length;
      const winRate = count > 0 ? (s.wins / count) * 100 : 0;
      const avgPnL = count > 0 ? s.totalPnL / count : 0;
      const avgWin = s.wins > 0 ? s.grossWin / s.wins : 0;
      const avgLoss = s.losses > 0 ? s.grossLoss / s.losses : 0;
      const profitFactor = s.grossLoss > 0 ? s.grossWin / s.grossLoss : s.grossWin > 0 ? Infinity : 0;
      const expectancy = count > 0 ? ((winRate/100) * avgWin) - ((1 - winRate/100) * avgLoss) : 0;
      // Streaks
      let curr = 0, maxW = 0, maxL = 0;
      const sorted = [...s.trades].sort((a,b) => new Date(a.date) - new Date(b.date));
      sorted.forEach(t => {
        if (t.pnl > 0) { curr = curr > 0 ? curr + 1 : 1; maxW = Math.max(maxW, curr); }
        else if (t.pnl < 0) { curr = curr < 0 ? curr - 1 : -1; maxL = Math.max(maxL, Math.abs(curr)); }
        else curr = 0;
      });
      // Cumulative P&L for sparkline
      let cum = 0;
      const cumPnL = sorted.map(t => { cum += t.pnl; return { date: t.date, pnl: cum }; });
      // Find matching playbook entry for metadata
      const pbEntry = (playbooks || []).find(p => p.name === s.name) || STRATEGY_LIBRARY.find(p => p.name === s.name);
      return { ...s, count, winRate, avgPnL, avgWin, avgLoss, profitFactor, expectancy, maxWinStreak: maxW, maxLoseStreak: maxL, currentStreak: curr, cumPnL, category: pbEntry?.category || "—", risk: pbEntry?.risk || "—" };
    });
  }, [trades, playbooks]);

  const sorted = useMemo(() => {
    const arr = [...setupStats];
    if (sortBy === "count") arr.sort((a,b) => b.count - a.count);
    else if (sortBy === "winRate") arr.sort((a,b) => b.winRate - a.winRate);
    else if (sortBy === "pnl") arr.sort((a,b) => b.totalPnL - a.totalPnL);
    else if (sortBy === "avg") arr.sort((a,b) => b.avgPnL - a.avgPnL);
    else if (sortBy === "expectancy") arr.sort((a,b) => b.expectancy - a.expectancy);
    return arr;
  }, [setupStats, sortBy]);

  // Overall summary
  const overall = useMemo(() => {
    const tagged = (trades || []).filter(t => t.pnl !== null && t.playbook);
    const untagged = (trades || []).filter(t => t.pnl !== null && !t.playbook);
    const taggedPnL = tagged.reduce((s,t) => s + t.pnl, 0);
    const untaggedPnL = untagged.reduce((s,t) => s + t.pnl, 0);
    return { taggedCount: tagged.length, untaggedCount: untagged.length, taggedPnL, untaggedPnL, setupCount: setupStats.length };
  }, [trades, setupStats]);

  const DAYS = ["Mon","Tue","Wed","Thu","Fri"];

  if (setupStats.length === 0) {
    return (
      <div style={{ textAlign:"center", padding:"70px 20px", color:"var(--tp-faint)" }}>
        <BarChart3 size={48} style={{ margin:"0 auto 16px", opacity:0.35 }}/>
        <p style={{ margin:0, fontSize:15, marginBottom:8 }}>No analytics data yet</p>
        <p style={{ margin:0, fontSize:12, color:"var(--tp-faintest)" }}>Tag your trades with a playbook setup in the trade modal, then close them to see performance analytics here.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary banner */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:10, marginBottom:20 }}>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Setups Tracked</div>
          <div style={{ fontSize:22, fontWeight:800, color:"#a5b4fc", fontFamily:"'JetBrains Mono', monospace" }}>{overall.setupCount}</div>
        </div>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Tagged Trades</div>
          <div style={{ fontSize:22, fontWeight:800, color:"#60a5fa", fontFamily:"'JetBrains Mono', monospace" }}>{overall.taggedCount}</div>
        </div>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Tagged P&L</div>
          <div style={{ fontSize:22, fontWeight:800, color:overall.taggedPnL >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(overall.taggedPnL)}</div>
        </div>
        <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase", marginBottom:4 }}>Untagged Trades</div>
          <div style={{ fontSize:22, fontWeight:800, color: overall.untaggedCount > 0 ? "#eab308" : "#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>{overall.untaggedCount}</div>
          {overall.untaggedCount > 0 && <div style={{ fontSize:9, color:"#eab308", marginTop:2 }}>Tag these for better insights!</div>}
        </div>
      </div>

      {/* Sort controls */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <span style={{ fontSize:11, color:"var(--tp-faint)" }}>Sort by:</span>
        {[["count","Trades"],["winRate","Win Rate"],["pnl","Total P&L"],["avg","Avg P&L"],["expectancy","Expectancy"]].map(([k,label]) => (
          <button key={k} onClick={()=>setSortBy(k)} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${sortBy===k?"rgba(99,102,241,0.4)":"var(--tp-border-l)"}`, background: sortBy===k ? "rgba(99,102,241,0.15)" : "var(--tp-card)", color: sortBy===k ? "#a5b4fc" : "var(--tp-faint)", cursor:"pointer", fontSize:10, fontWeight:600 }}>{label}</button>
        ))}
      </div>

      {/* Setup cards */}
      <div style={{ display:"grid", gap:10 }}>
        {sorted.map(s => {
          const isExpanded = expandedSetup === s.name;
          const sparkColor = s.totalPnL >= 0 ? "#4ade80" : "#f87171";
          return (
            <div key={s.name} style={{ background:"var(--tp-panel)", border:`1px solid ${isExpanded ? "rgba(99,102,241,0.3)" : "var(--tp-panel-b)"}`, borderRadius:12, overflow:"hidden", transition:"border-color 0.2s" }}>
              {/* Card header — always visible */}
              <div onClick={()=>setExpandedSetup(isExpanded ? null : s.name)} style={{ padding:"14px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}>
                {/* Name + badges */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                    <span style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)" }}>{s.name}</span>
                    <span style={{ fontSize:9, color:"var(--tp-faint)", background:"var(--tp-card)", padding:"2px 6px", borderRadius:4 }}>{s.category}</span>
                  </div>
                  <div style={{ display:"flex", gap:12, fontSize:11, color:"var(--tp-faint)" }}>
                    <span>{s.count} trades</span>
                    <span style={{ color: s.winRate >= 55 ? "#4ade80" : s.winRate < 40 ? "#f87171" : "#eab308" }}>{s.winRate.toFixed(1)}% WR</span>
                    <span style={{ color: s.avgPnL >= 0 ? "#4ade80" : "#f87171" }}>{fmt(s.avgPnL)} avg</span>
                  </div>
                </div>
                {/* Mini sparkline */}
                {s.cumPnL.length > 1 && (
                  <div style={{ width:80, height:30, flexShrink:0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={s.cumPnL} margin={{ top:0, right:0, bottom:0, left:0 }}>
                        <Area type="monotone" dataKey="pnl" stroke={sparkColor} fill={sparkColor} fillOpacity={0.15} strokeWidth={1.5} dot={false}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {/* Total P&L */}
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:16, fontWeight:800, color: s.totalPnL >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(s.totalPnL)}</div>
                  <div style={{ fontSize:9, color:"var(--tp-faintest)" }}>total P&L</div>
                </div>
                {isExpanded ? <ChevronDown size={16} color="var(--tp-faint)"/> : <ChevronRight size={16} color="var(--tp-faint)"/>}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div style={{ padding:"0 18px 18px", borderTop:"1px solid var(--tp-border-l)" }}>
                  {/* Stat grid */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(110px, 1fr))", gap:8, marginTop:14, marginBottom:16 }}>
                    {[
                      ["Win Rate", `${s.winRate.toFixed(1)}%`, s.winRate >= 55 ? "#4ade80" : s.winRate < 40 ? "#f87171" : "#eab308"],
                      ["Record", `${s.wins}W / ${s.losses}L`, "#60a5fa"],
                      ["Avg Win", fmt(s.avgWin), "#4ade80"],
                      ["Avg Loss", fmt(-s.avgLoss), "#f87171"],
                      ["Profit Factor", s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2), s.profitFactor >= 1.5 ? "#4ade80" : "#f87171"],
                      ["Expectancy", fmt(s.expectancy), s.expectancy >= 0 ? "#4ade80" : "#f87171"],
                      ["Best Trade", s.bestTrade ? `${fmt(s.bestTrade.pnl)} (${s.bestTrade.ticker})` : "—", "#4ade80"],
                      ["Worst Trade", s.worstTrade ? `${fmt(s.worstTrade.pnl)} (${s.worstTrade.ticker})` : "—", "#f87171"],
                      ["Best Streak", s.maxWinStreak > 0 ? `${s.maxWinStreak}W` : "—", "#4ade80"],
                      ["Worst Streak", s.maxLoseStreak > 0 ? `${s.maxLoseStreak}L` : "—", "#f87171"],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                        <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", marginBottom:3 }}>{label}</div>
                        <div style={{ fontSize:13, fontWeight:700, color, fontFamily:"'JetBrains Mono', monospace" }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Day of week breakdown */}
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, color:"var(--tp-faint)", fontWeight:600, textTransform:"uppercase", marginBottom:8 }}>Performance by Day</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {DAYS.map(d => {
                        const data = s.byDay[d];
                        if (!data) return <div key={d} style={{ flex:1, minWidth:52, background:"var(--tp-card)", borderRadius:6, padding:"8px 6px", textAlign:"center", opacity:0.4 }}><div style={{ fontSize:10, color:"var(--tp-faintest)", marginBottom:2 }}>{d}</div><div style={{ fontSize:11, color:"var(--tp-faintest)" }}>—</div></div>;
                        const wr = data.count > 0 ? (data.wins / data.count) * 100 : 0;
                        return (
                          <div key={d} style={{ flex:1, minWidth:52, background:"var(--tp-card)", borderRadius:6, padding:"8px 6px", textAlign:"center" }}>
                            <div style={{ fontSize:10, color:"var(--tp-faintest)", marginBottom:2 }}>{d}</div>
                            <div style={{ fontSize:12, fontWeight:700, color: data.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(data.pnl)}</div>
                            <div style={{ fontSize:9, color:"var(--tp-faintest)" }}>{data.count}t · {wr.toFixed(0)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cumulative P&L chart */}
                  {s.cumPnL.length > 1 && (
                    <div>
                      <div style={{ fontSize:11, color:"var(--tp-faint)", fontWeight:600, textTransform:"uppercase", marginBottom:8 }}>Cumulative P&L</div>
                      <div style={{ height:120, background:"var(--tp-card)", borderRadius:8, padding:"8px 4px" }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={s.cumPnL} margin={{ top:4, right:8, bottom:0, left:8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
                            <XAxis dataKey="date" tick={{ fontSize:9, fill:"#5c6070" }} tickLine={false} axisLine={false}/>
                            <YAxis tick={{ fontSize:9, fill:"#5c6070" }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 || v <= -1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`}/>
                            <Tooltip formatter={v=>[fmt(v),"P&L"]} contentStyle={{ background:"#1a1b23", border:"1px solid #2a2b35", borderRadius:8, fontSize:11 }} labelStyle={{ color:"#8a8f9e" }}/>
                            <Area type="monotone" dataKey="pnl" stroke={sparkColor} fill={sparkColor} fillOpacity={0.12} strokeWidth={2}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Recent trades list */}
                  <div style={{ marginTop:16 }}>
                    <div style={{ fontSize:11, color:"var(--tp-faint)", fontWeight:600, textTransform:"uppercase", marginBottom:8 }}>Recent Trades ({Math.min(s.trades.length, 10)} of {s.trades.length})</div>
                    <div style={{ display:"grid", gap:3 }}>
                      {[...s.trades].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 10).map(t => (
                        <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 10px", background:"var(--tp-card)", borderRadius:6, fontSize:11 }}>
                          <span style={{ color:"var(--tp-faintest)", fontFamily:"'JetBrains Mono', monospace", fontSize:10, minWidth:72 }}>{t.date}</span>
                          <span style={{ fontWeight:600, color:"var(--tp-text)", minWidth:50 }}>{t.ticker}</span>
                          <span style={{ color: t.direction === "Long" ? "#4ade80" : "#f87171", fontSize:9, fontWeight:600, minWidth:35 }}>{t.direction}</span>
                          <span style={{ flex:1 }}/>
                          <span style={{ fontWeight:700, color: t.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>{fmt(t.pnl)}</span>
                          {t.grade && <span style={{ fontSize:9, color:t.grade==="A"?"#4ade80":t.grade==="B"?"#60a5fa":t.grade==="C"?"#eab308":"#f87171", fontWeight:700 }}>{t.grade}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PLAYBOOK MODAL ──────────────────────────────────────────────────────────
function PlaybookModal({ playbook, onSave, onClose }) {
  const [pb, setPb] = useState(playbook || emptyPlaybook());
  const set = k => v => setPb(p => ({ ...p, [k]: v }));
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    if (tag && !(pb.tags||[]).includes(tag)) { set("tags")([...(pb.tags||[]), tag]); setTagInput(""); }
  };
  const removeTag = (tag) => set("tags")((pb.tags||[]).filter(t=>t!==tag));

  const toggleCondition = (mc) => {
    const current = pb.marketConditions || [];
    set("marketConditions")(current.includes(mc) ? current.filter(c=>c!==mc) : [...current, mc]);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(3px)" }}>
      <div style={{ background:"var(--tp-sel-bg)", borderRadius:18, width:"min(96vw, 700px)", maxHeight:"92vh", overflowY:"auto", padding:28, border:"1px solid var(--tp-border-l)", boxShadow:"0 24px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <h3 style={{ color:"var(--tp-text)", fontSize:18, fontWeight:600, margin:0 }}>{playbook ? "Edit Setup" : "New Setup"}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={20}/></button>
        </div>

        {/* Name + Category + Risk */}
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:12, marginBottom:14 }}>
          <Input label="Setup Name" value={pb.name} onChange={set("name")} placeholder="e.g. VWAP Bounce, Bull Put Spread"/>
          <Input label="Category" value={pb.category} onChange={set("category")} options={PLAYBOOK_CATEGORIES}/>
          <Input label="Risk Level" value={pb.risk || "Moderate"} onChange={set("risk")} options={RISK_LEVELS}/>
        </div>

        {/* Description */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5 }}>Description</label>
          <textarea value={pb.description||""} onChange={e=>set("description")(e.target.value)} placeholder="High-level overview — what is this setup, when do you use it?" rows={3} style={{ width:"100%", padding:"10px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", lineHeight:1.6 }}/>
        </div>

        {/* Entry + Exit Rules */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
          <div>
            <label style={{ fontSize:11, color:"#4ade80", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5, fontWeight:600 }}>📈 Entry Rules</label>
            <textarea value={pb.entryRules||""} onChange={e=>set("entryRules")(e.target.value)} placeholder={"When to enter:\n• Signal / trigger\n• Confirmation needed\n• Volume requirements"} rows={5} style={{ width:"100%", padding:"10px 12px", background:"rgba(74,222,128,0.04)", border:"1px solid rgba(74,222,128,0.15)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", lineHeight:1.6 }}/>
          </div>
          <div>
            <label style={{ fontSize:11, color:"#f87171", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5, fontWeight:600 }}>📉 Exit Rules</label>
            <textarea value={pb.exitRules||""} onChange={e=>set("exitRules")(e.target.value)} placeholder={"When to exit:\n• Take profit targets\n• Stop loss levels\n• Time-based exits"} rows={5} style={{ width:"100%", padding:"10px 12px", background:"rgba(248,113,113,0.04)", border:"1px solid rgba(248,113,113,0.15)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", lineHeight:1.6 }}/>
          </div>
        </div>

        {/* Price Action */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, color:"#a5b4fc", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5, fontWeight:600 }}>📊 Price Action / How It Works</label>
          <textarea value={pb.priceAction||""} onChange={e=>set("priceAction")(e.target.value)} placeholder={"How does price need to move for this to be profitable?\n• Direction, speed, volatility requirements\n• Key patterns or setups\n• For options: Greeks behavior, IV expectations"} rows={4} style={{ width:"100%", padding:"10px 12px", background:"rgba(99,102,241,0.04)", border:"1px solid rgba(99,102,241,0.15)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", lineHeight:1.6 }}/>
        </div>

        {/* Risk Management */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, color:"#eab308", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:5, fontWeight:600 }}>🛡️ Risk Management</label>
          <textarea value={pb.riskManagement||""} onChange={e=>set("riskManagement")(e.target.value)} placeholder={"Risk rules:\n• Max position size / % of account\n• Stop loss placement\n• When to adjust or roll"} rows={3} style={{ width:"100%", padding:"10px 12px", background:"rgba(234,179,8,0.04)", border:"1px solid rgba(234,179,8,0.15)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", lineHeight:1.6 }}/>
        </div>

        {/* Market Conditions */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Ideal Market Conditions</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {MARKET_CONDITIONS.map(mc => {
              const isSelected = (pb.marketConditions||[]).includes(mc);
              return <button key={mc} onClick={()=>toggleCondition(mc)} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${isSelected?"#60a5fa":"var(--tp-border-l)"}`, background:isSelected?"rgba(96,165,250,0.15)":"var(--tp-input)", color:isSelected?"#60a5fa":"#8a8f9e", cursor:"pointer", fontSize:12, fontWeight:isSelected?600:400 }}>{mc}</button>;
            })}
          </div>
        </div>

        {/* Tags */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Tags</label>
          <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
            {(pb.tags||[]).map(tag => (
              <div key={tag} style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 8px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:10 }}>
                <span style={{ fontSize:10, color:"var(--tp-text2)" }}>#{tag}</span>
                <button onClick={()=>removeTag(tag)} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer", padding:0, display:"flex" }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><X size={10}/></button>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addTag();}}} placeholder="Add tag..." style={{ flex:1, padding:"7px 10px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none" }}/>
            <button onClick={addTag} style={{ padding:"7px 14px", borderRadius:6, border:"none", background:"var(--tp-input)", color:"var(--tp-muted)", cursor:"pointer", fontSize:12 }}>Add</button>
          </div>
        </div>

        {/* Screenshots */}
        <div style={{ marginBottom:20 }}>
          <ScreenshotManager screenshots={pb.screenshots || []} onChange={v=>set("screenshots")(v)}/>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
          <button onClick={onClose} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Cancel</button>
          <button onClick={()=>{if(pb.name.trim()) onSave(pb);}} style={{ padding:"9px 24px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}>
            {playbook ? "Update Setup" : "Save Setup"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS TAB ─────────────────────────────────────────────────────────────
// ─── CLAUDE SETUP GUIDE ─────────────────────────────────────────────────────
function SetupGuide() {
  const [open, setOpen] = useState(false);
  const stepStyle = { display:"flex", gap:10, marginBottom:12 };
  const numStyle = { width:20, height:20, borderRadius:10, background:"rgba(165,180,252,0.15)", color:"#a5b4fc", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 };
  const textStyle = { fontSize:12, color:"var(--tp-muted)", lineHeight:1.6 };
  const linkStyle = { color:"#a5b4fc", textDecoration:"none", fontWeight:600 };

  return (
    <div>
      <button onClick={()=>setOpen(p=>!p)} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", color:"#a5b4fc", cursor:"pointer", fontSize:12, fontWeight:600, padding:0 }}>
        {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        {open ? "Hide setup guide" : "Don't have an API key? Follow these steps"}
      </button>

      {open && (
        <div style={{ marginTop:14, background:"rgba(165,180,252,0.04)", border:"1px solid rgba(165,180,252,0.1)", borderRadius:10, padding:"16px 18px" }}>
          <div style={stepStyle}>
            <div style={numStyle}>1</div>
            <div style={textStyle}>
              Go to <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={linkStyle}>console.anthropic.com</a> and create a free account (or sign in if you already have one).
            </div>
          </div>
          <div style={stepStyle}>
            <div style={numStyle}>2</div>
            <div style={textStyle}>
              Once logged in, you'll need to add a payment method. Click <strong style={{ color:"var(--tp-text)" }}>Settings</strong> in the left sidebar, then <strong style={{ color:"var(--tp-text)" }}>Billing</strong>. Add a credit or debit card. You won't be charged upfront — you only pay for what you use (typically a few cents per analysis).
            </div>
          </div>
          <div style={stepStyle}>
            <div style={numStyle}>3</div>
            <div style={textStyle}>
              In the left sidebar, click <strong style={{ color:"var(--tp-text)" }}>API Keys</strong>. Then click <strong style={{ color:"var(--tp-text)" }}>Create Key</strong>. Give it any name you like (e.g. "TradePulse").
            </div>
          </div>
          <div style={stepStyle}>
            <div style={numStyle}>4</div>
            <div style={textStyle}>
              Copy the key that appears (it starts with <code style={{ background:"var(--tp-input)", padding:"1px 5px", borderRadius:3, fontSize:11 }}>sk-ant-</code>). You'll only see it once, so paste it into the field above right away.
            </div>
          </div>
          <div style={{ marginTop:4, fontSize:11, color:"var(--tp-faintest)", lineHeight:1.6, paddingLeft:30 }}>
            That's it! Your AI Coach will now use Claude for deeper, more nuanced trade analysis. You can monitor your usage and costs at any time on the Anthropic console.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── REPORTS TAB ─────────────────────────────────────────────────────────────
function ReportsTab({ trades, wheelTrades, accountBalances, customFields, theme, prefs }) {
  const [reportType, setReportType] = useState("summary");
  const [account, setAccount] = useState("All");
  const [dateRange, setDateRange] = useState("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [assetFilter, setAssetFilter] = useState("All");
  const [strategyFilter, setStrategyFilter] = useState("All");
  const [generated, setGenerated] = useState(false);

  const accounts = useMemo(() => {
    const s = new Set();
    if (accountBalances) Object.keys(accountBalances).forEach(k => s.add(k));
    if (customFields?.accounts) customFields.accounts.forEach(k => s.add(k));
    return [...s];
  }, [accountBalances, customFields]);

  // Date range calculation
  const { fromDate, toDate } = useMemo(() => {
    const today = new Date();
    let from = new Date();
    if (dateRange === "week") from.setDate(today.getDate() - 7);
    else if (dateRange === "month") from.setDate(today.getDate() - 30);
    else if (dateRange === "quarter") from.setDate(today.getDate() - 90);
    else if (dateRange === "ytd") { from = new Date(today.getFullYear(), 0, 1); }
    else if (dateRange === "all") { from = new Date(2000, 0, 1); }
    else if (dateRange === "custom" && customFrom) { from = new Date(customFrom + "T00:00:00"); }
    const to = dateRange === "custom" && customTo ? new Date(customTo + "T23:59:59") : today;
    return { fromDate: from.toISOString().split("T")[0], toDate: to.toISOString().split("T")[0] };
  }, [dateRange, customFrom, customTo]);

  // Filter trades
  const filtered = useMemo(() => {
    return trades.filter(t => {
      if (t.pnl === null || t.pnl === undefined) return false;
      if (t.status !== "Closed") return false;
      if (account !== "All" && t.account !== account) return false;
      if (t.date < fromDate || t.date > toDate) return false;
      if (assetFilter !== "All" && t.assetType !== assetFilter) return false;
      if (strategyFilter !== "All") {
        const allStrats = [t.optionsStrategyType, t.tradeStrategy, t.strategy, t.playbook].filter(Boolean).join(" ").toLowerCase();
        if (strategyFilter === "Premium") {
          const premStrats = ["wheel strategy","pmcc / diagonal","diagonal","calendar press","calendar","vertical spread","iron condor","credit spread"];
          if (!premStrats.some(ps => allStrats.includes(ps)) && !["CSP","CC"].includes(t.type)) return false;
        } else if (!allStrats.includes(strategyFilter.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [trades, account, fromDate, toDate, assetFilter, strategyFilter]);

  // Stats
  const stats = useMemo(() => {
    const wins = filtered.filter(t => t.pnl > 0);
    const losses = filtered.filter(t => t.pnl < 0);
    const totalPnL = filtered.reduce((s, t) => s + (t.pnl || 0), 0);
    const winRate = filtered.length > 0 ? (wins.length / filtered.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
    const grossWins = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLosses = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;
    const best = filtered.length > 0 ? filtered.reduce((a, b) => b.pnl > a.pnl ? b : a) : null;
    const worst = filtered.length > 0 ? filtered.reduce((a, b) => b.pnl < a.pnl ? b : a) : null;

    // By strategy
    const byStrategy = {};
    filtered.forEach(t => {
      const s = t.tradeStrategy || (t.optionsStrategyType && t.optionsStrategyType !== "Single Leg" ? t.optionsStrategyType : "") || t.playbook || t.strategy || "Other";
      if (!byStrategy[s]) byStrategy[s] = { name: s, trades: 0, pnl: 0, wins: 0 };
      byStrategy[s].trades++;
      byStrategy[s].pnl += t.pnl || 0;
      if (t.pnl > 0) byStrategy[s].wins++;
    });

    // By asset
    const byAsset = {};
    filtered.forEach(t => {
      const a = t.assetType || "Other";
      if (!byAsset[a]) byAsset[a] = { name: a, trades: 0, pnl: 0, wins: 0 };
      byAsset[a].trades++;
      byAsset[a].pnl += t.pnl || 0;
      if (t.pnl > 0) byAsset[a].wins++;
    });

    const startBal = account !== "All" && accountBalances?.[account] ? parseFloat(accountBalances[account]) : Object.values(accountBalances || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const returnPct = startBal > 0 ? (totalPnL / startBal) * 100 : 0;

    return { totalPnL, winRate, avgWin, avgLoss, profitFactor, wins: wins.length, losses: losses.length, total: filtered.length, best, worst, byStrategy: Object.values(byStrategy).sort((a, b) => b.pnl - a.pnl), byAsset: Object.values(byAsset), returnPct };
  }, [filtered, accountBalances, account]);

  // Unique strategies for filter
  const allStrategies = useMemo(() => {
    const s = new Set();
    trades.forEach(t => {
      if (t.optionsStrategyType && t.optionsStrategyType !== "Single Leg") s.add(t.optionsStrategyType);
      if (t.tradeStrategy) s.add(t.tradeStrategy);
      if (t.playbook) s.add(t.playbook);
    });
    return [...s].sort();
  }, [trades]);

  const fmtD = n => n === null || n === undefined || isNaN(n) ? "—" : `${n >= 0 ? "+" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = n => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

  const reportTypes = [
    { id: "summary", icon: "📋", label: "Trade Summary", desc: "P&L breakdown with trade-by-trade detail" },
    { id: "strategy", icon: "🎯", label: "Strategy Performance", desc: "Side-by-side strategy comparison" },
    { id: "recap", icon: "📅", label: "Period Recap", desc: "Summary with best/worst trades and stats" },
  ];

  const panel = () => ({ background: "var(--tp-panel)", border: "1px solid var(--tp-panel-b)", borderRadius: 14, padding: "18px 20px" });

  const handlePrint = () => {
    const el = document.getElementById("tp-report-preview");
    if (!el) return;
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>TradePulse Report</title><style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      *{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Inter',sans-serif;color:#1a1a2e;padding:32px 40px;}
      .rpt-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #e8e8f0;}
      .rpt-title{font-size:22px;font-weight:800;}.rpt-subtitle{font-size:11px;color:#6b7280;margin-top:3px;}
      .rpt-meta{text-align:right;font-size:10px;color:#6b7280;line-height:1.8;}
      .rpt-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:28px;}
      .rpt-stat{background:#f8f9fc;border-radius:8px;padding:14px 16px;border:1px solid #e8e8f0;}
      .rpt-stat .label{font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;margin-bottom:5px;}
      .rpt-stat .value{font-size:20px;font-weight:700;font-family:'JetBrains Mono',monospace;}
      .rpt-stat .sub{font-size:9px;color:#9ca3af;margin-top:2px;}
      .green{color:#059669;}.red{color:#dc2626;}.blue{color:#2563eb;}.purple{color:#7c3aed;}
      .rpt-section-title{font-size:13px;font-weight:700;margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #e8e8f0;}
      .rpt-strat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:24px;}
      .rpt-strat-card{background:#f8f9fc;border:1px solid #e8e8f0;border-radius:6px;padding:10px 12px;}
      .rpt-strat-card .name{font-size:10px;font-weight:600;color:#6b7280;margin-bottom:4px;}
      .rpt-strat-card .big{font-size:16px;font-weight:700;font-family:'JetBrains Mono',monospace;}
      .rpt-strat-card .detail{font-size:8px;color:#9ca3af;margin-top:3px;}
      table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:20px;}
      th{text-align:left;padding:6px 8px;background:#f8f9fc;border-bottom:2px solid #e8e8f0;font-size:8px;font-weight:600;color:#9ca3af;text-transform:uppercase;}
      td{padding:6px 8px;border-bottom:1px solid #f0f0f5;font-size:10px;color:#374151;}
      .mono{font-family:'JetBrains Mono',monospace;font-weight:600;}
      .badge{display:inline-block;padding:1px 6px;border-radius:8px;font-size:8px;font-weight:600;}
      .badge-long{background:#d1fae5;color:#059669;}.badge-short{background:#fee2e2;color:#dc2626;}.badge-strat{background:#e0e7ff;color:#4338ca;}
      .rpt-footer{text-align:center;font-size:9px;color:#9ca3af;padding-top:12px;border-top:1px solid #e8e8f0;}
      @media print{body{padding:16px 20px;}}
    </style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Report Type Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        {reportTypes.map(rt => (
          <div key={rt.id} onClick={() => { setReportType(rt.id); setGenerated(false); }} style={{
            ...panel(), cursor: "pointer", transition: "all 0.2s",
            border: reportType === rt.id ? "1px solid rgba(99,102,241,0.5)" : "1px solid var(--tp-panel-b)",
            background: reportType === rt.id ? "rgba(99,102,241,0.06)" : "var(--tp-panel)"
          }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{rt.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tp-text)", marginBottom: 3 }}>{rt.label}</div>
            <div style={{ fontSize: 11, color: "var(--tp-faint)", lineHeight: 1.5 }}>{rt.desc}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...panel(), marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 9, color: "var(--tp-faintest)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Account</span>
            <select value={account} onChange={e => setAccount(e.target.value)} style={{ padding: "8px 12px", background: "var(--tp-input)", border: "1px solid var(--tp-border-l)", borderRadius: 6, color: "var(--tp-text)", fontSize: 12, outline: "none" }}>
              <option value="All">All Accounts</option>
              {accounts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 9, color: "var(--tp-faintest)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Date Range</span>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ padding: "8px 12px", background: "var(--tp-input)", border: "1px solid var(--tp-border-l)", borderRadius: 6, color: "var(--tp-text)", fontSize: 12, outline: "none" }}>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="quarter">Last 90 Days</option>
              <option value="ytd">Year to Date</option>
              <option value="all">All Time</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          {dateRange === "custom" && <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 9, color: "var(--tp-faintest)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>From</span>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: "8px 10px", background: "var(--tp-input)", border: "1px solid var(--tp-border-l)", borderRadius: 6, color: "var(--tp-text)", fontSize: 12, outline: "none" }}/>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 9, color: "var(--tp-faintest)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>To</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: "8px 10px", background: "var(--tp-input)", border: "1px solid var(--tp-border-l)", borderRadius: 6, color: "var(--tp-text)", fontSize: 12, outline: "none" }}/>
            </div>
          </>}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 9, color: "var(--tp-faintest)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Asset Type</span>
            <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} style={{ padding: "8px 12px", background: "var(--tp-input)", border: "1px solid var(--tp-border-l)", borderRadius: 6, color: "var(--tp-text)", fontSize: 12, outline: "none" }}>
              <option value="All">All Types</option>
              <option value="Stock">Stocks</option>
              <option value="Options">Options</option>
              <option value="Futures">Futures</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 9, color: "var(--tp-faintest)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Strategy</span>
            <select value={strategyFilter} onChange={e => setStrategyFilter(e.target.value)} style={{ padding: "8px 12px", background: "var(--tp-input)", border: "1px solid var(--tp-border-l)", borderRadius: 6, color: "var(--tp-text)", fontSize: 12, outline: "none" }}>
              <option value="All">All Strategies</option>
              <option value="Premium">All Premium (Wheel/PMCC/Cal/Spreads)</option>
              {allStrategies.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={() => setGenerated(true)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, boxShadow: "0 4px 14px rgba(99,102,241,0.3)", whiteSpace: "nowrap" }}>Generate</button>
          {generated && <button onClick={handlePrint} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.08)", color: "#4ade80", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>📄 Print / PDF</button>}
        </div>
      </div>

      {/* Report Preview */}
      {!generated ? (
        <div style={{ ...panel(), textAlign: "center", padding: "80px 20px" }}>
          <FileText size={48} color="var(--tp-faint)" style={{ marginBottom: 16, opacity: 0.3 }}/>
          <div style={{ fontSize: 15, color: "var(--tp-faint)", marginBottom: 6 }}>Select your filters and click Generate</div>
          <div style={{ fontSize: 12, color: "var(--tp-faintest)" }}>{filtered.length} trades match current filters</div>
        </div>
      ) : (
        <div id="tp-report-preview" style={{ background: "#fff", borderRadius: 12, overflow: "hidden", color: "#1a1a2e", padding: "40px 48px" }}>
          {/* Report Header */}
          <div className="rpt-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 28, paddingBottom: 16, borderBottom: "2px solid #e8e8f0" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e" }}>{reportType === "summary" ? "Trade Summary Report" : reportType === "strategy" ? "Strategy Performance Report" : "Period Recap"}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>{account === "All" ? "All Accounts" : account} — {dateRange === "custom" ? `${customFrom} to ${customTo}` : dateRange === "week" ? "Last 7 Days" : dateRange === "month" ? "Last 30 Days" : dateRange === "quarter" ? "Last 90 Days" : dateRange === "ytd" ? "Year to Date" : "All Time"}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 10, color: "#6b7280", lineHeight: 1.8 }}>
              <div><strong>Generated:</strong> {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
              <div><strong>Period:</strong> {fromDate} to {toDate}</div>
              <div><strong>Trades:</strong> {filtered.length} closed</div>
            </div>
          </div>

          {/* Summary Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28 }}>
            {[
              { label: "Net P&L", value: fmtD(stats.totalPnL), sub: `${fmtPct(stats.returnPct)} return`, color: stats.totalPnL >= 0 ? "#059669" : "#dc2626" },
              { label: "Win Rate", value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.wins}W / ${stats.losses}L`, color: "#2563eb" },
              { label: "Avg Win", value: fmtD(stats.avgWin), sub: "per winning trade", color: "#059669" },
              { label: "Avg Loss", value: fmtD(stats.avgLoss), sub: "per losing trade", color: "#dc2626" },
              { label: "Profit Factor", value: stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2), sub: "win $ / loss $", color: "#7c3aed" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#f8f9fc", borderRadius: 8, padding: "14px 16px", border: "1px solid #e8e8f0" }}>
                <div style={{ fontSize: 8, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Strategy Breakdown */}
          {stats.byStrategy.length > 0 && <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", marginBottom: 10, paddingBottom: 5, borderBottom: "1px solid #e8e8f0" }}>Performance by Strategy</div>
            <div className="rpt-strat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 24 }}>
              {stats.byStrategy.map(s => (
                <div key={s.name} style={{ background: "#f8f9fc", border: "1px solid #e8e8f0", borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>{s.name}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: s.pnl >= 0 ? "#059669" : "#dc2626" }}>{fmtD(s.pnl)}</div>
                  <div style={{ fontSize: 8, color: "#9ca3af", marginTop: 3 }}>{s.trades} trades · {s.trades > 0 ? ((s.wins / s.trades) * 100).toFixed(0) : 0}% win</div>
                </div>
              ))}
            </div>
          </>}

          {/* Trade Table */}
          {/* Trade Detail Table - all report types */}
          {filtered.length > 0 && <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", marginBottom: 10, paddingBottom: 5, borderBottom: "1px solid #e8e8f0" }}>Trade Detail</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: 20 }}>
              <thead>
                <tr>
                  {["Entry","Exit","Ticker","Type","Dir","Strategy","Entry $","Exit $","P&L","Notes"].map(h => (
                    <th key={h} style={{ textAlign: h === "P&L" ? "right" : "left", padding: "6px 8px", background: "#f8f9fc", borderBottom: "2px solid #e8e8f0", fontSize: 8, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map(t => {
                  const strat = t.optionsStrategyType || t.tradeStrategy || t.strategy || "";
                  let entryStr = "", exitStr = "";
                  if (t.assetType === "Options" && t.legs?.length) {
                    entryStr = t.legs.map(l => `${l.action === "Buy" ? "B" : "S"} ${l.strike || ""}${(l.type||"C")[0]} @${l.entryPremium || "?"}`).join(" / ");
                    exitStr = t.legs.map(l => {
                      const exits = [];
                      if (l.exitPremium) exits.push(`@${l.exitPremium}`);
                      if (l.rolls?.length) exits.push(`${l.rolls.length}R`);
                      return exits.join("+") || "open";
                    }).join(" / ");
                  } else {
                    entryStr = t.entryPrice || "";
                    exitStr = t.exitPrice || "";
                  }
                  const exitDate = t.exitDate || t.date;
                  return (
                    <tr key={t.id}>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f5", fontFamily: "'JetBrains Mono',monospace", fontWeight: 500, fontSize: 9, color: "#374151" }}>{t.date?.slice(5)}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f5", fontFamily: "'JetBrains Mono',monospace", fontWeight: 500, fontSize: 9, color: "#374151" }}>{exitDate !== t.date ? exitDate?.slice(5) : "—"}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f5", fontWeight: 700, color: "#1a1a2e" }}>{t.ticker}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f5", color: "#374151", fontSize: 9 }}>{t.assetType}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f5" }}>
                        <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 8, fontSize: 8, fontWeight: 600, background: t.direction === "Long" ? "#d1fae5" : "#fee2e2", color: t.direction === "Long" ? "#059669" : "#dc2626" }}>{t.direction === "Long" ? "L" : "S"}</span>
                      </td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f5" }}>
                        {strat && <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 8, fontSize: 8, fontWeight: 600, background: "#e0e7ff", color: "#4338ca" }}>{strat.length > 18 ? strat.slice(0, 18) + "…" : strat}</span>}
                      </td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f5", fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#374151", maxWidth: 140 }}>{entryStr}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f5", fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#374151", maxWidth: 140 }}>{exitStr}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f5", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, textAlign: "right", color: t.pnl >= 0 ? "#059669" : "#dc2626" }}>{fmtD(t.pnl)}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f5", fontSize: 9, color: "#9ca3af", maxWidth: 200 }}>{t.notes || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 100 && <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 16 }}>Showing first 100 of {filtered.length} trades</div>}
          </>}

          {/* Best / Worst for recap */}
          {reportType === "recap" && stats.best && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontSize: 9, color: "#059669", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Best Trade</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: "#059669" }}>{fmtD(stats.best.pnl)}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{stats.best.ticker} · {stats.best.date}</div>
              </div>
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontSize: 9, color: "#dc2626", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Worst Trade</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: "#dc2626" }}>{fmtD(stats.worst.pnl)}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{stats.worst.ticker} · {stats.worst.date}</div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: "center", fontSize: 9, color: "#9ca3af", paddingTop: 12, borderTop: "1px solid #e8e8f0" }}>
            Generated by TradePulse · Confidential
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ user, futuresSettings, onSaveFutures, customFields, onSaveCustomFields, accountBalances, onSaveAccountBalances, trades, onSaveTrades, prefs, onSavePrefs, theme, wheelTrades, cashTransactions, onSaveCashTransactions, hideBalances }) {
  const [section, setSection] = useState("accounts"); // accounts | appearance | futures | custom | importexport | ai
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);

  const handleSave = (p) => {
    onSaveFutures(prev => {
      const idx = prev.findIndex(f => f.name === p.name);
      if (idx >= 0) { const u = [...prev]; u[idx] = p; return u; }
      return [...prev, p];
    });
    setShowAddModal(false); setEditingPreset(null);
  };
  const handleDelete = (name) => onSaveFutures(prev => prev.filter(f => f.name !== name));

  const openNew = () => { setEditingPreset(null); setShowAddModal(true); };
  const openEdit = (p) => { setEditingPreset(p); setShowAddModal(true); };

  return (
    <div>
      {/* Section tabs */}
      <div className="tp-settings-tabs" style={{ display:"flex", gap:8, marginBottom:24, borderBottom:"1px solid var(--tp-border)", paddingBottom:2 }}>
        <button onClick={()=>setSection("accounts")} style={{ padding:"8px 16px", border:"none", background:section==="accounts"?"rgba(99,102,241,0.15)":"transparent", color:section==="accounts"?"#a5b4fc":theme.textFaint, cursor:"pointer", fontSize:13, fontWeight:600, borderRadius:"6px 6px 0 0", borderBottom:section==="accounts"?"2px solid #6366f1":"none", whiteSpace:"nowrap", flexShrink:0 }}>Account Balances</button>
        <button onClick={()=>setSection("appearance")} style={{ padding:"8px 16px", border:"none", background:section==="appearance"?"rgba(99,102,241,0.15)":"transparent", color:section==="appearance"?"#a5b4fc":theme.textFaint, cursor:"pointer", fontSize:13, fontWeight:600, borderRadius:"6px 6px 0 0", borderBottom:section==="appearance"?"2px solid #6366f1":"none", whiteSpace:"nowrap", flexShrink:0 }}>Appearance</button>
        <button onClick={()=>setSection("importexport")} style={{ padding:"8px 16px", border:"none", background:section==="importexport"?"rgba(99,102,241,0.15)":"transparent", color:section==="importexport"?"#a5b4fc":theme.textFaint, cursor:"pointer", fontSize:13, fontWeight:600, borderRadius:"6px 6px 0 0", borderBottom:section==="importexport"?"2px solid #6366f1":"none", whiteSpace:"nowrap", flexShrink:0 }}>Import / Export</button>
        <button onClick={()=>setSection("futures")} style={{ padding:"8px 16px", border:"none", background:section==="futures"?"rgba(99,102,241,0.15)":"transparent", color:section==="futures"?"#a5b4fc":"#6b7080", cursor:"pointer", fontSize:13, fontWeight:600, borderRadius:"6px 6px 0 0", borderBottom:section==="futures"?"2px solid #6366f1":"none", whiteSpace:"nowrap", flexShrink:0 }}>Futures Presets</button>
        <button onClick={()=>setSection("custom")} style={{ padding:"8px 16px", border:"none", background:section==="custom"?"rgba(99,102,241,0.15)":"transparent", color:section==="custom"?"#a5b4fc":"#6b7080", cursor:"pointer", fontSize:13, fontWeight:600, borderRadius:"6px 6px 0 0", borderBottom:section==="custom"?"2px solid #6366f1":"none", whiteSpace:"nowrap", flexShrink:0 }}>Custom Fields</button>
        <button onClick={()=>setSection("ai")} style={{ padding:"8px 16px", border:"none", background:section==="ai"?"rgba(99,102,241,0.15)":"transparent", color:section==="ai"?"#a5b4fc":"#6b7080", cursor:"pointer", fontSize:13, fontWeight:600, borderRadius:"6px 6px 0 0", borderBottom:section==="ai"?"2px solid #6366f1":"none", whiteSpace:"nowrap", flexShrink:0 }}>AI Integration</button>
        <button onClick={()=>setSection("schwab")} style={{ padding:"8px 16px", border:"none", background:section==="schwab"?"rgba(99,102,241,0.15)":"transparent", color:section==="schwab"?"#a5b4fc":"#6b7080", cursor:"pointer", fontSize:13, fontWeight:600, borderRadius:"6px 6px 0 0", borderBottom:section==="schwab"?"2px solid #6366f1":"none", whiteSpace:"nowrap", flexShrink:0 }}>Schwab API</button>
      </div>

      {section === "accounts" && <AccountBalancesManager accountBalances={accountBalances} onSave={onSaveAccountBalances} customFields={customFields} trades={trades} prefs={prefs} onSavePrefs={onSavePrefs} wheelTrades={wheelTrades} cashTransactions={cashTransactions} onSaveCashTransactions={onSaveCashTransactions} hideBalances={hideBalances}/>}

      {section === "futures" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div><div style={{ fontSize:18, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Futures Contract Presets</div><div style={{ fontSize:13, color:"var(--tp-faint)" }}>Save tick value for quick trade entry</div></div>
            <button onClick={openNew} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}><Plus size={15}/> Add Contract</button>
          </div>

          {futuresSettings.length === 0 ? (
            <div style={{ textAlign:"center", padding:"70px 20px", color:"var(--tp-faint)" }}><Settings size={48} style={{ margin:"0 auto 16px", opacity:0.35 }}/><p style={{ margin:0, fontSize:15 }}>No futures presets yet. Add ES, NQ, YM, etc.</p></div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))", gap:12 }}>
              {futuresSettings.map(f => (
                <div key={f.name} style={{ background:"var(--tp-panel)", border:"1px solid rgba(234,179,8,0.15)", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", marginBottom:10 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:"#eab308" }}>{f.name}</div>
                    <div style={{ display:"flex", gap:4 }}>
                      <button onClick={()=>openEdit(f)} style={{ padding:"4px 6px", borderRadius:4, border:"none", background:"var(--tp-input)", color:"var(--tp-muted)", cursor:"pointer", fontSize:10 }}>Edit</button>
                      <button onClick={()=>handleDelete(f.name)} style={{ padding:"4px 6px", borderRadius:4, border:"none", background:"transparent", color:"var(--tp-faint)", cursor:"pointer" }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><Trash2 size={11}/></button>
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.6 }}>
                    <div>Tick Size: <span style={{ fontWeight:600, color:"var(--tp-text2)" }}>{f.tickSize}</span></div>
                    <div>Tick Value: <span style={{ fontWeight:600, color:"var(--tp-text2)" }}>${f.tickValue}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showAddModal && <FuturesPresetModal onSave={handleSave} onClose={()=>{setShowAddModal(false);setEditingPreset(null);}} editPreset={editingPreset}/>}
        </div>
      )}

      {section === "importexport" && <ImportExportManager user={user} trades={trades} onSaveTrades={onSaveTrades} customFields={customFields} accountBalances={accountBalances}/>}

      {section === "appearance" && <AppearanceManager prefs={prefs} onSave={onSavePrefs} theme={theme}/>}

      {section === "custom" && <CustomFieldsManager customFields={customFields} onSave={onSaveCustomFields}/>}

      {section === "ai" && (
        <div>
          <div style={{ fontSize:18, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>AI Integration</div>
          <div style={{ fontSize:13, color:"var(--tp-faint)", marginBottom:20 }}>Configure your AI Trade Coach provider</div>

          {/* Current provider */}
          <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 24px", marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:14 }}>AI Provider</div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {/* Gemini option */}
              <button onClick={()=>onSavePrefs(p=>({...p, aiProvider:"gemini"}))} style={{ padding:"16px", borderRadius:12, border:`2px solid ${(!prefs.aiProvider || prefs.aiProvider==="gemini") ? "#4ade80" : "var(--tp-border-l)"}`, background:(!prefs.aiProvider || prefs.aiProvider==="gemini")?"rgba(74,222,128,0.06)":"var(--tp-card)", cursor:"pointer", textAlign:"left" }}>
                <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)", marginBottom:4 }}>Gemini Flash</div>
                <div style={{ fontSize:11, color:"#4ade80", fontWeight:600, marginBottom:6 }}>Free API Key</div>
                <div style={{ fontSize:11, color:"var(--tp-faint)", lineHeight:1.5 }}>Good analysis of trade stats, setup performance, and basic pattern detection. Get a free key from Google AI Studio.</div>
              </button>

              {/* Claude option */}
              <button onClick={()=>onSavePrefs(p=>({...p, aiProvider:"claude"}))} style={{ padding:"16px", borderRadius:12, border:`2px solid ${prefs.aiProvider==="claude" ? "#a5b4fc" : "var(--tp-border-l)"}`, background:prefs.aiProvider==="claude"?"rgba(165,180,252,0.06)":"var(--tp-card)", cursor:"pointer", textAlign:"left" }}>
                <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)", marginBottom:4 }}>Claude by Anthropic</div>
                <div style={{ fontSize:11, color:"#a5b4fc", fontWeight:600, marginBottom:6 }}>Bring Your Own Key</div>
                <div style={{ fontSize:11, color:"var(--tp-faint)", lineHeight:1.5 }}>Deeper behavioral analysis, nuanced journal insights, and advanced pattern detection. Requires API key.</div>
              </button>
            </div>

            {/* Status */}
            <div style={{ fontSize:12, color:"var(--tp-muted)", display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:4, background: (prefs.aiProvider === "claude" && !(prefs.claudeApiKey||"").startsWith("sk-ant-")) ? "#eab308" : (!prefs.aiProvider || prefs.aiProvider === "gemini") && !(prefs.geminiApiKey||"").startsWith("AIza") ? "#eab308" : "#4ade80" }}/>
              {(!prefs.aiProvider || prefs.aiProvider === "gemini") && (prefs.geminiApiKey||"").startsWith("AIza") && "Using Gemini Flash with your API key"}
              {(!prefs.aiProvider || prefs.aiProvider === "gemini") && !(prefs.geminiApiKey||"").startsWith("AIza") && "Gemini selected — enter your free API key below"}
              {prefs.aiProvider === "claude" && (prefs.claudeApiKey||"").startsWith("sk-ant-") && "Using Claude with your API key"}
              {prefs.aiProvider === "claude" && !(prefs.claudeApiKey||"").startsWith("sk-ant-") && "Claude selected but no API key entered"}
            </div>
          </div>

          {/* Gemini API Key */}
          {(!prefs.aiProvider || prefs.aiProvider === "gemini") && (
            <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 24px", marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#4ade80", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Gemini API Key</div>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <input
                  type="password"
                  value={prefs.geminiApiKey || ""}
                  onChange={e=>onSavePrefs(p=>({...p, geminiApiKey: e.target.value}))}
                  placeholder="Paste your Gemini API key here..."
                  style={{ flex:1, padding:"10px 14px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"'JetBrains Mono', monospace" }}
                />
              </div>
              {(prefs.geminiApiKey||"").startsWith("AIza") && (
                <div style={{ marginTop:6, marginBottom:10, fontSize:11, color:"#4ade80", display:"flex", alignItems:"center", gap:5 }}>
                  <Check size={12}/> API key saved. AI Coach and price lookups will use Gemini.
                </div>
              )}
              <div style={{ fontSize:11, color:"var(--tp-faint)", lineHeight:1.7, marginTop:8 }}>
                <strong style={{ color:"var(--tp-muted)" }}>How to get a free key:</strong><br/>
                1. Go to <span style={{ color:"#60a5fa" }}>aistudio.google.com/apikey</span><br/>
                2. Click "Create API Key"<br/>
                3. Copy the key and paste it above<br/>
                <span style={{ color:"var(--tp-faintest)", marginTop:4, display:"inline-block" }}>Free tier: ~15 requests/minute, 1000/day. Your key is stored in your cloud account.</span>
              </div>
            </div>
          )}

          {/* Claude API Key */}
          {prefs.aiProvider === "claude" && (
            <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 24px", marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#a5b4fc", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Claude API Key</div>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <input
                  type="password"
                  value={prefs.claudeApiKey || ""}
                  onChange={e=>onSavePrefs(p=>({...p, claudeApiKey: e.target.value}))}
                  placeholder="Paste your API key here..."
                  style={{ flex:1, padding:"10px 14px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"'JetBrains Mono', monospace" }}
                />
              </div>
              {(prefs.claudeApiKey||"").startsWith("sk-ant-") && (
                <div style={{ marginTop:6, marginBottom:10, fontSize:11, color:"#4ade80", display:"flex", alignItems:"center", gap:5 }}>
                  <Check size={12}/> API key saved. AI Coach will use Claude for analysis.
                </div>
              )}
              {prefs.claudeApiKey && !(prefs.claudeApiKey||"").startsWith("sk-ant-") && (
                <div style={{ marginTop:6, marginBottom:10, fontSize:11, color:"#eab308" }}>
                  Key doesn't look right — it should start with "sk-ant-"
                </div>
              )}

              {/* Collapsible setup guide */}
              <SetupGuide />

              <div style={{ marginTop:12, fontSize:11, color:"var(--tp-faintest)", lineHeight:1.5 }}>
                Your key is stored securely in your cloud account and never shared. Typical cost: ~$0.01-0.03 per analysis.
              </div>
            </div>
          )}

          {/* Info */}
          <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 24px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>How It Works</div>
            <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.7 }}>
              The AI Coach analyzes your trade statistics, journal entries, and behavioral patterns to give you personalized coaching. All data is computed locally in your browser first — only summary statistics are sent to the AI, never raw account data or screenshots. You can use it up to 10 times per day from the Review tab → AI Coach.
            </div>
          </div>
        </div>
      )}

      {section === "schwab" && <SchwabSetupWizard user={user} />}
    </div>
  );
}

// ─── SCHWAB SETUP WIZARD ────────────────────────────────────────────────────
function SchwabSetupWizard({ user }) {
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { hasCredentials, connected }
  const [message, setMessage] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [expandGuide, setExpandGuide] = useState(true);

  const userId = user?.id;

  // Check existing credentials on mount
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/schwab/credentials?userId=${userId}`)
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => {});
  }, [userId]);

  const handleSave = async () => {
    if (!appKey.trim() || !appSecret.trim()) { setMessage("Both App Key and App Secret are required."); return; }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/schwab/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, appKey: appKey.trim(), appSecret: appSecret.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("✅ Credentials saved! You can now connect to Schwab using the button in the screener.");
        setStatus(prev => ({ ...prev, hasCredentials: true }));
        setExpandGuide(false);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (e) {
      setMessage("❌ Failed to save — check your connection and try again.");
    }
    setSaving(false);
  };

  const handleRemove = async () => {
    if (!confirm("Remove your Schwab credentials? You'll need to re-enter them to use the screener.")) return;
    try {
      await fetch("/api/schwab/credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      setStatus({ hasCredentials: false, connected: false });
      setAppKey(""); setAppSecret("");
      setMessage("Credentials removed.");
    } catch {}
  };

  const CALLBACK_URL = typeof window !== "undefined"
    ? `${window.location.origin}/api/schwab/callback`
    : "https://tradepulse-platform.vercel.app/api/schwab/callback";

  return (
    <div>
      <div style={{ fontSize:18, fontWeight:700, color:"var(--tp-text)", marginBottom:4 }}>Schwab API Connection</div>
      <div style={{ fontSize:13, color:"var(--tp-muted)", marginBottom:20, lineHeight:1.6 }}>
        Connect your own Schwab developer API to get <strong style={{ color:"#4ade80" }}>real-time market data</strong> with <strong style={{ color:"#4ade80" }}>120 API calls/minute</strong> — dedicated to your account only. This powers the screener, SPX Radar, sector explorer, and live holdings prices.
      </div>

      {/* Status Badge */}
      <div style={{ display:"flex", gap:12, marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:8, background: status?.connected ? "rgba(74,222,128,0.1)" : status?.hasCredentials ? "rgba(234,179,8,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${status?.connected ? "rgba(74,222,128,0.2)" : status?.hasCredentials ? "rgba(234,179,8,0.2)" : "rgba(248,113,113,0.2)"}` }}>
          <div style={{ width:8, height:8, borderRadius:4, background: status?.connected ? "#4ade80" : status?.hasCredentials ? "#eab308" : "#f87171" }} />
          <span style={{ fontSize:12, fontWeight:600, color: status?.connected ? "#4ade80" : status?.hasCredentials ? "#eab308" : "#f87171" }}>
            {status?.connected ? "Connected & Active" : status?.hasCredentials ? "Credentials Saved — Click Connect in Screener" : "Not Set Up"}
          </span>
        </div>
      </div>

      {/* Why Section */}
      <div style={{ background:"var(--tp-panel)", border:"1px solid rgba(99,102,241,0.15)", borderRadius:14, padding:"18px 22px", marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#a5b4fc", marginBottom:10 }}>Why do I need my own API key?</div>
        <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.7 }}>
          Each Schwab developer account gets <strong style={{ color:"var(--tp-text)" }}>120 API calls per minute</strong> — completely independent from other users. This means your scans, live prices, and option chains are never competing with anyone else for bandwidth. It's the difference between real-time data and waiting in line.
          <br/><br/>
          Setting up takes about <strong style={{ color:"var(--tp-text)" }}>5 minutes</strong> and you only do it once. Your credentials are stored securely and encrypted in your account — you won't need to enter them again.
        </div>
      </div>

      {/* Step-by-Step Guide */}
      <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, marginBottom:20, overflow:"hidden" }}>
        <button onClick={() => setExpandGuide(!expandGuide)} style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 22px", border:"none", background:"transparent", cursor:"pointer", color:"var(--tp-text)" }}>
          <span style={{ fontSize:14, fontWeight:700 }}>📋 Setup Guide (5 minutes)</span>
          <ChevronDown size={16} style={{ color:"var(--tp-faint)", transform: expandGuide ? "rotate(180deg)" : "none", transition:"transform 0.2s" }} />
        </button>

        {expandGuide && (
          <div style={{ padding:"0 22px 22px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Step 1 */}
            <div style={{ display:"flex", gap:14 }}>
              <div style={{ width:28, height:28, borderRadius:14, background:"rgba(99,102,241,0.15)", color:"#a5b4fc", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, flexShrink:0 }}>1</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Create a Schwab Developer Account</div>
                <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.6 }}>
                  Go to <a href="https://developer.schwab.com" target="_blank" rel="noopener" style={{ color:"#6366f1", textDecoration:"underline" }}>developer.schwab.com</a> and sign up. You can use your existing Schwab brokerage login or create a new account. It's free.
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div style={{ display:"flex", gap:14 }}>
              <div style={{ width:28, height:28, borderRadius:14, background:"rgba(99,102,241,0.15)", color:"#a5b4fc", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, flexShrink:0 }}>2</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Create an App</div>
                <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.6 }}>
                  Once logged in, go to <strong style={{ color:"var(--tp-text)" }}>My Apps</strong> and click <strong style={{ color:"var(--tp-text)" }}>Create App</strong>. Give it any name you want (e.g., "My Trading Tools"). For the description, anything works — "Personal trading dashboard."
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div style={{ display:"flex", gap:14 }}>
              <div style={{ width:28, height:28, borderRadius:14, background:"rgba(99,102,241,0.15)", color:"#a5b4fc", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, flexShrink:0 }}>3</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Set the Callback URL</div>
                <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.6, marginBottom:8 }}>
                  When creating your app, you'll see a field for <strong style={{ color:"var(--tp-text)" }}>Callback URL</strong>. Paste this exact URL:
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <code style={{ flex:1, padding:"10px 14px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"#4ade80", fontSize:12, fontFamily:"'JetBrains Mono', monospace", wordBreak:"break-all" }}>{CALLBACK_URL}</code>
                  <button onClick={() => { navigator.clipboard.writeText(CALLBACK_URL); }} style={{ padding:"8px 12px", borderRadius:6, border:"1px solid var(--tp-border-l)", background:"var(--tp-input)", color:"var(--tp-muted)", cursor:"pointer", fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>Copy</button>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div style={{ display:"flex", gap:14 }}>
              <div style={{ width:28, height:28, borderRadius:14, background:"rgba(234,179,8,0.15)", color:"#eab308", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, flexShrink:0 }}>4</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Wait for Approval</div>
                <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.6 }}>
                  Schwab reviews new apps — this usually takes <strong style={{ color:"var(--tp-text)" }}>1-3 business days</strong>. You'll get an email when it's approved. This is a one-time wait.
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div style={{ display:"flex", gap:14 }}>
              <div style={{ width:28, height:28, borderRadius:14, background:"rgba(74,222,128,0.15)", color:"#4ade80", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, flexShrink:0 }}>5</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Copy Your App Key & Secret</div>
                <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.6 }}>
                  Once approved, go to your app's details page. You'll see your <strong style={{ color:"var(--tp-text)" }}>App Key</strong> (also called Client ID) and <strong style={{ color:"var(--tp-text)" }}>App Secret</strong> (also called Client Secret). Copy both and paste them below.
                </div>
              </div>
            </div>

            {/* Step 6 */}
            <div style={{ display:"flex", gap:14 }}>
              <div style={{ width:28, height:28, borderRadius:14, background:"rgba(74,222,128,0.15)", color:"#4ade80", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, flexShrink:0 }}>6</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Connect & Start Scanning</div>
                <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.6 }}>
                  After saving your keys below, go to the Screener and click <strong style={{ color:"var(--tp-text)" }}>Connect Schwab</strong>. You'll log in with your regular Schwab brokerage account (not the developer account) to authorize access. That's it — you're connected with your own 120 calls/min.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Credential Input */}
      <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 24px", marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)", marginBottom:16 }}>Your Schwab Developer Credentials</div>

        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>App Key (Client ID)</label>
          <input
            type="text"
            value={appKey}
            onChange={e => setAppKey(e.target.value)}
            placeholder="Paste your App Key here..."
            style={{ width:"100%", padding:"10px 14px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"'JetBrains Mono', monospace", boxSizing:"border-box" }}
          />
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:11, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>App Secret (Client Secret)</label>
          <div style={{ display:"flex", gap:8 }}>
            <input
              type={showSecret ? "text" : "password"}
              value={appSecret}
              onChange={e => setAppSecret(e.target.value)}
              placeholder="Paste your App Secret here..."
              style={{ flex:1, padding:"10px 14px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"'JetBrains Mono', monospace" }}
            />
            <button onClick={() => setShowSecret(!showSecret)} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--tp-border-l)", background:"var(--tp-input)", color:"var(--tp-muted)", cursor:"pointer", fontSize:11 }}>
              {showSecret ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {message && (
          <div style={{ fontSize:12, color: message.startsWith("✅") ? "#4ade80" : message.startsWith("❌") ? "#f87171" : "var(--tp-muted)", marginBottom:14, lineHeight:1.5 }}>
            {message}
          </div>
        )}

        <div style={{ display:"flex", gap:10 }}>
          <button
            onClick={handleSave}
            disabled={saving || !appKey.trim() || !appSecret.trim()}
            style={{ padding:"10px 24px", borderRadius:8, border:"none", background: saving ? "#4b5563" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor: saving ? "default" : "pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)", opacity: (!appKey.trim() || !appSecret.trim()) ? 0.5 : 1 }}
          >
            {saving ? "Saving..." : status?.hasCredentials ? "Update Credentials" : "Save Credentials"}
          </button>

          {status?.hasCredentials && (
            <button
              onClick={handleRemove}
              style={{ padding:"10px 18px", borderRadius:8, border:"1px solid rgba(248,113,113,0.3)", background:"transparent", color:"#f87171", cursor:"pointer", fontSize:12, fontWeight:600 }}
            >
              Remove
            </button>
          )}
        </div>

        <div style={{ marginTop:14, fontSize:11, color:"var(--tp-faintest)", lineHeight:1.5 }}>
          Your credentials are stored securely in your account and never shared with other users. Each user's API calls are completely independent.
        </div>
      </div>

      {/* Additional Data Sources */}
      <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 24px", marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:700, color:"var(--tp-text)", marginBottom:6 }}>Additional Data Sources (Optional)</div>
        <div style={{ fontSize:12, color:"var(--tp-muted)", marginBottom:16, lineHeight:1.6 }}>
          Schwab is the primary and recommended data source. These are optional fallbacks or supplements.
        </div>

        {/* Tradier */}
        <div style={{ marginBottom:18, paddingBottom:18, borderBottom:"1px solid var(--tp-border)" }}>
          <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>📊 Tradier</div>
          <div style={{ fontSize:11, color:"var(--tp-muted)", marginBottom:10, lineHeight:1.5 }}>
            Alternative broker API with easy signup. Free sandbox available with delayed data. Sign up at{" "}
            <a href="https://developer.tradier.com" target="_blank" rel="noopener" style={{ color:"#6366f1", textDecoration:"underline" }}>developer.tradier.com</a>
          </div>
          <div style={{ marginBottom:8 }}>
            <label style={{ display:"block", fontSize:10, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Access Token</label>
            <input
              type="password"
              placeholder="Tradier access token..."
              style={{ width:"100%", padding:"8px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", fontFamily:"'JetBrains Mono', monospace", boxSizing:"border-box" }}
            />
          </div>
          <div style={{ fontSize:10, color:"var(--tp-faintest)" }}>Coming soon — Tradier integration is planned for a future update.</div>
        </div>

        {/* Polygon */}
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>🔷 Polygon.io</div>
          <div style={{ fontSize:11, color:"var(--tp-muted)", marginBottom:10, lineHeight:1.5 }}>
            Free tier with 5 calls/min. Good for basic quote data as a fallback. Sign up at{" "}
            <a href="https://polygon.io" target="_blank" rel="noopener" style={{ color:"#6366f1", textDecoration:"underline" }}>polygon.io</a>
          </div>
          <div style={{ marginBottom:8 }}>
            <label style={{ display:"block", fontSize:10, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>API Key</label>
            <input
              type="password"
              placeholder="Polygon API key..."
              style={{ width:"100%", padding:"8px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", fontFamily:"'JetBrains Mono', monospace", boxSizing:"border-box" }}
            />
          </div>
          <div style={{ fontSize:10, color:"var(--tp-faintest)" }}>Coming soon — Polygon integration is planned for a future update.</div>
        </div>
      </div>
    </div>
  );
}

// ─── APPEARANCE MANAGER ─────────────────────────────────────────────────────
function AppearanceManager({ prefs, onSave, theme }) {
  const logoInputRef = { current: null };
  const bannerInputRef = { current: null };

  const handleImageUpload = (file, field, maxW, maxH) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        onSave(p => ({ ...p, [field]: dataUrl }));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div style={{ fontSize:18, fontWeight:600, color:theme.text, marginBottom:4 }}>Appearance</div>
      <div style={{ fontSize:13, color:theme.textFaint, marginBottom:24 }}>Customize the look and feel of your trading journal</div>

      {/* Theme Toggle */}
      <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:14, padding:"22px 24px", marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:600, color:theme.text, marginBottom:4 }}>Theme</div>
        <div style={{ fontSize:12, color:theme.textFaint, marginBottom:16 }}>Choose between dark and light mode</div>

        <div style={{ display:"flex", gap:12 }}>
          {/* Dark mode card */}
          <div onClick={()=>onSave(p=>({...p,theme:"dark"}))} style={{
            flex:1, padding:"16px", borderRadius:12, cursor:"pointer", transition:"all 0.2s",
            border: prefs.theme==="dark" ? "2px solid #6366f1" : `1px solid ${theme.borderLight}`,
            background: prefs.theme==="dark" ? "rgba(99,102,241,0.08)" : theme.inputBg
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <Moon size={18} color={prefs.theme==="dark" ? "#a5b4fc" : theme.textFaint}/>
              <span style={{ fontSize:14, fontWeight:600, color: prefs.theme==="dark" ? "#a5b4fc" : theme.textMuted }}>Dark Mode</span>
              {prefs.theme==="dark" && <Check size={14} color="#6366f1"/>}
            </div>
            {/* Mini preview */}
            <div style={{ background:"#0f1014", borderRadius:8, padding:"10px", height:60 }}>
              <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                <div style={{ width:20, height:4, borderRadius:2, background:"#6366f1" }}/>
                <div style={{ width:14, height:4, borderRadius:2, background:"#333" }}/>
                <div style={{ width:14, height:4, borderRadius:2, background:"#333" }}/>
              </div>
              <div style={{ display:"flex", gap:4 }}>
                <div style={{ flex:1, height:20, borderRadius:4, background:"var(--tp-sel-bg)" }}/>
                <div style={{ flex:1, height:20, borderRadius:4, background:"var(--tp-sel-bg)" }}/>
                <div style={{ flex:1, height:20, borderRadius:4, background:"var(--tp-sel-bg)" }}/>
              </div>
            </div>
          </div>

          {/* Light mode card */}
          <div onClick={()=>onSave(p=>({...p,theme:"light"}))} style={{
            flex:1, padding:"16px", borderRadius:12, cursor:"pointer", transition:"all 0.2s",
            border: prefs.theme==="light" ? "2px solid #6366f1" : `1px solid ${theme.borderLight}`,
            background: prefs.theme==="light" ? "rgba(99,102,241,0.08)" : theme.inputBg
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <Sun size={18} color={prefs.theme==="light" ? "#6366f1" : theme.textFaint}/>
              <span style={{ fontSize:14, fontWeight:600, color: prefs.theme==="light" ? "#6366f1" : theme.textMuted }}>Light Mode</span>
              {prefs.theme==="light" && <Check size={14} color="#6366f1"/>}
            </div>
            {/* Mini preview */}
            <div style={{ background:"#f4f5f7", borderRadius:8, padding:"10px", height:60 }}>
              <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                <div style={{ width:20, height:4, borderRadius:2, background:"#6366f1" }}/>
                <div style={{ width:14, height:4, borderRadius:2, background:"#d1d5db" }}/>
                <div style={{ width:14, height:4, borderRadius:2, background:"#d1d5db" }}/>
              </div>
              <div style={{ display:"flex", gap:4 }}>
                <div style={{ flex:1, height:20, borderRadius:4, background:"#ffffff", border:"1px solid #e5e7eb" }}/>
                <div style={{ flex:1, height:20, borderRadius:4, background:"#ffffff", border:"1px solid #e5e7eb" }}/>
                <div style={{ flex:1, height:20, borderRadius:4, background:"#ffffff", border:"1px solid #e5e7eb" }}/>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Logo + Banner */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* Logo Upload */}
        <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:14, padding:"22px 24px" }}>
          <div style={{ fontSize:14, fontWeight:600, color:theme.text, marginBottom:4 }}>Dashboard Logo</div>
          <div style={{ fontSize:12, color:theme.textFaint, marginBottom:16 }}>Displays on the left side of the dashboard header</div>

          <div style={{ width:"100%", height:80, borderRadius:10, border:`2px dashed ${prefs.logo ? theme.accentPrimary : theme.borderLight}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", background: prefs.logo ? "transparent" : theme.inputBg, marginBottom:10, cursor:"pointer" }} onClick={()=>logoInputRef.current?.click()}>
            {prefs.logo ? (
              <img src={prefs.logo} alt="Logo" style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain" }}/>
            ) : (
              <div style={{ textAlign:"center" }}><Image size={22} color={theme.textFaintest}/><div style={{ fontSize:10, color:theme.textFaintest, marginTop:4 }}>Click to upload</div></div>
            )}
          </div>
          <input ref={el=>logoInputRef.current=el} type="file" accept="image/*" onChange={e=>handleImageUpload(e.target.files?.[0], "logo", 400, 400)} style={{ display:"none" }}/>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={()=>logoInputRef.current?.click()} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"7px 12px", borderRadius:7, border:`1px solid ${theme.borderLight}`, background:theme.inputBg, color:theme.textMuted, cursor:"pointer", fontSize:11 }}><Upload size={12}/> Upload</button>
            {prefs.logo && <button onClick={()=>onSave(p=>({...p,logo:""}))} style={{ padding:"7px 12px", borderRadius:7, border:"1px solid rgba(248,113,113,0.25)", background:"rgba(248,113,113,0.06)", color:"#f87171", cursor:"pointer", fontSize:11 }}>Remove</button>}
          </div>
          <div style={{ fontSize:10, color:theme.textFaintest, marginTop:8 }}>PNG or SVG with transparent background works best</div>
        </div>

        {/* Banner Upload */}
        <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:14, padding:"22px 24px" }}>
          <div style={{ fontSize:14, fontWeight:600, color:theme.text, marginBottom:4 }}>Dashboard Banner</div>
          <div style={{ fontSize:12, color:theme.textFaint, marginBottom:16 }}>Displays to the right of your logo as a wide banner</div>

          <div style={{ width:"100%", height:80, borderRadius:10, border:`2px dashed ${prefs.banner ? theme.accentPrimary : theme.borderLight}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", background: prefs.banner ? "transparent" : theme.inputBg, marginBottom:10, cursor:"pointer" }} onClick={()=>bannerInputRef.current?.click()}>
            {prefs.banner ? (
              <img src={prefs.banner} alt="Banner" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
            ) : (
              <div style={{ textAlign:"center" }}><Image size={22} color={theme.textFaintest}/><div style={{ fontSize:10, color:theme.textFaintest, marginTop:4 }}>Click to upload</div></div>
            )}
          </div>
          <input ref={el=>bannerInputRef.current=el} type="file" accept="image/*" onChange={e=>handleImageUpload(e.target.files?.[0], "banner", 1200, 300)} style={{ display:"none" }}/>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={()=>bannerInputRef.current?.click()} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"7px 12px", borderRadius:7, border:`1px solid ${theme.borderLight}`, background:theme.inputBg, color:theme.textMuted, cursor:"pointer", fontSize:11 }}><Upload size={12}/> Upload</button>
            {prefs.banner && <button onClick={()=>onSave(p=>({...p,banner:""}))} style={{ padding:"7px 12px", borderRadius:7, border:"1px solid rgba(248,113,113,0.25)", background:"rgba(248,113,113,0.06)", color:"#f87171", cursor:"pointer", fontSize:11 }}>Remove</button>}
          </div>
          <div style={{ fontSize:10, color:theme.textFaintest, marginTop:8 }}>Wide images work best (e.g. 1200×200). Auto-cropped to fit.</div>
        </div>
      </div>

      {/* Tab Order */}
      <TabOrderManager prefs={prefs} onSave={onSave} theme={theme}/>

      {/* Dashboard Widgets */}
      <DashWidgetManager prefs={prefs} onSave={onSave} theme={theme}/>
    </div>
  );
}

function TabOrderManager({ prefs, onSave, theme }) {
  const DEFAULT_TAB_IDS = ["dashboard","journal","goals","holdings","review","playbook","wheel","watchlist","log","reports","settings"];
  const TAB_LABELS = { dashboard:"Dashboard", journal:"Journal", goals:"Goals", holdings:"Holdings", review:"Review", playbook:"Playbook", wheel:"Wheel", watchlist:"Watchlist", log:"Trade Log", reports:"Reports", settings:"Settings" };
  const TAB_ICONS = { dashboard:Home, journal:Clipboard, goals:Target, holdings:Briefcase, review:Shield, playbook:BookOpen, wheel:RefreshCw, watchlist:Crosshair, log:List, reports:FileText, settings:Settings };

  const currentOrder = (prefs.tabOrder && prefs.tabOrder.length > 0) ? prefs.tabOrder : DEFAULT_TAB_IDS;
  // Ensure all tabs present
  const fullOrder = [...currentOrder, ...DEFAULT_TAB_IDS.filter(id => !currentOrder.includes(id))];

  const moveTab = (idx, dir) => {
    const newOrder = [...fullOrder];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
    onSave(p => ({ ...p, tabOrder: newOrder }));
  };

  const resetOrder = () => onSave(p => ({ ...p, tabOrder: [] }));

  return (
    <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:14, padding:"22px 24px", marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <div style={{ fontSize:14, fontWeight:600, color:theme.text }}>Tab Order</div>
        <button onClick={resetOrder} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${theme.borderLight}`, background:theme.inputBg, color:theme.textFaint, cursor:"pointer", fontSize:10 }}>Reset Default</button>
      </div>
      <div style={{ fontSize:12, color:theme.textFaint, marginBottom:16 }}>Drag tabs up or down to reorder the navigation bar</div>
      <div style={{ display:"grid", gap:4 }}>
        {fullOrder.map((id, idx) => {
          const Icon = TAB_ICONS[id] || List;
          return (
            <div key={id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:theme.cardBg, borderRadius:8, border:`1px solid ${theme.borderLight}` }}>
              <span style={{ fontSize:12, color:theme.textFaintest, fontFamily:"'JetBrains Mono', monospace", minWidth:18 }}>{idx + 1}</span>
              <Icon size={14} color={theme.textMuted}/>
              <span style={{ flex:1, fontSize:13, fontWeight:500, color:theme.text }}>{TAB_LABELS[id] || id}</span>
              <button onClick={()=>moveTab(idx,-1)} disabled={idx===0} style={{ width:26, height:26, borderRadius:6, border:`1px solid ${theme.borderLight}`, background: idx===0 ? "transparent" : theme.inputBg, color: idx===0 ? theme.textFaintest : theme.textMuted, cursor: idx===0 ? "default" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}><ChevronUp size={12}/></button>
              <button onClick={()=>moveTab(idx,1)} disabled={idx===fullOrder.length-1} style={{ width:26, height:26, borderRadius:6, border:`1px solid ${theme.borderLight}`, background: idx===fullOrder.length-1 ? "transparent" : theme.inputBg, color: idx===fullOrder.length-1 ? theme.textFaintest : theme.textMuted, cursor: idx===fullOrder.length-1 ? "default" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}><ChevronDown size={12}/></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashWidgetManager({ prefs, onSave, theme }) {
  const defaults = [
    { id:"accounts", label:"Account Balances", visible:true },
    { id:"filters", label:"Filter Bar", visible:true },
    { id:"stats", label:"Stat Cards", visible:true },
    { id:"secondary", label:"Secondary Stats", visible:true },
    { id:"chart", label:"P&L Chart", visible:true },
    { id:"calendar", label:"Calendar Heatmap", visible:true },
    { id:"breakdown", label:"Daily / Monthly Breakdown", visible:true },
  ];

  const current = useMemo(() => {
    if (!prefs.dashWidgets || prefs.dashWidgets.length === 0) return defaults;
    const merged = [];
    prefs.dashWidgets.forEach(w => { const def = defaults.find(d => d.id === w.id); if (def) merged.push({ ...def, ...w }); });
    defaults.forEach(d => { if (!merged.find(m => m.id === d.id)) merged.push(d); });
    return merged;
  }, [prefs.dashWidgets]);

  const save = (updated) => onSave(p => ({ ...p, dashWidgets: updated }));

  const toggle = (id) => {
    const updated = current.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
    save(updated);
  };

  const move = (idx, dir) => {
    const updated = [...current];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= updated.length) return;
    [updated[idx], updated[targetIdx]] = [updated[targetIdx], updated[idx]];
    save(updated);
  };

  const reset = () => onSave(p => ({ ...p, dashWidgets: [] }));

  return (
    <div style={{ background:theme.panelBg, border:`1px solid ${theme.panelBorder}`, borderRadius:14, padding:"22px 24px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <div style={{ fontSize:14, fontWeight:600, color:theme.text }}>Dashboard Widgets</div>
        <button onClick={reset} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${theme.borderLight}`, background:theme.inputBg, color:theme.textFaint, cursor:"pointer", fontSize:10 }}>Reset Default</button>
      </div>
      <div style={{ fontSize:12, color:theme.textFaint, marginBottom:16 }}>Toggle widgets on/off and reorder your dashboard layout</div>
      <div style={{ display:"grid", gap:4 }}>
        {current.map((w, idx) => (
          <div key={w.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background: w.visible ? theme.cardBg : "transparent", borderRadius:8, border:`1px solid ${w.visible ? theme.borderLight : "transparent"}`, opacity: w.visible ? 1 : 0.5 }}>
            <button onClick={()=>toggle(w.id)} style={{ width:20, height:20, borderRadius:5, border: w.visible ? "2px solid #6366f1" : `2px solid ${theme.borderLight}`, background: w.visible ? "#6366f1" : "transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0, flexShrink:0 }}>
              {w.visible && <Check size={12} color="#fff"/>}
            </button>
            <span style={{ flex:1, fontSize:13, fontWeight:500, color: w.visible ? theme.text : theme.textFaint }}>{w.label}</span>
            <button onClick={()=>move(idx,-1)} disabled={idx===0} style={{ width:26, height:26, borderRadius:6, border:`1px solid ${theme.borderLight}`, background: idx===0 ? "transparent" : theme.inputBg, color: idx===0 ? theme.textFaintest : theme.textMuted, cursor: idx===0 ? "default" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}><ChevronUp size={12}/></button>
            <button onClick={()=>move(idx,1)} disabled={idx===current.length-1} style={{ width:26, height:26, borderRadius:6, border:`1px solid ${theme.borderLight}`, background: idx===current.length-1 ? "transparent" : theme.inputBg, color: idx===current.length-1 ? theme.textFaintest : theme.textMuted, cursor: idx===current.length-1 ? "default" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}><ChevronDown size={12}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── IMPORT / EXPORT MANAGER ────────────────────────────────────────────────
const EXPORT_FIELDS = ["date","exitDate","ticker","assetType","direction","status","entryPrice","exitPrice","quantity","fees","pnl","stopLoss","takeProfit","grade","notes","account","timeframe","tradeStrategy","strategy","playbook","entryTime","exitTime","optionsStrategyType","emotions"];
const TRADEPULSE_HEADERS = ["Date","Ticker","Asset Type","Direction","Status","Entry Price","Exit Price","Quantity","Fees","P&L","Stop Loss","Take Profit","Grade","Notes","Account","Timeframe","Strategy","Style","Playbook","Entry Time","Exit Time","Options Strategy","Emotions"];

// Smart column mapping for common broker formats
const BROKER_COLUMN_ALIASES = {
  date: ["date","trade date","exec date","execution date","date/time","order date","close date","settlement date","placed time","filled time","time","run date","activity date","process date"],
  ticker: ["ticker","symbol","instrument","underlying","stock","security"],
  direction: ["direction","side","action","buy/sell","order type","transaction type","trans code"],
  entryPrice: ["entry price","price","avg price","fill price","entry","open price","exec price","cost basis","trade price","average price"],
  exitPrice: ["exit price","close price","closing price"],
  quantity: ["quantity","qty","shares","contracts","size","volume","filled qty","filled","total qty"],
  fees: ["fees","commission","commissions","comm","fee","charges","reg fees","total fees"],
  pnl: ["p&l","pnl","profit","profit/loss","gain/loss","net profit","realized p&l","realized gain","net amount","net proceeds","proceeds"],
  assetType: ["asset type","asset class","product","security type","asset","instrument type"],
  status: ["status","state","trade status","order status"],
  stopLoss: ["stop loss","stop","sl"],
  takeProfit: ["take profit","target","tp","limit"],
  notes: ["notes","memo","comment","remarks"],
  name: ["name","description","security name","instrument name"],
  account: ["account","acct","account name","account number","account #","portfolio"],
  strategy: ["strategy","trade type","setup"],
  entryTime: ["entry time","exec time","execution time"],
  exitTime: ["exit time","close time"],
  grade: ["grade","rating","score"],
  optionsStrategyType: ["options strategy","option type","option strategy"],
  tif: ["time-in-force","tif","time in force","duration"],
};

// Known futures symbol patterns
const FUTURES_SYMBOLS = /^(MES|MNQ|MYM|M2K|ES|NQ|YM|RTY|CL|GC|SI|ZB|ZN|ZF|ZT|HG|NG|6E|6J|6B|6A|6C|ZC|ZS|ZW|ZL|ZM|HE|LE|NKD|EMD|MGC|SIL|MCL)/i;
const FUTURES_TICK_MAP = {
  MES:{tick:0.25,val:1.25}, MESH:{tick:0.25,val:1.25}, ES:{tick:0.25,val:12.50}, ESH:{tick:0.25,val:12.50},
  MNQ:{tick:0.25,val:0.50}, MNQH:{tick:0.25,val:0.50}, NQ:{tick:0.25,val:5.00}, NQH:{tick:0.25,val:5.00},
  MYM:{tick:1,val:0.50}, MYMH:{tick:1,val:0.50}, YM:{tick:1,val:5.00}, YMH:{tick:1,val:5.00},
  M2K:{tick:0.10,val:0.50}, M2KH:{tick:0.10,val:0.50}, RTY:{tick:0.10,val:5.00}, RTYH:{tick:0.10,val:5.00},
  CL:{tick:0.01,val:10.00}, MCL:{tick:0.01,val:1.00},
  GC:{tick:0.10,val:10.00}, MGC:{tick:0.10,val:1.00},
  SI:{tick:0.005,val:25.00}, SIL:{tick:0.005,val:2.50},
  NKD:{tick:5,val:2.50},
};

function detectAssetTypeFromSymbol(symbol, name) {
  if (!symbol) return "Stock";
  const s = symbol.toUpperCase();
  if (FUTURES_SYMBOLS.test(s)) return "Futures";
  // Options: symbols often contain dates/strikes like AAPL250221C00150000 or have Call/Put in name
  if (/\d{6}[CP]\d+/.test(s) || /\b(call|put)\b/i.test(name || "")) return "Options";
  return "Stock";
}

function getFuturesBaseSymbol(symbol) {
  const s = symbol.toUpperCase();
  // Match base + optional month code (1 letter) + year code (1-2 digits), e.g. MESH6, M2KH6, ESH26
  const match = s.match(/^(MES|MNQ|MYM|M2K|ES|NQ|YM|RTY|CL|GC|SI|ZB|ZN|ZF|ZT|HG|NG|MCL|MGC|SIL|NKD)[FGHJKMNQUVXZ]?\d{0,2}$/);
  if (match) return match[1];
  return s.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, "");
}

function cleanPrice(val) {
  if (!val) return "";
  return String(val).replace(/^@/, "").replace(/[,$]/g, "").trim();
}

// ── Smart trade pairing engine ──
function pairTrades(fills, targetAccount) {
  // Group fills by symbol
  const bySymbol = {};
  fills.forEach(f => {
    const sym = f.ticker;
    if (!bySymbol[sym]) bySymbol[sym] = [];
    bySymbol[sym].push(f);
  });

  const pairedTrades = [];
  const openTrades = [];

  Object.entries(bySymbol).forEach(([symbol, symbolFills]) => {
    // Sort chronologically by filled time
    symbolFills.sort((a, b) => new Date(a.filledTime || a.date) - new Date(b.filledTime || b.date));

    const assetType = symbolFills[0].assetType;
    const isFutures = assetType === "Futures";
    const baseSym = isFutures ? getFuturesBaseSymbol(symbol) : symbol;
    const tickInfo = isFutures ? (FUTURES_TICK_MAP[baseSym] || FUTURES_TICK_MAP[symbol.toUpperCase().replace(/[FGHJKMNQUVXZ]\d{1,2}$/, "")] || null) : null;

    // FIFO matching: maintain a queue of open fills
    const openQueue = []; // { side, qty, price, date, time }

    symbolFills.forEach(fill => {
      const fillSide = fill.direction; // "Long" (buy) or "Short" (sell)
      const fillQty = parseFloat(fill.quantity) || 0;
      const fillPrice = parseFloat(fill.entryPrice) || 0;
      if (fillQty <= 0 || fillPrice <= 0) return;

      // Check if this fill closes any open position (opposite side)
      let remaining = fillQty;

      while (remaining > 0 && openQueue.length > 0) {
        const head = openQueue[0];
        // Only match opposite sides
        if (head.side === fillSide) break;

        const matchQty = Math.min(remaining, head.qty);

        // Determine entry and exit
        const isEntryBuy = head.side === "Long";
        const entryPrice = head.price;
        const exitPrice = fillPrice;
        const entryDate = head.date;
        const exitDate = fill.date;
        const entryTime = head.time;
        const exitTime = fill.time;
        const direction = head.side;

        // Calculate P&L
        let pnl;
        if (isFutures && tickInfo) {
          const ticks = isEntryBuy ? (exitPrice - entryPrice) / tickInfo.tick : (entryPrice - exitPrice) / tickInfo.tick;
          pnl = Math.round(ticks * tickInfo.val * matchQty * 100) / 100;
        } else {
          pnl = isEntryBuy
            ? Math.round((exitPrice - entryPrice) * matchQty * 100) / 100
            : Math.round((entryPrice - exitPrice) * matchQty * 100) / 100;
        }

        pairedTrades.push({
          id: Date.now() + Math.random(),
          date: entryDate,
          ticker: isFutures ? baseSym : symbol,
          assetType,
          direction,
          status: "Closed",
          entryPrice: String(entryPrice),
          exitPrice: String(exitPrice),
          quantity: String(matchQty),
          fees: "0",
          pnl,
          stopLoss: "", takeProfit: "", grade: "",
          notes: isFutures ? `${symbol} | Paired from broker CSV` : "Paired from broker CSV",
          account: targetAccount || "",
          timeframe: "", tradeStrategy: "", strategy: "Day Trade", playbook: "",
          entryTime, exitTime,
          optionsStrategyType: "Single Leg",
          legs: [{ id: Date.now(), action: "Buy", type: "Call", strike: "", contracts: "1", entryPremium: "", exitPremium: "", expiration: "", rolls: [] }],
          emotions: [], screenshots: [],
          futuresContract: isFutures ? symbol : "", tickSize: tickInfo ? String(tickInfo.tick) : "", tickValue: tickInfo ? String(tickInfo.val) : "",
        });

        remaining -= matchQty;
        head.qty -= matchQty;
        if (head.qty <= 0) openQueue.shift();
      }

      // If there's remaining quantity, it becomes an open position
      if (remaining > 0) {
        openQueue.push({
          side: fillSide,
          qty: remaining,
          price: fillPrice,
          date: fill.date,
          time: fill.time || "",
        });
      }
    });

    // Remaining in queue are open positions
    openQueue.forEach(pos => {
      openTrades.push({
        id: Date.now() + Math.random(),
        date: pos.date,
        ticker: isFutures ? baseSym : symbol,
        assetType,
        direction: pos.side,
        status: "Open",
        entryPrice: String(pos.price),
        exitPrice: "",
        quantity: String(pos.qty),
        fees: "0",
        pnl: null,
        stopLoss: "", takeProfit: "", grade: "",
        notes: isFutures ? `${symbol} | Open position from broker CSV` : "Open position from broker CSV",
        account: targetAccount || "",
        timeframe: "", tradeStrategy: "", strategy: "Day Trade", playbook: "",
        entryTime: pos.time || "", exitTime: "",
        optionsStrategyType: "Single Leg",
        legs: [{ id: Date.now(), action: "Buy", type: "Call", strike: "", contracts: "1", entryPremium: "", exitPremium: "", expiration: "", rolls: [] }],
        emotions: [], screenshots: [],
        futuresContract: isFutures ? symbol : "", tickSize: "", tickValue: "",
      });
    });
  });

  // Sort all by date descending
  pairedTrades.sort((a, b) => new Date(b.date) - new Date(a.date));
  openTrades.sort((a, b) => new Date(b.date) - new Date(a.date));

  return { paired: pairedTrades, open: openTrades, all: [...pairedTrades, ...openTrades] };
}

// Detect if CSV is order-based (individual fills) vs trade-based (round trips)
function detectCSVFormat(headers, rows) {
  const h = headers.map(x => x.toLowerCase().trim());
  const hasSide = h.some(x => ["side","action","buy/sell","direction","trans code"].includes(x));
  const hasEntryAndExit = h.some(x => x.includes("entry")) && h.some(x => x.includes("exit") || x.includes("close"));
  const hasStatus = h.some(x => ["status","state","order status"].includes(x));

  // If has Side column + Status column + no separate entry/exit → order-based (Webull, IBKR, Schwab)
  if (hasSide && !hasEntryAndExit) return "order-based";
  // If has both entry and exit columns → trade-based (TradePulse export, ThinkOrSwim)
  if (hasEntryAndExit) return "trade-based";
  // Default: if has side, assume order-based
  if (hasSide) return "order-based";
  return "trade-based";
}

function detectColumnMapping(headers) {
  const mapping = {};
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
  
  Object.entries(BROKER_COLUMN_ALIASES).forEach(([field, aliases]) => {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (aliases.includes(normalizedHeaders[i])) {
        mapping[field] = i;
        break;
      }
    }
  });
  return mapping;
}

function parseDirection(val) {
  if (!val) return "Long";
  const v = val.toLowerCase().trim();
  if (["buy","long","bought","buy to open","buy to close","bot"].includes(v)) return "Long";
  if (["sell","short","sold","sell to open","sell to close","sld","sell short"].includes(v)) return "Short";
  return "Long";
}

function parseAssetType(val) {
  if (!val) return "Stock";
  const v = val.toLowerCase().trim();
  if (["options","option","opt","call","put"].includes(v)) return "Options";
  if (["futures","future","fut"].includes(v)) return "Futures";
  return "Stock";
}

function parseDate(val) {
  if (!val) return new Date().toISOString().split("T")[0];
  // Try common formats
  const v = val.trim();
  // MM/DD/YYYY or M/D/YYYY
  const usFormat = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (usFormat) {
    const y = usFormat[3].length === 2 ? "20" + usFormat[3] : usFormat[3];
    return `${y}-${usFormat[1].padStart(2,"0")}-${usFormat[2].padStart(2,"0")}`;
  }
  // YYYY-MM-DD already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.substring(0, 10);
  // Try Date.parse fallback
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return new Date().toISOString().split("T")[0];
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) { result.push(current.trim()); current = ""; }
    else current += c;
  }
  result.push(current.trim());
  return result;
}

function ImportExportManager({ user, trades, onSaveTrades, customFields, accountBalances }) {
  const [mode, setMode] = useState(null); // null | import | export | broker
  const [step, setStep] = useState(1);
  const [csvData, setCsvData] = useState(null); // { headers:[], rows:[][] }
  const [columnMapping, setColumnMapping] = useState({});
  const [targetAccount, setTargetAccount] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [exportAccount, setExportAccount] = useState("All");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [csvFormat, setCsvFormat] = useState("trade-based"); // trade-based | order-based
  const [pairStats, setPairStats] = useState(null);

  // ── SnapTrade Broker Sync state ──
  const [snapStatus, setSnapStatus] = useState(null); // null | 'loading' | 'registered' | 'error'
  const [snapConnections, setSnapConnections] = useState([]);
  const [snapAccounts, setSnapAccounts] = useState([]);
  const [snapError, setSnapError] = useState("");
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapImportAccount, setSnapImportAccount] = useState("");
  const [snapStartDate, setSnapStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [snapEndDate, setSnapEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [snapOrders, setSnapOrders] = useState([]);
  const [snapImporting, setSnapImporting] = useState(false);

  const accounts = [...new Set([
    ...Object.keys(accountBalances || {}),
    ...(customFields?.accounts || []),
    ...trades.filter(t => t.account).map(t => t.account)
  ])];

  // ── EXPORT ──
  const handleExport = () => {
    const exportTrades = exportAccount === "All" ? trades : trades.filter(t => t.account === exportAccount);
    if (exportTrades.length === 0) return;

    const headerRow = TRADEPULSE_HEADERS.join(",");
    const dataRows = exportTrades.map(t => {
      return EXPORT_FIELDS.map(f => {
        let val = t[f];
        if (f === "emotions") val = (t.emotions || []).join("; ");
        if (f === "pnl" && val === null) val = "";
        if (val === null || val === undefined) val = "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",");
    });

    const csv = [headerRow, ...dataRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tradepulse-${exportAccount === "All" ? "all" : exportAccount.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── IMPORT: Parse CSV ──
  const handleFileUpload = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;
      const headers = parseCSVLine(lines[0]);
      const rows = lines.slice(1).map(l => parseCSVLine(l)).filter(r => r.some(c => c));
      setCsvData({ headers, rows });
      const autoMapping = detectColumnMapping(headers);
      setColumnMapping(autoMapping);
      const format = detectCSVFormat(headers, rows);
      setCsvFormat(format);
      setStep(2);
    };
    reader.readAsText(file);
  };

  // ── IMPORT: Parse Webull PDF Statement ──
  const handlePDFUpload = async (file) => {
    if (!file) return;
    setFileName(file.name);
    try {
      // Load pdf.js from CDN if not already loaded
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
            resolve();
          };
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // Build text preserving line breaks: insert newline when y-position changes
        let lastY = null;
        let pageText = "";
        for (const item of content.items) {
          const y = item.transform ? item.transform[5] : null;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
            pageText += "\n";
          }
          pageText += item.str;
          lastY = y;
        }
        fullText += pageText + "\n";
      }

      // Parse Webull securities trading activity
      const orders = parseWebullPDF(fullText);
      if (orders.length === 0) {
        alert("No trades found in this PDF. Make sure it's a Webull statement with Securities Trading Activity.");
        return;
      }

      // Group buys/sells by ticker+date into complete trades
      const grouped = groupWebullTrades(orders);
      setImportPreview(grouped);
      setCsvData(null);
      setCsvFormat("pdf");
      setStep(3);
    } catch (err) {
      console.error("PDF parse error:", err);
      alert("Error reading PDF: " + err.message);
    }
  };

  const parseWebullPDF = (text) => {
    const orders = [];
    const allLines = text.split("\n").map(l => l.trim()).filter(l => l);

    // Find "SECURITIES TRADING ACTIVITY" section boundaries
    let startIdx = -1, endIdx = allLines.length;
    for (let i = 0; i < allLines.length; i++) {
      if (allLines[i].includes("SECURITIES TRADING ACTIVITY")) startIdx = i;
      if (startIdx > -1 && i > startIdx && allLines[i].startsWith("OPEN POSITIONS")) { endIdx = i; break; }
    }
    if (startIdx === -1) return orders;

    const lines = allLines.slice(startIdx, endIdx);

    // Option: full trade on one line
    // e.g. "LOW 260220P00220000 - 01/02/2026 01/05/2026 B 1.00 1.95 -195.00 0.00 -0.05 -195.05 A N N"
    const optionLineRe = /^([A-Z]{1,5})\s+(\d{6}[CP]\d+)\s+-\s+(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(B|S|BTC|BTO|STO|STC)\s+(-?[\d,.]+)\s+([\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)/;

    // Stock symbol line: just "SMCI - 86800U302"
    const stockSymRe = /^([A-Z]{1,5})\s+-\s+[A-Z0-9]+$/;

    // Data line starting with date: "01/02/2026 01/05/2026 B 5.00 29.90 -149.50 0.00 0.00 -149.50 ..."
    const dataLineRe = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(B|S|BTC|BTO|STO|STC)\s+(-?[\d,.]+)\s+([\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)/;

    const clean = (v) => parseFloat(v.replace(/,/g, ""));

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Try option match (full trade on one line)
      const optM = optionLineRe.exec(line);
      if (optM) {
        const [, symbol, optCode, tradeDate, action, qty, price, gross, comm, fee, net] = optM;
        const [mm, dd, yyyy] = tradeDate.split("/");
        orders.push({
          symbol,
          optionSymbol: `${symbol} ${optCode}`,
          isOption: true,
          date: `${yyyy}-${mm}-${dd}`,
          action: ["B","BTO","BTC"].includes(action) ? "Buy" : "Sell",
          rawAction: action,
          quantity: Math.abs(clean(qty)),
          price: clean(price),
          fees: Math.abs(clean(comm)) + Math.abs(clean(fee)),
          netAmount: clean(net),
          gross: clean(gross),
        });
        i++;
        continue;
      }

      // Try stock symbol match
      const stockM = stockSymRe.exec(line);
      if (stockM) {
        const symbol = stockM[1];
        // Next 1-3 lines: company name, then data line (or data on same line as company name)
        let found = false;
        for (let j = 1; j <= 3 && (i + j) < lines.length; j++) {
          const dataM = dataLineRe.exec(lines[i + j]);
          if (dataM) {
            const [, tradeDate, action, qty, price, gross, comm, fee, net] = dataM;
            const [mm, dd, yyyy] = tradeDate.split("/");
            orders.push({
              symbol,
              optionSymbol: null,
              isOption: false,
              date: `${yyyy}-${mm}-${dd}`,
              action: ["B","BTO","BTC"].includes(action) ? "Buy" : "Sell",
              rawAction: action,
              quantity: Math.abs(clean(qty)),
              price: clean(price),
              fees: Math.abs(clean(comm)) + Math.abs(clean(fee)),
              netAmount: clean(net),
              gross: clean(gross),
            });
            i = i + j + 1;
            found = true;
            break;
          }
        }
        if (!found) i++;
        continue;
      }

      i++;
    }
    return orders;
  };

  const groupWebullTrades = (orders) => {
    // Group by full symbol (option symbol or stock ticker) + date
    const groups = {};
    orders.forEach(o => {
      const groupSymbol = o.optionSymbol || o.symbol;
      const key = `${groupSymbol}|${o.date}`;
      if (!groups[key]) groups[key] = { symbol: o.symbol, optionSymbol: o.optionSymbol, isOption: o.isOption, date: o.date, buys: [], sells: [] };
      if (o.action === "Buy") groups[key].buys.push(o);
      else groups[key].sells.push(o);
    });

    const trades = [];
    Object.values(groups).forEach(g => {
      const totalBuyQty = g.buys.reduce((s, b) => s + b.quantity, 0);
      const totalBuyValue = g.buys.reduce((s, b) => s + (b.quantity * b.price), 0);
      const totalBuyFees = g.buys.reduce((s, b) => s + b.fees, 0);
      const avgBuyPrice = totalBuyQty > 0 ? totalBuyValue / totalBuyQty : 0;

      const totalSellQty = g.sells.reduce((s, b) => s + b.quantity, 0);
      const totalSellValue = g.sells.reduce((s, b) => s + (b.quantity * b.price), 0);
      const totalSellFees = g.sells.reduce((s, b) => s + b.fees, 0);
      const avgSellPrice = totalSellQty > 0 ? totalSellValue / totalSellQty : 0;

      const totalFees = totalBuyFees + totalSellFees;
      const qty = Math.min(totalBuyQty, totalSellQty);
      const isClosed = totalBuyQty > 0 && totalSellQty > 0;

      if (qty > 0) {
        // Determine direction from raw actions if available
        const firstBuyAction = g.buys[0]?.rawAction || "B";
        const firstSellAction = g.sells[0]?.rawAction || "S";
        // BTO/B = opening long, STO = opening short
        // If first action is STO/S and second is BTC/B, it's a short (credit) trade
        const allOrders = [...g.buys, ...g.sells].sort((a, b) => a.date < b.date ? -1 : 1);
        const firstAction = allOrders[0]?.rawAction || "B";
        const direction = ["STO", "S"].includes(firstAction) ? "Short" : "Long";

        const entryPrice = direction === "Long" ? avgBuyPrice : avgSellPrice;
        const exitPrice = direction === "Long" ? avgSellPrice : avgBuyPrice;

        // Options: P&L uses net amounts directly (already accounts for multiplier)
        // Stocks: simple price × qty
        const multiplier = g.isOption ? 100 : 1;
        const pnl = direction === "Long"
          ? (exitPrice - entryPrice) * qty * multiplier - totalFees
          : (entryPrice - exitPrice) * qty * multiplier - totalFees;

        const assetType = g.isOption ? "Options" : "Stock";
        const displayTicker = g.isOption ? g.symbol : g.symbol;
        const noteDetail = g.optionSymbol ? ` (${g.optionSymbol})` : "";

        trades.push({
          id: Date.now() + Math.random(),
          date: g.date,
          ticker: displayTicker,
          assetType,
          direction,
          status: isClosed ? "Closed" : "Open",
          entryPrice: entryPrice.toFixed(4),
          exitPrice: isClosed ? exitPrice.toFixed(4) : "",
          quantity: String(qty),
          fees: totalFees.toFixed(2),
          pnl: isClosed ? parseFloat(pnl.toFixed(2)) : null,
          notes: `Webull PDF${noteDetail}: ${g.buys.length} buy${g.buys.length !== 1 ? "s" : ""}, ${g.sells.length} sell${g.sells.length !== 1 ? "s" : ""}`,
          strategy: assetType === "Options" ? "Options" : "Day Trade",
          timeframe: "Day Trade",
          account: targetAccount || "",
          tradeStrategy: "",
          playbook: "",
          emotions: [],
          optionsStrategyType: "",
          legs: [],
        });
      }
    });

    return trades.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  // ── IMPORT: Build preview ──
  const buildPreview = () => {
    if (!csvData) return;

    if (csvFormat === "order-based") {
      // Smart pairing mode: extract fills, filter, pair
      const get = (row, field) => columnMapping[field] !== undefined ? row[columnMapping[field]] || "" : "";

      const statusCol = columnMapping.status;
      const fills = csvData.rows
        .filter(row => {
          if (statusCol !== undefined) {
            const st = (row[statusCol] || "").toLowerCase().trim();
            if (["cancelled","canceled","failed","rejected","expired","pending"].includes(st)) return false;
          }
          return true;
        })
        .map(row => {
          const symbol = (get(row, "ticker") || "").toUpperCase().replace(/\r/g, "").trim();
          const name = get(row, "name") || "";
          if (!symbol) return null;
          const side = get(row, "direction");
          const price = cleanPrice(get(row, "entryPrice"));
          const qty = cleanPrice(get(row, "quantity"));
          const dateRaw = get(row, "date");
          const assetType = detectAssetTypeFromSymbol(symbol, name);

          // Parse datetime
          const dateParsed = parseDate(dateRaw);
          let time = "";
          const timeMatch = dateRaw.match(/(\d{1,2}:\d{2}(:\d{2})?)\s*(AM|PM|EST|CST|PST|MST|EDT|CDT|PDT|MDT)?/i);
          if (timeMatch) time = timeMatch[1];

          return {
            ticker: symbol,
            direction: parseDirection(side),
            entryPrice: price,
            quantity: qty,
            date: dateParsed,
            time,
            filledTime: dateRaw,
            assetType,
            name,
          };
        })
        .filter(f => f && f.ticker && parseFloat(f.entryPrice) > 0 && parseFloat(f.quantity) > 0);

      const result = pairTrades(fills, targetAccount);
      setImportPreview(result.all);
      setPairStats({ total: fills.length, paired: result.paired.length, open: result.open.length, filtered: csvData.rows.length - fills.length });
      setStep(3);
    } else {
      // Traditional mode: each row is a trade
      const mapped = csvData.rows.map((row, idx) => {
        const get = (field) => columnMapping[field] !== undefined ? row[columnMapping[field]] || "" : "";
        const pnlVal = get("pnl");
        const parsedPnl = pnlVal ? parseFloat(pnlVal.replace(/[$,()]/g, (m) => m === "(" ? "-" : m === ")" ? "" : "")) : null;

        return {
          id: Date.now() + idx + Math.random(),
          date: parseDate(get("date")),
          ticker: (get("ticker") || "").toUpperCase().replace(/[^A-Z0-9./]/g, "").substring(0, 10),
          assetType: parseAssetType(get("assetType")),
          direction: parseDirection(get("direction")),
          status: parsedPnl !== null ? "Closed" : "Open",
          entryPrice: cleanPrice(get("entryPrice")),
          exitPrice: cleanPrice(get("exitPrice")),
          quantity: get("quantity").replace(/[^0-9.-]/g, "") || "",
          fees: get("fees").replace(/[$,]/g, "") || "0",
          pnl: parsedPnl,
          stopLoss: get("stopLoss").replace(/[$,]/g, "") || "",
          takeProfit: get("takeProfit").replace(/[$,]/g, "") || "",
          grade: get("grade") || "",
          notes: get("notes") || "",
          account: targetAccount || "",
          timeframe: "",
          tradeStrategy: get("strategy") || "",
          strategy: "Day Trade",
          playbook: "",
          entryTime: get("entryTime") || "",
          exitTime: get("exitTime") || "",
          optionsStrategyType: get("optionsStrategyType") || "Single Leg",
          legs: [{ id: Date.now(), action: "Buy", type: "Call", strike: "", contracts: "1", entryPremium: "", exitPremium: "", expiration: "", rolls: [] }],
          emotions: [],
          screenshots: [],
          futuresContract: "", tickSize: "", tickValue: "",
        };
      }).filter(t => t.ticker);
      setImportPreview(mapped);
      setPairStats(null);
      setStep(3);
    }
  };

  // ── IMPORT: Execute ──
  const executeImport = () => {
    if (importPreview.length === 0) return;
    // For trades without P&L, try to calculate it
    const finalTrades = importPreview.map(t => {
      if (t.pnl === null && t.entryPrice && t.exitPrice && t.quantity) {
        const computed = calcPnL(t);
        return { ...t, pnl: computed, status: computed !== null ? "Closed" : t.status };
      }
      return t;
    });
    onSaveTrades(prev => [...finalTrades, ...prev]);
    setImportResult({ count: finalTrades.length, account: targetAccount });
    setStep(4);
  };

  const reset = () => { setMode(null); setStep(1); setCsvData(null); setColumnMapping({}); setTargetAccount(""); setImportPreview([]); setImportResult(null); setFileName(""); setCsvFormat("trade-based"); setPairStats(null); };
  const mappableFields = [
    { key:"date", label:"Date", required:true },
    { key:"ticker", label:"Ticker", required:true },
    { key:"direction", label:"Direction" },
    { key:"entryPrice", label:"Entry Price" },
    { key:"exitPrice", label:"Exit Price" },
    { key:"quantity", label:"Quantity" },
    { key:"fees", label:"Fees" },
    { key:"pnl", label:"P&L" },
    { key:"assetType", label:"Asset Type" },
    { key:"stopLoss", label:"Stop Loss" },
    { key:"takeProfit", label:"Take Profit" },
    { key:"notes", label:"Notes" },
    { key:"strategy", label:"Strategy" },
    { key:"entryTime", label:"Entry Time" },
    { key:"exitTime", label:"Exit Time" },
    { key:"grade", label:"Grade" },
  ];

  // ── SnapTrade API helpers ──
  const snapFetch = async (actionName, extra = {}) => {
    const res = await fetch("/api/snaptrade", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": user?.id || "" },
      body: JSON.stringify({ action: actionName, ...extra }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "SnapTrade request failed");
    return data;
  };

  const snapRegisterAndLoad = async () => {
    setSnapLoading(true); setSnapError("");
    try {
      await snapFetch("register");
      const acctData = await snapFetch("accounts");
      setSnapConnections(acctData.connections || []);
      setSnapAccounts(acctData.accounts || []);
      setSnapStatus("registered");
    } catch (e) {
      setSnapError(e.message); setSnapStatus("error");
    }
    setSnapLoading(false);
  };

  const snapConnect = async (broker) => {
    setSnapLoading(true); setSnapError("");
    try {
      const data = await snapFetch("connect", {
        broker: broker || undefined,
        customRedirect: window.location.href,
      });
      if (data.redirectURI) window.open(data.redirectURI, "_blank", "width=600,height=700");
    } catch (e) { setSnapError(e.message); }
    setSnapLoading(false);
  };

  const snapRefreshAccounts = async () => {
    setSnapLoading(true); setSnapError("");
    try {
      const acctData = await snapFetch("accounts");
      setSnapConnections(acctData.connections || []);
      setSnapAccounts(acctData.accounts || []);
    } catch (e) { setSnapError(e.message); }
    setSnapLoading(false);
  };

  const snapDisconnect = async (connectionId) => {
    if (!confirm("Remove this broker connection? You can reconnect later.")) return;
    setSnapLoading(true);
    try {
      await snapFetch("disconnect", { connectionId });
      await snapRefreshAccounts();
    } catch (e) { setSnapError(e.message); }
    setSnapLoading(false);
  };

  const snapImportTrades = async () => {
    if (!snapImportAccount) { setSnapError("Select an account to import from"); return; }
    setSnapImporting(true); setSnapError(""); setSnapOrders([]);
    try {
      const data = await snapFetch("import", { accountId: snapImportAccount, startDate: snapStartDate, endDate: snapEndDate });
      setSnapOrders(data.orders || []);
      if ((data.orders || []).length === 0) setSnapError("No buy/sell transactions found for this date range. Try expanding the dates.");
    } catch (e) { setSnapError(e.message); }
    setSnapImporting(false);
  };

  const snapConfirmImport = () => {
    // Pair orders into trades
    const groups = {};
    snapOrders.forEach(o => {
      const sym = o.isOption ? (o.optionDetail?.optionSymbol || o.symbol) : o.symbol;
      const key = `${sym}|${o.date}`;
      if (!groups[key]) groups[key] = { symbol: o.symbol, isOption: o.isOption, optionDetail: o.optionDetail, date: o.date, buys: [], sells: [] };
      if (o.action === "Buy") groups[key].buys.push(o);
      else groups[key].sells.push(o);
    });
    const paired = [];
    Object.values(groups).forEach(g => {
      const tBuyQty = g.buys.reduce((s, b) => s + b.quantity, 0);
      const tBuyVal = g.buys.reduce((s, b) => s + b.quantity * b.price, 0);
      const tBuyFees = g.buys.reduce((s, b) => s + b.fee, 0);
      const avgBuy = tBuyQty > 0 ? tBuyVal / tBuyQty : 0;
      const tSellQty = g.sells.reduce((s, b) => s + b.quantity, 0);
      const tSellVal = g.sells.reduce((s, b) => s + b.quantity * b.price, 0);
      const tSellFees = g.sells.reduce((s, b) => s + b.fee, 0);
      const avgSell = tSellQty > 0 ? tSellVal / tSellQty : 0;
      const fees = tBuyFees + tSellFees;
      const qty = Math.min(tBuyQty, tSellQty);
      if (qty <= 0 && tBuyQty <= 0 && tSellQty <= 0) return;
      const effectiveQty = qty > 0 ? qty : Math.max(tBuyQty, tSellQty);
      const isClosed = tBuyQty > 0 && tSellQty > 0;
      const allOrd = [...g.buys, ...g.sells].sort((a, b) => a.date < b.date ? -1 : 1);
      const dir = allOrd[0]?.action === "Sell" ? "Short" : "Long";
      const entry = dir === "Long" ? avgBuy : avgSell;
      const exit = dir === "Long" ? avgSell : avgBuy;
      const mult = g.isOption ? 100 : 1;
      const pnl = isClosed ? (dir === "Long" ? exit - entry : entry - exit) * qty * mult - fees : null;
      paired.push({
        id: Date.now() + Math.random(), date: g.date, ticker: g.symbol,
        assetType: g.isOption ? "Options" : "Stock", direction: dir,
        status: isClosed ? "Closed" : "Open",
        entryPrice: entry.toFixed(4), exitPrice: isClosed ? exit.toFixed(4) : "",
        quantity: String(effectiveQty), fees: fees.toFixed(2),
        pnl: pnl !== null ? parseFloat(pnl.toFixed(2)) : null,
        notes: `Broker sync: ${g.buys.length} buy, ${g.sells.length} sell${g.isOption && g.optionDetail ? ` (${g.optionDetail.optionType} ${g.optionDetail.strikePrice})` : ""}`,
        strategy: g.isOption ? "Options" : "", timeframe: "", account: targetAccount || "",
        tradeStrategy: "", playbook: "", emotions: [], optionsStrategyType: "", legs: [],
      });
    });
    if (paired.length === 0) { setSnapError("No trades to import after pairing"); return; }

    // Duplicate detection: match on ticker + date + direction + quantity
    const isDuplicate = (newTrade) => {
      return trades.some(existing =>
        existing.ticker === newTrade.ticker &&
        existing.date === newTrade.date &&
        existing.direction === newTrade.direction &&
        String(existing.quantity) === String(newTrade.quantity)
      );
    };

    const unique = paired.filter(t => !isDuplicate(t));
    const dupeCount = paired.length - unique.length;

    if (unique.length === 0) {
      setSnapError(`All ${paired.length} trades already exist in your journal (matched by ticker + date + direction + quantity). Nothing to import.`);
      return;
    }

    onSaveTrades(prev => [...unique.sort((a, b) => new Date(b.date) - new Date(a.date)), ...prev]);
    setSnapOrders([]);
    setMode(null);
    alert(`Imported ${unique.length} trades from broker sync!${dupeCount > 0 ? ` Skipped ${dupeCount} duplicate${dupeCount !== 1 ? "s" : ""} already in your journal.` : ""}`);
  };

  return (
    <div>
      <div style={{ fontSize:18, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Import / Export</div>
      <div style={{ fontSize:13, color:"var(--tp-faint)", marginBottom:20 }}>Import trade history from brokers or export your data as CSV</div>

      {/* Mode selection */}
      {!mode && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
          <div onClick={()=>{setMode("broker"); if(snapStatus!=="registered") snapRegisterAndLoad();}} style={{ background:"var(--tp-panel)", border:"1px solid rgba(168,85,247,0.15)", borderRadius:14, padding:"32px 24px", cursor:"pointer", textAlign:"center", transition:"border-color 0.2s" }} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(168,85,247,0.4)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(168,85,247,0.15)"}>
            <Zap size={36} color="#a855f7" style={{ margin:"0 auto 14px", display:"block" }}/>
            <div style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)", marginBottom:6 }}>Broker Sync</div>
            <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.5 }}>Connect directly to your brokerage account. Automatically pull trade history — no files needed.</div>
            <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:10 }}>Schwab, Webull, Fidelity, IBKR, Robinhood + more</div>
          </div>
          <div onClick={()=>setMode("import")} style={{ background:"var(--tp-panel)", border:"1px solid rgba(74,222,128,0.15)", borderRadius:14, padding:"32px 24px", cursor:"pointer", textAlign:"center", transition:"border-color 0.2s" }} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(74,222,128,0.4)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(74,222,128,0.15)"}>
            <Upload size={36} color="#4ade80" style={{ margin:"0 auto 14px", display:"block" }}/>
            <div style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)", marginBottom:6 }}>Import Trades</div>
            <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.5 }}>Upload a CSV or broker PDF statement. Smart auto-pairing matches buys with sells.</div>
            <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:10 }}>CSV (Webull, Schwab, TD, IBKR, Fidelity) + Webull PDF</div>
          </div>
          <div onClick={()=>setMode("export")} style={{ background:"var(--tp-panel)", border:"1px solid rgba(96,165,250,0.15)", borderRadius:14, padding:"32px 24px", cursor:"pointer", textAlign:"center", transition:"border-color 0.2s" }} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(96,165,250,0.4)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(96,165,250,0.15)"}>
            <Download size={36} color="#60a5fa" style={{ margin:"0 auto 14px", display:"block" }}/>
            <div style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)", marginBottom:6 }}>Export Trades</div>
            <div style={{ fontSize:12, color:"var(--tp-muted)", lineHeight:1.5 }}>Download all your trades as a CSV file. Filter by account or export everything.</div>
            <div style={{ fontSize:10, color:"var(--tp-faintest)", marginTop:10 }}>{trades.length} total trades available</div>
          </div>
        </div>
      )}

      {/* ═══ BROKER SYNC ═══ */}
      {mode === "broker" && (
        <div style={{ background:"var(--tp-panel)", border:"1px solid rgba(168,85,247,0.12)", borderRadius:14, padding:"24px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Zap size={18} color="#a855f7"/>
              <span style={{ fontSize:15, fontWeight:600, color:"var(--tp-text)" }}>Broker Sync</span>
            </div>
            <button onClick={()=>{setMode(null); setSnapOrders([]); setSnapError("");}} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:12 }}>Back</button>
          </div>

          {snapError && (
            <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#f87171" }}>{snapError}</div>
          )}

          {snapLoading && !snapImporting && (
            <div style={{ textAlign:"center", padding:"30px 0" }}>
              <div style={{ width:32, height:32, border:"3px solid rgba(255,255,255,0.08)", borderTopColor:"#a855f7", borderRadius:"50%", animation:"spin 1s linear infinite", margin:"0 auto 12px" }}/>
              <div style={{ fontSize:13, color:"var(--tp-faint)" }}>Connecting to SnapTrade...</div>
            </div>
          )}

          {snapStatus === "registered" && !snapLoading && (<>
            {/* Connected Brokers */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:10 }}>Connected Brokers</div>
              {snapConnections.length === 0 ? (
                <div style={{ fontSize:12, color:"var(--tp-faint)", fontStyle:"italic", marginBottom:12 }}>No brokers connected yet. Click below to connect your first broker.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
                  {snapConnections.map(c => (
                    <div key={c.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"var(--tp-card)", border:"1px solid var(--tp-border-l)", borderRadius:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        {c.logo && <img src={c.logo} alt="" style={{ width:24, height:24, borderRadius:4 }}/>}
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)" }}>{c.brokerage}</div>
                          <div style={{ fontSize:10, color: c.disabled ? "#f87171" : "var(--tp-faintest)" }}>{c.disabled ? "Disconnected — reconnect needed" : "Connected"}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6 }}>
                        {c.disabled && <button onClick={()=>snapConnect(c.brokerageSlug)} style={{ padding:"5px 10px", borderRadius:6, border:"1px solid rgba(168,85,247,0.3)", background:"rgba(168,85,247,0.08)", color:"#a855f7", cursor:"pointer", fontSize:11, fontWeight:600 }}>Reconnect</button>}
                        <button onClick={()=>snapDisconnect(c.id)} style={{ padding:"5px 10px", borderRadius:6, border:"1px solid rgba(239,68,68,0.2)", background:"transparent", color:"#f87171", cursor:"pointer", fontSize:11 }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>snapConnect()} style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#7c3aed,#a855f7)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}><Plus size={14}/> Connect Broker</button>
                {snapConnections.length > 0 && <button onClick={snapRefreshAccounts} style={{ padding:"9px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:12 }}><RefreshCw size={12}/></button>}
              </div>
            </div>

            {/* Import Section — only show if accounts exist */}
            {snapAccounts.length > 0 && (<>
              <div style={{ borderTop:"1px solid var(--tp-border-l)", paddingTop:18, marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:10 }}>Import Trades</div>
              </div>

              {/* Target account */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:11, color:"#a855f7", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Assign to TradePulse Account</label>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {accounts.map(a => (
                    <button key={a} onClick={()=>setTargetAccount(a)} style={{ padding:"6px 12px", borderRadius:6, border:`1px solid ${targetAccount===a?"#a855f7":"var(--tp-border-l)"}`, background:targetAccount===a?"rgba(168,85,247,0.12)":"var(--tp-card)", color:targetAccount===a?"#a855f7":"#8a8f9e", cursor:"pointer", fontSize:11, fontWeight:targetAccount===a?600:400 }}>{a}</button>
                  ))}
                </div>
              </div>

              {/* Broker account picker */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Broker Account</label>
                <select value={snapImportAccount} onChange={e=>setSnapImportAccount(e.target.value)} style={{ padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", cursor:"pointer", minWidth:300 }}>
                  <option value="">Select an account...</option>
                  {snapAccounts.map(a => {
                    const conn = snapConnections.find(c => c.id === a.connectionId);
                    return <option key={a.id} value={a.id}>{conn?.brokerage || "Broker"} — {a.name || a.number} {a.type ? `(${a.type})` : ""}</option>;
                  })}
                </select>
              </div>

              {/* Date range */}
              <div style={{ display:"flex", gap:12, marginBottom:16 }}>
                <div>
                  <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Start Date</label>
                  <input type="date" value={snapStartDate} onChange={e=>setSnapStartDate(e.target.value)} style={{ padding:"8px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none" }}/>
                </div>
                <div>
                  <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>End Date</label>
                  <input type="date" value={snapEndDate} onChange={e=>setSnapEndDate(e.target.value)} style={{ padding:"8px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none" }}/>
                </div>
              </div>

              {/* Fetch button */}
              <button onClick={snapImportTrades} disabled={snapImporting || !snapImportAccount} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 22px", borderRadius:8, border:"none", background: snapImporting ? "rgba(168,85,247,0.3)" : "linear-gradient(135deg,#7c3aed,#a855f7)", color:"#fff", cursor: snapImporting ? "wait" : "pointer", fontSize:13, fontWeight:600, marginBottom:16, opacity: !snapImportAccount ? 0.5 : 1 }}>
                {snapImporting ? <><RefreshCw size={14} className="animate-spin"/> Pulling transactions...</> : <><Download size={14}/> Fetch Trades</>}
              </button>

              {/* Results */}
              {snapOrders.length > 0 && (
                <div style={{ borderTop:"1px solid var(--tp-border-l)", paddingTop:14 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)", marginBottom:8 }}>
                    Found {snapOrders.length} transactions
                  </div>
                  <div style={{ maxHeight:300, overflowY:"auto", border:"1px solid var(--tp-border-l)", borderRadius:8, marginBottom:14 }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                      <thead>
                        <tr style={{ background:"var(--tp-card)", position:"sticky", top:0 }}>
                          <th style={{ padding:"8px 10px", textAlign:"left", color:"var(--tp-faint)", fontWeight:600, borderBottom:"1px solid var(--tp-border-l)" }}>Date</th>
                          <th style={{ padding:"8px 10px", textAlign:"left", color:"var(--tp-faint)", fontWeight:600, borderBottom:"1px solid var(--tp-border-l)" }}>Symbol</th>
                          <th style={{ padding:"8px 10px", textAlign:"left", color:"var(--tp-faint)", fontWeight:600, borderBottom:"1px solid var(--tp-border-l)" }}>Action</th>
                          <th style={{ padding:"8px 10px", textAlign:"right", color:"var(--tp-faint)", fontWeight:600, borderBottom:"1px solid var(--tp-border-l)" }}>Qty</th>
                          <th style={{ padding:"8px 10px", textAlign:"right", color:"var(--tp-faint)", fontWeight:600, borderBottom:"1px solid var(--tp-border-l)" }}>Price</th>
                          <th style={{ padding:"8px 10px", textAlign:"right", color:"var(--tp-faint)", fontWeight:600, borderBottom:"1px solid var(--tp-border-l)" }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapOrders.slice(0, 100).map((o, i) => (
                          <tr key={i} style={{ borderBottom:"1px solid var(--tp-border-l)" }}>
                            <td style={{ padding:"6px 10px", color:"var(--tp-text)" }}>{o.date}</td>
                            <td style={{ padding:"6px 10px", color: o.isOption ? "#a855f7" : "var(--tp-text)", fontWeight:600 }}>{o.symbol}{o.isOption ? " ⚡" : ""}</td>
                            <td style={{ padding:"6px 10px", color: o.action === "Buy" ? "#4ade80" : "#f87171" }}>{o.action}</td>
                            <td style={{ padding:"6px 10px", textAlign:"right", color:"var(--tp-text)" }}>{o.quantity}</td>
                            <td style={{ padding:"6px 10px", textAlign:"right", color:"var(--tp-text)", fontFamily:"'JetBrains Mono', monospace" }}>${o.price?.toFixed(2)}</td>
                            <td style={{ padding:"6px 10px", textAlign:"right", color: o.amount >= 0 ? "#4ade80" : "#f87171", fontFamily:"'JetBrains Mono', monospace" }}>${o.amount?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {snapOrders.length > 100 && <div style={{ padding:"8px 10px", fontSize:11, color:"var(--tp-faint)", textAlign:"center" }}>Showing first 100 of {snapOrders.length} transactions</div>}
                  </div>

                  <div style={{ display:"flex", gap:10 }}>
                    <button onClick={snapConfirmImport} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 22px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#059669,#34d399)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}><Check size={14}/> Import {snapOrders.length} Transactions</button>
                    <button onClick={()=>setSnapOrders([])} style={{ padding:"10px 16px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Cancel</button>
                  </div>
                </div>
              )}
            </>)}
          </>)}

          {snapStatus === "error" && !snapLoading && (
            <div style={{ textAlign:"center", padding:"20px 0" }}>
              <div style={{ fontSize:13, color:"#f87171", marginBottom:12 }}>Failed to connect to SnapTrade</div>
              <button onClick={snapRegisterAndLoad} style={{ padding:"9px 18px", borderRadius:8, border:"1px solid rgba(168,85,247,0.3)", background:"rgba(168,85,247,0.08)", color:"#a855f7", cursor:"pointer", fontSize:13, fontWeight:600 }}>Retry</button>
            </div>
          )}
        </div>
      )}

      {/* ── EXPORT ── */}
      {mode === "export" && (
        <div style={{ background:"var(--tp-panel)", border:"1px solid rgba(96,165,250,0.12)", borderRadius:14, padding:"24px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18 }}>
            <Download size={18} color="#60a5fa"/>
            <span style={{ fontSize:15, fontWeight:600, color:"var(--tp-text)" }}>Export Trades</span>
          </div>
          
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Account Filter</label>
            <select value={exportAccount} onChange={e=>setExportAccount(e.target.value)} style={{ padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", cursor:"pointer", appearance:"none", minWidth:200 }}>
              <option value="All" style={{ background:"var(--tp-sel-bg)" }}>All Accounts ({trades.length} trades)</option>
              {accounts.map(a => { const count = trades.filter(t=>t.account===a).length; return <option key={a} value={a} style={{ background:"var(--tp-sel-bg)" }}>{a} ({count} trades)</option>; })}
            </select>
          </div>

          <div style={{ fontSize:12, color:"var(--tp-faint)", marginBottom:16 }}>
            Will export {exportAccount === "All" ? trades.length : trades.filter(t=>t.account===exportAccount).length} trades with {TRADEPULSE_HEADERS.length} columns
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={handleExport} style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 20px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#3b82f6,#60a5fa)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}><Download size={14}/> Download CSV</button>
            <button onClick={reset} style={{ padding:"9px 16px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Back</button>
          </div>
        </div>
      )}

      {/* ── IMPORT ── */}
      {mode === "import" && (
        <div style={{ background:"var(--tp-panel)", border:"1px solid rgba(74,222,128,0.12)", borderRadius:14, padding:"24px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Upload size={18} color="#4ade80"/>
              <span style={{ fontSize:15, fontWeight:600, color:"var(--tp-text)" }}>Import Trades</span>
            </div>
            {/* Step indicator */}
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              {[{n:1,label:"Upload"},{n:2,label:"Map"},{n:3,label:"Preview"},{n:4,label:"Done"}].map((s,i) => (
                <div key={s.n} style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <div style={{ width:22, height:22, borderRadius:11, background: step >= s.n ? "rgba(74,222,128,0.2)" : "var(--tp-input)", border:`1px solid ${step >= s.n ? "#4ade80" : "var(--tp-border-l)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color: step >= s.n ? "#4ade80" : "#5c6070" }}>{step > s.n ? <Check size={10}/> : s.n}</div>
                  <span style={{ fontSize:10, color: step >= s.n ? "#4ade80" : "#5c6070" }}>{s.label}</span>
                  {i < 3 && <div style={{ width:20, height:1, background: step > s.n ? "#4ade80" : "var(--tp-border-l)", margin:"0 2px" }}/>}
                </div>
              ))}
            </div>
          </div>

          {/* Step 1: Upload + Account Selection */}
          {step === 1 && (
            <div>
              {/* Target account */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:11, color:"#4ade80", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Assign to Account</label>
                <div style={{ fontSize:11, color:"var(--tp-faint)", marginBottom:8 }}>All imported trades will be tagged to this account</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {accounts.map(a => (
                    <button key={a} onClick={()=>setTargetAccount(a)} style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${targetAccount===a?"#4ade80":"var(--tp-border-l)"}`, background:targetAccount===a?"rgba(74,222,128,0.12)":"var(--tp-card)", color:targetAccount===a?"#4ade80":"#8a8f9e", cursor:"pointer", fontSize:12, fontWeight:targetAccount===a?600:400 }}>{a}</button>
                  ))}
                  {accounts.length === 0 && <span style={{ fontSize:12, color:"var(--tp-faint)", fontStyle:"italic" }}>No accounts defined — set them up in Account Balances first, or trades will import without an account tag</span>}
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)}
                onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f?.name?.toLowerCase().endsWith('.pdf'))handlePDFUpload(f);else handleFileUpload(f);}}
                onClick={()=>document.getElementById("csv-upload-input")?.click()}
                style={{
                  border:`2px dashed ${dragOver ? "#4ade80" : "var(--tp-border-l)"}`,
                  borderRadius:12, padding:"36px 20px", textAlign:"center", cursor:"pointer",
                  background: dragOver ? "rgba(74,222,128,0.06)" : "var(--tp-card)", transition:"all 0.2s"
                }}>
                <input id="csv-upload-input" type="file" accept=".csv,.tsv,.txt,.pdf" onChange={e=>{const f=e.target.files[0];if(f?.name?.toLowerCase().endsWith('.pdf'))handlePDFUpload(f);else handleFileUpload(f);}} style={{ display:"none" }}/>
                <FileText size={32} color={dragOver?"#4ade80":"#5c6070"} style={{ margin:"0 auto 12px", display:"block" }}/>
                <div style={{ fontSize:14, color: dragOver ? "#4ade80" : "#8a8f9e", marginBottom:4 }}>Drop CSV or PDF file here or click to upload</div>
                <div style={{ fontSize:11, color:"var(--tp-faintest)" }}>Supports .csv, .tsv, .txt, and .pdf (Webull statements)</div>
              </div>

              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}>
                <button onClick={reset} style={{ padding:"8px 16px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:12 }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 2 && csvData && (
            <div>
              <div style={{ fontSize:12, color:"var(--tp-muted)", marginBottom:8 }}>
                <FileText size={12} style={{ display:"inline", marginRight:4, verticalAlign:"middle" }}/> {fileName} — {csvData.rows.length} rows, {csvData.headers.length} columns
                {targetAccount && <span style={{ color:"#4ade80", marginLeft:8 }}>→ {targetAccount}</span>}
              </div>

              {/* Detected format badge */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <span style={{ fontSize:11, color:"var(--tp-faint)" }}>Detected format:</span>
                <button onClick={()=>setCsvFormat("order-based")} style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${csvFormat==="order-based"?"#4ade80":"var(--tp-border-l)"}`, background:csvFormat==="order-based"?"rgba(74,222,128,0.1)":"transparent", color:csvFormat==="order-based"?"#4ade80":"var(--tp-faint)", cursor:"pointer", fontSize:10, fontWeight:600 }}>Order-Based (auto-pair)</button>
                <button onClick={()=>setCsvFormat("trade-based")} style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${csvFormat==="trade-based"?"#60a5fa":"var(--tp-border-l)"}`, background:csvFormat==="trade-based"?"rgba(96,165,250,0.1)":"transparent", color:csvFormat==="trade-based"?"#60a5fa":"var(--tp-faint)", cursor:"pointer", fontSize:10, fontWeight:600 }}>Trade-Based (1 row = 1 trade)</button>
              </div>

              {csvFormat === "order-based" && (
                <div style={{ fontSize:11, color:"var(--tp-muted)", marginBottom:14, padding:"10px 14px", background:"rgba(74,222,128,0.04)", border:"1px solid rgba(74,222,128,0.1)", borderRadius:8, lineHeight:1.6 }}>
                  <strong style={{ color:"#4ade80" }}>Smart pairing mode:</strong> Each row is a single fill (buy or sell). The importer will automatically match buys with sells (FIFO), calculate P&L, detect futures vs stocks, filter out cancelled orders, and handle partial exits. Unmatched fills become open positions.
                </div>
              )}

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                {mappableFields.map(field => (
                  <div key={field.key} style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:11, color: field.required ? "#f87171" : "#8a8f9e", minWidth:85, fontWeight: field.required ? 600 : 400 }}>{field.label}{field.required && " *"}</span>
                    <select value={columnMapping[field.key] !== undefined ? columnMapping[field.key] : ""} onChange={e => setColumnMapping(p => ({ ...p, [field.key]: e.target.value === "" ? undefined : parseInt(e.target.value) }))} style={{ flex:1, padding:"7px 10px", background: columnMapping[field.key] !== undefined ? "rgba(74,222,128,0.06)" : "var(--tp-input)", border:`1px solid ${columnMapping[field.key] !== undefined ? "rgba(74,222,128,0.2)" : "var(--tp-border-l)"}`, borderRadius:6, color:"var(--tp-text)", fontSize:11, outline:"none", cursor:"pointer", appearance:"none" }}>
                      <option value="" style={{ background:"var(--tp-sel-bg)", color:"var(--tp-faint)" }}>— Skip —</option>
                      {csvData.headers.map((h, i) => <option key={i} value={i} style={{ background:"var(--tp-sel-bg)", color:"var(--tp-text)" }}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* CSV preview */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6 }}>CSV Preview (first 3 rows)</div>
                <div style={{ overflowX:"auto", borderRadius:8, border:"1px solid var(--tp-border)" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
                    <thead><tr>{csvData.headers.map((h,i) => <th key={i} style={{ padding:"6px 8px", textAlign:"left", color:"var(--tp-muted)", borderBottom:"1px solid var(--tp-border)", background:"var(--tp-card)", whiteSpace:"nowrap", fontWeight:600 }}>{h}</th>)}</tr></thead>
                    <tbody>{csvData.rows.slice(0,3).map((row,ri) => <tr key={ri}>{row.map((cell,ci) => <td key={ci} style={{ padding:"5px 8px", color:"var(--tp-text2)", borderBottom:"1px solid var(--tp-border)", whiteSpace:"nowrap", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis" }}>{cell}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>

              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <button onClick={()=>{setStep(1);setCsvData(null);}} style={{ padding:"8px 16px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:12 }}>Back</button>
                <button onClick={buildPreview} disabled={columnMapping.date === undefined && columnMapping.ticker === undefined} style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 20px", borderRadius:8, border:"none", background: (columnMapping.ticker !== undefined) ? "linear-gradient(135deg,#059669,#34d399)" : "var(--tp-input)", color: (columnMapping.ticker !== undefined) ? "#fff" : "#5c6070", cursor: (columnMapping.ticker !== undefined) ? "pointer" : "default", fontSize:13, fontWeight:600 }}>Preview Import →</button>
              </div>
            </div>
          )}

          {/* Step 3: Preview + Confirm */}
          {step === 3 && (
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:13, color:"#4ade80", fontWeight:600 }}>{importPreview.length} trades ready to import</div>
                  {targetAccount && <div style={{ fontSize:11, color:"var(--tp-faint)" }}>All trades will be assigned to: <span style={{ color:"#4ade80", fontWeight:600 }}>{targetAccount}</span></div>}
                </div>
                <div style={{ fontSize:11, color:"var(--tp-faint)", textAlign:"right" }}>
                  {pairStats ? (
                    <>{pairStats.paired} closed · {pairStats.open} open · {pairStats.filtered} skipped</>
                  ) : (
                    <>{importPreview.filter(t=>t.pnl!==null).length} with P&L · {importPreview.filter(t=>t.pnl===null).length} without</>
                  )}
                </div>
              </div>

              {pairStats && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8, marginBottom:14 }}>
                  <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:700, color:"var(--tp-text)" }}>{pairStats.total}</div>
                    <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Total Fills</div>
                  </div>
                  <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:700, color:"#4ade80" }}>{pairStats.paired}</div>
                    <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Paired (Closed)</div>
                  </div>
                  <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:700, color:"#60a5fa" }}>{pairStats.open}</div>
                    <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Open Positions</div>
                  </div>
                  <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:700, color:"var(--tp-muted)" }}>{pairStats.filtered}</div>
                    <div style={{ fontSize:9, color:"var(--tp-faint)", textTransform:"uppercase" }}>Filtered Out</div>
                  </div>
                </div>
              )}

              <div style={{ maxHeight:340, overflowY:"auto", borderRadius:10, border:"1px solid var(--tp-border)", marginBottom:16 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead><tr>
                    {["Date","Ticker","Dir","Asset","Status","Entry","Exit","Qty","P&L","Account"].map(h => <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:"var(--tp-faint)", borderBottom:"1px solid var(--tp-border)", background:"rgba(0,0,0,0.2)", whiteSpace:"nowrap", fontWeight:600, textTransform:"uppercase", letterSpacing:0.5, fontSize:9, position:"sticky", top:0 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {importPreview.slice(0, 50).map((t, i) => (
                      <tr key={i} style={{ background: i%2===0 ? "var(--tp-card)" : "transparent" }}>
                        <td style={{ padding:"6px 10px", color:"var(--tp-muted)" }}>{t.date}</td>
                        <td style={{ padding:"6px 10px", color:"var(--tp-text)", fontWeight:600 }}>{t.ticker}</td>
                        <td style={{ padding:"6px 10px" }}><span style={{ fontSize:9, fontWeight:600, color:t.direction==="Long"?"#60a5fa":"#f472b6", background:t.direction==="Long"?"rgba(96,165,250,0.12)":"rgba(244,114,182,0.12)", padding:"2px 6px", borderRadius:3 }}>{t.direction}</span></td>
                        <td style={{ padding:"6px 10px", color:"var(--tp-muted)", fontSize:10 }}>{t.assetType}</td>
                        <td style={{ padding:"6px 10px" }}><span style={{ fontSize:9, fontWeight:600, color:t.status==="Closed"?"#4ade80":"#60a5fa", background:t.status==="Closed"?"rgba(74,222,128,0.1)":"rgba(96,165,250,0.1)", padding:"2px 6px", borderRadius:3 }}>{t.status}</span></td>
                        <td style={{ padding:"6px 10px", color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace", fontSize:11 }}>{t.entryPrice || "—"}</td>
                        <td style={{ padding:"6px 10px", color:"var(--tp-text2)", fontFamily:"'JetBrains Mono', monospace", fontSize:11 }}>{t.exitPrice || "—"}</td>
                        <td style={{ padding:"6px 10px", color:"var(--tp-muted)" }}>{t.quantity || "—"}</td>
                        <td style={{ padding:"6px 10px", fontWeight:600, color: t.pnl > 0 ? "#4ade80" : t.pnl < 0 ? "#f87171" : "#5c6070", fontFamily:"'JetBrains Mono', monospace" }}>{t.pnl !== null ? fmt(t.pnl) : "—"}</td>
                        <td style={{ padding:"6px 10px", color:"#60a5fa", fontSize:10 }}>{t.account || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.length > 50 && <div style={{ padding:"8px 10px", textAlign:"center", fontSize:11, color:"var(--tp-faint)" }}>... and {importPreview.length - 50} more</div>}
              </div>

              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <button onClick={()=>setStep(csvFormat === "pdf" ? 1 : 2)} style={{ padding:"8px 16px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:12 }}>{csvFormat === "pdf" ? "← Back" : "← Back to Mapping"}</button>
                <button onClick={executeImport} style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 24px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#059669,#34d399)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(5,150,105,0.3)" }}><Check size={14}/> Import {importPreview.length} Trades</button>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && importResult && (
            <div style={{ textAlign:"center", padding:"30px 20px" }}>
              <div style={{ width:56, height:56, borderRadius:28, background:"rgba(74,222,128,0.15)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}><Check size={28} color="#4ade80"/></div>
              <div style={{ fontSize:18, fontWeight:700, color:"var(--tp-text)", marginBottom:6 }}>Import Complete!</div>
              <div style={{ fontSize:13, color:"var(--tp-muted)", marginBottom:4 }}>{importResult.count} trades imported successfully</div>
              {importResult.account && <div style={{ fontSize:12, color:"#4ade80" }}>Assigned to: {importResult.account}</div>}
              <div style={{ display:"flex", gap:10, justifyContent:"center", marginTop:20 }}>
                <button onClick={reset} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Done</button>
                <button onClick={()=>{setStep(1);setCsvData(null);setImportPreview([]);setImportResult(null);setFileName("");setCsvFormat("trade-based");setPairStats(null);}} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid rgba(74,222,128,0.2)", background:"rgba(74,222,128,0.08)", color:"#4ade80", cursor:"pointer", fontSize:13 }}>Import More</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ACCOUNT BALANCES MANAGER ────────────────────────────────────────────────
function AccountBalancesManager({ accountBalances, onSave, customFields, trades, prefs, onSavePrefs, wheelTrades, cashTransactions, onSaveCashTransactions, hideBalances }) {
  const [addingAccount, setAddingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [editingAccount, setEditingAccount] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashForm, setCashForm] = useState({ account: "", type: "deposit", amount: "", note: "", date: new Date().toISOString().split("T")[0] });
  const [resetForm, setResetForm] = useState(null); // { account, balance, date, note }

  const accounts = customFields.accounts || [];
  const allAccountNames = [...new Set([...accounts, ...Object.keys(accountBalances)])];

  const handleAdd = () => {
    const name = newAccountName.trim();
    const bal = parseFloat(newAccountBalance);
    if (!name || isNaN(bal)) return;
    onSave(prev => ({ ...prev, [name]: bal }));
    setNewAccountName(""); setNewAccountBalance(""); setAddingAccount(false);
  };

  const handleUpdate = (name) => {
    const bal = parseFloat(editValue);
    if (isNaN(bal)) return;
    onSave(prev => ({ ...prev, [name]: bal }));
    setEditingAccount(null); setEditValue("");
  };

  const handleRemove = (name) => {
    onSave(prev => { const n = { ...prev }; delete n[name]; return n; });
  };

  const startEdit = (name) => {
    setEditingAccount(name);
    setEditValue(String(accountBalances[name] || 0));
  };

  const accountsWithBalances = allAccountNames.filter(a => accountBalances[a] !== undefined);
  const accountsWithoutBalances = accounts.filter(a => accountBalances[a] === undefined);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Account Starting Balances</div>
          <div style={{ fontSize:13, color:"var(--tp-faint)" }}>Set starting capital per account for accurate P&L % tracking</div>
        </div>
        <button onClick={()=>setAddingAccount(true)} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}><Plus size={15}/> Add Account</button>
      </div>

      <div style={{ fontSize:11, color:"var(--tp-faint)", marginBottom:20, lineHeight:1.6, maxWidth:600 }}>
        These balances represent your starting capital in each account. Your trade P&L will be applied on top of these to calculate current balances and percentage returns on the dashboard. Accounts defined in Custom Fields will appear here automatically.
      </div>

      {/* Quick-add from custom field accounts that don't have balances yet */}
      {accountsWithoutBalances.length > 0 && (
        <div style={{ background:"rgba(96,165,250,0.05)", border:"1px solid rgba(96,165,250,0.12)", borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
          <div style={{ fontSize:11, color:"#60a5fa", fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, marginBottom:10 }}>Accounts Without Balances</div>
          <div style={{ fontSize:11, color:"var(--tp-faint)", marginBottom:10 }}>These accounts are defined in your Custom Fields but don't have a starting balance set yet.</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {accountsWithoutBalances.map(a => (
              <button key={a} onClick={()=>{setNewAccountName(a);setNewAccountBalance("");setAddingAccount(true);}} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid rgba(96,165,250,0.25)", background:"rgba(96,165,250,0.08)", color:"#60a5fa", cursor:"pointer", fontSize:12, fontWeight:500, display:"flex", alignItems:"center", gap:5 }}>
                <Plus size={11}/> {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add new account form */}
      {addingAccount && (
        <div style={{ background:"rgba(30,32,38,0.9)", border:"1px solid rgba(99,102,241,0.25)", borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
          <div style={{ fontSize:12, color:"#a5b4fc", fontWeight:600, marginBottom:12 }}>Set Account Balance</div>
          <div style={{ display:"flex", gap:10, alignItems:"end" }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:4 }}>Account Name</label>
              {newAccountName && accounts.includes(newAccountName) ? (
                <div style={{ padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13 }}>{newAccountName}</div>
              ) : (
                <input value={newAccountName} onChange={e=>setNewAccountName(e.target.value)} placeholder="e.g. Futures Account" style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
              )}
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:4 }}>Starting Balance ($)</label>
              <input type="number" value={newAccountBalance} onChange={e=>setNewAccountBalance(e.target.value)} placeholder="25000" autoFocus={!!newAccountName} onKeyDown={e=>{if(e.key==="Enter")handleAdd();}} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"'JetBrains Mono', monospace", boxSizing:"border-box" }}/>
            </div>
            <button onClick={handleAdd} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"#6366f1", color:"var(--tp-text)", cursor:"pointer", fontSize:13, fontWeight:600, whiteSpace:"nowrap" }}>Save</button>
            <button onClick={()=>{setAddingAccount(false);setNewAccountName("");setNewAccountBalance("");}} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer", padding:4 }}><X size={18}/></button>
          </div>
        </div>
      )}

      {/* Account balance cards */}
      {accountsWithBalances.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--tp-faint)" }}>
          <DollarSign size={44} style={{ margin:"0 auto 16px", opacity:0.35 }}/>
          <p style={{ margin:0, fontSize:15 }}>No account balances set yet.</p>
          <p style={{ margin:"8px 0 0", fontSize:13, color:"var(--tp-faintest)" }}>Add starting balances for your accounts to track P&L percentages accurately.</p>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:12 }}>
          {accountsWithBalances.map(name => {
            const balance = accountBalances[name];
            const isEditing = editingAccount === name;
            return (
              <div key={name} style={{ background:"var(--tp-panel)", border:"1px solid rgba(74,222,128,0.12)", borderRadius:12, padding:"16px 18px", transition:"border-color 0.2s" }} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(99,102,241,0.3)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(74,222,128,0.12)"}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:16, fontWeight:700, color:"var(--tp-text)", marginBottom:2 }}>{name}</div>
                    {accounts.includes(name) && <span style={{ fontSize:9, color:"#6366f1", background:"rgba(99,102,241,0.12)", padding:"2px 6px", borderRadius:4 }}>Custom Field</span>}
                  </div>
                  <div style={{ display:"flex", gap:4 }}>
                    <button onClick={()=>setResetForm({ account: name, balance: "", date: new Date().toISOString().split("T")[0], note: "" })} style={{ padding:"4px 8px", borderRadius:4, border:"none", background:"rgba(234,179,8,0.1)", color:"#eab308", cursor:"pointer", fontSize:10 }}>Reset</button>
                    <button onClick={()=>startEdit(name)} style={{ padding:"4px 8px", borderRadius:4, border:"none", background:"var(--tp-input)", color:"var(--tp-muted)", cursor:"pointer", fontSize:10 }}>Edit</button>
                    <button onClick={()=>handleRemove(name)} style={{ padding:"4px 6px", borderRadius:4, border:"none", background:"transparent", color:"var(--tp-faint)", cursor:"pointer" }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><Trash2 size={11}/></button>
                  </div>
                </div>
                {isEditing ? (
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:11, color:"var(--tp-faint)" }}>$</span>
                    <input type="number" value={editValue} onChange={e=>setEditValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleUpdate(name);if(e.key==="Escape")setEditingAccount(null);}} autoFocus style={{ flex:1, padding:"8px 10px", background:"var(--tp-input)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:6, color:"var(--tp-text)", fontSize:14, outline:"none", fontFamily:"'JetBrains Mono', monospace" }}/>
                    <button onClick={()=>handleUpdate(name)} style={{ padding:"6px 14px", borderRadius:6, border:"none", background:"#6366f1", color:"var(--tp-text)", cursor:"pointer", fontSize:11, fontWeight:600 }}>Save</button>
                    <button onClick={()=>setEditingAccount(null)} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={14}/></button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Starting Balance</div>
                    <div style={{ fontSize:22, fontWeight:700, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>{hideBalances ? "$•••••" : `$${balance.toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 })}`}</div>
                    {(prefs?.accountResets?.[name]) && (
                      <div style={{ marginTop:6, fontSize:10, color:"#eab308", background:"rgba(234,179,8,0.08)", border:"1px solid rgba(234,179,8,0.15)", borderRadius:6, padding:"5px 8px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span>Reset {prefs.accountResets[name].resetDate} → {hideBalances ? "$•••••" : `$${parseFloat(prefs.accountResets[name].resetBalance).toLocaleString()}`}{!hideBalances && prefs.accountResets[name].note ? ` · ${prefs.accountResets[name].note}` : ""}</span>
                        <button onClick={()=>onSavePrefs(p=>{const r={...(p.accountResets||{})}; delete r[name]; return {...p, accountResets:r};})} style={{ background:"none", border:"none", color:"#eab308", cursor:"pointer", padding:0, fontSize:9 }}>Clear</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Account Reset Form ── */}
      {resetForm && (
        <div style={{ marginTop:16, background:"rgba(234,179,8,0.06)", border:"1px solid rgba(234,179,8,0.25)", borderRadius:12, padding:"18px 20px" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#eab308", marginBottom:4 }}>Reset Account: {resetForm.account}</div>
          <div style={{ fontSize:12, color:"var(--tp-faint)", marginBottom:14, lineHeight:1.6 }}>
            This sets a new starting point for the account. All trades before the reset date will be archived — they'll still appear in your Trade Log (dimmed) and remain available for AI Coach review, but they won't affect your Dashboard stats, P&L calculations, or goal tracking.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
            <div>
              <label style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:4 }}>New Starting Balance ($)</label>
              <input type="number" value={resetForm.balance} onChange={e=>setResetForm(f=>({...f, balance:e.target.value}))} placeholder="25000" autoFocus style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"'JetBrains Mono', monospace", boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:4 }}>Reset Date</label>
              <input type="date" value={resetForm.date} onChange={e=>setResetForm(f=>({...f, date:e.target.value}))} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:4 }}>Note (optional)</label>
              <input value={resetForm.note} onChange={e=>setResetForm(f=>({...f, note:e.target.value}))} placeholder="e.g. Moved to ThinkorSwim" style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={()=>{
              const bal = parseFloat(resetForm.balance);
              if (isNaN(bal) || !resetForm.date) return;
              // Save reset to prefs and update starting balance
              onSavePrefs(p => ({
                ...p,
                accountResets: { ...(p.accountResets || {}), [resetForm.account]: { resetDate: resetForm.date, resetBalance: bal, note: resetForm.note, createdAt: new Date().toISOString() } }
              }));
              onSave(prev => ({ ...prev, [resetForm.account]: bal }));
              setResetForm(null);
            }} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:"#eab308", color:"#000", cursor:"pointer", fontSize:13, fontWeight:700 }}>Reset Account</button>
            <button onClick={()=>setResetForm(null)} style={{ padding:"9px 16px", borderRadius:8, border:"1px solid var(--tp-border-l)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Cancel</button>
            <span style={{ fontSize:11, color:"var(--tp-faintest)", marginLeft:8 }}>Trades before the reset date will be archived, not deleted.</span>
          </div>
        </div>
      )}
      {accountsWithBalances.length > 0 && (
        <div style={{ marginTop:24 }}>
          <div style={{ fontSize:16, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Balance Override</div>
          <div style={{ fontSize:12, color:"var(--tp-faint)", marginBottom:16, lineHeight:1.6 }}>
            Manually set today's account value. This overrides the auto-calculated balance (starting balance + realized P&L + unrealized P&L) on the Dashboard. Useful if there are deposits, withdrawals, transfers, or missing trades. Leave blank to use auto-calculation.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:10 }}>
            {accountsWithBalances.map(name => {
              const overrides = prefs?.balanceOverrides || {};
              const currentOverride = overrides[name] !== undefined ? String(overrides[name]) : "";
              const hasOverride = currentOverride !== "";

              // Calculate what auto would show
              const start = parseFloat(accountBalances[name]) || 0;
              const realizedPnL = (trades || []).filter(t => t.account === name && t.pnl !== null).reduce((s, t) => s + t.pnl, 0);
              const holdingPrices = prefs?.holdingPrices || {};
              const openTrades = (trades || []).filter(t => t.account === name && t.status === "Open");
              let unrealizedPnL = 0;
              openTrades.forEach(t => {
                const cp = holdingPrices[t.ticker];
                if (cp && t.entryPrice && t.quantity) {
                  const dir = t.direction === "Short" ? -1 : 1;
                  unrealizedPnL += (cp - (parseFloat(t.entryPrice)||0)) * (parseFloat(t.quantity)||0) * dir;
                }
              });
              const autoBal = start + realizedPnL + Math.round(unrealizedPnL * 100) / 100 + (wheelTrades || []).filter(wt => wt.account === name && (wt.type === "CSP" || wt.type === "CC")).reduce((s, wt) => s + ((parseFloat(wt.openPremium)||0) - (parseFloat(wt.closePremium)||0)) * (parseInt(wt.contracts)||0) * 100, 0);

              return (
                <div key={name} style={{ background:"var(--tp-panel)", border:`1px solid ${hasOverride ? "rgba(234,179,8,0.2)" : "var(--tp-panel-b)"}`, borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:"var(--tp-text)" }}>{name}</span>
                    {hasOverride && (
                      <button onClick={()=>onSavePrefs(p => { const o = { ...(p.balanceOverrides||{}) }; delete o[name]; return { ...p, balanceOverrides: o }; })} style={{ fontSize:9, color:"#eab308", background:"rgba(234,179,8,0.1)", border:"1px solid rgba(234,179,8,0.2)", borderRadius:4, padding:"2px 8px", cursor:"pointer", fontWeight:600 }}>
                        Clear Override
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize:10, color:"var(--tp-faintest)", marginBottom:6 }}>
                    Auto-calculated: ${autoBal.toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 })}
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <div style={{ position:"relative", flex:1 }}>
                      <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--tp-faintest)", fontSize:12 }}>$</span>
                      <input
                        type="number"
                        value={currentOverride}
                        onChange={e => {
                          const val = e.target.value;
                          onSavePrefs(p => ({
                            ...p,
                            balanceOverrides: { ...(p.balanceOverrides||{}), [name]: val === "" ? undefined : parseFloat(val) }
                          }));
                        }}
                        placeholder="Leave blank for auto"
                        style={{ width:"100%", padding:"8px 10px 8px 22px", background:"var(--tp-input)", border:`1px solid ${hasOverride ? "rgba(234,179,8,0.3)" : "var(--tp-border-l)"}`, borderRadius:6, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"'JetBrains Mono', monospace", boxSizing:"border-box" }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Cash Deposits & Withdrawals ── */}
      {accountsWithBalances.length > 0 && (
        <div style={{ marginTop:24 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Cash Deposits & Withdrawals</div>
              <div style={{ fontSize:12, color:"var(--tp-faint)", lineHeight:1.6 }}>Log deposits or withdrawals to adjust account balances. These are factored into your current balance but excluded from P&L return calculations.</div>
            </div>
            <button onClick={()=>{setShowCashForm(true);setCashForm(f=>({...f, account:accountsWithBalances[0]||"", date:new Date().toISOString().split("T")[0]}));}} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#eab308,#f59e0b)", color:"#000", cursor:"pointer", fontSize:12, fontWeight:600 }}><Plus size={13}/> Add Transaction</button>
          </div>

          {showCashForm && (
            <div style={{ background:"rgba(30,32,38,0.9)", border:"1px solid rgba(234,179,8,0.25)", borderRadius:10, padding:"16px 18px", marginTop:12, marginBottom:16 }}>
              <div style={{ fontSize:12, color:"#eab308", fontWeight:600, marginBottom:12 }}>New Cash Transaction</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, marginBottom:10 }}>
                <div>
                  <label style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:4 }}>Account</label>
                  <select value={cashForm.account} onChange={e=>setCashForm(f=>({...f,account:e.target.value}))} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box" }}>
                    {accountsWithBalances.map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:4 }}>Type</label>
                  <select value={cashForm.type} onChange={e=>setCashForm(f=>({...f,type:e.target.value}))} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:cashForm.type==="deposit"?"#4ade80":"#f87171", fontSize:13, outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box" }}>
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:4 }}>Amount ($)</label>
                  <input type="number" value={cashForm.amount} onChange={e=>setCashForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", fontFamily:"'JetBrains Mono', monospace", boxSizing:"border-box" }}/>
                </div>
                <div>
                  <label style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:4 }}>Date</label>
                  <input type="date" value={cashForm.date} onChange={e=>setCashForm(f=>({...f,date:e.target.value}))} style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
                </div>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"end" }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:10, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.6, display:"block", marginBottom:4 }}>Note (optional)</label>
                  <input value={cashForm.note} onChange={e=>setCashForm(f=>({...f,note:e.target.value}))} placeholder="e.g. Monthly funding, Transfer from savings" style={{ width:"100%", padding:"9px 12px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:8, color:"var(--tp-text)", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
                </div>
                <button onClick={()=>{
                  const amt = parseFloat(cashForm.amount);
                  if (!cashForm.account || isNaN(amt) || amt <= 0) return;
                  const tx = { id: Date.now() + Math.random(), ...cashForm, amount: String(amt) };
                  onSaveCashTransactions(prev => [...prev, tx]);
                  setCashForm({ account: cashForm.account, type: "deposit", amount: "", note: "", date: new Date().toISOString().split("T")[0] });
                  setShowCashForm(false);
                }} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"#eab308", color:"#000", cursor:"pointer", fontSize:13, fontWeight:600, whiteSpace:"nowrap" }}>Save</button>
                <button onClick={()=>setShowCashForm(false)} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer", padding:4 }}><X size={18}/></button>
              </div>
            </div>
          )}

          {/* Transaction history */}
          {(cashTransactions || []).length > 0 && (
            <div style={{ marginTop:12 }}>
              <div style={{ display:"grid", gap:4 }}>
                {[...(cashTransactions || [])].sort((a,b) => new Date(b.date) - new Date(a.date)).map(tx => (
                  <div key={tx.id} style={{ display:"grid", gridTemplateColumns:"90px 110px 80px 1fr 24px", gap:10, padding:"8px 14px", background:"var(--tp-card)", borderRadius:8, alignItems:"center", fontSize:12 }}>
                    <span style={{ color:"var(--tp-faint)", fontFamily:"'JetBrains Mono', monospace" }}>{tx.date?.slice(5)}</span>
                    <span style={{ fontWeight:600, color:"var(--tp-text)" }}>{tx.account}</span>
                    <span style={{ fontWeight:700, fontFamily:"'JetBrains Mono', monospace", color: tx.type === "deposit" ? "#4ade80" : "#f87171" }}>
                      {tx.type === "deposit" ? "+" : "−"}${parseFloat(tx.amount).toLocaleString("en-US",{minimumFractionDigits:2})}
                    </span>
                    <span style={{ color:"var(--tp-faintest)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tx.note || "—"}</span>
                    <button onClick={()=>onSaveCashTransactions(prev=>prev.filter(t=>t.id!==tx.id))} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--tp-faint)", padding:0 }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><X size={12}/></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dashboard Display Toggle ── */}
      <div style={{ marginTop:24, background:"rgba(99,102,241,0.04)", border:"1px solid rgba(99,102,241,0.12)", borderRadius:12, padding:"18px 20px" }}>
        <div style={{ fontSize:16, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Dashboard Balance Display</div>
        <div style={{ fontSize:12, color:"var(--tp-faint)", marginBottom:14, lineHeight:1.6 }}>Control how account balances are shown on the Dashboard.</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>onSavePrefs(p=>({...p, compactBalances:false}))} style={{ flex:1, padding:"14px 16px", borderRadius:10, border:`2px solid ${!prefs.compactBalances ? "#6366f1" : "var(--tp-border-l)"}`, background:!prefs.compactBalances ? "rgba(99,102,241,0.08)" : "var(--tp-card)", cursor:"pointer", textAlign:"left" }}>
            <div style={{ fontSize:13, fontWeight:600, color:!prefs.compactBalances?"#a5b4fc":"var(--tp-muted)", marginBottom:4 }}>Detailed Breakdown</div>
            <div style={{ fontSize:11, color:"var(--tp-faint)", lineHeight:1.5 }}>Show Realized, Unrealized, Wheel, and Cash separately under each account balance</div>
          </button>
          <button onClick={()=>onSavePrefs(p=>({...p, compactBalances:true}))} style={{ flex:1, padding:"14px 16px", borderRadius:10, border:`2px solid ${prefs.compactBalances ? "#6366f1" : "var(--tp-border-l)"}`, background:prefs.compactBalances ? "rgba(99,102,241,0.08)" : "var(--tp-card)", cursor:"pointer", textAlign:"left" }}>
            <div style={{ fontSize:13, fontWeight:600, color:prefs.compactBalances?"#a5b4fc":"var(--tp-muted)", marginBottom:4 }}>Summary Only</div>
            <div style={{ fontSize:11, color:"var(--tp-faint)", lineHeight:1.5 }}>Show just the total account balance — clean and simple</div>
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomFieldsManager({ customFields, onSave }) {
  const [editingField, setEditingField] = useState(null); // 'emotions' | 'accounts' | 'timeframes' | 'strategies'
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    if (!newItem.trim() || !editingField) return;
    onSave(prev => ({
      ...prev,
      [editingField]: [...(prev[editingField] || []), newItem.trim()]
    }));
    setNewItem("");
  };

  const removeItem = (field, item) => {
    onSave(prev => ({
      ...prev,
      [field]: (prev[field] || []).filter(i => i !== item)
    }));
  };

  const fieldConfigs = [
    { key: "emotions", label: "Emotions", color: "#f472b6", desc: "Track emotional state during trades" },
    { key: "accounts", label: "Accounts", color: "#60a5fa", desc: "Different trading accounts" },
    { key: "timeframes", label: "Time Frames", color: "#eab308", desc: "Trade duration categories" },
    { key: "strategies", label: "Strategies", color: "#4ade80", desc: "Trading strategies and setups" }
  ];

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:600, color:"var(--tp-text)", marginBottom:4 }}>Custom Field Options</div>
        <div style={{ fontSize:13, color:"var(--tp-faint)" }}>Customize dropdowns and tags for trade entry</div>
      </div>

      <div style={{ display:"grid", gap:16 }}>
        {fieldConfigs.map(config => {
          const items = customFields[config.key] || [];
          const isEditing = editingField === config.key;
          
          return (
            <div key={config.key} style={{ background:"var(--tp-panel)", border:`1px solid ${config.color}22`, borderRadius:12, padding:"16px 18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:config.color, marginBottom:2 }}>{config.label}</div>
                  <div style={{ fontSize:11, color:"var(--tp-faint)" }}>{config.desc}</div>
                </div>
                <button onClick={()=>setEditingField(isEditing ? null : config.key)} style={{ padding:"6px 12px", borderRadius:6, border:`1px solid ${config.color}44`, background:isEditing?`${config.color}22`:"transparent", color:config.color, cursor:"pointer", fontSize:11, fontWeight:500 }}>
                  {isEditing ? "Done" : "+ Add"}
                </button>
              </div>

              {isEditing && (
                <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                  <input value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addItem();}} placeholder={`Add ${config.label.toLowerCase()}...`} style={{ flex:1, padding:"8px 10px", background:"var(--tp-input)", border:"1px solid var(--tp-border-l)", borderRadius:6, color:"var(--tp-text)", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
                  <button onClick={addItem} style={{ padding:"8px 14px", borderRadius:6, border:"none", background:config.color, color:"#000", cursor:"pointer", fontSize:12, fontWeight:600 }}>Add</button>
                </div>
              )}

              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {items.map(item => (
                  <div key={item} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:`${config.color}15`, border:`1px solid ${config.color}33`, borderRadius:6 }}>
                    <span style={{ fontSize:12, color:"var(--tp-text2)" }}>{item}</span>
                    <button onClick={()=>removeItem(config.key, item)} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer", padding:0, display:"flex", alignItems:"center" }} onMouseEnter={e=>e.currentTarget.style.color="#f87171"} onMouseLeave={e=>e.currentTarget.style.color="#5c6070"}><X size={12}/></button>
                  </div>
                ))}
                {items.length === 0 && <span style={{ fontSize:12, color:"var(--tp-faint)", fontStyle:"italic" }}>No {config.label.toLowerCase()} added yet</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FuturesPresetModal({ onSave, onClose, editPreset }) {
  const [p, setP] = useState(editPreset || { name:"", tickSize:"", tickValue:"" });
  const set = k => v => setP(prev=>({...prev,[k]:v}));
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(3px)" }}>
      <div style={{ background:"var(--tp-sel-bg)", borderRadius:16, width:"min(96vw, 420px)", padding:28, border:"1px solid var(--tp-border-l)", boxShadow:"0 24px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}><h3 style={{ color:"var(--tp-text)", fontSize:17, fontWeight:600, margin:0 }}>{editPreset?"Edit Preset":"New Futures Preset"}</h3><button onClick={onClose} style={{ background:"none", border:"none", color:"var(--tp-faint)", cursor:"pointer" }}><X size={20}/></button></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:10, marginBottom:14 }}>
          <Input label="Contract Name" value={p.name} onChange={set("name")} placeholder="e.g. ES, NQ, YM"/>
          <Input label="Tick Size" value={p.tickSize} onChange={set("tickSize")} type="number" placeholder="0.25"/>
          <Input label="Tick Value ($)" value={p.tickValue} onChange={set("tickValue")} type="number" placeholder="12.50"/>
        </div>
        <div style={{ fontSize:11, color:"var(--tp-faint)", marginBottom:20, fontStyle:"italic" }}>Tick Value = Tick Size × Point Value. For ES: 0.25 × $50 = $12.50</div>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}><button onClick={onClose} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--tp-muted)", cursor:"pointer", fontSize:13 }}>Cancel</button><button onClick={()=>{if(p.name.trim()) onSave(p);}} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600, boxShadow:"0 4px 14px rgba(99,102,241,0.3)" }}>{editPreset?"Update":"Add Preset"}</button></div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function JournalModule({ user, tab, setTab, theme, prefs: shellPrefs, setPrefs: setShellPrefs }) {
  const [trades, setTrades] = useState([]);
  const [watchlists, setWatchlists] = useState([]);
  const [wheelTrades, setWheelTrades] = useState([]);
  const [futuresSettings, setFuturesSettings] = useState([]);
  const [customFields, setCustomFields] = useState(DEFAULT_CUSTOM_FIELDS);
  const [accountBalances, setAccountBalances] = useState({});
  const [playbooks, setPlaybooks] = useState([]);
  const [journal, setJournal] = useState([]);
  const [goals, setGoals] = useState({});
  const [dividends, setDividends] = useState([]);
  const [prefs, setPrefs] = useState({ theme: shellPrefs?.theme || "dark", logo: "", banner: "", tabOrder: [], dashWidgets: [] });
  const cashTransactions = useMemo(() => prefs.cashTransactions || [], [prefs]);
  const setCashTransactions = useCallback(fn => {
    setPrefs(p => {
      const prev = p.cashTransactions || [];
      const next = typeof fn === "function" ? fn(prev) : fn;
      return { ...p, cashTransactions: next };
    });
  }, []);
  const [hideBalances, setHideBalances] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  // Sync theme changes to shell
  useEffect(() => {
    if (prefs.theme && setShellPrefs) {
      setShellPrefs(p => ({ ...p, theme: prefs.theme }));
    }
  }, [prefs.theme]); // "" | "saving" | "saved" | "error"



  // ─── LOAD DATA FROM CLOUD ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const cloud = await cloudLoad(user.id);
      if (cloud) {
        setTrades(Array.isArray(cloud.trades) ? cloud.trades : []);
        setWatchlists(Array.isArray(cloud.watchlists) ? cloud.watchlists : []);
        setWheelTrades(Array.isArray(cloud.wheel_trades) ? cloud.wheel_trades : []);
        setFuturesSettings(Array.isArray(cloud.futures_settings) ? cloud.futures_settings : []);
        setCustomFields(cloud.custom_fields && typeof cloud.custom_fields === "object" && Object.keys(cloud.custom_fields).length > 0 ? cloud.custom_fields : DEFAULT_CUSTOM_FIELDS);
        setAccountBalances(cloud.account_balances && typeof cloud.account_balances === "object" && !Array.isArray(cloud.account_balances) ? cloud.account_balances : {});
        setPlaybooks(Array.isArray(cloud.playbooks) ? cloud.playbooks : []);
        setJournal(Array.isArray(cloud.journal) ? cloud.journal : []);
        setGoals(cloud.goals && typeof cloud.goals === "object" && !Array.isArray(cloud.goals) ? cloud.goals : {});
        setDividends(Array.isArray(cloud.dividends) ? cloud.dividends : []);
        const pr = cloud.prefs;
        const loadedPrefs = pr && typeof pr === "object" && !Array.isArray(pr) ? { theme: "dark", logo: "", banner: "", tabOrder: [], dashWidgets: [], ...pr } : { theme: "dark", logo: "", banner: "", tabOrder: [], dashWidgets: [] };
        // Migrate any locally saved cash transactions into prefs
        if (!loadedPrefs.cashTransactions || loadedPrefs.cashTransactions.length === 0) {
          const localCash = localLoad(CASH_TRANSACTIONS_KEY);
          if (Array.isArray(localCash) && localCash.length > 0) loadedPrefs.cashTransactions = localCash;
        }
        setPrefs(loadedPrefs);
      }
      // Check for local data to migrate (only if cloud is empty or doesn't exist)
      if (!cloud && hasLocalData()) {
        setShowMigration(true);
        // Still load local data so user sees it immediately
        const local = getLocalData();
        setTrades(local.trades); setWatchlists(local.watchlists); setWheelTrades(local.wheel_trades);
        setFuturesSettings(local.futures_settings); setCustomFields(local.custom_fields && Object.keys(local.custom_fields).length > 0 ? local.custom_fields : DEFAULT_CUSTOM_FIELDS);
        setAccountBalances(local.account_balances); setPlaybooks(local.playbooks); setJournal(local.journal);
        setGoals(local.goals); setDividends(local.dividends); setPrefs(local.prefs);
      }
      setLoaded(true);
    })();
  }, [user]);

  // ─── MIGRATION HANDLER ────────────────────────────────────────────────────
  const handleMigrate = async () => {
    const local = getLocalData();
    await cloudSaveAll(user.id, local);
    setShowMigration(false);
  };

  // ─── SAVE TO CLOUD (debounced per field) ──────────────────────────────────
  const saveTimeout = useMemo(() => ({}), []);
  const debouncedCloudSave = useCallback((field, value) => {
    if (!user || !loaded) return;
    // Also save locally as cache
    const keyMap = { trades: STORAGE_KEY, watchlists: WATCHLIST_KEY, wheel_trades: WHEEL_KEY, futures_settings: FUTURES_SETTINGS_KEY, custom_fields: CUSTOM_FIELDS_KEY, account_balances: ACCOUNT_BALANCES_KEY, playbooks: PLAYBOOK_KEY, journal: JOURNAL_KEY, goals: GOALS_KEY, dividends: DIVIDENDS_KEY, cash_transactions: CASH_TRANSACTIONS_KEY, prefs: PREFS_KEY };
    if (keyMap[field]) localSave(keyMap[field], value);
    // Debounce cloud save (500ms)
    clearTimeout(saveTimeout[field]);
    setSyncStatus("saving");
    saveTimeout[field] = setTimeout(async () => {
      await cloudSave(user.id, field, value);
      setSyncStatus("saved");
      setTimeout(() => setSyncStatus(""), 2000);
    }, 500);
  }, [user, loaded]);

  useEffect(() => { debouncedCloudSave("trades", trades); }, [trades]);
  useEffect(() => { debouncedCloudSave("watchlists", watchlists); }, [watchlists]);
  useEffect(() => { debouncedCloudSave("wheel_trades", wheelTrades); }, [wheelTrades]);
  useEffect(() => { debouncedCloudSave("futures_settings", futuresSettings); }, [futuresSettings]);
  useEffect(() => { debouncedCloudSave("custom_fields", customFields); }, [customFields]);
  useEffect(() => { debouncedCloudSave("account_balances", accountBalances); }, [accountBalances]);
  useEffect(() => { debouncedCloudSave("playbooks", playbooks); }, [playbooks]);
  useEffect(() => { debouncedCloudSave("journal", journal); }, [journal]);
  useEffect(() => { debouncedCloudSave("goals", goals); }, [goals]);
  useEffect(() => { debouncedCloudSave("dividends", dividends); }, [dividends]);
  useEffect(() => { debouncedCloudSave("prefs", prefs); }, [prefs]);

  const handleTradeSave = useCallback(trade => {
    setTrades(prev => { const idx=prev.findIndex(t=>t.id===trade.id); if(idx>=0){const u=[...prev];u[idx]=trade;return u;} return [trade,...prev]; });
    setShowTradeModal(false); setEditingTrade(null);
  }, []);
  const handleTradeDelete = useCallback(id => setTrades(prev=>prev.filter(t=>t.id!==id)), []);
  const promoteTrade = prefill => { setEditingTrade(emptyTrade(prefill)); setShowTradeModal(true); };



  // Quick stats for sidebar
  const sidebarStats = useMemo(() => {
    const closed = trades.filter(t => t.pnl !== null);
    const totalPnL = closed.reduce((s, t) => s + (t.pnl || 0), 0);
    const wins = closed.filter(t => t.pnl > 0).length;
    const winRate = closed.length > 0 ? (wins / closed.length * 100) : 0;
    return { totalPnL, winRate };
  }, [trades]);

  // ── New Trade button in shell top bar ──
  useEffect(() => {
    const container = document.getElementById("tp-shell-actions");
    if (!container) return;
    container.innerHTML = "";
    const btn = document.createElement("button");
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> <span class="tp-new-trade-text">New Trade</span>';
    btn.style.cssText = "display:flex;align-items:center;gap:7px;padding:7px 16px;border-radius:8px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;cursor:pointer;font-size:12px;font-weight:600;box-shadow:0 2px 10px rgba(99,102,241,0.25)";
    btn.onclick = () => { setEditingTrade(null); setShowTradeModal(true); };
    container.appendChild(btn);
    return () => { if (container) container.innerHTML = ""; };
  }, [tab]);

  const JOURNAL_TABS = ["dashboard","journal","log","holdings","wheel","watchlist","goals","review","reports","playbook","settings"];
  if (!JOURNAL_TABS.includes(tab)) return null;

  return (
    <>
      {tab==="dashboard" && <Dashboard trades={trades} customFields={customFields} accountBalances={accountBalances} theme={theme} logo={prefs.logo} banner={prefs.banner} dashWidgets={prefs.dashWidgets} futuresSettings={futuresSettings} prefs={prefs} onSavePrefs={setPrefs} wheelTrades={wheelTrades} cashTransactions={cashTransactions} dividends={dividends} hideBalances={hideBalances} setHideBalances={setHideBalances} onNavigate={setTab} onNewTrade={()=>{setEditingTrade(null);setShowTradeModal(true);}}/>}
      {tab==="journal" && <JournalTab journal={journal} onSave={setJournal} trades={trades} theme={theme}/>}
      {tab==="goals" && <GoalTracker goals={goals} onSave={setGoals} trades={trades} theme={theme} accounts={[...new Set([...Object.keys(accountBalances||{}), ...(customFields?.accounts||[])])]} prefs={prefs}/>}
      {tab==="holdings" && <HoldingsTab trades={trades} accountBalances={accountBalances} onEditTrade={t=>{setEditingTrade(t);setShowTradeModal(true);}} theme={theme} dividends={dividends} onSaveDividends={setDividends} onSaveTrades={setTrades} prefs={prefs} onSavePrefs={setPrefs} onStartWheel={(ticker, account, shares, avgPrice) => {
        const wheelShareEntry = { id: Date.now() + Math.random(), ticker, type: "Shares", date: new Date().toISOString().split("T")[0], shares: String(shares), avgPrice: String(avgPrice), notes: `Linked from Holdings (${shares} shares @ $${avgPrice.toFixed(2)})`, account, contracts:"", strike:"", openPremium:"", closePremium:"", expiry:"", assigned:false, calledAway:false, sharesCalledAway:"" };
        setWheelTrades(prev => [wheelShareEntry, ...prev]);
        setTab("wheel");
      }}/>}
      {tab==="review" && <ReviewTab trades={trades} accountBalances={accountBalances} theme={theme} prefs={prefs} journal={journal} goals={goals} playbooks={playbooks}/>}
      {tab==="playbook" && <PlaybookTab playbooks={playbooks} onSave={setPlaybooks} trades={trades} theme={theme}/>}
      {tab==="wheel" && <WheelTab wheelTrades={wheelTrades} onSave={setWheelTrades} theme={theme} accounts={[...new Set([...Object.keys(accountBalances||{}), ...(customFields?.accounts||[])])]} trades={trades} onSaveTrades={setTrades} prefs={prefs} accountBalances={accountBalances} onEditTrade={t=>{setEditingTrade(t);setShowTradeModal(true);}}/>}
      {tab==="watchlist" && <Watchlist watchlists={watchlists} onSave={setWatchlists} onPromoteTrade={promoteTrade} theme={theme}/>}
      {tab==="log" && <TradeLog trades={trades} onEdit={t=>{setEditingTrade(t);setShowTradeModal(true);}} onDelete={handleTradeDelete} theme={theme} prefs={prefs}/>}
      {tab==="reports" && <ReportsTab trades={trades} wheelTrades={wheelTrades} accountBalances={accountBalances} customFields={customFields} theme={theme} prefs={prefs}/>}
      {tab==="settings" && <SettingsTab user={user} futuresSettings={futuresSettings} onSaveFutures={setFuturesSettings} customFields={customFields} onSaveCustomFields={setCustomFields} accountBalances={accountBalances} onSaveAccountBalances={setAccountBalances} trades={trades} onSaveTrades={setTrades} prefs={prefs} onSavePrefs={setPrefs} theme={theme} wheelTrades={wheelTrades} cashTransactions={cashTransactions} onSaveCashTransactions={setCashTransactions} hideBalances={hideBalances}/>}
      {showTradeModal && <TradeModal onSave={handleTradeSave} onClose={()=>{setShowTradeModal(false);setEditingTrade(null);}} editTrade={editingTrade} futuresSettings={futuresSettings} customFields={customFields} playbooks={playbooks} theme={theme} accountBalances={accountBalances}/>}
      {showMigration && <MigrationPrompt onMigrate={handleMigrate} onSkip={()=>setShowMigration(false)}/>}
    </>
  );
}
