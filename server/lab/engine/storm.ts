// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Storm Mode (§11.5): synthetic crisis markets. PASS/FAIL ONLY — a finished
// champion is run through them after its Vault Exam; nothing here ever feeds
// selection, fitness or weights (invariant 6). All generators are seeded.
//
//   1. stationary block bootstrap (Politis & Romano, 1994) of whole candles
//   2. regime-switching volatility (2-state Markov chain, stressed = 3× calm)
//   3. gaps of 3–15 ATR at random bars, including one-way gaps through stops
//   4. spread blowouts (× 5–20 for 1–6 hours), applied as cost multipliers

import type { Candle } from "../../indicators";
import type { Rng } from "./rng";

export type StormKind = "bootstrap" | "regime" | "gaps" | "spread";
export const STORM_KINDS: StormKind[] = ["bootstrap", "regime", "gaps", "spread"];

/** A candle's shape relative to its open: log return to close, and high/low excursions. */
interface Shape { ret: number; up: number; down: number }
const shapeOf = (c: Candle): Shape => ({ ret: Math.log(c.close / c.open), up: Math.log(c.high / c.open), down: Math.log(c.open / c.low) });

/** Rebuild a candle path from shapes, starting at `start`, keeping the original timestamps. */
function rebuild(times: string[], shapes: Shape[], start: number): Candle[] {
  let px = start;
  return shapes.map((s, i) => {
    const open = px, close = open * Math.exp(s.ret);
    const high = Math.max(open, close, open * Math.exp(s.up)), low = Math.min(open, close, open * Math.exp(-s.down));
    px = close;
    return { time: times[i], open, high, low, close };
  });
}

/** 1. Stationary block bootstrap of whole candle shapes; mean block length ≈ one day of bars. */
export function blockBootstrap(p: Candle[], barsPerDay: number, r: Rng): Candle[] {
  const shapes = p.map(shapeOf), n = shapes.length, pStop = 1 / Math.max(2, barsPerDay);
  const out: Shape[] = [];
  let k = r.int(0, n);
  while (out.length < n) {
    out.push(shapes[k]);
    k = r.next() < pStop ? r.int(0, n) : (k + 1) % n;
  }
  return rebuild(p.map(c => c.time), out, p[0].open);
}

/** 2. Regime switching: calm ↔ stressed (3× volatility) with sticky Markov transitions. */
export function regimeSwitch(p: Candle[], r: Rng, stayCalm = 0.995, stayStressed = 0.98): Candle[] {
  let stressed = false;
  const shapes = p.map(c => {
    stressed = stressed ? r.next() < stayStressed : r.next() > stayCalm;
    const s = shapeOf(c), m = stressed ? 3 : 1;
    return { ret: s.ret * m, up: s.up * m, down: s.down * m };
  });
  return rebuild(p.map(c => c.time), shapes, p[0].open);
}

/** 3. Gaps of 3–15 ATR at random bars; a third are one-way (no recovery within the bar). */
export function injectGaps(p: Candle[], atr: ArrayLike<number>, r: Rng, perThousand = 3): Candle[] {
  const out = p.map(c => ({ ...c }));
  let shift = 0;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    c.open += shift; c.high += shift; c.low += shift; c.close += shift;
    if (i > 0 && r.next() < perThousand / 1000) {
      const a = atr[Math.max(0, i - 1)] || Math.abs(c.high - c.low) || c.open * 0.002;
      const g = (r.next() < 0.5 ? -1 : 1) * r.uniform(3, 15) * a;
      c.open += g; c.high += g; c.low += g; c.close += g;
      if (r.next() < 1 / 3) { if (g < 0) c.high = Math.max(c.open, c.close); else c.low = Math.min(c.open, c.close); } // one-way
      shift += g;
    }
    c.high = Math.max(c.high, c.open, c.close); c.low = Math.min(c.low, c.open, c.close);
    if (c.low <= 0) { const k = c.open * 0.5; c.low = Math.min(c.open, c.close) - Math.min(k, Math.abs(c.low)); }
  }
  return out;
}

/** 4. Spread blowouts: per-bar cost multipliers (× 5–20 for 1–6 hours, a few times). */
export function spreadBlowouts(n: number, barMs: number, r: Rng, events = 6): Float32Array {
  const m = new Float32Array(n).fill(1);
  for (let e = 0; e < events; e++) {
    const start = r.int(0, n), len = Math.max(1, Math.round((r.uniform(1, 6) * 3_600_000) / barMs)), x = r.uniform(5, 20);
    for (let i = start; i < Math.min(n, start + len); i++) m[i] = Math.max(m[i], x);
  }
  return m;
}

/** Aggregate primary bars into higher-timeframe bars aligned to `htfMs` (for recomputing HTF layers). */
export function aggregate(p: Candle[], barMs: number, htfMs: number, parse: (t: string) => number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null, curKey = -1;
  for (const c of p) {
    const key = Math.floor(parse(c.time) / htfMs);
    if (key !== curKey) {
      if (cur) out.push(cur);
      cur = { time: new Date(key * htfMs).toISOString().slice(0, 19).replace("T", " "), open: c.open, high: c.high, low: c.low, close: c.close };
      curKey = key;
    } else if (cur) { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; }
  }
  if (cur) out.push(cur);
  return out.map(c => (htfMs >= 86_400_000 ? { ...c, time: c.time.slice(0, 10) } : c));
}

export interface StormVerdict {
  worlds: number; survived: number; survivalRate: number; passed: boolean;
  limitR: number; worstDrawdownR: number; byKind: Record<StormKind, { worlds: number; survived: number }>;
}

/** Pass/fail: the champion survives if its drawdown stays under the limit in ≥ 95% of storm worlds. */
export function stormVerdict(results: { kind: StormKind; maxDD: number }[], limitR: number): StormVerdict {
  const byKind = Object.fromEntries(STORM_KINDS.map(k => [k, { worlds: 0, survived: 0 }])) as StormVerdict["byKind"];
  let survived = 0, worst = 0;
  for (const x of results) {
    byKind[x.kind].worlds++;
    worst = Math.max(worst, x.maxDD);
    if (x.maxDD <= limitR) { survived++; byKind[x.kind].survived++; }
  }
  const rate = results.length ? survived / results.length : 0;
  return { worlds: results.length, survived, survivalRate: rate, passed: rate >= 0.95, limitR, worstDrawdownR: worst, byKind };
}

// ─── Running a finished champion through storm worlds ─────────────────────────

import { prepare, parseTime, type Profile } from "../../tdci";
import { toWeekly } from "../../indicators";
import type { CotPoint } from "../../cot";
import type { RatePoint } from "../../rates";
import { buildEnvData, makeEnv } from "./env";
import { runGenome } from "./episode";
import { maxDrawdown } from "./stats";
import { withForgeLayers } from "./forge/accept";
import type { Node } from "./forge/dsl";
import type { Genome, BlueprintSpec } from "./types";
import type { TradeCost } from "./outcomes";
import { rng as makeRng } from "./rng";

export interface StormMarket {
  symbol: string;
  p: Candle[];                     // recent real primary bars (the storm worlds are built from these)
  atr: ArrayLike<number>;
  cot?: { base: CotPoint[]; quote: CotPoint[] };
  rates?: { base: RatePoint[]; quote: RatePoint[] };
  spread: number;
  cost: TradeCost;
}

/**
 * Build `worlds` storm worlds (cycling through the four kinds and the markets),
 * recompute TDCI layers on each (COT/rates keep their real values), run the
 * champion over the whole synthetic span and report its drawdowns.
 */
export function runStorm(args: {
  markets: StormMarket[]; profile: Profile; champion: Genome; spec: BlueprintSpec;
  forgeLayers?: { id: string; node: Node }[]; worlds: number; seed: number; limitR: number;
}): StormVerdict {
  const r = makeRng(args.seed);
  const barMs = { "5min": 300e3, "15min": 900e3, "4h": 14400e3, "1day": 86400e3 }[args.profile.interval]!;
  const htfMs = { "1h": 3600e3, "4h": 14400e3, "1day": 86400e3, "1week": 604800e3 }[args.profile.htf]!;
  const results: { kind: StormKind; maxDD: number }[] = [];
  for (let w = 0; w < args.worlds; w++) {
    const kind = STORM_KINDS[w % STORM_KINDS.length];
    const m = args.markets[Math.floor(w / STORM_KINDS.length) % args.markets.length];
    const wr = r.fork();
    const barsPerDay = Math.round(86_400_000 / barMs);
    const p = kind === "bootstrap" ? blockBootstrap(m.p, barsPerDay, wr)
      : kind === "regime" ? regimeSwitch(m.p, wr)
      : kind === "gaps" ? injectGaps(m.p, m.atr, wr)
      : m.p;
    const h = args.profile.htf === "1week" ? toWeekly(p) : aggregate(p, barMs, htfMs, parseTime);
    const ctx = prepare(m.symbol, args.profile, p, h, { cot: m.cot, rates: m.rates, spread: m.spread });
    const env = makeEnv(withForgeLayers(buildEnvData(ctx, m.cost), args.forgeLayers ?? []));
    if (env.L !== args.champion.w.length || env.n < 50) continue;
    const costRows = kind === "spread" ? spreadBlowouts(env.n, barMs, wr) : null;
    const trades = runGenome(env, args.champion, { from: 0, to: env.n, limit: env.n + 1, costMult: 1, costRows, constraints: args.spec.constraints }).trades;
    results.push({ kind, maxDD: maxDrawdown(trades.map(t => t.r)) });
  }
  return stormVerdict(results, args.limitR);
}
