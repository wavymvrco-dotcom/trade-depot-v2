import { test } from "node:test";
import assert from "node:assert/strict";
import { prepare, warmup, computeAt, combine, DEFAULT_WEIGHTS, type Weights } from "../server/tdci";
import { cotAt, type CotPoint } from "../server/cot";
import type { Candle } from "../server/indicators";

// Deterministic pseudo-random walk so tests are reproducible
function walk(n: number, stepMs: number, start: number, seed = 7): Candle[] {
  let s = seed, price = start;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) - 0.5;
  const t0 = Date.UTC(2023, 0, 2);
  return Array.from({ length: n }, (_, i) => {
    const open = price;
    const close = open + rnd() * 0.004 + Math.sin(i / 40) * 0.0004;
    const high = Math.max(open, close) + Math.abs(rnd()) * 0.002;
    const low = Math.min(open, close) - Math.abs(rnd()) * 0.002;
    price = close;
    const d = new Date(t0 + i * stepMs).toISOString();
    return { time: stepMs >= 86400e3 ? d.slice(0, 10) : d.slice(0, 19).replace("T", " "), open, high, low, close };
  });
}

const cot: CotPoint[] = Array.from({ length: 200 }, (_, k) => ({
  reportDate: new Date(Date.UTC(2022, 0, 4) + k * 7 * 86400e3).toISOString().slice(0, 10),
  availableAt: Date.UTC(2022, 0, 4) + k * 7 * 86400e3 + 4 * 86400e3,
  netPct: Math.sin(k / 10) * 0.2, z: Math.sin(k / 10), change4w: 0.01, score: Math.sin(k / 7) * 0.8,
}));

const daily = walk(600, 86400e3, 1.1, 3);
const h4 = walk(1200, 4 * 3600e3, 1.1, 11).map((c, i) => ({ ...c, time: new Date(Date.UTC(2023, 0, 2) + 300 * 86400e3 + i * 4 * 3600e3).toISOString().slice(0, 19).replace("T", " ") }));

test("TDCI at bar i is identical whether or not later bars exist (no look-ahead)", () => {
  const full = prepare("EURUSD", "4h", h4, daily, { base: cot, quote: [] });
  const start = warmup(full);
  assert.ok(start < 900, "warmup should leave room to test");
  for (const i of [start, start + 37, start + 211, 899]) {
    const cut = prepare("EURUSD", "4h", h4.slice(0, i + 1), daily, { base: cot, quote: [] });
    const a = computeAt(full, i), b = computeAt(cut, i);
    assert.equal(a.score, b.score, `score differs at ${i}`);
    assert.deepEqual(a.layers.map(l => l.value), b.layers.map(l => l.value), `layers differ at ${i}`);
  }
});

test("score is 0–100 and direction follows the composite sign", () => {
  const ctx = prepare("EURUSD", "4h", h4, daily, { base: cot, quote: [] });
  for (let i = warmup(ctx); i < h4.length; i += 50) {
    const r = computeAt(ctx, i);
    assert.ok(r.score >= 0 && r.score <= 100);
    if (r.direction === "LONG") assert.ok(r.composite > 0);
    if (r.direction === "SHORT") assert.ok(r.composite < 0);
    for (const l of r.layers) assert.ok(l.value >= -1 && l.value <= 1, `${l.key} out of range`);
  }
});

test("a negative (contrarian) weight flips a layer's contribution", () => {
  const x = { trend: 1, momentum: 0, structure: 0, liquidity: 0, value: 0, positioning: 0 };
  const w: Weights = { trend: -1, momentum: 0, structure: 0, liquidity: 0, value: 0, positioning: 0 };
  assert.equal(combine(x, 1, DEFAULT_WEIGHTS).direction, "LONG");
  assert.equal(combine(x, 1, w).direction, "SHORT");
  assert.equal(combine(x, 0, DEFAULT_WEIGHTS).score, 0, "zero regime quality means zero conviction");
});

test("COT data is only visible after its publication lag", () => {
  const p = cot[10];
  assert.equal(cotAt(cot, p.availableAt - 1)?.reportDate, cot[9].reportDate);
  assert.equal(cotAt(cot, p.availableAt)?.reportDate, p.reportDate);
  assert.equal(cotAt(cot, 0), null);
});
