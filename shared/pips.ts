/**
 * Pip configuration for every tradeable symbol.
 * pipSize    — smallest price increment that counts as one pip
 * pipValue   — USD profit per pip per standard lot (1.0 lots)
 * atrDefault — typical Average True Range (pips) for intraday moves
 * minSL      — minimum sensible stop-loss distance in pips
 * maxSL      — maximum sensible stop-loss distance in pips
 * category   — asset class
 */
export interface SymbolConfig {
  pipSize: number;
  pipValue: number;    // USD per pip per 1.0 lot
  atrDefault: number;  // typical intraday ATR in pips
  minSL: number;       // pips
  maxSL: number;       // pips
  category: "forex_major" | "forex_minor" | "forex_cross" | "metal" | "commodity" | "index";
  description: string;
  sessionPeak: string; // most active session
}

export const SYMBOL_CONFIG: Record<string, SymbolConfig> = {
  // ── Forex Majors (USD as quote) ──────────────────────────────────────────
  EURUSD: {
    pipSize: 0.0001, pipValue: 10,   atrDefault: 80,  minSL: 15, maxSL: 200,
    category: "forex_major", description: "Euro / US Dollar — most liquid pair, smooth trends",
    sessionPeak: "London/NY overlap 13:00-17:00 UTC",
  },
  GBPUSD: {
    pipSize: 0.0001, pipValue: 10,   atrDefault: 100, minSL: 20, maxSL: 250,
    category: "forex_major", description: "British Pound / US Dollar — volatile, news-sensitive",
    sessionPeak: "London open 08:00-12:00 UTC",
  },
  AUDUSD: {
    pipSize: 0.0001, pipValue: 10,   atrDefault: 60,  minSL: 15, maxSL: 150,
    category: "forex_major", description: "Australian Dollar / US Dollar — commodity-correlated (iron ore, coal)",
    sessionPeak: "Asian session 23:00-07:00 UTC",
  },
  NZDUSD: {
    pipSize: 0.0001, pipValue: 10,   atrDefault: 55,  minSL: 15, maxSL: 150,
    category: "forex_major", description: "New Zealand Dollar / US Dollar — dairy/commodity sensitive",
    sessionPeak: "Asian session 22:00-06:00 UTC",
  },
  USDCAD: {
    pipSize: 0.0001, pipValue: 7.4,  atrDefault: 70,  minSL: 15, maxSL: 180,
    category: "forex_major", description: "US Dollar / Canadian Dollar — oil-price correlated, inverse USD/oil relationship",
    sessionPeak: "NY session 14:00-20:00 UTC",
  },
  USDCHF: {
    pipSize: 0.0001, pipValue: 11.3, atrDefault: 65,  minSL: 15, maxSL: 170,
    category: "forex_major", description: "US Dollar / Swiss Franc — safe-haven, SNB-sensitive",
    sessionPeak: "London/NY overlap 13:00-17:00 UTC",
  },
  USDJPY: {
    pipSize: 0.01,   pipValue: 6.4,  atrDefault: 60,  minSL: 10, maxSL: 150,
    category: "forex_major", description: "US Dollar / Japanese Yen — risk-sentiment driven, carry trade",
    sessionPeak: "Asian/London open 00:00-09:00 UTC",
  },

  // ── JPY Crosses ───────────────────────────────────────────────────────────
  EURJPY: {
    pipSize: 0.01,   pipValue: 6.4,  atrDefault: 90,  minSL: 15, maxSL: 220,
    category: "forex_cross", description: "Euro / Japanese Yen — high volatility cross, risk-on/off indicator",
    sessionPeak: "London/NY overlap 13:00-17:00 UTC",
  },
  GBPJPY: {
    pipSize: 0.01,   pipValue: 6.4,  atrDefault: 120, minSL: 20, maxSL: 300,
    category: "forex_cross", description: "British Pound / Japanese Yen — most volatile major cross, known as 'the dragon'",
    sessionPeak: "London open 08:00-12:00 UTC",
  },
  AUDJPY: {
    pipSize: 0.01,   pipValue: 6.4,  atrDefault: 65,  minSL: 15, maxSL: 180,
    category: "forex_cross", description: "Australian Dollar / Japanese Yen — risk appetite barometer",
    sessionPeak: "Asian session 23:00-07:00 UTC",
  },
  CADJPY: {
    pipSize: 0.01,   pipValue: 6.4,  atrDefault: 70,  minSL: 15, maxSL: 180,
    category: "forex_cross", description: "Canadian Dollar / Japanese Yen — oil + risk appetite cross",
    sessionPeak: "NY session 14:00-20:00 UTC",
  },
  CHFJPY: {
    pipSize: 0.01,   pipValue: 6.4,  atrDefault: 55,  minSL: 12, maxSL: 150,
    category: "forex_cross", description: "Swiss Franc / Japanese Yen — dual safe-haven cross, low volatility",
    sessionPeak: "London session 08:00-16:00 UTC",
  },
  NZDJPY: {
    pipSize: 0.01,   pipValue: 6.4,  atrDefault: 58,  minSL: 12, maxSL: 160,
    category: "forex_cross", description: "New Zealand Dollar / Japanese Yen",
    sessionPeak: "Asian session 22:00-06:00 UTC",
  },

  // ── EUR Crosses ───────────────────────────────────────────────────────────
  EURGBP: {
    pipSize: 0.0001, pipValue: 12.8, atrDefault: 45,  minSL: 10, maxSL: 120,
    category: "forex_cross", description: "Euro / British Pound — low volatility, Brexit/EU-sensitive",
    sessionPeak: "London open 08:00-12:00 UTC",
  },
  EURCAD: {
    pipSize: 0.0001, pipValue: 7.4,  atrDefault: 75,  minSL: 15, maxSL: 200,
    category: "forex_cross", description: "Euro / Canadian Dollar",
    sessionPeak: "London/NY overlap 13:00-17:00 UTC",
  },
  EURAUD: {
    pipSize: 0.0001, pipValue: 10,   atrDefault: 85,  minSL: 18, maxSL: 220,
    category: "forex_cross", description: "Euro / Australian Dollar",
    sessionPeak: "London open 08:00-12:00 UTC",
  },

  // ── GBP Crosses ───────────────────────────────────────────────────────────
  GBPCAD: {
    pipSize: 0.0001, pipValue: 7.4,  atrDefault: 110, minSL: 20, maxSL: 280,
    category: "forex_cross", description: "British Pound / Canadian Dollar — very volatile cross",
    sessionPeak: "London/NY overlap 13:00-17:00 UTC",
  },
  GBPAUD: {
    pipSize: 0.0001, pipValue: 10,   atrDefault: 120, minSL: 22, maxSL: 300,
    category: "forex_cross", description: "British Pound / Australian Dollar — high volatility",
    sessionPeak: "London open 08:00-12:00 UTC",
  },

  // ── Metals ────────────────────────────────────────────────────────────────
  XAUUSD: {
    pipSize: 0.01,   pipValue: 1,    atrDefault: 1500, minSL: 200, maxSL: 5000,
    category: "metal", description: "Gold / US Dollar — safe-haven, inflation hedge, inverse USD. Very sensitive to US yields and Fed policy. 1 lot = 100 oz",
    sessionPeak: "NY open 13:00-17:00 UTC + Asian safe-haven flows",
  },
  XAGUSD: {
    pipSize: 0.001,  pipValue: 5,    atrDefault: 500,  minSL: 100, maxSL: 2000,
    category: "metal", description: "Silver / US Dollar — industrial + safe-haven. Higher vol than gold. 1 lot = 5000 oz",
    sessionPeak: "NY open 13:00-17:00 UTC",
  },

  // ── Energy ───────────────────────────────────────────────────────────────
  USOIL: {
    pipSize: 0.01,   pipValue: 1,    atrDefault: 5000, minSL: 500, maxSL: 20000,
    category: "commodity", description: "US WTI Crude Oil — OPEC-sensitive, inventory data, geopolitical",
    sessionPeak: "NY session 13:00-20:00 UTC",
  },

  // ── Indices ───────────────────────────────────────────────────────────────
  US30: {
    pipSize: 1,      pipValue: 1,    atrDefault: 30000, minSL: 5000, maxSL: 80000,
    category: "index", description: "Dow Jones Industrial Average — 30 blue-chip US stocks",
    sessionPeak: "NY session 14:30-21:00 UTC",
  },
  NAS100: {
    pipSize: 0.25,   pipValue: 1,    atrDefault: 20000, minSL: 3000, maxSL: 60000,
    category: "index", description: "NASDAQ 100 — tech-heavy, Fed/rates sensitive",
    sessionPeak: "NY session 14:30-21:00 UTC",
  },
  SPX500: {
    pipSize: 0.25,   pipValue: 1,    atrDefault: 15000, minSL: 2000, maxSL: 50000,
    category: "index", description: "S&P 500 — broad US market benchmark",
    sessionPeak: "NY session 14:30-21:00 UTC",
  },
};

/** Resolve config for a symbol, with sensible defaults for unknown symbols */
export function getSymbolConfig(symbol: string): SymbolConfig {
  if (SYMBOL_CONFIG[symbol]) return SYMBOL_CONFIG[symbol];
  const isJPY = symbol.includes("JPY");
  const isXAU = symbol.startsWith("XAU");
  return {
    pipSize:    isXAU ? 0.01 : isJPY ? 0.01 : 0.0001,
    pipValue:   isXAU ? 1    : isJPY ? 6.4  : 10,
    atrDefault: isJPY ? 60   : 80,
    minSL:      isJPY ? 10   : 15,
    maxSL:      isJPY ? 150  : 200,
    category:   "forex_major",
    description: symbol,
    sessionPeak: "London/NY overlap",
  };
}

/** Calculate realised or floating P&L in USD */
export function calcProfit(
  type: "BUY" | "SELL" | string,
  entryPrice: number,
  exitPrice: number,
  symbol: string,
  lots: number
): number {
  const isBuy = type.toUpperCase().includes("BUY") || type.toLowerCase() === "long";
  const diff = isBuy ? exitPrice - entryPrice : entryPrice - exitPrice;
  return parseFloat((diff * usdPerPriceUnit(symbol, exitPrice) * lots).toFixed(2));
}

/**
 * USD value of a 1.0 price-unit move for 1.0 lot. For USD-base pairs
 * (USDJPY, USDCAD, USDCHF) the quote currency is converted at the trade price,
 * so P&L is exact rather than a static approximation.
 */
export function usdPerPriceUnit(symbol: string, price: number): number {
  const cfg = getSymbolConfig(symbol);
  if (symbol.startsWith("USD") && symbol.length === 6 && price > 0) {
    return 100_000 / price;
  }
  return cfg.pipValue / cfg.pipSize;
}

/** Calculate position size in lots given account size, risk %, and SL in pips */
export function calcLotSize(
  accountSize: number,
  riskPercent: number,
  slPips: number,
  symbol: string
): number {
  const cfg = getSymbolConfig(symbol);
  const riskUSD = accountSize * (riskPercent / 100);
  const rawLots = riskUSD / (slPips * cfg.pipValue);
  return Math.max(0.01, parseFloat(rawLots.toFixed(2)));
}

/** Build a default SL price, minSL pips away from entry */
export function defaultSL(symbol: string, isBuy: boolean, entry: number): number {
  const cfg = getSymbolConfig(symbol);
  const dist = cfg.minSL * cfg.pipSize * 2;
  const price = isBuy ? entry - dist : entry + dist;
  const decimals = cfg.pipSize < 0.001 ? 5 : cfg.pipSize < 0.1 ? 3 : 2;
  return parseFloat(price.toFixed(decimals));
}

/** Build a default TP price targeting 2:1 RR from a given SL distance */
export function defaultTP(symbol: string, isBuy: boolean, entry: number, sl: number): number {
  const slDist = Math.abs(entry - sl);
  const tpDist = slDist * 2;
  const price = isBuy ? entry + tpDist : entry - tpDist;
  const cfg = getSymbolConfig(symbol);
  const decimals = cfg.pipSize < 0.001 ? 5 : cfg.pipSize < 0.1 ? 3 : 2;
  return parseFloat(price.toFixed(decimals));
}

/** Signed pip distance from entry to exit for a trade direction. */
export function calcPips(type: "BUY" | "SELL" | string, entryPrice: number, exitPrice: number, symbol: string): number {
  const cfg = getSymbolConfig(symbol);
  const isBuy = type.toUpperCase().includes("BUY") || type.toLowerCase() === "long";
  const pips = (isBuy ? exitPrice - entryPrice : entryPrice - exitPrice) / cfg.pipSize;
  return parseFloat(pips.toFixed(1));
}

/** Decimal places used to display a price for this symbol. */
export function priceDecimals(symbol: string): number {
  if (symbol.startsWith("XAU")) return 2;
  const cfg = getSymbolConfig(symbol);
  return cfg.pipSize < 0.001 ? 5 : cfg.pipSize < 0.1 ? 3 : 2;
}
