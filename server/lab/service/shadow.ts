// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Shadow Run (§9.9) and Live + Tripwire (§9.10). On each new closed bar, every
// Shadow/Live strategy decides with the identical engine (layer values +
// genome); decisions are written at decision time beside what the incumbent
// would have done. Live strategies also place real orders, through the normal
// trade guard. Market data is fetched once per (symbol, style) per bar for
// everyone.

import { and, eq, inArray, isNotNull, gte } from "drizzle-orm";
import { db } from "../../db";
import { blueprints, labRuns, positions, shadowTrades, strategyLicenses } from "@shared/schema";
import { blueprintSpecSchema, genomeSchema, vaultExpectationSchema } from "@shared/lab-schemas";
import { PROFILES, layerValues, lastClosedIndex, parseTime, type StyleKey } from "../../tdci";
import { loadContext, costFor } from "../../tdci-service";
import { storage } from "../../storage";
import { sendPushToUser } from "../../push";
import { openTrade, sizeForRisk } from "../../execution";
import { resolveTrade } from "../engine/outcomes";
import { scoreRow, weightNorm, attribution } from "../engine/combine";
import { STOP_GRID, RR_GRID, type BlueprintSpec, type Genome } from "../engine/types";
import { nearestGrid } from "../engine/env";
import { expectationFrom } from "../engine/lab";
import { judgeLive, judgeShadow } from "../engine/verdicts";
import { mayTradeLive } from "../engine/license-rules";
import type { VaultReport } from "../engine/vault";
import { saveEvidence, transition, type LicenseRow } from "./licenses";

const ACTIVE = { stages: ["shadow", "live"], grades: ["probation", "licensed"] };
const lastProcessed = new Map<string, number>(); // `${symbol}:${style}` → open time (ms) of the last bar decided

interface Decider { genome: Genome; layers: string[]; spec: BlueprintSpec | null }

function decide(ctx: Awaited<ReturnType<typeof loadContext>>, i: number, d: Decider) {
  const lv = layerValues(ctx, i);
  const x = d.layers.map(k => (lv.layers as any)[k]?.value ?? 0);
  const s = scoreRow(x, x.length, 0, lv.regime.value, d.genome.w, weightNorm(d.genome.w));
  let act: 1 | -1 | 0 = s.direction !== 0 && s.score >= d.genome.threshold ? s.direction : 0;
  const sess = d.spec?.constraints.sessionHoursUtc;
  if (act && sess) {
    const h = new Date(parseTime(ctx.p[i].time) + ctx.barMs).getUTCHours();
    const inside = sess[0] <= sess[1] ? h >= sess[0] && h < sess[1] : h >= sess[0] || h < sess[1];
    if (!inside) act = 0;
  }
  return { act, score: s.score, x };
}

const actName = (a: 1 | -1 | 0) => (a > 0 ? "LONG" : a < 0 ? "SHORT" : "FLAT");

async function specFor(lic: LicenseRow): Promise<BlueprintSpec | null> {
  if (!lic.runId) return null;
  const [run] = await db.select({ blueprintId: labRuns.blueprintId }).from(labRuns).where(eq(labRuns.id, lic.runId));
  if (!run) return null;
  const [bp] = await db.select({ spec: blueprints.spec }).from(blueprints).where(eq(blueprints.id, run.blueprintId));
  const parsed = blueprintSpecSchema.safeParse(bp?.spec);
  return parsed.success ? (parsed.data as BlueprintSpec) : null;
}

/** The strategy a candidate is compared against: the user's Live strategy for this style, else the default TDCI gate. */
async function incumbentFor(lic: LicenseRow, all: LicenseRow[]): Promise<Decider> {
  const live = all.find(l => l.userId === lic.userId && l.id !== lic.id && l.style === lic.style && mayTradeLive(l as any));
  if (live) return { genome: genomeSchema.parse(live.genome) as Genome, layers: live.layers as string[], spec: await specFor(live) };
  const prof = PROFILES[lic.style as StyleKey];
  const settings = await storage.getUserSettings(lic.userId);
  return {
    genome: { w: prof.layers.map(k => prof.defaultWeights[k] ?? 0), threshold: settings?.tdciMinScore ?? 60, ...nearestGrid(prof.model.stopAtr, prof.model.rr) },
    layers: prof.layers, spec: null,
  };
}

const modelOf = (g: Genome, maxHold: number) => ({ stopAtr: STOP_GRID[g.stopIdx], rr: RR_GRID[g.rrIdx], maxHold });

export async function shadowTick(now = Date.now()) {
  const lics = await db.select().from(strategyLicenses).where(and(
    eq(strategyLicenses.kind, "lab"), inArray(strategyLicenses.stage, ACTIVE.stages), inArray(strategyLicenses.grade, ACTIVE.grades),
  ));
  if (!lics.length) return;
  // Group by (symbol, style): one market fetch serves every strategy on it
  const groups = new Map<string, LicenseRow[]>();
  for (const l of lics) for (const s of (l.symbols as string[]).slice(0, 3)) {
    const k = `${s}:${l.style}`;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  for (const [key, members] of Array.from(groups)) {
    const [symbol, style] = key.split(":") as [string, StyleKey];
    const prof = PROFILES[style];
    const barMs = { "5min": 300e3, "15min": 900e3, "4h": 14400e3, "1day": 86400e3 }[prof.interval]!;
    // Skip the fetch entirely until a new bar should have closed
    const expectedLastOpen = Math.floor(now / barMs) * barMs - barMs;
    if ((lastProcessed.get(key) ?? -1) >= expectedLastOpen) continue; // no new closed bar yet
    let ctx;
    try { ctx = await loadContext(symbol, prof, prof.history.live); }
    catch (e: any) { console.warn(`[shadow] ${key} data unavailable: ${e.message}`); continue; }
    const i = lastClosedIndex(ctx, now);
    if (i < 1) continue;
    const barTime = parseTime(ctx.p[i].time);
    const cost = costFor(symbol, style);
    for (const lic of members) {
      try { await processLicense(lic, lics, ctx, i, cost, symbol, style); }
      catch (e: any) { console.error(`[shadow] license ${lic.id} ${symbol}: ${e.message}`); }
    }
    lastProcessed.set(key, barTime);
  }
  for (const lic of lics) {
    try { await judge(lic); } catch (e: any) { console.error(`[shadow] judge ${lic.id}: ${e.message}`); }
  }
}

async function processLicense(lic: LicenseRow, all: LicenseRow[], ctx: Awaited<ReturnType<typeof loadContext>>, i: number, cost: ReturnType<typeof costFor>, symbol: string, style: StyleKey) {
  const genome = genomeSchema.parse(lic.genome) as Genome;
  const maxHold = PROFILES[style].model.maxHold;
  const self: Decider = { genome, layers: lic.layers as string[], spec: await specFor(lic) };
  const inc = await incumbentFor(lic, all);
  const indexOf = (t: string) => ctx.p.findIndex(c => c.time === t);

  // 1. Resolve trades already decided (candidate and incumbent) on bars that have now closed
  const pending = await db.select().from(shadowTrades).where(and(eq(shadowTrades.licenseId, lic.id), eq(shadowTrades.symbol, symbol), inArray(shadowTrades.status, ["pending", "open"])));
  for (const t of pending) {
    const k = indexOf(t.signalTime);
    if (k < 0) continue;
    const upd: Partial<typeof shadowTrades.$inferInsert> = {};
    if (t.side) {
      const res = resolveTrade(ctx.p, ctx.pAtr[k], symbol, k, t.side === "LONG" ? 1 : -1, modelOf(genome, maxHold), cost, i);
      if (res) {
        Object.assign(upd, { entry: res.entry, sl: res.sl, tp: res.tp, status: res.final ? "closed" : "open" });
        if (res.final) Object.assign(upd, { exit: res.exitPrice, exitTime: ctx.p[res.exitIdx].time, r: res.r });
      }
    }
    if (t.incumbentAction !== "FLAT" && t.incumbentR == null) {
      const ri = resolveTrade(ctx.p, ctx.pAtr[k], symbol, k, t.incumbentAction === "LONG" ? 1 : -1, modelOf(inc.genome, maxHold), cost, i);
      if (ri?.final) upd.incumbentR = ri.r;
    }
    if (!t.side && (t.incumbentAction === "FLAT" || upd.incumbentR != null)) upd.status = "flat";
    if (Object.keys(upd).length) await db.update(shadowTrades).set(upd).where(eq(shadowTrades.id, t.id));
  }

  // 2. Decide on the newest closed bar (once), unless a candidate position is still open on this symbol
  const busy = pending.some(t => t.side && t.status !== "closed");
  const c = busy ? { act: 0 as const, score: null as number | null, x: [] as number[] } : decide(ctx, i, self);
  const ic = decide(ctx, i, inc);
  if (c.act === 0 && ic.act === 0) return; // nobody acts: nothing to record
  const attr = c.act ? attribution(c.x, genome.w, lic.layers as string[]).top : null;
  const inserted = await db.insert(shadowTrades).values({
    licenseId: lic.id, symbol, signalTime: ctx.p[i].time, side: c.act ? actName(c.act) : null, score: c.score,
    status: c.act ? "pending" : "pending", incumbentAction: actName(ic.act), attribution: attr as any,
  }).onConflictDoNothing().returning();
  if (!inserted.length) return; // already decided this bar (another worker tick)

  // 3. Live: place the real order now (market, next bar's open), inside the normal trade guard
  if (c.act && mayTradeLive(lic as any)) {
    const settings = await storage.getUserSettings(lic.userId);
    const risk = self.spec?.risk.riskPercentPerTrade ?? 1;
    const stopDist = STOP_GRID[genome.stopIdx] * ctx.pAtr[i];
    const ref = ctx.p[i].close;
    const side = c.act > 0 ? "BUY" : "SELL";
    const account = Number(settings?.brokerBalance) || 10000;
    const lots = sizeForRisk(symbol, account, risk, stopDist);
    const sl = c.act > 0 ? ref - stopDist : ref + stopDist;
    const tp = c.act > 0 ? ref + RR_GRID[genome.rrIdx] * stopDist : ref - RR_GRID[genome.rrIdx] * stopDist;
    const res = await openTrade({ userId: lic.userId, symbol, side, lots, stopLoss: sl, takeProfit: tp, licenseId: lic.id });
    if (!res.ok) console.log(`[live] license ${lic.id} ${symbol} not opened: ${res.reason}`);
  }
}

/** Current Shadow Run evidence for a strategy, computed from its recorded decisions (no side effects). */
export async function shadowEvidence(lic: LicenseRow) {
  const vault = lic.vault as VaultReport | null;
  if (!vault) return null;
  const exp = vaultExpectationSchema.parse(expectationFrom(vault));
  const since = lic.shadowStartedAt ?? lic.updatedAt;
  const rows = await db.select().from(shadowTrades).where(and(eq(shadowTrades.licenseId, lic.id), gte(shadowTrades.decidedAt, since)));
  const done = rows.filter(r => r.status === "closed" || r.status === "flat").sort((a, b) => (a.signalTime < b.signalTime ? -1 : 1));
  const rs = done.filter(r => r.side && r.r != null).map(r => r.r as number);
  const diffs = done.map(r => (r.side ? (r.r ?? 0) : 0) - (r.incumbentAction !== "FLAT" ? r.incumbentR ?? 0 : 0));
  const days = (Date.now() - new Date(since).getTime()) / 86400_000;
  const ev = judgeShadow(rs, diffs, days, exp);
  const disagreements = rows.filter(r => (r.side ?? "FLAT") !== r.incumbentAction).length;
  return { ...ev, disagreements, decisions: rows.length };
}

/** Re-evaluate graduation (Shadow) or drift (Live) for one strategy. */
async function judge(lic: LicenseRow) {
  const vault = lic.vault as VaultReport | null;
  if (!vault) return;
  const exp = vaultExpectationSchema.parse(expectationFrom(vault));
  if (lic.stage === "shadow") {
    const ev = await shadowEvidence(lic);
    if (!ev) return;
    await saveEvidence(lic.id, { kind: "shadow", ...ev, updatedAt: new Date().toISOString() });
    if (lic.grade === "probation" && ev.verdict === "scrap") {
      await transition(lic.id, "shadow_failed", ev.reasons.join(" "), ev);
      await notify(lic, "Shadow Run ended", `${lic.name} was scrapped: ${ev.reasons.join(" ")}`);
    }
  } else if (lic.stage === "live") {
    const since = lic.liveSince ?? lic.updatedAt;
    const closed = await db.select().from(positions).where(and(eq(positions.licenseId, lic.id), eq(positions.status, "closed"), isNotNull(positions.riskAmount), gte(positions.openedAt, since)));
    const rs = closed.sort((a, b) => +new Date(a.closedAt!) - +new Date(b.closedAt!)).map(p => p.profit / Math.max(1e-9, p.riskAmount!));
    const v = judgeLive(rs, exp);
    await saveEvidence(lic.id, { kind: "live", ...v, trades: rs.length, updatedAt: new Date().toISOString() });
    if (v.tripped) {
      // Demote; open positions are left for the user to decide (one-tap close in the Lab)
      await transition(lic.id, "tripwire", v.reason!, v, { liveSince: null });
      await notify(lic, "Tripwire: strategy pulled from Live", `${lic.name}: ${v.reason} It is back in Shadow Run. Open positions were not closed.`);
    }
  }
}

async function notify(lic: LicenseRow, title: string, message: string) {
  await storage.createNotification({ userId: lic.userId, type: "lab", title, message } as any).catch(() => {});
  await sendPushToUser(lic.userId, { title, body: message, data: { url: "/lab?tab=licenses" } }).catch(() => {});
}

export async function startShadowWorker() {
  const run = () => shadowTick().catch(e => console.error("[shadow] tick failed:", e.message));
  setTimeout(run, 15_000);
  setInterval(run, 60_000);
  console.log("[shadow] Shadow Run / Tripwire worker started — checking every 60s");
}
