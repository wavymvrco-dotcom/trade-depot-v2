// ─── Trade Depot Confluence Index (TDCI) ──────────────────────────────────────
// A 7-layer, 0–100 conviction score combining higher-timeframe trend, momentum,
// ICT market structure, liquidity sweeps, premium/discount value, CFTC
// institutional positioning, and volatility/session regime.
//
// Six layers are directional (−1 bearish … +1 bullish). The seventh (regime) is
// a 0–1 quality multiplier. Every value at bar i uses only data available at
// the close of bar i, so the same function powers live scores and backtests.

import { ema, rsi, atr, type Candle } from "./indicators";
import { cotAt, type CotPoint } from "./cot";

export const DIRECTIONAL_LAYERS = ["trend", "momentum", "structure", "liquidity", "value", "positioning"] as const;
export type LayerKey = typeof DIRECTIONAL_LAYERS[number];
export type Weights = Record<LayerKey, number>;

/** Starting weights before calibration — a reasoned prior, replaced by learned weights per symbol. */
export const DEFAULT_WEIGHTS: Weights = {
  trend: 0.25, momentum: 0.15, structure: 0.20, liquidity: 0.10, value: 0.10, positioning: 0.20,
};

export interface LayerResult {
  key: LayerKey | "regime";
  label: string;
  value: number;      // −1..1 for directional layers; 0..1 for regime
  weight: number;     // weight used in the composite (0 for regime)
  detail: string;     // plain-English explanation with the numbers behind it
}

export interface TdciResult {
  time: string;
  score: number;                 // 0–100 conviction
  direction: "LONG" | "SHORT" | "NEUTRAL";
  composite: number;             // signed weighted mean of directional layers, −1..1
  regime: number;                // 0..1 quality multiplier
  agreement: number;             // share of active layers that agree with the direction
  layers: LayerResult[];
  atr: number;
  close: number;
}

const INTERVAL_MS: Record<string, number> = { "15min": 900e3, "1h": 3600e3, "4h": 14400e3, "1day": 86400e3 };
const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const t = (s: string) => Date.parse(s.replace(" ", "T") + (s.length <= 10 ? "T00:00:00Z" : "Z"));

// ─── Precomputation ───────────────────────────────────────────────────────────

export interface TdciContext {
  symbol: string;
  interval: string;
  p: Candle[];          // trading timeframe
  d: Candle[];          // daily (higher timeframe)
  pClose: number[];
  pAtr: number[];
  pAtrAvg: number[];
  pRsi: number[];
  macdHist: number[];
  dEma20: number[];
  dEma50: number[];
  dAtr: number[];
  dIdx: number[];       // for each p bar: last daily bar fully closed by p bar's close
  swingHigh: boolean[];
  swingLow: boolean[];
  cotBase: CotPoint[];
  cotQuote: CotPoint[];
  barMs: number;
}

const SWING_WING = 3;

export function prepare(symbol: string, interval: string, p: Candle[], d: Candle[], cot: { base: CotPoint[]; quote: CotPoint[] }): TdciContext {
  const barMs = INTERVAL_MS[interval] ?? 3600e3;
  const pClose = p.map(c => c.close);
  const pAtr = atr(p, 14);
  const pAtrAvg = pAtr.map((_, i) => {
    const w = pAtr.slice(Math.max(0, i - 99), i + 1).filter(Number.isFinite);
    return w.length >= 20 ? w.reduce((s, v) => s + v, 0) / w.length : NaN;
  });
  const e12 = ema(pClose, 12), e26 = ema(pClose, 26);
  const macd = pClose.map((_, i) => e12[i] - e26[i]);
  const firstMacd = macd.findIndex(Number.isFinite);
  const sig = new Array<number>(macd.length).fill(NaN);
  if (firstMacd >= 0) {
    const s = ema(macd.slice(firstMacd), 9);
    s.forEach((v, k) => { sig[firstMacd + k] = v; });
  }
  const macdHist = macd.map((m, i) => m - sig[i]);

  const dClose = d.map(c => c.close);
  const dIdx: number[] = [];
  let j = -1;
  for (let i = 0; i < p.length; i++) {
    const pCloseTime = t(p[i].time) + barMs;
    while (j + 1 < d.length && t(d[j + 1].time) + 86400e3 <= pCloseTime) j++;
    dIdx.push(j);
  }

  // Swing points; a swing at k is only "known" from bar k + SWING_WING onward
  const swingHigh = p.map((c, k) => k >= SWING_WING && k + SWING_WING < p.length &&
    p.slice(k - SWING_WING, k + SWING_WING + 1).every(x => x.high <= c.high));
  const swingLow = p.map((c, k) => k >= SWING_WING && k + SWING_WING < p.length &&
    p.slice(k - SWING_WING, k + SWING_WING + 1).every(x => x.low >= c.low));

  return {
    symbol, interval, p, d, pClose, pAtr, pAtrAvg, pRsi: rsi(pClose, 14), macdHist,
    dEma20: ema(dClose, 20), dEma50: ema(dClose, 50), dAtr: atr(d, 14), dIdx,
    swingHigh, swingLow, cotBase: cot.base, cotQuote: cot.quote, barMs,
  };
}

/** First bar index where every layer has enough history. */
export function warmup(ctx: TdciContext): number {
  for (let i = 0; i < ctx.p.length; i++) {
    const j = ctx.dIdx[i];
    if (j >= 55 && i >= 120 && Number.isFinite(ctx.pAtrAvg[i]) && Number.isFinite(ctx.macdHist[i]) && Number.isFinite(ctx.dAtr[j])) return i;
  }
  return ctx.p.length;
}

// ─── Layers ───────────────────────────────────────────────────────────────────

function trendLayer(ctx: TdciContext, i: number) {
  const j = ctx.dIdx[i];
  const e20 = ctx.dEma20[j], e50 = ctx.dEma50[j], a = ctx.dAtr[j], e20prev = ctx.dEma20[j - 5];
  const sep = clamp((e20 - e50) / (0.5 * a));
  const slope = clamp((e20 - e20prev) / (0.5 * a));
  const pos = Math.tanh((ctx.pClose[i] - e50) / a);
  const value = clamp(0.45 * sep + 0.35 * slope + 0.2 * pos);
  const dir = value > 0.15 ? "up" : value < -0.15 ? "down" : "flat";
  return { value, detail: `Daily trend ${dir}: EMA20 ${e20 > e50 ? "above" : "below"} EMA50 by ${((e20 - e50) / a).toFixed(2)}×ATR, 5-day slope ${((e20 - e20prev) / a).toFixed(2)}×ATR.` };
}

function momentumLayer(ctx: TdciContext, i: number) {
  const a = ctx.pAtr[i];
  const r = ctx.pRsi[i];
  const rsiTerm = clamp((r - 50) / 25);
  const macdTerm = Math.tanh(ctx.macdHist[i] / (0.2 * a));
  const roc = ctx.pClose[i] - ctx.pClose[i - 10];
  const rocTerm = Math.tanh(roc / (2 * a));
  const value = clamp(0.4 * rsiTerm + 0.3 * macdTerm + 0.3 * rocTerm);
  return { value, detail: `RSI ${r.toFixed(1)}, MACD histogram ${ctx.macdHist[i] >= 0 ? "positive" : "negative"}, 10-bar move ${(roc / a).toFixed(2)}×ATR.` };
}

function recentSwings(ctx: TdciContext, i: number, lookback = 150) {
  const highs: { k: number; v: number }[] = [], lows: { k: number; v: number }[] = [];
  for (let k = i - SWING_WING; k >= Math.max(0, i - lookback) && (highs.length < 3 || lows.length < 3); k--) {
    if (ctx.swingHigh[k] && highs.length < 3) highs.push({ k, v: ctx.p[k].high });
    if (ctx.swingLow[k] && lows.length < 3) lows.push({ k, v: ctx.p[k].low });
  }
  return { highs, lows };
}

function structureLayer(ctx: TdciContext, i: number) {
  const { highs, lows } = recentSwings(ctx, i);
  if (highs.length < 2 || lows.length < 2) return { value: 0, detail: "Not enough confirmed swings yet." };
  const hh = highs[0].v > highs[1].v, hl = lows[0].v > lows[1].v;
  const structure = hh && hl ? 1 : !hh && !hl ? -1 : 0;
  const c = ctx.pClose[i];
  // Break of structure: close beyond the most recent confirmed swing
  let brk = 0, label = "no break";
  if (c > highs[0].v) { brk = 1; label = structure < 0 ? "bullish CHoCH (break against the downtrend)" : "bullish BOS"; }
  else if (c < lows[0].v) { brk = -1; label = structure > 0 ? "bearish CHoCH (break against the uptrend)" : "bearish BOS"; }
  const value = clamp(0.55 * structure + 0.45 * brk);
  const s = structure > 0 ? "higher highs & higher lows" : structure < 0 ? "lower highs & lower lows" : "mixed swings";
  return { value, detail: `${s}; ${label}.` };
}

function liquidityLayer(ctx: TdciContext, i: number) {
  const { highs, lows } = recentSwings(ctx, i, 60);
  const a = ctx.pAtr[i];
  let value = 0, detail = "No liquidity sweep in the last 3 bars.";
  for (let back = 0; back < 3 && value === 0; back++) {
    const b = ctx.p[i - back];
    const decay = 1 - back * 0.3;
    const prevHigh = highs.find(h => h.k < i - back);
    const prevLow = lows.find(l => l.k < i - back);
    if (prevHigh && b.high > prevHigh.v + 0.1 * a && b.close < prevHigh.v) {
      value = -clamp((b.high - prevHigh.v) / a + 0.5, 0, 1) * decay;
      detail = `Buy-side liquidity swept ${back === 0 ? "this bar" : `${back} bar(s) ago`}: wick above ${prevHigh.v} closed back below — bearish.`;
    } else if (prevLow && b.low < prevLow.v - 0.1 * a && b.close > prevLow.v) {
      value = clamp((prevLow.v - b.low) / a + 0.5, 0, 1) * decay;
      detail = `Sell-side liquidity swept ${back === 0 ? "this bar" : `${back} bar(s) ago`}: wick below ${prevLow.v} closed back above — bullish.`;
    }
  }
  return { value, detail };
}

function valueLayer(ctx: TdciContext, i: number) {
  const win = ctx.p.slice(Math.max(0, i - 49), i + 1);
  const hi = Math.max(...win.map(c => c.high)), lo = Math.min(...win.map(c => c.low));
  const c = ctx.pClose[i], a = ctx.pAtr[i];
  const pos = hi > lo ? (c - lo) / (hi - lo) : 0.5;
  const pd = clamp((0.5 - pos) * 2); // discount → long bias, premium → short bias

  // Nearest unfilled fair value gap within 20 bars, close enough to act as support/resistance
  let fvg = 0, fvgText = "no nearby unfilled FVG";
  for (let k = i - 1; k >= Math.max(2, i - 20); k--) {
    const bullGap = ctx.p[k].low > ctx.p[k - 2].high;
    const bearGap = ctx.p[k].high < ctx.p[k - 2].low;
    if (!bullGap && !bearGap) continue;
    const later = ctx.p.slice(k + 1, i + 1);
    if (bullGap) {
      const bottom = ctx.p[k - 2].high;
      const filled = later.some(x => x.low <= bottom);
      if (!filled && c - ctx.p[k].low <= 0.75 * a) { fvg = 1; fvgText = `price above an unfilled bullish FVG (${bottom}–${ctx.p[k].low})`; break; }
    } else {
      const top = ctx.p[k - 2].low;
      const filled = later.some(x => x.high >= top);
      if (!filled && ctx.p[k].high - c <= 0.75 * a) { fvg = -1; fvgText = `price below an unfilled bearish FVG (${ctx.p[k].high}–${top})`; break; }
    }
  }
  const value = clamp(0.6 * pd + 0.4 * fvg);
  const zone = pos < 0.4 ? "discount" : pos > 0.6 ? "premium" : "equilibrium";
  return { value, detail: `In ${zone} (${Math.round(pos * 100)}% of the 50-bar range); ${fvgText}.` };
}

function positioningLayer(ctx: TdciContext, i: number) {
  const now = t(ctx.p[i].time) + ctx.barMs;
  const b = cotAt(ctx.cotBase, now), q = cotAt(ctx.cotQuote, now);
  const [bn, qn] = [ctx.symbol.slice(0, 3), ctx.symbol.slice(3, 6)];
  if (!b && !q) return { value: 0, detail: "No CFTC positioning data available." };
  const value = clamp(((b?.score ?? 0) - (q?.score ?? 0)) / 1.5);
  const fmt = (n: string, x: CotPoint | null) => x ? `${n} specs ${x.netPct >= 0 ? "net long" : "net short"} ${(Math.abs(x.netPct) * 100).toFixed(0)}% of OI (z ${x.z.toFixed(1)}, 4w ${x.change4w >= 0 ? "+" : ""}${(x.change4w * 100).toFixed(1)}pp)` : `${n} n/a`;
  return { value, detail: `${fmt(bn, b)}; ${fmt(qn, q)}. Week of ${(b ?? q)!.reportDate}.` };
}

function regimeLayer(ctx: TdciContext, i: number) {
  const ratio = ctx.pAtr[i] / ctx.pAtrAvg[i];
  // Moves need room but not chaos: dead markets and news spikes both hurt follow-through
  const vol = ratio < 0.5 ? 0.4 : ratio < 0.7 ? 0.4 + (ratio - 0.5) * 3 : ratio <= 1.6 ? 1 : ratio <= 2.2 ? 1 - (ratio - 1.6) * (0.5 / 0.6) : 0.5;
  const hour = new Date(t(ctx.p[i].time) + ctx.barMs).getUTCHours();
  const asiaPair = /JPY|AUD|NZD/.test(ctx.symbol);
  const session = ctx.barMs >= 4 * 3600e3
    ? 1 // a 4h+ bar spans sessions
    : (hour >= 7 && hour < 21) ? 1 : asiaPair ? 0.9 : 0.75;
  const value = clamp(vol * (0.7 + 0.3 * session), 0, 1);
  const label = ratio < 0.7 ? "quiet" : ratio > 1.6 ? "volatile" : "normal";
  return { value, detail: `Volatility ${label} (ATR ${ratio.toFixed(2)}× its 100-bar average)${ctx.barMs < 4 * 3600e3 ? `, ${session === 1 ? "London/NY" : "off-peak"} session` : ""}.` };
}

const LABELS: Record<LayerKey | "regime", string> = {
  trend: "HTF Trend", momentum: "Momentum", structure: "Market Structure",
  liquidity: "Liquidity Sweep", value: "Premium / Discount & FVG",
  positioning: "Institutional Positioning", regime: "Regime & Session",
};

/** Raw layer values at bar i (no weights applied). */
export function layerValues(ctx: TdciContext, i: number) {
  return {
    trend: trendLayer(ctx, i),
    momentum: momentumLayer(ctx, i),
    structure: structureLayer(ctx, i),
    liquidity: liquidityLayer(ctx, i),
    value: valueLayer(ctx, i),
    positioning: positioningLayer(ctx, i),
    regime: regimeLayer(ctx, i),
  };
}

/**
 * Combine layer values into a score. Kept separate so calibration can re-weight
 * cheaply. A negative weight means calibration found the layer works contrarian
 * on that market/timeframe (e.g. short-horizon mean reversion).
 */
export function combine(x: Record<LayerKey, number>, regime: number, weights: Weights) {
  const totalW = DIRECTIONAL_LAYERS.reduce((s, k) => s + Math.abs(weights[k]), 0) || 1;
  const contrib = DIRECTIONAL_LAYERS.map(k => weights[k] * x[k]);
  const composite = contrib.reduce((s, v) => s + v, 0) / totalW;
  const dirSign = Math.sign(composite);
  const active = contrib.filter((c, idx) => weights[DIRECTIONAL_LAYERS[idx]] !== 0 && Math.abs(x[DIRECTIONAL_LAYERS[idx]]) > 0.1);
  const agreement = active.length ? active.filter(c => Math.sign(c) === dirSign).length / active.length : 0;
  // |composite| of ~0.6 is already strong agreement across layers; map it to the top of the scale
  const score = Math.round(100 * clamp(Math.abs(composite) / 0.6, 0, 1) * regime);
  const direction: TdciResult["direction"] = score < 10 ? "NEUTRAL" : dirSign > 0 ? "LONG" : "SHORT";
  return { composite, score, direction, agreement };
}

export function computeAt(ctx: TdciContext, i: number, weights: Weights = DEFAULT_WEIGHTS): TdciResult {
  const lv = layerValues(ctx, i);
  const x = Object.fromEntries(DIRECTIONAL_LAYERS.map(k => [k, lv[k].value])) as Record<LayerKey, number>;
  const c = combine(x, lv.regime.value, weights);
  const layers: LayerResult[] = [
    ...DIRECTIONAL_LAYERS.map(k => ({ key: k, label: LABELS[k], value: round(lv[k].value), weight: round(weights[k]), detail: lv[k].detail })),
    { key: "regime", label: LABELS.regime, value: round(lv.regime.value), weight: 0, detail: lv.regime.detail },
  ];
  return {
    time: ctx.p[i].time, score: c.score, direction: c.direction, composite: round(c.composite),
    regime: round(lv.regime.value), agreement: round(c.agreement), layers,
    atr: ctx.pAtr[i], close: ctx.pClose[i],
  };
}

/** Index of the last fully closed bar (the newest candle is usually still forming). */
export function lastClosedIndex(ctx: TdciContext, now = Date.now()): number {
  const n = ctx.p.length - 1;
  return t(ctx.p[n].time) + ctx.barMs <= now ? n : n - 1;
}

function round(v: number) { return Math.round(v * 1000) / 1000; }
