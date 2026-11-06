// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { syncCandles, type CandleStore, type PageFetcher } from "../server/lab/service/candle-sync";
import type { Candle } from "../server/indicators";

const H = 3_600_000;
const t0 = Date.UTC(2026, 0, 1);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const bar = (k: number, close = 1 + k / 1000): Candle => ({ time: fmt(t0 + k * H), open: close, high: close, low: close, close });

/** A provider holding bars 0..last; pages like Twelve Data (end inclusive, ascending). */
function provider(lastBar: () => number) {
  const log: { size: number; end?: string }[] = [];
  const fetch: PageFetcher = async (_s, _i, size, end) => {
    log.push({ size, end });
    const all = Array.from({ length: lastBar() + 1 }, (_, k) => bar(k));
    const upto = end ? all.filter(c => c.time <= end) : all;
    return upto.slice(-size);
  };
  return { fetch, log };
}

function memoryStore(): CandleStore & { rows: Map<string, Candle> } {
  const rows = new Map<string, Candle>();
  return {
    rows,
    async latest(_s, _i, n) { return [...rows.values()].sort((a, b) => (a.time < b.time ? -1 : 1)).slice(-n); },
    async upsert(_s, _i, cs) { for (const c of cs) rows.set(c.time, c); },
  };
}

test("first call fetches and caches; the second only asks for the newest bars", async () => {
  let last = 11_999;
  const p = provider(() => last), store = memoryStore();
  const now = () => t0 + (last + 1) * H;
  const a = await syncCandles(store, p.fetch, "EURUSD", "1h", 12_000, now());
  assert.equal(a.candles.length, 12_000);
  assert.equal(a.calls, 3); // 5000 + 5000 + 2000 (paged backward)
  assert.equal(a.cachedBars, 0);

  last += 3; // three new bars closed
  const b = await syncCandles(store, p.fetch, "EURUSD", "1h", 12_000, now());
  assert.equal(b.calls, 1);
  assert.ok(b.fetchedBars <= 10, `fetched ${b.fetchedBars}`);
  assert.equal(b.candles.length, 12_000);
  assert.equal(b.candles.at(-1)!.time, bar(last).time);
  assert.ok(b.cachedBars / b.candles.length > 0.9, "cache hit rate above 90%");
  assert.deepEqual(b.candles, Array.from({ length: 12_000 }, (_, k) => bar(k + 3)));
});

test("the newest cached bar is refreshed (it may have been forming)", async () => {
  const store = memoryStore();
  await store.upsert("EURUSD", "1h", [bar(0), bar(1), { ...bar(2), close: 9 }]);
  const p = provider(() => 2);
  const r = await syncCandles(store, p.fetch, "EURUSD", "1h", 3, t0 + 3 * H);
  assert.equal(r.candles.at(-1)!.close, bar(2).close);
});

test("a larger request extends the cache backward without refetching cached history", async () => {
  const p = provider(() => 999), store = memoryStore();
  await syncCandles(store, p.fetch, "EURUSD", "1h", 200, t0 + 1000 * H);
  p.log.length = 0;
  const r = await syncCandles(store, p.fetch, "EURUSD", "1h", 900, t0 + 1000 * H);
  assert.equal(r.candles.length, 900);
  assert.deepEqual(r.candles, Array.from({ length: 900 }, (_, k) => bar(k + 100)));
  const older = p.log.filter(x => x.end);
  assert.equal(older.length, 1);
  assert.equal(older[0].end, bar(800).time); // ends at the oldest cached bar
});

test("stops cleanly at the start of available history", async () => {
  const p = provider(() => 49), store = memoryStore();
  const r = await syncCandles(store, p.fetch, "EURUSD", "1h", 500, t0 + 50 * H);
  assert.equal(r.candles.length, 50);
});
