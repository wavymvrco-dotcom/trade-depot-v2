// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Lab plan limits (§14), enforced server-side. Free values come from the build
// sheet; Pro values are placeholders until Marco sets them (env overrides).

export type LabTier = "free" | "pro";

const num = (v: string | undefined, d: number) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

export const TIERS: Record<LabTier, { maxPopulation: number; maxGenerations: number; runsPerMonth: number; shadowSlots: number; live: boolean }> = {
  free: { maxPopulation: 48, maxGenerations: 20, runsPerMonth: 2, shadowSlots: 0, live: false },
  pro: {
    maxPopulation: 256, maxGenerations: 80,
    runsPerMonth: num(process.env.LAB_PRO_RUNS_PER_MONTH, 10),
    shadowSlots: num(process.env.LAB_PRO_SHADOW_SLOTS, 5),
    live: true,
  },
};

export const tierOf = (t: string | null | undefined): LabTier => (t === "pro" ? "pro" : "free");
export const monthKey = (now = new Date()) => now.toISOString().slice(0, 7);
