// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isotonic, probAt, hiveProbability, logScore, HIVE } from "../server/lab/engine/hive";
import { kaplanMeier, shelfLife } from "../server/lab/engine/shelf";
import { solveLp } from "../server/lab/engine/lp";
import { minCvarWeights, cvar, fleetWithHoldout } from "../server/lab/engine/fleet";
import { rng } from "../server/lab/engine/rng";

test("Hive: isotonic calibration is monotone and calibrated", () => {
  const R = rng(1);
  const x = Array.from({ length: 3000 }, () => R.uniform(-1, 1));
  const y = x.map(v => (R.next() < 0.5 + 0.3 * v ? 1 : 0)); // true P(up) = 0.5 + 0.3x
  const c = isotonic(x, y);
  for (let i = 1; i < c.ps.length; i++) assert.ok(c.ps[i] >= c.ps[i - 1] - 1e-12);
  assert.ok(Math.abs(probAt(c, 0.5) - 0.65) < 0.06 && Math.abs(probAt(c, -0.5) - 0.35) < 0.06, `${probAt(c, 0.5)} ${probAt(c, -0.5)}`);
  assert.ok(probAt(c, 5) <= 0.98 && Number.isFinite(logScore(probAt(c, 5), false)));
});

test("Hive: needs ≥ 5 scored contributors, and leans on the skilled ones", () => {
  const coin = { p: 0.5, cumLogScore: 100 * Math.log(0.5), scored: 100 };
  assert.equal(hiveProbability([coin, coin, coin, coin]), null, "four is not enough");
  const skilled = { p: 0.8, cumLogScore: 100 * Math.log(0.5) + 20, scored: 100 };
  const out = hiveProbability([coin, coin, coin, coin, skilled])!;
  assert.equal(out.contributors, 5);
  assert.ok(out.p > 0.7, `skilled strategy dominates: ${out.p}`);
  assert.equal(hiveProbability(Array(6).fill({ p: 0.9, cumLogScore: 0, scored: HIVE.minScored - 1 })), null, "unscored strategies get no weight");
});

test("Shelf Life: Kaplan–Meier handles censoring; no number until there is enough history", () => {
  const km = kaplanMeier([{ days: 10, ended: true }, { days: 20, ended: false }, { days: 30, ended: true }]);
  assert.ok(Math.abs(km[1].survival - 2 / 3) < 1e-12);           // 1 of 3 at risk ends at day 10
  assert.ok(Math.abs(km[2].survival - (2 / 3) * 0) < 1e-12);     // the only one left at day 30 ends
  assert.equal(shelfLife([{ days: 10, ended: true }]).enough, false);
  const many = Array.from({ length: 40 }, (_, i) => ({ days: 30 + i * 5, ended: i % 3 !== 0 }));
  const s = shelfLife(many);
  assert.ok(s.enough && s.lowDays! < s.highDays!);
});

test("LP solver matches a known optimum and reports infeasibility", () => {
  // max 3x + 2y s.t. x + y ≤ 4, x + 3y ≤ 6, x ≤ 3  →  x = 3, y = 1, value 11
  const r = solveLp([-3, -2], [{ a: [1, 1], op: "<=", b: 4 }, { a: [1, 3], op: "<=", b: 6 }, { a: [1, 0], op: "<=", b: 3 }]);
  assert.equal(r.status, "optimal");
  if (r.status === "optimal") { assert.ok(Math.abs(r.value + 11) < 1e-9); assert.ok(Math.abs(r.x[0] - 3) < 1e-9 && Math.abs(r.x[1] - 1) < 1e-9); }
  assert.equal(solveLp([1], [{ a: [1], op: ">=", b: 5 }, { a: [1], op: "<=", b: 2 }]).status, "infeasible");
});

test("Fleet: min-CVaR weights beat brute force and avoid the crash-prone strategy", () => {
  const R = rng(2), T = 200;
  // A: steady; B: same mean but occasional crashes; C: uncorrelated with A
  const days = Array.from({ length: T }, () => {
    const a = R.normal(0.05, 0.3), c = R.normal(0.05, 0.3);
    const b = R.next() < 0.05 ? -4 : R.normal(0.26, 0.1);
    return [a, b, c];
  });
  const fit = minCvarWeights(days, { cap: 1 })!;
  let best = Infinity;
  for (let i = 0; i <= 20; i++) for (let j = 0; i + j <= 20; j++) {
    const w = [i / 20, j / 20, (20 - i - j) / 20];
    best = Math.min(best, cvar(days.map(d => d[0] * w[0] + d[1] * w[1] + d[2] * w[2])));
  }
  const got = cvar(days.map(d => d[0] * fit.weights[0] + d[1] * fit.weights[1] + d[2] * fit.weights[2]));
  assert.ok(got <= best + 1e-6, `LP ${got} vs grid ${best}`);
  assert.ok(fit.weights[1] < 0.2, `crash-prone weight ${fit.weights[1]}`);
  const h = fleetWithHoldout(days, { cap: 1 });
  assert.ok(h.ok);
});
