// ─── TDCI service: live scoring + calibration backtest ────────────────────────

import { db } from "./db";
import { tdciCalibrations } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import { fetchCandles, defaultSpreadPips } from "./backtest";
import { getPairCot } from "./cot";
import { calcProfit, getSymbolConfig } from "@shared/pips";
import {
  prepare, warmup, layerValues, combine, computeAt, lastClosedIndex,
  DEFAULT_WEIGHTS, DIRECTIONAL_LAYERS, type Weights, type LayerKey, type TdciResult, type TdciContext,
} from "./tdci";

export const TDCI_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "GBPJPY", "USDCHF"];
export const TDCI_INTERVALS = ["1h", "4h"] as const;

// Trade model used to measure what a score is worth: stop 1.5×ATR, target 2R
const SL_ATR = 1.5;
const RR = 2;
const MAX_HOLD: Record<string, number> = { "1h": 48, "4h": 30 };
const IC_HORIZON: Record<string, number> = { "1h": 12, "4h": 6 };
export const BUCKETS = [[10, 30], [30, 50], [50, 70], [70, 101]] as const;

function apiKey() {
  const k = process.env.TWELVE_DATA_API_KEY;
  if (!k) throw new Error("Market data is not configured (TWELVE_DATA_API_KEY).");
  return k;
}

async function loadContext(symbol: string, interval: string, bars: number): Promise<TdciContext> {
  const key = apiKey();
  const dailyBars = interval === "4h" ? Math.min(5000, Math.ceil(bars / 6) + 120) : Math.min(5000, Math.ceil(bars / 24) + 120);
  const [p, d, cot] = await Promise.all([
    fetchCandles(symbol, interval, bars, key),
    fetchCandles(symbol, "1day", Math.max(300, dailyBars), key),
    getPairCot(symbol),
  ]);
  return prepare(symbol, interval, p, d, cot);
}

// ─── Calibration storage ──────────────────────────────────────────────────────

export async function latestCalibration(symbol: string, interval: string) {
  const [row] = await db.select().from(tdciCalibrations)
    .where(and(eq(tdciCalibrations.symbol, symbol), eq(tdciCalibrations.interval, interval)))
    .orderBy(desc(tdciCalibrations.createdAt)).limit(1);
  return row ?? null;
}

export async function listCalibrations() {
  const rows = await db.select().from(tdciCalibrations).orderBy(desc(tdciCalibrations.createdAt)).limit(100);
  const seen = new Set<string>();
  return rows.filter(r => { const k = `${r.symbol}:${r.interval}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ─── Live score ───────────────────────────────────────────────────────────────

export interface LiveTdci extends TdciResult {
  symbol: string;
  interval: string;
  weightsSource: "calibrated" | "default";
  calibratedAt: string | null;
  /** How trades at this score did out-of-sample in the latest calibration. */
  historical: BucketStats | null;
  recommendedMin: number | null;
}

export async function getLiveTdci(symbol: string, interval: string): Promise<LiveTdci> {
  const ctx = await loadContext(symbol, interval, 400);
  const i = lastClosedIndex(ctx);
  if (i < warmup(ctx)) throw new Error(`Not enough history to score ${symbol} on ${interval}.`);
  const cal = await latestCalibration(symbol, interval).catch(() => null);
  const weights = (cal?.weights as Weights) ?? DEFAULT_WEIGHTS;
  const r = computeAt(ctx, i, weights);
  const res = cal?.result as CalibrationResult | undefined;
  const bucket = res?.outOfSample.buckets.find(b => r.score >= b.min && r.score < b.max) ?? null;
  return {
    ...r, symbol, interval,
    weightsSource: cal ? "calibrated" : "default",
    calibratedAt: cal?.createdAt ? new Date(cal.createdAt).toISOString() : null,
    historical: bucket,
    recommendedMin: res?.recommendedMin ?? null,
  };
}

// ─── Calibration backtest ─────────────────────────────────────────────────────

export interface BucketStats {
  min: number; max: number;
  trades: number; winRate: number; avgR: number; profitFactor: number;
}

interface PeriodReport {
  from: string; to: string;
  bars: number;
  buckets: BucketStats[];
  anySignal: BucketStats;       // every non-neutral score
  randomDirection: number;      // avg R of a coin-flip direction — what costs alone do
  monotonic: number;            // rank correlation between bucket and avg R (1 = higher score, better results)
  strategy: { threshold: number; trades: number; winRate: number; totalR: number; maxDrawdownR: number } | null;
}

export interface CalibrationResult {
  symbol: string; interval: string;
  generatedAt: string;
  model: { stopAtr: number; rr: number; maxHoldBars: number; spreadPips: number; slippagePips: number; commissionPerLot: number };
  ic: Record<LayerKey, number>;           // in-sample information coefficient per layer
  icTStat: Record<LayerKey, number>;      // significance of in-sample IC (|t| ≥ 2 to earn a weight)
  weightsLearned: boolean;                // false = no layer was significant; prior weights kept
  icOutOfSample: Record<LayerKey, number>;
  weights: Weights;                       // learned (used live)
  inSample: PeriodReport;
  outOfSample: PeriodReport;
  outOfSampleDefaultWeights: PeriodReport;
  recommendedMin: number | null;
  verdict: string;
  avgHoldBars: number;
}

interface BarSample {
  i: number;
  x: Record<LayerKey, number>;
  regime: number;
  rLong: number; rShort: number;
  exitLong: number; exitShort: number;
  fwd: number;
}

/** Simulate a stop/target trade from the next bar's open, with costs, in R multiples. */
function simulate(ctx: TdciContext, i: number, side: 1 | -1, cost: { half: number; slip: number; commission: number }, maxHold: number) {
  const p = ctx.p, a = ctx.pAtr[i];
  const mid = p[i + 1].open;
  const entry = side > 0 ? mid + cost.half + cost.slip : mid - cost.half - cost.slip;
  const sl = entry - side * SL_ATR * a;
  const tp = entry + side * RR * SL_ATR * a;
  let exit = NaN, exitIdx = Math.min(i + maxHold, p.length - 1);
  for (let j = i + 1; j <= exitIdx; j++) {
    const b = p[j];
    // Longs exit on the bid (mid − half spread); shorts on the ask. Same-bar SL+TP counts as SL.
    const slHit = side > 0 ? b.low - cost.half <= sl : b.high + cost.half >= sl;
    const tpHit = side > 0 ? b.high - cost.half >= tp : b.low + cost.half <= tp;
    if (slHit) { exit = sl - side * cost.slip; exitIdx = j; break; }
    if (tpHit) { exit = tp; exitIdx = j; break; }
  }
  if (!Number.isFinite(exit)) exit = side > 0 ? p[exitIdx].close - cost.half : p[exitIdx].close + cost.half;
  const riskPerLot = Math.abs(calcProfit("BUY", entry, entry - SL_ATR * a, ctx.symbol, 1));
  const r = (side * (exit - entry)) / (SL_ATR * a) - (riskPerLot > 0 ? cost.commission / riskPerLot : 0);
  return { r, exitIdx };
}

function ranks(v: number[]) {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  for (let k = 0; k < idx.length;) {
    let e = k;
    while (e + 1 < idx.length && idx[e + 1][0] === idx[k][0]) e++;
    for (let m = k; m <= e; m++) r[idx[m][1]] = (k + e) / 2;
    k = e + 1;
  }
  return r;
}

function pearson(x: number[], y: number[]) {
  const n = x.length; if (n < 3) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/** Spearman rank correlation — robust to outliers in returns. */
const spearman = (x: number[], y: number[]) => pearson(ranks(x), ranks(y));

function stats(rs: number[], min: number, max: number): BucketStats {
  const wins = rs.filter(r => r > 0);
  const gains = wins.reduce((s, r) => s + r, 0);
  const losses = Math.abs(rs.filter(r => r <= 0).reduce((s, r) => s + r, 0));
  return {
    min, max, trades: rs.length,
    winRate: rs.length ? round(wins.length / rs.length * 100, 1) : 0,
    avgR: rs.length ? round(rs.reduce((s, r) => s + r, 0) / rs.length, 3) : 0,
    profitFactor: losses > 0 ? round(gains / losses, 2) : gains > 0 ? 99 : 0,
  };
}

function report(ctx: TdciContext, samples: BarSample[], weights: Weights, threshold: number | null): PeriodReport {
  const scored = samples.map(s => ({ s, c: combine(s.x, s.regime, weights) }));
  const pick = ({ s, c }: typeof scored[number]) => c.direction === "LONG" ? s.rLong : s.rShort;
  const active = scored.filter(z => z.c.direction !== "NEUTRAL");
  const buckets = BUCKETS.map(([lo, hi]) => stats(active.filter(z => z.c.score >= lo && z.c.score < hi).map(pick), lo, hi));
  const withData = buckets.filter(b => b.trades >= 20);
  const monotonic = withData.length >= 3 ? round(spearman(withData.map(b => b.min), withData.map(b => b.avgR)), 2) : 0;

  // Realistic strategy: one position at a time, enter when score ≥ threshold
  let strategy: PeriodReport["strategy"] = null;
  if (threshold != null) {
    const rs: number[] = [];
    let busyUntil = -1, eq = 0, peak = 0, dd = 0;
    for (const z of scored) {
      if (z.s.i <= busyUntil || z.c.direction === "NEUTRAL" || z.c.score < threshold) continue;
      const long = z.c.direction === "LONG";
      const r = long ? z.s.rLong : z.s.rShort;
      busyUntil = long ? z.s.exitLong : z.s.exitShort;
      rs.push(r); eq += r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq);
    }
    const st = stats(rs, threshold, 101);
    strategy = { threshold, trades: st.trades, winRate: st.winRate, totalR: round(eq, 2), maxDrawdownR: round(dd, 2) };
  }

  return {
    from: ctx.p[samples[0].i].time, to: ctx.p[samples[samples.length - 1].i].time,
    bars: samples.length,
    buckets,
    anySignal: stats(active.map(pick), 10, 101),
    randomDirection: round(samples.reduce((s, z) => s + (z.rLong + z.rShort) / 2, 0) / samples.length, 3),
    monotonic,
    strategy,
  };
}

/**
 * Learn weights from in-sample information coefficients. A layer only earns
 * a learned weight when its IC is statistically significant (|t| ≥ 2 using the
 * effective sample size, since forward returns overlap). Significant negative
 * IC makes the layer contrarian. Layers without significant IC are dropped;
 * if none are significant the reasoned prior is kept unchanged.
 */
function learnWeights(ic: Record<LayerKey, number>, sampleSize: number, horizon: number) {
  const nEff = Math.max(1, sampleSize / horizon);
  const tStat = Object.fromEntries(DIRECTIONAL_LAYERS.map(k => [k, round(ic[k] * Math.sqrt(nEff), 2)])) as Record<LayerKey, number>;
  const significant = DIRECTIONAL_LAYERS.filter(k => Math.abs(tStat[k]) >= 2);
  if (!significant.length) return { weights: { ...DEFAULT_WEIGHTS }, tStat, learned: false };
  const total = significant.reduce((s, k) => s + Math.abs(ic[k]), 0);
  const w = {} as Weights;
  for (const k of DIRECTIONAL_LAYERS) w[k] = significant.includes(k) ? round(ic[k] / total, 4) : 0;
  return { weights: w, tStat, learned: true };
}

export async function calibrate(symbol: string, interval: "1h" | "4h"): Promise<CalibrationResult> {
  const ctx = await loadContext(symbol, interval, 5000);
  const cfg = getSymbolConfig(symbol);
  const spreadPips = defaultSpreadPips(symbol);
  const slippagePips = 0.3, commissionPerLot = 7;
  const cost = { half: (spreadPips * cfg.pipSize) / 2, slip: slippagePips * cfg.pipSize, commission: commissionPerLot };
  const maxHold = MAX_HOLD[interval], h = IC_HORIZON[interval];

  const start = warmup(ctx), end = ctx.p.length - 1 - maxHold;
  if (end - start < 500) throw new Error(`Not enough history to calibrate ${symbol} ${interval} (${Math.max(0, end - start)} usable bars).`);

  const samples: BarSample[] = [];
  let holdSum = 0, holdN = 0;
  for (let i = start; i <= end; i++) {
    const lv = layerValues(ctx, i);
    const x = Object.fromEntries(DIRECTIONAL_LAYERS.map(k => [k, lv[k].value])) as Record<LayerKey, number>;
    const L = simulate(ctx, i, 1, cost, maxHold), S = simulate(ctx, i, -1, cost, maxHold);
    holdSum += (L.exitIdx - i) + (S.exitIdx - i); holdN += 2;
    samples.push({
      i, x, regime: lv.regime.value,
      rLong: L.r, rShort: S.r, exitLong: L.exitIdx, exitShort: S.exitIdx,
      fwd: (ctx.pClose[Math.min(i + h, ctx.p.length - 1)] - ctx.pClose[i]) / ctx.pAtr[i],
    });
  }

  const split = Math.floor(samples.length * 0.7);
  const IS = samples.slice(0, split), OOS = samples.slice(split);

  const icFor = (set: BarSample[]) => Object.fromEntries(DIRECTIONAL_LAYERS.map(k =>
    [k, round(spearman(set.map(s => s.x[k]), set.map(s => s.fwd)), 4)])) as Record<LayerKey, number>;
  const ic = icFor(IS), icOOS = icFor(OOS);
  const learned = learnWeights(ic, IS.length, h);
  const weights = learned.weights;

  // Threshold chosen in-sample only, then judged out-of-sample
  const isNoStrategy = report(ctx, IS, weights, null);
  const candidates = isNoStrategy.buckets.filter(b => b.trades >= 30 && b.avgR > 0.05).map(b => b.min);
  const chosen = candidates.length ? Math.min(...candidates) : null;

  const inSample = report(ctx, IS, weights, chosen);
  const outOfSample = report(ctx, OOS, weights, chosen);
  const outOfSampleDefaultWeights = report(ctx, OOS, DEFAULT_WEIGHTS, chosen);

  const oosAbove = chosen != null ? outOfSample.buckets.filter(b => b.min >= chosen) : [];
  const oosTrades = oosAbove.reduce((s, b) => s + b.trades, 0);
  const oosAvg = oosTrades ? oosAbove.reduce((s, b) => s + b.avgR * b.trades, 0) / oosTrades : 0;
  // Per-bar averages overlap and can be carried by one trending period, so the
  // threshold must ALSO make money as a real one-position-at-a-time strategy
  const strat = outOfSample.strategy;
  const stratOk = !!strat && strat.trades >= 30 && strat.totalR > 0;
  const holds = chosen != null && oosTrades >= 30 && oosAvg > 0 && stratOk;
  const recommendedMin = holds ? chosen : null;

  const verdict = !candidates.length
    ? "No score range showed a positive edge after costs, even in-sample. Treat this TDCI as context only for this market — do not auto-trade on it."
    : !holds
    ? `Scores ≥ ${chosen} looked positive in-sample but did not hold up out-of-sample (per-bar avg ${round(oosAvg, 2)}R; as a one-at-a-time strategy ${strat ? `${strat.trades} trades, ${strat.totalR}R` : "no trades"}). Likely noise — no threshold recommended.`
    : `Scores ≥ ${chosen} held up out-of-sample: ${strat!.trades} trades, ${strat!.totalR}R total after costs (max drawdown ${strat!.maxDrawdownR}R). Paper-trade it before risking money; edges this size can fade.`;

  const result: CalibrationResult = {
    symbol, interval, generatedAt: new Date().toISOString(),
    model: { stopAtr: SL_ATR, rr: RR, maxHoldBars: maxHold, spreadPips, slippagePips, commissionPerLot },
    ic, icTStat: learned.tStat, weightsLearned: learned.learned, icOutOfSample: icOOS, weights,
    inSample, outOfSample, outOfSampleDefaultWeights,
    recommendedMin, verdict,
    avgHoldBars: round(holdSum / Math.max(1, holdN), 1),
  };

  await db.insert(tdciCalibrations).values({ symbol, interval, weights, result });
  return result;
}

function round(v: number, dp = 3) { const m = 10 ** dp; return Math.round(v * m) / m; }
