// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitMirror, shrink, priorFor, drawFromQuantiles, costMultipliers, measure, SHRINK_K } from "../server/lab/engine/mirror";
import { rng } from "../server/lab/engine/rng";

test("shrinkage: θ̂ = (n·x + k·prior)/(n + k), pulling small samples toward the prior", () => {
  const prior = { p10: 1, p50: 1, p90: 1, p99: 1 }, obs = { p10: 3, p50: 3, p90: 3, p99: 3 };
  assert.deepEqual(shrink(obs, 0, prior), prior);
  assert.equal(shrink(obs, SHRINK_K, prior).p50, 2);           // equal weight at n = k
  assert.ok(Math.abs(shrink(obs, 10_000, prior).p50 - 3) < 0.01); // data dominates with many fills
});

test("fit: real fills move the model away from the prior in proportion to their number", () => {
  const R = rng(3);
  const fills = Array.from({ length: 300 }, () => ({ broker: "oanda", symbol: "EURUSD", hourBucket: 2, news: false, spreadPips: 0.6 + R.next() * 0.2, slippagePips: Math.abs(R.normal(0, 0.1)) }));
  const few = fills.slice(0, 5);
  const priors = { EURUSD: { spreadPips: 1.0, slipPips: 0.3 } };
  const [many] = fitMirror(fills, priors), [small] = fitMirror(few, priors);
  assert.equal(many.n, 300);
  assert.ok(many.spread.p50 < 0.8 && many.spread.p50 > 0.65, `many-fill median ${many.spread.p50}`);
  assert.ok(small.spread.p50 > 0.9, `few-fill median stays near the prior: ${small.spread.p50}`);
});

test("drawing from quantiles reproduces them", () => {
  const q = { p10: 1, p50: 2, p90: 4, p99: 9 }, R = rng(5);
  const xs = Array.from({ length: 200_000 }, () => drawFromQuantiles(q, R.next())).sort((a, b) => a - b);
  const at = (p: number) => xs[Math.floor(p * xs.length)];
  assert.ok(Math.abs(at(0.1) - 1) < 0.05 && Math.abs(at(0.5) - 2) < 0.05 && Math.abs(at(0.9) - 4) < 0.1, `${at(0.1)} ${at(0.5)} ${at(0.9)}`);
});

test("with no real fills the cost multipliers match the Phase 1 assumption's range", () => {
  const p = priorFor(1.0, 0.3), cells = Array.from({ length: 6 }, () => p);
  const m = costMultipliers(cells, 1.0, 0.3, new Uint8Array(1000).fill(10), 0, 1000, rng(1));
  const s = Array.from(m).sort((a, b) => a - b);
  assert.ok(s[Math.floor(0.5 * s.length)] > 0.9 && s[Math.floor(0.5 * s.length)] < 1.3, `median ${s[500]}`);
  // Extremes: tightest spread with zero slippage ≈ 0.47×; widest spread and slippage ≈ 3.7×
  assert.ok(s[0] >= 0.45 && s[s.length - 1] < 3.8, `range ${s[0]} – ${s[s.length - 1]}`);
});

test("measure: spread and slippage signed against the trader", () => {
  const buy = measure({ symbol: "EURUSD", side: "BUY", kind: "open", quoteBid: 1.1000, quoteAsk: 1.1001, fillPrice: 1.10013 })!;
  assert.ok(Math.abs(buy.spreadPips - 1) < 1e-6 && Math.abs(buy.slippagePips - 0.3) < 1e-6);
  const sell = measure({ symbol: "EURUSD", side: "SELL", kind: "open", quoteBid: 1.1000, quoteAsk: 1.1001, fillPrice: 1.10002 })!;
  assert.ok(Math.abs(sell.slippagePips + 0.2) < 1e-6, "a better-than-quote fill is negative slippage");
  assert.equal(measure({ symbol: "EURUSD", side: "BUY", kind: "open", quoteBid: null, quoteAsk: 1.1, fillPrice: 1.1 }), null);
});
