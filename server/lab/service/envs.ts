// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Lab environments from real market data, through the shared env cache (§5.4).
// Data is pinned to the end of the previous UTC day: every run on the same day
// sees identical bars (reproducible) and shares one cache entry per
// (symbol, style) across all users.

import { gzipSync, gunzipSync } from "node:zlib";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { envCache } from "@shared/schema";
import { PROFILES, TDCI_VERSION, type StyleKey } from "../../tdci";
import { loadContext, costFor } from "../../tdci-service";
import { buildEnvData, type EnvData } from "../engine/env";

/** Data version for today: bars up to (not including) 00:00 UTC today. */
export function todaysDataVersion(now = Date.now()) {
  const d = new Date(now);
  const cutoff = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { dataVersion: new Date(cutoff).toISOString().slice(0, 10), cutoff };
}

// ─── (De)serialization ────────────────────────────────────────────────────────

const b64 = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");
const fromB64 = <T>(s: string, C: { new (b: ArrayBuffer): T }) => { const b = Buffer.from(s, "base64"); return new C(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

export function serializeEnv(d: EnvData): Buffer {
  const json = JSON.stringify({
    symbol: d.symbol, style: d.style, layers: d.layers, maxHold: d.maxHold, barMs: d.barMs, cost: d.cost, candles: d.candles,
    atr: b64(d.atr), X: b64(d.X), g: b64(d.g), tag: b64(d.tag), closeHour: b64(d.closeHour),
    h: d.h ?? null, hIdx: d.hIdx ? b64(d.hIdx) : null, htfMs: d.htfMs ?? null, icHorizon: d.icHorizon ?? null,
  });
  return gzipSync(Buffer.from(json));
}

export function deserializeEnv(buf: Buffer): EnvData {
  const o = JSON.parse(gunzipSync(buf).toString());
  return {
    ...o, atr: fromB64(o.atr, Float64Array), X: fromB64(o.X, Float32Array), g: fromB64(o.g, Float32Array),
    tag: fromB64(o.tag, Uint8Array), closeHour: fromB64(o.closeHour, Uint8Array),
    h: o.h ?? undefined, hIdx: o.hIdx ? fromB64(o.hIdx, Int32Array) : undefined, htfMs: o.htfMs ?? undefined, icHorizon: o.icHorizon ?? undefined,
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const memo = new Map<string, Promise<EnvData>>();
export const envStats = { hits: 0, misses: 0 };

/** The environment for (symbol, style) at today's data version: memory → env_cache → build. */
export function getEnvData(symbol: string, style: StyleKey, now = Date.now()): Promise<EnvData> {
  const { dataVersion, cutoff } = todaysDataVersion(now);
  const key = `${symbol}:${style}:${dataVersion}:${TDCI_VERSION}`;
  let p = memo.get(key);
  if (!p) {
    p = loadOrBuild(symbol, style, dataVersion, cutoff).catch(e => { memo.delete(key); throw e; });
    memo.set(key, p);
    if (memo.size > 64) memo.delete(memo.keys().next().value!);
  }
  return p;
}

async function loadOrBuild(symbol: string, style: StyleKey, dataVersion: string, cutoff: number): Promise<EnvData> {
  const where = and(eq(envCache.symbol, symbol), eq(envCache.style, style), eq(envCache.dataVersion, dataVersion), eq(envCache.tdciVersion, TDCI_VERSION));
  const [row] = await db.select({ payload: envCache.payload }).from(envCache).where(where);
  if (row) { envStats.hits++; return deserializeEnv(row.payload); }
  envStats.misses++;
  const profile = PROFILES[style];
  const ctx = await loadContext(symbol, profile, profile.history.calibrate, { endBefore: cutoff });
  const data = buildEnvData(ctx, costFor(symbol, style));
  // Round-trip through the stored form so a fresh env is byte-identical to a cached one
  const payload = serializeEnv(data);
  await db.insert(envCache).values({ symbol, style, dataVersion, tdciVersion: TDCI_VERSION, payload }).onConflictDoNothing();
  return deserializeEnv(payload);
}
