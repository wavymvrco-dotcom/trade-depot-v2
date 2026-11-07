// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Arena evolution (§9.7, §5.4). Every agent in a generation faces the same
// sampled worlds; successive halving spends most evaluations on promising
// agents; the top few each generation are checked on validation data and
// every such check is counted as a trial (invariant 3).

import { createHash } from "node:crypto";
import type { Env } from "./env";
import { nearestGrid } from "./env";
import type { BlueprintSpec, Genome, Trade } from "./types";
import { STOP_GRID, RR_GRID, THRESHOLD_MIN, THRESHOLD_MAX } from "./types";
import type { Segment } from "./splits";
import { rng, type Rng } from "./rng";
import { runGenome } from "./episode";
import { aggregateFitness, episodeScore, validationScore, type EpisodeScore } from "./fitness";
import { hardnessIndex, sampleEpisodes, MAX_LEVEL, type Episode } from "./worlds";
import { mean, sharpe, maxDrawdown, quantile } from "./stats";

export const LIMITS = { population: { default: 128, max: 256 }, generations: { default: 40, max: 80 }, episodes: 8 };

export interface TrainConfig {
  spec: BlueprintSpec;
  population: number;
  generations: number;
  episodes: number;
  seed: number;
  successiveHalving: boolean;
  /** Profile defaults for this style, in layer order. */
  defaultWeights: number[];
  defaultStop: number; defaultRr: number;
  /** Optional Gen Zero members: latest calibration weights, the user's current threshold. */
  calibrationWeights?: number[] | null;
  userThreshold?: number | null;
  hallOfFamePerGeneration?: number;
}

export interface Progress {
  generation: number; generations: number; level: number;
  fitness: number[]; elites: number[];
  best: number; median: number; deaths: number;
  trials: number;
  championCurve: number[];
}

export interface HallEntry {
  hash: string; genome: Genome; generation: number; level: number; fitness: number;
  validation: { trades: number; totalR: number; maxDD: number; V: number; sharpe: number };
  belt: number;
}

export interface TrainResult {
  trials: number;
  generationsRun: number;
  levelReached: number;
  cancelled: boolean;
  champion: (HallEntry & { validationTrades: number[] }) | null;
  hallOfFame: HallEntry[];
  /** Per-trade Sharpe of every hall-of-fame candidate checked on validation (for DSR's variance). */
  candidateSharpes: number[];
  evaluations: number;
}

// ─── Genome helpers ───────────────────────────────────────────────────────────

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function genomeHash(g: Genome) {
  return createHash("sha256").update(JSON.stringify({ w: g.w.map(r3), threshold: g.threshold, stopIdx: g.stopIdx, rrIdx: g.rrIdx })).digest("hex");
}

/** Grid bounds allowed by the Blueprint (maxStopAtr, minRr). */
export function gridBounds(spec: BlueprintSpec) {
  const maxStop = spec.constraints.maxStopAtr;
  const minRr = spec.constraints.minRr;
  let stopHi = STOP_GRID.length - 1;
  if (maxStop != null) while (stopHi > 0 && STOP_GRID[stopHi] > maxStop) stopHi--;
  let rrLo = 0;
  if (minRr != null) while (rrLo < RR_GRID.length - 1 && RR_GRID[rrLo] < minRr) rrLo++;
  return { stopHi, rrLo };
}

/** Clamp and round a genome into the valid space for this Blueprint. */
export function normalizeGenome(g: Genome, spec: BlueprintSpec): Genome {
  const { stopHi, rrLo } = gridBounds(spec);
  return {
    w: g.w.map(v => r3(clamp(v, -1, 1))),
    threshold: Math.round(clamp(g.threshold, THRESHOLD_MIN, THRESHOLD_MAX)),
    stopIdx: clamp(Math.round(g.stopIdx), 0, stopHi),
    rrIdx: clamp(Math.round(g.rrIdx), rrLo, RR_GRID.length - 1),
  };
}

function genZero(cfg: TrainConfig, rand: Rng): Genome[] {
  const { spec } = cfg;
  const base = nearestGrid(cfg.defaultStop, cfg.defaultRr);
  const pop: Genome[] = [];
  pop.push({ w: [...cfg.defaultWeights], threshold: 60, ...base });
  if (cfg.calibrationWeights?.some(v => v !== 0)) pop.push({ w: [...cfg.calibrationWeights], threshold: 60, ...base });
  if (cfg.userThreshold != null) pop.push({ w: [...cfg.defaultWeights], threshold: cfg.userThreshold, ...base });
  while (pop.length < cfg.population) {
    pop.push({
      w: cfg.defaultWeights.map(v => v + rand.normal(0, 0.3)),
      threshold: rand.int(THRESHOLD_MIN, THRESHOLD_MAX + 1),
      stopIdx: rand.int(0, STOP_GRID.length), rrIdx: rand.int(0, RR_GRID.length),
    });
  }
  return pop.map(g => normalizeGenome(g, spec));
}

function crossover(a: Genome, b: Genome, rand: Rng): Genome {
  return {
    w: a.w.map((v, j) => (rand.next() < 0.5 ? v : b.w[j])),
    threshold: rand.next() < 0.5 ? a.threshold : b.threshold,
    stopIdx: rand.next() < 0.5 ? a.stopIdx : b.stopIdx,
    rrIdx: rand.next() < 0.5 ? a.rrIdx : b.rrIdx,
  };
}

function mutate(g: Genome, rand: Rng): Genome {
  const w = g.w.map(v => {
    let x = v;
    if (rand.next() < 0.3) x += rand.normal(0, 0.25);
    if (rand.next() < 0.05) x = 0;
    return x;
  });
  const step = () => (rand.next() < 0.15 ? (rand.next() < 0.5 ? -1 : 1) : 0);
  return { w, threshold: g.threshold + Math.round(rand.normal(0, 6)), stopIdx: g.stopIdx + step(), rrIdx: g.rrIdx + step() };
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

function evalEpisode(envs: Env[], g: Genome, ep: Episode, spec: BlueprintSpec): EpisodeScore {
  const env = envs[ep.envIdx];
  const res = runGenome(env, g, { from: ep.from, to: ep.to, limit: ep.limit, costMult: ep.costMult, miss: ep.miss, constraints: spec.constraints });
  const spanMs = env.timeMs(Math.min(ep.to, env.n)) - env.timeMs(ep.from);
  return episodeScore(spec, res.trades, res.died, spanMs);
}

/** Trades on a fixed segment of every env, base costs, no randomization. */
export function evalSegments(envs: Env[], g: Genome, segs: Segment[], spec: BlueprintSpec, costMult = 1) {
  const perEnv: Trade[][] = envs.map((env, k) => runGenome(env, g, { from: segs[k].from, to: segs[k].to, limit: segs[k].limit, costMult, miss: null, constraints: spec.constraints }).trades);
  return { perEnv, all: perEnv.flat().map(t => t.r) };
}

const downsample = (xs: number[], n = 100) => xs.length <= n ? xs : Array.from({ length: n }, (_, k) => xs[Math.round(k * (xs.length - 1) / (n - 1))]);
const equity = (rs: number[]) => { let s = 0; return rs.map(r => r3((s += r))); };

// ─── Training loop ────────────────────────────────────────────────────────────

/** Run the whole Arena synchronously. */
export function train(
  envs: Env[], train: Segment[], validation: Segment[], cfg: TrainConfig,
  hooks: { onProgress?: (p: Progress) => void; isCancelled?: () => boolean } = {},
): TrainResult {
  const it = trainSteps(envs, train, validation, cfg);
  let step = it.next(false);
  while (!step.done) {
    hooks.onProgress?.(step.value);
    step = it.next(!!hooks.isCancelled?.());
  }
  return step.value;
}

/**
 * The Arena as a generator: yields progress after every generation so callers
 * can save it, yield to the event loop, or stop: pass `true` to next() and the
 * Arena ends after that generation, returning the result so far (cancelled).
 */
export function* trainSteps(
  envs: Env[], train: Segment[], validation: Segment[], cfg: TrainConfig,
): Generator<Progress, TrainResult, boolean> {
  const { spec } = cfg;
  const rand = rng(cfg.seed);
  const hard = envs.map(hardnessIndex);
  const hofPerGen = cfg.hallOfFamePerGeneration ?? 3;
  let pop = genZero(cfg, rand);
  let level = 1, streak = 0, levelReached = 1;
  let trials = 0, evaluations = 0, cancelled = false, generationsRun = 0;
  const seen = new Set<string>();
  const hof: HallEntry[] = [];
  const candidateSharpes: number[] = [];
  const valTradesByHash = new Map<string, number[]>();
  let champion: HallEntry | null = null;

  for (let gen = 0; gen < cfg.generations; gen++) {
    const worldRand = rand.fork();
    const episodes = sampleEpisodes(envs, train, hard, level, cfg.episodes, worldRand);
    const P = pop.length;
    const scores: EpisodeScore[][] = pop.map(() => []);
    // Successive halving: 2 episodes each, keep the top half, 2 more, ... until survivors have all E
    let alive = pop.map((_, i) => i);
    let done = 0;
    const rungStep = cfg.successiveHalving ? 2 : cfg.episodes;
    while (done < cfg.episodes) {
      const upto = Math.min(cfg.episodes, done + rungStep);
      for (const i of alive) for (let e = done; e < upto; e++) { scores[i].push(evalEpisode(envs, pop[i], episodes[e], spec)); evaluations++; }
      done = upto;
      if (done < cfg.episodes) {
        const ranked = alive.map(i => ({ i, F: aggregateFitness(spec, scores[i]).F })).sort((a, b) => b.F - a.F || a.i - b.i);
        alive = ranked.slice(0, Math.max(2, Math.ceil(ranked.length / 2))).map(x => x.i);
      }
    }
    const full = new Set(alive);
    const fit = scores.map(s => aggregateFitness(spec, s));
    const F = fit.map(f => f.F);
    const deaths = fit.reduce((s, f) => s + f.deaths, 0);
    // Rank: fully evaluated agents first (only they can be elites), then by fitness
    const order = pop.map((_, i) => i).sort((a, b) => (Number(full.has(b)) - Number(full.has(a))) || (F[b] - F[a]) || (a - b));
    const eliteCount = Math.max(1, Math.round(P * 0.1));
    const elites = order.filter(i => full.has(i)).slice(0, eliteCount);

    // Hall of fame: top fully evaluated, never-seen genomes, checked on validation (each one is a trial)
    let added = 0;
    for (const i of order) {
      if (added >= hofPerGen) break;
      if (!full.has(i)) continue;
      const h = genomeHash(pop[i]);
      if (seen.has(h)) continue;
      seen.add(h);
      added++;
      trials++;
      const v = evalSegments(envs, pop[i], validation, spec);
      const vs = v.all;
      const entry: HallEntry = {
        hash: h, genome: pop[i], generation: gen, level, fitness: r3(F[i]),
        validation: { trades: vs.length, totalR: r3(vs.reduce((s, r) => s + r, 0)), maxDD: r3(maxDrawdown(vs)), V: r3(validationScore(spec, vs)), sharpe: r3(sharpe(vs)) },
        belt: F[i] > 0 ? level : Math.max(0, level - 1),
      };
      hof.push(entry);
      valTradesByHash.set(h, vs);
      // Only candidates with as many validation trades as a champion needs: a Sharpe from a handful of
      // trades is noise and would inflate the variance the luck adjustment uses. (All of them still count as trials.)
      if (vs.length >= 30) candidateSharpes.push(sharpe(vs));
      if (vs.length >= 30 && (!champion || entry.validation.V > champion.validation.V)) champion = entry;
    }

    // Curriculum: promote when the median of the top 25% is positive for 3 generations in a row
    const topQ = order.filter(i => full.has(i)).slice(0, Math.max(1, Math.ceil(P / 4))).map(i => F[i]).sort((a, b) => a - b);
    const medTop = quantile(topQ, 0.5);
    streak = medTop > 0 ? streak + 1 : 0;
    if (streak >= 3 && level < MAX_LEVEL) { level++; streak = 0; }
    levelReached = Math.max(levelReached, level);
    generationsRun = gen + 1;

    const sortedF = [...F].sort((a, b) => a - b);
    const progress: Progress = {
      generation: gen + 1, generations: cfg.generations, level,
      fitness: F.map(v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : -99)),
      elites, best: r3(sortedF[sortedF.length - 1]), median: r3(quantile(sortedF, 0.5)), deaths, trials,
      championCurve: champion ? downsample(equity(valTradesByHash.get((champion as HallEntry).hash) ?? [])) : [],
    };

    // Next generation: elites carry over; the rest are children of tournament selection (k = 3)
    const tournament = () => {
      let best = -1;
      for (let k = 0; k < 3; k++) {
        const c = rand.int(0, P);
        if (best < 0 || (Number(full.has(c)) - Number(full.has(best)) || F[c] - F[best]) > 0) best = c;
      }
      return pop[best];
    };
    const next: Genome[] = elites.map(i => pop[i]);
    while (next.length < P) next.push(normalizeGenome(mutate(crossover(tournament(), tournament(), rand), rand), spec));
    pop = next;
    const stop = yield progress;
    if (stop && gen + 1 < cfg.generations) { cancelled = true; break; }
  }

  return {
    trials, generationsRun, levelReached, cancelled,
    champion: champion ? { ...(champion as HallEntry), validationTrades: valTradesByHash.get((champion as HallEntry).hash) ?? [] } : null,
    hallOfFame: hof, candidateSharpes: candidateSharpes.map(r3), evaluations,
  };
}

export { mean };
