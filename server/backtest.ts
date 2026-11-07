/**
 * Backtesting Engine
 * Fetches real OHLCV candles via Twelve Data and simulates a strategy bar by bar
 * with spread, slippage and commission. Results are split into an in-sample
 * (first 70%) and out-of-sample (last 30%) period so overfitting is visible.
 */

import { ema, rsi, atr, type Candle } from "./indicators";
import { calcProfit, getSymbolConfig, priceDecimals } from "@shared/pips";
import { getCandles } from "./lab/service/data";
import { dropClosedBars } from "@shared/sessions";

export type { Candle } from "./indicators";


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
  costs: number;
  pips: number;
  result: "win" | "loss";
  reason: "tp" | "sl" | "timeout";
  sample: "in" | "out";
}

interface PeriodStats {
  trades: number;
  winRate: number;
  profitFactor: number;
  netProfit: number;
  expectancy: number;
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
  totalCosts: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  avgWin: number;
  avgLoss: number;
  rrRatio: number;
  expectancy: number;
  inSample: PeriodStats;
  outOfSample: PeriodStats;
  assumptions: { spreadPips: number; slippagePips: number; commissionPerLot: number };
  equityCurve: { trade: number; balance: number; pl: number }[];
  trades: BacktestTrade[];
}

// ─── Candles: short in-memory cache in front of the Postgres candle cache ────
// Postgres (server/lab/service/data.ts) holds every bar ever fetched and makes
// the provider requests under a rate limit shared by all processes.

/** How long a fetched series stays fresh — roughly a fraction of one bar. */
function ttlFor(interval: string) {
  if (interval === "1day") return 60 * 60_000;
  if (interval === "4h") return 15 * 60_000;
  if (interval === "1h") return 5 * 60_000;
  return 2 * 60_000;
}

const candleCache = new Map<string, { at: number; size: number; data: Candle[] }>();
const inflight = new Map<string, Promise<Candle[]>>();

/** Latest `outputsize` bars. Served from memory while fresh, else from the candle cache + only the missing bars. */
export async function fetchCandles(symbol: string, interval: string, outputsize: number, apiKey: string): Promise<Candle[]> {
  const key = `${symbol}:${interval}`;
  const cached = candleCache.get(key);
  // A larger cached series also serves smaller requests (take the most recent bars)
  if (cached && cached.size >= outputsize && Date.now() - cached.at < ttlFor(interval)) {
    return cached.data.slice(-outputsize);
  }
  const flightKey = `${key}:${outputsize}`;
  const pending = inflight.get(flightKey);
  if (pending) return pending;

  // Some feeds quote FX through the weekend. Those bars are not tradeable, so they are dropped
  // (shared/sessions.ts); ask for enough raw bars that `outputsize` remain afterwards.
  const raw = Math.ceil(outputsize * 1.45);
  const p = getCandles(symbol, interval, raw, apiKey).then(all => {
    const candles = dropClosedBars(symbol, interval, all).slice(-outputsize);
    candleCache.set(key, { at: Date.now(), size: outputsize, data: candles });
    return candles;
  });
  inflight.set(flightKey, p);
  try { return await p; } finally { inflight.delete(flightKey); }
}

/** Typical retail costs in pips — conservative so results aren't flattering. */
export function defaultSpreadPips(symbol: string) {
  if (symbol === "EURUSD") return 1.0;
  if (symbol === "USDJPY") return 1.2;
  if (symbol === "GBPUSD") return 1.5;
  if (symbol === "XAUUSD") return 30;   // $0.30
  if (symbol.includes("JPY")) return 2.5;
  return 2.0;
}

function periodStats(trades: BacktestTrade[]): PeriodStats {
  const wins = trades.filter(t => t.profit > 0);
  const grossWin = wins.reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(trades.filter(t => t.profit <= 0).reduce((s, t) => s + t.profit, 0));
  const net = grossWin - grossLoss;
  return {
    trades: trades.length,
    winRate: trades.length ? parseFloat(((wins.length / trades.length) * 100).toFixed(1)) : 0,
    profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : (grossWin > 0 ? 99 : 0),
    netProfit: parseFloat(net.toFixed(2)),
    expectancy: trades.length ? parseFloat((net / trades.length).toFixed(2)) : 0,
  };
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
  spreadPips?: number;
  slippagePips?: number;
  commissionPerLot?: number;
}): Promise<BacktestResult> {
  const { symbol, timeframe, periods, riskPercent, rrRatio, accountSize, apiKey, strategy } = params;
  const cfg = getSymbolConfig(symbol);
  const spreadPips = params.spreadPips ?? defaultSpreadPips(symbol);
  const slippagePips = params.slippagePips ?? 0.3;
  const commissionPerLot = params.commissionPerLot ?? 7; // round-turn USD per standard lot
  const dp = priceDecimals(symbol);

  const candles = await fetchCandles(symbol, timeframe, Math.min(periods + 60, 5000), apiKey);
  if (candles.length < 80) throw new Error("Not enough candle data");

  const closes = candles.map(c => c.close);
  const atrArr = atr(candles, 14);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsiArr = rsi(closes, 14);

  const trades: BacktestTrade[] = [];
  let balance = accountSize;
  let peak = accountSize;
  let maxDrawdown = 0;
  const equityCurve: { trade: number; balance: number; pl: number }[] = [];

  const startIdx = 51;
  const splitIdx = startIdx + Math.floor((candles.length - startIdx) * 0.7);
  const halfSpread = (spreadPips * cfg.pipSize) / 2;
  const slip = slippagePips * cfg.pipSize;
  const MAX_HOLD = 100;

  for (let i = startIdx; i < candles.length - 2; i++) {
    const c = candles[i];
    const a = atrArr[i];
    const e20 = ema20[i], e50 = ema50[i], r = rsiArr[i], prevR = rsiArr[i - 1];
    if ([a, e20, e50, r, prevR].some(v => !Number.isFinite(v))) continue;

    let signal: "BUY" | "SELL" | null = null;
    if (strategy === "trend_follow") {
      if (e20 > e50 && c.close > e20 && r > 50 && r < 70 && closes[i - 1] < ema20[i - 1]) signal = "BUY";
      if (e20 < e50 && c.close < e20 && r < 50 && r > 30 && closes[i - 1] > ema20[i - 1]) signal = "SELL";
    } else if (strategy === "mean_revert") {
      if (r < 30 && prevR >= 30) signal = "BUY";
      if (r > 70 && prevR <= 70) signal = "SELL";
    } else if (strategy === "breakout") {
      const window = candles.slice(i - 20, i);
      const highestHigh = Math.max(...window.map(x => x.high));
      const lowestLow = Math.min(...window.map(x => x.low));
      if (c.close > highestHigh && e20 > e50) signal = "BUY";
      if (c.close < lowestLow && e20 < e50) signal = "SELL";
    }
    if (!signal) continue;

    // Enter at the next bar's open, paying half the spread plus slippage
    const mid = candles[i + 1].open;
    const entry = signal === "BUY" ? mid + halfSpread + slip : mid - halfSpread - slip;
    const slDist = a * 1.5;
    const tpDist = slDist * rrRatio;
    const sl = signal === "BUY" ? entry - slDist : entry + slDist;
    const tp = signal === "BUY" ? entry + tpDist : entry - tpDist;

    const riskUSD = balance * (riskPercent / 100);
    const lossPerLot = Math.abs(calcProfit(signal, entry, sl, symbol, 1));
    const lots = Math.max(0.01, Math.min(50, Math.round((riskUSD / Math.max(lossPerLot, 1e-9)) * 100) / 100));

    // Walk forward bar by bar. If a bar touches both SL and TP, assume SL first (conservative).
    let exitMid = candles[Math.min(i + MAX_HOLD, candles.length - 1)].close;
    let reason: BacktestTrade["reason"] = "timeout";
    let closeIdx = Math.min(i + MAX_HOLD, candles.length - 1);
    for (let j = i + 1; j <= Math.min(i + MAX_HOLD, candles.length - 1); j++) {
      const f = candles[j];
      // Long exits fill on the bid (mid - half spread); short exits on the ask
      const hitSL = signal === "BUY" ? f.low - halfSpread <= sl : f.high + halfSpread >= sl;
      const hitTP = signal === "BUY" ? f.high - halfSpread >= tp : f.low + halfSpread <= tp;
      if (hitSL) { exitMid = signal === "BUY" ? sl + halfSpread : sl - halfSpread; reason = "sl"; closeIdx = j; break; }
      if (hitTP) { exitMid = signal === "BUY" ? tp + halfSpread : tp - halfSpread; reason = "tp"; closeIdx = j; break; }
    }
    const exit = signal === "BUY" ? exitMid - halfSpread - (reason === "sl" ? slip : 0) : exitMid + halfSpread + (reason === "sl" ? slip : 0);

    const gross = calcProfit(signal, entry, exit, symbol, lots);
    const commission = commissionPerLot * lots;
    const profit = parseFloat((gross - commission).toFixed(2));
    const spreadCost = calcProfit("BUY", 0, halfSpread * 2 + slip * (reason === "sl" ? 2 : 1), symbol, lots);
    balance += profit;
    if (balance > peak) peak = balance;
    maxDrawdown = Math.max(maxDrawdown, peak - balance);

    const index = trades.length + 1;
    equityCurve.push({ trade: index, balance: parseFloat(balance.toFixed(2)), pl: profit });
    trades.push({
      index,
      openTime: candles[i + 1].time,
      closeTime: candles[closeIdx].time,
      symbol, type: signal,
      entryPrice: parseFloat(entry.toFixed(dp)),
      exitPrice: parseFloat(exit.toFixed(dp)),
      sl: parseFloat(sl.toFixed(dp)),
      tp: parseFloat(tp.toFixed(dp)),
      lots, profit,
      costs: parseFloat((commission + spreadCost).toFixed(2)),
      pips: parseFloat((((signal === "BUY" ? exit - entry : entry - exit)) / cfg.pipSize).toFixed(1)),
      result: profit > 0 ? "win" : "loss",
      reason,
      sample: i < splitIdx ? "in" : "out",
    });

    i = closeIdx; // one position at a time
    if (balance <= 0) break;
  }

  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  const totalWin = wins.reduce((s, t) => s + t.profit, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0));
  const all = periodStats(trades);

  return {
    symbol, timeframe,
    startDate: candles[startIdx]?.time || "",
    endDate: candles[candles.length - 1]?.time || "",
    totalTrades: trades.length, wins: wins.length, losses: losses.length,
    winRate: all.winRate,
    profitFactor: all.profitFactor,
    totalProfit: parseFloat(totalWin.toFixed(2)),
    totalLoss: parseFloat(totalLoss.toFixed(2)),
    netProfit: all.netProfit,
    totalCosts: parseFloat(trades.reduce((s, t) => s + t.costs, 0).toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    maxDrawdownPct: parseFloat(((maxDrawdown / accountSize) * 100).toFixed(1)),
    avgWin: wins.length ? parseFloat((totalWin / wins.length).toFixed(2)) : 0,
    avgLoss: losses.length ? parseFloat((totalLoss / losses.length).toFixed(2)) : 0,
    rrRatio: parseFloat(rrRatio.toFixed(2)),
    expectancy: all.expectancy,
    inSample: periodStats(trades.filter(t => t.sample === "in")),
    outOfSample: periodStats(trades.filter(t => t.sample === "out")),
    assumptions: { spreadPips, slippagePips, commissionPerLot },
    equityCurve, trades,
  };
}

export async function fetchCandlesForAI(symbol: string, apiKey: string): Promise<{
  h1: Candle[]; h4: Candle[]; d1: Candle[];
}> {
  const get = (interval: string, size: number) => fetchCandles(symbol, interval, size, apiKey).catch(() => [] as Candle[]);
  const [h1, h4, d1] = await Promise.all([get("1h", 120), get("4h", 120), get("1day", 120)]);
  return { h1, h4, d1 };
}
