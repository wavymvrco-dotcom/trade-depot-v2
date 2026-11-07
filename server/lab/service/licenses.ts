// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// The single place that changes a strategy's grade or stage. Every change is
// checked against the transition table and written to license_events in the
// same transaction.

import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { licenseEvents, strategyLicenses } from "@shared/schema";
import { nextState, type LicenseAction } from "../engine/license-rules";
import type { Grade, Stage } from "../engine/types";

export type LicenseRow = typeof strategyLicenses.$inferSelect;

export async function getLicense(userId: string, id: string) {
  const [row] = await db.select().from(strategyLicenses).where(and(eq(strategyLicenses.id, id), eq(strategyLicenses.userId, userId)));
  return row ?? null;
}

export async function listLicenses(userId: string) {
  return db.select().from(strategyLicenses).where(eq(strategyLicenses.userId, userId)).orderBy(desc(strategyLicenses.createdAt));
}

export async function licenseHistory(licenseId: string) {
  return db.select().from(licenseEvents).where(eq(licenseEvents.licenseId, licenseId)).orderBy(licenseEvents.at);
}

/** Create a strategy from a Vault Exam result (the only way a license row is born). */
export async function createFromExam(values: Omit<typeof strategyLicenses.$inferInsert, "grade" | "stage">, passed: boolean, reason: string, data?: unknown) {
  const to = nextState(null, passed ? "exam_passed" : "exam_failed");
  return db.transaction(async tx => {
    const [row] = await tx.insert(strategyLicenses).values({ ...values, grade: to.grade, stage: to.stage }).returning();
    await tx.insert(licenseEvents).values({ licenseId: row.id, fromGrade: null, fromStage: null, toGrade: to.grade, toStage: to.stage, reason, data: (data ?? null) as any });
    return row;
  });
}

/**
 * Apply a transition. Re-reads the row inside the transaction (FOR UPDATE) so
 * two concurrent changes can't both apply from the same starting state.
 */
export async function transition(licenseId: string, action: LicenseAction, reason: string, data?: unknown, extra: Partial<typeof strategyLicenses.$inferInsert> = {}) {
  return db.transaction(async tx => {
    const [cur] = await tx.select().from(strategyLicenses).where(eq(strategyLicenses.id, licenseId)).for("update");
    if (!cur) throw new Error("Strategy not found");
    const to = nextState({ grade: cur.grade as Grade, stage: cur.stage as Stage }, action);
    const [row] = await tx.update(strategyLicenses)
      .set({ ...extra, grade: to.grade, stage: to.stage, updatedAt: new Date() })
      .where(eq(strategyLicenses.id, licenseId)).returning();
    await tx.insert(licenseEvents).values({ licenseId, fromGrade: cur.grade, fromStage: cur.stage, toGrade: to.grade, toStage: to.stage, reason, data: (data ?? null) as any });
    return row;
  });
}

/** Evidence (shadow progress, tripwire stats) is not a grade change and may be updated freely. */
export async function saveEvidence(licenseId: string, evidence: unknown) {
  await db.update(strategyLicenses).set({ evidence: evidence as any, updatedAt: new Date() }).where(eq(strategyLicenses.id, licenseId));
}


/** License Page fields only (never grade or stage): publish, rename or unpublish a strategy's public page. */
export async function setPublicPage(licenseId: string, v: { publicSlug: string | null; publicName: string | null; publicSince: Date | null }) {
  await db.update(strategyLicenses).set({ ...v, updatedAt: new Date() }).where(eq(strategyLicenses.id, licenseId));
}
