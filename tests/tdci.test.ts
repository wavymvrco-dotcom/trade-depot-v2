import { test } from "node:test";
import assert from "node:assert/strict";
import { prepare, warmup, computeAt, combine, PROFILES, STYLES, type Weights } from "../server/tdci";
import { cotAt, type CotPoint } from "../server/cot";
import { rateAt, type RatePoint } from "../server/rates";
import { toWeekly, adx, type Candle } from "../server/indicators";

const STEP: Record<string, number> = { "5min": 300e3, "15min": 900e3, "1h": 3600e3, "4h": 14400e3, "1day": 86400e3 };

// Deterministic pseudo-random walk so tests are reproducible
function walk(n: number, stepMs: number, start: number, t0: number, seed = 7): Candle[] {
  let s = seed, price = start;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) - 0.5;
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

const cot: CotPoint[] = Array.from({ length: 900 }, (_, k) => ({
  reportDate: new Date(Date.UTC(2010, 0, 5) + k * 7 * 86400e3).toISOString().slice(0, 10),
  availableAt: Date.UTC(2010, 0, 5) + k * 7 * 86400e3 + 4 * 86400e3,
  netPct: Math.sin(k / 10) * 0.2, z: Math.sin(k / 10), change4w: 0.01, score: Math.sin(k / 7) * 0.8,
}));
const rates: RatePoint[] = Array.from({ length: 240 }, (_, k) => ({
  month: new Date(Date.UTC(2008, k, 1)).toISOString().slice(0, 10),
  availableAt: Date.UTC(2008, k, 1) + 75 * 86400e3, rate: 2 + Math.sin(k / 12),
}));

/** Primary + higher-timeframe series covering the same period for a style. */
function seriesFor(style: (typeof STYLES)[number], n: number) {
  const prof = PROFILES[style];
  const t0 = Date.UTC(2015, 0, 5);
  const p = walk(n, STEP[prof.interval], 1.1, t0, 11);
  const h = prof.htf === "1week" ? toWeekly(p) : walk(Math.ceil(n * STEP[prof.interval] / STEP[prof.htf]) + 200, STEP[prof.htf], 1.1, t0 - 120 * STEP[prof.htf], 3);
  return { prof, p, h };
}

for (const style of STYLES) {
  test(`${style}: score at bar i is identical whether or not later bars exist (no look-ahead)`, () => {
    const { prof, p, h } = seriesFor(style, style === "position" ? 1400 : 1200);
    const data = { cot: { base: cot, quote: [] as CotPoint[] }, rates: { base: rates, quote: rates.map(r => ({ ...r, rate: r.rate - 0.5 })) }, spread: 0.0001 };
    const full = prepare("EURUSD", prof, p, h, data);
    const start = warmup(full);
    assert.ok(start < p.length - 200, `warmup should leave room (got ${start})`);
    for (const i of [start, start + 37, start + 111, p.length - 150]) {
      const cut = prepare("EURUSD", prof, p.slice(0, i + 1), prof.htf === "1week" ? toWeekly(p.slice(0, i + 1)) : h, data);
      const a = computeAt(full, i), b = computeAt(cut, i);
      assert.equal(a.score, b.score, `score differs at ${i}`);
      assert.deepEqual(a.layers.map(l => l.value), b.layers.map(l => l.value), `layers differ at ${i}`);
    }
  });

  test(`${style}: uses exactly its curated layers, values in range`, () => {
    const { prof, p, h } = seriesFor(style, 900);
    const ctx = prepare("EURUSD", prof, p, h, { spread: 0.0001 });
    const r = computeAt(ctx, Math.max(warmup(ctx), p.length - 50));
    assert.deepEqual(r.layers.map(l => l.key), [...prof.layers, "regime"]);
    assert.ok(r.score >= 0 && r.score <= 100);
    for (const l of r.layers) assert.ok(l.value >= -1 && l.value <= 1, `${l.key} out of range`);
  });
}

test("a negative (contrarian) weight flips a layer's contribution", () => {
  const x = { trend: 1 };
  const w: Weights = { trend: -1 };
  assert.equal(combine(x, 1, { trend: 1 }).direction, "LONG");
  assert.equal(combine(x, 1, w).direction, "SHORT");
  assert.equal(combine(x, 0, { trend: 1 }).score, 0, "zero regime quality means zero conviction");
});

test("COT and rates are only visible after their publication lag", () => {
  assert.equal(cotAt(cot, cot[10].availableAt - 1)?.reportDate, cot[9].reportDate);
  assert.equal(cotAt(cot, cot[10].availableAt)?.reportDate, cot[10].reportDate);
  assert.equal(rateAt(rates, rates[5].availableAt - 1)?.month, rates[4].month);
  assert.equal(rateAt(rates, 0), null);
});

test("weekly bars aggregate Monday-start weeks; ADX is aligned and bounded", () => {
  const d = walk(30, 86400e3, 1.1, Date.UTC(2024, 0, 1)); // 2024-01-01 is a Monday
  const w = toWeekly(d);
  assert.equal(w[0].time, "2024-01-01");
  assert.equal(w[1].time, "2024-01-08");
  assert.equal(w[0].high, Math.max(...d.slice(0, 7).map(c => c.high)));
  const a = adx(walk(200, 3600e3, 1.1, Date.UTC(2024, 0, 1)));
  assert.equal(a.adx.length, 200);
  assert.ok(a.adx.slice(40).every(v => v >= 0 && v <= 100));
});
