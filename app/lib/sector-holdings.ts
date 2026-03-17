// Unified sector ETF holdings — liquid, optionable tickers per sector
// Criteria: sufficient daily options volume for tight bid/ask spreads and reliable Greeks
// Used by: Equity Scanner (sector filter), Sector Explorer (drilldown), Sector API
// Last updated: March 2026

export interface SectorDef {
  etf: string;
  label: string;
  color: string;
  tickers: string[];
}

export const SECTORS: SectorDef[] = [
  {
    etf: 'XLK', label: 'Technology', color: '#3b82f6',
    // Removed: ZBRA, EPAM, AKAM (low options volume)
    tickers: [
      'AAPL','MSFT','NVDA','AVGO','ORCL','CRM','ADBE','AMD','INTC','CSCO',
      'INTU','QCOM','TXN','AMAT','MU','NOW','LRCX','ADI','KLAC','SNPS',
      'CDNS','MRVL','NXPI','ON','SMCI','ARM','CRWD','PANW','FTNT','ZS',
      'NET','DDOG','MDB','SNOW','PLTR','DELL','HPE','HPQ','KEYS',
    ],
  },
  {
    etf: 'XLF', label: 'Financials', color: '#10b981',
    // Removed: HBAN, RF, CFG, KEY (regional banks, low options vol)
    // Added: PYPL, SQ, MSTR, AFRM (high-volume fintech/crypto)
    tickers: [
      'BRK.B','JPM','V','MA','BAC','WFC','GS','MS','SPGI','BLK',
      'AXP','C','SCHW','CB','MMC','PGR','ICE','CME','AON','MET',
      'TRV','AIG','ALL','COIN','HOOD','SOFI','AFL','PRU','HIG','FI',
      'FIS','GPN','NDAQ','MSCI','RJF','PYPL','SQ','MSTR','AFRM',
    ],
  },
  {
    etf: 'XLV', label: 'Healthcare', color: '#ec4899',
    // Removed: HOLX, MTD, WST, A, IQV (thin options markets)
    tickers: [
      'UNH','LLY','JNJ','ABBV','MRK','TMO','ABT','DHR','AMGN','PFE',
      'ISRG','GILD','VRTX','REGN','BSX','MDT','SYK','CI','ELV','BDX',
      'ZTS','DXCM','IDXX','ILMN','EW','ALGN','MRNA','BNTX','BIIB',
      'BAX','GEHC','RMD','MOH','CNC','HCA',
    ],
  },
  {
    etf: 'XLY', label: 'Consumer Disc.', color: '#8b5cf6',
    // Removed: POOL, GPC, KMX (niche retail, low options vol)
    // Added: SHOP, CVNA (high-volume e-commerce/auto)
    tickers: [
      'AMZN','TSLA','HD','MCD','NKE','LOW','SBUX','TJX','BKNG','CMG',
      'ORLY','ROST','DHI','LEN','GM','F','LULU','DRI','YUM','ABNB',
      'DASH','UBER','LYFT','RIVN','LCID','NIO','XPEV','ETSY','W',
      'DECK','BBY','AZO','ULTA','RCL','CCL','NCLH','WYNN','DKNG',
      'SHOP','CVNA',
    ],
  },
  {
    etf: 'XLP', label: 'Consumer Staples', color: '#06b6d4',
    // Removed: SJM, CHD, MKC, CASY, USFD, SFM (low options volume)
    tickers: [
      'PG','KO','PEP','COST','WMT','PM','MDLZ','MO','CL','KMB',
      'GIS','KHC','STZ','HSY','TSN','CAG','K','TGT','DG','DLTR',
      'EL','CLX','MNST','TAP','BG','ADM',
    ],
  },
  {
    etf: 'XLE', label: 'Energy', color: '#f59e0b',
    // Removed: DEN, MGY, MTDR, SM, CHRD, PR, RRC (small-cap E&P, thin options)
    tickers: [
      'XOM','CVX','COP','SLB','EOG','MPC','PSX','VLO','OXY','WMB',
      'KMI','HAL','HES','DVN','FANG','BKR','CTRA','MRO','APA','AR',
      'EQT','TRGP','OVV',
    ],
  },
  {
    etf: 'XLI', label: 'Industrials', color: '#64748b',
    // Removed: SWK, ROK, XYL, HWM (niche industrial, low options vol)
    // Added: ENPH (solar, high options volume)
    tickers: [
      'CAT','GE','RTX','HON','UNP','BA','DE','LMT','UPS','ADP',
      'ETN','ITW','NOC','WM','GD','CSX','MMM','FDX','NSC','EMR',
      'CARR','TT','PCAR','CMI','JCI','DAL','UAL','LUV','AAL',
      'FAST','ODFL','CTAS','PAYX','CPRT','AXON','TDG','ENPH',
    ],
  },
  {
    etf: 'XLB', label: 'Materials', color: '#a855f7',
    // Removed: IFF, CE, EMN, FMC, PKG (specialty chemicals, low options vol)
    // Added: CLF (high options volume steel)
    tickers: [
      'LIN','APD','SHW','ECL','NEM','FCX','NUE','VMC','MLM','DOW',
      'DD','PPG','CF','ALB','BALL','STLD','RS','CLF','AA','MP',
      'RGLD','WPM','GOLD',
    ],
  },
  {
    etf: 'XLRE', label: 'Real Estate', color: '#14b8a6',
    // Removed: UDR, KIM, REG, HST, CPT, LSI (small REITs, thin options)
    tickers: [
      'PLD','AMT','EQIX','CCI','SPG','PSA','O','WELL','DLR','VICI',
      'AVB','EQR','WY','ARE','MAA','IRM','SUI','INVH','CUBE','EXR',
    ],
  },
  {
    etf: 'XLU', label: 'Utilities', color: '#eab308',
    // Removed: OGE, PNW, LNT, NI (small utilities, low options vol)
    tickers: [
      'NEE','SO','DUK','CEG','SRE','AEP','D','EXC','PEG','ED',
      'XEL','WEC','ES','AWK','ETR','FE','AEE','CMS','PPL','EVRG',
      'NRG','VST','AES',
    ],
  },
  {
    etf: 'XLC', label: 'Communication', color: '#ef4444',
    // Removed: IMAX, SIRI (very low options volume)
    tickers: [
      'META','GOOGL','GOOG','NFLX','DIS','CMCSA','TMUS','T','VZ',
      'EA','TTWO','CHTR','OMC','IPG','FOXA','FOX','WBD','MTCH',
      'LYV','PINS','SNAP','RBLX','ROKU','TTD','ZG','PARA',
    ],
  },
];

export function getSectorByETF(etf: string): SectorDef | undefined {
  return SECTORS.find(s => s.etf === etf);
}

export function getSectorByTicker(ticker: string): SectorDef | undefined {
  return SECTORS.find(s => s.tickers.includes(ticker));
}
