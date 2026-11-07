// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Every legal grade/stage change. Anything not listed throws. The service
// layer (server/lab/service/licenses.ts) is the only code that applies them.

import type { Grade, Stage } from "./types";

export type LicenseAction =
  | "exam_passed" | "exam_failed"   // created from a Vault Exam
  | "start_shadow" | "graduate" | "shadow_failed"
  | "go_live" | "pause" | "tripwire" | "retire";

export interface GradeStage { grade: Grade; stage: Stage }

const RULES: { action: LicenseAction; from: GradeStage | null; to: GradeStage }[] = [
  { action: "exam_passed",   from: null,                                    to: { grade: "probation", stage: "vault" } },
  { action: "exam_failed",   from: null,                                    to: { grade: "scrapped", stage: "vault" } },
  { action: "start_shadow",  from: { grade: "probation", stage: "vault" },  to: { grade: "probation", stage: "shadow" } },
  { action: "graduate",      from: { grade: "probation", stage: "shadow" }, to: { grade: "licensed", stage: "shadow" } },
  { action: "shadow_failed", from: { grade: "probation", stage: "shadow" }, to: { grade: "scrapped", stage: "shadow" } },
  { action: "go_live",       from: { grade: "licensed", stage: "shadow" },  to: { grade: "licensed", stage: "live" } },
  { action: "pause",         from: { grade: "licensed", stage: "live" },    to: { grade: "licensed", stage: "shadow" } },
  { action: "tripwire",      from: { grade: "licensed", stage: "live" },    to: { grade: "probation", stage: "shadow" } },
];

export class IllegalTransition extends Error {}

/** The state after `action`, or throws IllegalTransition. */
export function nextState(current: GradeStage | null, action: LicenseAction): GradeStage {
  if (action === "retire") {
    if (!current || current.stage === "retired") throw new IllegalTransition(`Cannot retire from ${fmt(current)}.`);
    return { grade: current.grade, stage: "retired" };
  }
  const rule = RULES.find(r => r.action === action && (r.from === null ? current === null : !!current && r.from.grade === current.grade && r.from.stage === current.stage));
  if (!rule) throw new IllegalTransition(`"${action}" is not allowed from ${fmt(current)}.`);
  return rule.to;
}

const fmt = (s: GradeStage | null) => (s ? `${s.grade}/${s.stage}` : "a new strategy");

/** Only Licensed strategies at stage Live may trade real money (invariant 9). */
export const mayTradeLive = (s: GradeStage) => s.grade === "licensed" && s.stage === "live";
