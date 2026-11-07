// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { blockBootstrap, regimeSwitch, injectGaps, spreadBlowouts, stormVerdict, aggregate } from "../server/lab/engine/storm";
import { rng } from "../server/lab/engine/rng";
import { maxDrawdown } from "../server/lab/engine/stats";
import { syntheticEnv } from "./lab-helpers";

const base = syntheticEnv({ seed: 90, rows: 1500 });

test("generators are seeded (same seed, same world) and keep prices sane", () => {
  for (const gen of [(s: number) => blockBootstrap(base.candles, 6, rng(s)), (s: number) => regimeSwitch(base.candles, rng(s)), (s: number) => injectGaps(base.candles, base.atr, rng(s), 20)]) {
    assert.deepEqual(gen(1), gen(1));
    assert.notDeepEqual(gen(1), gen(2));
    for (const c of gen(3)) assert.ok(c.low > 0 && c.low <= Math.min(c.open, c.close) && c.high >= Math.max(c.open, c.close));
    assert.equal(gen(4).length, base.candles.length);
  }
});

test("storms are harsher than the real market", () => {
  const rv = (cs: typeof base.candles) => { const r = cs.slice(1).map((c, i) => Math.log(c.close / cs[i].close)); return Math.sqrt(r.reduce((s, x) => s + x * x, 0) / r.length); };
  assert.ok(rv(regimeSwitch(base.candles, rng(5), 0.95, 0.98)) > rv(base.candles) * 1.2, "regime switching raises volatility");
  const gapped = injectGaps(base.candles, base.atr, rng(6), 30);
  const gaps = gapped.slice(1).filter((c, i) => Math.abs(c.open - gapped[i].close) > 2.5 * base.atr[i]).length;
  assert.ok(gaps >= 10, `${gaps} gaps`);
  const m = spreadBlowouts(5000, 3_600_000, rng(7));
  assert.ok(Math.max(...m) >= 5 && Math.min(...m) === 1);
});

test("verdict: survives only if ≥ 95% of worlds stay under the drawdown limit", () => {
  const ok = Array.from({ length: 100 }, (_, i) => ({ kind: "bootstrap" as const, maxDD: i < 96 ? 5 : 20 }));
  assert.equal(stormVerdict(ok, 10).passed, true);
  const bad = Array.from({ length: 100 }, (_, i) => ({ kind: "gaps" as const, maxDD: i < 90 ? 5 : 20 }));
  assert.equal(stormVerdict(bad, 10).passed, false);
  assert.equal(maxDrawdown([1, -3, 1]), 3);
});

test("higher-timeframe bars are rebuilt by aggregation", () => {
  const h = aggregate(base.candles.slice(0, 24), 4 * 3_600_000, 86_400_000, t => Date.parse(t.replace(" ", "T") + "Z"));
  assert.ok(h.length >= 4 && h.length <= 5);
  assert.equal(h[1].high, Math.max(...base.candles.filter(c => c.time.slice(0, 10) === h[1].time).map(c => c.high)));
});

test("invariant 6: nothing in training, selection or grading uses Storm Mode", () => {
  const dir = join(process.cwd(), "server/lab/engine");
  for (const f of readdirSync(dir).filter(f => f.endsWith(".ts") && f !== "storm.ts")) {
    assert.ok(!/from\s+"\.\/storm"/.test(readFileSync(join(dir, f), "utf8")), `${f} imports storm`);
  }
});
