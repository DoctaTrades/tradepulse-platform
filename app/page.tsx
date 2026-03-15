'use client';

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import dynamic from 'next/dynamic';

// Icons (inline SVG to avoid lucide dependency conflicts)
const Icon = ({ d, size = 16, color = "currentColor" }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
);

const ICONS = {
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  clipboard: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6v4H9z",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",
  dollar: "M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  crosshair: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M22 12h-4 M6 12H2 M12 6V2 M12 22v-4",
  target: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  fileText: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  trendUp: "M23 6l-9.5 9.5-5-5L1 18",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  x: "M18 6L6 18 M6 6l12 12",
  menu: "M3 12h18 M3 6h18 M3 18h18",
  plus: "M12 5v14 M5 12h14",
  check: "M20 6L9 17l-5-5",
};

// Supabase
const SUPABASE_URL = "https://odpgrgyiivbcbbqcdkxm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kcGdyZ3lpaXZiY2JicWNka3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTA1MjcsImV4cCI6MjA4NjA4NjUyN30.PqDzDUIxav7F_dZbp_BWWRt4J1wUjugl2QOH7gxZz_A";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Dynamic imports for heavy modules (code splitting)
const JournalModule = dynamic(() => import('./modules/journal/JournalModule'), { ssr: false, loading: () => <div style={{ padding: 40, textAlign: "center", color: "#5c6070" }}>Loading journal...</div> });
const ScreenerModule = dynamic(() => import('./modules/screener/ScreenerModule'), { ssr: false, loading: () => <div style={{ padding: 40, textAlign: "center", color: "#5c6070" }}>Loading screener...</div> });
const MarketPulseModule = dynamic(() => import('./modules/research/MarketPulseModule'), { ssr: false, loading: () => <div style={{ padding: 40, textAlign: "center", color: "#5c6070" }}>Loading market pulse...</div> });

// ─── AUTH SCREEN ─────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }: { onAuth: (user: any) => void }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError("");
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message); else onAuth(data.user);
    setLoading(false);
  };
  const handleSignup = async (e: React.FormEvent) => {
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
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    if (err) setError(err.message); else { setMessage("Password reset email sent!"); setMode("login"); }
    setLoading(false);
  };
  const handleOAuth = async (provider: 'google' | 'discord') => {
    setLoading(true); setError("");
    const { error: err } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (err) { setError(err.message); setLoading(false); }
  };

  const iStyle: React.CSSProperties = { width:"100%", padding:"12px 16px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" as const };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg, #0c0e14 0%, #131620 50%, #0f1118 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter', sans-serif" }}>
      <div style={{ width:"min(92vw, 420px)", padding:36, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:20, boxShadow:"0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:32, fontWeight:800, background:"linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:6 }}>TradePulse</div>
          <div style={{ fontSize:13, color:"#6b7280" }}>Your trading platform, everywhere</div>
        </div>
        {error && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#f87171" }}>{error}</div>}
        {message && <div style={{ background:"rgba(74,222,128,0.1)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#4ade80" }}>{message}</div>}
        <form onSubmit={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleForgot}>
          <div style={{ marginBottom:12 }}><label style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={iStyle} placeholder="you@example.com" required/></div>
          {mode !== "forgot" && <div style={{ marginBottom:12 }}><label style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={iStyle} placeholder="••••••••" required/></div>}
          {mode === "signup" && <div style={{ marginBottom:12 }}><label style={{ fontSize:11, color:"#6b7280", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Confirm Password</label><input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} style={iStyle} placeholder="••••••••" required/></div>}
          <button type="submit" disabled={loading} style={{ width:"100%", padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", fontSize:14, fontWeight:600, cursor:loading?"wait":"pointer", marginBottom:12, opacity:loading?0.7:1 }}>
            {loading ? "..." : mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
          </button>
        </form>
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          <button onClick={()=>handleOAuth("google")} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.08)", background:"transparent", color:"#9ca3af", cursor:"pointer", fontSize:12, fontWeight:500 }}>Google</button>
          <button onClick={()=>handleOAuth("discord")} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.08)", background:"transparent", color:"#9ca3af", cursor:"pointer", fontSize:12, fontWeight:500 }}>Discord</button>
        </div>
        <div style={{ textAlign:"center", fontSize:12, color:"#6b7280" }}>
          {mode === "login" ? <><span onClick={()=>{setMode("signup");setError("");}} style={{ color:"#818cf8", cursor:"pointer" }}>Create account</span> · <span onClick={()=>{setMode("forgot");setError("");}} style={{ color:"#818cf8", cursor:"pointer" }}>Forgot password</span></> : <span onClick={()=>{setMode("login");setError("");}} style={{ color:"#818cf8", cursor:"pointer" }}>Back to sign in</span>}
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR CONFIG ──────────────────────────────────────────────────────────
const SIDEBAR = [
  { label:"Core", items:[
    { id:"dashboard", icon:"home", name:"Dashboard" },
    { id:"journal", icon:"clipboard", name:"Journal" },
    { id:"log", icon:"list", name:"Trade Log" },
  ]},
  { label:"Tracking", items:[
    { id:"holdings", icon:"briefcase", name:"Holdings" },
    { id:"wheel", icon:"dollar", name:"Premium" },
    { id:"watchlist", icon:"crosshair", name:"Watchlist" },
  ]},
  { label:"Analysis", items:[
    { id:"goals", icon:"target", name:"Goals" },
    { id:"review", icon:"shield", name:"Review" },
    { id:"reports", icon:"fileText", name:"Reports" },
  ]},
  { label:"Research", items:[
    { id:"screener", icon:"search", name:"Screener" },
    { id:"marketpulse", icon:"trendUp", name:"Market Pulse" },
  ]},
  { label:"Tools", items:[
    { id:"playbook", icon:"book", name:"Playbook" },
  ]},
];

const JOURNAL_TABS = ["dashboard","journal","log","holdings","wheel","watchlist","goals","review","reports","playbook","settings"];

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function TradePulsePlatform() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prefs, setPrefs] = useState({ theme: "dark" });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setUser(session?.user ?? null); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => { setUser(session?.user ?? null); });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div style={{ minHeight:"100vh", background:"#0d0f14", display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ color:"#6366f1", fontSize:18, fontWeight:600 }}>Loading...</div></div>;
  if (!user) return <AuthScreen onAuth={setUser}/>;

  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); };
  const activeItem = SIDEBAR.flatMap(s=>s.items).find(i=>i.id===tab) || { id:"settings", icon:"settings", name:"Settings" };

  const SidebarIcon = ({ icon, size = 16 }: { icon: string; size?: number }) => {
    const d = (ICONS as any)[icon];
    return d ? <Icon d={d} size={size}/> : <span>•</span>;
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0d0f14", color:"#e2e4ea", fontFamily:"'Inter', system-ui, sans-serif", display:"flex" }}>
      {/* ═══ SIDEBAR ═══ */}
      <div className="tp-sidebar" style={{ width: collapsed ? 56 : 210, background:"#12141a", borderRight:"1px solid rgba(255,255,255,0.06)", display:"flex", flexDirection:"column", flexShrink:0, overflow:"hidden", transition:"width 0.2s", position:"sticky", top:0, height:"100vh" }}>
        <div style={{ padding: collapsed ? "16px 12px" : "18px 16px 14px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={()=>setCollapsed(!collapsed)}>
          <div style={{ width:30, height:30, borderRadius:8, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><SidebarIcon icon="book" size={15}/></div>
          {!collapsed && <span style={{ fontSize:16, fontWeight:800, background:"linear-gradient(135deg,#a5b4fc,#c4b5fd)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", whiteSpace:"nowrap" }}>TradePulse</span>}
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {SIDEBAR.map(section => (
            <div key={section.label}>
              {!collapsed && <div style={{ padding:"12px 18px 4px", fontSize:9, color:"#3d4150", textTransform:"uppercase", letterSpacing:1.2, fontWeight:700 }}>{section.label}</div>}
              {collapsed && <div style={{ height:1, background:"rgba(255,255,255,0.06)", margin:"6px 8px" }}/>}
              {section.items.map(item => (
                <button key={item.id} onClick={()=>{if(!item.soon){setTab(item.id);setMobileOpen(false);}}} title={collapsed?item.name:undefined} style={{
                  display:"flex", alignItems:"center", gap:10, width:"calc(100% - 8px)", margin:"1px 4px",
                  padding: collapsed ? "9px 0" : "8px 14px", justifyContent: collapsed ? "center" : "flex-start",
                  borderRadius:8, border:"none", cursor: item.soon?"default":"pointer", fontSize:13,
                  fontWeight: tab===item.id?600:500, transition:"all 0.15s",
                  background: tab===item.id?"rgba(99,102,241,0.12)":"transparent",
                  color: item.soon?"#2a2e3a":tab===item.id?"#a5b4fc":"#5c6070",
                  opacity: item.soon?0.5:1, position:"relative"
                }}>
                  <SidebarIcon icon={item.icon}/>
                  {!collapsed && <span style={{ whiteSpace:"nowrap" }}>{item.name}</span>}
                  {!collapsed && item.soon && <span style={{ marginLeft:"auto", fontSize:7, fontWeight:700, background:"rgba(234,179,8,0.15)", color:"#eab308", padding:"2px 5px", borderRadius:6 }}>SOON</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", padding:"8px 4px" }}>
          <button onClick={()=>{setTab("settings");setMobileOpen(false);}} style={{
            display:"flex", alignItems:"center", gap:10, width:"calc(100% - 8px)", margin:"1px 4px",
            padding: collapsed?"9px 0":"8px 14px", justifyContent: collapsed?"center":"flex-start",
            borderRadius:8, border:"none", cursor:"pointer", fontSize:12,
            fontWeight: tab==="settings"?600:500, background: tab==="settings"?"rgba(99,102,241,0.12)":"transparent",
            color: tab==="settings"?"#a5b4fc":"#5c6070"
          }}><SidebarIcon icon="settings"/>{!collapsed && <span>Settings</span>}</button>
          {!collapsed && <div style={{ padding:"8px 14px 4px" }}>
            <div style={{ fontSize:10, color:"#3d4150", marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email}</div>
            <button onClick={handleSignOut} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"6px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"#5c6070", cursor:"pointer", fontSize:10, fontWeight:600 }}>Sign Out</button>
          </div>}
        </div>
      </div>

      {/* ═══ MOBILE MENU ═══ */}
      {mobileOpen && <>
        <div onClick={()=>setMobileOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:60 }}/>
        <div style={{ position:"fixed", top:0, left:0, bottom:0, width:260, background:"#12141a", borderRight:"1px solid rgba(255,255,255,0.06)", zIndex:70, padding:"20px 0", display:"flex", flexDirection:"column", boxShadow:"4px 0 30px rgba(0,0,0,0.4)" }}>
          <div style={{ padding:"0 20px 18px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:16, fontWeight:700, color:"#e2e4ea" }}>TradePulse</span>
            <button onClick={()=>setMobileOpen(false)} style={{ background:"none", border:"none", color:"#5c6070", cursor:"pointer" }}><Icon d={ICONS.x} size={18}/></button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"12px 10px" }}>
            {SIDEBAR.map(section => (
              <div key={section.label}>
                <div style={{ padding:"12px 14px 4px", fontSize:9, color:"#3d4150", textTransform:"uppercase", letterSpacing:1.2, fontWeight:700 }}>{section.label}</div>
                {section.items.filter(i=>!i.soon).map(item => (
                  <button key={item.id} onClick={()=>{setTab(item.id);setMobileOpen(false);}} style={{ display:"flex", alignItems:"center", gap:12, width:"100%", padding:"10px 14px", borderRadius:10, border:"none", background:tab===item.id?"rgba(99,102,241,0.12)":"transparent", color:tab===item.id?"#a5b4fc":"#8a8f9e", cursor:"pointer", fontSize:14, fontWeight:tab===item.id?600:500, marginBottom:2 }}>
                    <SidebarIcon icon={item.icon}/> {item.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div style={{ padding:"14px 20px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize:11, color:"#3d4150", marginBottom:8 }}>{user.email}</div>
            <button onClick={()=>{handleSignOut();setMobileOpen(false);}} style={{ width:"100%", padding:"9px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"#5c6070", cursor:"pointer", fontSize:12, fontWeight:600 }}>Sign Out</button>
          </div>
        </div>
      </>}

      {/* ═══ MAIN ═══ */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:"100vh" }}>
        <div className="tp-topbar" style={{ padding:"12px 28px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#0d0f14", position:"sticky", top:0, zIndex:10, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button className="tp-hamburger" onClick={()=>setMobileOpen(p=>!p)} style={{ display:"none", alignItems:"center", justifyContent:"center", width:36, height:36, borderRadius:8, border:"none", background:"transparent", color:"#8a8f9e", cursor:"pointer" }}>
              <Icon d={mobileOpen ? ICONS.x : ICONS.menu} size={20}/>
            </button>
            <span style={{ fontSize:18, fontWeight:700, color:"#e2e4ea" }}>{activeItem?.name || "Settings"}</span>
          </div>
          <div id="tp-shell-actions" style={{ display:"flex", alignItems:"center", gap:8 }}/>
        </div>

        <div className="tp-content" style={{ flex:1, overflowY:"auto", padding: tab === "screener" ? "0" : "24px 28px" }}>
          {/* Journal module handles all journal tabs */}
          {JOURNAL_TABS.includes(tab) && (
            <div className="tp-journal-module">
              <JournalModule user={user} tab={tab} setTab={setTab} theme={{
                bg:"#0d0f14", bgSecondary:"#12141a", bgTertiary:"#161922",
                panelBg:"#161922", panelBorder:"rgba(255,255,255,0.07)",
                text:"#e2e4ea", textSecondary:"#c8cad0", textMuted:"#8a8f9e", textFaint:"#5c6070", textFaintest:"#3d4150",
                border:"rgba(255,255,255,0.06)", borderLight:"rgba(255,255,255,0.1)",
                inputBg:"#1e2028", cardBg:"rgba(255,255,255,0.02)",
                headerBg:"rgba(13,15,20,0.85)", headerBorder:"rgba(255,255,255,0.06)",
                activeBg:"rgba(99,102,241,0.12)", selectOptionBg:"#1e2028"
              }} prefs={prefs} setPrefs={setPrefs}/>
            </div>
          )}

          {/* Screener module */}
          {tab === "screener" && <ScreenerModule user={user}/>}

          {/* Market Pulse module */}
          {tab === "marketpulse" && <MarketPulseModule/>}
        </div>
      </div>
    </div>
  );
}
