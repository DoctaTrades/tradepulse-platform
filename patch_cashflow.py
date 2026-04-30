#!/usr/bin/env python3
"""
TradePulse Goals Cash Flow patch.

Converts the existing 'withdrawals' array into a unified 'cashFlows' array
that supports both deposits and withdrawals. Old withdrawal records are
auto-migrated on load. currentBalance now factors in net cash flow so
deposits actually move the dial. Total P&L % continues to exclude cash
flow events so returns aren't inflated by deposits.
"""

import sys
from pathlib import Path

PATH = Path("app/modules/journal/JournalModule.jsx")

if not PATH.exists():
    print(f"ERROR: {PATH} not found. Run from project root.", file=sys.stderr)
    sys.exit(1)

src = PATH.read_text()

def replace_once(needle, replacement, label):
    global src
    count = src.count(needle)
    if count != 1:
        print(f"FAIL [{label}]: expected 1 match, found {count}", file=sys.stderr)
        sys.exit(1)
    src = src.replace(needle, replacement)
    print(f"OK   [{label}]")

# ---------- 1) defaultGoal: rename withdrawals -> cashFlows ----------
replace_once(
    'const defaultGoal = { startingBalance: 200, profitPct: 2, stopPct: 1, dailyLog: {}, weeklyGoalOverride: null, monthlyGoalOverride: null, weeklyLossLimit: null, withdrawals: [] };',
    'const defaultGoal = { startingBalance: 200, profitPct: 2, stopPct: 1, dailyLog: {}, weeklyGoalOverride: null, monthlyGoalOverride: null, weeklyLossLimit: null, cashFlows: [] };',
    "defaultGoal"
)

# ---------- 2) state: replace withdrawals state with cashFlows ----------
# Backward compat: read goals.cashFlows first, then migrate goals.withdrawals
# (each old withdrawal becomes a 'withdrawal' typed entry).
old_state = '  const [withdrawals, setWithdrawals] = useState(g.withdrawals || []);'
new_state = '''  const [cashFlows, setCashFlows] = useState(() => {
    if (Array.isArray(g.cashFlows) && g.cashFlows.length) return g.cashFlows;
    if (Array.isArray(g.withdrawals) && g.withdrawals.length) {
      return g.withdrawals.map(w => ({ ...w, type: 'withdrawal' }));
    }
    return [];
  });'''
replace_once(old_state, new_state, "cashFlows state")

# ---------- 3) account-switch effect: setWithdrawals -> setCashFlows ----------
replace_once(
    '      setWithdrawals(acctGoal.withdrawals || []);',
    '''      setCashFlows(() => {
        if (Array.isArray(acctGoal.cashFlows) && acctGoal.cashFlows.length) return acctGoal.cashFlows;
        if (Array.isArray(acctGoal.withdrawals) && acctGoal.withdrawals.length) {
          return acctGoal.withdrawals.map(w => ({ ...w, type: 'withdrawal' }));
        }
        return [];
      });''',
    "account-switch hydrate"
)

# ---------- 4) saveGoals payload: withdrawals -> cashFlows ----------
replace_once(
    'const acctData = { startingBalance, profitPct, stopPct, dailyLog, weeklyGoalOverride, monthlyGoalOverride, weeklyLossLimit, withdrawals, ...overrides };',
    'const acctData = { startingBalance, profitPct, stopPct, dailyLog, weeklyGoalOverride, monthlyGoalOverride, weeklyLossLimit, cashFlows, ...overrides };',
    "saveGoals payload"
)

# ---------- 5) saveGoals deps: withdrawals -> cashFlows ----------
replace_once(
    '  }, [startingBalance, profitPct, stopPct, dailyLog, onSave, selectedAccount, goalsData]);',
    '  }, [startingBalance, profitPct, stopPct, dailyLog, cashFlows, onSave, selectedAccount, goalsData]);',
    "saveGoals deps"
)

# ---------- 6) running balance: factor in net cash flow ----------
old_running = '''  const runningBalances = useMemo(() => {
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
  const totalPct = startingBalance > 0 ? ((currentBalance - startingBalance) / startingBalance) * 100 : 0;'''
new_running = '''  // Net cash flow: deposits add, withdrawals subtract. Excluded from P&L %.
  const netCashFlow = useMemo(
    () => cashFlows.reduce((s, cf) => s + (cf.type === 'deposit' ? (cf.amount || 0) : -(cf.amount || 0)), 0),
    [cashFlows]
  );
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

  const balanceFromTrading = runningBalances.length > 0 ? runningBalances[runningBalances.length - 1].balance : startingBalance;
  const currentBalance = balanceFromTrading + netCashFlow;
  const totalPnL = balanceFromTrading - startingBalance;
  const totalPct = startingBalance > 0 ? (totalPnL / startingBalance) * 100 : 0;'''
replace_once(old_running, new_running, "running balance + netCashFlow")

# ---------- 7) cash flow helpers: replace withdrawal helpers ----------
old_helpers = '''  // Withdrawal helpers
  const totalWithdrawn = withdrawals.reduce((s, w) => s + (w.amount || 0), 0);
  const monthWithdrawn = withdrawals.filter(w => w.date?.startsWith(todayStr.slice(0, 7))).reduce((s, w) => s + (w.amount || 0), 0);
  const addWithdrawal = (amount, date, note) => {
    const updated = [...withdrawals, { id: Date.now(), amount, date, note }];
    setWithdrawals(updated);
    saveGoals({ withdrawals: updated });
  };
  const removeWithdrawal = (id) => {
    const updated = withdrawals.filter(w => w.id !== id);
    setWithdrawals(updated);
    saveGoals({ withdrawals: updated });
  };'''
new_helpers = '''  // Cash flow helpers (deposits + withdrawals)
  const totalDeposited = cashFlows.filter(cf => cf.type === 'deposit').reduce((s, cf) => s + (cf.amount || 0), 0);
  const totalWithdrawn = cashFlows.filter(cf => cf.type !== 'deposit').reduce((s, cf) => s + (cf.amount || 0), 0);
  const monthWithdrawn = cashFlows.filter(cf => cf.type !== 'deposit' && cf.date?.startsWith(todayStr.slice(0, 7))).reduce((s, cf) => s + (cf.amount || 0), 0);
  const monthDeposited = cashFlows.filter(cf => cf.type === 'deposit' && cf.date?.startsWith(todayStr.slice(0, 7))).reduce((s, cf) => s + (cf.amount || 0), 0);
  const addCashFlow = (type, amount, date, note) => {
    const updated = [...cashFlows, { id: Date.now(), type, amount, date, note }];
    setCashFlows(updated);
    saveGoals({ cashFlows: updated });
  };
  const removeCashFlow = (id) => {
    const updated = cashFlows.filter(cf => cf.id !== id);
    setCashFlows(updated);
    saveGoals({ cashFlows: updated });
  };'''
replace_once(old_helpers, new_helpers, "cash flow helpers")

# ---------- 8) form toggle state name ----------
replace_once(
    '  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false);',
    '  const [showCashFlowForm, setShowCashFlowForm] = useState(false);\n  const [cashFlowType, setCashFlowType] = useState("withdrawal");',
    "form toggle state"
)

# ---------- 8b) orphan setWithdrawals in fresh-account branch ----------
replace_once(
    '      setWithdrawals([]);',
    '      setCashFlows([]);',
    "fresh-account setCashFlows"
)

# ---------- 9) section header + toggle button ----------
old_header = '''      {/* Withdrawal / Payout Tracker */}
      <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 22px", marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8 }}>💰 Withdrawals / Pay Yourself</div>
          <button onClick={()=>setShowWithdrawalForm(!showWithdrawalForm)} style={{ padding:"4px 12px", borderRadius:6, border:"1px solid rgba(99,102,241,0.2)", background:"rgba(99,102,241,0.06)", color:"#a5b4fc", cursor:"pointer", fontSize:10, fontWeight:600 }}>{showWithdrawalForm ? "Cancel" : "+ Log Withdrawal"}</button>
        </div>'''
new_header = '''      {/* Cash Flow Tracker — deposits + withdrawals */}
      <div style={{ background:"var(--tp-panel)", border:"1px solid var(--tp-panel-b)", borderRadius:14, padding:"20px 22px", marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"var(--tp-faint)", textTransform:"uppercase", letterSpacing:0.8 }}>💰 Cash Flow — Deposits & Withdrawals</div>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={()=>{setCashFlowType("deposit");setShowCashFlowForm(showCashFlowForm && cashFlowType==="deposit" ? false : true);}} style={{ padding:"4px 12px", borderRadius:6, border:"1px solid rgba(74,222,128,0.25)", background: showCashFlowForm && cashFlowType==="deposit" ? "rgba(74,222,128,0.15)" : "rgba(74,222,128,0.06)", color:"#4ade80", cursor:"pointer", fontSize:10, fontWeight:600 }}>{showCashFlowForm && cashFlowType==="deposit" ? "Cancel" : "+ Deposit"}</button>
            <button onClick={()=>{setCashFlowType("withdrawal");setShowCashFlowForm(showCashFlowForm && cashFlowType==="withdrawal" ? false : true);}} style={{ padding:"4px 12px", borderRadius:6, border:"1px solid rgba(99,102,241,0.2)", background: showCashFlowForm && cashFlowType==="withdrawal" ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.06)", color:"#a5b4fc", cursor:"pointer", fontSize:10, fontWeight:600 }}>{showCashFlowForm && cashFlowType==="withdrawal" ? "Cancel" : "+ Withdrawal"}</button>
          </div>
        </div>'''
replace_once(old_header, new_header, "header + toggle buttons")

# ---------- 10) summary cards ----------
old_summary = '''        {/* Summary */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, marginBottom:14 }}>
          <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", marginBottom:3 }}>Total withdrawn</div>
            <div style={{ fontSize:18, fontWeight:700, color:"#a5b4fc", fontFamily:"'JetBrains Mono', monospace" }}>${totalWithdrawn.toFixed(0)}</div>
          </div>
          <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", marginBottom:3 }}>This month</div>
            <div style={{ fontSize:18, fontWeight:700, color:"#a5b4fc", fontFamily:"'JetBrains Mono', monospace" }}>${monthWithdrawn.toFixed(0)}</div>
          </div>
          <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", marginBottom:3 }}>Net earned (after payouts)</div>
            <div style={{ fontSize:18, fontWeight:700, color:totalPnL-totalWithdrawn>=0?"#4ade80":"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>${(totalPnL - totalWithdrawn).toFixed(0)}</div>
          </div>
        </div>'''
new_summary = '''        {/* Summary */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10, marginBottom:14 }}>
          <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", marginBottom:3 }}>Total deposited</div>
            <div style={{ fontSize:18, fontWeight:700, color:"#4ade80", fontFamily:"'JetBrains Mono', monospace" }}>${totalDeposited.toFixed(0)}</div>
          </div>
          <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", marginBottom:3 }}>Total withdrawn</div>
            <div style={{ fontSize:18, fontWeight:700, color:"#a5b4fc", fontFamily:"'JetBrains Mono', monospace" }}>${totalWithdrawn.toFixed(0)}</div>
          </div>
          <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", marginBottom:3 }}>This month</div>
            <div style={{ fontSize:11, color:"var(--tp-faintest)", fontFamily:"'JetBrains Mono', monospace" }}>+${monthDeposited.toFixed(0)} / -${monthWithdrawn.toFixed(0)}</div>
            <div style={{ fontSize:14, fontWeight:700, color:(monthDeposited-monthWithdrawn)>=0?"#4ade80":"#a5b4fc", fontFamily:"'JetBrains Mono', monospace", marginTop:2 }}>${(monthDeposited-monthWithdrawn).toFixed(0)}</div>
          </div>
          <div style={{ background:"var(--tp-card)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"var(--tp-faintest)", textTransform:"uppercase", marginBottom:3 }}>Net earned (after payouts)</div>
            <div style={{ fontSize:18, fontWeight:700, color:totalPnL-totalWithdrawn>=0?"#4ade80":"#f87171", fontFamily:"'JetBrains Mono', monospace" }}>${(totalPnL - totalWithdrawn).toFixed(0)}</div>
          </div>
        </div>'''
replace_once(old_summary, new_summary, "summary cards")

# ---------- 11) add form ----------
old_form = '''        {/* Add withdrawal form */}
        {showWithdrawalForm && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:8, marginBottom:12, alignItems:"end" }}>
            <div>
              <div style={{ fontSize:9, color:"var(--tp-faintest)", marginBottom:3 }}>Amount</div>
              <input id="withdrawal-amount" type="number" step="0.01" placeholder="500" style={{ ...inputStyle, width:"100%", textAlign:"left", padding:"7px 8px" }}/>
            </div>
            <div>
              <div style={{ fontSize:9, color:"var(--tp-faintest)", marginBottom:3 }}>Date</div>
              <input id="withdrawal-date" type="date" defaultValue={todayStr} style={{ ...inputStyle, width:"100%", textAlign:"left", padding:"7px 8px" }}/>
            </div>
            <div>
              <div style={{ fontSize:9, color:"var(--tp-faintest)", marginBottom:3 }}>Note</div>
              <input id="withdrawal-note" type="text" placeholder="Payout, transfer..." style={{ ...inputStyle, width:"100%", textAlign:"left", padding:"7px 8px", fontFamily:"inherit" }}/>
            </div>
            <button onClick={()=>{const amt=parseFloat(document.getElementById("withdrawal-amount")?.value)||0;const dt=document.getElementById("withdrawal-date")?.value||todayStr;const note=document.getElementById("withdrawal-note")?.value||"";if(amt>0){addWithdrawal(amt,dt,note);setShowWithdrawalForm(false);}}} style={{ padding:"7px 16px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}>Save</button>
          </div>
        )}'''
new_form = '''        {/* Add cash flow form */}
        {showCashFlowForm && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:8, marginBottom:12, alignItems:"end" }}>
            <div>
              <div style={{ fontSize:9, color:"var(--tp-faintest)", marginBottom:3 }}>{cashFlowType === "deposit" ? "Deposit amount" : "Withdrawal amount"}</div>
              <input id="cashflow-amount" type="number" step="0.01" placeholder="500" style={{ ...inputStyle, width:"100%", textAlign:"left", padding:"7px 8px" }}/>
            </div>
            <div>
              <div style={{ fontSize:9, color:"var(--tp-faintest)", marginBottom:3 }}>Date</div>
              <input id="cashflow-date" type="date" defaultValue={todayStr} style={{ ...inputStyle, width:"100%", textAlign:"left", padding:"7px 8px" }}/>
            </div>
            <div>
              <div style={{ fontSize:9, color:"var(--tp-faintest)", marginBottom:3 }}>Note</div>
              <input id="cashflow-note" type="text" placeholder={cashFlowType === "deposit" ? "Funded account, transfer in..." : "Payout, transfer out..."} style={{ ...inputStyle, width:"100%", textAlign:"left", padding:"7px 8px", fontFamily:"inherit" }}/>
            </div>
            <button onClick={()=>{const amt=parseFloat(document.getElementById("cashflow-amount")?.value)||0;const dt=document.getElementById("cashflow-date")?.value||todayStr;const note=document.getElementById("cashflow-note")?.value||"";if(amt>0){addCashFlow(cashFlowType,amt,dt,note);setShowCashFlowForm(false);}}} style={{ padding:"7px 16px", borderRadius:8, border:"none", background: cashFlowType === "deposit" ? "linear-gradient(135deg,#059669,#34d399)" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}>Save {cashFlowType === "deposit" ? "Deposit" : "Withdrawal"}</button>
          </div>
        )}'''
replace_once(old_form, new_form, "add form")

# ---------- 12) history list ----------
old_list = '''        {/* Withdrawal history */}
        {withdrawals.length > 0 && (
          <div>
            {[...withdrawals].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(w => (
              <div key={w.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 10px", background:"var(--tp-card)", borderRadius:6, marginBottom:3, fontSize:11 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ color:"var(--tp-faintest)", fontFamily:"'JetBrains Mono', monospace" }}>{w.date}</span>
                  <span style={{ color:"#a5b4fc", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>-${w.amount.toFixed(2)}</span>
                  {w.note && <span style={{ color:"var(--tp-faint)" }}>{w.note}</span>}
                </div>
                <button onClick={()=>removeWithdrawal(w.id)} style={{ background:"none", border:"none", color:"var(--tp-faintest)", cursor:"pointer", padding:0 }}><Trash2 size={11}/></button>
              </div>
            ))}
          </div>
        )}'''
new_list = '''        {/* Cash flow history */}
        {cashFlows.length > 0 && (
          <div>
            {[...cashFlows].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(cf => {
              const isDeposit = cf.type === 'deposit';
              return (
                <div key={cf.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 10px", background:"var(--tp-card)", borderRadius:6, marginBottom:3, fontSize:11 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ color:"var(--tp-faintest)", fontFamily:"'JetBrains Mono', monospace" }}>{cf.date}</span>
                    <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background: isDeposit ? "rgba(74,222,128,0.12)" : "rgba(99,102,241,0.12)", color: isDeposit ? "#4ade80" : "#a5b4fc", textTransform:"uppercase", letterSpacing:0.5, fontWeight:600 }}>{isDeposit ? "Deposit" : "Withdrawal"}</span>
                    <span style={{ color: isDeposit ? "#4ade80" : "#a5b4fc", fontWeight:600, fontFamily:"'JetBrains Mono', monospace" }}>{isDeposit ? "+" : "-"}${(cf.amount||0).toFixed(2)}</span>
                    {cf.note && <span style={{ color:"var(--tp-faint)" }}>{cf.note}</span>}
                  </div>
                  <button onClick={()=>removeCashFlow(cf.id)} style={{ background:"none", border:"none", color:"var(--tp-faintest)", cursor:"pointer", padding:0 }}><Trash2 size={11}/></button>
                </div>
              );
            })}
          </div>
        )}'''
replace_once(old_list, new_list, "history list")

PATH.write_text(src)
print("\nAll patches applied successfully.")
