// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Engine types. The engine is pure: no database, network or HTTP. Results are
// plain JSON with stable shapes (future Depot Engine API).

import type { StyleKey } from "../../tdci";

export const STOP_GRID = [1, 1.5, 2, 3] as const;          // stop distance in ATRs
export const RR_GRID = [1, 1.5, 2, 2.5, 3] as const;       // target in R
export const THRESHOLD_MIN = 15, THRESHOLD_MAX = 90;

export interface BlueprintSpec {
  version: 1;
  style: StyleKey;
  symbols: string[];
  objective: {
    totalR: number;
    drawdownPenalty: number;     // λ on max drawdown (R)
    consistencyPenalty: number;  // κ on std of episode scores
    tradeFrequency?: { minPerWeek?: number; maxPerWeek?: number };
  };
  constraints: {
    maxConsecutiveLosses?: number;
    noWeekendHolding?: boolean;
    sessionHoursUtc?: [number, number];
    maxStopAtr?: number;
    minRr?: number;
  };
  risk: { riskPercentPerTrade: number; maxOpenPositions: number };
}

/** An agent's DNA. */
export interface Genome {
  w: number[];        // one weight per profile layer, in [-1, 1]; 0 = layer off; negative = contrarian
  threshold: number;  // integer THRESHOLD_MIN..THRESHOLD_MAX
  stopIdx: number;    // into STOP_GRID
  rrIdx: number;      // into RR_GRID
}

export type Grade = "licensed" | "probation" | "scrapped";
export type Stage = "vault" | "shadow" | "live" | "retired";

export interface Trade { t: number; side: 1 | -1; r: number; exit: number }

export type FailureReason =
  | "too_few_trades" | "vault_negative" | "weak_profit_factor" | "cost_fragile"
  | "likely_luck" | "no_better_than_default" | "no_champion";

export const FAILURE_TEXT: Record<FailureReason, string> = {
  too_few_trades: "Too few trades in the locked data to judge it (needs at least 30).",
  vault_negative: "It lost money on the locked data it had never seen.",
  weak_profit_factor: "Gains barely covered losses on the locked data (profit factor under 1.1).",
  cost_fragile: "It stopped making money when trading costs doubled.",
  likely_luck: "After accounting for how many versions were tried, the result is likely luck.",
  no_better_than_default: "It did no better than the default TDCI settings on the same data.",
  no_champion: "No version made at least 30 trades on the validation data, so there was nothing to examine.",
};
