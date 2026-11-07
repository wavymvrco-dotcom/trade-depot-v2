// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEnv } from "../server/lab/engine/env";
import { runGenome } from "../server/lab/engine/episode";
import { hunt, withHunterPenalty, HUNTER_BUDGET } from "../server/lab/engine/hunter";
import { rng } from "../server/lab/engine/rng";
import { syntheticEnv } from "./lab-helpers";

test("Hunter never increases any trade's R, and stays within its budgets", () => {
  const env = makeEnv(syntheticEnv({ seed: 70, planted: 1 }));
  const R = rng(71);
  for (let k = 0; k < 60; k++) {
    const g = { w: Array.from({ length: 6 }, () => R.uniform(-1, 1)), threshold: R.int(15, 60), stopIdx: R.int(0, 4), rrIdx: R.int(0, 5) };
    const from = R.int(0, 2000), to = from + R.int(300, 1500);
    const res = runGenome(env, g, { from, to, limit: env.n, costMult: R.uniform(0.8, 2.5), constraints: {} });
    const h = hunt(env, res.trades, g.stopIdx, g.rrIdx);
    const n = res.trades.length;
    h.trades.forEach((t, i) => assert.ok(t.r <= res.trades[i].r + 1e-12, `trade ${i} improved: ${res.trades[i].r} → ${t.r}`));
    const count = (kind: string) => h.attacks.filter(a => a.kind === kind).length;
    assert.ok(count("spread") <= Math.floor(HUNTER_BUDGET.spread * n));
    assert.ok(count("delay") <= Math.floor(HUNTER_BUDGET.delay * n));
    assert.ok(count("hunt") <= Math.floor(HUNTER_BUDGET.hunt * n));
    assert.equal(new Set(h.attacks.map(a => a.t)).size, h.attacks.length, "at most one attack per trade");
  }
});

test("a planted fragile strategy (wicks to within 0.3 ATR of the stop) loses far more to Hunter", () => {
  const robust = syntheticEnv({ seed: 72, planted: 2, beta: 0.5 });
  // Same market, but every bar wicks 1.35 ATR both ways: never reaching a 1.5 ATR stop, always inside Hunter's zone
  const fragile = { ...robust, candles: robust.candles.map((c, i) => {
    const a = robust.atr[Math.max(0, i - 1)];
    return { ...c, low: Math.min(c.low, c.open - 1.35 * a), high: Math.max(c.high, c.open + 1.35 * a) };
  }) };
  const g = { w: [0, 0, 1, 0, 0, 0], threshold: 30, stopIdx: 1, rrIdx: 2 }; // 1.5 ATR stop, 2R target
  const kept = (d: typeof robust) => {
    const env = makeEnv(d);
    const res = runGenome(env, g, { from: 0, to: env.n - 40, limit: env.n, costMult: 1, constraints: {} });
    const base = res.trades.reduce((s, t) => s + t.r, 0);
    const after = hunt(env, res.trades, g.stopIdx, g.rrIdx).trades.reduce((s, t) => s + t.r, 0);
    return { base, after, lost: base - after };
  };
  const r = kept(robust), f = kept(fragile);
  assert.ok(r.base > 0 && f.base > 0, `both profitable before the attack (${r.base}, ${f.base})`);
  assert.ok(f.lost > 1.5 * r.lost, `fragile lost ${f.lost.toFixed(1)}R vs robust ${r.lost.toFixed(1)}R`);
  // The fitness penalty ranks the fragile one lower even at equal untouched fitness
  assert.ok(withHunterPenalty(10, 10 - f.lost / 10) < withHunterPenalty(10, 10 - r.lost / 10));
  assert.equal(withHunterPenalty(5, 7), 5, "a Hunter score above the normal score is never a bonus");
});
