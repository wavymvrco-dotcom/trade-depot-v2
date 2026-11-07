// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Vault Exam (§9.8). The only code that reads vault rows. Runs once per
// (run, genome); the caller enforces that with a persistent record (the
// `guard`), and the result is stored immutably.

import type { Env } from "./env";
import { nearestGrid } from "./env";
import type { BlueprintSpec, FailureReason, Genome, Grade } from "./types";
import type { Segment } from "./splits";
import { evalSegments } from "./evolve";
import { bootstrapEnvelope, deflatedSharpe, maxDrawdown, moments, sharpe } from "./stats";
import { rng } from "./rng";
import { hunt } from "./hunter";
import { simulateProp } from "./prop";
import { runGenome } from "./episode";
import { isotonic } from "./hive";
import { scoreRow, weightNorm } from "./combine";
import { weightsFor } from "./types";

export const GRADING = { minTrades: 30, minProfitFactor: 1.1, minDsr: 0.95 } as const;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export interface PeriodStats { trades: number; totalR: number; winRate: number; profitFactor: number; maxDD: number; avgR: number; equity: number[] }

export function periodStats(rs: number[]): PeriodStats {
  const wins = rs.filter(r => r > 0), gains = wins.reduce((s, r) => s + r, 0);
  const losses = Math.abs(rs.filter(r => r <= 0).reduce((s, r) => s + r, 0));
  let eq = 0;
  const curve = rs.map(r => r3((eq += r)));
  const step = Math.max(1, Math.ceil(curve.length / 100));
  return {
    trades: rs.length, totalR: r3(eq),
    winRate: rs.length ? r3(wins.length / rs.length) : 0,
    profitFactor: losses > 0 ? r3(gains / losses) : gains > 0 ? 99 : 0,
    maxDD: r3(maxDrawdown(rs)), avgR: rs.length ? r4(eq / rs.length) : 0,
    equity: curve.filter((_, i) => i % step === 0 || i === curve.length - 1),
  };
}

export interface VaultReport {
  version: 1;
  vaultHashes: Record<string, string>;
  base: PeriodStats;
  doubleCost: PeriodStats;
  perPair: { symbol: string; trades: number; totalR: number; profitFactor: number; maxDD: number }[];
  baseline: PeriodStats;
  luck: { dsr: number; sr0: number; sharpe: number; trials: number; observations: number; skew: number; kurt: number; varianceOfSharpes: number };
  envelope: ReturnType<typeof bootstrapEnvelope>;
  /** The vault trades in time order (R), and their pace, for Challenge Odds and Tripwire. */
  sequence: { rs: number[]; tradesPerDay: number; days?: number[] };
  /** Phase 2: the vault sequence run through the Blueprint's prop rules (if any). */
  prop: { status: "passed" | "failed" | "open"; reason: string | null; days: number; returnPct: number } | null;
  /** Hive (§11.3): isotonic map from composite to P(up over icHorizon bars), fitted on the vault rows. */
  hiveCurve: { xs: number[]; ps: number[]; horizon: number } | null;
  /** Vault results by market regime at the signal bar (calm, normal, trend, volatile) — the Playbook's regime tags. */
  perRegime: { tag: number; trades: number; totalR: number }[];
  /** Rewind (§10.3): the champion in the user's worst drawdown periods. Gated only when out-of-sample. */
  rewind: { symbol: string; from: string; to: string; trades: number; totalR: number; maxDD: number; inSample: boolean; breached: boolean }[];
  /** Hunter on the vault trades: total R under attack and the share of results kept. */
  hunter: { totalR: number; keptPct: number | null; attacks: number };
  grade: Grade;
  failureReasons: FailureReason[];
}

/**
 * Examine a champion on the locked vault segment of every env.
 * `validationTrades` are the champion's validation R values (for the DSR),
 * `candidateSharpes` the per-trade Sharpes of every hall-of-fame candidate.
 */
export function vaultExam(args: {
  envs: Env[]; vault: Segment[]; vaultHashes: Record<string, string>;
  spec: BlueprintSpec; champion: Genome; baselineWeights: number[]; defaultStop: number; defaultRr: number;
  validationTrades: number[]; candidateSharpes: number[]; trials: number; seed: number;
  /** User drawdown windows (from Rewind) and the first row of the locked segment per env, for the in-sample label. */
  rewindWindows?: { symbol: string; fromMs: number; toMs: number }[];
}): VaultReport {
  const { envs, vault, spec } = args;
  const base = evalSegments(envs, args.champion, vault, spec, 1);
  const dbl = evalSegments(envs, args.champion, vault, spec, 2);
  const baselineGenome: Genome = { w: args.baselineWeights, threshold: 60, ...nearestGrid(args.defaultStop, args.defaultRr) };
  const baseline = evalSegments(envs, baselineGenome, vault, spec, 1);

  const vr = args.validationTrades;
  const m = moments(vr);
  const sr = sharpe(vr);
  const cs = args.candidateSharpes;
  const csMean = cs.reduce((s, v) => s + v, 0) / (cs.length || 1);
  const varianceOfSharpes = cs.length > 1 ? cs.reduce((s, v) => s + (v - csMean) ** 2, 0) / (cs.length - 1) : 0;
  const { dsr, sr0 } = deflatedSharpe({ sharpe: sr, observations: vr.length, skew: m.skew, kurt: m.kurt, trials: Math.max(1, args.trials), varianceOfSharpes });

  const bs = periodStats(base.all), ds = periodStats(dbl.all), bl = periodStats(baseline.all);
  // All vault trades across pairs, in the order they closed
  const merged = envs.flatMap((env, k) => base.perEnv[k].map(t => ({ t, env, ms: env.timeMs(t.exit) }))).sort((a, b) => a.ms - b.ms);
  const spanDays = merged.length > 1 ? (merged[merged.length - 1].ms - merged[0].ms) / 86_400_000 : 1;
  const tradesPerDay = merged.length / Math.max(1, spanDays * 5 / 7);
  const reset = spec.prop?.dailyResetHourUtc ?? 0;
  const propResult = spec.prop
    ? simulateProp(merged.map(m => ({ r: m.t.r, day: Math.floor((m.ms + m.env.barMs - reset * 3_600_000) / 86_400_000) })), spec.prop, spec.risk.riskPercentPerTrade)
    : null;
  let huntedR = 0, attacks = 0;
  envs.forEach((env, k) => {
    const h = hunt(env, base.perEnv[k], args.champion.stopIdx, args.champion.rrIdx);
    huntedR += h.trades.reduce((s, t) => s + t.r, 0); attacks += h.attacks.length;
  });
  const reasons: FailureReason[] = [];
  if (bs.trades < GRADING.minTrades) reasons.push("too_few_trades");
  if (bs.totalR <= 0) reasons.push("vault_negative");
  else if (bs.profitFactor < GRADING.minProfitFactor) reasons.push("weak_profit_factor");
  if (ds.totalR <= 0 && bs.totalR > 0) reasons.push("cost_fragile");
  if (dsr < GRADING.minDsr) reasons.push("likely_luck");
  if (bs.totalR <= bl.totalR) reasons.push("no_better_than_default");
  const envelopeFor = bootstrapEnvelope(base.all, rng(args.seed ^ 0x5eed), 10_000);
  const rewindRes = (args.rewindWindows ?? []).flatMap(w => {
    const k = envs.findIndex(e => e.symbol === w.symbol); if (k < 0) return [];
    const env = envs[k];
    let from = -1, to = -1;
    for (let r = 0; r < env.n; r++) { const t = env.timeMs(r); if (t >= w.fromMs && from < 0) from = r; if (t <= w.toMs) to = r + 1; }
    if (from < 0 || to <= from) return [];
    const trades = runGenome(env, args.champion, { from, to, limit: env.n + 1, costMult: 1, constraints: spec.constraints }).trades.map(t => t.r);
    const inSample = from < vault[k].from;          // overlaps data the Arena trained or validated on
    const dd = maxDrawdown(trades);
    return [{ symbol: w.symbol, from: env.candles[from].time, to: env.candles[Math.min(to, env.n)].time, trades: trades.length,
      totalR: r3(trades.reduce((s, x) => s + x, 0)), maxDD: r3(dd), inSample, breached: !inSample && dd > envelopeFor.ddP95 }];
  });
  if (rewindRes.some(x => x.breached)) reasons.push("rewind_drawdown");

  return {
    version: 1,
    vaultHashes: args.vaultHashes,
    base: bs, doubleCost: ds, baseline: bl,
    perPair: envs.map((e, k) => {
      const ps = periodStats(base.perEnv[k].map(t => t.r));
      return { symbol: e.symbol, trades: ps.trades, totalR: ps.totalR, profitFactor: ps.profitFactor, maxDD: ps.maxDD };
    }),
    luck: { dsr: r4(dsr), sr0: r4(sr0), sharpe: r4(sr), trials: args.trials, observations: vr.length, skew: r3(m.skew), kurt: r3(m.kurt), varianceOfSharpes: r4(varianceOfSharpes) },
    envelope: roundEnvelope(envelopeFor),
    rewind: rewindRes,
    perRegime: [0, 1, 2, 3].map(tag => {
      const ts = envs.flatMap((env, k) => base.perEnv[k].filter(t => env.tag[t.t] === tag));
      return { tag, trades: ts.length, totalR: r3(ts.reduce((s, t) => s + t.r, 0)) };
    }),
    sequence: { rs: merged.map(m => r4(m.t.r)), tradesPerDay: r3(tradesPerDay), days: merged.map(m => Math.floor(m.ms / 86_400_000)) },
    hiveCurve: fitHiveCurve(envs, vault, args.champion),
    prop: propResult ? { status: propResult.status, reason: propResult.reason, days: propResult.days, returnPct: r3(propResult.equityPct) } : null,
    hunter: { totalR: r3(huntedR), keptPct: bs.totalR > 0 ? r3(Math.max(0, huntedR) / bs.totalR) : null, attacks },
    grade: reasons.length ? "scrapped" : "probation",
    failureReasons: reasons,
  };
}

function roundEnvelope(e: ReturnType<typeof bootstrapEnvelope>) {
  return { ...e, ddP50: r3(e.ddP50), ddP95: r3(e.ddP95), ddP99: r3(e.ddP99), meanR: r4(e.meanR), meanP05: r4(e.meanP05), meanP95: r4(e.meanP95) };
}

/** Composite → P(up) on every vault row of every pair (downsampled breakpoints keep the report small). */
function fitHiveCurve(envs: Env[], vault: Segment[], g: Genome) {
  const xs: number[] = [], ys: number[] = [];
  let horizon = 6;
  envs.forEach((env, k) => {
    horizon = env.icHorizon ?? 6;
    for (let r = vault[k].from; r < Math.min(vault[k].to, env.n - horizon); r++) {
      const w = weightsFor(g, env.tag[r]);
      xs.push(scoreRow(env.X, env.L, r, env.g[r], w, weightNorm(w)).composite);
      ys.push(env.candles[r + horizon].close > env.candles[r].close ? 1 : 0);
    }
  });
  if (xs.length < 100) return null;
  const c = isotonic(xs, ys);
  const step = Math.max(1, Math.ceil(c.xs.length / 60));
  const keep = c.xs.map((_, i) => i).filter(i => i % step === 0 || i === c.xs.length - 1);
  return { xs: keep.map(i => Math.round(c.xs[i] * 1e4) / 1e4), ps: keep.map(i => Math.round(c.ps[i] * 1e4) / 1e4), horizon };
}
