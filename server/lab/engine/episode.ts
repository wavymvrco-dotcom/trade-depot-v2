// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Run one genome through one world (§9.5). One position at a time, like the
// calibration report: skip while busy, score the bar, enter at the next open
// when the score clears the threshold, take the cached outcome, apply costs.

import type { Env } from "./env";
import type { BlueprintSpec, Genome, Trade } from "./types";
import { scoreRow, weightNorm } from "./combine";

export interface RunOpts {
  from: number; to: number; limit: number;
  costMult: number;                // 1 = base costs; 2 = double costs
  miss?: Uint8Array | null;        // missed-fill mask, indexed from `from`
  constraints: BlueprintSpec["constraints"];
}

export interface RunResult { trades: Trade[]; died: boolean; deathReason?: "max_consecutive_losses" }

export function runGenome(env: Env, g: Genome, o: RunOpts): RunResult {
  const trades: Trade[] = [];
  const norm = weightNorm(g.w);
  if (norm === 0) return { trades, died: false };
  const out = env.outcomes(g.stopIdx, g.rrIdx);
  const c = o.constraints;
  const sess = c.sessionHoursUtc;
  const maxLosses = c.maxConsecutiveLosses;
  let busyUntil = -1, losses = 0, died = false;
  const end = Math.min(o.to, env.n);
  for (let r = Math.max(0, o.from); r < end; r++) {
    if (r <= busyUntil) continue;
    const s = scoreRow(env.X, env.L, r, env.g[r], g.w, norm);
    if (s.direction === 0 || s.score < g.threshold) continue;
    if (sess) {
      const h = env.closeHour[r];
      const inside = sess[0] <= sess[1] ? h >= sess[0] && h < sess[1] : h >= sess[0] || h < sess[1];
      if (!inside) continue;
    }
    if (o.miss && o.miss[r - o.from]) continue; // fill missed: no position, next bar may trade
    const side = s.direction;
    let exit = side > 0 ? out.exitLong[r] : out.exitShort[r];
    if (exit >= o.limit) continue; // purge: never let a trade run into the next segment
    let rr = side > 0 ? out.rLong[r] : out.rShort[r];
    if (c.noWeekendHolding && exit > r && env.weekOfOpen(r + 1) !== env.weekOfClose(exit)) {
      // Close at the last bar of the entry week instead of holding through the weekend
      const wk = env.weekOfOpen(r + 1);
      let k = r + 1;
      while (k + 1 <= exit && env.weekOfClose(k + 1) === wk) k++;
      if (env.weekOfClose(k) !== wk) continue; // no bar closes inside the entry week: do not enter
      rr = env.forcedExitR(r, side, k, g.stopIdx);
      exit = k;
    }
    rr -= (o.costMult - 1) * out.costR[r];
    trades.push({ t: r, side, r: rr, exit });
    busyUntil = exit;
    if (rr <= 0) {
      losses++;
      if (maxLosses != null && losses > maxLosses) died = true;
    } else losses = 0;
  }
  return died ? { trades, died, deathReason: "max_consecutive_losses" } : { trades, died };
}
