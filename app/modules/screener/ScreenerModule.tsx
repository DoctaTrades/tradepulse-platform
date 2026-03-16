
import { useState, useEffect, useCallback, useRef } from 'react';
import { polygonScan } from '../../lib/polygon-scan';

// ─── TYPES ────────────────────────────────────────────────
interface ScanResult {
  ticker: string; price: number; change: number; vol: number;
  iv: number; hv: number; ivr: number; rsi: number; atrPct: number;
  ema20: number | null; ema50: number | null; ema200: number | null;
  maxOI: number; optVol: number; optBid: number; ror: number;
  uoaRatio: number; isUOA: boolean; mktCap: number;
  passesMainFilters: boolean;
  nextEarningsEst?: string | null;
  daysToEarnings?: number | null;
  putCallRatio?: number; bidAskSpreadPct?: number;
  sector: string; source: string;
  bestPut?: {
    strike: number; bid: number; ask: number;
    delta: number; theta: number; gamma: number; vega: number;
    iv: number; dte: number; expDate: string; symbol: string;
  };
  cspByDTE?: any[];
  creditSpread?: {
    type: string;
    shortLeg: { strike: number; bid: number; ask: number; delta: number; dte: number; expDate: string };
    longLeg: { strike: number; bid: number; ask: number; delta: number };
    netCredit: number; maxLoss: number; width: number; rorSpread: number; pop: number;
  };
  bearCallSpread?: {
    type: string;
    shortLeg: { strike: number; bid: number; ask: number; delta: number; dte: number; expDate: string };
    longLeg: { strike: number; bid: number; ask: number; delta: number };
    netCredit: number; maxLoss: number; width: number; rorSpread: number; pop: number;
  };
  ironCondor?: {
    putSpread: any; callSpread: any;
    totalCredit: number; maxLoss: number;
    breakEvenLow: number; breakEvenHigh: number;
    dte: number; expDate: string; rorIC: number;
  };
  pmcc?: {
    leapLeg: { strike: number; bid: number; ask: number; delta: number; dte: number; expDate: string };
    shortLeg: { strike: number; bid: number; ask: number; delta: number; dte: number; expDate: string };
    leapCost: number; shortCredit: number; netDebit: number; capitalRequired: number; monthlyIncome: number; breakEven: number;
  };
  diagonal?: {
    type: string;
    backLeg: { strike: number; bid: number; ask: number; delta: number; dte: number; expDate: string };
    frontLeg: { strike: number; bid: number; ask: number; delta: number; dte: number; expDate: string };
    netDebit: number; capitalRequired: number; maxProfit: number;
  };
  calendarPress?: {
    longLeg: { strike: number; bid: number; ask: number; delta: number; dte: number; expDate: string; intrinsicValue: number };
    shortLeg: { strike: number; bid: number; ask: number; delta: number; dte: number; expDate: string };
    longCost: number; weeklyCredit: number; netDebit: number; spreadWidth: number; capitalRequired: number;
    weeksToBreakeven: number; costRatio: number; weeklyROI: number; weeklyROC: number; maxProfitIfBearish: number;
  };
}

interface SchwabStatus {
  connected: boolean; expiresAt: number | null; refreshExpiresEstimate: string;
}

// ─── COMPONENT ────────────────────────────────────────────
export default function ScreenerModule({ user }: { user?: any }) {
  const [schwabStatus, setSchwabStatus] = useState<SchwabStatus>({ connected: false, expiresAt: null, refreshExpiresEstimate: 'N/A' });
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, ticker: '', found: 0 });
  const [results, setResults] = useState<ScanResult[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [scanStats, setScanStats] = useState({ scanned: 0, found: 0, source: '', elapsed: '' });
  const [activeTab, setActiveTab] = useState('screener');
  const [selectedTicker, setSelectedTicker] = useState<ScanResult | null>(null);
  const [customTickers, setCustomTickers] = useState('');
  const [spxData, setSpxData] = useState<any>(null);
  const [spxLoading, setSpxLoading] = useState(false);
  const [spxDTE, setSpxDTE] = useState('0-7');
  const [spxWingWidth, setSpxWingWidth] = useState('10');
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [tickerSearch, setTickerSearch] = useState('');
  const [cpShortDelta, setCpShortDelta] = useState(0.10);
  const [cpDeltaMax, setCpDeltaMax] = useState(0.35);
  const [equityResults, setEquityResults] = useState<any[]>([]);
  const [equityLoading, setEquityLoading] = useState(false);
  const [equityLogs, setEquityLogs] = useState<string[]>([]);
  const [equityFilter, setEquityFilter] = useState({ min5CR: 5, minPrice: 5, maxPrice: 1000, showType: 'all', patternFilter: 'all', directionFilter: 'all', sortBy: 'confluence', levelFilter: 'all', rsFilter: 'all' });
  const [expandedEquity, setExpandedEquity] = useState<Set<string>>(new Set());
  const [dashData, setDashData] = useState<any>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Per-user API key management
  const [userProvider, setUserProvider] = useState<'schwab' | 'tradier' | 'polygon'>('polygon');
  const [userKeys, setUserKeys] = useState<any>({});
  const [userKeyStatus, setUserKeyStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    fetch('/api/user-keys', { headers: { 'x-user-id': user.id } })
      .then(r => r.json())
      .then(data => { if (data.apiKeys) setUserKeys(data.apiKeys); })
      .catch(() => {});
  }, [user?.id]);

  const saveUserKeys = async () => {
    try {
      const res = await fetch('/api/user-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ action: 'save', apiKeys: userKeys }),
      });
      const data = await res.json();
      setUserKeyStatus(data.success ? { ok: true, msg: '✓ Keys saved' } : { ok: false, msg: data.error || 'Save failed' });
      setTimeout(() => setUserKeyStatus(null), 3000);
    } catch (e: any) {
      setUserKeyStatus({ ok: false, msg: e.message });
    }
  };

  const testUserKeys = async (provider: string) => {
    setUserKeyStatus({ ok: false, msg: '⏳ Testing...' });
    try {
      const res = await fetch('/api/user-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ action: 'test', provider, apiKeys: userKeys }),
      });
      const data = await res.json();
      setUserKeyStatus(data.connected ? { ok: true, msg: `✓ ${provider} connected!` } : { ok: false, msg: data.error || 'Connection failed' });
      setTimeout(() => setUserKeyStatus(null), 5000);
    } catch (e: any) {
      setUserKeyStatus({ ok: false, msg: e.message });
    }
  };

  // Admin check
  const ADMIN_IDS = ['a4f7c71e-95bc-43f9-bbfd-108f1feb6f48'];
  const ADMIN_EMAILS = ['risethediver@gmail.com'];
  const isAdmin = (user?.id && ADMIN_IDS.includes(user.id)) || (user?.email && ADMIN_EMAILS.includes(user.email?.toLowerCase()));

  // ─── UNIVERSE DEFINITIONS (client-side for preview) ────
  const UNIVERSES: Record<string, { label: string; desc: string; tickers: string[]; primary?: boolean }> = {
    core: {
      label: '⚡ Pulse Core', primary: true,
      desc: 'Curated premium-selling universe — mega-liquid + high IV + blue chips + sector ETFs',
      tickers: ['SPY','QQQ','IWM','AAPL','TSLA','NVDA','AMD','META','AMZN','GOOGL','MSFT','NFLX','COIN','MSTR','MARA','RIOT','SOFI','HOOD','RIVN','SHOP','SQ','PLTR','ROKU','DKNG','SNAP','UBER','ABNB','JPM','BAC','GS','DIS','HD','WMT','COST','KO','PEP','JNJ','PG','XOM','CVX','BA','CAT','DE','AVGO','CRM','ABBV','XLE','XLF','XLK','XLV','GLD','SLV','TLT','EEM','SMH','ARKK'],
    },
    megaCap: {
      label: '🏛 Mega Cap',
      desc: 'Top 30 by market cap — most liquid options in the market',
      tickers: ['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','LLY','JPM','V','UNH','XOM','MA','JNJ','PG','COST','HD','MRK','ABBV','CRM','AMD','CVX','BAC','NFLX','KO','PEP','TMO','WMT','ORCL'],
    },
    sp500: {
      label: '📈 S&P 500',
      desc: 'Top ~150 most optionable S&P 500 names (full 500 coming soon)',
      tickers: ['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','LLY','JPM','V','UNH','XOM','MA','JNJ','PG','COST','HD','MRK','ABBV','CRM','AMD','CVX','BAC','NFLX','KO','PEP','TMO','WMT','ACN','LIN','MCD','ABT','CSCO','TXN','DHR','NEE','NKE','PM','MS','AMGN','RTX','SCHW','ISRG','GS','SPGI','LOW','BKNG','INTU','GE','DE','CAT','AMAT','REGN','BMY','SYK','VRTX','ADI','GILD','C','AXP','MDLZ','PLD','MO','ETN','BSX','BLK','CB','LRCX','ZTS','AMT','SO','DUK','COP','CI','SHW','MMC','TGT','WM','FCX','HON','MMM','ITW','EMR','PH','GD','NOC','LMT','OXY','PSX','VLO','MPC','SLB','HAL','BKR','WFC','USB','PNC','AIG','PRU','MET','AFL','ALL','PGR','TRV','ORCL','ADBE','NOW','PYPL','INTC','QCOM','MU','KLAC','SNPS','CDNS','MRVL','ON','NXPI','CMG','SBUX','YUM','DPZ','ORLY','AZO','ROST','TJX','LULU','NKE','UPS','FDX','DAL','UAL','AAL','LUV','ABNB','BKNG','MAR','HLT','PFE','MRNA','BIIB','DXCM','MDT','NEE','AEP','D','SRE','PSA','O','WELL','EQR','SPG','DLR','CCI','AMT','EQIX'],
    },
    ndx100: {
      label: '💻 Nasdaq 100',
      desc: 'Nasdaq 100 index — heavy tech/growth, typically higher IV',
      tickers: ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','AVGO','COST','NFLX','AMD','INTU','QCOM','TXN','AMAT','MU','LRCX','SNPS','CDNS','ADI','MRVL','KLAC','ASML','INTC','ORCL','CRM','ADBE','NOW','WDAY','ZS','CRWD','PANW','FTNT','NET','DDOG','MDB','SNOW','OKTA','TEAM','HUBS','SHOP','PYPL','SQ','COIN','MSTR','RBLX','SNAP','PINS','UBER','LYFT','ABNB','BKNG','DIS','CMCSA','TMUS','T','VZ','EA','TTWO','PEP','KO','SBUX','CMG','LULU','ROST','MNST','AZN','AMGN','GILD','REGN','VRTX','BIIB','MRNA','ISRG','DXCM','ILMN','IDXX','ON','NXPI','ARM','SMCI','DASH','CPRT','CTAS','ODFL','PAYX','FAST','CSX','HON','PDD','JD','BIDU'],
    },
    dow30: {
      label: '🏦 Dow 30',
      desc: 'Dow Jones Industrial Average — 30 blue chips, lower IV, great for Wheel/CSP',
      tickers: ['AAPL','MSFT','NVDA','AMZN','JPM','V','UNH','HD','PG','JNJ','MRK','CVX','KO','DIS','MCD','WMT','IBM','GS','CAT','BA','AXP','MMM','TRV','HON','AMGN','CSCO','NKE','DOW','CRM','INTC'],
    },
    highIV: {
      label: '🔥 High IV',
      desc: 'Consistently elevated IV — meme stocks, crypto-adjacent, biotech, leveraged ETFs',
      tickers: ['TSLA','NVDA','AMD','COIN','MSTR','MARA','RIOT','SOFI','HOOD','RIVN','SHOP','SQ','PLTR','ROKU','DKNG','SNAP','RBLX','U','NET','CRWD','SNOW','OKTA','MDB','PANW','ZS','DDOG','BILL','HUBS','UPST','AFRM','LCID','NIO','XPEV','SMCI','ARM','IONQ','GME','AMC','MRNA','BNTX','ENPH','SEDG','ARKK','TQQQ','SQQQ','UVXY','SOXL','SOXS'],
    },
    etf: {
      label: '📊 ETFs',
      desc: 'Broad market, sector, commodity, and leveraged ETFs',
      tickers: ['SPY','QQQ','IWM','DIA','RSP','MDY','GLD','SLV','TLT','IEF','HYG','LQD','EEM','EFA','VWO','FXI','EWJ','EWZ','XLE','XLF','XLK','XLV','XLI','XLP','XLU','XLB','XLY','XLRE','XLC','XBI','IBB','ARKK','ARKG','ARKW','SOXX','SMH','HACK','KWEB','BITO','GDX','GDXJ','USO','UNG','UVXY','TQQQ','SQQQ','SPXU','UPRO','TNA','TZA','SOXL','SOXS'],
    },
    fullMarket: {
      label: '🌐 Full Market',
      desc: '~400 most liquid US equities across all sectors — best for equity pattern scanning',
      tickers: [
        // Indices
        'SPY','QQQ','IWM','DIA',
        // Technology
        'AAPL','MSFT','NVDA','AVGO','ORCL','CRM','ADBE','AMD','INTC','CSCO','INTU','QCOM','TXN','AMAT','MU','NOW','LRCX','ADI','KLAC','SNPS','CDNS','MRVL','NXPI','ON','SMCI','ARM','CRWD','PANW','FTNT','ZS','NET','DDOG','MDB','SNOW','PLTR','DELL','SHOP','PYPL','SQ',
        // Financials
        'JPM','V','MA','BAC','WFC','GS','MS','SPGI','BLK','AXP','C','SCHW','CB','MMC','PGR','ICE','CME','AON','MET','COIN','HOOD','SOFI','AFL','PRU','TRV','AIG',
        // Healthcare
        'UNH','LLY','JNJ','ABBV','MRK','TMO','ABT','DHR','AMGN','PFE','ISRG','GILD','VRTX','REGN','BSX','MDT','SYK','CI','ELV','BDX','ZTS','DXCM','IDXX','MRNA','BIIB','HCA',
        // Consumer Discretionary
        'AMZN','TSLA','HD','MCD','NKE','LOW','SBUX','TJX','BKNG','CMG','ORLY','ROST','DHI','LEN','GM','F','LULU','DRI','YUM','ABNB','DASH','UBER','LYFT','RIVN','NIO','ETSY','BBY','AZO','ULTA','RCL','CCL','WYNN',
        // Consumer Staples
        'PG','KO','PEP','COST','WMT','PM','MDLZ','MO','CL','KMB','GIS','KHC','STZ','HSY','TSN','MNST','TGT','DG','DLTR','EL',
        // Energy
        'XOM','CVX','COP','SLB','EOG','MPC','PSX','VLO','OXY','WMB','KMI','HAL','DVN','FANG','BKR','CTRA','MRO','APA','EQT','AR',
        // Industrials
        'CAT','GE','RTX','HON','UNP','BA','DE','LMT','UPS','ADP','ETN','ITW','NOC','WM','GD','CSX','FDX','NSC','EMR','DAL','UAL','LUV','AAL','FAST','ODFL','CTAS','AXON','TDG',
        // Materials
        'LIN','APD','SHW','ECL','NEM','FCX','NUE','VMC','MLM','DOW','DD','PPG','CF','ALB','STLD','CLF','AA','GOLD',
        // Real Estate
        'PLD','AMT','EQIX','CCI','SPG','PSA','O','WELL','DLR','VICI',
        // Utilities
        'NEE','SO','DUK','CEG','SRE','AEP','D','EXC','VST','NRG',
        // Communication
        'META','GOOGL','NFLX','DIS','CMCSA','TMUS','T','VZ','EA','TTWO','PINS','SNAP','RBLX','ROKU','TTD',
        // High IV / Meme / Crypto-adjacent
        'MSTR','MARA','RIOT','DKNG','GME','AMC','UPST','AFRM','LCID','XPEV','IONQ','U','ENPH','SEDG',
        // Sector ETFs
        'XLE','XLF','XLK','XLV','XLI','XLP','XLU','XLB','XLY','XLRE','XLC',
        // Other popular ETFs
        'GLD','SLV','TLT','SMH','ARKK','SOXX','XBI','GDX','BITO',
      ],
    },
  };

  // Filters
  const [universe, setUniverse] = useState('core');
  const [filters, setFilters] = useState({
    minPrice: 20, maxPrice: 700, minMktCap: 250,
    minIVR: 25, minIV: 20, minVol: 200000, minOI: 50,
    minBid: 0.10, minRoR: 0, minRSI: 30, maxRSI: 75,
    emaTrend: 'any', targetDelta: 0.30, targetDTE: [25, 45] as [number, number],
  });

  // Check Schwab connection status on load
  useEffect(() => {
    if (isAdmin) {
      fetch('/api/schwab/refresh').then(r => r.json()).then(setSchwabStatus).catch(() => {});
    }
    // Check URL params for OAuth callback result
    const params = new URLSearchParams(window.location.search);
    if (params.get('schwab_connected')) {
      setSchwabStatus({ connected: true, expiresAt: Date.now() + 1800000, refreshExpiresEstimate: '~7 days' });
      window.history.replaceState({}, '', '/');
    }
    if (params.get('schwab_error')) {
      setLogs(prev => [...prev, `⚠ Schwab auth error: ${params.get('schwab_error')}`]);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // ─── SCAN ─────────────────────────────────────────────
  const runScan = useCallback(async () => {
    setScanning(true);
    setResults([]);
    setLogs(['⚡ Starting scan...']);
    cancelRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;
    const tickerList = universe === 'custom'
      ? customTickers.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
      : UNIVERSES[universe]?.tickers || UNIVERSES.core.tickers;
    setScanProgress({ current: 0, total: tickerList.length, ticker: '', found: 0 });
    const start = Date.now();

    try {
      // Try server-side Schwab scan first
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universe,
          filters: { ...filters, cpShortDelta, cspDeltaMin: cpShortDelta, cspDeltaMax: cpDeltaMax },
          customTickers: tickerList,
          userId: user?.id,
          userEmail: user?.email,
        }),
        signal: controller.signal,
      });
      const data = await res.json();

      if (data.source === 'polygon_fallback') {
        // Schwab not connected — run client-side Polygon scan
        const tickers = data.tickers || [];
        setLogs(['📡 Schwab not connected — running Polygon scan (slower, estimated data)...']);
        
        const scanResults: ScanResult[] = [];
        
        const { results: pgResults, scanned } = await polygonScan(tickers, data.filters, {
          onLog: (msg) => setLogs(prev => [...prev, msg]),
          onResult: (r) => {
            scanResults.push(r);
            if (scanResults.length % 3 === 0) {
              setResults([...scanResults].sort((a, b) => (b.ror || 0) - (a.ror || 0)));
            }
          },
          onProgress: (current, total) => {
            setScanProgress({ current, total, ticker: tickers[current - 1] || '', found: scanResults.length });
          },
          shouldCancel: () => cancelRef.current,
        });

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const sortedResults = scanResults.sort((a, b) => (b.ror || 0) - (a.ror || 0));
        setResults(sortedResults);
        setScanStats({ scanned, found: scanResults.length, source: 'polygon', elapsed: `${elapsed}s` });
        setLogs(prev => [...prev, `✅ Scan complete · ${scanned} scanned · ${scanResults.length} results · ${elapsed}s`]);
        if (scanResults.length > 0) setActiveTab('results');

      } else {
        // Schwab scan completed server-side
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        setScanProgress({ current: tickerList.length, total: tickerList.length, ticker: 'Done', found: data.results?.length || 0 });
        setResults(data.results || []);
        setLogs(data.logs || []);
        setScanStats({
          scanned: data.scanned || 0,
          found: data.results?.length || 0,
          source: data.source || 'schwab',
          elapsed: `${elapsed}s`,
        });
        if (data.results?.length > 0) setActiveTab('results');
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        setLogs(prev => [...prev, '⛔ Scan cancelled']);
      } else {
        setLogs(prev => [...prev, `✕ Scan error: ${e instanceof Error ? e.message : 'Unknown error'}`]);
      }
    }

    abortRef.current = null;
    setScanning(false);
    setScanProgress({ current: 0, total: 0, ticker: '', found: 0 });
  }, [universe, filters, customTickers]);

  // ─── FILTER UPDATE HELPER ─────────────────────────────
  // ─── SPX RADAR SCAN ─────────────────────────────────────
  const runSpxScan = useCallback(async () => {
    setSpxLoading(true);
    setSpxData(null);
    try {
      const dteRange = spxDTE.split('-').map(Number);
      const res = await fetch('/api/scan/spx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dteRange, wingWidth: Number(spxWingWidth) }),
      });
      const data = await res.json();
      if (data.error) {
        setSpxData({ error: data.error, spxPrice: data.spxPrice });
      } else {
        setSpxData(data);
      }
    } catch (e: unknown) {
      setSpxData({ error: e instanceof Error ? e.message : 'Unknown error' });
    }
    setSpxLoading(false);
  }, [spxDTE, spxWingWidth]);

  // ─── EQUITY PATTERN SCAN ─────────────────────────────────
  const runEquityScan = useCallback(async () => {
    setEquityLoading(true);
    setEquityResults([]);
    setEquityLogs(['⚡ Starting equity pattern scan...']);
    try {
      const tickerList = universe === 'custom'
        ? customTickers.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
        : UNIVERSES[universe]?.tickers || UNIVERSES.core.tickers;
      const res = await fetch('/api/scan/equity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: tickerList,
          minPrice: equityFilter.minPrice,
          maxPrice: equityFilter.maxPrice,
          min5CR: equityFilter.min5CR,
          mode: equityFilter.showType === 'topdown' ? 'topdown' : 'universe',
        }),
      });
      const data = await res.json();
      if (data.error) {
        setEquityLogs([`✕ ${data.error}`]);
      } else {
        setEquityResults(data.results || []);
        setEquityLogs(data.logs || []);
      }
    } catch (e: unknown) {
      setEquityLogs([`✕ Error: ${e instanceof Error ? e.message : 'Unknown'}`]);
    }
    setEquityLoading(false);
  }, [universe, customTickers, equityFilter]);

  // ─── DASHBOARD ───────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (!data.error) setDashData(data);
    } catch {}
    setDashLoading(false);
  }, []);

  const updateFilter = (key: string, value: string | number | number[]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // ─── STRATEGY FILTERS (adjustable per tab) ─────────────
  const [stratFilters, setStratFilters] = useState({
    csp: { minIVR: 20, minBid: 0.10, minRoR: 1, maxPrice: 500, trendReq: 'above50' as string },
    credit: { minIVR: 35, minOI: 300, minVol: 200000, direction: 'any' as string },
    pmcc: { minRSI: 45, maxLeapCost: 7000, trendReq: 'above_both' as string, minVol: 200000 },
    diag: { minIVR: 25, minVol: 200000, direction: 'any' as string },
    ic: { minIVR: 35, maxRSIDev: 15, maxATR: 4, minOI: 300, minVol: 300000 },
    uoa: { minRatio: 2, minOptVol: 500 },
    calPress: { maxCostRatio: 25, minWeeklyROI: 1, maxPrice: 500, minIVR: 15, maxCapital: 5000, shortDelta: 0.30 },
  });

  const updateStratFilter = (strat: string, key: string, value: string | number) => {
    setStratFilters(prev => ({ ...prev, [strat]: { ...prev[strat as keyof typeof prev], [key]: value } }));
  };

  // ─── STRATEGY FILTERING ───────────────────────────────
  const getStrategyResults = (strategy: string) => {
    const sf = stratFilters;
    switch (strategy) {
      case 'csp':
        // CSP/Wheel: High IVR for premium, real bid, positive RoR, affordable for assignment, bullish trend
        return results.filter(r => {
          if (!r.passesMainFilters) return false;
          if (r.ivr < sf.csp.minIVR) return false;
          if (r.optBid < sf.csp.minBid) return false;
          if (r.ror < sf.csp.minRoR) return false;
          if (r.price > sf.csp.maxPrice) return false;
          if (sf.csp.trendReq === 'above20' && r.ema20 && r.price <= r.ema20) return false;
          if (sf.csp.trendReq === 'above50' && r.ema50 && r.price <= r.ema50) return false;
          if (sf.csp.trendReq === 'above_both' && ((r.ema50 && r.price <= r.ema50) || (r.ema200 && r.price <= r.ema200))) return false;
          if (sf.csp.trendReq === 'above_all' && ((r.ema20 && r.price <= r.ema20) || (r.ema50 && r.price <= r.ema50) || (r.ema200 && r.price <= r.ema200))) return false;
          return true;
        });
      case 'credit':
        // Credit Spreads: High IVR, good OI for multi-strike liquidity, directional bias
        return results.filter(r => {
          if (!r.passesMainFilters) return false;
          if (r.ivr < sf.credit.minIVR) return false;
          if (r.maxOI < sf.credit.minOI) return false;
          if (r.vol < sf.credit.minVol) return false;
          if (sf.credit.direction === 'bull' && r.rsi < 35) return false;
          if (sf.credit.direction === 'bear' && r.rsi > 65) return false;
          return true;
        });
      case 'pmcc':
        // PMCC: Strong uptrend, momentum, affordable LEAP, liquid
        return results.filter(r => {
          if (!r.passesMainFilters) return false;
          if (r.rsi < sf.pmcc.minRSI) return false;
          if (r.vol < sf.pmcc.minVol) return false;
          const estLeapCost = r.price * 0.80 * 100;
          if (estLeapCost > sf.pmcc.maxLeapCost) return false;
          if (sf.pmcc.trendReq === 'above20' && r.ema20 && r.price <= r.ema20) return false;
          if (sf.pmcc.trendReq === 'above50' && r.ema50 && r.price <= r.ema50) return false;
          if (sf.pmcc.trendReq === 'above_both') {
            if (r.ema50 && r.price <= r.ema50) return false;
            if (r.ema200 && r.price <= r.ema200) return false;
          }
          if (sf.pmcc.trendReq === 'above_all') {
            if (r.ema20 && r.price <= r.ema20) return false;
            if (r.ema50 && r.price <= r.ema50) return false;
            if (r.ema200 && r.price <= r.ema200) return false;
          }
          return true;
        });
      case 'diag':
        // Diagonals: Moderate IVR, liquid, directional
        return results.filter(r => {
          if (!r.passesMainFilters) return false;
          if (r.ivr < sf.diag.minIVR) return false;
          if (r.vol < sf.diag.minVol) return false;
          if (sf.diag.direction === 'bull' && r.ema50 && r.price < r.ema50) return false;
          if (sf.diag.direction === 'bear' && r.ema50 && r.price > r.ema50) return false;
          return true;
        });
      case 'ic':
        // Iron Condor: OPPOSITE of trend strategies — range-bound, neutral RSI, low ATR, high IVR
        return results.filter(r => {
          if (!r.passesMainFilters) return false;
          if (r.ivr < sf.ic.minIVR) return false;
          if (Math.abs(r.rsi - 50) > sf.ic.maxRSIDev) return false;
          if (r.atrPct > sf.ic.maxATR) return false;
          if (r.maxOI < sf.ic.minOI) return false;
          if (r.vol < sf.ic.minVol) return false;
          return true;
        });
      case 'uoa':
        return results.filter(r => r.passesMainFilters && r.uoaRatio >= sf.uoa.minRatio && r.optVol >= sf.uoa.minOptVol);
      case 'calPress':
        // Calendar Press: bearish diagonal put — needs calendarPress data, affordable, good weekly ROI
        return results.filter(r => {
          if (!r.calendarPress) return false;
          if (r.price > sf.calPress.maxPrice) return false;
          if (r.ivr < sf.calPress.minIVR) return false;
          if (r.calendarPress.costRatio > sf.calPress.maxCostRatio) return false;
          if (r.calendarPress.weeklyROI < sf.calPress.minWeeklyROI) return false;
          if (r.calendarPress.capitalRequired > sf.calPress.maxCapital) return false;
          return true;
        });
      default:
        return results;
    }
  };

  const tabs = [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'screener', label: '⚙ Screener' },
    { id: 'results', label: `📊 All (${results.length})` },
    { id: 'csp', label: `🔄 CSP (${results.length ? getStrategyResults('csp').length : '-'})` },
    { id: 'credit', label: `📉 Spreads (${results.length ? getStrategyResults('credit').length : '-'})` },
    { id: 'pmcc', label: `📈 PMCC (${results.length ? getStrategyResults('pmcc').length : '-'})` },
    { id: 'diag', label: `↗ Diag (${results.length ? getStrategyResults('diag').length : '-'})` },
    { id: 'calPress', label: `📅 Cal Press (${results.length ? getStrategyResults('calPress').length : '-'})` },
    { id: 'ic', label: `🦅 IC (${results.length ? getStrategyResults('ic').length : '-'})` },
    { id: 'uoa', label: `🔥 UOA (${results.length ? getStrategyResults('uoa').length : '-'})` },
    { id: 'equity', label: `📊 Equities (${equityResults.length || '-'})` },
    { id: 'spx', label: '🎯 SPX Radar' },
  ];

  return (
    <div className="relative z-10">
      {/* Status Bar */}
      <div className="flex items-center justify-between px-7 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--navy)' }}>
        <div className="flex items-center gap-4">
          <div className="text-right"><div className="font-display text-lg font-bold" style={{ color: 'var(--blue3)' }}>{results.length || '—'}</div><div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Results</div></div>
          <div className="text-right"><div className="font-display text-lg font-bold" style={{ color: 'var(--blue3)' }}>{scanStats.scanned || '—'}</div><div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Scanned</div></div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: 'var(--border)', background: 'var(--navy3)' }}>
            <div className={`w-2 h-2 rounded-full ${schwabStatus.connected ? 'bg-green-500 shadow-[0_0_8px_#10b981]' : userKeys.tradier?.accessToken ? 'bg-blue-500' : userKeys.polygon?.apiKey ? 'bg-yellow-500' : 'bg-gray-500'}`} />
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-mid)' }}>{schwabStatus.connected ? 'SCHWAB' : userKeys.schwab?.clientId ? 'SCHWAB (Personal)' : userKeys.tradier?.accessToken ? 'TRADIER' : userKeys.polygon?.apiKey ? 'POLYGON' : scanning ? 'SCANNING' : 'READY'}</span>
          </div>
        </div>
        {scanning && <div className="font-mono text-xs" style={{ color: 'var(--gold)' }}>⚡ {scanProgress.ticker} ({scanProgress.current}/{scanProgress.total})</div>}
      </div>
      {/* TAB NAV */}
      <div className="sticky top-[67px] z-40 flex border-b overflow-x-auto backdrop-blur-lg px-7" style={{ borderColor: 'var(--border)', background: 'var(--navy)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`font-display text-[13px] font-semibold tracking-wider uppercase px-5 py-3 border-b-2 whitespace-nowrap transition-all ${activeTab === tab.id ? 'border-[var(--gold)] text-[var(--gold)]' : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <main className="relative z-10 p-7 max-w-[1600px]">

        {/* ═══ SCREENER TAB ═══ */}
        {/* ═══ DASHBOARD ═══ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-display text-lg font-bold" style={{ color: 'var(--text)' }}>Market Overview</div>
              <button onClick={loadDashboard} disabled={dashLoading || !schwabStatus.connected}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed text-xs">
                {dashLoading ? '⏳ Loading...' : '🔄 Refresh'}
              </button>
            </div>

            {!schwabStatus.connected && (
              <div className="text-center py-10">
                <div className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>Connect Schwab to load market data</div>
              </div>
            )}

            {schwabStatus.connected && !dashData && !dashLoading && (
              <div className="text-center py-10">
                <div className="text-4xl mb-3 opacity-30">🏠</div>
                <div className="font-display text-xl font-bold" style={{ color: 'var(--text-dim)' }}>Click Refresh to load market overview</div>
              </div>
            )}

            {dashLoading && (
              <div className="text-center py-10">
                <div className="w-10 h-10 rounded-full border-[3px] animate-spin mx-auto mb-4" style={{ borderColor: 'rgba(255,255,255,0.08)', borderTopColor: 'var(--blue3)' }} />
                <div className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>Loading indices, sectors, and Strat data...</div>
              </div>
            )}

            {dashData && (
              <>
                {/* Market Bias */}
                <div className="rounded-xl border p-4" style={{
                  background: dashData.marketBias?.includes('BULLISH') ? 'rgba(34,197,94,0.08)' : dashData.marketBias?.includes('BEARISH') ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
                  borderColor: dashData.marketBias?.includes('BULLISH') ? 'rgba(34,197,94,0.3)' : dashData.marketBias?.includes('BEARISH') ? 'rgba(239,68,68,0.3)' : 'var(--border)',
                }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Market Bias</div>
                      <div className="font-display text-2xl font-bold mt-1" style={{
                        color: dashData.marketBias?.includes('BULLISH') ? 'var(--green)' : dashData.marketBias?.includes('BEARISH') ? 'var(--red)' : 'var(--gold)'
                      }}>{dashData.marketBias}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>{dashData.bullishSectors}/{dashData.totalSectors} sectors green</div>
                    </div>
                  </div>
                  {dashData.signals?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {dashData.signals.map((s: string, i: number) => (
                        <div key={i} className="font-mono text-[11px]" style={{ color: 'var(--gold)' }}>⚡ {s}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Indices */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {dashData.indices?.map((idx: any) => (
                    <div key={idx.symbol} className="rounded-xl border p-4" style={{ background: 'var(--navy2)', borderColor: 'var(--border)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-display text-sm font-bold" style={{ color: 'var(--blue3)' }}>{idx.symbol}</span>
                        <span className="font-mono text-xs" style={{ color: idx.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {idx.change >= 0 ? '+' : ''}{idx.change?.toFixed(2)}%
                        </span>
                      </div>
                      <div className="font-mono text-lg font-bold" style={{ color: 'var(--text)' }}>${idx.price?.toFixed(2)}</div>
                      <div className="font-mono text-[9px] mt-2" style={{ color: 'var(--text-dim)' }}>{idx.label}</div>
                      <div className="mt-2 flex gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          idx.strat?.daily === '2U' ? 'bg-green-500/20 text-green-400' :
                          idx.strat?.daily === '2D' ? 'bg-red-500/20 text-red-400' :
                          idx.strat?.daily === '3' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>D: {idx.strat?.daily}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          idx.strat?.weekly === '2U' ? 'bg-green-500/20 text-green-400' :
                          idx.strat?.weekly === '2D' ? 'bg-red-500/20 text-red-400' :
                          idx.strat?.weekly === '3' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>W: {idx.strat?.weekly}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          idx.strat?.monthly === '2U' ? 'bg-green-500/20 text-green-400' :
                          idx.strat?.monthly === '2D' ? 'bg-red-500/20 text-red-400' :
                          idx.strat?.monthly === '3' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>M: {idx.strat?.monthly}</span>
                      </div>
                      <div className="font-mono text-[9px] mt-1" style={{ color: 'var(--text-dim)' }}>{idx.strat?.dailySeq}</div>
                    </div>
                  ))}
                </div>

                {/* Sectors ranked by performance */}
                <Panel title="📊 Sector Performance (ranked by daily change)">
                  <div className="space-y-0">
                    {dashData.sectors?.map((sec: any, i: number) => (
                      <div key={sec.symbol} className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[10px] w-4 text-right" style={{ color: 'var(--text-dim)' }}>{i + 1}</span>
                          <span className="font-display text-sm font-bold w-12" style={{ color: 'var(--blue3)' }}>{sec.symbol}</span>
                          <span className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>{sec.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              sec.strat?.daily === '2U' ? 'bg-green-500/20 text-green-400' :
                              sec.strat?.daily === '2D' ? 'bg-red-500/20 text-red-400' :
                              sec.strat?.daily === '3' ? 'bg-purple-500/20 text-purple-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>D:{sec.strat?.daily}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              sec.strat?.weekly === '2U' ? 'bg-green-500/20 text-green-400' :
                              sec.strat?.weekly === '2D' ? 'bg-red-500/20 text-red-400' :
                              sec.strat?.weekly === '3' ? 'bg-purple-500/20 text-purple-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>W:{sec.strat?.weekly}</span>
                          </div>
                          <span className="font-mono text-xs w-8 text-right" style={{ color: 'var(--text-dim)' }}>${sec.price?.toFixed(0)}</span>
                          <span className="font-mono text-xs font-bold w-16 text-right" style={{ color: sec.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {sec.change >= 0 ? '+' : ''}{sec.change?.toFixed(2)}%
                          </span>
                          {/* Performance bar */}
                          <div className="w-20 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full" style={{
                              width: `${Math.min(Math.abs(sec.change) * 20, 100)}%`,
                              background: sec.change >= 0 ? 'var(--green)' : 'var(--red)',
                              marginLeft: sec.change < 0 ? 'auto' : '0',
                            }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </>
            )}
          </div>
        )}

        {activeTab === 'screener' && (
          <div className="space-y-5">
            {/* Data Source — Multi-Provider */}
            <Panel title="🔗 Data Source & API Keys">
              <div className="space-y-4">
                {/* Platform Schwab status */}
                <div className="flex items-center gap-4 flex-wrap">
                  {schwabStatus.connected ? (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_#10b981]" />
                      <span className="font-mono text-sm text-green-400">Platform Schwab Connected · Real Greeks</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {isAdmin && <a href="/api/schwab/auth" className="btn-primary text-xs">🔐 Connect Platform Schwab</a>}
                      <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>{isAdmin ? 'Admin connection for real-time data' : 'Platform Schwab not connected — add your own keys below'}</span>
                    </div>
                  )}
                </div>

                {/* Personal API Keys */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div className="font-display text-xs font-bold tracking-wider uppercase mb-3" style={{ color: 'var(--gold)' }}>Your Personal API Keys</div>
                  <div className="font-mono text-[10px] mb-4" style={{ color: 'var(--text-dim)' }}>
                    Connect your own API for scanning. Schwab = best (real Greeks). Tradier = easy signup. Polygon = free fallback.
                  </div>

                  {/* Provider tabs */}
                  <div className="flex gap-2 mb-4">
                    {(['schwab', 'tradier', 'polygon'] as const).map(p => (
                      <button key={p} onClick={() => setUserProvider(p)}
                        className={`px-4 py-2 rounded-lg font-display text-xs font-bold tracking-wider uppercase border transition-all ${
                          userProvider === p ? 'border-[var(--blue3)] text-[var(--blue3)]' : 'border-[var(--border)] text-[var(--text-dim)]'
                        }`}>
                        {p === 'schwab' ? '🏦 Schwab' : p === 'tradier' ? '📊 Tradier' : '🔷 Polygon'}
                      </button>
                    ))}
                  </div>

                  {/* Schwab personal keys */}
                  {userProvider === 'schwab' && (
                    <div className="space-y-3">
                      <div className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                        Register at <a href="https://developer.schwab.com" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--blue3)' }}>developer.schwab.com</a> → Create app → Get Client ID & Secret
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-dim)' }}>Client ID</label>
                          <input value={userKeys.schwab?.clientId || ''} onChange={(e: any) => setUserKeys((p: any) => ({...p, schwab: {...(p.schwab||{}), clientId: e.target.value}}))}
                            className="w-full px-3 py-2 rounded-md font-mono text-xs border outline-none" style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder="App Key"/>
                        </div>
                        <div>
                          <label className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-dim)' }}>App Secret</label>
                          <input type="password" value={userKeys.schwab?.clientSecret || ''} onChange={(e: any) => setUserKeys((p: any) => ({...p, schwab: {...(p.schwab||{}), clientSecret: e.target.value}}))}
                            className="w-full px-3 py-2 rounded-md font-mono text-xs border outline-none" style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder="Secret"/>
                        </div>
                        <div>
                          <label className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-dim)' }}>Refresh Token</label>
                          <input type="password" value={userKeys.schwab?.refreshToken || ''} onChange={(e: any) => setUserKeys((p: any) => ({...p, schwab: {...(p.schwab||{}), refreshToken: e.target.value}}))}
                            className="w-full px-3 py-2 rounded-md font-mono text-xs border outline-none" style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder="Refresh token"/>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tradier keys */}
                  {userProvider === 'tradier' && (
                    <div className="space-y-3">
                      <div className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                        Sign up at <a href="https://developer.tradier.com" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--blue3)' }}>developer.tradier.com</a> → Free sandbox or paid production → Get access token
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-dim)' }}>Access Token</label>
                          <input type="password" value={userKeys.tradier?.accessToken || ''} onChange={(e: any) => setUserKeys((p: any) => ({...p, tradier: {...(p.tradier||{}), accessToken: e.target.value}}))}
                            className="w-full px-3 py-2 rounded-md font-mono text-xs border outline-none" style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder="Bearer token"/>
                        </div>
                        <div className="flex items-end gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={userKeys.tradier?.sandbox || false} onChange={(e: any) => setUserKeys((p: any) => ({...p, tradier: {...(p.tradier||{}), sandbox: e.target.checked}}))} />
                            <span className="font-mono text-xs" style={{ color: 'var(--text-mid)' }}>Sandbox (free, delayed)</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Polygon keys */}
                  {userProvider === 'polygon' && (
                    <div className="space-y-3">
                      <div className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                        Sign up at <a href="https://polygon.io" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--blue3)' }}>polygon.io</a> → Free tier available → Get API key
                      </div>
                      <div>
                        <label className="font-mono text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-dim)' }}>API Key</label>
                        <input value={userKeys.polygon?.apiKey || ''} onChange={(e: any) => setUserKeys((p: any) => ({...p, polygon: {...(p.polygon||{}), apiKey: e.target.value}}))}
                          className="w-full max-w-md px-3 py-2 rounded-md font-mono text-xs border outline-none" style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder="Polygon API key"/>
                      </div>
                    </div>
                  )}

                  {/* Save + Test buttons */}
                  <div className="flex items-center gap-3 mt-4">
                    <button onClick={saveUserKeys} className="btn-primary text-xs">💾 Save Keys</button>
                    <button onClick={() => testUserKeys(userProvider)} className="btn-ghost text-xs">🔌 Test Connection</button>
                    {userKeyStatus && <span className={`font-mono text-xs ${userKeyStatus.ok ? 'text-green-400' : 'text-red-400'}`}>{userKeyStatus.msg}</span>}
                  </div>
                </div>
              </div>
            </Panel>

            {/* Universe */}
            <Panel title="📡 Ticker Universe">
              {/* Ticker search */}
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <input type="text" value={tickerSearch} onChange={e => setTickerSearch(e.target.value.toUpperCase())}
                    placeholder="Search ticker across presets..."
                    className="flex-1 px-3 py-2 rounded-md font-mono text-xs border outline-none transition-colors focus:border-[var(--blue3)]"
                    style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                  {tickerSearch && (
                    <button onClick={() => setTickerSearch('')} className="font-mono text-xs px-2 py-1 rounded" style={{ color: 'var(--text-dim)' }}>✕</button>
                  )}
                </div>
                {tickerSearch.length >= 1 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(UNIVERSES).filter(([_, u]) =>
                      u.tickers.some(t => t.includes(tickerSearch))
                    ).map(([key, u]) => (
                      <span key={key} className="px-2 py-1 rounded font-mono text-[10px] border" style={{ background: 'rgba(30,79,216,0.1)', borderColor: 'var(--blue3)', color: 'var(--blue3)' }}>
                        {u.label} ✓
                      </span>
                    ))}
                    {Object.entries(UNIVERSES).every(([_, u]) => !u.tickers.some(t => t.includes(tickerSearch))) && (
                      <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>Not found in any preset — use Custom universe</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 flex-wrap mb-3">
                {Object.entries(UNIVERSES).map(([key, u]) => (
                  <button key={key} onClick={() => { setUniverse(key); setShowPreview(false); }}
                    className={`px-4 py-2 rounded-lg font-display text-xs font-bold tracking-wider uppercase border transition-all ${
                      universe === key
                        ? u.primary ? 'bg-gradient-to-r from-[var(--gold)] to-amber-600 text-[var(--navy)] border-transparent' : 'border-[var(--blue3)] text-[var(--blue3)]'
                        : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--blue3)] hover:text-[var(--text)]'
                    }`}>
                    {u.label} ({u.tickers.length})
                  </button>
                ))}
                <button onClick={() => { setUniverse('custom'); setShowPreview(false); }}
                  className={`px-4 py-2 rounded-lg font-display text-xs font-bold tracking-wider uppercase border transition-all ${
                    universe === 'custom' ? 'border-[var(--blue3)] text-[var(--blue3)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--blue3)] hover:text-[var(--text)]'
                  }`}>
                  ✏️ Custom
                </button>
              </div>

              {/* Universe info line + preview toggle */}
              {universe !== 'custom' && UNIVERSES[universe] && (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                    {UNIVERSES[universe].desc} · {UNIVERSES[universe].tickers.length} tickers
                  </span>
                  <button onClick={() => setShowPreview(!showPreview)}
                    className="font-mono text-[10px] px-2 py-1 rounded border transition-all hover:border-[var(--blue3)]"
                    style={{ color: 'var(--blue3)', borderColor: 'var(--border)' }}>
                    {showPreview ? '▲ Hide List' : '▼ View Tickers'}
                  </button>
                </div>
              )}

              {/* Ticker preview */}
              {showPreview && universe !== 'custom' && UNIVERSES[universe] && (
                <div className="mt-3 p-3 rounded-lg border max-h-[200px] overflow-y-auto" style={{ background: 'var(--navy4)', borderColor: 'var(--border)' }}>
                  <div className="flex flex-wrap gap-1.5">
                    {UNIVERSES[universe].tickers.map(t => (
                      <span key={t} className="px-2 py-0.5 rounded font-mono text-[10px] border"
                        style={{ background: 'rgba(30,79,216,0.08)', borderColor: 'rgba(59,130,246,0.2)', color: 'var(--blue3)' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom ticker input */}
              {universe === 'custom' && (
                <div className="mt-2">
                  <label className="font-mono text-[9px] uppercase tracking-widest block mb-1" style={{ color: 'var(--text-dim)' }}>Paste tickers (comma separated)</label>
                  <textarea value={customTickers} onChange={e => setCustomTickers(e.target.value)}
                    placeholder="AAPL, TSLA, NVDA, SPY, QQQ..."
                    className="w-full px-3 py-2 rounded-md font-mono text-xs border outline-none min-h-[60px] resize-y"
                    style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                  {customTickers.trim() && (
                    <span className="font-mono text-[10px] mt-1 block" style={{ color: 'var(--text-dim)' }}>
                      {customTickers.split(/[\s,]+/).filter(Boolean).length} tickers
                    </span>
                  )}
                </div>
              )}
            </Panel>

            {/* Filters */}
            <Panel title="🎯 Filters">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <FilterField label="Min Price ($)" value={filters.minPrice} onChange={v => updateFilter('minPrice', +v)} type="number" />
                <FilterField label="Max Price ($)" value={filters.maxPrice} onChange={v => updateFilter('maxPrice', +v)} type="number" />
                <FilterField label="Min Mkt Cap ($M)" value={filters.minMktCap} onChange={v => updateFilter('minMktCap', +v)} type="number" />
                <FilterField label="Min IV Rank (%)" value={filters.minIVR} onChange={v => updateFilter('minIVR', +v)} type="number" />
                <FilterField label="Min IV% (ann.)" value={filters.minIV} onChange={v => updateFilter('minIV', +v)} type="number" />
                <FilterField label="Min Volume" value={filters.minVol} onChange={v => updateFilter('minVol', +v)} type="number" />
                <FilterField label="Min Open Interest" value={filters.minOI} onChange={v => updateFilter('minOI', +v)} type="number" />
                <FilterField label="Min Option Bid ($)" value={filters.minBid} onChange={v => updateFilter('minBid', +v)} type="number" step="0.05" />
                <FilterField label="Min RoR (e.g. 3 = 3%)" value={filters.minRoR} onChange={v => updateFilter('minRoR', +v)} type="number" step="0.5" />
                <FilterField label="Min RSI" value={filters.minRSI} onChange={v => updateFilter('minRSI', +v)} type="number" />
                <FilterField label="Max RSI" value={filters.maxRSI} onChange={v => updateFilter('maxRSI', +v)} type="number" />
                <SelectField label="EMA Trend" value={filters.emaTrend} onChange={v => updateFilter('emaTrend', v)}
                  options={[['any','Any'],['above20','Above 20 EMA'],['above50','Above 50 EMA'],['above200','Above 200 EMA'],['above_both','Above 50 & 200'],['above_all','Above 20/50/200'],['below20','Below 20 EMA']]} />
                {/* Schwab-only filters */}
                <FilterField label={schwabStatus.connected ? '🟢 Delta Target (0-1)' : '🔒 Delta Target'} value={filters.targetDelta}
                  onChange={v => updateFilter('targetDelta', +v)} type="number" step="0.01" disabled={!schwabStatus.connected} />
                <SelectField label={schwabStatus.connected ? '🟢 DTE Range' : '🔒 DTE Range'} value={filters.targetDTE.join('-')}
                  onChange={v => updateFilter('targetDTE', v.split('-').map(Number))} disabled={!schwabStatus.connected}
                  options={[['7-14','7–14 DTE (weeklies)'],['25-45','25–45 DTE (standard)'],['45-60','45–60 DTE'],['60-90','60–90 DTE (diagonals)'],['90-120','90–120 DTE (longer term)']]} />
              </div>

              <div className="flex items-center gap-3 mt-5 flex-wrap">
                <button onClick={runScan} disabled={scanning} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                  {scanning ? '⏳ SCANNING...' : '▶ RUN SCAN'}
                </button>
                {scanning && (
                  <button onClick={() => { cancelRef.current = true; abortRef.current?.abort(); }} className="btn-ghost" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                    ⛔ CANCEL
                  </button>
                )}
                <button onClick={() => { setResults([]); setLogs([]); }} className="btn-ghost">✕ CLEAR</button>
                {scanStats.source && (
                  <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                    {scanStats.found} results · {scanStats.scanned} scanned · {scanStats.elapsed} · via {scanStats.source}
                  </span>
                )}
              </div>
            </Panel>

            {/* Logs */}
            {logs.length > 0 && (
              <Panel title="📋 Scan Log">
                <div className="max-h-[300px] overflow-y-auto font-mono text-[10px] space-y-0.5" style={{ color: 'var(--text-dim)' }}>
                  {logs.map((l, i) => (
                    <div key={i} className={l.startsWith('✓') ? 'text-green-400' : l.startsWith('⚠') || l.startsWith('  ⚠') ? 'text-amber-400' : ''}>
                      {l}
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}

        {/* ═══ RESULTS TAB ═══ */}
        {activeTab === 'results' && <ResultsTable results={results} onSelect={setSelectedTicker} title="All Scan Results" />}
        
        {/* ═══ CSP / WHEEL ═══ */}
        {activeTab === 'csp' && (
          <div className="space-y-4">
            <Panel title="🔄 CSP / Wheel Filters">
              <p className="font-mono text-[10px] mb-3" style={{ color: 'var(--text-dim)' }}>Bullish trend + high IVR + affordable assignment + real premium. Stocks you'd be OK owning if assigned.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <FilterField label="Min IVR (%)" value={stratFilters.csp.minIVR} onChange={v => updateStratFilter('csp','minIVR',+v)} type="number" />
                <FilterField label="Min Bid ($)" value={stratFilters.csp.minBid} onChange={v => updateStratFilter('csp','minBid',+v)} type="number" step="0.05" />
                <FilterField label="Min RoR (%)" value={stratFilters.csp.minRoR} onChange={v => updateStratFilter('csp','minRoR',+v)} type="number" step="0.5" />
                <FilterField label="Max Price ($)" value={stratFilters.csp.maxPrice} onChange={v => updateStratFilter('csp','maxPrice',+v)} type="number" />
                <SelectField label="Trend" value={stratFilters.csp.trendReq} onChange={v => updateStratFilter('csp','trendReq',v)}
                  options={[['any','Any'],['above20','Above 20 EMA'],['above50','Above 50 EMA'],['above_both','Above 50 & 200'],['above_all','Above All (20/50/200)']]} />
              </div>
            </Panel>
            <ResultsTable results={getStrategyResults('csp')} onSelect={setSelectedTicker} title={`CSP / Wheel Candidates (${getStrategyResults('csp').length})`} />
          </div>
        )}

        {/* ═══ CREDIT SPREADS ═══ */}
        {activeTab === 'credit' && (
          <div className="space-y-4">
            <Panel title="📉 Credit Spread Filters">
              <p className="font-mono text-[10px] mb-3" style={{ color: 'var(--text-dim)' }}>High IVR for rich premium + deep OI across strikes for tight bid/ask. Assignment irrelevant — you have the long leg.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <FilterField label="Min IVR (%)" value={stratFilters.credit.minIVR} onChange={v => updateStratFilter('credit','minIVR',+v)} type="number" />
                <FilterField label="Min OI" value={stratFilters.credit.minOI} onChange={v => updateStratFilter('credit','minOI',+v)} type="number" />
                <FilterField label="Min Volume" value={stratFilters.credit.minVol} onChange={v => updateStratFilter('credit','minVol',+v)} type="number" />
                <SelectField label="Direction" value={stratFilters.credit.direction} onChange={v => updateStratFilter('credit','direction',v)}
                  options={[['any','Either'],['bull','Bull Put (bullish)'],['bear','Bear Call (bearish)']]} />
              </div>
            </Panel>
            <ResultsTable results={getStrategyResults('credit')} onSelect={setSelectedTicker} title={`Credit Spread Candidates (${getStrategyResults('credit').length})`} />
          </div>
        )}

        {/* ═══ PMCC ═══ */}
        {activeTab === 'pmcc' && (
          <div className="space-y-4">
            <Panel title="📈 PMCC Filters">
              <p className="font-mono text-[10px] mb-3" style={{ color: 'var(--text-dim)' }}>Strong uptrend + momentum + affordable LEAP. You buy deep ITM LEAP and sell short-term OTM calls monthly.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <FilterField label="Min RSI" value={stratFilters.pmcc.minRSI} onChange={v => updateStratFilter('pmcc','minRSI',+v)} type="number" />
                <FilterField label="Max LEAP Cost ($)" value={stratFilters.pmcc.maxLeapCost} onChange={v => updateStratFilter('pmcc','maxLeapCost',+v)} type="number" step="500" />
                <FilterField label="Min Volume" value={stratFilters.pmcc.minVol} onChange={v => updateStratFilter('pmcc','minVol',+v)} type="number" />
                <SelectField label="Trend" value={stratFilters.pmcc.trendReq} onChange={v => updateStratFilter('pmcc','trendReq',v)}
                  options={[['above_all','Above All (20/50/200)'],['above_both','Above 50 & 200'],['above50','Above 50 EMA'],['above20','Above 20 EMA'],['any','Any']]} />
              </div>
            </Panel>
            <ResultsTable results={getStrategyResults('pmcc')} onSelect={setSelectedTicker} title={`PMCC Candidates (${getStrategyResults('pmcc').length})`} />
          </div>
        )}

        {/* ═══ DIAGONALS ═══ */}
        {activeTab === 'diag' && (
          <div className="space-y-4">
            <Panel title="↗ Diagonal Spread Filters">
              <p className="font-mono text-[10px] mb-3" style={{ color: 'var(--text-dim)' }}>Buy back-month, sell front-month at different strikes. Edge comes from selling elevated near-term IV.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <FilterField label="Min IVR (%)" value={stratFilters.diag.minIVR} onChange={v => updateStratFilter('diag','minIVR',+v)} type="number" />
                <FilterField label="Min Volume" value={stratFilters.diag.minVol} onChange={v => updateStratFilter('diag','minVol',+v)} type="number" />
                <SelectField label="Direction" value={stratFilters.diag.direction} onChange={v => updateStratFilter('diag','direction',v)}
                  options={[['any','Either'],['bull','Bullish (call diag)'],['bear','Bearish (put diag)']]} />
              </div>
            </Panel>
            <ResultsTable results={getStrategyResults('diag')} onSelect={setSelectedTicker} title={`Diagonal Candidates (${getStrategyResults('diag').length})`} />
          </div>
        )}

        {/* ═══ CALENDAR PRESS ═══ */}
        {activeTab === 'calPress' && (
          <div className="space-y-4">
            <Panel title="📅 Calendar Press Filters">
              <p className="font-mono text-[10px] mb-3" style={{ color: 'var(--text-dim)' }}>
                Neutral-to-bullish put diagonal — BUY deep ITM put (90-120 DTE) as collateral, SELL weekly OTM put (~0.20Δ) for premium.
                Collect weekly decay to offset the long put cost. Stock stays flat or drifts up = weekly puts expire worthless = profit.
                If stock breaks down, stop selling weeklies and hold the long put as downside protection.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <FilterField label="Delta Min" value={cpShortDelta} onChange={v => setCpShortDelta(+v)} type="number" step="0.05" />
                <FilterField label="Delta Max" value={cpDeltaMax} onChange={v => setCpDeltaMax(+v)} type="number" step="0.05" />
                <FilterField label="Max Cost Ratio (x)" value={stratFilters.calPress.maxCostRatio} onChange={v => updateStratFilter('calPress','maxCostRatio',+v)} type="number" step="0.5" />
                <FilterField label="Min Weekly ROI (%)" value={stratFilters.calPress.minWeeklyROI} onChange={v => updateStratFilter('calPress','minWeeklyROI',+v)} type="number" />
                <FilterField label="Max Price ($)" value={stratFilters.calPress.maxPrice} onChange={v => updateStratFilter('calPress','maxPrice',+v)} type="number" />
                <FilterField label="Max Capital ($)" value={stratFilters.calPress.maxCapital} onChange={v => updateStratFilter('calPress','maxCapital',+v)} type="number" />
                <FilterField label="Min IVR (%)" value={stratFilters.calPress.minIVR} onChange={v => updateStratFilter('calPress','minIVR',+v)} type="number" />
              </div>
            </Panel>
            <ResultsTable results={getStrategyResults('calPress')} onSelect={setSelectedTicker} title={`Calendar Press Candidates (${getStrategyResults('calPress').length})`} />
          </div>
        )}

        {/* ═══ IRON CONDOR ═══ */}
        {activeTab === 'ic' && (
          <div className="space-y-4">
            <Panel title="🦅 Iron Condor Filters">
              <p className="font-mono text-[10px] mb-3" style={{ color: 'var(--text-dim)' }}>OPPOSITE of trend strategies. Range-bound, neutral RSI, low movement, high IV. Sell premium on both sides.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <FilterField label="Min IVR (%)" value={stratFilters.ic.minIVR} onChange={v => updateStratFilter('ic','minIVR',+v)} type="number" />
                <FilterField label="Max RSI Dev from 50" value={stratFilters.ic.maxRSIDev} onChange={v => updateStratFilter('ic','maxRSIDev',+v)} type="number" />
                <FilterField label="Max ATR (%)" value={stratFilters.ic.maxATR} onChange={v => updateStratFilter('ic','maxATR',+v)} type="number" step="0.5" />
                <FilterField label="Min OI" value={stratFilters.ic.minOI} onChange={v => updateStratFilter('ic','minOI',+v)} type="number" />
                <FilterField label="Min Volume" value={stratFilters.ic.minVol} onChange={v => updateStratFilter('ic','minVol',+v)} type="number" />
              </div>
            </Panel>
            <ResultsTable results={getStrategyResults('ic')} onSelect={setSelectedTicker} title={`Iron Condor Candidates (${getStrategyResults('ic').length})`} />
          </div>
        )}

        {/* ═══ UOA ═══ */}
        {activeTab === 'uoa' && (
          <div className="space-y-4">
            <Panel title="🔥 UOA Filters">
              <p className="font-mono text-[10px] mb-3" style={{ color: 'var(--text-dim)' }}>Unusual options activity — volume significantly exceeds open interest, signaling directional bets.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FilterField label="Min Vol/OI Ratio" value={stratFilters.uoa.minRatio} onChange={v => updateStratFilter('uoa','minRatio',+v)} type="number" step="0.5" />
                <FilterField label="Min Options Volume" value={stratFilters.uoa.minOptVol} onChange={v => updateStratFilter('uoa','minOptVol',+v)} type="number" />
              </div>
            </Panel>
            <ResultsTable results={getStrategyResults('uoa')} onSelect={setSelectedTicker} title={`Unusual Activity (${getStrategyResults('uoa').length})`} />
          </div>
        )}

        {/* ═══ EQUITIES TAB ═══ */}
        {activeTab === 'equity' && (
          <div className="space-y-4">
            <Panel title="📊 Equity Pattern Scanner — 5CR & The Strat (Multi-Timeframe)">
              <p className="font-mono text-[10px] mb-3" style={{ color: 'var(--text-dim)' }}>
                Scans daily candles and aggregates into 2D, 3D, 5D, 10D, 1W, 2W, 3W, 1M, 2M, 3M timeframes.
                Top-Down mode: Indices → Sectors → Tickers. Universe mode: scan selected ticker list.
                Results ranked by confluence — more timeframes with setups = higher priority.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                <SelectField label="Scan Mode" value={equityFilter.showType} onChange={v => setEquityFilter(prev => ({ ...prev, showType: v }))}
                  options={[['topdown','🔻 Top-Down (Index→Sector→Ticker)'],['universe','📡 Selected Universe']]} />
                <FilterField label="Min 5CR Candles" value={equityFilter.min5CR} onChange={v => setEquityFilter(prev => ({ ...prev, min5CR: +v }))} type="number" />
                <FilterField label="Min Price ($)" value={equityFilter.minPrice} onChange={v => setEquityFilter(prev => ({ ...prev, minPrice: +v }))} type="number" />
                <FilterField label="Max Price ($)" value={equityFilter.maxPrice} onChange={v => setEquityFilter(prev => ({ ...prev, maxPrice: +v }))} type="number" />
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>&nbsp;</label>
                  <button onClick={runEquityScan} disabled={equityLoading || !schwabStatus.connected}
                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                    {equityLoading ? '⏳ SCANNING...' : '📊 SCAN EQUITIES'}
                  </button>
                </div>
              </div>
              {/* Result filters */}
              {equityResults.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <SelectField label="Pattern Type" value={equityFilter.patternFilter} onChange={v => setEquityFilter(prev => ({ ...prev, patternFilter: v }))}
                    options={[['all','All Patterns'],['5cr','5CR Only'],['strat','Strat Only'],['212','2-1-2'],['312','3-1-2'],['132','1-3-2'],['13','1-3 (Building)'],['11','1-1 (Coiling)'],['22','2-2 Reversal'],['inside','Inside Bars (1)']]} />
                  <SelectField label="Direction" value={equityFilter.directionFilter} onChange={v => setEquityFilter(prev => ({ ...prev, directionFilter: v }))}
                    options={[['all','All'],['bullish','Bullish Only'],['bearish','Bearish Only']]} />
                  <SelectField label="Sort By" value={equityFilter.sortBy} onChange={v => setEquityFilter(prev => ({ ...prev, sortBy: v }))}
                    options={[['confluence','Confluence (most TFs)'],['patterns','Pattern Count'],['relstrength','Relative Strength'],['relvolume','Relative Volume'],['change','Daily Change']]} />
                  <SelectField label="Level" value={equityFilter.levelFilter} onChange={v => setEquityFilter(prev => ({ ...prev, levelFilter: v }))}
                    options={[['all','All Levels'],['INDEX','Indices Only'],['SECTOR','Sectors Only'],['TICKER','Tickers Only']]} />
                  <SelectField label="Relative Strength" value={equityFilter.rsFilter} onChange={v => setEquityFilter(prev => ({ ...prev, rsFilter: v }))}
                    options={[['all','All'],['leaders','Leaders (RS > +3%)'],['outperform','Outperforming (RS > 0%)'],['laggards','Laggards (RS < -3%)'],['underperform','Underperforming (RS < 0%)']]} />
                </div>
              )}
              {!schwabStatus.connected && <span className="font-mono text-xs text-red-400">Schwab connection required</span>}
            </Panel>

            {/* Results */}
            {equityResults.length > 0 && (
              <div className="space-y-2">
                {(() => {
                  // Apply filters
                  let filtered = equityResults.filter((r: any) => {
                    // Level filter
                    if (equityFilter.levelFilter !== 'all' && r.level !== equityFilter.levelFilter) return false;
                    // Direction filter
                    if (equityFilter.directionFilter === 'bullish' && !r.hasBullish) return false;
                    if (equityFilter.directionFilter === 'bearish' && !r.hasBearish) return false;
                    // Pattern type filter
                    const pf = equityFilter.patternFilter;
                    if (pf === '5cr' && !r.has5CR) return false;
                    if (pf === 'strat' && !r.has5CR === false && r.patternNames?.every((p: string) => p.startsWith('5CR'))) return false;
                    if (pf === '212' && !r.patternNames?.some((p: string) => p.includes('2-1-2'))) return false;
                    if (pf === '312' && !r.patternNames?.some((p: string) => p.includes('3-1-2'))) return false;
                    if (pf === '132' && !r.patternNames?.some((p: string) => p.includes('1-3-2'))) return false;
                    if (pf === '13' && !r.patternNames?.some((p: string) => p.includes('1-3'))) return false;
                    if (pf === '11' && !r.patternNames?.some((p: string) => p.includes('1-1'))) return false;
                    if (pf === '22' && !r.patternNames?.some((p: string) => p.includes('2-2'))) return false;
                    if (pf === 'inside' && !r.patternNames?.some((p: string) => p.includes('Inside') || p.includes('1-1'))) return false;
                    // RS filter
                    const rsf = equityFilter.rsFilter;
                    if (rsf === 'leaders' && (r.relStrength == null || r.relStrength <= 3)) return false;
                    if (rsf === 'outperform' && (r.relStrength == null || r.relStrength <= 0)) return false;
                    if (rsf === 'laggards' && (r.relStrength == null || r.relStrength >= -3)) return false;
                    if (rsf === 'underperform' && (r.relStrength == null || r.relStrength >= 0)) return false;
                    return true;
                  });
                  // Sort
                  if (equityFilter.sortBy === 'confluence') filtered.sort((a: any, b: any) => b.confluenceScore - a.confluenceScore || b.totalPatterns - a.totalPatterns);
                  else if (equityFilter.sortBy === 'patterns') filtered.sort((a: any, b: any) => b.totalPatterns - a.totalPatterns);
                  else if (equityFilter.sortBy === 'relstrength') filtered.sort((a: any, b: any) => (b.relStrength || -999) - (a.relStrength || -999));
                  else if (equityFilter.sortBy === 'relvolume') filtered.sort((a: any, b: any) => (b.relVolume || 0) - (a.relVolume || 0));
                  else if (equityFilter.sortBy === 'change') filtered.sort((a: any, b: any) => Math.abs(b.change || 0) - Math.abs(a.change || 0));

                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs" style={{ color: 'var(--green)' }}>{filtered.length} of {equityResults.length} tickers shown</span>
                        <div className="flex gap-2">
                          <button onClick={() => setExpandedEquity(new Set(filtered.map((r: any) => r.ticker)))}
                            className="font-mono text-[10px] px-2 py-1 rounded border transition-all hover:border-[var(--blue3)]"
                            style={{ color: 'var(--blue3)', borderColor: 'var(--border)' }}>Expand All</button>
                          <button onClick={() => setExpandedEquity(new Set())}
                            className="font-mono text-[10px] px-2 py-1 rounded border transition-all hover:border-[var(--blue3)]"
                            style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>Collapse All</button>
                        </div>
                      </div>
                      {filtered.map((r: any) => {
                        const isExpanded = expandedEquity.has(r.ticker);
                        return (
                        <div key={r.ticker} className="rounded-xl border overflow-hidden" style={{ background: 'var(--navy2)', borderColor: 'var(--border)' }}>
                          {/* Header — always visible, clickable */}
                          <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                            onClick={() => setExpandedEquity(prev => {
                              const next = new Set(prev);
                              if (next.has(r.ticker)) next.delete(r.ticker);
                              else next.add(r.ticker);
                              return next;
                            })}
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>{isExpanded ? '▼' : '▶'}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                r.level === 'INDEX' ? 'bg-purple-500/20 text-purple-400' :
                                r.level === 'SECTOR' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-gray-500/20 text-gray-400'
                              }`}>{r.level}</span>
                              <span className="font-display text-xl font-bold" style={{ color: 'var(--blue3)' }}>{r.ticker}</span>
                              {r.daysToEarnings !== null && r.daysToEarnings !== undefined && r.daysToEarnings >= 0 && r.daysToEarnings <= 14 && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${r.daysToEarnings <= 3 ? 'bg-red-500/25 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                  ⚠ ER ~{r.daysToEarnings}d
                                </span>
                              )}
                              <span className="font-mono text-sm" style={{ color: 'var(--text)' }}>${r.price?.toFixed(2)}</span>
                              <span className="font-mono text-xs" style={{ color: r.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {r.change >= 0 ? '+' : ''}{r.change?.toFixed(2)}%
                              </span>
                              {/* Relative volume badge */}
                              {r.relVolume > 0 && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  r.relVolume >= 2 ? 'bg-green-500/20 text-green-400' :
                                  r.relVolume >= 1.5 ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-gray-500/10 text-gray-500'
                                }`}>{r.relVolume}x vol</span>
                              )}
                              {r.relStrength != null && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  r.relStrength >= 3 ? 'bg-green-500/20 text-green-400' :
                                  r.relStrength >= 1 ? 'bg-green-500/10 text-green-300' :
                                  r.relStrength <= -3 ? 'bg-red-500/20 text-red-400' :
                                  r.relStrength <= -1 ? 'bg-red-500/10 text-red-300' :
                                  'bg-gray-500/10 text-gray-500'
                                }`}>{r.relStrength >= 0 ? '+' : ''}{r.relStrength}% RS</span>
                              )}
                              {/* Quick pattern summary when collapsed */}
                              {!isExpanded && (
                                <div className="flex gap-1 ml-1">
                                  {r.timeframes?.slice(0, 4).map((tf: any, i: number) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(30,79,216,0.1)', color: 'var(--blue3)' }}>{tf.timeframe}</span>
                                  ))}
                                  {r.timeframes?.length > 4 && <span className="text-[8px]" style={{ color: 'var(--text-dim)' }}>+{r.timeframes.length - 4}</span>}
                                </div>
                              )}
                            </div>
                            <span className="px-2 py-1 rounded font-mono text-[10px] font-bold" style={{ background: r.confluenceScore >= 3 ? 'rgba(34,197,94,0.15)' : r.confluenceScore >= 2 ? 'rgba(240,180,41,0.15)' : 'rgba(255,255,255,0.05)', color: r.confluenceScore >= 3 ? 'var(--green)' : r.confluenceScore >= 2 ? 'var(--gold)' : 'var(--text-dim)' }}>
                              {r.confluenceScore} TF · {r.totalPatterns} patterns
                            </span>
                          </div>

                          {/* Volume & RS detail when expanded */}
                          {isExpanded && (
                            <div className="flex items-center gap-4 px-4 py-2 border-b font-mono text-[10px] flex-wrap" style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
                              {r.avgVolume > 0 && <>
                                <span style={{ color: 'var(--text-dim)' }}>Today: {r.volume?.toLocaleString()}</span>
                                <span style={{ color: 'var(--text-dim)' }}>Avg (20d): {r.avgVolume?.toLocaleString()}</span>
                                <span style={{ color: r.relVolume >= 2 ? 'var(--green)' : r.relVolume >= 1.5 ? 'var(--gold)' : 'var(--text-dim)' }}>
                                  Relative: {r.relVolume}x {r.relVolume >= 2 ? '🔥 High' : r.relVolume >= 1.5 ? '⚡ Above avg' : ''}
                                </span>
                              </>}
                              {r.relStrength != null && <>
                                <span style={{ color: 'var(--text-dim)' }}>|</span>
                                <span style={{ color: 'var(--text-dim)' }}>20d Return: {r.tickerReturn20d >= 0 ? '+' : ''}{r.tickerReturn20d}%</span>
                                <span style={{ color: 'var(--text-dim)' }}>{r.sectorETF}: {r.sectorReturn20d >= 0 ? '+' : ''}{r.sectorReturn20d}%</span>
                                <span style={{ color: r.relStrength >= 3 ? 'var(--green)' : r.relStrength <= -3 ? 'var(--red)' : 'var(--text-dim)' }}>
                                  RS: {r.relStrength >= 0 ? '+' : ''}{r.relStrength}% {r.relStrength >= 5 ? '💪 Leader' : r.relStrength <= -5 ? '📉 Laggard' : ''}
                                </span>
                              </>}
                            </div>
                          )}

                          {/* Timeframe results — only when expanded */}
                          {isExpanded && r.timeframes?.map((tf: any, i: number) => (
                      <div key={i} className="px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold" style={{ background: 'rgba(30,79,216,0.15)', color: 'var(--blue3)' }}>{tf.timeframe}</span>
                          <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>Strat: {tf.recentStrat}</span>
                        </div>

                        {/* 5CR on this timeframe */}
                        {tf.fiveCR_bearish && (
                          <div className="flex items-center gap-2 ml-4 mb-1">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">5CR BEARISH</span>
                            <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                              {tf.fiveCR_bearish.count} lower highs · Trigger: <span style={{ color: 'var(--green)' }}>${tf.fiveCR_bearish.triggerPrice?.toFixed(2)}</span>
                            </span>
                          </div>
                        )}
                        {tf.fiveCR_bullish && (
                          <div className="flex items-center gap-2 ml-4 mb-1">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/20 text-green-400">5CR BULLISH</span>
                            <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                              {tf.fiveCR_bullish.count} higher lows · Trigger: <span style={{ color: 'var(--red)' }}>${tf.fiveCR_bullish.triggerPrice?.toFixed(2)}</span>
                            </span>
                          </div>
                        )}

                        {/* Strat setups on this timeframe */}
                        {tf.stratSetups?.map((s: any, j: number) => (
                          <div key={j} className="flex items-center gap-2 ml-4 mb-1">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              s.direction === 'BULLISH' ? 'bg-green-500/20 text-green-400' :
                              s.direction === 'BEARISH' ? 'bg-red-500/20 text-red-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>STRAT {s.pattern}</span>
                            <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                              {s.description}
                              {s.triggerPrice && <> · Trigger: <span style={{ color: 'var(--gold)' }}>${s.triggerPrice.toFixed(2)}</span></>}
                              {s.triggerHigh && <> · High: <span style={{ color: 'var(--green)' }}>${s.triggerHigh.toFixed(2)}</span> / Low: <span style={{ color: 'var(--red)' }}>${s.triggerLow.toFixed(2)}</span></>}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  );
                })}
                </>
                );
                })()}
              </div>
            )}

            {equityResults.length === 0 && !equityLoading && equityLogs.length <= 1 && (
              <div className="text-center py-14">
                <div className="text-4xl mb-3 opacity-30">📊</div>
                <div className="font-display text-xl font-bold" style={{ color: 'var(--text-dim)' }}>Equity Scanner Ready</div>
                <div className="font-mono text-xs mt-2" style={{ color: 'var(--text-dim)' }}>Choose Top-Down or Universe mode and click SCAN EQUITIES</div>
              </div>
            )}

            {equityLoading && (
              <div className="text-center py-14">
                <div className="w-10 h-10 rounded-full border-[3px] animate-spin mx-auto mb-4" style={{ borderColor: 'rgba(255,255,255,0.08)', borderTopColor: 'var(--blue3)' }} />
                <div className="font-display text-lg font-bold" style={{ color: 'var(--text)' }}>Scanning patterns across all timeframes...</div>
                <div className="font-mono text-xs mt-2" style={{ color: 'var(--text-dim)' }}>1D → 2D → 3D → 5D → 10D → 1W → 2W → 3W → 1M → 2M → 3M</div>
              </div>
            )}

            {/* Scan Log */}
            {equityLogs.length > 1 && (
              <Panel title={`📋 Scan Log (${equityLogs.length} entries)`}>
                <div className="max-h-[200px] overflow-y-auto px-3 py-2">
                  {equityLogs.map((log, i) => (
                    <div key={i} className="font-mono text-[10px] py-0.5" style={{ color: log.startsWith('✓') ? 'var(--green)' : log.startsWith('⊘') ? 'var(--text-dim)' : log.startsWith('──') ? 'var(--gold)' : 'var(--text)' }}>
                      {log}
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}

        {/* ═══ SPX RADAR TAB ═══ */}
        {activeTab === 'spx' && (
          <div className="space-y-4">
            <Panel title="🎯 SPX Radar — Structural Levels & Play Builder">
              <p className="font-mono text-[10px] mb-3" style={{ color: 'var(--text-dim)' }}>
                Analyzes SPX option chain for put/call wall clusters, OI-weighted GEX, gamma flip zone, expected move, and P/C ratio.
                Builds IC and credit spread plays at structural support/resistance with expected move validation.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <SelectField label="DTE Range" value={spxDTE} onChange={v => setSpxDTE(v)}
                  options={[['0-2','0DTE / 1DTE'],['0-7','This Week (0-7)'],['7-14','Next Week (7-14)'],['14-30','2-4 Weeks'],['30-45','30-45 DTE']]} />
                <SelectField label="Wing Width" value={spxWingWidth} onChange={v => setSpxWingWidth(v)}
                  options={[['5','$5 Wide'],['10','$10 Wide'],['15','$15 Wide'],['20','$20 Wide'],['25','$25 Wide']]} />
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>&nbsp;</label>
                  <button onClick={runSpxScan} disabled={spxLoading || !schwabStatus.connected} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                    {spxLoading ? '⏳ SCANNING SPX...' : '🎯 SCAN SPX'}
                  </button>
                </div>
                {!schwabStatus.connected && <span className="font-mono text-xs text-red-400">Schwab connection required for SPX Radar</span>}
              </div>
            </Panel>

            {spxData && !spxData.error && (() => {
              const d = spxData;
              const ds = d.dataSource === 'OI' ? 'OI' : 'Vol';
              return (
              <>
                {/* ─── ROW 1: Price · Expected Move · Gamma Regime · P/C Ratio ─── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border p-4" style={{ background: 'var(--navy2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-dim)' }}>SPX Price</div>
                    <div className="font-display text-2xl font-bold" style={{ color: 'var(--blue3)' }}>${d.spxPrice?.toFixed(2)}</div>
                    <div className="font-mono text-[10px] mt-1" style={{ color: d.dataSource === 'OI' ? 'var(--green)' : 'var(--gold)' }}>
                      {d.dataSource === 'OI' ? '● Open Interest' : '● Volume (OI unavailable)'}
                    </div>
                  </div>
                  <div className="rounded-xl border p-4" style={{ background: 'var(--navy2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-dim)' }}>Expected Move ({d.avgDTE || '?'}d)</div>
                    <div className="font-display text-2xl font-bold" style={{ color: 'var(--purple)' }}>±${d.expectedMove}</div>
                    <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--text-dim)' }}>
                      {d.expectedMovePercent}% · ${d.expectedLow}—${d.expectedHigh}
                    </div>
                  </div>
                  <div className="rounded-xl border p-4" style={{ background: 'var(--navy2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-dim)' }}>Gamma Regime</div>
                    <div className="font-display text-lg font-bold" style={{ color: d.totalGEX > 0 ? 'var(--green)' : 'var(--red)' }}>{d.regime}</div>
                    <div className="font-mono text-[9px] mt-1 leading-tight" style={{ color: 'var(--text-dim)' }}>{d.regimeDescription}</div>
                  </div>
                  <div className="rounded-xl border p-4" style={{ background: 'var(--navy2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-dim)' }}>Put/Call Ratio</div>
                    <div className="font-display text-2xl font-bold" style={{ color: d.pcRatio > 1.5 ? 'var(--green)' : d.pcRatio < 0.7 ? 'var(--red)' : 'var(--gold)' }}>{d.pcRatio?.toFixed(2)}</div>
                    <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--text-dim)' }}>
                      {d.pcRatio > 1.5 ? 'Heavy put hedging (supportive)' : d.pcRatio < 0.7 ? 'Call-heavy (speculative)' : 'Balanced positioning'}
                    </div>
                  </div>
                </div>

                {/* ─── ROW 2: Clustered Walls + Gamma Flip ─── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border p-4" style={{ background: 'var(--navy2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-2" style={{ color: 'var(--green)' }}>Put Wall Cluster (Support)</div>
                    {d.putWallCluster ? (<>
                      <div className="font-display text-2xl font-bold" style={{ color: 'var(--green)' }}>${d.putWallCluster.centerStrike}</div>
                      <div className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                        {d.putWallCluster.totalActivity?.toLocaleString()} {ds} · ${d.putWallCluster.distFromPrice} below
                      </div>
                      <div className="mt-2 space-y-0.5">
                        {d.putWallCluster.strikes?.slice(0, 4).map((s: any, i: number) => (
                          <div key={i} className="flex justify-between font-mono text-[9px]">
                            <span style={{ color: i === 0 ? 'var(--green)' : 'var(--text-dim)' }}>${s.strike}</span>
                            <span style={{ color: 'var(--text-dim)' }}>{s.activity?.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </>) : <div className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>No put wall found</div>}
                  </div>

                  <div className="rounded-xl border p-4" style={{ background: 'var(--navy2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-2" style={{ color: 'var(--gold)' }}>Gamma Flip Zone</div>
                    <div className="font-display text-2xl font-bold" style={{ color: 'var(--gold)' }}>${d.gammaFlip?.toFixed(0)}</div>
                    <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--text-dim)' }}>
                      {d.spxPrice > d.gammaFlip ? `Price $${Math.round(d.spxPrice - d.gammaFlip)} ABOVE flip` : `Price $${Math.round(d.gammaFlip - d.spxPrice)} BELOW flip`}
                    </div>
                    <div className="mt-2 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="font-mono text-[9px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                        {d.spxPrice > d.gammaFlip
                          ? 'Above flip → positive gamma territory → dealers cushion moves'
                          : 'Below flip → negative gamma territory → dealers amplify moves'}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border p-4" style={{ background: 'var(--navy2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono text-[9px] uppercase tracking-wider mb-2" style={{ color: 'var(--red)' }}>Call Wall Cluster (Resistance)</div>
                    {d.callWallCluster ? (<>
                      <div className="font-display text-2xl font-bold" style={{ color: 'var(--red)' }}>${d.callWallCluster.centerStrike}</div>
                      <div className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                        {d.callWallCluster.totalActivity?.toLocaleString()} {ds} · ${d.callWallCluster.distFromPrice} above
                      </div>
                      <div className="mt-2 space-y-0.5">
                        {d.callWallCluster.strikes?.slice(0, 4).map((s: any, i: number) => (
                          <div key={i} className="flex justify-between font-mono text-[9px]">
                            <span style={{ color: i === 0 ? 'var(--red)' : 'var(--text-dim)' }}>${s.strike}</span>
                            <span style={{ color: 'var(--text-dim)' }}>{s.activity?.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </>) : <div className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>No call wall found</div>}
                  </div>
                </div>

                {/* ─── STRUCTURAL RANGE MAP ─── */}
                <Panel title="📐 Structural Range Map">
                  {(() => {
                    const low = d.putWallCluster?.centerStrike || d.putWall?.strike || d.spxPrice - 50;
                    const high = d.callWallCluster?.centerStrike || d.callWall?.strike || d.spxPrice + 50;
                    const rangeMin = Math.min(low, d.expectedLow || low) - 10;
                    const rangeMax = Math.max(high, d.expectedHigh || high) + 10;
                    const total = rangeMax - rangeMin;
                    const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - rangeMin) / total) * 100))}%`;
                    return (
                      <div className="relative h-16 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        {/* Expected move band */}
                        <div className="absolute top-0 bottom-0 opacity-20 rounded" style={{ left: pos(d.expectedLow), width: `calc(${pos(d.expectedHigh)} - ${pos(d.expectedLow)})`, background: 'var(--purple)' }} />
                        {/* Put wall */}
                        <div className="absolute top-0 bottom-0 w-0.5" style={{ left: pos(low), background: 'var(--green)' }}>
                          <div className="absolute -top-0 left-1 font-mono text-[8px] whitespace-nowrap" style={{ color: 'var(--green)' }}>PUT ${low}</div>
                        </div>
                        {/* Call wall */}
                        <div className="absolute top-0 bottom-0 w-0.5" style={{ left: pos(high), background: 'var(--red)' }}>
                          <div className="absolute -top-0 right-1 font-mono text-[8px] whitespace-nowrap text-right" style={{ color: 'var(--red)' }}>CALL ${high}</div>
                        </div>
                        {/* Gamma flip */}
                        <div className="absolute top-0 bottom-0 w-0.5 border-l border-dashed" style={{ left: pos(d.gammaFlip), borderColor: 'var(--gold)' }}>
                          <div className="absolute bottom-0 left-1 font-mono text-[8px] whitespace-nowrap" style={{ color: 'var(--gold)' }}>FLIP ${Math.round(d.gammaFlip)}</div>
                        </div>
                        {/* Current price */}
                        <div className="absolute top-0 bottom-0 w-1 rounded" style={{ left: pos(d.spxPrice), background: 'var(--blue3)' }}>
                          <div className="absolute top-1/2 -translate-y-1/2 left-2 font-mono text-[9px] font-bold whitespace-nowrap" style={{ color: 'var(--blue3)' }}>SPX ${d.spxPrice?.toFixed(0)}</div>
                        </div>
                        {/* Legend */}
                        <div className="absolute bottom-1 right-2 flex items-center gap-3 font-mono text-[8px]">
                          <span style={{ color: 'var(--purple)' }}>■ Expected Move</span>
                        </div>
                      </div>
                    );
                  })()}
                </Panel>

                {/* ─── GEX Visualization ─── */}
                <Panel title="📊 Gamma Exposure by Strike (GEX)">
                  <div className="space-y-0.5 max-h-[340px] overflow-y-auto">
                    {d.strikes?.filter((s: any) => Math.abs(s.netGEX) > 0).map((s: any) => {
                      const maxGEX = Math.max(...d.strikes.map((x: any) => Math.abs(x.netGEX)));
                      const pct = maxGEX > 0 ? Math.abs(s.netGEX) / maxGEX * 100 : 0;
                      const isCurrentPrice = Math.abs(s.strike - d.spxPrice) < 5;
                      const isPutWall = d.putWallCluster?.strikes?.some((w: any) => w.strike === s.strike);
                      const isCallWall = d.callWallCluster?.strikes?.some((w: any) => w.strike === s.strike);
                      const isGammaFlip = Math.abs(s.strike - d.gammaFlip) < 5;
                      const isExpectedBound = Math.abs(s.strike - d.expectedLow) < 5 || Math.abs(s.strike - d.expectedHigh) < 5;
                      return (
                        <div key={s.strike} className={`flex items-center gap-2 px-2 py-1 rounded ${isCurrentPrice ? 'ring-1 ring-blue-500/50' : ''}`}
                          style={{ background: isPutWall ? 'rgba(16,185,129,0.06)' : isCallWall ? 'rgba(239,68,68,0.06)' : isGammaFlip ? 'rgba(240,180,41,0.06)' : 'transparent' }}>
                          <span className="font-mono text-[10px] w-12 text-right font-medium" style={{
                            color: isCurrentPrice ? 'var(--blue3)' : isPutWall ? 'var(--green)' : isCallWall ? 'var(--red)' : isGammaFlip ? 'var(--gold)' : isExpectedBound ? 'var(--purple)' : 'var(--text-dim)'
                          }}>
                            {s.strike}
                          </span>
                          <div className="flex-1 h-3 rounded-sm overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            {s.netGEX >= 0 ? (
                              <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: 'var(--green)', opacity: 0.6 }} />
                            ) : (
                              <div className="h-full rounded-sm ml-auto" style={{ width: `${pct}%`, background: 'var(--red)', opacity: 0.6 }} />
                            )}
                          </div>
                          <span className="font-mono text-[9px] w-16 text-right" style={{ color: s.netGEX >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {s.netGEX >= 0 ? '+' : ''}{(s.netGEX / 1e6).toFixed(1)}M
                          </span>
                          <span className="font-mono text-[9px] w-24 text-right" style={{ color: 'var(--text-dim)' }}>
                            P:{(s.putOI || s.putVolume || 0).toLocaleString()} C:{(s.callOI || s.callVolume || 0).toLocaleString()}
                          </span>
                          <span className="font-mono text-[9px] w-14 text-right" style={{ color: (s.netOIDelta || 0) > 0 ? 'var(--green)' : (s.netOIDelta || 0) < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                            Δ{((s.netOIDelta || 0) / 1000).toFixed(1)}k
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-4 font-mono text-[8px] px-2" style={{ color: 'var(--text-dim)' }}>
                    <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: 'var(--green)' }}/>Put Wall</span>
                    <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: 'var(--red)' }}/>Call Wall</span>
                    <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: 'var(--gold)' }}/>Gamma Flip</span>
                    <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: 'var(--blue3)' }}/>Price</span>
                    <span>ΔOI = Put OI − Call OI (+ = put heavy)</span>
                  </div>
                </Panel>

                {/* ─── Per-Expiration Breakdown ─── */}
                {d.expirationSummary?.length > 1 && (
                  <Panel title="📅 Activity by Expiration">
                    <div className="space-y-1">
                      {d.expirationSummary.map((exp: any) => (
                        <div key={exp.expDate} className="flex items-center gap-3 px-2 py-1.5 rounded" style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <span className="font-mono text-[10px] w-24 font-medium" style={{ color: 'var(--text)' }}>
                            {exp.expDate} <span style={{ color: 'var(--text-dim)' }}>({exp.dte}d)</span>
                          </span>
                          <div className="flex-1 h-2.5 rounded-sm overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <div className="h-full rounded-sm" style={{ width: `${exp.pctOfTotal}%`, background: exp.dte <= 2 ? 'var(--gold)' : 'var(--blue3)', opacity: 0.5 }} />
                          </div>
                          <span className="font-mono text-[9px] w-12 text-right" style={{ color: 'var(--text-mid)' }}>{exp.pctOfTotal}%</span>
                          <span className="font-mono text-[9px] w-28 text-right" style={{ color: 'var(--text-dim)' }}>
                            P:{exp.putActivity?.toLocaleString()} C:{exp.callActivity?.toLocaleString()}
                          </span>
                          <span className="font-mono text-[9px] w-10 text-right" style={{ color: exp.pcRatio > 1.5 ? 'var(--green)' : exp.pcRatio < 0.7 ? 'var(--red)' : 'var(--text-dim)' }}>
                            {exp.pcRatio?.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 px-2 font-mono text-[8px]" style={{ color: 'var(--text-dim)' }}>
                      {d.expirationSummary.filter((e: any) => e.dte <= 2).reduce((s: number, e: any) => s + e.pctOfTotal, 0) > 50
                        ? '⚠ Over 50% of activity is in 0-2 DTE — wall levels are mostly short-term and may not persist'
                        : '✓ Activity is distributed across expirations — wall levels have multi-day persistence'}
                    </div>
                  </Panel>
                )}

                {/* ─── Top Walls (individual strikes) ─── */}
                <div className="grid grid-cols-2 gap-4">
                  <Panel title={`🟢 Top Put Strikes (Support)`}>
                    {d.topPutStrikes?.map((s: any, i: number) => (
                      <DetailRow key={i} label={`$${s.strike}`} value={`${(s.activity || 0).toLocaleString()} ${ds}`} color={i === 0 ? 'var(--green)' : 'var(--text-mid)'} />
                    ))}
                  </Panel>
                  <Panel title={`🔴 Top Call Strikes (Resistance)`}>
                    {d.topCallStrikes?.map((s: any, i: number) => (
                      <DetailRow key={i} label={`$${s.strike}`} value={`${(s.activity || 0).toLocaleString()} ${ds}`} color={i === 0 ? 'var(--red)' : 'var(--text-mid)'} />
                    ))}
                  </Panel>
                </div>

                {/* ─── IRON CONDOR ─── */}
                {d.plays?.ironCondor && (
                  <Panel title="🦅 Iron Condor at Wall Clusters">
                    <p className="font-mono text-[10px] px-4 py-2" style={{ color: 'var(--text-dim)' }}>
                      Short strikes at cluster centers — put wall (support) & call wall (resistance)
                    </p>

                    {/* Expected Move Validation */}
                    <div className="mx-4 mb-3 rounded-lg p-3 flex items-start gap-3" style={{
                      background: d.plays.ironCondor.isBreakevenSafe ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                      border: `1px solid ${d.plays.ironCondor.isBreakevenSafe ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    }}>
                      <span className="text-lg">{d.plays.ironCondor.isBreakevenSafe ? '✅' : '⚠️'}</span>
                      <div>
                        <div className="font-mono text-[10px] font-bold" style={{ color: d.plays.ironCondor.isBreakevenSafe ? 'var(--green)' : 'var(--red)' }}>
                          {d.plays.ironCondor.isBreakevenSafe ? 'BREAKEVENS OUTSIDE EXPECTED MOVE' : 'BREAKEVENS INSIDE EXPECTED MOVE'}
                        </div>
                        <div className="font-mono text-[9px] mt-1" style={{ color: 'var(--text-dim)' }}>
                          IC Range: ${d.plays.ironCondor.breakEvenLow?.toFixed(0)}—${d.plays.ironCondor.breakEvenHigh?.toFixed(0)} · Expected: ${d.expectedLow}—${d.expectedHigh} (±${d.expectedMove})
                        </div>
                        {!d.plays.ironCondor.isBreakevenSafe && (
                          <div className="font-mono text-[9px] mt-1" style={{ color: 'var(--red)' }}>
                            Consider wider wings or a different DTE range for better protection
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-4 py-2 font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-dim)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      Put Spread (short at put wall cluster{d.plays.ironCondor.putShortAtCluster ? ' ✓' : ''})
                    </div>
                    <div className="flex justify-between items-center px-4 py-2.5 border-b font-mono text-[11px] bg-red-500/5" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                      <span><span className="font-bold text-red-400 mr-2">SELL</span> SPX ${d.plays.ironCondor.putShort?.strike}P</span>
                      <span style={{ color: 'var(--text-mid)' }}>${d.plays.ironCondor.putShort?.bid?.toFixed(2)} · Δ{d.plays.ironCondor.putShort?.delta?.toFixed(2)} · ${d.plays.ironCondor.putShortDistFromPrice} below</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-2.5 border-b font-mono text-[11px] bg-green-500/5" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                      <span><span className="font-bold text-green-400 mr-2">BUY</span> SPX ${d.plays.ironCondor.putLong?.strike}P</span>
                      <span style={{ color: 'var(--text-mid)' }}>${d.plays.ironCondor.putLong?.ask?.toFixed(2)}</span>
                    </div>

                    <div className="px-4 py-2 font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-dim)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      Call Spread (short at call wall cluster{d.plays.ironCondor.callShortAtCluster ? ' ✓' : ''})
                    </div>
                    <div className="flex justify-between items-center px-4 py-2.5 border-b font-mono text-[11px] bg-red-500/5" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                      <span><span className="font-bold text-red-400 mr-2">SELL</span> SPX ${d.plays.ironCondor.callShort?.strike}C</span>
                      <span style={{ color: 'var(--text-mid)' }}>${d.plays.ironCondor.callShort?.bid?.toFixed(2)} · Δ{d.plays.ironCondor.callShort?.delta?.toFixed(2)} · ${d.plays.ironCondor.callShortDistFromPrice} above</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-2.5 border-b font-mono text-[11px] bg-green-500/5" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                      <span><span className="font-bold text-green-400 mr-2">BUY</span> SPX ${d.plays.ironCondor.callLong?.strike}C</span>
                      <span style={{ color: 'var(--text-mid)' }}>${d.plays.ironCondor.callLong?.ask?.toFixed(2)}</span>
                    </div>

                    <DetailRow label="Total Credit" value={`$${d.plays.ironCondor.totalCredit?.toFixed(2)} ($${(d.plays.ironCondor.totalCredit * 100)?.toFixed(0)}/contract)`} color="var(--green)" />
                    <DetailRow label="Max Loss" value={`$${d.plays.ironCondor.maxLoss?.toFixed(2)} ($${(d.plays.ironCondor.maxLoss * 100)?.toFixed(0)}/contract)`} color="var(--red)" />
                    <DetailRow label="Breakeven Range" value={`$${d.plays.ironCondor.breakEvenLow?.toFixed(0)} — $${d.plays.ironCondor.breakEvenHigh?.toFixed(0)}`} color="var(--blue3)" />
                    <DetailRow label="Return on Risk" value={`${d.plays.ironCondor.ror}%`} color={d.plays.ironCondor.ror >= 25 ? 'var(--green)' : 'var(--gold)'} />
                  </Panel>
                )}

                {/* ─── INDIVIDUAL SPREADS ─── */}
                <div className="grid grid-cols-2 gap-4">
                  {d.plays?.bullPut && (
                    <Panel title="🟢 Bull Put at Put Wall">
                      <div className="flex justify-between items-center px-4 py-2.5 border-b font-mono text-[11px] bg-red-500/5" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <span><span className="font-bold text-red-400 mr-2">SELL</span> ${d.plays.bullPut.shortStrike}P</span>
                        <span style={{ color: 'var(--text-mid)' }}>${d.plays.bullPut.shortBid?.toFixed(2)} · Δ{d.plays.bullPut.shortDelta?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center px-4 py-2.5 border-b font-mono text-[11px] bg-green-500/5" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <span><span className="font-bold text-green-400 mr-2">BUY</span> ${d.plays.bullPut.longStrike}P</span>
                        <span style={{ color: 'var(--text-mid)' }}>${d.plays.bullPut.longAsk?.toFixed(2)}</span>
                      </div>
                      <DetailRow label="Net Credit" value={`$${d.plays.bullPut.netCredit?.toFixed(2)}`} color="var(--green)" />
                      <DetailRow label="Max Loss" value={`$${d.plays.bullPut.maxLoss?.toFixed(2)}`} color="var(--red)" />
                      <DetailRow label="RoR" value={`${d.plays.bullPut.ror}%`} />
                      <div className="px-4 py-2 font-mono text-[9px]" style={{ color: d.plays.bullPut.isOutsideExpectedMove ? 'var(--green)' : 'var(--red)' }}>
                        {d.plays.bullPut.isOutsideExpectedMove
                          ? `✓ Short strike $${d.plays.bullPut.distFromExpectedLow} outside expected low`
                          : `⚠ Short strike inside expected move range`}
                      </div>
                    </Panel>
                  )}
                  {d.plays?.bearCall && (
                    <Panel title="🔴 Bear Call at Call Wall">
                      <div className="flex justify-between items-center px-4 py-2.5 border-b font-mono text-[11px] bg-red-500/5" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <span><span className="font-bold text-red-400 mr-2">SELL</span> ${d.plays.bearCall.shortStrike}C</span>
                        <span style={{ color: 'var(--text-mid)' }}>${d.plays.bearCall.shortBid?.toFixed(2)} · Δ{d.plays.bearCall.shortDelta?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center px-4 py-2.5 border-b font-mono text-[11px] bg-green-500/5" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <span><span className="font-bold text-green-400 mr-2">BUY</span> ${d.plays.bearCall.longStrike}C</span>
                        <span style={{ color: 'var(--text-mid)' }}>${d.plays.bearCall.longAsk?.toFixed(2)}</span>
                      </div>
                      <DetailRow label="Net Credit" value={`$${d.plays.bearCall.netCredit?.toFixed(2)}`} color="var(--green)" />
                      <DetailRow label="Max Loss" value={`$${d.plays.bearCall.maxLoss?.toFixed(2)}`} color="var(--red)" />
                      <DetailRow label="RoR" value={`${d.plays.bearCall.ror}%`} />
                      <div className="px-4 py-2 font-mono text-[9px]" style={{ color: d.plays.bearCall.isOutsideExpectedMove ? 'var(--green)' : 'var(--red)' }}>
                        {d.plays.bearCall.isOutsideExpectedMove
                          ? `✓ Short strike $${d.plays.bearCall.distFromExpectedHigh} outside expected high`
                          : `⚠ Short strike inside expected move range`}
                      </div>
                    </Panel>
                  )}
                </div>
              </>
              );
            })()}

            {spxData?.error && (
              <div className="rounded-xl border p-5" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' }}>
                <div className="font-display text-sm font-bold text-red-400 mb-2">SPX Radar Error</div>
                <div className="font-mono text-xs text-red-300">{spxData.error}</div>
                {spxData.spxPrice > 0 && <div className="font-mono text-xs mt-2" style={{ color: 'var(--text-dim)' }}>SPX Price: ${spxData.spxPrice.toFixed(2)} (quote working, chain issue)</div>}
                <div className="font-mono text-[10px] mt-3" style={{ color: 'var(--text-dim)' }}>
                  Tips: Try a wider DTE range (14-30 or 30-45). If market is closed, 0DTE options may have expired.
                  SPX chain data requires the market to be open or recently closed.
                </div>
              </div>
            )}

            {!spxData && !spxLoading && (
              <div className="text-center py-14">
                <div className="text-4xl mb-3 opacity-30">🎯</div>
                <div className="font-display text-xl font-bold" style={{ color: 'var(--text-dim)' }}>SPX Radar Ready</div>
                <div className="font-mono text-xs mt-2" style={{ color: 'var(--text-dim)' }}>Select a DTE range and click SCAN SPX to analyze structural levels</div>
              </div>
            )}

            {spxLoading && (
              <div className="text-center py-14">
                <div className="w-10 h-10 rounded-full border-[3px] animate-spin mx-auto mb-4" style={{ borderColor: 'rgba(255,255,255,0.08)', borderTopColor: 'var(--gold)' }} />
                <div className="font-display text-lg font-bold" style={{ color: 'var(--text)' }}>Analyzing SPX Chain...</div>
                <div className="font-mono text-xs mt-2" style={{ color: 'var(--gold)' }}>Calculating GEX, walls, gamma flip, and expected move</div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* SCANNING OVERLAY */}
      {scanning && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-5" style={{ background: 'var(--navy)', backdropFilter: 'blur(6px)' }}>
          {/* Spinner */}
          <div className="w-14 h-14 rounded-full border-[3px] animate-spin" style={{ borderColor: 'rgba(255,255,255,0.08)', borderTopColor: 'var(--blue3)' }} />
          
          {/* Title */}
          <div className="font-display text-xl font-bold tracking-wider" style={{ color: 'var(--text)' }}>
            SCANNING MARKETS
          </div>
          
          {/* Current ticker */}
          <div className="font-mono text-sm tracking-wider" style={{ color: 'var(--gold)' }}>
            {scanProgress.ticker
              ? `Processing ${scanProgress.ticker} · ${scanProgress.current}/${scanProgress.total}`
              : schwabStatus.connected
                ? 'Schwab API · Fetching data...'
                : 'Polygon API · Processing tickers...'}
          </div>

          {/* Progress bar */}
          <div className="w-72 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{
                width: scanProgress.total > 0 ? `${(scanProgress.current / scanProgress.total) * 100}%` : '0%',
                background: 'linear-gradient(90deg, var(--blue), var(--gold))',
              }} />
          </div>

          {/* Stats */}
          <div className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
            {scanProgress.found > 0 ? `${scanProgress.found} results found so far` : 'Analyzing tickers...'}
          </div>

          {/* Cancel button */}
          <button onClick={() => { cancelRef.current = true; abortRef.current?.abort(); }}
            className="mt-2 px-5 py-2 rounded-lg font-display text-xs font-bold tracking-wider uppercase border transition-all hover:border-[var(--red)]"
            style={{ borderColor: 'var(--border)', color: 'var(--red)' }}>
            ⛔ CANCEL SCAN
          </button>
        </div>
      )}

      {/* DETAIL PANEL */}
      {selectedTicker && <DetailPanel result={selectedTicker} onClose={() => setSelectedTicker(null)} schwabConnected={schwabStatus.connected} activeStrategy={activeTab} />}

      <footer className="text-center py-5 font-mono text-[9px] tracking-wider border-t" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>
        PULSE RADAR · OPTIONS SCREENER v1.0 · {schwabStatus.connected ? 'SCHWAB REAL-TIME' : 'POLYGON.IO 15-MIN DELAYED'} · NOT FINANCIAL ADVICE · FOR EDUCATIONAL USE ONLY
      </footer>
    </div>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--navy2)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--navy3)' }}>
        <div className="font-display text-sm font-bold tracking-wider uppercase">{title}</div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function FilterField({ label, value, onChange, type = 'text', step, disabled }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; step?: string; disabled?: boolean;
}) {
  const [localVal, setLocalVal] = useState(String(value));
  const isFocused = useRef(false);

  // Sync from parent when not focused
  useEffect(() => {
    if (!isFocused.current) setLocalVal(String(value));
  }, [value]);

  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)', opacity: disabled ? 0.4 : 1 }}>{label}</label>
      <input type={type} value={isFocused.current ? localVal : String(value)} step={step} disabled={disabled}
        onFocus={() => { isFocused.current = true; setLocalVal(String(value)); }}
        onChange={e => { setLocalVal(e.target.value); onChange(e.target.value); }}
        onBlur={() => { isFocused.current = false; if (localVal === '' && type === 'number') onChange('0'); }}
        className="px-3 py-2 rounded-md font-mono text-xs border outline-none transition-colors focus:border-[var(--blue3)] disabled:opacity-40"
        style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
    </div>
  );
}

function SelectField({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  options: [string, string][]; disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)', opacity: disabled ? 0.4 : 1 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="px-3 py-2 rounded-md font-mono text-xs border outline-none transition-colors disabled:opacity-40"
        style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text)' }}>
        {options.map(([v, l]: [string, string]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function ResultsTable({ results, onSelect, title }: { results: ScanResult[]; onSelect: (r: ScanResult) => void; title: string }) {
  const [sortCol, setSortCol] = useState('ror');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...results].sort((a: any, b: any) => sortAsc ? a[sortCol] - b[sortCol] : b[sortCol] - a[sortCol]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(false); }
  };

  if (!results.length) {
    return (
      <Panel title={title}>
        <div className="text-center py-14">
          <div className="text-4xl mb-3 opacity-30">📡</div>
          <div className="font-display text-xl font-bold" style={{ color: 'var(--text-dim)' }}>No Results</div>
          <div className="font-mono text-xs mt-2" style={{ color: 'var(--text-dim)' }}>Run a scan from the Screener tab</div>
        </div>
      </Panel>
    );
  }

  const TH = ({ col, label }: { col: string; label: string }) => (
    <th onClick={() => handleSort(col)} className="cursor-pointer select-none font-mono text-[9px] font-medium uppercase tracking-wider px-3 py-2.5 text-left border-b whitespace-nowrap hover:text-[var(--gold)] transition-colors"
      style={{ color: sortCol === col ? 'var(--gold)' : 'var(--text-dim)', borderColor: 'var(--border)' }}>
      {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <Panel title={`${title} (${results.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead><tr style={{ background: 'var(--navy3)' }}>
            <TH col="ticker" label="Ticker" />
            <TH col="price" label="Price" />
            <TH col="change" label="Chg%" />
            <TH col="ivr" label="IV Rank" />
            <TH col="iv" label="IV%" />
            <TH col="ror" label="RoR%" />
            <TH col="rsi" label="RSI" />
            <TH col="optBid" label="Best Bid" />
            {results[0]?.bestPut && <TH col="bestPut.delta" label="Delta" />}
            {results[0]?.bestPut && <th className="font-mono text-[9px] font-medium uppercase tracking-wider px-3 py-2.5 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>DTE</th>}
            <TH col="vol" label="Volume" />
            <th className="font-mono text-[9px] font-medium uppercase tracking-wider px-3 py-2.5 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>Source</th>
          </tr></thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.ticker} onClick={() => onSelect(r)} className="cursor-pointer hover:bg-[rgba(30,79,216,0.07)] transition-colors">
                <td className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>
                  <div className="flex items-center gap-1.5">
                    <div className="font-display text-base font-bold" style={{ color: 'var(--blue3)' }}>{r.ticker}</div>
                    {r.daysToEarnings !== null && r.daysToEarnings !== undefined && r.daysToEarnings >= 0 && r.daysToEarnings <= 14 && (
                      <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${r.daysToEarnings <= 3 ? 'bg-red-500/25 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
                        ⚠ ER ~{r.daysToEarnings}d
                      </span>
                    )}
                  </div>
                  <div className="font-body text-[10px]" style={{ color: 'var(--text-dim)' }}>{r.sector}</div>
                </td>
                <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>${r.price.toFixed(2)}</td>
                <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)', color: r.change >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.change >= 0 ? '+' : ''}{r.change.toFixed(2)}%</td>
                <td className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-mono ${r.ivr >= 60 ? 'bg-green-500/10 text-green-400' : r.ivr >= 35 ? 'bg-amber-500/10 text-amber-400' : 'bg-gray-500/10 text-gray-400'}`}>{r.ivr}%</span>
                </td>
                <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>{r.iv}%</td>
                <td className="px-3 py-2 border-b font-mono text-xs font-semibold" style={{ borderColor: 'rgba(255,255,255,0.035)', color: r.ror >= 3 ? 'var(--green)' : r.ror >= 1.5 ? 'var(--gold)' : 'var(--text-mid)' }}>{r.ror}%</td>
                <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>{r.rsi}</td>
                <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>${r.optBid?.toFixed(2) || '—'}</td>
                {results[0]?.bestPut && <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>{r.bestPut?.delta?.toFixed(2) || '—'}</td>}
                {results[0]?.bestPut && <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>{r.bestPut?.dte || '—'}</td>}
                <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>{r.vol >= 1e6 ? `${(r.vol/1e6).toFixed(1)}M` : `${(r.vol/1e3).toFixed(0)}K`}</td>
                <td className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.035)' }}>
                  <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-mono ${r.source === 'schwab' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'}`}>{r.source === 'schwab' ? 'SCHWAB' : 'POLYGON'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function DetailPanel({ result: r, onClose, schwabConnected, activeStrategy }: { result: ScanResult; onClose: () => void; schwabConnected: boolean; activeStrategy: string }) {
  const Leg = ({ label, strike, bid, ask, delta, type }: { label: string; strike: number; bid?: number; ask?: number; delta?: number; type: 'sell' | 'buy' }) => (
    <div className={`flex justify-between items-center px-4 py-2.5 border-b font-mono text-[11px] ${type === 'sell' ? 'bg-red-500/5' : 'bg-green-500/5'}`} style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
      <span>
        <span className={`font-bold mr-2 ${type === 'sell' ? 'text-red-400' : 'text-green-400'}`}>{type === 'sell' ? 'SELL' : 'BUY'}</span>
        <span style={{ color: 'var(--text)' }}>{label} ${strike}</span>
      </span>
      <span style={{ color: 'var(--text-mid)' }}>
        {bid !== undefined ? `$${bid.toFixed(2)}` : ''}{ask !== undefined ? ` / $${ask.toFixed(2)}` : ''}
        {delta !== undefined ? ` · Δ${delta.toFixed(2)}` : ''}
      </span>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[440px] z-[201] overflow-y-auto border-l" style={{ background: 'var(--navy2)', borderColor: 'var(--border2)' }}>
        <div className="p-5 flex justify-between items-start">
          <div>
            <div className="font-display text-4xl font-bold" style={{ color: 'var(--blue3)' }}>{r.ticker}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{r.sector} · ${r.price.toFixed(2)} · IVR {r.ivr}%</div>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md font-mono text-xs border" style={{ background: 'var(--navy3)', borderColor: 'var(--border)', color: 'var(--text-dim)' }}>✕</button>
        </div>
        <div className="px-5 pb-8 space-y-4">

          {/* ── CSP PLAY ── */}
          {(activeStrategy === 'csp' || activeStrategy === 'results') && r.bestPut && schwabConnected && (
            <>
              <DetailSection title="🔄 CSP / Wheel — Best Play (highest value score)">
                <Leg label={`${r.ticker} Put`} strike={r.bestPut.strike} bid={r.bestPut.bid} ask={r.bestPut.ask} delta={r.bestPut.delta} type="sell" />
                <DetailRow label="Expiration" value={`${r.bestPut.expDate} (${r.bestPut.dte} DTE)`} />
                <DetailRow label="Premium Collected" value={`$${r.bestPut.bid?.toFixed(2)} ($${(r.bestPut.bid * 100).toFixed(0)}/contract)`} color="var(--green)" />
                <DetailRow label="Capital Required" value={`$${(r.bestPut.strike * 100).toLocaleString()}`} />
                <DetailRow label="Return on Risk" value={`${r.ror}%`} color={r.ror >= 3 ? 'var(--green)' : 'var(--gold)'} />
                <DetailRow label="Annualized RoR" value={`${r.bestPut.annualizedRoR || '—'}%`} color="var(--gold)" />
                <DetailRow label="Prob. of Profit" value={`~${r.bestPut.pop || Math.round((1 - Math.abs(r.bestPut.delta)) * 100)}%`} />
                <DetailRow label="Value Score" value={`${r.bestPut.valueScore || '—'}`} color="var(--blue3)" />
                <DetailRow label="Manage At" value="21 DTE or 50% profit" />
              </DetailSection>
              {r.cspByDTE && r.cspByDTE.length > 1 && (
                <DetailSection title="📊 Delta Range Comparison — Best Candidates Across DTE & Delta">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr style={{ background: 'var(--navy3)' }}>
                          <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>DTE</th>
                          <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>Strike</th>
                          <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>Bid</th>
                          <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>Delta</th>
                          <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>POP</th>
                          <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>RoR%</th>
                          <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2 text-left border-b" style={{ color: 'var(--gold)', borderColor: 'var(--border)' }}>Annual%</th>
                          <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2 text-left border-b" style={{ color: 'var(--blue3)', borderColor: 'var(--border)' }}>Score</th>
                          <th className="font-mono text-[9px] uppercase tracking-wider px-3 py-2 text-left border-b" style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>$/Contract</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.cspByDTE.sort((a: any, b: any) => (b.valueScore || 0) - (a.valueScore || 0)).map((c: any, idx: number) => {
                          const isBest = idx === 0;
                          return (
                            <tr key={`${c.label}-${c.strike}-${c.delta}`} className={isBest ? 'bg-green-500/5' : ''}>
                              <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.04)', color: 'var(--text)' }}>
                                {c.label} {isBest && <span style={{ color: 'var(--green)', fontSize: 8, fontWeight: 800 }}>★ BEST</span>}
                              </td>
                              <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.04)', color: 'var(--text)' }}>${c.strike}</td>
                              <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.04)', color: 'var(--green)' }}>${c.bid?.toFixed(2)}</td>
                              <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.04)', color: 'var(--text-mid)' }}>{c.delta?.toFixed(2)}</td>
                              <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.04)', color: 'var(--text-mid)' }}>{c.pop || Math.round((1 - Math.abs(c.delta)) * 100)}%</td>
                              <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.04)', color: 'var(--text)' }}>{c.ror}%</td>
                              <td className="px-3 py-2 border-b font-mono text-xs font-medium" style={{ borderColor: 'rgba(255,255,255,0.04)', color: 'var(--gold)' }}>{c.annualizedRoR}%</td>
                              <td className="px-3 py-2 border-b font-mono text-xs font-medium" style={{ borderColor: 'rgba(255,255,255,0.04)', color: 'var(--blue3)' }}>{c.valueScore || '—'}</td>
                              <td className="px-3 py-2 border-b font-mono text-xs" style={{ borderColor: 'rgba(255,255,255,0.04)', color: 'var(--text-dim)' }}>${c.premium100}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-3 py-2 font-mono text-[9px]" style={{ color: 'var(--text-dim)' }}>
                    Value Score = Annualized RoR × Safety Multiplier (lower delta = higher score). Sorted best to worst.
                  </div>
                </DetailSection>
              )}
            </>
          )}

          {/* ── CREDIT SPREAD PLAY ── */}
          {(activeStrategy === 'credit') && r.creditSpread && schwabConnected && (
            <DetailSection title="📉 Bull Put Credit Spread">
              <Leg label={`${r.ticker} Put`} strike={r.creditSpread.shortLeg.strike} bid={r.creditSpread.shortLeg.bid} ask={r.creditSpread.shortLeg.ask} delta={r.creditSpread.shortLeg.delta} type="sell" />
              <Leg label={`${r.ticker} Put`} strike={r.creditSpread.longLeg.strike} bid={r.creditSpread.longLeg.bid} ask={r.creditSpread.longLeg.ask} delta={r.creditSpread.longLeg.delta} type="buy" />
              <DetailRow label="Expiration" value={`${r.creditSpread.shortLeg.expDate} (${r.creditSpread.shortLeg.dte} DTE)`} />
              <DetailRow label="Net Credit" value={`$${r.creditSpread.netCredit.toFixed(2)} ($${(r.creditSpread.netCredit * 100).toFixed(0)}/contract)`} color="var(--green)" />
              <DetailRow label="Max Loss" value={`$${r.creditSpread.maxLoss.toFixed(2)} ($${(r.creditSpread.maxLoss * 100).toFixed(0)}/contract)`} color="var(--red)" />
              <DetailRow label="Width" value={`$${r.creditSpread.width}`} />
              <DetailRow label="Return on Risk" value={`${r.creditSpread.rorSpread}%`} color={r.creditSpread.rorSpread >= 30 ? 'var(--green)' : 'var(--gold)'} />
              <DetailRow label="Prob. of Profit" value={`~${r.creditSpread.pop}%`} />
              <DetailRow label="Manage At" value="50% of credit or 21 DTE" />
            </DetailSection>
          )}
          {(activeStrategy === 'credit') && r.bearCallSpread && schwabConnected && (
            <DetailSection title="📉 Bear Call Credit Spread">
              <Leg label={`${r.ticker} Call`} strike={r.bearCallSpread.shortLeg.strike} bid={r.bearCallSpread.shortLeg.bid} ask={r.bearCallSpread.shortLeg.ask} delta={r.bearCallSpread.shortLeg.delta} type="sell" />
              <Leg label={`${r.ticker} Call`} strike={r.bearCallSpread.longLeg.strike} bid={r.bearCallSpread.longLeg.bid} ask={r.bearCallSpread.longLeg.ask} delta={r.bearCallSpread.longLeg.delta} type="buy" />
              <DetailRow label="Net Credit" value={`$${r.bearCallSpread.netCredit.toFixed(2)} ($${(r.bearCallSpread.netCredit * 100).toFixed(0)}/contract)`} color="var(--green)" />
              <DetailRow label="Max Loss" value={`$${r.bearCallSpread.maxLoss.toFixed(2)}`} color="var(--red)" />
              <DetailRow label="Return on Risk" value={`${r.bearCallSpread.rorSpread}%`} color={r.bearCallSpread.rorSpread >= 30 ? 'var(--green)' : 'var(--gold)'} />
            </DetailSection>
          )}

          {/* ── IRON CONDOR PLAY ── */}
          {(activeStrategy === 'ic') && r.ironCondor && schwabConnected && (
            <DetailSection title="🦅 Iron Condor Play">
              <div className="px-4 py-2 font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-dim)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>Put Spread (downside)</div>
              <Leg label={`${r.ticker} Put`} strike={r.ironCondor.putSpread.shortLeg.strike} bid={r.ironCondor.putSpread.shortLeg.bid} delta={r.ironCondor.putSpread.shortLeg.delta} type="sell" />
              <Leg label={`${r.ticker} Put`} strike={r.ironCondor.putSpread.longLeg.strike} bid={r.ironCondor.putSpread.longLeg.bid} delta={r.ironCondor.putSpread.longLeg.delta} type="buy" />
              <div className="px-4 py-2 font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-dim)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>Call Spread (upside)</div>
              <Leg label={`${r.ticker} Call`} strike={r.ironCondor.callSpread.shortLeg.strike} bid={r.ironCondor.callSpread.shortLeg.bid} delta={r.ironCondor.callSpread.shortLeg.delta} type="sell" />
              <Leg label={`${r.ticker} Call`} strike={r.ironCondor.callSpread.longLeg.strike} bid={r.ironCondor.callSpread.longLeg.bid} delta={r.ironCondor.callSpread.longLeg.delta} type="buy" />
              <DetailRow label="Expiration" value={`${r.ironCondor.expDate} (${r.ironCondor.dte} DTE)`} />
              <DetailRow label="Total Credit" value={`$${r.ironCondor.totalCredit.toFixed(2)} ($${(r.ironCondor.totalCredit * 100).toFixed(0)}/contract)`} color="var(--green)" />
              <DetailRow label="Max Loss" value={`$${r.ironCondor.maxLoss.toFixed(2)} ($${(r.ironCondor.maxLoss * 100).toFixed(0)}/contract)`} color="var(--red)" />
              <DetailRow label="Breakeven Range" value={`$${r.ironCondor.breakEvenLow.toFixed(2)} — $${r.ironCondor.breakEvenHigh.toFixed(2)}`} color="var(--blue3)" />
              <DetailRow label="Return on Risk" value={`${r.ironCondor.rorIC}%`} color={r.ironCondor.rorIC >= 25 ? 'var(--green)' : 'var(--gold)'} />
              <DetailRow label="Profit Target" value="50% of total credit" />
              <DetailRow label="Manage At" value="21 DTE or if tested" />
            </DetailSection>
          )}

          {/* ── PMCC PLAY ── */}
          {(activeStrategy === 'pmcc') && r.pmcc && schwabConnected && (
            <DetailSection title="📈 PMCC Play">
              <Leg label={`${r.ticker} Call LEAP`} strike={r.pmcc.leapLeg.strike} bid={r.pmcc.leapLeg.bid} ask={r.pmcc.leapLeg.ask} delta={r.pmcc.leapLeg.delta} type="buy" />
              <Leg label={`${r.ticker} Call`} strike={r.pmcc.shortLeg.strike} bid={r.pmcc.shortLeg.bid} ask={r.pmcc.shortLeg.ask} delta={r.pmcc.shortLeg.delta} type="sell" />
              <DetailRow label="LEAP Expiration" value={`${r.pmcc.leapLeg.expDate} (${r.pmcc.leapLeg.dte} DTE)`} />
              <DetailRow label="Short Expiration" value={`${r.pmcc.shortLeg.expDate} (${r.pmcc.shortLeg.dte} DTE)`} />
              <DetailRow label="LEAP Cost" value={`$${r.pmcc.leapCost.toFixed(2)} ($${r.pmcc.capitalRequired.toLocaleString()}/contract)`} color="var(--red)" />
              <DetailRow label="Monthly Income" value={`$${r.pmcc.shortCredit.toFixed(2)} ($${(r.pmcc.monthlyIncome * 100).toFixed(0)}/contract)`} color="var(--green)" />
              <DetailRow label="Net Debit" value={`$${r.pmcc.netDebit.toFixed(2)}`} />
              <DetailRow label="Breakeven" value={`$${r.pmcc.breakEven.toFixed(2)}`} />
              <DetailRow label="Strategy" value="Roll short call monthly for income" />
            </DetailSection>
          )}

          {/* ── DIAGONAL PLAY ── */}
          {(activeStrategy === 'diag') && r.diagonal && schwabConnected && (
            <DetailSection title="↗ Diagonal Spread Play">
              <Leg label={`${r.ticker} Call (back)`} strike={r.diagonal.backLeg.strike} bid={r.diagonal.backLeg.bid} ask={r.diagonal.backLeg.ask} delta={r.diagonal.backLeg.delta} type="buy" />
              <Leg label={`${r.ticker} Call (front)`} strike={r.diagonal.frontLeg.strike} bid={r.diagonal.frontLeg.bid} ask={r.diagonal.frontLeg.ask} delta={r.diagonal.frontLeg.delta} type="sell" />
              <DetailRow label="Back Month" value={`${r.diagonal.backLeg.expDate} (${r.diagonal.backLeg.dte} DTE)`} />
              <DetailRow label="Front Month" value={`${r.diagonal.frontLeg.expDate} (${r.diagonal.frontLeg.dte} DTE)`} />
              <DetailRow label="Net Debit" value={`$${r.diagonal.netDebit.toFixed(2)} ($${r.diagonal.capitalRequired}/contract)`} color="var(--red)" />
              <DetailRow label="Max Profit" value={`$${r.diagonal.maxProfit.toFixed(2)}`} color="var(--green)" />
              <DetailRow label="Manage At" value="50% profit or 21 DTE on front leg" />
            </DetailSection>
          )}

          {/* ── CALENDAR PRESS PLAY ── */}
          {(activeStrategy === 'calPress') && r.calendarPress && schwabConnected && (
            <DetailSection title="📅 Calendar Press Play">
              <Leg label={`${r.ticker} Put (weekly)`} strike={r.calendarPress.shortLeg.strike} bid={r.calendarPress.shortLeg.bid} ask={r.calendarPress.shortLeg.ask} delta={r.calendarPress.shortLeg.delta} type="sell" />
              <Leg label={`${r.ticker} Put (collateral)`} strike={r.calendarPress.longLeg.strike} bid={r.calendarPress.longLeg.bid} ask={r.calendarPress.longLeg.ask} delta={r.calendarPress.longLeg.delta} type="buy" />
              <DetailRow label="Short Put Exp" value={`${r.calendarPress.shortLeg.expDate} (${r.calendarPress.shortLeg.dte} DTE)`} />
              <DetailRow label="Long Put Exp" value={`${r.calendarPress.longLeg.expDate} (${r.calendarPress.longLeg.dte} DTE)`} />
              <DetailRow label="Spread Width" value={`$${r.calendarPress.spreadWidth} ($${r.calendarPress.shortLeg.strike} – $${r.calendarPress.longLeg.strike})`} />
              <DetailRow label="Capital Required" value={`$${r.calendarPress.capitalRequired.toLocaleString()} (width × 100)`} color="var(--blue3)" />
              <DetailRow label="Long Put Cost" value={`$${r.calendarPress.longCost.toFixed(2)} ($${(r.calendarPress.longCost * 100).toFixed(0)}/contract)`} color="var(--red)" />
              <DetailRow label="Weekly Credit" value={`$${r.calendarPress.weeklyCredit.toFixed(2)} ($${(r.calendarPress.weeklyCredit * 100).toFixed(0)}/contract)`} color="var(--green)" />
              <DetailRow label="Cost Ratio" value={`${r.calendarPress.costRatio}x (${r.calendarPress.weeksToBreakeven} weeks to pay off long put)`} color={r.calendarPress.costRatio <= 2.5 ? 'var(--green)' : r.calendarPress.costRatio <= 3 ? 'var(--gold)' : 'var(--text-mid)'} />
              <DetailRow label="Weekly ROI on Long" value={`${r.calendarPress.weeklyROI}% of long put cost per week`} />
              <DetailRow label="Weekly ROC" value={`${r.calendarPress.weeklyROC}% return on capital per week`} color={r.calendarPress.weeklyROC >= 5 ? 'var(--green)' : 'var(--gold)'} />
              <DetailRow label="Bearish Exit" value={`Stop selling weeklies, hold long $${r.calendarPress.longLeg.strike}P — gains value as stock falls`} />
              <DetailRow label="Management" value="Sell new weekly put each cycle near support. If support breaks, stop selling and hold long put." />
            </DetailSection>
          )}

          {/* ── MARKET DATA (always shown) ── */}
          <DetailSection title="Market Data">
            <DetailRow label="Price" value={`$${r.price.toFixed(2)}`} />
            <DetailRow label="Daily Change" value={`${r.change >= 0 ? '+' : ''}${r.change.toFixed(2)}%`} color={r.change >= 0 ? 'var(--green)' : 'var(--red)'} />
            <DetailRow label="Volume" value={r.vol >= 1e6 ? `${(r.vol/1e6).toFixed(2)}M` : `${(r.vol/1e3).toFixed(0)}K`} />
            <DetailRow label="Sector" value={r.sector} />
            {r.mktCap > 0 && <DetailRow label="Market Cap" value={`$${(r.mktCap/1e9).toFixed(1)}B`} />}
            {r.nextEarningsEst && <DetailRow label="Est. Next Earnings" value={`~${r.nextEarningsEst}${r.daysToEarnings != null ? ` (${r.daysToEarnings}d)` : ''}`} color={r.daysToEarnings != null && r.daysToEarnings <= 7 ? 'var(--red)' : r.daysToEarnings != null && r.daysToEarnings <= 14 ? 'var(--gold)' : 'var(--text-mid)'} />}
          </DetailSection>
          <DetailSection title="Technicals">
            <DetailRow label="RSI (14)" value={`${r.rsi}`} color={r.rsi > 70 ? 'var(--red)' : r.rsi < 30 ? 'var(--gold)' : 'var(--green)'} />
            <DetailRow label="ATR%" value={`${r.atrPct}%`} />
            {r.ema20 && <DetailRow label="20 EMA" value={`$${r.ema20.toFixed(2)} ${r.price > r.ema20 ? '▲ Above' : '▼ Below'}`} color={r.price > r.ema20 ? 'var(--green)' : 'var(--red)'} />}
            {r.ema50 && <DetailRow label="50 EMA" value={`$${r.ema50.toFixed(2)} ${r.price > r.ema50 ? '▲ Above' : '▼ Below'}`} color={r.price > r.ema50 ? 'var(--green)' : 'var(--red)'} />}
            {r.ema200 && <DetailRow label="200 EMA" value={`$${r.ema200.toFixed(2)} ${r.price > r.ema200 ? '▲ Above' : '▼ Below'}`} color={r.price > r.ema200 ? 'var(--green)' : 'var(--red)'} />}
          </DetailSection>
          <DetailSection title="Options Data">
            <DetailRow label="IV / IVR" value={`${r.iv}% / ${r.ivr}%`} />
            <DetailRow label="Max Open Interest" value={r.maxOI.toLocaleString()} />
            {r.putCallRatio !== undefined && r.putCallRatio > 0 && <DetailRow label="Put/Call OI Ratio" value={`${r.putCallRatio}×`} />}
            {r.bidAskSpreadPct !== undefined && r.bidAskSpreadPct > 0 && <DetailRow label="Bid-Ask Spread" value={`${r.bidAskSpreadPct}%`} color={r.bidAskSpreadPct <= 5 ? 'var(--green)' : r.bidAskSpreadPct <= 10 ? 'var(--gold)' : 'var(--red)'} />}
          </DetailSection>
        </div>
      </div>
    </>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ background: 'var(--navy3)', borderColor: 'var(--border)' }}>
      <div className="px-4 py-2.5 border-b font-display text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--gold)', borderColor: 'var(--border)', background: 'rgba(240,180,41,0.05)' }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center px-4 py-2 border-b font-mono text-[11px]" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span className="font-medium" style={{ color: color || 'var(--text)' }}>{value}</span>
    </div>
  );
}
