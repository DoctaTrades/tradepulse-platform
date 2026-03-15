import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { BookOpen, Plus, Check, X, Menu, Settings, Home, Clipboard, List, Briefcase, DollarSign, Crosshair, Target, Shield, FileText, BarChart3, Search, TrendingUp } from "lucide-react";
import JournalModule from "./modules/journal/JournalModule";
import ScreenerModule from "./modules/screener/ScreenerModule";

// ─── SUPABASE CLIENT ─────────────────────────────────────────────────────────
const SUPABASE_URL = "https://odpgrgyiivbcbbqcdkxm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kcGdyZ3lpaXZiY2JicWNka3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTA1MjcsImV4cCI6MjA4NjA4NjUyN30.PqDzDUIxav7F_dZbp_BWWRt4J1wUjugl2QOH7gxZz_A";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── THEMES ──────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:"#0d0f14", bgSecondary:"#12141a", bgTertiary:"#161922",
    panelBg:"#161922", panelBorder:"rgba(255,255,255,0.07)",
    text:"#e2e4ea", textSecondary:"#c8cad0", textMuted:"#8a8f9e", textFaint:"#5c6070", textFaintest:"#3d4150",
    border:"rgba(255,255,255,0.06)", borderLight:"rgba(255,255,255,0.1)",
    inputBg:"#1e2028", cardBg:"rgba(255,255,255,0.02)",
    headerBg:"rgba(13,15,20,0.85)", headerBorder:"rgba(255,255,255,0.06)",
    activeBg:"rgba(99,102,241,0.12)", selectOptionBg:"#1e2028"
  },
  light: {
    bg:"#f5f6fa", bgSecondary:"#ffffff", bgTertiary:"#eef0f5",
    panelBg:"#ffffff", panelBorder:"rgba(0,0,0,0.08)",
    text:"#1a1a2e", textSecondary:"#374151", textMuted:"#6b7280", textFaint:"#9ca3af", textFaintest:"#d1d5db",
    border:"rgba(0,0,0,0.08)", borderLight:"rgba(0,0,0,0.12)",
    inputBg:"#f3f4f6", cardBg:"rgba(0,0,0,0.02)",
    headerBg:"rgba(255,255,255,0.9)", headerBorder:"rgba(0,0,0,0.08)",
    activeBg:"rgba(99,102,241,0.08)", selectOptionBg:"#ffffff"
  }
};

// ─── AUTH SCREEN ─────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message); else onAuth(data.user);
    setLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    if (err) setError(err.message);
    else if (data.user && !data.user.confirmed_at && !data.session) { setMessage("Check your email for a confirmation link!"); setMode("login"); }
    else if (data.user) onAuth(data.user);
    setLoading(false);
  };

  const handleForgot = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    if (err) setError(err.message); else { setMessage("Password reset email sent!"); setMode("login"); }
    setLoading(false);
  };

  const handleOAuth = async (provider) => {
    setLoading(true); setError("");
    const { error: err } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (err) { setError(err.message); setLoading(false); }
  };

  const inputStyle = { width:"100%", padding:"12px 16px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg, #0c0e14 0%, #131620 50%, #0f1118 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter', -apple-system, sans-serif" }}>
      <div style={{ width:"min(92vw, 420px)", padding:36, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:20, boxShadow:"0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:32, fontWeight:800, background:"linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:6 }}>TradePulse</div>
          <div style={{ fontSize:13, color:"#6b7280" }}>Your trading platform, everywhere</div>
        </div>
        {error && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#f87171" }}>{error}</div>}
        {message && <div style={{ background:"rgba(74,222,128,0.1)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#4ade80" }}>{message}</div>}
        <form onSubmit={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleForgot}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" required/>
          </div>
          {mode !== "forgot" && <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={inputStyle} placeholder="••••••••" required/>
          </div>}
          {mode === "signup" && <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} style={inputStyle} placeholder="••••••••" required/>
          </div>}
          <button type="submit" disabled={loading} style={{ width:"100%", padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", fontSize:14, fontWeight:600, cursor:loading?"wait":"pointer", marginBottom:12, opacity:loading?0.7:1 }}>
            {loading ? "..." : mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
          </button>
        </form>
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          <button onClick={()=>handleOAuth("google")} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.08)", background:"transparent", color:"#9ca3af", cursor:"pointer", fontSize:12, fontWeight:500 }}>Google</button>
          <button onClick={()=>handleOAuth("discord")} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.08)", background:"transparent", color:"#9ca3af", cursor:"pointer", fontSize:12, fontWeight:500 }}>Discord</button>
        </div>
        <div style={{ textAlign:"center", fontSize:12, color:"#6b7280" }}>
          {mode === "login" && <><span onClick={()=>{setMode("signup");setError("");}} style={{ color:"#818cf8", cursor:"pointer" }}>Create account</span> · <span onClick={()=>{setMode("forgot");setError("");}} style={{ color:"#818cf8", cursor:"pointer" }}>Forgot password</span></>}
          {mode !== "login" && <span onClick={()=>{setMode("login");setError("");}} style={{ color:"#818cf8", cursor:"pointer" }}>Back to sign in</span>}
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR SECTIONS ────────────────────────────────────────────────────────
const SIDEBAR_SECTIONS = [
  { label: "Core", items: [
    { id:"dashboard", label:"Dashboard", icon:Home },
    { id:"journal", label:"Journal", icon:Clipboard },
    { id:"log", label:"Trade Log", icon:List },
  ]},
  { label: "Tracking", items: [
    { id:"holdings", label:"Holdings", icon:Briefcase },
    { id:"wheel", label:"Premium", icon:DollarSign },
    { id:"watchlist", label:"Watchlist", icon:Crosshair },
  ]},
  { label: "Analysis", items: [
    { id:"goals", label:"Goals", icon:Target },
    { id:"review", label:"Review", icon:Shield },
    { id:"reports", label:"Reports", icon:FileText },
  ]},
  { label: "Research", items: [
    { id:"deepdive", label:"Stock Deep Dive", icon:TrendingUp, soon:true },
    { id:"screener", label:"Screener", icon:Search },
  ]},
  { label: "Tools", items: [
    { id:"playbook", label:"Playbook", icon:BookOpen },
  ]},
];

const ALL_NAV_ITEMS = SIDEBAR_SECTIONS.flatMap(s => s.items);

// ─── MAIN APP SHELL ──────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prefs, setPrefs] = useState({ theme: "dark" });

  // Auth check on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const theme = THEMES[prefs.theme] || THEMES.dark;
  const activeTab = ALL_NAV_ITEMS.find(t => t.id === tab) || { id:"settings", label:"Settings", icon:Settings };

  // Inject theme CSS
  useEffect(() => {
    let style = document.getElementById("tp-theme-vars");
    if (!style) { style = document.createElement("style"); style.id = "tp-theme-vars"; document.head.appendChild(style); }
    style.textContent = `
      :root { --tp-bg:${theme.bg}; --tp-bg2:${theme.bgSecondary}; --tp-bg3:${theme.bgTertiary}; --tp-panel:${theme.panelBg}; --tp-panel-b:${theme.panelBorder}; --tp-text:${theme.text}; --tp-text2:${theme.textSecondary}; --tp-muted:${theme.textMuted}; --tp-faint:${theme.textFaint}; --tp-faintest:${theme.textFaintest}; --tp-border:${theme.border}; --tp-border-l:${theme.borderLight}; --tp-input:${theme.inputBg}; --tp-card:${theme.cardBg}; --tp-sel-bg:${theme.selectOptionBg}; }
      body { margin:0; background:${theme.bg}; }
      select option { background:${theme.selectOptionBg} !important; color:${theme.text} !important; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (max-width: 768px) {
        .tp-sidebar { display: none !important; }
        .tp-hamburger { display: flex !important; }
        .tp-topbar { padding: 10px 14px !important; }
        .tp-new-trade-text { display: none; }
        .tp-content { padding: 14px 10px !important; }
        .tp-modal-overlay { align-items: flex-end !important; }
        .tp-modal { width: 100vw !important; max-height: 95vh !important; border-radius: 18px 18px 0 0 !important; padding: 18px 14px !important; }
        .tp-modal-grid4 { grid-template-columns: 1fr 1fr !important; }
        .tp-modal-grid3 { grid-template-columns: 1fr !important; }
        .tp-modal-expiry-fees { grid-template-columns: 1fr !important; }
        .tp-leg-row { grid-template-columns: 28px 1fr 0.8fr 1fr !important; gap: 4px !important; row-gap: 6px !important; }
        .tp-stat-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
        .tp-mini-stat-grid { grid-template-columns: repeat(3, 1fr) !important; }
        .tp-acct-grid { grid-template-columns: 1fr !important; }
        .tp-filter-bar { flex-direction: column !important; align-items: flex-start !important; }
        .tp-chart-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
        .tp-chart-toggles { flex-wrap: wrap !important; }
        .tp-calendar-grid { font-size: 9px !important; }
        .tp-daily-row { font-size: 10px !important; }
        .tp-goals-setup { grid-template-columns: 1fr !important; }
        .tp-goals-main { grid-template-columns: 1fr !important; }
        .tp-goals-targets-grid { grid-template-columns: 1fr !important; }
        .tp-goals-stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
        .tp-goals-proj-milestones { grid-template-columns: repeat(2, 1fr) !important; }
        .tp-goals-log-row { grid-template-columns: 60px 1fr 60px 70px 40px 20px !important; font-size: 10px !important; }
        .tp-prem-summary { grid-template-columns: repeat(2, 1fr) !important; }
        .tp-prem-mid { grid-template-columns: 1fr !important; }
        .tp-prem-strat-hdr, .tp-prem-strat-row { grid-template-columns: 80px 40px 75px 70px 70px 70px 50px !important; font-size: 10px !important; }
      }
    `;
  }, [theme]);

  if (loading) return <div style={{ minHeight:"100vh", background:"#0d0f14", display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ color:"#6366f1", fontSize:18, fontWeight:600 }}>Loading...</div></div>;
  if (!user) return <AuthScreen onAuth={setUser}/>;

  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); };

  return (
    <div style={{ minHeight:"100vh", background:theme.bg, color:theme.text, fontFamily:"'Inter', system-ui, sans-serif", display:"flex" }}>
      {/* ═══════ SIDEBAR ═══════ */}
      <div className="tp-sidebar" style={{ width: sidebarCollapsed ? 56 : 210, background:theme.bgSecondary, borderRight:`1px solid ${theme.border}`, display:"flex", flexDirection:"column", flexShrink:0, overflow:"hidden", transition:"width 0.2s", position:"sticky", top:0, height:"100vh" }}>
        {/* Logo */}
        <div style={{ padding: sidebarCollapsed ? "16px 12px" : "18px 16px 14px", borderBottom:`1px solid ${theme.border}`, display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={()=>setSidebarCollapsed(!sidebarCollapsed)}>
          <div style={{ width:30, height:30, borderRadius:8, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><BookOpen size={15} color="#fff"/></div>
          {!sidebarCollapsed && <span style={{ fontSize:16, fontWeight:800, background:"linear-gradient(135deg,#a5b4fc,#c4b5fd)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", whiteSpace:"nowrap" }}>TradePulse</span>}
        </div>

        {/* Nav sections */}
        <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {SIDEBAR_SECTIONS.map(section => (
            <div key={section.label}>
              {!sidebarCollapsed && <div style={{ padding:"12px 18px 4px", fontSize:9, color:theme.textFaintest, textTransform:"uppercase", letterSpacing:1.2, fontWeight:700 }}>{section.label}</div>}
              {sidebarCollapsed && <div style={{ height:1, background:theme.border, margin:"6px 8px" }}/>}
              {section.items.map(t => (
                <button key={t.id} onClick={()=>{if(!t.soon){setTab(t.id);setMobileMenuOpen(false);}}} title={sidebarCollapsed ? t.label : undefined} style={{
                  display:"flex", alignItems:"center", gap:10, width:"calc(100% - 8px)", margin:"1px 4px",
                  padding: sidebarCollapsed ? "9px 0" : "8px 14px", justifyContent: sidebarCollapsed ? "center" : "flex-start",
                  borderRadius:8, border:"none", cursor: t.soon ? "default" : "pointer", fontSize:13, fontWeight: tab===t.id ? 600 : 500, transition:"all 0.15s",
                  background: tab===t.id ? theme.activeBg : "transparent",
                  color: t.soon ? theme.textFaintest : tab===t.id ? "#a5b4fc" : theme.textFaint,
                  opacity: t.soon ? 0.5 : 1,
                  position:"relative"
                }}>
                  <t.icon size={16}/>
                  {!sidebarCollapsed && <span style={{ whiteSpace:"nowrap" }}>{t.label}</span>}
                  {!sidebarCollapsed && t.soon && <span style={{ marginLeft:"auto", fontSize:7, fontWeight:700, background:"rgba(234,179,8,0.15)", color:"#eab308", padding:"2px 5px", borderRadius:6 }}>SOON</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom — Settings + Sign Out */}
        <div style={{ borderTop:`1px solid ${theme.border}`, padding:"8px 4px" }}>
          <button onClick={()=>{setTab("settings");setMobileMenuOpen(false);}} style={{
            display:"flex", alignItems:"center", gap:10, width:"calc(100% - 8px)", margin:"1px 4px",
            padding: sidebarCollapsed ? "9px 0" : "8px 14px", justifyContent: sidebarCollapsed ? "center" : "flex-start",
            borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight: tab==="settings" ? 600 : 500,
            background: tab==="settings" ? theme.activeBg : "transparent",
            color: tab==="settings" ? "#a5b4fc" : theme.textFaint
          }}>
            <Settings size={16}/>
            {!sidebarCollapsed && <span>Settings</span>}
          </button>
          {!sidebarCollapsed && (
            <div style={{ padding:"8px 14px 4px" }}>
              <div style={{ fontSize:10, color:theme.textFaintest, marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email}</div>
              <button onClick={handleSignOut} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"6px 10px", borderRadius:6, border:`1px solid ${theme.borderLight}`, background:"transparent", color:theme.textFaint, cursor:"pointer", fontSize:10, fontWeight:600 }}>Sign Out</button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ MOBILE MENU ═══════ */}
      {mobileMenuOpen && <>
        <div onClick={()=>setMobileMenuOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:60 }}/>
        <div style={{ position:"fixed", top:0, left:0, bottom:0, width:260, background:theme.bgSecondary, borderRight:`1px solid ${theme.border}`, zIndex:70, padding:"20px 0", display:"flex", flexDirection:"column", boxShadow:"4px 0 30px rgba(0,0,0,0.4)" }}>
          <div style={{ padding:"0 20px 18px", borderBottom:`1px solid ${theme.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
              <div style={{ width:28, height:28, borderRadius:7, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center" }}><BookOpen size={14} color="#fff"/></div>
              <span style={{ fontSize:16, fontWeight:700, color:theme.text }}>TradePulse</span>
            </div>
            <button onClick={()=>setMobileMenuOpen(false)} style={{ background:"none", border:"none", color:theme.textFaint, cursor:"pointer", padding:4 }}><X size={18}/></button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"12px 10px" }}>
            {SIDEBAR_SECTIONS.map(section => (
              <div key={section.label}>
                <div style={{ padding:"12px 14px 4px", fontSize:9, color:theme.textFaintest, textTransform:"uppercase", letterSpacing:1.2, fontWeight:700 }}>{section.label}</div>
                {section.items.filter(t => !t.soon).map(t => (
                  <button key={t.id} onClick={()=>{setTab(t.id);setMobileMenuOpen(false);}} style={{ display:"flex", alignItems:"center", gap:12, width:"100%", padding:"10px 14px", borderRadius:10, border:"none", background:tab===t.id?theme.activeBg:"transparent", color:tab===t.id?"#a5b4fc":theme.textMuted, cursor:"pointer", fontSize:14, fontWeight:tab===t.id?600:500, marginBottom:2 }}>
                    <t.icon size={16}/> {t.label}
                  </button>
                ))}
              </div>
            ))}
            <div style={{ padding:"12px 14px 4px", fontSize:9, color:theme.textFaintest, textTransform:"uppercase", letterSpacing:1.2, fontWeight:700 }}>System</div>
            <button onClick={()=>{setTab("settings");setMobileMenuOpen(false);}} style={{ display:"flex", alignItems:"center", gap:12, width:"100%", padding:"10px 14px", borderRadius:10, border:"none", background:tab==="settings"?theme.activeBg:"transparent", color:tab==="settings"?"#a5b4fc":theme.textMuted, cursor:"pointer", fontSize:14, fontWeight:tab==="settings"?600:500 }}>
              <Settings size={16}/> Settings
            </button>
          </div>
          <div style={{ padding:"14px 20px", borderTop:`1px solid ${theme.border}` }}>
            <div style={{ fontSize:11, color:theme.textFaintest, marginBottom:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email}</div>
            <button onClick={()=>{handleSignOut();setMobileMenuOpen(false);}} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"9px 14px", borderRadius:8, border:`1px solid ${theme.borderLight}`, background:"transparent", color:theme.textFaint, cursor:"pointer", fontSize:12, fontWeight:600 }}>Sign Out</button>
          </div>
        </div>
      </>}

      {/* ═══════ MAIN CONTENT ═══════ */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:"100vh" }}>
        {/* Top bar */}
        <div className="tp-topbar" style={{ padding:"12px 28px", borderBottom:`1px solid ${theme.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:theme.bg, position:"sticky", top:0, zIndex:10, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button className="tp-hamburger" onClick={()=>setMobileMenuOpen(p=>!p)} style={{ display:"none", alignItems:"center", justifyContent:"center", width:36, height:36, borderRadius:8, border:"none", background:"transparent", color:theme.textMuted, cursor:"pointer", padding:0 }}>
              {mobileMenuOpen ? <X size={20}/> : <Menu size={20}/>}
            </button>
            <span style={{ fontSize:18, fontWeight:700, color:theme.text }}>{activeTab?.label || "Settings"}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {/* New Trade button - journal module will wire this up */}
            <div id="tp-shell-actions"/>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="tp-content" style={{ flex:1, overflowY:"auto", padding:"24px 28px" }}>
          {/* Journal module handles ALL current TradePulse tabs */}
          <JournalModule 
            user={user} 
            tab={tab} 
            setTab={setTab}
            theme={theme} 
            prefs={prefs}
            setPrefs={setPrefs}
          />

          {/* Screener module */}
          {tab === "screener" && <ScreenerModule user={user} theme={theme}/>}

          {/* Future: Research module */}
          {tab === "deepdive" && (
            <div style={{ textAlign:"center", padding:"80px 20px" }}>
              <div style={{ fontSize:48, marginBottom:16, opacity:0.4 }}>📈</div>
              <div style={{ fontSize:20, fontWeight:700, color:theme.text, marginBottom:8 }}>Stock Deep Dive</div>
              <div style={{ fontSize:13, color:theme.textFaint, maxWidth:400, margin:"0 auto", lineHeight:1.6 }}>Fundamental analysis, technical health reports, and key metrics for any ticker. Coming soon.</div>
              <div style={{ marginTop:20, fontSize:11, color:"#eab308", background:"rgba(234,179,8,0.08)", display:"inline-block", padding:"6px 14px", borderRadius:8, border:"1px solid rgba(234,179,8,0.2)" }}>Under Development</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
