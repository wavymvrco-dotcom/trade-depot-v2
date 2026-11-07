// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Forge acceptance (§11.1), on the TRAIN segment only:
//   1. no look-ahead (re-evaluated on truncated history at random cut points);
//   2. |IC t-stat| ≥ max(3, Φ⁻¹(1 − 0.025 / layerTrials)) with effective n = n / icHorizon
//      (every layer ever tested raises the bar — Bonferroni-style);
//   3. novelty: |Spearman| < 0.7 with every existing layer;
//   4. score = |t| − 0.05 · nodes (simpler beats cleverer at equal strength).

import type { EnvData } from "../env";
import { makeSplits } from "../splits";
import { normInv, spearman } from "../stats";
import { rng } from "../rng";
import { countNodes, containsHtf, children, printLayer, type Node } from "./dsl";
import { evaluateLayer, type LayerInput } from "./interp";

export const ACCEPT = { minT: 3, maxCorrelation: 0.7, complexityPenalty: 0.05 } as const;

export function layerInputFor(d: EnvData): LayerInput {
  const times = d.candles.map(c => Date.parse(c.time.length <= 10 ? `${c.time}T00:00:00Z` : `${c.time.replace(" ", "T")}Z`));
  const hTimes = d.h?.map(c => Date.parse(c.time.length <= 10 ? `${c.time}T00:00:00Z` : `${c.time.replace(" ", "T")}Z`));
  return { p: d.candles, times, barMs: d.barMs, h: d.h, hTimes, htfMs: d.htfMs, hIdx: d.hIdx };
}

/** Does the program read any price, range or time series at all? */
function readsMarket(n: Node): boolean {
  return n.op === "series" || n.op === "atr" || n.op === "rsi" || children(n).some(readsMarket);
}

export const tThreshold = (layerTrials: number) => Math.max(ACCEPT.minT, layerTrials > 1 ? normInv(1 - 0.025 / layerTrials) : 0);

export type Family = "trend" | "momentum" | "mean-reversion" | "volatility" | "session";
/** MAP-Elites niche: layer family × timeframe, read from the ops the program uses. */
export function nicheOf(n: Node): { family: Family; timeframe: "primary" | "htf"; key: string } {
  const ops = new Set<string>(), names = new Set<string>();
  const walk = (x: Node) => { ops.add(x.op); if (x.op === "series") names.add(x.name); children(x).forEach(walk); };
  walk(n);
  const family: Family = names.has("hour") ? "session"
    : ops.has("zscore") ? "mean-reversion"
    : ops.has("rsi") || ops.has("lag") ? "momentum"
    : ops.has("slope") || ops.has("ema") || ops.has("sma") ? "trend"
    : ops.has("atr") || ops.has("highest") || ops.has("lowest") ? "volatility" : "trend";
  const timeframe = containsHtf(n) ? "htf" : "primary";
  return { family, timeframe, key: `${family}:${timeframe}` };
}

export interface AcceptanceResult {
  accepted: boolean;
  reasons: string[];
  ic: number; tStat: number; tNeeded: number; maxCorrelation: number; nodes: number; score: number;
  noLookahead: boolean; trainRows: number;
}

/**
 * Test a layer on the training rows of one or more environments (pooled).
 * `existing` are the value columns of every layer already in use, aligned to
 * the same rows (TDCI layers from env.X plus previously accepted Forge layers).
 */
export function testLayer(node: Node, envs: EnvData[], layerTrials: number, existingForge: Float64Array[][] = [], seed = 1): AcceptanceResult {
  const vals: number[] = [], fwd: number[] = [];
  const others: number[][] = [];
  let noLookahead = true;
  const R = rng(seed);
  envs.forEach((d, e) => {
    const inp = layerInputFor(d);
    const ev = evaluateLayer(node, inp);
    const full = ev.values;
    // Look-ahead check: values up to a cut must not change when later bars are removed
    for (let k = 0; k < 3; k++) {
      const cut = Math.floor(d.candles.length * R.uniform(0.3, 0.9));
      const hCut = d.hIdx ? Math.max(0, d.hIdx[cut] + 1) : undefined;
      const short = evaluateLayer(node, { ...inp, p: inp.p.slice(0, cut + 1), times: Array.from(inp.times).slice(0, cut + 1),
        h: inp.h?.slice(0, hCut), hTimes: inp.hTimes ? Array.from(inp.hTimes).slice(0, hCut) : undefined, hIdx: inp.hIdx ? Array.from(inp.hIdx).slice(0, cut + 1) : undefined }).values;
      for (let i = 0; i <= cut; i++) if (short[i] !== full[i]) { noLookahead = false; break; }
    }
    const rows = d.candles.length - 1, L = d.layers.length, h = d.icHorizon ?? 6;
    const train = makeSplits(rows, d.maxHold).train;
    const cols = L + (existingForge[e]?.length ?? 0);
    while (others.length < cols) others.push([]);
    // Only rows after the layer's own warmup count (warmup values are a neutral 0 by design, not a signal)
    for (let r = Math.max(train.from, ev.warmup); r < Math.min(train.to, rows - h); r++) {
      const a = d.atr[r];
      if (!(a > 0)) continue;
      vals.push(full[r]);
      fwd.push((d.candles[r + h].close - d.candles[r].close) / a);
      for (let j = 0; j < L; j++) others[j].push(d.X[r * L + j]);
      (existingForge[e] ?? []).forEach((col, j) => others[L + j].push(col[r]));
    }
  });
  const n = vals.length, hz = envs[0]?.icHorizon ?? 6;
  const ic = n > 30 ? spearman(vals, fwd) : 0;
  const tStat = ic * Math.sqrt(n / hz);
  const tNeeded = tThreshold(layerTrials);
  const maxCorrelation = Math.max(0, ...others.filter(c => c.length === n).map(c => Math.abs(spearman(vals, c))));
  const nodes = countNodes(node);
  const reasons: string[] = [];
  if (!noLookahead) reasons.push("reads future bars");
  if (Math.abs(tStat) < tNeeded) reasons.push(`|t| ${Math.abs(tStat).toFixed(2)} < ${tNeeded.toFixed(2)}`);
  if (maxCorrelation >= ACCEPT.maxCorrelation) reasons.push(`too similar to an existing layer (|ρ| ${maxCorrelation.toFixed(2)})`);
  if (!vals.length || vals.every(v => v === vals[0])) reasons.push("constant output");
  if (!readsMarket(node)) reasons.push("reads no market data");
  return { accepted: reasons.length === 0, reasons, ic, tStat, tNeeded, maxCorrelation, nodes, score: Math.abs(tStat) - ACCEPT.complexityPenalty * nodes, noLookahead, trainRows: n };
}

/** Append accepted Forge layers as extra columns (in the given order). Values are causal, so the whole series is computed once. */
export function withForgeLayers(d: EnvData, layers: { id: string; node: Node }[]): EnvData {
  if (!layers.length) return d;
  const inp = layerInputFor(d);
  const rows = d.candles.length - 1, L = d.layers.length, K = layers.length;
  const cols = layers.map(l => { try { return evaluateLayer(l.node, inp).values; } catch { return new Float64Array(rows + 1); } });
  const X = new Float32Array(rows * (L + K));
  for (let r = 0; r < rows; r++) {
    for (let j = 0; j < L; j++) X[r * (L + K) + j] = d.X[r * L + j];
    for (let k = 0; k < K; k++) X[r * (L + K) + L + k] = cols[k][r];
  }
  return { ...d, layers: [...d.layers, ...layers.map(l => `forge:${l.id}`)] as any, X };
}

export { printLayer };
