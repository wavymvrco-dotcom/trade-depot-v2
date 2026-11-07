// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Fleet (§11.9): combine Licensed strategies into one portfolio by minimizing
// CVaR(95%) of daily portfolio R (Rockafellar & Uryasev, 2000) subject to an
// expected-R target and per-strategy caps — drawdown first, not return. The
// allocation must pass a holdout check (fit on the first 70% of days, judged on
// the last 30% against equal weights) before it can be used live.

import { solveLp, type LpRow } from "./lp";
import { mean } from "./stats";

export const FLEET = { beta: 0.95, holdoutShare: 0.3 } as const;

/** Empirical CVaR of losses (−R) at level β: the average of the worst (1 − β) share of days. */
export function cvar(dailyR: number[], beta = FLEET.beta) {
  if (!dailyR.length) return 0;
  const losses = dailyR.map(r => -r).sort((a, b) => b - a);
  const k = Math.max(1, Math.ceil((1 - beta) * losses.length));
  return losses.slice(0, k).reduce((s, v) => s + v, 0) / k;
}

const portfolio = (R: number[][], w: number[]) => R.map(day => day.reduce((s, r, k) => s + r * w[k], 0));

/**
 * Minimum-CVaR weights. R[t][k] = strategy k's R on day t. Weights sum to 1,
 * each ≤ cap, expected daily R ≥ target. Variables: w (K), α⁺, α⁻, u (T).
 */
export function minCvarWeights(R: number[][], opts: { cap?: number; targetR?: number; beta?: number } = {}) {
  const T = R.length, K = R[0]?.length ?? 0;
  if (!T || !K) return null;
  const beta = opts.beta ?? FLEET.beta, cap = Math.max(opts.cap ?? 1, 1 / K);
  const nv = K + 2 + T;
  const c = new Array(nv).fill(0);
  c[K] = 1; c[K + 1] = -1; // α = α⁺ − α⁻
  for (let t = 0; t < T; t++) c[K + 2 + t] = 1 / ((1 - beta) * T);
  const rows: LpRow[] = [];
  // u_t ≥ loss_t − α  ⇔  −Σ w_k R_tk − α⁺ + α⁻ − u_t ≤ 0
  for (let t = 0; t < T; t++) {
    const a = new Array(nv).fill(0);
    for (let k = 0; k < K; k++) a[k] = -R[t][k];
    a[K] = -1; a[K + 1] = 1; a[K + 2 + t] = -1;
    rows.push({ a, op: "<=", b: 0 });
  }
  rows.push({ a: [...new Array(K).fill(1), ...new Array(2 + T).fill(0)], op: "=", b: 1 });
  for (let k = 0; k < K; k++) { const a = new Array(nv).fill(0); a[k] = 1; rows.push({ a, op: "<=", b: cap }); }
  if (opts.targetR != null) {
    const mu = Array.from({ length: K }, (_, k) => mean(R.map(d => d[k])));
    rows.push({ a: [...mu, ...new Array(2 + T).fill(0)], op: ">=", b: opts.targetR });
  }
  const res = solveLp(c, rows);
  if (res.status !== "optimal") return null;
  const w = res.x.slice(0, K).map(v => Math.max(0, v));
  const s = w.reduce((x, v) => x + v, 0) || 1;
  return { weights: w.map(v => v / s), cvar: res.value };
}

/** Fit on the first 70% of days, judge on the last 30% against equal weights. */
export function fleetWithHoldout(R: number[][], opts: { cap?: number; targetR?: number } = {}) {
  const T = R.length, K = R[0]?.length ?? 0;
  const cut = Math.floor(T * (1 - FLEET.holdoutShare));
  if (K < 2 || cut < 20 || T - cut < 10) return { ok: false as const, reason: "Needs at least two strategies and about 30 trading days of shared history." };
  const fit = minCvarWeights(R.slice(0, cut), opts);
  if (!fit) return { ok: false as const, reason: "No allocation meets the target and caps on the fitting period." };
  const hold = R.slice(cut), eq = new Array(K).fill(1 / K);
  const fleetHold = portfolio(hold, fit.weights), eqHold = portfolio(hold, eq);
  const result = {
    weights: fit.weights,
    fitCvar: fit.cvar,
    holdout: { days: hold.length, fleetCvar: cvar(fleetHold), equalCvar: cvar(eqHold), fleetMeanR: mean(fleetHold), equalMeanR: mean(eqHold) },
  };
  // Usable live only if, on days it never saw, it was no riskier than equal weights and did not lose on average
  const passed = result.holdout.fleetCvar <= result.holdout.equalCvar + 1e-9 && result.holdout.fleetMeanR >= 0;
  return { ok: true as const, passed, ...result };
}
