// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Hive (§11.3), Shelf Life (§11.8) and Fleet (§11.9) services.

import { and, eq, isNull, desc, inArray } from "drizzle-orm";
import { db } from "../../db";
import { hivePredictions, licenseEvents, positions, shadowTrades, strategyLicenses } from "@shared/schema";
import { probAt, logScore, hiveProbability } from "../engine/hive";
import { shelfLife, type Lifetime } from "../engine/shelf";
import { fleetWithHoldout } from "../engine/fleet";
import type { VaultReport } from "../engine/vault";
import type { LicenseRow } from "./licenses";

// ─── Hive ─────────────────────────────────────────────────────────────────────

/** Record a Licensed strategy's prediction for this bar, and score its matured predictions. */
export async function hiveRecord(lic: LicenseRow, symbol: string, p: { time: string; close: number }[], i: number, composite: number) {
  if (lic.grade !== "licensed") return;
  const curve = (lic.vault as VaultReport | null)?.hiveCurve;
  if (!curve) return;
  await db.insert(hivePredictions).values({ licenseId: lic.id, symbol, style: lic.style, barTime: p[i].time, p: probAt(curve, composite), horizon: curve.horizon }).onConflictDoNothing();
  const open = await db.select().from(hivePredictions).where(and(eq(hivePredictions.licenseId, lic.id), eq(hivePredictions.symbol, symbol), isNull(hivePredictions.up)));
  for (const o of open) {
    const k = p.findIndex(c => c.time === o.barTime);
    if (k < 0 || k + o.horizon > i) continue;
    const up = p[k + o.horizon].close > p[k].close;
    await db.update(hivePredictions).set({ up, logScore: logScore(o.p, up) })
      .where(and(eq(hivePredictions.licenseId, o.licenseId), eq(hivePredictions.symbol, o.symbol), eq(hivePredictions.barTime, o.barTime)));
  }
}

/** The crowd view for one symbol: only with ≥ 5 scored contributors; never reveals any strategy or user. */
export async function hiveFor(symbol: string) {
  const rows = await db.select().from(hivePredictions).where(eq(hivePredictions.symbol, symbol)).orderBy(desc(hivePredictions.barTime)).limit(20_000);
  const by = new Map<string, { latest: typeof rows[number]; cum: number; scored: number }>();
  for (const r of rows) {
    const cur = by.get(r.licenseId) ?? { latest: r, cum: 0, scored: 0 };
    if (r.logScore != null) { cur.cum += r.logScore; cur.scored++; }
    by.set(r.licenseId, cur);
  }
  const out = hiveProbability(Array.from(by.values()).map(v => ({ p: v.latest.p, cumLogScore: v.cum, scored: v.scored })));
  return out ? { symbol, pUp: Math.round(out.p * 1000) / 1000, contributors: out.contributors } : { symbol, pUp: null, contributors: 0 };
}

// ─── Shelf Life ───────────────────────────────────────────────────────────────

/** Lifetimes per style: from first becoming Licensed to the first Tripwire trip or retirement (else still running). */
export async function shelfLifeFor(style: string) {
  const lics = await db.select({ id: strategyLicenses.id }).from(strategyLicenses).where(eq(strategyLicenses.style, style));
  if (!lics.length) return shelfLife([]);
  const evs = await db.select().from(licenseEvents).where(inArray(licenseEvents.licenseId, lics.map(l => l.id))).orderBy(licenseEvents.at);
  const lives: Lifetime[] = [];
  for (const l of lics) {
    const e = evs.filter(x => x.licenseId === l.id);
    const start = e.find(x => x.toGrade === "licensed");
    if (!start) continue;
    const end = e.find(x => x.at > start.at && (x.toStage === "retired" || (x.fromGrade === "licensed" && x.toGrade !== "licensed")));
    const days = ((end?.at ?? new Date()).getTime() - start.at.getTime()) / 86_400_000;
    lives.push({ days, ended: !!end });
  }
  return shelfLife(lives);
}

// ─── Fleet ────────────────────────────────────────────────────────────────────

/** Daily R per Licensed strategy (vault + shadow + live), aligned on shared days, then min-CVaR with a holdout check. */
export async function fleetFor(userId: string, opts: { cap?: number; targetR?: number }) {
  const lics = await db.select().from(strategyLicenses).where(and(eq(strategyLicenses.userId, userId), eq(strategyLicenses.grade, "licensed")));
  if (lics.length < 2) return { ok: false as const, reason: "A Fleet needs at least two Licensed strategies." };
  const series: Map<number, number>[] = [];
  for (const l of lics) {
    const m = new Map<number, number>();
    const add = (day: number, r: number) => m.set(day, (m.get(day) ?? 0) + r);
    const seq = (l.vault as VaultReport | null)?.sequence;
    if (seq?.days) seq.rs.forEach((r, i) => add(seq.days![i], r));
    const sh = await db.select({ r: shadowTrades.r, t: shadowTrades.exitTime }).from(shadowTrades).where(and(eq(shadowTrades.licenseId, l.id), eq(shadowTrades.status, "closed")));
    sh.forEach(s => s.t && add(Math.floor(Date.parse(s.t.replace(" ", "T") + "Z") / 86_400_000), s.r ?? 0));
    const live = await db.select().from(positions).where(and(eq(positions.licenseId, l.id), eq(positions.status, "closed")));
    live.forEach(p => p.closedAt && p.riskAmount && add(Math.floor(p.closedAt.getTime() / 86_400_000), p.profit / p.riskAmount));
    series.push(m);
  }
  // Days on which every strategy was being tracked (first to last day each one has data), flat days = 0
  const spans = series.map(m => { const d = Array.from(m.keys()); return [Math.min(...d), Math.max(...d)]; });
  const from = Math.max(...spans.map(s => s[0])), to = Math.min(...spans.map(s => s[1]));
  const days: number[] = [];
  for (let d = from; d <= to; d++) { const dow = new Date(d * 86_400_000).getUTCDay(); if (dow !== 0 && dow !== 6) days.push(d); }
  const R = days.map(d => series.map(m => m.get(d) ?? 0));
  const res = fleetWithHoldout(R, opts);
  return { ...res, strategies: lics.map(l => ({ id: l.id, name: l.name })), days: days.length };
}
