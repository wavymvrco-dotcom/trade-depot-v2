// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Statistics for honest evaluation: normal CDF/quantile, moments, Sharpe,
// Deflated Sharpe Ratio, bootstrap drawdown envelope, CUSUM, sequential test.

import type { Rng } from "./rng";

/**
 * Standard normal CDF, double precision. Hart (1968) algorithm 5666 as
 * implemented by West (2005), "Better approximations to cumulative normal
 * functions", Wilmott Magazine. Absolute error < 1e-14.
 */
export function normCdf(x: number): number {
  const z = Math.abs(x);
  let c: number;
  if (z > 37) c = 0;
  else {
    const e = Math.exp(-z * z / 2);
    if (z < 7.07106781186547) {
      let n = 3.52624965998911e-2 * z + 0.700383064443688;
      n = n * z + 6.37396220353165; n = n * z + 33.912866078383; n = n * z + 112.079291497871;
      n = n * z + 221.213596169931; n = n * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207; d = d * z + 86.7807322029461; d = d * z + 296.564248779674;
      d = d * z + 637.333633378831; d = d * z + 793.826512519948; d = d * z + 440.413735824752;
      c = e * n / d;
    } else {
      let b = z + 0.65; b = z + 4 / b; b = z + 3 / b; b = z + 2 / b; b = z + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

/**
 * Standard normal quantile Φ⁻¹(p). Acklam's rational approximation (relative
 * error 1.15e-9) refined with one Halley step against normCdf.
 */
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x: number;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Halley refinement
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
}

export const mean = (xs: ArrayLike<number>) => { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[i]; return xs.length ? s / xs.length : 0; };

/** Sample standard deviation (n − 1). */
export function std(xs: ArrayLike<number>) {
  const n = xs.length; if (n < 2) return 0;
  const m = mean(xs); let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - m) ** 2;
  return Math.sqrt(s / (n - 1));
}

/** Skewness and (non-excess) kurtosis, population moments. Normal: 0 and 3. */
export function moments(xs: ArrayLike<number>) {
  const n = xs.length, m = mean(xs);
  let m2 = 0, m3 = 0, m4 = 0;
  for (let i = 0; i < n; i++) { const d = xs[i] - m; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
  m2 /= n; m3 /= n; m4 /= n;
  return { mean: m, skew: m2 > 0 ? m3 / m2 ** 1.5 : 0, kurt: m2 > 0 ? m4 / (m2 * m2) : 3 };
}

/** Per-trade Sharpe ratio: mean(r) / std(r). */
export const sharpe = (rs: ArrayLike<number>) => { const s = std(rs); return s > 0 ? mean(rs) / s : 0; };

export const EULER_GAMMA = 0.5772156649015329;

/**
 * Expected maximum Sharpe ratio among N independent trials when the true Sharpe
 * is zero (Bailey & López de Prado, 2014, eq. for SR₀).
 */
export function expectedMaxSharpe(trials: number, varianceOfSharpes: number) {
  if (trials < 2 || !(varianceOfSharpes > 0)) return 0;
  return Math.sqrt(varianceOfSharpes) * ((1 - EULER_GAMMA) * normInv(1 - 1 / trials) + EULER_GAMMA * normInv(1 - 1 / (trials * Math.E)));
}

/**
 * Deflated Sharpe Ratio (Bailey & López de Prado, 2014, "The Deflated Sharpe
 * Ratio", Journal of Portfolio Management): the probability that the true
 * Sharpe exceeds what the best of `trials` attempts would show by luck.
 */
export function deflatedSharpe(opts: { sharpe: number; observations: number; skew: number; kurt: number; trials: number; varianceOfSharpes: number }) {
  const { sharpe: sr, observations: T, skew, kurt, trials, varianceOfSharpes } = opts;
  if (T < 2) return { dsr: 0, sr0: 0 };
  const sr0 = expectedMaxSharpe(trials, varianceOfSharpes);
  const denom = 1 - skew * sr + ((kurt - 1) / 4) * sr * sr;
  if (!(denom > 0)) return { dsr: 0, sr0 };
  return { dsr: normCdf((sr - sr0) * Math.sqrt(T - 1) / Math.sqrt(denom)), sr0 };
}

/** Max drawdown of a cumulative R path, in R (positive number). */
export function maxDrawdown(rs: ArrayLike<number>) {
  let eq = 0, peak = 0, dd = 0;
  for (let i = 0; i < rs.length; i++) { eq += rs[i]; if (eq > peak) peak = eq; if (peak - eq > dd) dd = peak - eq; }
  return dd;
}

export function quantile(sorted: ArrayLike<number>, q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Monte Carlo drawdown envelope: resample the trade sequence with replacement
 * (seeded) and report drawdown percentiles and the mean-R interval.
 */
export function bootstrapEnvelope(rs: number[], rand: Rng, resamples = 10_000) {
  const n = rs.length;
  if (n < 2) return { ddP50: 0, ddP95: 0, ddP99: 0, meanR: mean(rs), meanP05: mean(rs), meanP95: mean(rs), resamples: 0 };
  const dds = new Float64Array(resamples), means = new Float64Array(resamples);
  const path = new Float64Array(n);
  for (let k = 0; k < resamples; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) { const r = rs[Math.floor(rand.next() * n)]; path[i] = r; s += r; }
    dds[k] = maxDrawdown(path); means[k] = s / n;
  }
  dds.sort(); means.sort();
  return {
    ddP50: quantile(dds, 0.5), ddP95: quantile(dds, 0.95), ddP99: quantile(dds, 0.99),
    meanR: mean(rs), meanP05: quantile(means, 0.05), meanP95: quantile(means, 0.95), resamples,
  };
}

/**
 * One-sided CUSUM for a downward shift in standardized returns (Page, 1954):
 * S_t = max(0, S_{t−1} − z_t − k); trips when S_t > h.
 */
export function cusumStep(prev: number, r: number, muRef: number, sigmaRef: number, k: number) {
  const z = sigmaRef > 0 ? (r - muRef) / sigmaRef : 0;
  return Math.max(0, prev - z - k);
}

export function cusumTrips(rs: ArrayLike<number>, muRef: number, sigmaRef: number, k: number, h: number) {
  let s = 0;
  for (let i = 0; i < rs.length; i++) { s = cusumStep(s, rs[i], muRef, sigmaRef, k); if (s > h) return { tripped: true, at: i, stat: s }; }
  return { tripped: false, at: -1, stat: s };
}

/**
 * Always-valid mixture sequential probability ratio test for a normal mean
 * (Johari, Pekelis & Walsh, 2017). Tests H0: mean = theta0 with a normal
 * mixing distribution of variance tau². Returns the likelihood ratio and
 * whether it rejects at level alpha (Λ ≥ 1/alpha), plus the direction.
 */
export function msprt(xs: ArrayLike<number>, theta0: number, sigma: number, tau: number, alpha = 0.05) {
  const n = xs.length;
  if (n === 0 || !(sigma > 0)) return { lambda: 1, reject: false, direction: 0 as -1 | 0 | 1, n };
  const xbar = mean(xs), s2 = sigma * sigma, t2 = tau * tau;
  const lambda = Math.sqrt(s2 / (s2 + n * t2)) * Math.exp((n * n * t2 * (xbar - theta0) ** 2) / (2 * s2 * (s2 + n * t2)));
  const reject = lambda >= 1 / alpha;
  return { lambda, reject, direction: (reject ? Math.sign(xbar - theta0) : 0) as -1 | 0 | 1, n };
}

/**
 * Posterior P(candidate mean R − incumbent mean R > 0) under a normal–normal
 * model with a skeptical prior centred on zero difference. `priorTrades` sets
 * how strongly the prior pulls toward zero (equivalent number of trades).
 */
export function probBetter(diffs: ArrayLike<number>, sigma: number, priorTrades = 15) {
  const n = diffs.length;
  if (!n || !(sigma > 0)) return 0.5;
  const priorVar = (sigma * sigma) / priorTrades, likeVar = (sigma * sigma) / n;
  const postVar = 1 / (1 / priorVar + 1 / likeVar);
  const postMean = postVar * (mean(diffs) / likeVar);
  return normCdf(postMean / Math.sqrt(postVar));
}
