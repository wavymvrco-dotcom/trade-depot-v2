// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Blueprint → scalar fitness (§9.6). Rewards strategies that work in every
// world, not one great world.

import type { BlueprintSpec, Trade } from "./types";
import { maxDrawdown, mean, std } from "./stats";

const WEEK_MS = 7 * 86400_000;
export const MIN_EPISODE_TRADES = 8;

export interface EpisodeScore { score: number; died: boolean; trades: number; totalR: number; maxDD: number }

/** s = w·totalR − λ·maxDD − frequency penalty − soft floor (−0.1R per trade under 8). */
export function episodeScore(spec: BlueprintSpec, trades: Trade[], died: boolean, spanMs: number): EpisodeScore {
  const rs = trades.map(t => t.r);
  const totalR = rs.reduce((s, r) => s + r, 0);
  const dd = maxDrawdown(rs);
  if (died) return { score: -Infinity, died, trades: trades.length, totalR, maxDD: dd };
  const { totalR: wR, drawdownPenalty: lambda, tradeFrequency: tf } = spec.objective;
  const weeks = Math.max(spanMs / WEEK_MS, 1e-9);
  let freq = 0;
  if (tf?.minPerWeek != null && trades.length < tf.minPerWeek * weeks) freq += 0.1 * (tf.minPerWeek * weeks - trades.length);
  if (tf?.maxPerWeek != null && trades.length > tf.maxPerWeek * weeks) freq += 0.1 * (trades.length - tf.maxPerWeek * weeks);
  const floor = 0.1 * Math.max(0, MIN_EPISODE_TRADES - trades.length);
  return { score: wR * totalR - lambda * dd - freq - floor, died, trades: trades.length, totalR, maxDD: dd };
}

/**
 * F = mean(s) − κ·std(s). An episode where the agent died counts as the worst
 * finite score minus 1R (or −10R if it died everywhere).
 */
export function aggregateFitness(spec: BlueprintSpec, scores: EpisodeScore[]) {
  const finite = scores.filter(s => !s.died).map(s => s.score);
  const worst = finite.length ? Math.min(...finite) : -9;
  const vals = scores.map(s => (s.died ? worst - 1 : s.score));
  const F = mean(vals) - spec.objective.consistencyPenalty * (vals.length > 1 ? std(vals) : 0);
  return { F, deaths: scores.filter(s => s.died).length };
}

/** Validation score V = totalR − λ·maxDD on a fixed trade list. */
export function validationScore(spec: BlueprintSpec, rs: number[]) {
  const totalR = rs.reduce((s, r) => s + r, 0);
  return totalR - spec.objective.drawdownPenalty * maxDrawdown(rs);
}
