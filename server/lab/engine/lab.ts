// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// The full Phase 1 pipeline for one run: split → Arena (training + validation
// only; vault bars are cut off) → Vault Exam (once) → grade. Pure and
// deterministic: same inputs and seed give byte-identical JSON.

import { makeEnv, sliceEnvData, type EnvData } from "./env";
import { makeSplits, vaultHash, trainingCut, type Splits } from "./splits";
import { train, genomeHash, LIMITS, type Progress, type TrainResult } from "./evolve";
import { vaultExam, type VaultReport } from "./vault";
import type { BlueprintSpec, FailureReason, Grade } from "./types";

export const ENGINE_VERSION = 1;

export interface LabInput {
  envData: EnvData[];
  spec: BlueprintSpec;
  population?: number; generations?: number; episodes?: number; seed: number;
  successiveHalving?: boolean;
  defaultWeights: number[]; defaultStop: number; defaultRr: number;
  calibrationWeights?: number[] | null;
  userThreshold?: number | null;
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
  vault: VaultReport | null;
  grade: Grade;
  failureReasons: FailureReason[];
}

export function runLab(input: LabInput, hooks: { onProgress?: (p: Progress) => void; isCancelled?: () => boolean } = {}): LabResult {
  const population = Math.min(input.population ?? LIMITS.population.default, LIMITS.population.max);
  const generations = Math.min(input.generations ?? LIMITS.generations.default, LIMITS.generations.max);
  const episodes = input.episodes ?? LIMITS.episodes;
  const successiveHalving = input.successiveHalving ?? true;

  const splits: Splits[] = input.envData.map(d => makeSplits(Math.max(0, d.candles.length - 1), d.maxHold));
  const vaultHashes: Record<string, string> = {};
  input.envData.forEach((d, k) => { vaultHashes[d.symbol] = vaultHash(d, splits[k].vault); });

  // Training code gets envs with every vault candle removed (invariant 2)
  const trainingEnvs = input.envData.map((d, k) => makeEnv(sliceEnvData(d, trainingCut(splits[k]))));
  const tr = train(trainingEnvs, splits.map(s => s.train), splits.map(s => s.validation), {
    spec: input.spec, population, generations, episodes, seed: input.seed, successiveHalving,
    defaultWeights: input.defaultWeights, defaultStop: input.defaultStop, defaultRr: input.defaultRr,
    calibrationWeights: input.calibrationWeights, userThreshold: input.userThreshold,
  }, hooks);

  const splitInfo: LabResult["splits"] = {};
  input.envData.forEach((d, k) => {
    const s = splits[k], t = (r: number) => d.candles[Math.min(Math.max(0, r), d.candles.length - 1)]?.time ?? "";
    splitInfo[d.symbol] = {
      trainFrom: t(s.train.from), trainTo: t(s.train.to - 1), validationFrom: t(s.validation.from), validationTo: t(s.validation.to - 1),
      vaultFrom: t(s.vault.from), vaultTo: t(s.vault.to), embargoBars: s.embargo,
    };
  });

  const { validationTrades, ...championPublic } = tr.champion ?? ({} as any);
  const base = {
    engineVersion: ENGINE_VERSION,
    config: { population, generations, episodes, seed: input.seed, successiveHalving },
    splits: splitInfo, trials: tr.trials, evaluations: tr.evaluations, generationsRun: tr.generationsRun, levelReached: tr.levelReached, cancelled: tr.cancelled,
    champion: tr.champion ? championPublic : null, hallOfFame: tr.hallOfFame,
  };
  if (tr.cancelled) return { ...base, vault: null, grade: "scrapped", failureReasons: [] };
  if (!tr.champion) return { ...base, vault: null, grade: "scrapped", failureReasons: ["no_champion"] };

  const hash = genomeHash(tr.champion.genome);
  if (input.claimVault && !input.claimVault(hash, vaultHashes)) {
    throw new Error("Vault already opened for this strategy: the Vault Exam runs only once.");
  }
  const fullEnvs = input.envData.map(makeEnv);
  const vault = vaultExam({
    envs: fullEnvs, vault: splits.map(s => s.vault), vaultHashes, spec: input.spec, champion: tr.champion.genome,
    baselineWeights: input.defaultWeights, defaultStop: input.defaultStop, defaultRr: input.defaultRr,
    validationTrades: tr.champion.validationTrades, candidateSharpes: tr.candidateSharpes, trials: tr.trials, seed: input.seed,
  });
  return { ...base, vault, grade: vault.grade, failureReasons: vault.failureReasons };
}
