// Static sector ETF holdings — top high-activity names per sector
// These are the most liquid, highest-volume holdings that move with the sector
// Update 1-2x per year or supplement with Finnhub ETF holdings API
// Source: SPDR sector ETF fact sheets, sorted by weight + options activity

export interface SectorDef {
  etf: string;
  label: string;
  color: string;         // heatmap color base
  holdings: string[];    // top tickers by weight + trading activity
}

export const SECTORS: SectorDef[] = [
  {
    etf: 'XLK', label: 'Technology', color: '#3b82f6',
    holdings: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'CRM', 'AMD', 'ADBE', 'CSCO', 'ORCL', 'ACN', 'INTC', 'QCOM', 'TXN', 'INTU', 'NOW', 'IBM', 'AMAT', 'MU', 'PANW', 'LRCX'],
  },
  {
    etf: 'XLE', label: 'Energy', color: '#f59e0b',
    holdings: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PXD', 'PSX', 'VLO', 'OXY', 'WMB', 'HES', 'DVN', 'HAL', 'KMI', 'FANG', 'BKR', 'TRGP', 'OKE', 'CTRA'],
  },
  {
    etf: 'XLF', label: 'Financials', color: '#10b981',
    holdings: ['BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'BLK', 'AXP', 'C', 'SCHW', 'PGR', 'CB', 'MMC', 'ICE', 'CME', 'MCO', 'USB'],
  },
  {
    etf: 'XLV', label: 'Healthcare', color: '#ec4899',
    holdings: ['UNH', 'LLY', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'PFE', 'AMGN', 'DHR', 'BMY', 'ISRG', 'MDT', 'GILD', 'CVS', 'ELV', 'SYK', 'REGN', 'BSX', 'VRTX'],
  },
  {
    etf: 'XLY', label: 'Consumer Disc.', color: '#8b5cf6',
    holdings: ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'SBUX', 'TJX', 'BKNG', 'ABNB', 'CMG', 'ORLY', 'GM', 'F', 'DHI', 'ROST', 'MAR', 'LEN', 'YUM', 'EBAY'],
  },
  {
    etf: 'XLP', label: 'Consumer Staples', color: '#06b6d4',
    holdings: ['PG', 'KO', 'PEP', 'COST', 'WMT', 'PM', 'MO', 'CL', 'MDLZ', 'GIS', 'KHC', 'STZ', 'SYY', 'HSY', 'KMB', 'CAG', 'K', 'TSN', 'ADM', 'TAP'],
  },
  {
    etf: 'XLI', label: 'Industrials', color: '#64748b',
    holdings: ['CAT', 'GE', 'UNP', 'HON', 'RTX', 'UPS', 'BA', 'DE', 'LMT', 'MMM', 'FDX', 'GD', 'NOC', 'WM', 'CSX', 'ITW', 'EMR', 'ETN', 'NSC', 'PH'],
  },
  {
    etf: 'XLB', label: 'Materials', color: '#a855f7',
    holdings: ['LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'NUE', 'DOW', 'DD', 'PPG', 'CTVA', 'VMC', 'MLM', 'ALB', 'CF', 'IFF', 'CE', 'EMN', 'PKG', 'IP'],
  },
  {
    etf: 'XLRE', label: 'Real Estate', color: '#14b8a6',
    holdings: ['PLD', 'AMT', 'EQIX', 'CCI', 'PSA', 'O', 'WELL', 'SPG', 'DLR', 'VICI', 'AVB', 'EQR', 'IRM', 'WY', 'ARE', 'INVH', 'MAA', 'SUI', 'KIM', 'REG'],
  },
  {
    etf: 'XLU', label: 'Utilities', color: '#eab308',
    holdings: ['NEE', 'SO', 'DUK', 'CEG', 'SRE', 'AEP', 'D', 'PCG', 'EXC', 'XEL', 'ED', 'WEC', 'AWK', 'ES', 'DTE', 'PPL', 'EIX', 'FE', 'AEE', 'CMS'],
  },
  {
    etf: 'XLC', label: 'Communication', color: '#ef4444',
    holdings: ['META', 'GOOGL', 'GOOG', 'NFLX', 'DIS', 'CMCSA', 'T', 'VZ', 'TMUS', 'CHTR', 'EA', 'ATVI', 'WBD', 'PARA', 'OMC', 'IPG', 'TTWO', 'MTCH', 'LYV', 'FOXA'],
  },
];

export function getSectorByETF(etf: string): SectorDef | undefined {
  return SECTORS.find(s => s.etf === etf);
}

export function getSectorByTicker(ticker: string): SectorDef | undefined {
  return SECTORS.find(s => s.holdings.includes(ticker));
}
