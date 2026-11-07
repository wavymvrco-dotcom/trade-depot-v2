// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Storm Mode service (§11.5): after a strategy passes the Vault Exam, run its
// champion through 200 storm worlds built from recent real bars of its pairs.
// The verdict is stored on the strategy as pass/fail. It never changes the
// grade and never feeds back into selection (invariant 6).

import { eq } from "drizzle-orm";
import { db } from "../../db";
import { blueprints, labRuns, strategyLicenses } from "@shared/schema";
import { blueprintSpecSchema } from "@shared/lab-schemas";
import { PROFILES, type StyleKey } from "../../tdci";
import { loadContext, costFor } from "../../tdci-service";
import { getBoss, QUEUES } from "../../jobs";
import { runStorm, type StormMarket } from "../engine/storm";
import { hashSeed } from "../engine/rng";
import { validateLayer } from "../engine/forge/dsl";
import { forgeLayers } from "@shared/schema";
import type { Genome, BlueprintSpec } from "../engine/types";
import type { VaultReport } from "../engine/vault";
import { setStormResult } from "./licenses";

export const STORM_WORLDS = 200;

export async function runStormFor(licenseId: string) {
  const [lic] = await db.select().from(strategyLicenses).where(eq(strategyLicenses.id, licenseId));
  if (!lic || lic.grade === "scrapped" || !lic.runId) return null;
  const [run] = await db.select({ blueprintId: labRuns.blueprintId }).from(labRuns).where(eq(labRuns.id, lic.runId));
  const [bp] = run ? await db.select({ spec: blueprints.spec }).from(blueprints).where(eq(blueprints.id, run.blueprintId)) : [];
  const spec = blueprintSpecSchema.parse(bp?.spec) as BlueprintSpec;
  const style = lic.style as StyleKey, profile = PROFILES[style];
  const vault = lic.vault as VaultReport;
  // The limit: the prop rules' max drawdown (in R at the Blueprint's risk) if set, otherwise the Vault's 99th-percentile drawdown
  const limitR = spec.prop ? spec.prop.maxDrawdownPct / spec.risk.riskPercentPerTrade : vault.envelope.ddP99;
  // Same length as the Vault period (20% of the style's history) plus indicator warmup, so the
  // Vault's drawdown limit is compared like for like (longer spans naturally draw down further)
  const bars = Math.round(profile.history.calibrate * 0.2) + 300;
  const markets: StormMarket[] = [];
  for (const symbol of lic.symbols as string[]) {
    const ctx = await loadContext(symbol, profile, bars);
    markets.push({ symbol, p: ctx.p, atr: ctx.pAtr, cot: { base: ctx.cotBase, quote: ctx.cotQuote }, rates: { base: ctx.rateBase, quote: ctx.rateQuote }, spread: ctx.spread, cost: costFor(symbol, style) });
  }
  // Forge layers the champion uses, in the same order as its weights
  const keys = lic.layers as string[];
  const fl: { id: string; node: any }[] = [];
  for (const k of keys.filter(k => k.startsWith("forge:"))) {
    const [row] = await db.select({ dsl: forgeLayers.dsl }).from(forgeLayers).where(eq(forgeLayers.id, k.slice(6)));
    const v = validateLayer(row?.dsl);
    if (v.ok) fl.push({ id: k.slice(6), node: v.node });
  }
  const t0 = Date.now();
  const verdict = runStorm({ markets, profile, champion: lic.genome as Genome, spec, forgeLayers: fl, worlds: STORM_WORLDS, seed: hashSeed(lic.id), limitR });
  const result = { ...verdict, ranAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000) };
  await setStormResult(lic.id, result);
  console.log(`[storm] license ${lic.id}: ${verdict.survived}/${verdict.worlds} worlds survived → ${verdict.passed ? "PASS" : "FAIL"}`);
  return result;
}

export async function enqueueStorm(licenseId: string) {
  const boss = await getBoss();
  return boss.send(QUEUES.labStorm, { licenseId }, { singletonKey: licenseId });
}

export async function startStormWorker() {
  const boss = await getBoss();
  await boss.work<{ licenseId: string }>(QUEUES.labStorm, { batchSize: 1 }, async ([job]) => { await runStormFor(job.data.licenseId); });
}
