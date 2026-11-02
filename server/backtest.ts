/**
 * Backtesting Engine
 * Fetches real OHLCV candles via Twelve Data API and simulates a strategy
 * trade-by-trade, producing full equity curve, drawdown, win rate, and trade list.
 */

const TWELVE_BASE = "https://api.twelvedata.com";

export interface Candle {
  time: string;   // ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface BacktestTrade {
  index: number;
  openTime: string;
  closeTime: string;
  symbol: string;
  type: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  sl: number;
  tp: number;
  lots: number;
  profit: number;
  pips: number;
  result: "win" | "loss" | "be";
  reason: "tp" | "sl";
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  totalProfit: number;
  totalLoss: number;
  netProfit: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  avgWin: number;
  avgLoss: number;
  rrRatio: number;
  expectancy: number;
  equityCurve: { trade: number; balance: number; pl: number }[];
  trades: BacktestTrade[];
}

async function fetchCandles(symbol: string, interval: string, outputsize: number, apiKey: string): Promise<Candle[]> {
  // Map internal symbol to Twelve Data symbol
  const tdSym = symbol === "XAUUSD" ? "XAU/USD" : symbol.slice(0, 3) + "/" + symbol.slice(3);
  try {
    const url = `${TWELVE_BASE}/time_series?symbol=${encodeURIComponent(tdSym)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}&order=ASC`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;
    if (data.status === "error") throw new Error(data.message || "Twelve Data error");
    const values = data.values as any[];
    if (!values?.length) throw new Error("No data returned");
    return values.map((v: any) => ({
      time: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: v.volume ? parseFloat(v.volume) : undefined,
    }));
  } catch (e: any) {
    throw new Error(`Candle fetch failed: ${e.message}`);
  }
}

function calcATR(candles: Candle[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const atr: number[] = new Array(period).fill(0);
  let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
  atr[period - 1] = sum / period;
  for (let i = period; i < tr.length; i++) {
    atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
  }
  return atr;
}

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let e = values[0];
  for (const v of values) {
    e = v * k + e * (1 - k);
    ema.push(e);
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(period).fill(50);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

export async function runBacktest(params: {
  symbol: string;
  timeframe: string;
  periods: number;
  riskPercent: number;
  rrRatio: number;
  accountSize: number;
  apiKey: string;
  strategy: "trend_follow" | "mean_revert" | "breakout";
}): Promise<BacktestResult> {
  const { symbol, timeframe, periods, riskPercent, rrRatio, accountSize, apiKey, strategy } = params;

  const candles = await fetchCandles(symbol, timeframe, Math.min(periods + 50, 5000), apiKey);
  if (candles.length < 30) throw new Error("Not enough candle data");

  const closes = candles.map(c => c.close);
  const atrArr = calcATR(candles);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const rsi = calcRSI(closes, 14);

  // Get pip config for this symbol
  const pipSize = symbol.startsWith("XAU") ? 0.01 : symbol.includes("JPY") ? 0.01 : 0.0001;
  const pipValue = symbol.startsWith("XAU") ? 1 : symbol.includes("JPY") ? 6.4 : 10;

  const trades: BacktestTrade[] = [];
  let balance = accountSize;
  let peak = accountSize;
  let maxDrawdown = 0;
  let tradeIdx = 0;
  const equityCurve: { trade: number; balance: number; pl: number }[] = [];

  const startIdx = 51;

  for (let i = startIdx; i < candles.length - 1; i++) {
    const c = candles[i];
    const atr = atrArr[i - 1] || (c.high - c.low);
    const e20 = ema20[i];
    const e50 = ema50[i];
    const r = rsi[i];
    const prevR = rsi[i - 1];

    let signal: "BUY" | "SELL" | null = null;

    if (strategy === "trend_follow") {
      if (e20 > e50 && c.close > e20 && r > 50 && r < 70 && closes[i - 1] < ema20[i - 1]) signal = "BUY";
      if (e20 < e50 && c.close < e20 && r < 50 && r > 30 && closes[i - 1] > ema20[i - 1]) signal = "SELL";
    } else if (strategy === "mean_revert") {
      if (r < 30 && prevR >= 30) signal = "BUY";
      if (r > 70 && prevR <= 70) signal = "SELL";
    } else if (strategy === "breakout") {
      const highestHigh = Math.max(...candles.slice(i - 20, i).map(x => x.high));
      const lowestLow = Math.min(...candles.slice(i - 20, i).map(x => x.low));
      if (c.close > highestHigh && e20 > e50) signal = "BUY";
      if (c.close < lowestLow && e20 < e50) signal = "SELL";
    }

    if (!signal) continue;

    const entry = candles[i + 1].open;
    const slDist = atr * 1.5;
    const tpDist = slDist * rrRatio;
    const sl = signal === "BUY" ? entry - slDist : entry + slDist;
    const tp = signal === "BUY" ? entry + tpDist : entry - tpDist;

    // Risk-based lot size
    const slPips = slDist / pipSize;
    const riskUSD = balance * (riskPercent / 100);
    const lots = parseFloat(Math.max(0.01, Math.min(10, riskUSD / (slPips * pipValue))).toFixed(2));

    // Simulate forward to find outcome
    let exitPrice = tp;
    let reason: "tp" | "sl" = "tp";
    let closeIdx = i + 1;
    let result: "win" | "loss" | "be" = "win";

    for (let j = i + 2; j < Math.min(i + 100, candles.length); j++) {
      const fut = candles[j];
      const tpHit = signal === "BUY" ? fut.high >= tp : fut.low <= tp;
      const slHit = signal === "BUY" ? fut.low <= sl : fut.high >= sl;

      if (slHit && !tpHit) {
        exitPrice = sl; reason = "sl"; result = "loss"; closeIdx = j; break;
      }
      if (tpHit) {
        exitPrice = tp; reason = "tp"; result = "win"; closeIdx = j; break;
      }
      if (j === Math.min(i + 99, candles.length - 1)) {
        exitPrice = candles[j].close; reason = "sl"; result = "be"; closeIdx = j;
      }
    }

    const priceDiff = signal === "BUY" ? exitPrice - entry : entry - exitPrice;
    const pips = priceDiff / pipSize;
    const profit = parseFloat((pips * pipValue * lots).toFixed(2));
    balance += profit;

    if (balance > peak) peak = balance;
    const dd = peak - balance;
    if (dd > maxDrawdown) maxDrawdown = dd;

    tradeIdx++;
    equityCurve.push({ trade: tradeIdx, balance: parseFloat(balance.toFixed(2)), pl: profit });

    trades.push({
      index: tradeIdx,
      openTime: candles[i + 1].time,
      closeTime: candles[closeIdx].time,
      symbol, type: signal,
      entryPrice: parseFloat(entry.toFixed(symbol.startsWith("XAU") ? 2 : 5)),
      exitPrice: parseFloat(exitPrice.toFixed(symbol.startsWith("XAU") ? 2 : 5)),
      sl: parseFloat(sl.toFixed(symbol.startsWith("XAU") ? 2 : 5)),
      tp: parseFloat(tp.toFixed(symbol.startsWith("XAU") ? 2 : 5)),
      lots, profit, pips: parseFloat(pips.toFixed(1)), result, reason,
    });

    i = closeIdx;
  }

  const wins = trades.filter(t => t.result === "win");
  const losses = trades.filter(t => t.result !== "win");
  const totalWin = wins.reduce((s, t) => s + t.profit, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0));
  const netProfit = totalWin - totalLoss;
  const winRate = trades.length ? parseFloat(((wins.length / trades.length) * 100).toFixed(1)) : 0;
  const profitFactor = totalLoss > 0 ? parseFloat((totalWin / totalLoss).toFixed(2)) : 0;
  const avgWin = wins.length ? parseFloat((totalWin / wins.length).toFixed(2)) : 0;
  const avgLoss = losses.length ? parseFloat((totalLoss / losses.length).toFixed(2)) : 0;
  const expectancy = trades.length
    ? parseFloat(((winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss).toFixed(2))
    : 0;

  return {
    symbol, timeframe,
    startDate: candles[startIdx]?.time || "",
    endDate: candles[candles.length - 1]?.time || "",
    totalTrades: trades.length, wins: wins.length, losses: losses.length,
    winRate, profitFactor, totalProfit: parseFloat(totalWin.toFixed(2)),
    totalLoss: parseFloat(totalLoss.toFixed(2)), netProfit: parseFloat(netProfit.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    maxDrawdownPct: parseFloat(((maxDrawdown / accountSize) * 100).toFixed(1)),
    avgWin, avgLoss,
    rrRatio: parseFloat(rrRatio.toFixed(2)), expectancy, equityCurve, trades,
  };
}

export async function fetchCandlesForAI(symbol: string, apiKey: string): Promise<{
  h1: Candle[]; h4: Candle[]; d1: Candle[];
}> {
  const tdSym = symbol === "XAUUSD" ? "XAU/USD" : symbol.slice(0, 3) + "/" + symbol.slice(3);
  async function fetch_(interval: string, size: number): Promise<Candle[]> {
    try {
      const url = `${TWELVE_BASE}/time_series?symbol=${encodeURIComponent(tdSym)}&interval=${interval}&outputsize=${size}&apikey=${apiKey}&order=DESC`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [];
      const data = await res.json() as any;
      if (data.status === "error") return [];
      return (data.values || []).map((v: any) => ({
        time: v.datetime, open: parseFloat(v.open), high: parseFloat(v.high),
        low: parseFloat(v.low), close: parseFloat(v.close),
      })).reverse();
    } catch { return []; }
  }
  const [h1, h4, d1] = await Promise.all([
    fetch_("1h", 24),
    fetch_("4h", 20),
    fetch_("1day", 30),
  ]);
  return { h1, h4, d1 };
}
