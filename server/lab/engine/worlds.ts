// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Domain randomization + curriculum (§9.4). Each generation samples E episodes
// that every agent faces identically (common random numbers, invariant 5):
// a pair, a window of 30–50% of its training segment, a cost multiplier
// m ~ U(0.8, 2.5), and a missed-fill mask (each entry skipped with p = 0.10).

import type { Env } from "./env";
import { TAG } from "./env";
import type { Segment } from "./splits";
import type { Rng } from "./rng";
import { costMultipliers, type Quantiles } from "./mirror";

/** Mirror cost model for one env: cells by 4-hour UTC bucket, and the base costs the outcome cache used. */
export interface MirrorEnvModel { cells: { spread: Quantiles; slippage: Quantiles }[]; baseSpreadPips: number; baseSlipPips: number; fills: number }

export interface Episode {
  envIdx: number;
  from: number; to: number; limit: number;
  costMult: number;
  /** Per-bar cost multipliers drawn from Mirror (same for every agent), or null for the uniform multiplier. */
  costRows: Float32Array | null;
  /** 1 = this row's entry is missed. Indexed from `from`. */
  miss: Uint8Array;
}

export const P_MISS = 0.10;
export const MAX_LEVEL = 3; // Level 4 adds Hunter (Phase 2)

/** Prefix sums of "hard" bars, for fast window difficulty checks. */
export function hardnessIndex(env: Env) {
  const trendOrVol = new Int32Array(env.n + 1), vol = new Int32Array(env.n + 1);
  for (let r = 0; r < env.n; r++) {
    trendOrVol[r + 1] = trendOrVol[r] + (env.tag[r] === TAG.trend || env.tag[r] === TAG.volatile ? 1 : 0);
    vol[r + 1] = vol[r] + (env.tag[r] === TAG.volatile ? 1 : 0);
  }
  return { trendOrVol, vol };
}

/** Does the window fit the curriculum level? L1: calm/normal-dominated; L2: adds trend; L3: anything. */
function fitsLevel(h: ReturnType<typeof hardnessIndex>, from: number, to: number, level: number) {
  const len = to - from;
  if (level >= 3 || len <= 0) return true;
  if (level === 2) return (h.vol[to] - h.vol[from]) / len <= 0.25;
  return (h.trendOrVol[to] - h.trendOrVol[from]) / len <= 0.25;
}

export function sampleEpisodes(
  envs: Env[], train: Segment[], hard: ReturnType<typeof hardnessIndex>[], level: number, count: number, rand: Rng,
  mirror: (MirrorEnvModel | null)[] = [],
): Episode[] {
  const out: Episode[] = [];
  for (let e = 0; e < count; e++) {
    const envIdx = rand.int(0, envs.length);
    const seg = train[envIdx];
    const span = seg.to - seg.from;
    let from = seg.from, to = seg.to;
    for (let attempt = 0; attempt < 30; attempt++) {
      const len = Math.max(1, Math.floor(span * rand.uniform(0.3, 0.5)));
      from = seg.from + rand.int(0, Math.max(1, span - len + 1));
      to = from + len;
      if (fitsLevel(hard[envIdx], from, to, level)) break;
    }
    const miss = new Uint8Array(to - from);
    for (let k = 0; k < miss.length; k++) miss[k] = rand.next() < P_MISS ? 1 : 0;
    const costMult = rand.uniform(0.8, 2.5);
    const m = mirror[envIdx];
    // Phase 2: costs drawn from Mirror (real fills, shrunk toward the prior); otherwise the uniform multiplier
    const costRows = m ? costMultipliers(m.cells, m.baseSpreadPips, m.baseSlipPips, envs[envIdx].closeHour, from, to, rand) : null;
    out.push({ envIdx, from, to, limit: seg.limit, costMult, costRows, miss });
  }
  return out;
}
