// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { testLayer, tThreshold, nicheOf, withForgeLayers } from "../server/lab/engine/forge/accept";
import { randomLayer } from "../server/lab/engine/forge/mutate";
import { rng } from "../server/lab/engine/rng";
import type { Node } from "../server/lab/engine/forge/dsl";
import type { EnvData } from "../server/lab/engine/env";
import type { Candle } from "../server/indicators";

const H = 3_600_000;
/** Hourly market where the next 6 bars drift with a planted 20-bar z-score of an unseen "pressure" series. */
function env(seed: number, planted: boolean): EnvData {
  const R = rng(seed), n = 4000, L = 4;
  const t0 = Date.UTC(2024, 0, 1);
  let px = 1.1;
  const candles: Candle[] = [];
  const closes: number[] = [];
  for (let i = 0; i <= n; i++) {
    // Mean reversion: when price sits above its 20-bar mean, the next bars drift down (only if planted)
    let drift = 0;
    if (planted && i > 20) {
      const w = closes.slice(-20), m = w.reduce((s, x) => s + x, 0) / 20, sd = Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / 20) || 1e-9;
      drift = -0.25 * Math.max(-2, Math.min(2, (px - m) / sd));
    }
    const o = px, c = o * (1 + 0.002 * (R.normal() + drift));
    candles.push({ time: new Date(t0 + i * H).toISOString().slice(0, 19).replace("T", " "), open: o, high: Math.max(o, c) * 1.0005, low: Math.min(o, c) * 0.9995, close: c });
    closes.push(c); px = c;
  }
  const X = new Float32Array(n * L).map(() => R.uniform(-1, 1));
  return { symbol: "EURUSD", style: "swing", layers: ["a", "b", "c", "d"] as any, maxHold: 30, barMs: H, cost: { half: 0.00005, slip: 0.00003, commission: 7 },
    candles, atr: new Float64Array(n + 1).fill(0.0025), X, g: new Float32Array(n).fill(1), tag: new Uint8Array(n), closeHour: new Uint8Array(n), icHorizon: 6 };
}

const zLayer: Node = { op: "clamp", lo: -1, hi: 1, x: { op: "neg", x: { op: "zscore", n: 20, x: { op: "series", name: "close" } } } };

test("a layer that captures a real (planted) effect is accepted on training data", () => {
  const r = testLayer(zLayer, [env(1, true)], 10);
  assert.ok(r.accepted, JSON.stringify(r));
  assert.ok(r.tStat > r.tNeeded && r.noLookahead);
});

test("the same layer on a market without the effect is rejected", () => {
  const r = testLayer(zLayer, [env(2, false)], 10);
  assert.equal(r.accepted, false);
  assert.ok(r.reasons.some(x => x.startsWith("|t|")), r.reasons.join("; "));
});

test("random layers on a random market are (almost) never accepted", () => {
  const R = rng(5), e = env(3, false);
  let accepted = 0, tested = 0;
  for (let k = 0; k < 40; k++) {
    try { if (testLayer(randomLayer(R), [e], k + 1, [], k).accepted) accepted++; tested++; } catch { /* non-finite layer: rejected */ }
  }
  assert.ok(accepted <= 1, `${accepted}/${tested} random layers accepted`);
});

test("novelty: a near-copy of an existing layer is refused; the bar rises with every layer tried", () => {
  const e = env(4, true);
  const withCopy = withForgeLayers(e, [{ id: "z", node: zLayer }]);
  const copy: Node = { op: "clamp", lo: -1, hi: 1, x: { op: "mul", a: { op: "const", v: 1.01 }, b: zLayer.x } };
  const r = testLayer(copy, [{ ...withCopy }], 10);
  assert.equal(r.accepted, false);
  assert.ok(r.reasons.some(x => x.includes("similar")), r.reasons.join("; "));
  assert.equal(tThreshold(1), 3);
  assert.ok(tThreshold(10_000) > 4.5 && tThreshold(10_000) > tThreshold(100));
});

test("niches: family and timeframe are read from the program", () => {
  assert.equal(nicheOf(zLayer).key, "mean-reversion:primary");
  assert.equal(nicheOf({ op: "clamp", lo: -1, hi: 1, x: { op: "htf", x: { op: "slope", n: 10, x: { op: "series", name: "close" } } } }).key, "trend:htf");
  assert.equal(nicheOf({ op: "clamp", lo: -1, hi: 1, x: { op: "gt", a: { op: "series", name: "hour" }, b: { op: "const", v: 12 } } }).family, "session");
});
