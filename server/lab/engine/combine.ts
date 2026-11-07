// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Score one row for a genome. Must equal tdci.combine() exactly (parity test):
// same summation order (profile layer order), same rounding, same thresholds.

export interface RowScore { composite: number; score: number; direction: 1 | -1 | 0 }

/** Σ|w| for a weight vector; 0 means every layer is off (no signal). */
export function weightNorm(w: readonly number[]) {
  let s = 0; for (const v of w) s += Math.abs(v); return s;
}

export function scoreRow(X: ArrayLike<number>, L: number, row: number, regime: number, w: readonly number[], norm: number): RowScore {
  const totalW = norm || 1;
  let sum = 0;
  const base = row * L;
  for (let j = 0; j < L; j++) sum += w[j] * X[base + j];
  const composite = sum / totalW;
  const score = Math.round(100 * Math.max(0, Math.min(1, Math.abs(composite) / 0.6)) * regime);
  const direction = score < 10 ? 0 : (Math.sign(composite) as 1 | -1 | 0);
  return { composite, score, direction };
}

/**
 * Exact trade attribution (§9.11): the composite is a weighted linear sum, so
 * each layer's share is cⱼ = wⱼ·xⱼ / Σ|w|. The shares sum to the composite.
 */
export function attribution(x: readonly number[], w: readonly number[], layers: readonly string[]) {
  const norm = weightNorm(w) || 1;
  const parts = layers.map((key, j) => ({ key, contribution: (w[j] * x[j]) / norm }));
  const composite = parts.reduce((s, p) => s + p.contribution, 0);
  const sameSide = parts.filter(p => Math.sign(p.contribution) === Math.sign(composite) && p.contribution !== 0);
  const total = sameSide.reduce((s, p) => s + Math.abs(p.contribution), 0) || 1;
  const top = sameSide
    .map(p => ({ key: p.key, share: Math.abs(p.contribution) / total }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 4);
  return { composite, parts, top };
}
