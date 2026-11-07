// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Validation for every Strategy Lab JSON column and request body (§6).

import { z } from "zod";

export const LAB_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "GBPJPY", "XAUUSD"] as const;
export const LAB_STYLES = ["scalp", "day", "swing", "position"] as const;

const hour = z.number().int().min(0).max(24);

export const blueprintSpecSchema = z.object({
  version: z.literal(1),
  style: z.enum(LAB_STYLES),
  symbols: z.array(z.enum(LAB_SYMBOLS)).min(1).max(8),
  objective: z.object({
    totalR: z.number().min(0).max(5),
    drawdownPenalty: z.number().min(0).max(5),
    consistencyPenalty: z.number().min(0).max(5),
    tradeFrequency: z.object({
      minPerWeek: z.number().min(0).max(100).optional(),
      maxPerWeek: z.number().min(0).max(500).optional(),
    }).optional(),
  }).strict(),
  constraints: z.object({
    maxConsecutiveLosses: z.number().int().min(1).max(50).optional(),
    noWeekendHolding: z.boolean().optional(),
    sessionHoursUtc: z.tuple([hour, hour]).optional(),
    maxStopAtr: z.number().min(1).max(3).optional(),
    minRr: z.number().min(1).max(3).optional(),
  }).strict(),
  risk: z.object({
    riskPercentPerTrade: z.number().min(0.05).max(5),
    maxOpenPositions: z.number().int().min(1).max(20),
  }).strict(),
}).strict();
export type BlueprintSpecInput = z.infer<typeof blueprintSpecSchema>;

/** Goal presets map to objective weights (the old Strategy Builder's goal field). */
export const GOAL_PRESETS = {
  conservative: { totalR: 1, drawdownPenalty: 1, consistencyPenalty: 1 },
  balanced: { totalR: 1, drawdownPenalty: 0.5, consistencyPenalty: 0.5 },
  aggressive: { totalR: 1, drawdownPenalty: 0.2, consistencyPenalty: 0.2 },
} as const;

export const blueprintBodySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  prompt: z.string().max(4000).optional(),
  spec: blueprintSpecSchema,
});

export const genomeSchema = z.object({
  w: z.array(z.number().min(-1).max(1)).min(1).max(20),
  threshold: z.number().int().min(15).max(90),
  stopIdx: z.number().int().min(0).max(3),
  rrIdx: z.number().int().min(0).max(4),
});

export const runBodySchema = z.object({
  blueprintId: z.string().min(1),
  population: z.number().int().min(8).max(256).optional(),
  generations: z.number().int().min(1).max(80).optional(),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
});

export const runProgressSchema = z.object({
  generation: z.number(), generations: z.number(), level: z.number(),
  fitness: z.array(z.number()), elites: z.array(z.number()),
  best: z.number(), median: z.number(), deaths: z.number(), trials: z.number(),
  championCurve: z.array(z.number()),
  phase: z.string().optional(),
}).passthrough();

export const vaultExpectationSchema = z.object({
  meanR: z.number(), sigmaR: z.number(), meanP05: z.number(), meanP95: z.number(), ddP95: z.number(), ddP99: z.number(),
});

/** Pretty-print a Blueprint as one plain-English sentence block (shown before any run). */
export function describeBlueprint(s: BlueprintSpecInput): string {
  const styleWord = { scalp: "Scalp (5-minute)", day: "Day (15-minute)", swing: "Swing (4-hour)", position: "Position (daily)" }[s.style];
  const parts = [`${styleWord} trades on ${s.symbols.join(", ")}`];
  const c = s.constraints;
  if (c.noWeekendHolding) parts.push("no positions held over the weekend");
  if (c.maxConsecutiveLosses) parts.push(`never more than ${c.maxConsecutiveLosses} losses in a row`);
  if (c.sessionHoursUtc) parts.push(`entries only between ${String(c.sessionHoursUtc[0]).padStart(2, "0")}:00 and ${String(c.sessionHoursUtc[1]).padStart(2, "0")}:00 UTC`);
  if (c.maxStopAtr) parts.push(`stops no wider than ${c.maxStopAtr} ATR`);
  if (c.minRr) parts.push(`targets at least ${c.minRr}R`);
  const tf = s.objective.tradeFrequency;
  if (tf?.minPerWeek != null || tf?.maxPerWeek != null) parts.push(`about ${tf?.minPerWeek ?? 0}–${tf?.maxPerWeek ?? "any"} trades a week`);
  const dd = s.objective.drawdownPenalty >= 1 ? "strongly avoids drawdowns" : s.objective.drawdownPenalty >= 0.5 ? "balances return and drawdown" : "accepts deeper drawdowns for return";
  parts.push(`${dd}, risking ${s.risk.riskPercentPerTrade}% per trade with at most ${s.risk.maxOpenPositions} open`);
  return `You want: ${parts.join("; ")}.`;
}
