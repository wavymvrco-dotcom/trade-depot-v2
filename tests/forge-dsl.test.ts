// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Forge DSL: validation limits, fuzzing, and no look-ahead by construction (§11.1, Phase 3 DoD).

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLayer, countNodes, depthOf, printLayer, type Node } from "../server/lab/engine/forge/dsl";
import { evaluateLayer, type LayerInput } from "../server/lab/engine/forge/interp";
import { randomLayer, mutateLayer } from "../server/lab/engine/forge/mutate";
import { rng } from "../server/lab/engine/rng";
import type { Candle } from "../server/indicators";

const H1 = 3_600_000, H4 = 4 * H1;
function market(n: number, seed: number): LayerInput {
  const R = rng(seed);
  let px = 1.1;
  const t0 = Date.UTC(2024, 0, 1);
  const p: Candle[] = Array.from({ length: n }, (_, i) => {
    const o = px, c = o * (1 + R.normal(0, 0.002)); px = c;
    return { time: String(i), open: o, high: Math.max(o, c) * 1.001, low: Math.min(o, c) * 0.999, close: c };
  });
  const times = Array.from({ length: n }, (_, i) => t0 + i * H1);
  // 4-hour bars built from the hourly ones; hIdx = last 4h bar fully closed by each hour's close
  const h: Candle[] = [], hTimes: number[] = [];
  for (let k = 0; k + 4 <= n; k += 4) {
    const s = p.slice(k, k + 4);
    h.push({ time: String(k), open: s[0].open, high: Math.max(...s.map(x => x.high)), low: Math.min(...s.map(x => x.low)), close: s[3].close });
    hTimes.push(times[k]);
  }
  const hIdx = times.map(t => { let j = -1; while (j + 1 < hTimes.length && hTimes[j + 1] + H4 <= t + H1) j++; return j; });
  return { p, times, barMs: H1, h, hTimes, htfMs: H4, hIdx };
}

test("validation enforces the clamp root, depth, size, windows and no nested htf", () => {
  const ok = { op: "clamp", lo: -1, hi: 1, x: { op: "zscore", n: 20, x: { op: "series", name: "close" } } };
  assert.equal(validateLayer(ok).ok, true);
  assert.equal(validateLayer({ op: "zscore", n: 20, x: { op: "series", name: "close" } }).ok, false, "root must be clamp");
  assert.equal(validateLayer({ ...ok, x: { op: "sma", n: 500, x: { op: "series", name: "close" } } }).ok, false, "window > 200");
  assert.equal(validateLayer({ ...ok, x: { op: "htf", x: { op: "htf", x: { op: "series", name: "close" } } } }).ok, false, "nested htf");
  assert.equal(validateLayer({ ...ok, x: { op: "exec", code: "process.exit()" } }).ok, false, "unknown op");
  let deep: any = { op: "series", name: "close" };
  for (let i = 0; i < 8; i++) deep = { op: "abs", x: deep };
  assert.equal(validateLayer({ ...ok, x: deep }).ok, false, "too deep");
});

test("fuzz: 400 random layers validate, never crash the interpreter, and stay in [−1, 1]", () => {
  const R = rng(1), m = market(800, 2);
  let rejectedNonFinite = 0;
  for (let k = 0; k < 400; k++) {
    const layer = k % 2 ? randomLayer(R) : mutateLayer(randomLayer(R), R);
    const v = validateLayer(layer);
    assert.ok(v.ok, `generated an invalid layer: ${printLayer(layer)} ${!v.ok ? v.errors : ""}`);
    assert.ok(countNodes(layer) <= 40 && depthOf(layer) <= 6);
    try {
      const out = evaluateLayer(layer, m);
      assert.equal(out.values.length, 800);
      for (const x of out.values) assert.ok(x >= -1 && x <= 1);
    } catch (e: any) {
      assert.match(e.message, /non-finite/); // the only allowed failure: rejected for NaN/∞
      rejectedNonFinite++;
    }
  }
  assert.ok(rejectedNonFinite < 200, `${rejectedNonFinite} rejected`);
});

test("fuzz: no layer reads beyond the current bar (changing later bars never changes earlier values)", () => {
  const R = rng(3), m = market(600, 4);
  for (let k = 0; k < 150; k++) {
    const layer = randomLayer(R);
    let full: Float64Array;
    try { full = evaluateLayer(layer, m).values; } catch { continue; }
    const cut = 200 + R.int(0, 300);
    const p2 = m.p.map((c, i) => (i > cut ? { ...c, close: c.close * 1.05, high: c.high * 1.06, low: c.low * 0.95, open: c.open * 1.02 } : c));
    // Rebuild the higher timeframe from the perturbed bars, exactly as before
    const pert = market(600, 4); pert.p = p2 as any;
    pert.h = []; for (let j = 0; j + 4 <= 600; j += 4) { const s = p2.slice(j, j + 4); (pert.h as Candle[]).push({ time: String(j), open: s[0].open, high: Math.max(...s.map(x => x.high)), low: Math.min(...s.map(x => x.low)), close: s[3].close }); }
    let after: Float64Array;
    try { after = evaluateLayer(layer, pert).values; } catch { continue; }
    for (let i = 0; i <= cut; i++) assert.equal(after[i], full[i], `${printLayer(layer)} changed at bar ${i} (cut ${cut})`);
  }
});

test("a simple layer computes what it says", () => {
  const m = market(100, 5);
  const layer: Node = { op: "clamp", lo: -1, hi: 1, x: { op: "sub", a: { op: "series", name: "close" }, b: { op: "lag", k: 1, x: { op: "series", name: "close" } } } };
  const v = evaluateLayer(layer, m).values;
  assert.equal(v[0], 0, "warmup is neutral");
  assert.ok(Math.abs(v[10] - Math.max(-1, Math.min(1, m.p[10].close - m.p[9].close))) < 1e-15);
});
