// ─── UNIFIED TICKER UNIVERSES ───────────────────────────────────────────────
// Single source of truth for all ticker universes used across:
//   - Options Screener (app/modules/screener/ScreenerModule.tsx)
//   - Stock Screener (app/modules/screener/DiscoveryModule.tsx)
//   - Server scan route (app/api/scan/route.ts)
//   - Server user scan route (app/api/scan/user/route.ts)
//
// To add/edit/remove tickers, modify ONLY this file.

export type UniverseDefinition = {
  label: string;
  desc: string;
  tickers: string[];
  primary?: boolean;
};

export const UNIVERSES: Record<string, UniverseDefinition> = {
  core: {
    label: '⚡ Pulse Core',
    primary: true,
    desc: 'Curated premium-selling universe — mega-liquid + high IV + blue chips + sector ETFs',
    tickers: [
      'SPY','QQQ','IWM','AAPL','TSLA','NVDA','AMD','META','AMZN','GOOGL',
      'MSFT','NFLX','COIN','MSTR','MARA','RIOT','SOFI','HOOD','RIVN','SHOP',
      'SQ','PLTR','ROKU','DKNG','SNAP','UBER','ABNB','JPM','BAC','GS',
      'DIS','HD','WMT','COST','KO','PEP','JNJ','PG','XOM','CVX',
      'BA','CAT','DE','AVGO','CRM','ABBV','XLE','XLF','XLK','XLV',
      'GLD','SLV','TLT','EEM','SMH','ARKK',
    ],
  },
  megaCap: {
    label: '🏛 Mega Cap',
    desc: 'Top 30 by market cap — most liquid options in the market',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','LLY','JPM',
      'V','UNH','XOM','MA','JNJ','PG','COST','HD','MRK','ABBV',
      'CRM','AMD','CVX','BAC','NFLX','KO','PEP','TMO','WMT','ORCL',
    ],
  },
  sp500: {
    label: '📈 S&P 500',
    desc: 'Top ~160 most optionable S&P 500 names across all sectors',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','LLY','JPM',
      'V','UNH','XOM','MA','JNJ','PG','COST','HD','MRK','ABBV',
      'CRM','AMD','CVX','BAC','NFLX','KO','PEP','TMO','WMT','ACN',
      'LIN','MCD','ABT','CSCO','TXN','DHR','NEE','NKE','PM','MS',
      'AMGN','RTX','SCHW','ISRG','GS','SPGI','LOW','BKNG','INTU','GE',
      'DE','CAT','AMAT','REGN','BMY','SYK','VRTX','ADI','GILD','C',
      'AXP','MDLZ','PLD','MO','ETN','BSX','BLK','CB','LRCX','ZTS',
      'AMT','SO','DUK','COP','CI','SHW','MMC','TGT','WM','FCX',
      'HON','MMM','ITW','EMR','PH','GD','NOC','LMT','OXY','PSX',
      'VLO','MPC','SLB','HAL','BKR','WFC','USB','PNC','AIG','PRU',
      'MET','AFL','ALL','PGR','TRV','ORCL','ADBE','NOW','PYPL','INTC',
      'QCOM','MU','KLAC','SNPS','CDNS','MRVL','ON','NXPI','CMG','SBUX',
      'YUM','DPZ','ORLY','AZO','ROST','TJX','LULU','UPS','FDX','DAL',
      'UAL','AAL','LUV','ABNB','MAR','HLT','PFE','MRNA','BIIB','ILMN','DXCM',
      'ZBH','EW','MDT','BDX','AEP','D','SRE','EXC','XEL','ED',
      'WEC','ES','AEE','PSA','O','WELL','EQR','AVB','SPG','DLR',
      'CCI','EQIX',
    ],
  },
  ndx100: {
    label: '💻 Nasdaq 100',
    desc: 'Nasdaq 100 index — heavy tech/growth, typically higher IV',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','AVGO','COST','NFLX',
      'AMD','INTU','QCOM','TXN','AMAT','MU','LRCX','SNPS','CDNS','ADI',
      'MRVL','KLAC','ASML','INTC','ORCL','CRM','ADBE','NOW','WDAY','ZS',
      'CRWD','PANW','FTNT','NET','DDOG','MDB','SNOW','OKTA','TEAM','HUBS',
      'SHOP','PYPL','SQ','COIN','MSTR','RBLX','SNAP','PINS','UBER','LYFT',
      'ABNB','BKNG','DIS','CMCSA','TMUS','T','VZ','EA','TTWO','PEP',
      'KO','SBUX','CMG','LULU','ROST','MNST','AZN','AMGN','GILD','REGN',
      'VRTX','BIIB','MRNA','ISRG','DXCM','ILMN','IDXX','ON','NXPI','ARM',
      'SMCI','DASH','CPRT','CTAS','ODFL','PAYX','FAST','CSX','HON','PDD',
      'JD','BIDU',
    ],
  },
  dow30: {
    label: '🏦 Dow 30',
    desc: 'Dow Jones Industrial Average — 30 blue chips, lower IV, great for Wheel/CSP',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','JPM','V','UNH','HD','PG','JNJ',
      'MRK','CVX','KO','DIS','MCD','WMT','IBM','GS','CAT','BA',
      'AXP','MMM','TRV','HON','AMGN','CSCO','NKE','DOW','CRM','INTC',
    ],
  },
  highIV: {
    label: '🔥 High IV',
    desc: 'Consistently elevated IV — meme stocks, crypto-adjacent, biotech, leveraged ETFs',
    tickers: [
      'TSLA','NVDA','AMD','COIN','MSTR','MARA','RIOT','SOFI','HOOD','RIVN',
      'SHOP','SQ','PLTR','ROKU','DKNG','SNAP','RBLX','U','NET','CRWD',
      'SNOW','OKTA','MDB','PANW','ZS','DDOG','BILL','HUBS','UPST','AFRM',
      'LCID','NIO','XPEV','SMCI','ARM','IONQ','GME','AMC','MRNA','BNTX',
      'ENPH','SEDG','ARKK','TQQQ','SQQQ','UVXY','SOXL','SOXS',
    ],
  },
  etf: {
    label: '📊 ETFs',
    desc: 'Broad market, sector, commodity, and leveraged ETFs',
    tickers: [
      'SPY','QQQ','IWM','DIA','RSP','MDY','GLD','SLV','TLT','IEF',
      'HYG','LQD','EEM','EFA','VWO','FXI','EWJ','EWZ','XLE','XLF',
      'XLK','XLV','XLI','XLP','XLU','XLB','XLY','XLRE','XLC','XBI',
      'IBB','ARKK','ARKG','ARKW','SOXX','SMH','HACK','KWEB','BITO','GDX',
      'GDXJ','USO','UNG','UVXY','TQQQ','SQQQ','SPXU','UPRO','TNA','TZA',
      'SOXL','SOXS',
    ],
  },
  fullMarket: {
    label: '🌐 Full Market',
    desc: '~280 most liquid US equities across all sectors — best for equity pattern scanning',
    tickers: [
      // Indices
      'SPY','QQQ','IWM','DIA',
      // Technology
      'AAPL','MSFT','NVDA','AVGO','ORCL','CRM','ADBE','AMD','INTC','CSCO',
      'INTU','QCOM','TXN','AMAT','MU','NOW','LRCX','ADI','KLAC','SNPS',
      'CDNS','MRVL','NXPI','ON','SMCI','ARM','CRWD','PANW','FTNT','ZS',
      'NET','DDOG','MDB','SNOW','PLTR','DELL','SHOP','PYPL','SQ',
      // Financials
      'JPM','V','MA','BAC','WFC','GS','MS','SPGI','BLK','AXP',
      'C','SCHW','CB','MMC','PGR','ICE','CME','AON','MET','COIN',
      'HOOD','SOFI','AFL','PRU','TRV','AIG',
      // Healthcare
      'UNH','LLY','JNJ','ABBV','MRK','TMO','ABT','DHR','AMGN','PFE',
      'ISRG','GILD','VRTX','REGN','BSX','MDT','SYK','CI','ELV','BDX',
      'ZTS','DXCM','IDXX','MRNA','BIIB','HCA',
      // Consumer Discretionary
      'AMZN','TSLA','HD','MCD','NKE','LOW','SBUX','TJX','BKNG','CMG',
      'ORLY','ROST','DHI','LEN','GM','F','LULU','DRI','YUM','ABNB',
      'DASH','UBER','LYFT','RIVN','NIO','ETSY','BBY','AZO','ULTA','RCL',
      'CCL','WYNN',
      // Consumer Staples
      'PG','KO','PEP','COST','WMT','PM','MDLZ','MO','CL','KMB',
      'GIS','KHC','STZ','HSY','TSN','MNST','TGT','DG','DLTR','EL',
      // Energy
      'XOM','CVX','COP','SLB','EOG','MPC','PSX','VLO','OXY','WMB',
      'KMI','HAL','DVN','FANG','BKR','CTRA','MRO','APA','EQT','AR',
      // Industrials
      'CAT','GE','RTX','HON','UNP','BA','DE','LMT','UPS','ADP',
      'ETN','ITW','NOC','WM','GD','CSX','FDX','NSC','EMR','DAL',
      'UAL','LUV','AAL','FAST','ODFL','CTAS','AXON','TDG',
      // Materials
      'LIN','APD','SHW','ECL','NEM','FCX','NUE','VMC','MLM','DOW',
      'DD','PPG','CF','ALB','STLD','CLF','AA','GOLD',
      // Real Estate
      'PLD','AMT','EQIX','CCI','SPG','PSA','O','WELL','DLR','VICI',
      // Utilities
      'NEE','SO','DUK','CEG','SRE','AEP','D','EXC','VST','NRG',
      // Communication
      'META','GOOGL','NFLX','DIS','CMCSA','TMUS','T','VZ','EA','TTWO',
      'PINS','SNAP','RBLX','ROKU','TTD',
      // High IV / Meme / Crypto-adjacent
      'MSTR','MARA','RIOT','DKNG','GME','AMC','UPST','AFRM','LCID','XPEV',
      'IONQ','U','ENPH','SEDG',
      // Sector ETFs
      'XLE','XLF','XLK','XLV','XLI','XLP','XLU','XLB','XLY','XLRE','XLC',
      // Other popular ETFs
      'GLD','SLV','TLT','SMH','ARKK','SOXX','XBI','GDX','BITO',
    ],
  },
};

// Derived: flat ticker arrays keyed by universe id — used by server routes
export const UNIVERSE_TICKERS: Record<string, string[]> = Object.fromEntries(
  Object.entries(UNIVERSES).map(([key, u]) => [key, u.tickers])
);

// Derived: summary list for Stock Screener dropdown — counts auto-computed from real tickers
export const UNIVERSE_SUMMARIES: { id: string; name: string; count: number }[] =
  Object.entries(UNIVERSES).map(([id, u]) => ({
    id,
    name: u.label,
    count: u.tickers.length,
  }));
