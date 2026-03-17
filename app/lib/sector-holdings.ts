// Unified sector ETF holdings — full liquid tickers per sector
// Used by: Equity Scanner (sector filter), Sector Explorer (drilldown), Sector API
// Source: SPDR sector ETF holdings, sorted by weight + trading activity + options liquidity

export interface SectorDef {
  etf: string;
  label: string;
  color: string;
  tickers: string[];
}

export const SECTORS: SectorDef[] = [
  {
    etf: 'XLK', label: 'Technology', color: '#3b82f6',
    tickers: ['AAPL','MSFT','NVDA','AVGO','ORCL','CRM','ADBE','AMD','INTC','CSCO','INTU','QCOM','TXN','AMAT','MU','NOW','LRCX','ADI','KLAC','SNPS','CDNS','MRVL','NXPI','ON','SMCI','ARM','CRWD','PANW','FTNT','ZS','NET','DDOG','MDB','SNOW','PLTR','DELL','HPE','HPQ','KEYS','ZBRA','EPAM','AKAM'],
  },
  {
    etf: 'XLF', label: 'Financials', color: '#10b981',
    tickers: ['BRK.B','JPM','V','MA','BAC','WFC','GS','MS','SPGI','BLK','AXP','C','SCHW','CB','MMC','PGR','ICE','CME','AON','MET','TRV','AIG','ALL','COIN','HOOD','SOFI','AFL','PRU','HIG','FI','FIS','GPN','NDAQ','MSCI','RJF','CFG','KEY','FITB','HBAN','RF'],
  },
  {
    etf: 'XLV', label: 'Healthcare', color: '#ec4899',
    tickers: ['UNH','LLY','JNJ','ABBV','MRK','TMO','ABT','DHR','AMGN','PFE','ISRG','GILD','VRTX','REGN','BSX','MDT','SYK','CI','ELV','BDX','ZTS','DXCM','IDXX','ILMN','A','IQV','EW','HOLX','MTD','WST','ALGN','MRNA','BNTX','BIIB','BAX','GEHC','RMD','MOH','CNC','HCA'],
  },
  {
    etf: 'XLY', label: 'Consumer Disc.', color: '#8b5cf6',
    tickers: ['AMZN','TSLA','HD','MCD','NKE','LOW','SBUX','TJX','BKNG','CMG','ORLY','ROST','DHI','LEN','GM','F','LULU','DRI','YUM','ABNB','DASH','UBER','LYFT','RIVN','LCID','NIO','XPEV','ETSY','W','DECK','POOL','BBY','KMX','GPC','AZO','ULTA','RCL','CCL','NCLH','WYNN'],
  },
  {
    etf: 'XLP', label: 'Consumer Staples', color: '#06b6d4',
    tickers: ['PG','KO','PEP','COST','WMT','PM','MDLZ','MO','CL','KMB','GIS','KHC','STZ','SJM','HSY','TSN','CAG','K','CHD','MKC','TGT','DG','DLTR','EL','CLX','MNST','TAP','BG','ADM','CASY','USFD','SFM'],
  },
  {
    etf: 'XLE', label: 'Energy', color: '#f59e0b',
    tickers: ['XOM','CVX','COP','SLB','EOG','MPC','PSX','VLO','OXY','WMB','KMI','HAL','HES','DVN','FANG','BKR','CTRA','MRO','APA','AR','EQT','TRGP','OVV','DEN','MGY','MTDR','SM','CHRD','PR','RRC'],
  },
  {
    etf: 'XLI', label: 'Industrials', color: '#64748b',
    tickers: ['CAT','GE','RTX','HON','UNP','BA','DE','LMT','UPS','ADP','ETN','ITW','NOC','WM','GD','CSX','MMM','FDX','NSC','EMR','CARR','TT','PCAR','SWK','ROK','CMI','JCI','DAL','UAL','LUV','AAL','FAST','ODFL','CTAS','PAYX','CPRT','AXON','TDG','HWM','XYL'],
  },
  {
    etf: 'XLB', label: 'Materials', color: '#a855f7',
    tickers: ['LIN','APD','SHW','ECL','NEM','FCX','NUE','VMC','MLM','DOW','DD','PPG','CF','ALB','BALL','PKG','IFF','CE','EMN','FMC','STLD','RS','CLF','AA','MP','RGLD','WPM','GOLD'],
  },
  {
    etf: 'XLRE', label: 'Real Estate', color: '#14b8a6',
    tickers: ['PLD','AMT','EQIX','CCI','SPG','PSA','O','WELL','DLR','VICI','AVB','EQR','WY','ARE','MAA','UDR','KIM','REG','HST','IRM','SUI','CPT','INVH','CUBE','LSI','EXR'],
  },
  {
    etf: 'XLU', label: 'Utilities', color: '#eab308',
    tickers: ['NEE','SO','DUK','CEG','SRE','AEP','D','EXC','PEG','ED','XEL','WEC','ES','AWK','ETR','FE','AEE','CMS','PPL','EVRG','NRG','VST','AES','OGE','PNW','LNT','NI'],
  },
  {
    etf: 'XLC', label: 'Communication', color: '#ef4444',
    tickers: ['META','GOOGL','GOOG','NFLX','DIS','CMCSA','TMUS','T','VZ','EA','TTWO','CHTR','OMC','IPG','FOXA','FOX','WBD','MTCH','LYV','PINS','SNAP','RBLX','ROKU','TTD','ZG','PARA','IMAX','SIRI'],
  },
];

export function getSectorByETF(etf: string): SectorDef | undefined {
  return SECTORS.find(s => s.etf === etf);
}

export function getSectorByTicker(ticker: string): SectorDef | undefined {
  return SECTORS.find(s => s.tickers.includes(ticker));
}
