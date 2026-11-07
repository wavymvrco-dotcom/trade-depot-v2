// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Core v1 (§11.4): empirical-Bayes priors for layer weights. Each pair's IC
// for a layer is shrunk toward the cross-pair mean in proportion to its
// standard error (James–Stein style): noisy pairs move most. Core weights are
// the shrunk ICs (averaged over the Blueprint's pairs) normalized to Σ|w| = 1.
// Pooled within one style (asset class) only — never across.

export interface PairIc { symbol: string; ic: Record<string, number>; t: Record<string, number> }

/** Shrink each pair's IC per layer. SE = |IC / t| (from the calibration's t-statistic). */
export function shrinkIcs(pairs: PairIc[], layers: string[]) {
  const out: Record<string, Record<string, number>> = Object.fromEntries(pairs.map(p => [p.symbol, {}]));
  for (const k of layers) {
    const obs = pairs.map(p => {
      const ic = p.ic[k] ?? 0, t = p.t[k] ?? 0;
      const se = t !== 0 && ic !== 0 ? Math.abs(ic / t) : 0.05; // no t: treat as one noisy estimate
      return { symbol: p.symbol, ic, se2: se * se };
    });
    const m = obs.reduce((s, o) => s + o.ic, 0) / (obs.length || 1);
    const varIc = obs.length > 1 ? obs.reduce((s, o) => s + (o.ic - m) ** 2, 0) / (obs.length - 1) : 0;
    const meanSe2 = obs.reduce((s, o) => s + o.se2, 0) / (obs.length || 1);
    const tau2 = Math.max(0, varIc - meanSe2); // between-pair variance beyond sampling noise
    for (const o of obs) {
      const B = o.se2 / (o.se2 + tau2 || 1e-12); // 1 = shrink fully to the mean
      out[o.symbol][k] = m + (1 - B) * (o.ic - m);
    }
  }
  return out;
}

/** Core genome weights for a set of pairs, in layer order. Null if there is nothing to learn from. */
export function coreWeights(pairs: PairIc[], layers: string[], symbols: string[]): number[] | null {
  if (pairs.length < 2) return null;
  const shrunk = shrinkIcs(pairs, layers);
  const use = symbols.filter(s => shrunk[s]);
  const pool = use.length ? use : Object.keys(shrunk);
  const w = layers.map(k => pool.reduce((s, sym) => s + (shrunk[sym][k] ?? 0), 0) / pool.length);
  const total = w.reduce((s, v) => s + Math.abs(v), 0);
  return total > 0 ? w.map(v => Math.round((v / total) * 1000) / 1000) : null;
}
