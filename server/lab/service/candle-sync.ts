// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Candle cache logic, free of I/O so it can be unit-tested: given a store of
// cached bars and a page fetcher, return the latest N bars while requesting
// only what the store is missing (the newest bars, and older history if the
// store is short). Never fetches the same history twice.

import type { Candle } from "../../indicators";

/** Bars cached for one (symbol, interval), ascending by time. */
export interface CandleStore {
  latest(symbol: string, interval: string, n: number): Promise<Candle[]>;
  upsert(symbol: string, interval: string, candles: Candle[]): Promise<void>;
}

/** One request: up to `outputsize` bars ending at `endDate` (inclusive), ascending. */
export type PageFetcher = (symbol: string, interval: string, outputsize: number, endDate?: string) => Promise<Candle[]>;

export interface SyncResult {
  candles: Candle[];
  /** Bars in the result that came from the cache without a request. */
  cachedBars: number;
  /** Bars requested from the provider in this call. */
  fetchedBars: number;
  /** Provider requests made in this call. */
  calls: number;
}

export const PAGE = 5000; // Twelve Data's per-request maximum

const INTERVAL_MS: Record<string, number> = {
  "1min": 60_000, "5min": 300_000, "15min": 900_000, "30min": 1_800_000, "45min": 2_700_000,
  "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "1day": 86_400_000, "1week": 604_800_000, "1month": 2_592_000_000,
};

export const candleTimeMs = (s: string) => Date.parse(s.length <= 10 ? `${s}T00:00:00Z` : `${s.replace(" ", "T")}Z`);

/** Upper bound on bars between a cached bar and now (calendar time; weekends overcount, which is safe). */
export function barsSince(lastTime: string, interval: string, now: number): number {
  const ms = INTERVAL_MS[interval] ?? 3_600_000;
  return Math.max(0, Math.ceil((now - candleTimeMs(lastTime)) / ms));
}

export async function syncCandles(
  store: CandleStore, fetchPage: PageFetcher,
  symbol: string, interval: string, n: number, now = Date.now(),
): Promise<SyncResult> {
  const cached = await store.latest(symbol, interval, n);
  let calls = 0, fetchedBars = 0;
  const page = async (size: number, endDate?: string) => {
    calls++;
    const rows = await fetchPage(symbol, interval, size, endDate);
    fetchedBars += rows.length;
    return rows;
  };

  let merged: Candle[];
  const fetchedTimes = new Set<string>();
  if (!cached.length) {
    merged = await page(Math.min(PAGE, n));
    if (!merged.length) throw new Error("Candle fetch failed: no data returned");
    await store.upsert(symbol, interval, merged);
    merged.forEach(c => fetchedTimes.add(c.time));
  } else {
    // Refresh from the newest cached bar (inclusive: it may still have been forming)
    const last = cached[cached.length - 1].time;
    let head = await page(Math.min(PAGE, Math.max(2, barsSince(last, interval, now) + 2)));
    // A gap longer than one page: keep paging back until the new data meets the cache
    while (head.length >= PAGE && head[0].time > last) {
      const older = (await page(PAGE, head[0].time)).filter(c => c.time < head[0].time);
      if (!older.length) break;
      head = [...older, ...head];
    }
    const fresh = head.filter(c => c.time >= last);
    if (fresh.length) await store.upsert(symbol, interval, fresh);
    fresh.forEach(c => fetchedTimes.add(c.time));
    const byTime = new Map(cached.map(c => [c.time, c]));
    for (const c of fresh) byTime.set(c.time, c);
    merged = Array.from(byTime.values()).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  }

  // Older history the cache doesn't have yet
  while (merged.length < n) {
    const oldest = merged[0].time;
    const older = (await page(Math.min(PAGE, n - merged.length + 1), oldest)).filter(c => c.time < oldest);
    if (!older.length) break; // reached the start of available history
    await store.upsert(symbol, interval, older);
    older.forEach(c => fetchedTimes.add(c.time));
    merged = [...older, ...merged];
  }

  const candles = merged.slice(-n);
  const cachedBars = candles.filter(c => !fetchedTimes.has(c.time)).length;
  return { candles, cachedBars, fetchedBars, calls };
}
