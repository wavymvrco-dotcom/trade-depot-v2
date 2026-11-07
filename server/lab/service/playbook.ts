// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Playbook (§11.2) and Core v1 (§11.4) for Gen Zero.
// Playbook skills are the user's OWN Licensed strategies — seeding one user's
// runs with another's strategies would leak their settings into reports.

import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { playbookSkills, tdciCalibrations } from "@shared/schema";
import { genomeSchema } from "@shared/lab-schemas";
import { PROFILES, type StyleKey } from "../../tdci";
import { TDCI_SYMBOLS } from "../../tdci-service";
import { coreWeights, type PairIc } from "../engine/core";
import { nearestGrid } from "../engine/env";
import type { Genome } from "../engine/types";
import type { VaultReport } from "../engine/vault";
import type { LicenseRow } from "./licenses";

/** Save a newly Licensed strategy as a skill, tagged with the regimes where its Vault result was positive. */
export async function addToPlaybook(lic: LicenseRow) {
  const v = lic.vault as VaultReport | null;
  const regimeTags = (v?.perRegime ?? []).filter(x => x.trades >= 5 && x.totalR > 0).map(x => x.tag);
  await db.insert(playbookSkills).values({
    userId: lic.userId, licenseId: lic.id, name: lic.name, style: lic.style, layers: lic.layers as any, genome: lic.genome as any,
    regimeTags, stats: v ? { vaultR: v.base.totalR, trades: v.base.trades, dsr: v.luck.dsr, perRegime: v.perRegime } : {},
    provenance: { runId: lic.runId, vaultHash: lic.vaultHash, licensedAt: new Date().toISOString() },
  }).onConflictDoNothing();
}

/** The user's skills usable by a run with exactly these layers. */
export async function playbookFor(userId: string, style: StyleKey, layers: readonly string[]) {
  const rows = await db.select().from(playbookSkills).where(and(eq(playbookSkills.userId, userId), eq(playbookSkills.style, style))).orderBy(desc(playbookSkills.createdAt));
  const key = JSON.stringify(layers);
  return rows.filter(r => JSON.stringify(r.layers) === key).flatMap(r => {
    const g = genomeSchema.safeParse(r.genome);
    return g.success ? [{ genome: g.data as Genome, regimeTags: (r.regimeTags as number[]) ?? [] }] : [];
  });
}

/** Core v1 genome from the latest TDCI calibrations of every pair in this style (TDCI layers; Forge layers get 0). */
export async function coreGenome(style: StyleKey, symbols: string[], extraLayers: number): Promise<Genome | null> {
  const prof = PROFILES[style];
  const pairs: PairIc[] = [];
  for (const symbol of TDCI_SYMBOLS) {
    const [row] = await db.select({ result: tdciCalibrations.result }).from(tdciCalibrations)
      .where(and(eq(tdciCalibrations.symbol, symbol), eq(tdciCalibrations.interval, style))).orderBy(desc(tdciCalibrations.createdAt)).limit(1);
    const r = row?.result as any;
    if (r?.ic && r?.icTStat) pairs.push({ symbol, ic: r.ic, t: r.icTStat });
  }
  const w = coreWeights(pairs, prof.layers, symbols);
  if (!w) return null;
  return { w: [...w, ...new Array(extraLayers).fill(0)], threshold: 60, ...nearestGrid(prof.model.stopAtr, prof.model.rr) };
}
