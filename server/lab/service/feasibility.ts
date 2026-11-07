// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Feasibility check (§9.11), before any credit is spent: will the Vault have
// enough trades to judge this Blueprint? Uses validation data only.

import { PROFILES } from "../../tdci";
import type { BlueprintSpec } from "../engine/types";
import { makeEnv, sliceEnvData, nearestGrid } from "../engine/env";
import { makeSplits, trainingCut } from "../engine/splits";
import { runGenome } from "../engine/episode";
import { std } from "../engine/stats";
import { getEnvData } from "./envs";

export const MIN_VAULT_TRADES = 30;

export async function feasibility(spec: BlueprintSpec) {
  const prof = PROFILES[spec.style];
  const genome = {
    w: prof.layers.map(k => prof.defaultWeights[k] ?? 0),
    threshold: 30, // generous: most of the threshold range the Arena will search sits above this
    ...nearestGrid(prof.model.stopAtr, prof.model.rr),
  };
  const perPair: { symbol: string; validationTrades: number; expectedVaultTrades: number }[] = [];
  const rs: number[] = [];
  for (const symbol of spec.symbols) {
    const d = await getEnvData(symbol, spec.style);
    const s = makeSplits(Math.max(0, d.candles.length - 1), d.maxHold);
    const env = makeEnv(sliceEnvData(d, trainingCut(s)));
    const res = runGenome(env, genome, { ...s.validation, costMult: 1, constraints: spec.constraints });
    const valLen = Math.max(1, s.validation.to - s.validation.from), vaultLen = Math.max(0, s.vault.to - s.vault.from);
    perPair.push({ symbol, validationTrades: res.trades.length, expectedVaultTrades: Math.round(res.trades.length * vaultLen / valLen) });
    rs.push(...res.trades.map(t => t.r));
  }
  const expected = perPair.reduce((s, p) => s + p.expectedVaultTrades, 0);
  const sigmaR = rs.length > 1 ? std(rs) : 1.5;
  // Smallest true mean R per trade detectable at α = 0.05 (two-sided), power 0.8: MDE ≈ 2.8·σ/√n
  const mde = expected > 0 ? (2.8 * sigmaR) / Math.sqrt(expected) : null;
  const ok = expected >= MIN_VAULT_TRADES;
  const advice: string[] = [];
  if (!ok) {
    if (spec.symbols.length < 8) advice.push("Add pairs: each pair adds its own locked data to the exam.");
    if (spec.style === "position" || spec.style === "swing") advice.push("Switch to the Day style, which trades more often.");
    if (spec.constraints.sessionHoursUtc) advice.push("Widen the session hours.");
    if (spec.constraints.noWeekendHolding && spec.style !== "day" && spec.style !== "scalp") advice.push("Allow weekend holding, which this style needs.");
    advice.push("Lower the minimum trades-per-week target if you set one.");
  }
  return {
    ok, expectedVaultTrades: expected, minimum: MIN_VAULT_TRADES, perPair,
    sigmaR: Math.round(sigmaR * 1000) / 1000, mde: mde == null ? null : Math.round(mde * 1000) / 1000,
    message: ok
      ? `About ${expected} trades expected in the locked data. At that sample size the exam can detect an average edge of about ${mde?.toFixed(2)}R per trade.`
      : `Only about ${expected} trades expected in the locked data; the Vault Exam needs at least ${MIN_VAULT_TRADES} to judge a strategy.`,
    advice,
  };
}
