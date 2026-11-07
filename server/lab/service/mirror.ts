// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Mirror service (§10.1): capture every real fill, fit the pooled cost model
// nightly, and hand Lab runs a cost model per symbol. Pooled across users per
// broker, anonymized (no user ids leave this module), and only from users who
// leave "Contribute anonymized execution data" on.

import { and, eq, gte } from "drizzle-orm";
import { db } from "../../db";
import { executionFills, mirrorModels, userSettings } from "@shared/schema";
import { getSymbolConfig } from "@shared/pips";
import { defaultSpreadPips } from "../../backtest";
import { costFor } from "../../tdci-service";
import { getBoss, QUEUES } from "../../jobs";
import { fitMirror, hourBucketOf, priorFor, measure, type FillObs, type Quantiles } from "../engine/mirror";
import type { MirrorEnvModel } from "../engine/worlds";
import type { StyleKey } from "../../tdci";

export interface FillRecord {
  userId: string; positionId?: string | null; kind: "open" | "close"; broker: string; symbol: string; side: "BUY" | "SELL";
  quoteBid?: number | null; quoteAsk?: number | null; requestedAt: Date; filledAt: Date; fillPrice?: number | null;
  newsWithinMin?: number | null; contribute: boolean;
}

/** Fire-and-forget: never blocks or fails an order. */
export function recordFill(f: FillRecord) {
  db.insert(executionFills).values({
    ...f, latencyMs: f.filledAt.getTime() - f.requestedAt.getTime(),
  }).catch(e => console.warn("[mirror] fill not recorded:", e.message));
}

export { measure };

const priorPips = (symbol: string, style: StyleKey = "day") => {
  const pip = getSymbolConfig(symbol).pipSize;
  return { spreadPips: defaultSpreadPips(symbol), slipPips: costFor(symbol, style).slip / pip };
};

/** Refit the pooled model from the last 180 days of real (non-demo) fills. */
export async function fitMirrorModels() {
  const since = new Date(Date.now() - 180 * 86400_000);
  const rows = await db.select().from(executionFills).where(and(eq(executionFills.contribute, true), gte(executionFills.filledAt, since)));
  // Anyone who has since opted out is excluded entirely, past fills included
  const optedOut = new Set((await db.select({ u: userSettings.userId }).from(userSettings).where(eq(userSettings.contributeExecutionData, false))).map(r => r.u));
  const obs: FillObs[] = [];
  const priors: Record<string, { spreadPips: number; slipPips: number }> = {};
  for (const r of rows) {
    if (r.broker === "demo" || optedOut.has(r.userId)) continue; // demo fills are the quote itself: no information
    const m = measure(r); if (!m) continue;
    priors[r.symbol] ??= priorPips(r.symbol);
    obs.push({ broker: r.broker, symbol: r.symbol, hourBucket: hourBucketOf(r.filledAt.getTime()), news: r.newsWithinMin != null, ...m });
  }
  const cells = fitMirror(obs, priors);
  for (const c of cells) {
    await db.insert(mirrorModels).values({ ...c, fittedAt: new Date() }).onConflictDoUpdate({
      target: [mirrorModels.broker, mirrorModels.symbol, mirrorModels.hourBucket, mirrorModels.news],
      set: { n: c.n, spread: c.spread, slippage: c.slippage, fittedAt: new Date() },
    });
  }
  console.log(`[mirror] fitted ${cells.length} cells from ${obs.length} real fills`);
  return { cells: cells.length, fills: obs.length };
}

/**
 * Cost model for a Lab run on `symbol`, for the user's broker. Buckets with no
 * fitted cell fall back to the prior. Returns null when there are no real fills
 * at all for this broker and symbol (the run then uses the Phase 1 assumption).
 */
export async function mirrorModelFor(broker: string | null | undefined, symbol: string, style: StyleKey): Promise<MirrorEnvModel | null> {
  if (!broker || broker === "demo") return null;
  const rows = await db.select().from(mirrorModels).where(and(eq(mirrorModels.broker, broker), eq(mirrorModels.symbol, symbol), eq(mirrorModels.news, false)));
  if (!rows.length) return null;
  const p = priorPips(symbol, style), prior = priorFor(p.spreadPips, p.slipPips);
  const cells = Array.from({ length: 6 }, (_, b) => {
    const r = rows.find(x => x.hourBucket === b);
    return r ? { spread: r.spread as Quantiles, slippage: r.slippage as Quantiles } : prior;
  });
  return { cells, baseSpreadPips: p.spreadPips, baseSlipPips: p.slipPips, fills: rows.reduce((s, r) => s + r.n, 0) };
}

/** Admin coverage: real fills and fitted cells per broker and symbol. */
export async function mirrorCoverage() {
  const rows = await db.select().from(mirrorModels);
  const by = new Map<string, { broker: string; symbol: string; fills: number; cells: number; fittedAt: Date }>();
  for (const r of rows) {
    const k = `${r.broker}:${r.symbol}`;
    const cur = by.get(k) ?? { broker: r.broker, symbol: r.symbol, fills: 0, cells: 0, fittedAt: r.fittedAt };
    cur.fills += r.n; cur.cells++; if (r.fittedAt > cur.fittedAt) cur.fittedAt = r.fittedAt;
    by.set(k, cur);
  }
  return Array.from(by.values());
}

export async function startMirrorWorker() {
  const boss = await getBoss();
  await boss.work(QUEUES.labMirrorFit, { batchSize: 1 }, async () => { await fitMirrorModels(); });
  // Nightly refit (§10.1); pg-boss keeps one schedule per name across processes
  await boss.schedule(QUEUES.labMirrorFit, "15 3 * * *", {}, { tz: "UTC" }).catch(e => console.warn("[mirror] schedule:", e.message));
}
