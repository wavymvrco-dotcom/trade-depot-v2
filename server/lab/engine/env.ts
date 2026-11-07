// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Environments (§5.4). Layer values depend only on market data, never on the
// agent, so they are computed once per (symbol, style) into a flat matrix.
// Trade outcomes depend only on (stop, target, max hold), so they are cached
// per grid point. Evaluating an agent is then a dot product per bar plus a lookup.

import { layerValues, warmup, parseTime, type LayerKey, type StyleKey, type TdciContext } from "../../tdci";
import type { Candle } from "../../indicators";
import { simulateTrade, closeAtBarR, type TradeCost } from "./outcomes";
import { STOP_GRID, RR_GRID } from "./types";

export const TAG = { calm: 0, normal: 1, trend: 2, volatile: 3 } as const;
export const TAG_NAMES = ["calm", "normal", "trend", "volatile"] as const;
const WEEK_MS = 7 * 86400_000;
/** FX week boundary: Friday 21:00 UTC (1970-01-02 was a Friday). */
const WEEK_REF = Date.UTC(1970, 0, 2, 21);

/** Plain, serializable environment data (what the shared env cache stores). */
export interface EnvData {
  symbol: string;
  style: StyleKey;
  layers: LayerKey[];
  maxHold: number;
  barMs: number;
  cost: TradeCost;
  /** Candles from the first scorable bar to the end; row r scores candle r and enters at candle r+1. */
  candles: Candle[];
  atr: Float64Array;       // ATR at each candle
  X: Float32Array;         // rows × layers, row-major; Float32 always, so cached and fresh envs match exactly
  g: Float32Array;         // regime multiplier per row
  tag: Uint8Array;         // curriculum regime tag per row
  closeHour: Uint8Array;   // UTC hour at which the signal bar closes
  /** Higher-timeframe bars and, per candle, the last HTF bar closed by that candle's close (−1 if none). For Forge layers. */
  h?: Candle[];
  hIdx?: Int32Array;
  htfMs?: number;
  /** Bars ahead for the information-coefficient test (profile icHorizon). */
  icHorizon?: number;
}

export interface OutcomeGrid {
  rLong: Float64Array; rShort: Float64Array;
  exitLong: Int32Array; exitShort: Int32Array;
  costR: Float64Array;
}

export interface Env extends EnvData {
  /** Number of scorable rows (signals); candles.length − 1. */
  n: number;
  L: number;
  outcomes(stopIdx: number, rrIdx: number): OutcomeGrid;
  /** R when a rule closes the position at the close of row k. */
  forcedExitR(row: number, side: 1 | -1, k: number, stopIdx: number): number;
  /** FX trading-week index of a row's candle open time and close time. */
  weekOfOpen(row: number): number;
  weekOfClose(row: number): number;
  timeMs(row: number): number;
}

/** Curriculum / Playbook regime of bar i: volatile, trend, calm or normal (§9.4). Shared by backtests and live. */
export function regimeTagAt(ctx: TdciContext, i: number): number {
  const ratio = ctx.pAtr[i] / ctx.pAtrAvg[i], adx = ctx.adx.adx[i];
  return ratio > 1.6 ? TAG.volatile : adx >= 25 ? TAG.trend : ratio < 0.8 && adx < 20 ? TAG.calm : TAG.normal;
}

/** Compute layer values for every bar once. Uses only data available at each bar's close. */
export function buildEnvData(ctx: TdciContext, cost: TradeCost): EnvData {
  const start = warmup(ctx);
  const layers = ctx.profile.layers;
  const L = layers.length;
  const candles = ctx.p.slice(start);
  const rows = Math.max(0, candles.length - 1);
  const X = new Float32Array(rows * L), g = new Float32Array(rows), tag = new Uint8Array(rows), closeHour = new Uint8Array(rows);
  for (let r = 0; r < rows; r++) {
    const i = start + r;
    const lv = layerValues(ctx, i);
    for (let j = 0; j < L; j++) X[r * L + j] = lv.layers[layers[j]].value;
    g[r] = lv.regime.value;
    tag[r] = regimeTagAt(ctx, i);
    closeHour[r] = new Date(parseTime(ctx.p[i].time) + ctx.barMs).getUTCHours();
  }
  return {
    symbol: ctx.symbol, style: ctx.profile.key, layers, maxHold: ctx.profile.model.maxHold, barMs: ctx.barMs, cost,
    candles, atr: Float64Array.from(ctx.pAtr.slice(start)), X, g, tag, closeHour,
    h: ctx.h, hIdx: Int32Array.from(ctx.hIdx.slice(start)), htfMs: ctx.htfMs, icHorizon: ctx.profile.model.icHorizon,
  };
}

/** Same data cut at candle `end` (exclusive). Used to hand training code an env with no vault bars in it. */
export function sliceEnvData(d: EnvData, end: number): EnvData {
  const rows = Math.max(0, end - 1), L = d.layers.length;
  return {
    ...d,
    candles: d.candles.slice(0, end), atr: d.atr.slice(0, end),
    X: d.X.slice(0, rows * L), g: d.g.slice(0, rows), tag: d.tag.slice(0, rows), closeHour: d.closeHour.slice(0, rows),
    hIdx: d.hIdx?.slice(0, end),
  };
}

export function makeEnv(d: EnvData): Env {
  const n = Math.max(0, d.candles.length - 1), L = d.layers.length;
  const cache = new Map<number, OutcomeGrid>();
  const ms = d.candles.map(c => parseTime(c.time));
  const env: Env = {
    ...d, n, L,
    outcomes(stopIdx, rrIdx) {
      const key = stopIdx * 16 + rrIdx;
      let o = cache.get(key);
      if (o) return o;
      const model = { stopAtr: STOP_GRID[stopIdx], rr: RR_GRID[rrIdx], maxHold: d.maxHold };
      o = {
        rLong: new Float64Array(n), rShort: new Float64Array(n),
        exitLong: new Int32Array(n), exitShort: new Int32Array(n), costR: new Float64Array(n),
      };
      for (let r = 0; r < n; r++) {
        const a = d.atr[r];
        if (!(a > 0)) { o.exitLong[r] = o.exitShort[r] = r; continue; }
        const L1 = simulateTrade(d.candles, a, d.symbol, r, 1, model, d.cost);
        const S1 = simulateTrade(d.candles, a, d.symbol, r, -1, model, d.cost);
        o.rLong[r] = L1.r; o.rShort[r] = S1.r; o.exitLong[r] = L1.exitIdx; o.exitShort[r] = S1.exitIdx; o.costR[r] = L1.costR;
      }
      cache.set(key, o);
      return o;
    },
    forcedExitR: (row, side, k, stopIdx) => closeAtBarR(d.candles, d.atr[row], d.symbol, row, side, k, STOP_GRID[stopIdx], d.cost),
    weekOfOpen: row => Math.floor((ms[row] - WEEK_REF) / WEEK_MS),
    weekOfClose: row => Math.floor((ms[row] + d.barMs - 1 - WEEK_REF) / WEEK_MS),
    timeMs: row => ms[row],
  };
  return env;
}

/** Profile default stop/target snapped to the grid (used for the baseline and Gen Zero). */
export function nearestGrid(stopAtr: number, rr: number) {
  const near = (grid: readonly number[], v: number) => grid.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(grid[best] - v) ? i : best), 0);
  return { stopIdx: near(STOP_GRID, stopAtr), rrIdx: near(RR_GRID, rr) };
}
