// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Hunter (§10.2): a bounded adversary that tries to minimize an agent's R in an
// episode. Bounds keep it realistic — an unbounded adversary breaks everything.
// Per episode it may: double the spread on up to 20% of trades, delay the entry
// by one bar on up to 10%, and hunt the stop on up to 10% (if price came within
// 0.3 ATR of the stop, the stop counts as hit, with worst-case stop slippage).
// Greedy: it spends each budget where it costs the agent the most. It can never
// improve a trade.

import type { Env } from "./env";
import type { Trade } from "./types";
import { STOP_GRID } from "./types";
import { commissionInR } from "./outcomes";

export const HUNTER_BUDGET = { spread: 0.2, delay: 0.1, hunt: 0.1, huntZoneAtr: 0.3 } as const;
/** Fragility penalty weight: F_total = F − β·max(0, F − F_hunter). */
export const HUNTER_BETA = 0.5;

export type Attack = "spread" | "delay" | "hunt";
export interface HunterResult { trades: Trade[]; attacks: { t: number; kind: Attack; loss: number }[] }

/**
 * Attack one episode's trades. `stopSlipMult` scales stop slippage on hunted
 * stops (Mirror p99 / base slippage when known; 4× otherwise).
 */
export function hunt(env: Env, trades: Trade[], stopIdx: number, rrIdx: number, stopSlipMult = 4): HunterResult {
  const n = trades.length;
  if (!n) return { trades, attacks: [] };
  const out = env.outcomes(stopIdx, rrIdx);
  const stopAtr = STOP_GRID[stopIdx];
  const budget = { spread: Math.floor(HUNTER_BUDGET.spread * n), delay: Math.floor(HUNTER_BUDGET.delay * n), hunt: Math.floor(HUNTER_BUDGET.hunt * n) };

  // Every possible attack and what it would cost the agent (only strictly harmful ones)
  const options: { i: number; kind: Attack; loss: number; r: number }[] = [];
  trades.forEach((tr, i) => {
    const row = tr.t, a = env.atr[row], d = stopAtr * a;
    if (!(d > 0)) return;
    // Double spread: one extra round-trip spread
    const extraSpread = (2 * env.cost.half) / d;
    if (extraSpread > 0) options.push({ i, kind: "spread", loss: extraSpread, r: tr.r - extraSpread });
    // One-bar delayed entry: the trade as if signalled a bar later (same side)
    if (row + 1 < env.n) {
      const late = tr.side > 0 ? out.rLong[row + 1] : out.rShort[row + 1];
      const lateExit = tr.side > 0 ? out.exitLong[row + 1] : out.exitShort[row + 1];
      // Keep the cost adjustment the agent already had on this trade
      const adj = tr.r - (tr.side > 0 ? out.rLong[row] : out.rShort[row]);
      const rLate = late + adj;
      if (lateExit > row + 1 && rLate < tr.r) options.push({ i, kind: "delay", loss: tr.r - rLate, r: rLate });
    }
    // Stop hunt: did price come within 0.3 ATR of the stop before the trade's exit?
    const entryMid = env.candles[row + 1].open;
    const entry = tr.side > 0 ? entryMid + env.cost.half + env.cost.slip : entryMid - env.cost.half - env.cost.slip;
    const sl = entry - tr.side * d, zone = HUNTER_BUDGET.huntZoneAtr * a;
    let near = false;
    for (let j = row + 1; j <= tr.exit && j < env.candles.length; j++) {
      const c = env.candles[j];
      if (tr.side > 0 ? c.low - env.cost.half <= sl + zone : c.high + env.cost.half >= sl - zone) { near = true; break; }
    }
    if (near) {
      const slip = stopSlipMult * env.cost.slip;
      const rHunt = -1 - slip / d - commissionInR(env.symbol, entry, d, env.cost.commission);
      if (rHunt < tr.r) options.push({ i, kind: "hunt", loss: tr.r - rHunt, r: rHunt });
    }
  });

  // Greedy: biggest damage first, at most one attack per trade, within each budget
  options.sort((x, y) => y.loss - x.loss || x.i - y.i);
  const hit = new Set<number>();
  const result = trades.map(t => ({ ...t }));
  const attacks: HunterResult["attacks"] = [];
  for (const o of options) {
    if (hit.has(o.i) || budget[o.kind] <= 0) continue;
    budget[o.kind]--; hit.add(o.i);
    result[o.i].r = o.r;
    attacks.push({ t: trades[o.i].t, kind: o.kind, loss: o.loss });
  }
  return { trades: result, attacks };
}

/** Fragility-penalized fitness at Level 4. */
export const withHunterPenalty = (F: number, Fhunter: number) => F - HUNTER_BETA * Math.max(0, F - Fhunter);
