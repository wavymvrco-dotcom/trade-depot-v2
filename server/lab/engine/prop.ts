// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Prop-firm rules (§10.5, §11A.8) and Challenge Odds (§10.6). Trades are run in
// account-% terms: each risks `riskPct` of current equity. Users enter their own
// firm's rules — firms change them, so no firm's rules are hard-coded here.

import { normInv } from "./stats";
import type { Rng } from "./rng";

export interface PropRules {
  firmLabel: string;
  accountSize: number;
  dailyLossLimitPct: number;
  maxDrawdownPct: number;
  drawdownType: "static" | "trailing";
  /** Trailing drawdown measured on every trade (intraday) or only at each day's close. */
  drawdownMeasure?: "intraday" | "end_of_day";
  profitTargetPct?: number;
  minTradingDays?: number;
  /** No single day may account for more than this % of total profit when the target is reached. */
  consistencyRulePct?: number;
  newsRestrictionMin?: number;
  weekendHoldingAllowed: boolean;
  /** Days allowed to pass; omitted = no limit. */
  timeLimitDays?: number;
  /** UTC hour at which the daily loss limit resets (default 0). */
  dailyResetHourUtc?: number;
}

export type PropFailure = "daily_loss" | "max_drawdown" | "time_limit" | "consistency";
export const PROP_FAILURE_TEXT: Record<PropFailure, string> = {
  daily_loss: "Hit the daily loss limit",
  max_drawdown: "Hit the maximum drawdown",
  time_limit: "Ran out of time before reaching the target",
  consistency: "Reached the target, but one day made too much of the profit",
};

export interface PropTrade { r: number; day: number } // day = trading-day index (0, 1, 2…)
export interface PropOutcome { status: "passed" | "failed" | "open"; reason: PropFailure | null; days: number; equityPct: number; maxDrawdownPct: number }

/** Run one sequence of trades through the rules. */
export function simulateProp(trades: PropTrade[], rules: PropRules, riskPct: number): PropOutcome {
  const start = 100;
  let eq = start, peak = start, dayStart = start, curDay = trades.length ? trades[0].day : 0, days = trades.length ? 1 : 0, worstDD = 0;
  const dayProfit = new Map<number, number>();
  const floorOf = () => rules.drawdownType === "static" ? start - rules.maxDrawdownPct : peak - rules.maxDrawdownPct;
  const target = rules.profitTargetPct != null ? start + rules.profitTargetPct : null;

  for (const t of trades) {
    if (t.day !== curDay) {
      // Day boundary: end-of-day trailing drawdown updates its peak here
      if (rules.drawdownType === "trailing" && rules.drawdownMeasure === "end_of_day") peak = Math.max(peak, eq);
      curDay = t.day; days++; dayStart = eq;
      if (rules.timeLimitDays != null && days > rules.timeLimitDays) return { status: "failed", reason: "time_limit", days: days - 1, equityPct: eq - start, maxDrawdownPct: worstDD };
    }
    const pnl = eq * (riskPct / 100) * t.r;
    eq += pnl;
    dayProfit.set(t.day, (dayProfit.get(t.day) ?? 0) + pnl);
    if (rules.drawdownType === "trailing" && rules.drawdownMeasure !== "end_of_day") peak = Math.max(peak, eq);
    worstDD = Math.max(worstDD, (rules.drawdownType === "static" ? start : peak) - eq);
    // Limits are % of the starting account size (the common convention); users enter their firm's numbers
    if (eq <= dayStart - rules.dailyLossLimitPct) return { status: "failed", reason: "daily_loss", days, equityPct: eq - start, maxDrawdownPct: worstDD };
    if (eq <= floorOf()) return { status: "failed", reason: "max_drawdown", days, equityPct: eq - start, maxDrawdownPct: worstDD };
    if (target != null && eq >= target && days >= (rules.minTradingDays ?? 0)) {
      if (rules.consistencyRulePct != null) {
        const total = eq - start, best = Math.max(...Array.from(dayProfit.values()));
        if (total > 0 && (best / total) * 100 > rules.consistencyRulePct) continue; // keep trading until it is consistent
      }
      return { status: "passed", reason: null, days, equityPct: eq - start, maxDrawdownPct: worstDD };
    }
  }
  return { status: "open", reason: null, days, equityPct: eq - start, maxDrawdownPct: worstDD };
}

/** Wilson score interval for a proportion (two-sided, given confidence). */
export function wilson(successes: number, n: number, confidence = 0.9) {
  if (n <= 0) return { lo: 0, hi: 1 };
  const z = normInv(1 - (1 - confidence) / 2), p = successes / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/**
 * Challenge Odds (§10.6): block-bootstrap the strategy's real trade sequence
 * (vault + shadow + live), one block = one trading day of about `tradesPerDay`
 * trades, run each path through the rules until it passes, fails or hits the
 * time limit (or 250 trading days). The 90% interval uses the number of real
 * trades as the sample size — the uncertainty is in the evidence, not in how
 * many paths were simulated — so a short record gives a wide range.
 */
export function challengeOdds(rs: number[], tradesPerDay: number, rules: PropRules, riskPct: number, rand: Rng, paths = 10_000) {
  const n = rs.length;
  if (n < 10) return null;
  const block = Math.max(1, Math.round(tradesPerDay));
  const maxDays = rules.timeLimitDays ?? 250;
  let passed = 0;
  const failures: Record<string, number> = {};
  const passDays: number[] = [];
  for (let p = 0; p < paths; p++) {
    const seq: PropTrade[] = [];
    for (let d = 0; d < maxDays; d++) {
      const s = Math.floor(rand.next() * n);
      for (let k = 0; k < block; k++) seq.push({ r: rs[(s + k) % n], day: d });
    }
    const o = simulateProp(seq, rules, riskPct);
    if (o.status === "passed") { passed++; passDays.push(o.days); }
    else failures[o.reason ?? "time_limit"] = (failures[o.reason ?? "time_limit"] ?? 0) + 1;
  }
  const rate = passed / paths;
  const ci = wilson(Math.round(rate * n), n, 0.9);
  passDays.sort((a, b) => a - b);
  const common = Object.entries(failures).sort((a, b) => b[1] - a[1])[0];
  return {
    passRate: rate, lo: ci.lo, hi: ci.hi, paths, sourceTrades: n,
    mostCommonFailure: (common?.[0] as PropFailure | undefined) ?? null,
    failureShares: Object.fromEntries(Object.entries(failures).map(([k, v]) => [k, v / paths])),
    medianDaysToPass: passDays.length ? passDays[Math.floor(passDays.length / 2)] : null,
  };
}

/** Editable starting points only — users set their own firm's numbers. */
export const PROP_TEMPLATES: Record<string, Omit<PropRules, "firmLabel" | "accountSize">> = {
  "Typical one-step evaluation": { dailyLossLimitPct: 5, maxDrawdownPct: 10, drawdownType: "static", profitTargetPct: 10, minTradingDays: 4, weekendHoldingAllowed: false, timeLimitDays: 30 },
  "Typical trailing-drawdown evaluation": { dailyLossLimitPct: 3, maxDrawdownPct: 6, drawdownType: "trailing", drawdownMeasure: "end_of_day", profitTargetPct: 8, minTradingDays: 5, consistencyRulePct: 40, weekendHoldingAllowed: false },
};
