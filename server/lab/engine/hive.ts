// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Hive (§11.3): a skill-weighted crowd view. Each Licensed strategy states, per
// bar, P(next-horizon move is up), mapped from its TDCI composite by a
// calibration curve fitted on its own Vault (isotonic regression). Strategies
// are scored online with the log score and combined with exponential weights
// (Hedge; Freund & Schapire, 1997). Aggregate only: shown with ≥ 5 contributors.

/** Pool-adjacent-violators: a non-decreasing fit of y on x. Returns breakpoints for interpolation. */
export function isotonic(x: number[], y: number[]): { xs: number[]; ps: number[] } {
  const idx = x.map((v, i) => i).sort((a, b) => x[a] - x[b]);
  const blocks: { sum: number; n: number; xs: number[] }[] = [];
  for (const i of idx) {
    blocks.push({ sum: y[i], n: 1, xs: [x[i]] });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
      const b = blocks.pop()!, a = blocks.pop()!;
      blocks.push({ sum: a.sum + b.sum, n: a.n + b.n, xs: [...a.xs, ...b.xs] });
    }
  }
  return { xs: blocks.map(b => b.xs.reduce((s, v) => s + v, 0) / b.xs.length), ps: blocks.map(b => b.sum / b.n) };
}

/** Probability from a fitted curve, clipped away from 0 and 1 (a log score must stay finite). */
export function probAt(curve: { xs: number[]; ps: number[] }, x: number, eps = 0.02): number {
  const { xs, ps } = curve;
  if (!xs.length) return 0.5;
  let p: number;
  if (x <= xs[0]) p = ps[0];
  else if (x >= xs[xs.length - 1]) p = ps[ps.length - 1];
  else {
    let k = 1; while (xs[k] < x) k++;
    p = ps[k - 1] + (ps[k] - ps[k - 1]) * ((x - xs[k - 1]) / (xs[k] - xs[k - 1] || 1));
  }
  return Math.min(1 - eps, Math.max(eps, p));
}

export const logScore = (p: number, up: boolean) => Math.log(up ? p : 1 - p);

export const HIVE = { minContributors: 5, minScored: 30, eta: 0.5 } as const;

/**
 * Combine contributors' current probabilities with exponential weights on their
 * cumulative log scores (relative to a coin flip). A strategy needs `minScored`
 * scored predictions before it gets any weight.
 */
export function hiveProbability(contribs: { p: number; cumLogScore: number; scored: number }[]) {
  const eligible = contribs.filter(c => c.scored >= HIVE.minScored);
  if (eligible.length < HIVE.minContributors) return null;
  const rel = eligible.map(c => c.cumLogScore - c.scored * Math.log(0.5)); // skill above a coin flip
  const m = Math.max(...rel);
  const w = rel.map(r => Math.exp(HIVE.eta * (r - m)));
  const total = w.reduce((s, v) => s + v, 0);
  const p = eligible.reduce((s, c, i) => s + (w[i] / total) * c.p, 0);
  return { p, contributors: eligible.length };
}
