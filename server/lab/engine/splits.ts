// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Chronological Train 60% | Validation 20% | Vault 20% with an embargo of
// maxHold bars between segments (López de Prado, Advances in Financial ML,
// ch. 7). A trade belongs to a segment only if it also exits before the next
// segment starts (purge), so no training trade overlaps validation or vault.

import { createHash } from "node:crypto";
import type { EnvData } from "./env";

export interface Segment {
  from: number;   // first signal row
  to: number;     // last signal row + 1
  limit: number;  // trades must exit before this row (start of the next segment, or end of data)
}

export interface Splits { train: Segment; validation: Segment; vault: Segment; embargo: number; rows: number }

export function makeSplits(rows: number, maxHold: number): Splits {
  const embargo = maxHold;
  const trainEnd = Math.floor(rows * 0.6);
  const valStart = trainEnd + embargo, valEnd = Math.floor(rows * 0.8);
  const vaultStart = valEnd + embargo;
  return {
    train: { from: 0, to: trainEnd, limit: valStart },
    validation: { from: valStart, to: valEnd, limit: vaultStart },
    vault: { from: vaultStart, to: rows, limit: rows + 1 },
    embargo, rows,
  };
}

/** SHA-256 of the vault segment's candle times: proves which data was locked. */
export function vaultHash(env: Pick<EnvData, "candles">, vault: Segment) {
  const h = createHash("sha256");
  for (let r = vault.from; r < Math.min(vault.to + 1, env.candles.length); r++) h.update(env.candles[r].time + "\n");
  return h.digest("hex");
}

/** The candle index training code may see up to (exclusive): everything before the vault. */
export const trainingCut = (s: Splits) => s.vault.from;
