// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// The full Phase 1 pipeline for one run: split → Arena (training + validation
// only; vault bars are cut off) → Vault Exam (once) → grade. Pure and
// deterministic: same inputs and seed give byte-identical JSON.

import { makeEnv, sliceEnvData, type EnvData } from "./env";
import { makeSplits, vaultHash, trainingCut, type Splits } from "./splits";
import { trainSteps, genomeHash, LIMITS, type Progress, type TrainResult } from "./evolve";
import { vaultExam, type VaultReport } from "./vault";
import type { BlueprintSpec, FailureReason, Genome, Grade } from "./types";
import type { MirrorEnvModel } from "./worlds";

export const ENGINE_VERSION = 1;

export interface LabInput {
  envData: EnvData[];
  spec: BlueprintSpec;
  population?: number; generations?: number; episodes?: number; seed: number;
  successiveHalving?: boolean;
  defaultWeights: number[]; defaultStop: number; defaultRr: number;
  calibrationWeights?: number[] | null;
  userThreshold?: number | null;
  /** Phase 2 (Rewind): Gen Zero genome fitted to the user's entries, and their worst drawdown windows. */
  userGenome?: Genome | null;
  rewindWindows?: { symbol: string; fromMs: number; toMs: number }[];
  /** Phase 2: Mirror cost model per env (same order as envData). */
  mirror?: (MirrorEnvModel | null)[];
  /** Called once before the vault opens; must return false if this (genome, vault) was already examined. */
  claimVault?: (genomeHash: string, vaultHashes: Record<string, string>) => boolean;
}

export interface LabResult {
  engineVersion: number;
  config: { population: number; generations: number; episodes: number; seed: number; successiveHalving: boolean };
  splits: Record<string, { trainFrom: string; trainTo: string; validationFrom: string; validationTo: string; vaultFrom: string; vaultTo: string; embargoBars: number }>;
  trials: number;
  /** Agent-episode evaluations performed (compute used). */
  evaluations: number;
  generationsRun: number;
  levelReached: number;
  cancelled: boolean;
  champion: Omit<NonNullable<TrainResult["champion"]>, "validationTrades"> | null;
  hallOfFame: TrainResult["hallOfFame"];
  /** Where the Arena's trading costs came from: Mirror (real fills, shrunk toward the prior) or the fixed assumption. */
  costModel: { source: "mirror" | "assumed"; fills: number };
  vault: VaultReport | null;
  grade: Grade;
  failureReasons: FailureReason[];
}

function prepareLab(input: LabInput) {
  const population = Math.min(input.population ?? LIMITS.population.default, LIMITS.population.max);
  const generations = Math.min(input.generations ?? LIMITS.generations.default, LIMITS.generations.max);
  const episodes = input.episodes ?? LIMITS.episodes;
  const successiveHalving = input.successiveHalving ?? true;
  const splits: Splits[] = input.envData.map(d => makeSplits(Math.max(0, d.candles.length - 1), d.maxHold));
  const vaultHashes: Record<string, string> = {};
  input.envData.forEach((d, k) => { vaultHashes[d.symbol] = vaultHash(d, splits[k].vault); });
  // Training code gets envs with every vault candle removed (invariant 2)
  const trainingEnvs = input.envData.map((d, k) => makeEnv(sliceEnvData(d, trainingCut(splits[k]))));
  const steps = trainSteps(trainingEnvs, splits.map(s => s.train), splits.map(s => s.validation), {
    spec: input.spec, population, generations, episodes, seed: input.seed, successiveHalving,
    defaultWeights: input.defaultWeights, defaultStop: input.defaultStop, defaultRr: input.defaultRr,
    calibrationWeights: input.calibrationWeights, userThreshold: input.userThreshold, mirror: input.mirror,
    extraSeeds: input.userGenome ? [input.userGenome] : [],
  });
  return { config: { population, generations, episodes, seed: input.seed, successiveHalving }, splits, vaultHashes, steps };
}

function baseResult(input: LabInput, prep: ReturnType<typeof prepareLab>, tr: TrainResult) {
  const splitInfo: LabResult["splits"] = {};
  input.envData.forEach((d, k) => {
    const s = prep.splits[k], t = (r: number) => d.candles[Math.min(Math.max(0, r), d.candles.length - 1)]?.time ?? "";
    splitInfo[d.symbol] = {
      trainFrom: t(s.train.from), trainTo: t(s.train.to - 1), validationFrom: t(s.validation.from), validationTo: t(s.validation.to - 1),
      vaultFrom: t(s.vault.from), vaultTo: t(s.vault.to), embargoBars: s.embargo,
    };
  });
  const { validationTrades: _v, ...championPublic } = tr.champion ?? ({} as any);
  return {
    engineVersion: ENGINE_VERSION, config: prep.config,
    splits: splitInfo, trials: tr.trials, evaluations: tr.evaluations, generationsRun: tr.generationsRun, levelReached: tr.levelReached, cancelled: tr.cancelled,
    champion: tr.champion ? championPublic : null, hallOfFame: tr.hallOfFame,
    costModel: input.mirror?.some(Boolean)
      ? { source: "mirror" as const, fills: input.mirror.reduce((s, m) => s + (m?.fills ?? 0), 0) }
      : { source: "assumed" as const, fills: 0 },
  };
}

function examine(input: LabInput, prep: ReturnType<typeof prepareLab>, tr: TrainResult): VaultReport {
  return vaultExam({
    envs: input.envData.map(makeEnv), vault: prep.splits.map(s => s.vault), vaultHashes: prep.vaultHashes, spec: input.spec, champion: tr.champion!.genome,
    baselineWeights: input.defaultWeights, defaultStop: input.defaultStop, defaultRr: input.defaultRr,
    validationTrades: tr.champion!.validationTrades, candidateSharpes: tr.candidateSharpes, trials: tr.trials, seed: input.seed,
    rewindWindows: input.rewindWindows,
  });
}

const VAULT_ONCE = "Vault already opened for this strategy: the Vault Exam runs only once.";

export function runLab(input: LabInput, hooks: { onProgress?: (p: Progress) => void; isCancelled?: () => boolean } = {}): LabResult {
  const prep = prepareLab(input);
  let step = prep.steps.next(false);
  while (!step.done) { hooks.onProgress?.(step.value); step = prep.steps.next(!!hooks.isCancelled?.()); }
  const tr = step.value;
  const base = baseResult(input, prep, tr);
  if (tr.cancelled) return { ...base, vault: null, grade: "scrapped", failureReasons: [] };
  if (!tr.champion) return { ...base, vault: null, grade: "scrapped", failureReasons: ["no_champion"] };
  if (input.claimVault && !input.claimVault(genomeHash(tr.champion.genome), prep.vaultHashes)) throw new Error(VAULT_ONCE);
  const vault = examine(input, prep, tr);
  return { ...base, vault, grade: vault.grade, failureReasons: vault.failureReasons };
}

/**
 * Same pipeline for the worker: awaits between generations (keeps the event
 * loop responsive, lets progress be saved and Stop be honoured) and claims the
 * vault through an async, persistent check.
 */
export async function runLabAsync(
  input: Omit<LabInput, "claimVault">,
  hooks: {
    onProgress?: (p: Progress) => Promise<void> | void;
    isCancelled?: () => Promise<boolean> | boolean;
    claimVault: (genomeHash: string, vaultHashes: Record<string, string>) => Promise<boolean>;
  },
): Promise<LabResult> {
  const prep = prepareLab(input);
  let step = prep.steps.next(false);
  while (!step.done) {
    await hooks.onProgress?.(step.value);
    await new Promise(r => setImmediate(r));
    step = prep.steps.next(!!(await hooks.isCancelled?.()));
  }
  const tr = step.value;
  const base = baseResult(input, prep, tr);
  if (tr.cancelled) return { ...base, vault: null, grade: "scrapped", failureReasons: [] };
  if (!tr.champion) return { ...base, vault: null, grade: "scrapped", failureReasons: ["no_champion"] };
  if (!(await hooks.claimVault(genomeHash(tr.champion.genome), prep.vaultHashes))) throw new Error(VAULT_ONCE);
  const vault = examine(input, prep, tr);
  return { ...base, vault, grade: vault.grade, failureReasons: vault.failureReasons };
}

/** What a champion's Vault report predicts, used as the yardstick for Shadow and Tripwire. */
export function expectationFrom(v: VaultReport) {
  const n = v.base.trades, m = v.envelope.meanR;
  // Per-trade sigma from the bootstrap 90% interval of the mean: width = 2 * 1.645 * sigma / sqrt(n)
  const sigma = n > 1 ? Math.max(1e-6, ((v.envelope.meanP95 - v.envelope.meanP05) / (2 * 1.6449)) * Math.sqrt(n)) : 1;
  return { meanR: m, sigmaR: sigma, meanP05: v.envelope.meanP05, meanP95: v.envelope.meanP95, ddP95: v.envelope.ddP95, ddP99: v.envelope.ddP99 };
}
