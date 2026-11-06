// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Market data service. Every candle request in the app comes through here:
// Postgres `candle_cache` first, Twelve Data only for missing bars, one rate
// limit shared by every process (web + worker), usage counted per day.

import { sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { candleCache, apiUsage } from "@shared/schema";
import type { Candle } from "../../indicators";
import { syncCandles, type CandleStore } from "./candle-sync";

const TWELVE_BASE = "https://api.twelvedata.com";
const PROVIDER = "twelvedata";
const RATE_PER_MIN = Number(process.env.TWELVE_DATA_RATE_PER_MIN) || 8; // free plan: 8 requests/minute
const RATE_LOCK = 742_801; // pg advisory-lock key for the rate window

function toTwelveSymbol(symbol: string) {
  if (symbol === "XAUUSD") return "XAU/USD";
  if (symbol === "XAGUSD") return "XAG/USD";
  return symbol.slice(0, 3) + "/" + symbol.slice(3);
}

// ─── Rate limit, shared across processes ──────────────────────────────────────
// Each request takes a slot in `external_calls` under an advisory lock, so the
// web server and the worker together never exceed the plan's limit. If the
// database is unreachable, fall back to a per-process limiter.

const localTimes: number[] = [];
let localQueue: Promise<void> = Promise.resolve();
function localSlot(): Promise<void> {
  const next = localQueue.then(async () => {
    for (;;) {
      const now = Date.now();
      while (localTimes.length && now - localTimes[0] > 60_000) localTimes.shift();
      if (localTimes.length < RATE_PER_MIN) { localTimes.push(now); return; }
      await new Promise(r => setTimeout(r, 60_000 - (now - localTimes[0]) + 250));
    }
  });
  localQueue = next.catch(() => {});
  return next;
}

async function tryTakeSlot(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [RATE_LOCK]);
    const { rows } = await client.query(
      "SELECT count(*)::int AS n, min(at) AS oldest FROM external_calls WHERE provider = $1 AND at > now() - interval '60 seconds'",
      [PROVIDER],
    );
    if (rows[0].n < RATE_PER_MIN) {
      await client.query("INSERT INTO external_calls (provider) VALUES ($1)", [PROVIDER]);
      await client.query("COMMIT");
      return 0;
    }
    await client.query("COMMIT");
    return Math.max(250, 60_000 - (Date.now() - new Date(rows[0].oldest).getTime()) + 250);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

let sharedQueue: Promise<void> = Promise.resolve();
function rateSlot(): Promise<void> {
  const next = sharedQueue.then(async () => {
    for (;;) {
      let wait: number;
      try { wait = await tryTakeSlot(); } catch { return localSlot(); }
      if (!wait) return;
      await new Promise(r => setTimeout(r, wait));
    }
  });
  sharedQueue = next.catch(() => {});
  return next;
}

// ─── Usage counters ───────────────────────────────────────────────────────────

const session = { calls: 0, cachedBars: 0, fetchedBars: 0 };

function recordUsage(calls: number, cachedBars: number, fetchedBars: number) {
  session.calls += calls; session.cachedBars += cachedBars; session.fetchedBars += fetchedBars;
  db.insert(apiUsage)
    .values({ day: sql`(now() at time zone 'utc')::date`, provider: PROVIDER, calls, cachedBars, fetchedBars })
    .onConflictDoUpdate({
      target: [apiUsage.day, apiUsage.provider],
      set: {
        calls: sql`${apiUsage.calls} + ${calls}`,
        cachedBars: sql`${apiUsage.cachedBars} + ${cachedBars}`,
        fetchedBars: sql`${apiUsage.fetchedBars} + ${fetchedBars}`,
      },
    })
    .catch(e => console.warn("[data] usage counter:", e.message));
}

/** Counts since this process started, and the cache hit rate in bars. */
export function sessionUsage() {
  const total = session.cachedBars + session.fetchedBars;
  return { ...session, hitRate: total ? session.cachedBars / total : null };
}

/** Daily totals for the Admin page (newest first). */
export async function dailyUsage(days = 14) {
  const { rows } = await pool.query(
    `SELECT day::text AS day, provider, calls, cached_bars::float8 AS "cachedBars", fetched_bars::float8 AS "fetchedBars"
       FROM api_usage WHERE day > (now() at time zone 'utc')::date - $1::int ORDER BY day DESC, provider`,
    [days],
  );
  // Old rate-limit rows are only needed for the last minute
  pool.query("DELETE FROM external_calls WHERE at < now() - interval '2 days'").catch(() => {});
  return rows.map((r: any) => ({ ...r, hitRate: r.cachedBars + r.fetchedBars ? r.cachedBars / (r.cachedBars + r.fetchedBars) : null }));
}

// ─── Provider page fetch ──────────────────────────────────────────────────────

async function fetchPage(symbol: string, interval: string, outputsize: number, apiKey: string, endDate?: string): Promise<Candle[]> {
  await rateSlot();
  const end = endDate ? `&end_date=${encodeURIComponent(endDate)}` : "";
  const url = `${TWELVE_BASE}/time_series?symbol=${encodeURIComponent(toTwelveSymbol(symbol))}&interval=${encodeURIComponent(interval)}&outputsize=${outputsize}&timezone=UTC&apikey=${encodeURIComponent(apiKey)}&order=ASC${end}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Candle fetch failed: HTTP ${res.status}`);
  const data = await res.json() as any;
  if (data.status === "error") {
    // "No data" before the start of available history ends paging cleanly
    if (/no data/i.test(String(data.message))) return [];
    throw new Error(`Candle fetch failed: ${data.message || "Twelve Data error"}`);
  }
  const values = (data.values as any[]) ?? [];
  return values.map((v: any) => ({
    time: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: v.volume ? parseFloat(v.volume) : undefined,
  }));
}

// ─── Postgres store ───────────────────────────────────────────────────────────

const pgStore: CandleStore = {
  async latest(symbol, interval, n) {
    const { rows } = await pool.query(
      `SELECT time, open, high, low, close, volume FROM (
         SELECT * FROM candle_cache WHERE symbol = $1 AND interval = $2 ORDER BY time DESC LIMIT $3
       ) t ORDER BY time ASC`,
      [symbol, interval, n],
    );
    return rows.map((r: any) => ({
      time: r.time, open: r.open, high: r.high, low: r.low, close: r.close,
      ...(r.volume != null ? { volume: r.volume } : { volume: undefined }),
    }));
  },
  async upsert(symbol, interval, candles) {
    for (let k = 0; k < candles.length; k += 1000) {
      const chunk = candles.slice(k, k + 1000).map(c => ({
        symbol, interval, time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? null,
      }));
      await db.insert(candleCache).values(chunk).onConflictDoUpdate({
        target: [candleCache.symbol, candleCache.interval, candleCache.time],
        set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume` },
      });
    }
  },
};

/** Latest `n` bars for a symbol/interval: cached history plus only the missing bars from the provider. */
export async function getCandles(symbol: string, interval: string, n: number, apiKey: string): Promise<Candle[]> {
  const r = await syncCandles(pgStore, (s, i, size, end) => fetchPage(s, i, size, apiKey, end), symbol, interval, n);
  recordUsage(r.calls, r.cachedBars, r.fetchedBars);
  return r.candles;
}
