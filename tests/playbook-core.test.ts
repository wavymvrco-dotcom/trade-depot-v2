// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEnv } from "../server/lab/engine/env";
import { runGenome } from "../server/lab/engine/episode";
import { runLab } from "../server/lab/engine/lab";
import { shrinkIcs, coreWeights } from "../server/lab/engine/core";
import { syntheticEnv, spec, defaults } from "./lab-helpers";

test("a gated genome uses each regime's own weights", () => {
  const d = syntheticEnv({ seed: 95, rows: 3000 });
  d.tag = d.tag.map((_, i) => (i % 2 ? 2 : 0)); // alternate calm / trend bars
  const env = makeEnv(d);
  const off = [0, 0, 0, 0, 0, 0], on = [1, 0, 0, 0, 0, 0];
  const onlyTrend = runGenome(env, { w: off, threshold: 15, stopIdx: 0, rrIdx: 0, gates: [null, null, on, null] }, { from: 0, to: env.n, limit: env.n + 1, costMult: 1, constraints: {} });
  assert.ok(onlyTrend.trades.length > 20);
  assert.ok(onlyTrend.trades.every(t => d.tag[t.t] === 2), "trades only where the trend gate has weights");
  const plain = runGenome(env, { w: on, threshold: 15, stopIdx: 0, rrIdx: 0 }, { from: 0, to: env.n, limit: env.n + 1, costMult: 1, constraints: {} });
  assert.ok(plain.trades.some(t => d.tag[t.t] === 0), "an ungated genome trades in every regime");
});

test("Playbook skills seed Gen Zero and runs stay deterministic", () => {
  const skill = { genome: { w: [0, 0, 1, 0, 0, 0], threshold: 30, stopIdx: 1, rrIdx: 2 }, regimeTags: [1, 2] };
  const other = { genome: { w: [1, 0, 0, 0, 0, 0], threshold: 40, stopIdx: 1, rrIdx: 2 }, regimeTags: [0, 3] };
  const cfg = { envData: [syntheticEnv({ seed: 96, planted: 2 })], spec: spec(), seed: 3, population: 32, generations: 6, episodes: 4, ...defaults() };
  const a = runLab({ ...cfg, playbook: [skill, other] }), b = runLab({ ...cfg, playbook: [skill, other] });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.hallOfFame.length > 0);
});

test("Core v1: noisy pairs are pulled toward the cross-pair mean; precise ones keep their own IC", () => {
  const pairs = [
    { symbol: "A", ic: { trend: 0.10 }, t: { trend: 10 } },   // precise (se 0.01)
    { symbol: "B", ic: { trend: -0.08 }, t: { trend: -0.8 } }, // noisy (se 0.1)
    { symbol: "C", ic: { trend: 0.04 }, t: { trend: 4 } },
  ];
  const s = shrinkIcs(pairs, ["trend"]);
  const mean = (0.10 - 0.08 + 0.04) / 3;
  assert.ok(Math.abs(s.B.trend - mean) < Math.abs(-0.08 - mean), "noisy pair shrinks toward the mean");
  assert.ok(Math.abs(s.A.trend - 0.10) < Math.abs(s.B.trend - -0.08), "precise pair moves less");
  const w = coreWeights(pairs, ["trend", "momentum"], ["A", "C"])!;
  assert.ok(Math.abs(w.reduce((t, v) => t + Math.abs(v), 0) - 1) < 1e-2);
  assert.equal(coreWeights([pairs[0]], ["trend"], ["A"]), null, "one pair: nothing to pool");
});
