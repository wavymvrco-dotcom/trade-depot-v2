// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Mirror (§10.1): a digital twin of broker execution. From real fills, estimate
// the distribution of spread and slippage (in pips) per (broker, symbol, 4-hour
// UTC bucket, news flag). With few fills each quantile is shrunk toward the
// prior: θ̂ = (n·x̄ + k·θ_prior) / (n + k), k = 30.

import { quantile } from "./stats";
import { getSymbolConfig } from "@shared/pips";
import type { Rng } from "./rng";

export interface Quantiles { p10: number; p50: number; p90: number; p99: number }
export interface FillObs { broker: string; symbol: string; hourBucket: number; news: boolean; spreadPips: number; slippagePips: number }
export interface MirrorCell { broker: string; symbol: string; hourBucket: number; news: boolean; n: number; spread: Quantiles; slippage: Quantiles }

export const SHRINK_K = 30;
export const hourBucketOf = (ms: number) => Math.floor(new Date(ms).getUTCHours() / 4);

/** Prior cost distribution for a symbol, matching the Phase 1 assumption (cost × U(0.8, 2.5)). */
export function priorFor(spreadPips: number, slipPips: number): { spread: Quantiles; slippage: Quantiles } {
  return {
    spread: { p10: 0.8 * spreadPips, p50: spreadPips, p90: 1.6 * spreadPips, p99: 2.5 * spreadPips },
    slippage: { p10: 0, p50: slipPips, p90: 2 * slipPips, p99: 4 * slipPips },
  };
}

function quantilesOf(xs: number[]): Quantiles {
  const s = [...xs].sort((a, b) => a - b);
  return { p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9), p99: quantile(s, 0.99) };
}

export function shrink(obs: Quantiles, n: number, prior: Quantiles, k = SHRINK_K): Quantiles {
  const f = (a: number, b: number) => (n * a + k * b) / (n + k);
  return { p10: f(obs.p10, prior.p10), p50: f(obs.p50, prior.p50), p90: f(obs.p90, prior.p90), p99: f(obs.p99, prior.p99) };
}

/** Fit every (broker, symbol, bucket, news) cell present in the data, plus prior-only cells for the others. */
export function fitMirror(fills: FillObs[], priors: Record<string, { spreadPips: number; slipPips: number }>): MirrorCell[] {
  const groups = new Map<string, FillObs[]>();
  for (const f of fills) {
    const k = `${f.broker}|${f.symbol}|${f.hourBucket}|${f.news ? 1 : 0}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const out: MirrorCell[] = [];
  for (const [k, g] of Array.from(groups)) {
    const [broker, symbol, hb, nw] = k.split("|");
    const p = priors[symbol]; if (!p) continue;
    const prior = priorFor(p.spreadPips, p.slipPips);
    out.push({
      broker, symbol, hourBucket: Number(hb), news: nw === "1", n: g.length,
      spread: shrink(quantilesOf(g.map(x => x.spreadPips)), g.length, prior.spread),
      slippage: shrink(quantilesOf(g.map(x => x.slippagePips)), g.length, prior.slippage),
    });
  }
  return out;
}

/** Draw from a distribution given only its quantiles: piecewise-linear inverse CDF (flat beyond p01/p99.9). */
export function drawFromQuantiles(q: Quantiles, u: number): number {
  const pts: [number, number][] = [[0, Math.max(0, q.p10 - (q.p50 - q.p10) * 0.25)], [0.1, q.p10], [0.5, q.p50], [0.9, q.p90], [0.99, q.p99], [1, q.p99 + (q.p99 - q.p90) * 0.5]];
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + (y1 - y0) * ((u - x0) / (x1 - x0));
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * Per-bar cost multipliers for one episode, relative to the base costs the
 * outcome cache was simulated with: (spread + 2·slippage) / (base spread + 2·base slippage).
 * `cells[hourBucket]` holds the cost model for each 4-hour bucket of this symbol.
 */
export function costMultipliers(
  cells: { spread: Quantiles; slippage: Quantiles }[], baseSpreadPips: number, baseSlipPips: number,
  closeHours: ArrayLike<number>, from: number, to: number, rand: Rng,
): Float32Array {
  const base = baseSpreadPips + 2 * baseSlipPips;
  const out = new Float32Array(to - from);
  for (let r = from; r < to; r++) {
    const c = cells[Math.floor(closeHours[r] / 4)] ?? cells[0];
    const s = drawFromQuantiles(c.spread, rand.next()), sl = drawFromQuantiles(c.slippage, rand.next());
    out[r - from] = base > 0 ? (s + 2 * sl) / base : 1;
  }
  return out;
}

/** Spread and slippage (pips, slippage signed against the trader) of one recorded fill, or null if unusable. */
export function measure(f: { symbol: string; side: string; kind: string; quoteBid: number | null; quoteAsk: number | null; fillPrice: number | null }) {
  if (f.quoteBid == null || f.quoteAsk == null || f.fillPrice == null) return null;
  const pip = getSymbolConfig(f.symbol).pipSize;
  const spreadPips = (f.quoteAsk - f.quoteBid) / pip;
  // A BUY (open long or close short) fills at the ask; a SELL at the bid
  const slippagePips = f.side === "BUY" ? (f.fillPrice - f.quoteAsk) / pip : (f.quoteBid - f.fillPrice) / pip;
  if (!Number.isFinite(spreadPips) || spreadPips < 0 || Math.abs(slippagePips) > 500) return null;
  return { spreadPips, slippagePips };
}

