// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Rewind (§10.3): replay the user's real trades on real candles with one change
// at a time, and fit a genome to the user's own entry decisions.
//
// No cherry-picking: every change is applied to ALL trades, and the aggregate
// effect is what is reported — not just the trades it would have helped.

import type { Candle } from "../../indicators";

export interface RealTrade {
  id: string;
  side: 1 | -1;
  entryIdx: number;          // bar during which the position was opened
  exitIdx: number;           // bar during which it was closed
  entryPrice: number;
  exitPrice: number;
  stopPrice: number | null;
  /** Money made per 1.0 price move for this position's size (so variants can be priced in money). */
  valuePerPoint: number;
  profit: number;            // what actually happened, in account currency
  /** TDCI score (default weights) at the bar before entry, if known. */
  scoreAtEntry: number | null;
}

export type MutationKey =
  | "enter_minus2" | "enter_minus1" | "enter_plus1" | "enter_plus2"
  | "stop_1atr" | "stop_1_5atr" | "stop_2atr"
  | "half_size" | "double_size" | "skip_low_tdci";

export const MUTATIONS: { key: MutationKey; label: string }[] = [
  { key: "enter_minus2", label: "Enter 2 bars earlier" },
  { key: "enter_minus1", label: "Enter 1 bar earlier" },
  { key: "enter_plus1", label: "Enter 1 bar later" },
  { key: "enter_plus2", label: "Enter 2 bars later" },
  { key: "stop_1atr", label: "Stop at 1 ATR" },
  { key: "stop_1_5atr", label: "Stop at 1.5 ATR" },
  { key: "stop_2atr", label: "Stop at 2 ATR" },
  { key: "half_size", label: "Half the size" },
  { key: "double_size", label: "Double the size" },
  { key: "skip_low_tdci", label: "Skip trades below your TDCI threshold" },
];

/** Profit of one trade under one change; the user's own exit time and price are kept unless a stop cuts it short. */
export function rewindTrade(p: readonly Candle[], atr: ArrayLike<number>, t: RealTrade, m: MutationKey, tdciThreshold: number, spread = 0): number {
  const pnl = (entry: number, exit: number) => t.side * (exit - entry) * t.valuePerPoint;
  const shifted = (k: number) => {
    const i = t.entryIdx + k;
    if (i < 0 || i >= p.length || i > t.exitIdx) return t.profit; // can't enter after the exit: unchanged
    const entry = p[i].open + (t.side > 0 ? spread / 2 : -spread / 2);
    return pnl(entry, t.exitPrice);
  };
  const withStop = (atrMult: number) => {
    const a = atr[Math.max(0, t.entryIdx - 1)];
    if (!(a > 0)) return t.profit;
    const sl = t.entryPrice - t.side * atrMult * a;
    for (let j = t.entryIdx; j <= t.exitIdx && j < p.length; j++) {
      const hit = t.side > 0 ? p[j].low <= sl : p[j].high >= sl;
      if (hit) return pnl(t.entryPrice, sl);
    }
    return t.profit;
  };
  switch (m) {
    case "enter_minus2": return shifted(-2);
    case "enter_minus1": return shifted(-1);
    case "enter_plus1": return shifted(1);
    case "enter_plus2": return shifted(2);
    case "stop_1atr": return withStop(1);
    case "stop_1_5atr": return withStop(1.5);
    case "stop_2atr": return withStop(2);
    case "half_size": return t.profit / 2;
    case "double_size": return t.profit * 2;
    case "skip_low_tdci": return t.scoreAtEntry != null && t.scoreAtEntry < tdciThreshold ? 0 : t.profit;
  }
}

export interface RewindReport {
  trades: number;
  actualTotal: number;
  mutations: { key: MutationKey; label: string; total: number; delta: number; helped: number; hurt: number }[];
  best: { key: MutationKey; label: string; delta: number } | null;
  worst10: { id: string; actual: number; variants: Record<MutationKey, number> }[];
}

export function rewind(p: readonly Candle[], atr: ArrayLike<number>, trades: RealTrade[], tdciThreshold: number, spread = 0): RewindReport {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const per = trades.map(t => ({ t, v: Object.fromEntries(MUTATIONS.map(m => [m.key, rewindTrade(p, atr, t, m.key, tdciThreshold, spread)])) as Record<MutationKey, number> }));
  const actualTotal = trades.reduce((s, t) => s + t.profit, 0);
  const mutations = MUTATIONS.map(m => {
    const total = per.reduce((s, x) => s + x.v[m.key], 0);
    return {
      key: m.key, label: m.label, total: r2(total), delta: r2(total - actualTotal),
      helped: per.filter(x => x.v[m.key] > x.t.profit + 1e-9).length,
      hurt: per.filter(x => x.v[m.key] < x.t.profit - 1e-9).length,
    };
  });
  // Size changes scale gains and losses alike; they are shown but not offered as "the" fix
  const candidates = mutations.filter(m => m.key !== "half_size" && m.key !== "double_size" && m.delta > 0);
  const best = candidates.sort((a, b) => b.delta - a.delta)[0] ?? null;
  const worst10 = [...per].sort((a, b) => a.t.profit - b.t.profit).slice(0, 10)
    .map(x => ({ id: x.t.id, actual: r2(x.t.profit), variants: Object.fromEntries(Object.entries(x.v).map(([k, v]) => [k, r2(v)])) as Record<MutationKey, number> }));
  return { trades: trades.length, actualTotal: r2(actualTotal), mutations, best: best ? { key: best.key, label: best.label, delta: best.delta } : null, worst10 };
}

/**
 * Gen Zero "you" (§10.3): logistic regression of "the user entered here" on the
 * layer values at their entry bars vs random bars where they did not. The
 * weights become a genome; the threshold is the median score at their entries.
 */
export function fitUserGenome(entryRows: number[][], otherRows: number[][], opts: { iters?: number; lr?: number; l2?: number } = {}) {
  const L = entryRows[0]?.length ?? 0;
  if (entryRows.length < 20 || !L) return null;
  const X = [...entryRows, ...otherRows], y = [...entryRows.map(() => 1), ...otherRows.map(() => 0)];
  // Side-agnostic: the user's direction is unknown to the layers, so fit on |x|
  const Xa = X.map(r => r.map(Math.abs));
  const w = new Array(L).fill(0); let b = 0;
  const { iters = 400, lr = 0.5, l2 = 0.01 } = opts;
  for (let it = 0; it < iters; it++) {
    const gw = new Array(L).fill(0); let gb = 0;
    for (let i = 0; i < Xa.length; i++) {
      const z = b + Xa[i].reduce((s, v, j) => s + v * w[j], 0);
      const e = 1 / (1 + Math.exp(-z)) - y[i];
      for (let j = 0; j < L; j++) gw[j] += e * Xa[i][j];
      gb += e;
    }
    for (let j = 0; j < L; j++) w[j] -= lr * (gw[j] / Xa.length + l2 * w[j]);
    b -= lr * gb / Xa.length;
  }
  const maxAbs = Math.max(...w.map(Math.abs)) || 1;
  // Only layers that made entries more likely become weights; the sign of the trade comes from the layers themselves
  return w.map(v => Math.max(0, v / maxAbs));
}
