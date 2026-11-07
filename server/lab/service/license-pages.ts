// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// License Pages (§10.7): an opt-in, public, read-only record of one strategy.
// Built only from immutable records — the Vault report, shadow_trades, live
// positions linked by license_id, and license_events — so it can't be edited
// to look better. Never shows the genome, layer weights, account size or the
// user's identity (only a display name the user chose, if any).

import { randomBytes } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { licenseEvents, positions, shadowTrades, strategyLicenses } from "@shared/schema";
import { getLicense, setPublicPage } from "./licenses";
import type { VaultReport } from "../engine/vault";
export { renderLicensePage, renderOgPng } from "./license-page-render";


/** Publish (or rename) a strategy's public page. The slug is random and unguessable. */
export async function publishLicense(userId: string, id: string, publicName: string | null) {
  const lic = await getLicense(userId, id);
  if (!lic) return null;
  if (lic.grade === "scrapped") throw new Error("Only strategies that passed the Vault Exam can have a public page.");
  const slug = lic.publicSlug ?? randomBytes(8).toString("base64url");
  await setPublicPage(id, { publicSlug: slug, publicName: publicName?.trim().slice(0, 60) || null, publicSince: lic.publicSince ?? new Date() });
  return slug;
}

export async function unpublishLicense(userId: string, id: string) {
  const lic = await getLicense(userId, id);
  if (!lic) return false;
  await setPublicPage(id, { publicSlug: null, publicName: null, publicSince: null });
  return true;
}

export async function licensePageData(slug: string) {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(slug)) return null;
  const [lic] = await db.select().from(strategyLicenses).where(eq(strategyLicenses.publicSlug, slug));
  if (!lic) return null;
  const vault = lic.vault as VaultReport | null;
  const shadow = await db.select().from(shadowTrades).where(and(eq(shadowTrades.licenseId, lic.id), eq(shadowTrades.status, "closed")));
  const live = await db.select().from(positions).where(and(eq(positions.licenseId, lic.id), eq(positions.status, "closed"), isNotNull(positions.riskAmount)));
  const events = await db.select().from(licenseEvents).where(eq(licenseEvents.licenseId, lic.id)).orderBy(licenseEvents.at);
  const shadowR = shadow.map(s => s.r ?? 0), liveR = live.map(p => p.profit / Math.max(1e-9, p.riskAmount!));
  return {
    name: lic.name, by: lic.publicName, grade: lic.grade, stage: lic.stage, style: lic.style, symbols: lic.symbols as string[],
    vault: vault && { trades: vault.base.trades, totalR: vault.base.totalR, profitFactor: vault.base.profitFactor, maxDD: vault.base.maxDD,
      doubleCostR: vault.doubleCost.totalR, dsr: vault.luck.dsr, trials: vault.luck.trials, baselineR: vault.baseline.totalR, equity: vault.base.equity },
    shadow: { trades: shadow.length, totalR: shadowR.reduce((s, r) => s + r, 0), since: lic.shadowStartedAt },
    live: { trades: live.length, totalR: liveR.reduce((s, r) => s + r, 0), since: lic.liveSince },
    events: events.map(e => ({ at: e.at, from: e.fromGrade ? `${e.fromGrade}/${e.fromStage}` : null, to: `${e.toGrade}/${e.toStage}`, reason: e.reason, tripwire: /tripwire|drift|drawdown went/i.test(e.reason) })),
    publicSince: lic.publicSince,
  };
}

