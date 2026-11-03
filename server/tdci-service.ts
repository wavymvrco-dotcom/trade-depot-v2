// ─── TDCI service: live scoring, calibration backtests, background jobs ──────

import { db } from "./db";
import { tdciCalibrations } from "@shared/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { fetchCandles, defaultSpreadPips } from "./backtest";
import { getPairCot } from "./cot";
import { getPairRates } from "./rates";
import { toWeekly } from "./indicators";
import { calcProfit, getSymbolConfig } from "@shared/pips";
import {
  prepare, warmup, layerValues, combine, computeAt, lastClosedIndex, PROFILES, STYLES,
  type StyleKey, type Weights, type LayerKey, type TdciResult, type TdciContext, type Profile,
} from "./tdci";

export const TDCI_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "GBPJPY", "XAUUSD"];
export const BUCKETS = [[10, 30], [30, 50], [50, 70], [70, 101]] as const;

// Significance bar for learning a layer weight. Calibration tests ~200
// layer/market/style combinations; at |t| ≥ 2 about 5% (~10) would pass by
// chance alone. |t| ≥ 3 keeps expected false positives below one.
const MIN_T = 3;

export function isStyle(s: unknown): s is StyleKey {
  return typeof s === "string" && (STYLES as string[]).includes(s);
}

/** Map a strategy style (scalp/day/swing/position) to a TDCI style, defaulting to swing. */
export function styleFor(strategyStyle: string | null | undefined): StyleKey {
  return isStyle(strategyStyle) ? strategyStyle : "swing";
}

function apiKey() {
  const k = process.env.TWELVE_DATA_API_KEY;
  if (!k) throw new Error("Market data is not configured (TWELVE_DATA_API_KEY).");
  return k;
}

const HTF_PER_PRIMARY: Record<string, number> = { "5min→1h": 1 / 12, "15min→4h": 1 / 16, "4h→1day": 1 / 6 };

async function loadContext(symbol: string, profile: Profile, bars: number): Promise<TdciContext> {
  const key = apiKey();
  const p = await fetchCandles(symbol, profile.interval, bars, key);
  let h;
  if (profile.htf === "1week") {
    h = toWeekly(p);
  } else {
    const ratio = HTF_PER_PRIMARY[`${profile.interval}→${profile.htf}`] ?? 1 / 6;
    h = await fetchCandles(symbol, profile.htf, Math.min(20000, Math.ceil(bars * ratio) + 120), key);
  }
  const needCot = profile.layers.includes("positioning");
  const needRates = profile.layers.includes("carry");
  const [cot, rates] = await Promise.all([
    needCot ? getPairCot(symbol) : Promise.resolve(undefined),
    needRates ? getPairRates(symbol) : Promise.resolve(undefined),
  ]);
  const spread = defaultSpreadPips(symbol) * getSymbolConfig(symbol).pipSize;
  return prepare(symbol, profile, p, h, { cot, rates, spread });
}

// ─── Calibration storage ──────────────────────────────────────────────────────
// The `interval` column holds the style key (scalp/day/swing/position).

export async function latestCalibration(symbol: string, style: StyleKey) {
  const [row] = await db.select().from(tdciCalibrations)
    .where(and(eq(tdciCalibrations.symbol, symbol), eq(tdciCalibrations.interval, style)))
    .orderBy(desc(tdciCalibrations.createdAt)).limit(1);
  return row ?? null;
}

export async function listCalibrations() {
  const rows = await db.select().from(tdciCalibrations)
    .where(inArray(tdciCalibrations.interval, STYLES as string[]))
    .orderBy(desc(tdciCalibrations.createdAt)).limit(400);
  const seen = new Set<string>();
  return rows.filter(r => { const k = `${r.symbol}:${r.interval}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ─── Live score ───────────────────────────────────────────────────────────────

export interface LiveTdci extends TdciResult {
  symbol: string;
  interval: string;
  weightsSource: "calibrated" | "default";
  calibratedAt: string | null;
  historical: BucketStats | null;
  recommendedMin: number | null;
}

export async function getLiveTdci(symbol: string, style: StyleKey): Promise<LiveTdci> {
  const profile = PROFILES[style];
  const ctx = await loadContext(symbol, profile, profile.history.live);
  const i = lastClosedIndex(ctx);
  if (i < warmup(ctx)) throw new Error(`Not enough history to score ${symbol} for ${profile.label}.`);
  const cal = await latestCalibration(symbol, style).catch(() => null);
  const weights = (cal?.weights as Weights) ?? profile.defaultWeights;
  const r = computeAt(ctx, i, weights);
  const res = cal?.result as CalibrationResult | undefined;
  return {
    ...r, symbol, interval: profile.interval,
    weightsSource: cal ? "calibrated" : "default",
    calibratedAt: cal?.createdAt ? new Date(cal.createdAt).toISOString() : null,
    historical: res?.outOfSample.buckets.find(b => r.score >= b.min && r.score < b.max) ?? null,
    recommendedMin: res?.recommendedMin ?? null,
  };
}

// ─── Calibration backtest ─────────────────────────────────────────────────────

export interface BucketStats { min: number; max: number; trades: number; winRate: number; avgR: number; profitFactor: number }

interface PeriodReport {
  from: string; to: string; bars: number;
  buckets: BucketStats[];
  anySignal: BucketStats;
  randomDirection: number;
  monotonic: number;
  strategy: { threshold: number; trades: number; winRate: number; totalR: number; maxDrawdownR: number } | null;
}

export interface CalibrationResult {
  symbol: string; style: StyleKey; interval: string; htf: string;
  generatedAt: string;
  layers: LayerKey[];
  model: { stopAtr: number; rr: number; maxHoldBars: number; spreadPips: number; slippagePips: number; commissionPerLot: number };
  ic: Record<string, number>;
  icTStat: Record<string, number>;
  icOutOfSample: Record<string, number>;
  weightsLearned: boolean;
  weights: Weights;
  inSample: PeriodReport;
  outOfSample: PeriodReport;
  outOfSampleDefaultWeights: PeriodReport;
  recommendedMin: number | null;
  verdict: string;
  avgHoldBars: number;
  costShareOfRisk: number; // average round-trip cost as a fraction of 1R
}

interface BarSample {
  i: number;
  x: Partial<Record<LayerKey, number>>;
  regime: number;
  rLong: number; rShort: number;
  exitLong: number; exitShort: number;
  fwd: number;
  costR: number;
}

function simulate(ctx: TdciContext, i: number, side: 1 | -1, cost: { half: number; slip: number; commission: number }) {
  const { stopAtr, rr, maxHold } = ctx.profile.model;
  const p = ctx.p, a = ctx.pAtr[i];
  const mid = p[i + 1].open;
  const entry = side > 0 ? mid + cost.half + cost.slip : mid - cost.half - cost.slip;
  const sl = entry - side * stopAtr * a, tp = entry + side * rr * stopAtr * a;
  let exit = NaN, exitIdx = Math.min(i + maxHold, p.length - 1);
  for (let j = i + 1; j <= exitIdx; j++) {
    const b = p[j];
    // Longs exit on the bid, shorts on the ask; a bar touching both counts as the stop (conservative)
    const slHit = side > 0 ? b.low - cost.half <= sl : b.high + cost.half >= sl;
    const tpHit = side > 0 ? b.high - cost.half >= tp : b.low + cost.half <= tp;
    if (slHit) { exit = sl - side * cost.slip; exitIdx = j; break; }
    if (tpHit) { exit = tp; exitIdx = j; break; }
  }
  if (!Number.isFinite(exit)) exit = side > 0 ? p[exitIdx].close - cost.half : p[exitIdx].close + cost.half;
  const riskPerLot = Math.abs(calcProfit("BUY", entry, entry - stopAtr * a, ctx.symbol, 1));
  const commissionR = riskPerLot > 0 ? cost.commission / riskPerLot : 0;
  const r = (side * (exit - entry)) / (stopAtr * a) - commissionR;
  const costR = (2 * cost.half + 2 * cost.slip) / (stopAtr * a) + commissionR;
  return { r, exitIdx, costR };
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
    bars: samples.length, buckets,
    anySignal: stats(active.map(pick), 10, 101),
    randomDirection: round(samples.reduce((s, z) => s + (z.rLong + z.rShort) / 2, 0) / samples.length, 3),
    monotonic, strategy,
  };
}

/**
 * Learn weights from in-sample information coefficients. A layer earns a
 * learned weight only when |t| ≥ MIN_T (effective sample size accounts for
 * overlapping forward returns). Significant negative IC makes it contrarian.
 * If nothing is significant, the style's reasoned prior is kept.
 */
function learnWeights(profile: Profile, ic: Record<string, number>, sampleSize: number) {
  const nEff = Math.max(1, sampleSize / profile.model.icHorizon);
  const tStat = Object.fromEntries(profile.layers.map(k => [k, round(ic[k] * Math.sqrt(nEff), 2)]));
  const significant = profile.layers.filter(k => Math.abs(tStat[k]) >= MIN_T);
  if (!significant.length) return { weights: { ...profile.defaultWeights }, tStat, learned: false };
  const total = significant.reduce((s, k) => s + Math.abs(ic[k]), 0);
  const w: Weights = {};
  for (const k of profile.layers) w[k] = significant.includes(k) ? round(ic[k] / total, 4) : 0;
  return { weights: w, tStat, learned: true };
}

export async function calibrate(symbol: string, style: StyleKey, onProgress?: (msg: string) => void): Promise<CalibrationResult> {
  const profile = PROFILES[style];
  onProgress?.(`Loading ${profile.history.calibrate.toLocaleString()} ${profile.interval} bars`);
  const ctx = await loadContext(symbol, profile, profile.history.calibrate);
  const cfg = getSymbolConfig(symbol);
  const spreadPips = defaultSpreadPips(symbol);
  const slippagePips = style === "scalp" ? 0.2 : 0.3, commissionPerLot = 7;
  const cost = { half: (spreadPips * cfg.pipSize) / 2, slip: slippagePips * cfg.pipSize, commission: commissionPerLot };
  const h = profile.model.icHorizon, maxHold = profile.model.maxHold;

  const start = warmup(ctx), end = ctx.p.length - 1 - maxHold;
  if (end - start < 500) throw new Error(`Not enough history to calibrate ${symbol} ${profile.label} (${Math.max(0, end - start)} usable bars).`);

  onProgress?.(`Scoring and simulating ${(end - start).toLocaleString()} bars`);
  const samples: BarSample[] = [];
  let holdSum = 0, holdN = 0, costSum = 0;
  for (let i = start; i <= end; i++) {
    const lv = layerValues(ctx, i);
    const x = Object.fromEntries(profile.layers.map(k => [k, lv.layers[k].value]));
    const L = simulate(ctx, i, 1, cost), S = simulate(ctx, i, -1, cost);
    holdSum += (L.exitIdx - i) + (S.exitIdx - i); holdN += 2; costSum += L.costR;
    samples.push({
      i, x, regime: lv.regime.value,
      rLong: L.r, rShort: S.r, exitLong: L.exitIdx, exitShort: S.exitIdx, costR: L.costR,
      fwd: (ctx.pClose[Math.min(i + h, ctx.p.length - 1)] - ctx.pClose[i]) / ctx.pAtr[i],
    });
  }

  const split = Math.floor(samples.length * 0.7);
  const IS = samples.slice(0, split), OOS = samples.slice(split);
  const icFor = (set: BarSample[]) => Object.fromEntries(profile.layers.map(k =>
    [k, round(spearman(set.map(s => s.x[k] ?? 0), set.map(s => s.fwd)), 4)]));
  const ic = icFor(IS), icOOS = icFor(OOS);
  const learned = learnWeights(profile, ic, IS.length);
  const weights = learned.weights;

  // Threshold chosen in-sample only, then judged out-of-sample
  const isPre = report(ctx, IS, weights, null);
  const candidates = isPre.buckets.filter(b => b.trades >= 30 && b.avgR > 0.05).map(b => b.min);
  const chosen = candidates.length ? Math.min(...candidates) : null;

  const inSample = report(ctx, IS, weights, chosen);
  const outOfSample = report(ctx, OOS, weights, chosen);
  const outOfSampleDefaultWeights = report(ctx, OOS, profile.defaultWeights, chosen);

  const oosAbove = chosen != null ? outOfSample.buckets.filter(b => b.min >= chosen) : [];
  const oosTrades = oosAbove.reduce((s, b) => s + b.trades, 0);
  const oosAvg = oosTrades ? oosAbove.reduce((s, b) => s + b.avgR * b.trades, 0) / oosTrades : 0;
  const strat = outOfSample.strategy;
  // Must also have made money in-sample — otherwise a profitable OOS run is just market drift
  const isStrat = inSample.strategy;
  const stratOk = !!strat && strat.trades >= 30 && strat.totalR > 0 && !!isStrat && isStrat.totalR > 0;
  const holds = chosen != null && oosTrades >= 30 && oosAvg > 0 && stratOk;
  const recommendedMin = holds ? chosen : null;
  const costShare = round(costSum / Math.max(1, samples.length), 3);

  const verdict = !candidates.length
    ? `No score range showed a positive edge after costs, even in-sample. Costs average ${Math.round(costShare * 100)}% of risk per trade on this style. Treat this TDCI as context only — do not auto-trade on it.`
    : !holds
    ? `Scores ≥ ${chosen} looked positive in-sample but did not hold up out-of-sample (per-bar avg ${round(oosAvg, 2)}R; as a one-at-a-time strategy ${strat ? `${strat.trades} trades, ${strat.totalR}R` : "no trades"}). Likely noise — no threshold recommended.`
    : `Scores ≥ ${chosen} held up out-of-sample: ${strat!.trades} trades, ${strat!.totalR}R total after costs (max drawdown ${strat!.maxDrawdownR}R). Paper-trade it before risking money; edges this size can fade.`;

  const result: CalibrationResult = {
    symbol, style, interval: profile.interval, htf: profile.htf, generatedAt: new Date().toISOString(),
    layers: profile.layers,
    model: { stopAtr: profile.model.stopAtr, rr: profile.model.rr, maxHoldBars: maxHold, spreadPips, slippagePips, commissionPerLot },
    ic, icTStat: learned.tStat, icOutOfSample: icOOS, weightsLearned: learned.learned, weights,
    inSample, outOfSample, outOfSampleDefaultWeights,
    recommendedMin, verdict,
    avgHoldBars: round(holdSum / Math.max(1, holdN), 1),
    costShareOfRisk: costShare,
  };

  await db.insert(tdciCalibrations).values({ symbol, interval: style, weights, result });
  return result;
}

// ─── Background calibration jobs ──────────────────────────────────────────────
// Calibrations pull months of data through the rate-limited feed, so they run
// one at a time in the background; the UI polls the job status.

export interface JobItem { symbol: string; style: StyleKey; status: "queued" | "running" | "done" | "failed"; message?: string; recommendedMin?: number | null }
const job = { items: [] as JobItem[], running: false, startedAt: 0 as number, finishedAt: 0 as number };

export function jobStatus() {
  const done = job.items.filter(i => i.status === "done" || i.status === "failed").length;
  return { running: job.running, startedAt: job.startedAt || null, finishedAt: job.finishedAt || null, total: job.items.length, done, items: job.items };
}

export function enqueueCalibrations(pairs: { symbol: string; style: StyleKey }[]) {
  for (const p of pairs) {
    const existing = job.items.find(i => i.symbol === p.symbol && i.style === p.style && (i.status === "queued" || i.status === "running"));
    if (!existing) job.items.push({ ...p, status: "queued" });
  }
  if (!job.running) void runQueue();
  return jobStatus();
}

async function runQueue() {
  job.running = true;
  if (!job.startedAt || job.finishedAt) { job.startedAt = Date.now(); job.finishedAt = 0; }
  try {
    for (;;) {
      const next = job.items.find(i => i.status === "queued");
      if (!next) break;
      next.status = "running";
      try {
        const r = await calibrate(next.symbol, next.style, msg => { next.message = msg; });
        next.status = "done";
        next.recommendedMin = r.recommendedMin;
        next.message = r.recommendedMin != null ? `Edge found ≥ ${r.recommendedMin}` : "No proven edge";
      } catch (e: any) {
        next.status = "failed";
        next.message = e.message;
        console.warn(`[TDCI] Calibration ${next.symbol} ${next.style} failed: ${e.message}`);
      }
    }
  } finally {
    job.running = false;
    job.finishedAt = Date.now();
    // Keep the finished list for the UI, but cap its size
    if (job.items.length > 200) job.items = job.items.slice(-200);
  }
}

function round(v: number, dp = 3) { const m = 10 ** dp; return Math.round(v * m) / m; }
