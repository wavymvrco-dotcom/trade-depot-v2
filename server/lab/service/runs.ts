// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Training runs: create (limits + credits), the worker job that runs the
// Arena and the Vault Exam, cancel, read. Logs carry IDs only, never user data.

import { randomInt, createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { blueprints, labRuns, userSettings, vaultOpenings } from "@shared/schema";
import { blueprintSpecSchema } from "@shared/lab-schemas";
import { PROFILES, type StyleKey } from "../../tdci";
import { latestCalibration } from "../../tdci-service";
import { storage } from "../../storage";
import { getBoss, QUEUES } from "../../jobs";
import { runLabAsync, type LabResult } from "../engine/lab";
import { genomeHash } from "../engine/evolve";
import { LIMITS } from "../engine/evolve";
import type { BlueprintSpec } from "../engine/types";
import { getEnvData } from "./envs";
import { TIERS, tierOf, monthKey } from "./tiers";
import { createFromExam } from "./licenses";
import { mirrorModelFor } from "./mirror";
import { userGenome, worstDrawdownWindows } from "./rewind";

export class LabError extends Error { constructor(message: string, public status = 400) { super(message); } }

const defaultsFor = (style: StyleKey) => {
  const prof = PROFILES[style];
  return { defaultWeights: prof.layers.map(k => prof.defaultWeights[k] ?? 0), defaultStop: prof.model.stopAtr, defaultRr: prof.model.rr };
};

// ─── Create / read / cancel ───────────────────────────────────────────────────

export async function createRun(userId: string, body: { blueprintId: string; population?: number; generations?: number; seed?: number }) {
  const [bp] = await db.select().from(blueprints).where(and(eq(blueprints.id, body.blueprintId), eq(blueprints.userId, userId)));
  if (!bp) throw new LabError("Blueprint not found", 404);
  const spec = blueprintSpecSchema.parse(bp.spec);
  const settings = await storage.getUserSettings(userId);
  const tier = TIERS[tierOf(settings?.labTier)];
  const population = body.population ?? Math.min(LIMITS.population.default, tier.maxPopulation);
  const generations = body.generations ?? Math.min(LIMITS.generations.default, tier.maxGenerations);
  if (population > tier.maxPopulation || generations > tier.maxGenerations) {
    throw new LabError(`Your plan allows up to ${tier.maxPopulation} agents and ${tier.maxGenerations} generations per run.`);
  }
  const active = await db.select({ id: labRuns.id }).from(labRuns).where(and(eq(labRuns.userId, userId), inArray(labRuns.status, ["queued", "running"])));
  if (active.length) throw new LabError("You already have a run in progress. Wait for it to finish or stop it first.", 409);

  // Monthly credits: reset when the month changes; one credit per run
  const month = monthKey();
  const used = settings?.labCreditsMonth === month ? settings?.labCreditsUsed ?? 0 : 0;
  if (used >= tier.runsPerMonth) throw new LabError(`You've used all ${tier.runsPerMonth} Lab runs for this month.`, 402);
  await db.update(userSettings).set({ labCreditsUsed: used + 1, labCreditsMonth: month }).where(eq(userSettings.userId, userId));

  const seed = body.seed ?? randomInt(0, 2 ** 31 - 1);
  const [run] = await db.insert(labRuns).values({
    userId, blueprintId: bp.id, style: spec.style, symbols: spec.symbols, seed,
    config: { population, generations, episodes: LIMITS.episodes, successiveHalving: true },
    status: "queued",
  }).returning();
  const boss = await getBoss();
  await boss.send(QUEUES.labTrain, { runId: run.id });
  return run;
}

export async function getRun(userId: string, id: string) {
  const [run] = await db.select().from(labRuns).where(and(eq(labRuns.id, id), eq(labRuns.userId, userId)));
  return run ?? null;
}

export async function listRuns(userId: string) {
  return db.select({
    id: labRuns.id, blueprintId: labRuns.blueprintId, style: labRuns.style, symbols: labRuns.symbols, status: labRuns.status,
    trials: labRuns.trials, createdAt: labRuns.createdAt, finishedAt: labRuns.finishedAt,
    grade: sql<string | null>`${labRuns.result}->>'grade'`,
  }).from(labRuns).where(eq(labRuns.userId, userId)).orderBy(desc(labRuns.createdAt)).limit(50);
}

export async function cancelRun(userId: string, id: string) {
  const run = await getRun(userId, id);
  if (!run) throw new LabError("Run not found", 404);
  if (run.status === "queued") {
    await db.update(labRuns).set({ status: "cancelled", finishedAt: new Date(), cancelRequested: true }).where(eq(labRuns.id, id));
  } else if (run.status === "running") {
    await db.update(labRuns).set({ cancelRequested: true }).where(eq(labRuns.id, id));
  }
  return getRun(userId, id);
}

// ─── The worker job ───────────────────────────────────────────────────────────

const combinedVaultHash = (hashes: Record<string, string>) =>
  createHash("sha256").update(JSON.stringify(Object.keys(hashes).sort().map(k => [k, hashes[k]]))).digest("hex");

export async function processRun(runId: string) {
  const [run] = await db.select().from(labRuns).where(eq(labRuns.id, runId));
  if (!run || run.result || run.status === "cancelled" || run.status === "done") return; // already finished
  const [bp] = await db.select().from(blueprints).where(eq(blueprints.id, run.blueprintId));
  const spec = blueprintSpecSchema.parse(bp.spec) as BlueprintSpec;
  const style = spec.style;
  const setProgress = (progress: unknown) => db.update(labRuns).set({ progress: progress as any }).where(eq(labRuns.id, runId));

  await db.update(labRuns).set({ status: "running", startedAt: new Date() }).where(eq(labRuns.id, runId));
  console.log(`[lab] run ${runId} started (${spec.symbols.length} pairs, ${style})`);
  const t0 = Date.now();
  try {
    await setProgress({ phase: "Loading market data", generation: 0, generations: (run.config as any).generations });
    const envData = [];
    for (const s of spec.symbols) envData.push(await getEnvData(s, style));
    const settings = await storage.getUserSettings(run.userId);
    const broker = settings?.brokerType === "mql5" ? "mt5" : settings?.brokerType;
    const mirror = await Promise.all(spec.symbols.map(s => mirrorModelFor(broker, s, style).catch(() => null)));
    // Rewind (§10.3): Gen Zero "you", and the user's worst drawdown periods for the Vault Exam
    const userG = await userGenome(run.userId, style, envData).catch(() => null);
    const rewindWindows = await worstDrawdownWindows(run.userId, spec.symbols).catch(() => []);
    const cal = await latestCalibration(spec.symbols[0], style).catch(() => null);
    const calRes = cal?.result as any;
    const prof = PROFILES[style];
    const calibrationWeights = calRes?.weightsLearned ? prof.layers.map(k => Number(calRes.weights?.[k] ?? 0)) : null;

    let gen = 0;
    const cfg = run.config as { population: number; generations: number; episodes: number; successiveHalving: boolean };
    const result = await runLabAsync({
      envData, spec, seed: run.seed, population: cfg.population, generations: cfg.generations, episodes: cfg.episodes,
      successiveHalving: cfg.successiveHalving, ...defaultsFor(style), calibrationWeights, userThreshold: settings?.tdciMinScore ?? null, mirror,
      userGenome: userG, rewindWindows,
    }, {
      onProgress: p => { gen = p.generation; return setProgress({ ...p, phase: "Arena" }).then(() => {}); },
      isCancelled: async () => {
        if (gen % 3 !== 0) return false;
        const [r] = await db.select({ c: labRuns.cancelRequested }).from(labRuns).where(eq(labRuns.id, runId));
        return !!r?.c;
      },
      claimVault: async (hash, vaultHashes) => {
        const vh = combinedVaultHash(vaultHashes);
        const ins = await db.insert(vaultOpenings).values({ runId, genomeHash: hash, vaultHash: vh }).onConflictDoNothing().returning();
        if (ins.length) return true;
        // A retry after a crash re-runs the same deterministic exam; allowed only if no result was ever stored
        const [prev] = await db.select().from(vaultOpenings).where(and(eq(vaultOpenings.runId, runId), eq(vaultOpenings.genomeHash, hash)));
        const [cur] = await db.select({ result: labRuns.result }).from(labRuns).where(eq(labRuns.id, runId));
        return !!prev && prev.vaultHash === vh && !cur?.result;
      },
    });

    await finishRun(run, bp, spec, result);
    console.log(`[lab] run ${runId} ${result.cancelled ? "cancelled" : "done"} in ${((Date.now() - t0) / 1000).toFixed(1)}s, trials=${result.trials}, grade=${result.grade}`);
  } catch (e: any) {
    console.error(`[lab] run ${runId} failed: ${e.message}`);
    await db.update(labRuns).set({ status: "failed", error: String(e.message).slice(0, 500), finishedAt: new Date() }).where(eq(labRuns.id, runId));
    // A run that failed for system reasons gives its credit back
    await db.update(userSettings).set({ labCreditsUsed: sql`greatest(0, ${userSettings.labCreditsUsed} - 1)` }).where(eq(userSettings.userId, run.userId));
  }
}

async function finishRun(run: typeof labRuns.$inferSelect, bp: typeof blueprints.$inferSelect, spec: BlueprintSpec, result: LabResult) {
  await db.update(labRuns).set({
    status: result.cancelled ? "cancelled" : "done", result: result as any, trials: result.trials, finishedAt: new Date(),
  }).where(eq(labRuns.id, run.id));
  if (result.cancelled || !result.champion || !result.vault) return;
  const v = result.vault;
  const best = [...v.perPair].sort((a, b) => b.totalR - a.totalR).slice(0, 3).map(p => p.symbol);
  const passed = v.grade === "probation";
  await createFromExam({
    userId: run.userId, runId: run.id, kind: "lab",
    name: `${bp.name} · ${run.id.slice(0, 6)}`, style: spec.style, symbols: best,
    genome: result.champion.genome as any, genomeHash: genomeHash(result.champion.genome), layers: PROFILES[spec.style].layers as any,
    vault: v as any, vaultHash: combinedVaultHash(v.vaultHashes),
  }, passed, passed ? "Passed the Vault Exam" : `Vault Exam: ${v.failureReasons.join(", ")}`, { runId: run.id });
}

export async function startLabRunWorker() {
  const boss = await getBoss();
  await boss.work<{ runId: string }>(QUEUES.labTrain, { batchSize: 1 }, async ([job]) => { await processRun(job.data.runId); });
}
