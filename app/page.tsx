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
const JournalModule = dynamic(() => import('./modules/journal/JournalModule'), { ssr: false, loading: () => <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:60, gap:12 }}><div className="tp-spinner"/><span style={{ color:"var(--text-dim)", fontSize:12, fontFamily:"'Rajdhani', sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>Loading journal</span></div> });
const ScreenerModule = dynamic(() => import('./modules/screener/ScreenerModule'), { ssr: false, loading: () => <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:60, gap:12 }}><div className="tp-spinner"/><span style={{ color:"var(--text-dim)", fontSize:12, fontFamily:"'Rajdhani', sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>Loading screener</span></div> });
const DiscoveryModule = dynamic(() => import('./modules/screener/DiscoveryModule'), { ssr: false, loading: () => <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:60, gap:12 }}><div className="tp-spinner"/><span style={{ color:"var(--text-dim)", fontSize:12, fontFamily:"'Rajdhani', sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>Loading stock screener</span></div> });
const MarketPulseModule = dynamic(() => import('./modules/research/MarketPulseModule'), { ssr: false, loading: () => <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:60, gap:12 }}><div className="tp-spinner"/><span style={{ color:"var(--text-dim)", fontSize:12, fontFamily:"'Rajdhani', sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>Loading market pulse</span></div> });
const DeepDiveModule = dynamic(() => import('./modules/research/DeepDiveModule'), { ssr: false, loading: () => <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:60, gap:12 }}><div className="tp-spinner"/><span style={{ color:"var(--text-dim)", fontSize:12, fontFamily:"'Rajdhani', sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>Loading deep dive</span></div> });
const MarketCalendarModule = dynamic(() => import('./modules/calendar/MarketCalendarModule'), { ssr: false, loading: () => <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:60, gap:12 }}><div className="tp-spinner"/><span style={{ color:"var(--text-dim)", fontSize:12, fontFamily:"'Rajdhani', sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>Loading calendar</span></div> });
const SectorExplorerModule = dynamic(() => import('./modules/sectors/SectorExplorerModule'), { ssr: false, loading: () => <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:60, gap:12 }}><div className="tp-spinner"/><span style={{ color:"var(--text-dim)", fontSize:12, fontFamily:"'Rajdhani', sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>Loading sector explorer</span></div> });
const PlayBuilderModule = dynamic(() => import('./modules/playbuilder/PlayBuilderModule'), { ssr: false, loading: () => <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:60, gap:12 }}><div className="tp-spinner"/><span style={{ color:"var(--text-dim)", fontSize:12, fontFamily:"'Rajdhani', sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>Loading play builder</span></div> });

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
          <button onClick={()=>handleOAuth("google")} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.08)", background:"transparent", color:"#9ca3af", cursor:"pointer", fontSize:12, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Google
          </button>
          <button onClick={()=>handleOAuth("discord")} style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.08)", background:"transparent", color:"#9ca3af", cursor:"pointer", fontSize:12, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            Discord
          </button>
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
    { id:"calendar", icon:"crosshair", name:"Market Calendar" },
    { id:"sectors", icon:"zap", name:"Sector Explorer" },
    { id:"screener", icon:"search", name:"Options Screener" },
    { id:"discovery", icon:"trendUp", name:"Stock Screener" },
    { id:"marketpulse", icon:"trendUp", name:"Market Pulse" },
    { id:"deepdive", icon:"search", name:"Deep Dive" },
  ]},
  { label:"Tools", items:[
    { id:"playbuilder", icon:"target", name:"Play Builder" },
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
  const [schwabDisconnected, setSchwabDisconnected] = useState(false);
  const [schwabExpiringSoon, setSchwabExpiringSoon] = useState(false);
  const [schwabExpiryDays, setSchwabExpiryDays] = useState<number | null>(null);

  // Global Schwab connection check on mount (once user is loaded)
  useEffect(() => {
    if (!user?.id) return;
    import('./lib/auth-fetch').then(({ getAuthHeaders }) => {
      getAuthHeaders().then(headers => {
        fetch('/api/schwab/refresh', { headers }).then(r => r.json()).then(d => {
          setSchwabDisconnected(!d.connected);
          if (d.connected && d.refreshExpiresAt) {
            const msLeft = d.refreshExpiresAt - Date.now();
            const daysLeft = msLeft / (1000 * 60 * 60 * 24);
            setSchwabExpiryDays(Math.max(0, Math.round(daysLeft * 10) / 10));
            setSchwabExpiringSoon(daysLeft > 0 && daysLeft <= 2);
          }
        }).catch(() => setSchwabDisconnected(true));
      });
    });
  }, [user?.id]);
  const [prefs, setPrefs] = useState({ theme: "dark" });
  const isDark = prefs.theme !== "light";

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', prefs.theme === 'light' ? 'light' : 'dark');
  }, [prefs.theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setUser(session?.user ?? null); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => { setUser(session?.user ?? null); });
    return () => subscription.unsubscribe();
  }, []);

  // ── Play Builder → Journal bridge ──
  // Page.tsx is always mounted, so it can catch tp-add-trade even when JournalModule
  // isn't on screen. It switches tab to "log" (mounting JournalModule) then re-dispatches
  // the event so JournalModule's own listener picks it up and opens the prefilled modal.
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail;
      setTab("log");
      // Re-dispatch after JournalModule has mounted and registered its listener
      setTimeout(() => {
        try {
          window.dispatchEvent(new CustomEvent('tp-add-trade-ready', { detail }));
        } catch {}
      }, 120);
    };
    window.addEventListener('tp-add-trade', handler);
    return () => window.removeEventListener('tp-add-trade', handler);
  }, []);

  // ── Journal → Play Builder bridge ──
  // Same pattern in reverse: Journal/Screener dispatches tp-open-playbuilder, page.tsx
  // catches it (always mounted), switches tab to "playbuilder", then re-dispatches
  // as tp-open-playbuilder-ready so PlayBuilderModule's listener picks it up.
  //
  // Race fix: on the FIRST handoff in a session, PlayBuilderModule has never been
  // mounted, so its listener doesn't exist when the re-fired event arrives. We
  // stash the payload on window.__pendingPlayBuilderPayload so that PlayBuilder
  // can drain it on mount, and ALSO fire the event on a timer for the warm path.
  // Whichever path consumes first wins; the other no-ops.
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail;
      // Stash for cold-mount drain
      try { (window as any).__pendingPlayBuilderPayload = detail; } catch {}
      setTab("playbuilder");
      // Also fire on a timer for the warm-mount path (PlayBuilder already mounted)
      setTimeout(() => {
        try {
          // Only re-fire if the buffer is still set — PlayBuilder clears it on consume
          if ((window as any).__pendingPlayBuilderPayload) {
            window.dispatchEvent(new CustomEvent('tp-open-playbuilder-ready', { detail }));
          }
        } catch {}
      }, 200);
    };
    window.addEventListener('tp-open-playbuilder', handler);
    return () => window.removeEventListener('tp-open-playbuilder', handler);
  }, []);

  if (loading) return <div style={{ minHeight:"100vh", background:"var(--shell-bg)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}><div className="tp-spinner"/><div style={{ color:"var(--text-dim)", fontSize:13, fontFamily:"'Rajdhani', sans-serif", fontWeight:600, letterSpacing:1, textTransform:"uppercase" }}>Loading TradePulse</div></div>;
  if (!user) return <AuthScreen onAuth={setUser}/>;

  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); };
  const activeItem = SIDEBAR.flatMap(s=>s.items).find(i=>i.id===tab) || { id:"settings", icon:"settings", name:"Settings" };

  const SidebarIcon = ({ icon, size = 16 }: { icon: string; size?: number }) => {
    const d = (ICONS as any)[icon];
    return d ? <Icon d={d} size={size}/> : <span>•</span>;
  };

  return (
    <div style={{ minHeight:"100vh", background:"var(--shell-bg)", color:"var(--text)", fontFamily:"'Inter', system-ui, sans-serif", display:"flex" }}>
      {/* ═══ SIDEBAR ═══ */}
      <div className="tp-sidebar" style={{ width: collapsed ? 56 : 210, background:"var(--shell-bg2)", borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", flexShrink:0, overflow:"hidden", transition:"width 0.2s", position:"sticky", top:0, height:"100vh" }}>
        <div style={{ padding: collapsed ? "16px 12px" : "18px 16px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={()=>setCollapsed(!collapsed)}>
          <div style={{ width:30, height:30, borderRadius:8, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><SidebarIcon icon="book" size={15}/></div>
          {!collapsed && <span style={{ fontSize:16, fontWeight:800, background:"linear-gradient(135deg,#a5b4fc,#c4b5fd)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", whiteSpace:"nowrap" }}>TradePulse</span>}
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {SIDEBAR.map(section => (
            <div key={section.label}>
              {!collapsed && <div style={{ padding:"12px 18px 4px", fontSize:9, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:1.2, fontWeight:700 }}>{section.label}</div>}
              {collapsed && <div style={{ height:1, background:"var(--border)", margin:"6px 8px" }}/>}
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
        <div style={{ borderTop:"1px solid var(--border)", padding:"8px 4px" }}>
          <button onClick={()=>{setTab("settings");setMobileOpen(false);}} style={{
            display:"flex", alignItems:"center", gap:10, width:"calc(100% - 8px)", margin:"1px 4px",
            padding: collapsed?"9px 0":"8px 14px", justifyContent: collapsed?"center":"flex-start",
            borderRadius:8, border:"none", cursor:"pointer", fontSize:12,
            fontWeight: tab==="settings"?600:500, background: tab==="settings"?"rgba(99,102,241,0.12)":"transparent",
            color: tab==="settings"?"#a5b4fc":"#5c6070"
          }}><SidebarIcon icon="settings"/>{!collapsed && <span>Settings</span>}</button>
          {!collapsed && <div style={{ padding:"8px 14px 4px" }}>
            <div style={{ fontSize:10, color:"var(--text-dim)", marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email}</div>
            <button onClick={handleSignOut} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"6px 10px", borderRadius:6, border:"1px solid var(--border2)", background:"transparent", color:"var(--text-dim)", cursor:"pointer", fontSize:10, fontWeight:600 }}>Sign Out</button>
          </div>}
        </div>
      </div>

      {/* ═══ MOBILE MENU ═══ */}
      {mobileOpen && <>
        <div onClick={()=>setMobileOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:60 }}/>
        <div style={{ position:"fixed", top:0, left:0, bottom:0, width:260, background:"var(--shell-bg2)", borderRight:"1px solid var(--border)", zIndex:70, padding:"20px 0", display:"flex", flexDirection:"column", boxShadow:"4px 0 30px rgba(0,0,0,0.4)" }}>
          <div style={{ padding:"0 20px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:16, fontWeight:700, color:"var(--text)" }}>TradePulse</span>
            <button onClick={()=>setMobileOpen(false)} style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer" }}><Icon d={ICONS.x} size={18}/></button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"12px 10px" }}>
            {SIDEBAR.map(section => (
              <div key={section.label}>
                <div style={{ padding:"12px 14px 4px", fontSize:9, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:1.2, fontWeight:700 }}>{section.label}</div>
                {section.items.filter(i=>!i.soon).map(item => (
                  <button key={item.id} onClick={()=>{setTab(item.id);setMobileOpen(false);}} style={{ display:"flex", alignItems:"center", gap:12, width:"100%", padding:"10px 14px", borderRadius:10, border:"none", background:tab===item.id?"rgba(99,102,241,0.12)":"transparent", color:tab===item.id?"#a5b4fc":"#8a8f9e", cursor:"pointer", fontSize:14, fontWeight:tab===item.id?600:500, marginBottom:2 }}>
                    <SidebarIcon icon={item.icon}/> {item.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div style={{ padding:"14px 20px", borderTop:"1px solid var(--border)" }}>
            <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:8 }}>{user.email}</div>
            <button onClick={()=>{handleSignOut();setMobileOpen(false);}} style={{ width:"100%", padding:"9px 14px", borderRadius:8, border:"1px solid var(--border2)", background:"transparent", color:"var(--text-dim)", cursor:"pointer", fontSize:12, fontWeight:600 }}>Sign Out</button>
          </div>
        </div>
      </>}

      {/* ═══ MAIN ═══ */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:"100vh" }}>
        <div className="tp-topbar" style={{ padding:"12px 28px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", background:"var(--shell-bg)", position:"sticky", top:0, zIndex:10, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button className="tp-hamburger" onClick={()=>setMobileOpen(p=>!p)} style={{ display:"none", alignItems:"center", justifyContent:"center", width:36, height:36, borderRadius:8, border:"none", background:"transparent", color:"var(--text-mid)", cursor:"pointer" }}>
              <Icon d={mobileOpen ? ICONS.x : ICONS.menu} size={20}/>
            </button>
            <span style={{ fontSize:18, fontWeight:700, color:"var(--text)" }}>{activeItem?.name || "Settings"}</span>
          </div>
          <div id="tp-shell-actions" style={{ display:"flex", alignItems:"center", gap:8 }}/>
        </div>

        <div className="tp-content" style={{ flex:1, overflowY:"auto", padding: tab === "screener" || tab === "discovery" ? "0" : "24px 28px" }}>
          {/* Schwab reconnect banner */}
          {schwabDisconnected && (
            <div style={{ margin: tab === "screener" || tab === "discovery" ? "12px 16px" : "0 0 16px 0", padding:"12px 18px", borderRadius:10, background:"rgba(234,179,8,0.08)", border:"1px solid rgba(234,179,8,0.2)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:16 }}>⚠️</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#eab308" }}>Schwab connection expired</div>
                  <div style={{ fontSize:11, color:"#a3870d", marginTop:2 }}>Market data, screener, and live quotes require an active Schwab connection.</div>
                </div>
              </div>
              <button onClick={async () => {
                try {
                  const { authFetch } = await import('./lib/auth-fetch');
                  const res = await authFetch('/api/schwab/auth', { method: 'POST' });
                  const data = await res.json();
                  if (data.authUrl) window.location.href = data.authUrl;
                  else alert(data.error || 'Failed to start Schwab auth');
                } catch (e: any) {
                  alert(`Failed to start Schwab auth: ${e?.message || e}`);
                }
              }} style={{ padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap", boxShadow:"0 2px 10px rgba(99,102,241,0.25)" }}>
                🔐 Reconnect Schwab
              </button>
            </div>
          )}
          {/* Schwab session expiring soon banner */}
          {schwabExpiringSoon && !schwabDisconnected && (
            <div style={{ margin: tab === "screener" || tab === "discovery" ? "12px 16px" : "0 0 16px 0", padding:"12px 18px", borderRadius:10, background:"rgba(234,179,8,0.05)", border:"1px solid rgba(234,179,8,0.15)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:16 }}>{String.fromCodePoint(0x1F514)}</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#ca8a04" }}>Schwab session expiring soon</div>
                  <div style={{ fontSize:11, color:"#a3870d", marginTop:2 }}>Your Schwab connection expires in ~{schwabExpiryDays} day{schwabExpiryDays === 1 ? '' : 's'}. Reconnect now to avoid interruption.</div>
                </div>
              </div>
              <button onClick={async () => {
                try {
                  const { authFetch } = await import('./lib/auth-fetch');
                  const res = await authFetch('/api/schwab/auth', { method: 'POST' });
                  const data = await res.json();
                  if (data.authUrl) window.location.href = data.authUrl;
                  else alert(data.error || 'Failed to start Schwab auth');
                } catch (e: any) {
                  alert(`Failed to start Schwab auth: ${e?.message || e}`);
                }
              }} style={{ padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap", boxShadow:"0 2px 10px rgba(99,102,241,0.25)" }}>
                {String.fromCodePoint(0x1F510)} Reconnect Now
              </button>
            </div>
          )}
          {/* Journal module handles all journal tabs */}
          {JOURNAL_TABS.includes(tab) && (
            <div className="tp-journal-module">
              <JournalModule user={user} tab={tab} setTab={setTab} theme={isDark ? {
                bg:"#0d0f14", bgSecondary:"#12141a", bgTertiary:"#161922",
                panelBg:"#161922", panelBorder:"rgba(255,255,255,0.07)",
                text:"#e2e4ea", textSecondary:"#c8cad0", textMuted:"#8a8f9e", textFaint:"#5c6070", textFaintest:"#3d4150",
                border:"rgba(255,255,255,0.06)", borderLight:"rgba(255,255,255,0.1)",
                inputBg:"#1e2028", cardBg:"rgba(255,255,255,0.02)",
                headerBg:"rgba(13,15,20,0.85)", headerBorder:"rgba(255,255,255,0.06)",
                activeBg:"rgba(99,102,241,0.12)", selectOptionBg:"#1e2028"
              } : {
                bg:"#f5f6fa", bgSecondary:"#ffffff", bgTertiary:"#eef0f5",
                panelBg:"#ffffff", panelBorder:"rgba(0,0,0,0.08)",
                text:"#1a1a2e", textSecondary:"#374151", textMuted:"#6b7280", textFaint:"#9ca3af", textFaintest:"#d1d5db",
                border:"rgba(0,0,0,0.08)", borderLight:"rgba(0,0,0,0.12)",
                inputBg:"#f3f4f6", cardBg:"rgba(0,0,0,0.02)",
                headerBg:"rgba(255,255,255,0.9)", headerBorder:"rgba(0,0,0,0.08)",
                activeBg:"rgba(99,102,241,0.08)", selectOptionBg:"#ffffff"
              }} prefs={prefs} setPrefs={setPrefs}/>
            </div>
          )}

          {/* Screener module — always mounted, hidden when not active to preserve scan results */}
          <div style={{ display: tab === "screener" ? "block" : "none" }}>
            <ScreenerModule user={user}/>
          </div>

          {/* Discovery module */}
          {tab === "discovery" && <DiscoveryModule user={user}/>}

          {/* Market Pulse module */}
          {tab === "marketpulse" && <MarketPulseModule user={user}/>}

          {/* Deep Dive module */}
          {tab === "deepdive" && <DeepDiveModule user={user}/>}

          {/* Market Calendar module */}
          {tab === "calendar" && <MarketCalendarModule/>}
          {tab === "sectors" && <SectorExplorerModule user={user}/>}
          {tab === "playbuilder" && <PlayBuilderModule user={user}/>}
        </div>
      </div>
    </div>
  );
}
