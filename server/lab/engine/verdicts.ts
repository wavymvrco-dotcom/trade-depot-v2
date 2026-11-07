// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Pure decision rules for Shadow Run graduation (§9.9) and Tripwire (§9.10).
// The service layer feeds them recorded trades and acts on the verdict.

import { cusumTrips, maxDrawdown, mean, msprt, probBetter } from "./stats";

/** CUSUM settings. h = 6 (sheet: 5) — see docs/DECISIONS.md for the measurement behind it. */
export const TRIPWIRE = { k: 0.5, h: 6 } as const;

export const SHADOW_RULES = {
  minDays: 30, earlyMinDays: 14, minTrades: 15, maxDays: 90,
  minProbBetter: 0.8, alpha: 0.05, priorTrades: 15,
} as const;

/** What the Vault Exam predicted, used as the yardstick for Shadow and Live. */
export interface VaultExpectation {
  meanR: number;     // vault mean R per trade
  sigmaR: number;    // vault std of R per trade
  meanP05: number; meanP95: number; // 90% interval of mean R (bootstrap)
  ddP95: number; ddP99: number;     // drawdown percentiles (bootstrap)
}

export interface ShadowEvidence {
  days: number; trades: number; meanR: number; maxDD: number;
  probBetter: number; msprtLambda: number;
  checks: { key: string; label: string; ok: boolean; detail: string }[];
  verdict: "graduate" | "continue" | "scrap";
  reasons: string[];
}

/**
 * Judge a Shadow Run. `diffs` are candidate R − incumbent R on the same signal
 * bars (incumbent R = 0 where it stayed flat).
 */
export function judgeShadow(rs: number[], diffs: number[], days: number, v: VaultExpectation): ShadowEvidence {
  const n = rs.length, m = mean(rs), dd = maxDrawdown(rs);
  const pb = probBetter(diffs, v.sigmaR, SHADOW_RULES.priorTrades);
  const seq = msprt(rs, v.meanR, v.sigmaR, v.sigmaR, SHADOW_RULES.alpha);
  const early = seq.reject && seq.direction > 0;
  const minDays = early ? SHADOW_RULES.earlyMinDays : SHADOW_RULES.minDays;
  const checks = [
    { key: "days", label: `At least ${minDays} days${early ? " (early decision)" : ""}`, ok: days >= minDays, detail: `${days.toFixed(1)} days` },
    { key: "trades", label: `At least ${SHADOW_RULES.minTrades} closed trades`, ok: n >= SHADOW_RULES.minTrades, detail: `${n} trades` },
    { key: "mean", label: "Average R inside the Vault's 90% range or better", ok: n > 0 && m >= v.meanP05, detail: `${m.toFixed(3)}R vs ≥ ${v.meanP05.toFixed(3)}R` },
    { key: "drawdown", label: "Drawdown within the Vault's 95th percentile", ok: dd <= v.ddP95, detail: `${dd.toFixed(2)}R vs ≤ ${v.ddP95.toFixed(2)}R` },
    { key: "better", label: "At least 80% likely to beat the incumbent", ok: pb >= SHADOW_RULES.minProbBetter, detail: `${Math.round(pb * 100)}%` },
  ];
  const reasons: string[] = [];
  if (dd > v.ddP99) reasons.push("Shadow drawdown is beyond the Vault's 99th percentile.");
  if (seq.reject && seq.direction < 0) reasons.push("Live results are confidently below what the Vault predicted.");
  if (days > SHADOW_RULES.maxDays && !checks.every(c => c.ok)) reasons.push("90 days passed without meeting the graduation criteria.");
  const verdict = reasons.length ? "scrap" : checks.every(c => c.ok) ? "graduate" : "continue";
  return { days, trades: n, meanR: m, maxDD: dd, probBetter: pb, msprtLambda: seq.lambda, checks, verdict, reasons };
}

export interface TripwireVerdict { tripped: boolean; reason: string | null; cusum: number; maxDD: number }

/** Check a Live strategy after each closed trade. */
export function judgeLive(rs: number[], v: VaultExpectation): TripwireVerdict {
  const c = cusumTrips(rs, v.meanR, v.sigmaR, TRIPWIRE.k, TRIPWIRE.h);
  const dd = maxDrawdown(rs);
  if (c.tripped) return { tripped: true, reason: "Results drifted below what the Vault Exam predicted (CUSUM).", cusum: c.stat, maxDD: dd };
  if (dd > v.ddP99) return { tripped: true, reason: "Live drawdown went beyond the Vault's 99th percentile.", cusum: c.stat, maxDD: dd };
  return { tripped: false, reason: null, cusum: c.stat, maxDD: dd };
}
