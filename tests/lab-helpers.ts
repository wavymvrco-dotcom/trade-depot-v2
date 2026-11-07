// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Synthetic markets for Lab tests. Layer values are AR(1) noise; price returns
// optionally depend on one "planted" layer, so we know the true answer.

import type { EnvData } from "../server/lab/engine/env";
import type { BlueprintSpec } from "../server/lab/engine/types";
import { rng } from "../server/lab/engine/rng";
import type { Candle } from "../server/indicators";

export const H4 = 4 * 3600_000;

export function syntheticEnv(opts: { seed: number; rows?: number; layers?: number; planted?: number | null; beta?: number; symbol?: string }): EnvData {
  const { seed, rows = 4000, layers = 6, planted = null, beta = 0.35, symbol = "EURUSD" } = opts;
  const R = rng(seed);
  const L = layers;
  const X = new Float32Array(rows * L);
  const prev = new Array(L).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let j = 0; j < L; j++) {
      prev[j] = Math.max(-1, Math.min(1, 0.9 * prev[j] + R.normal(0, 0.35)));
      X[r * L + j] = prev[j];
    }
  }
  const sigma = 0.002, t0 = Date.UTC(2016, 0, 4);
  const candles: Candle[] = [];
  let price = 1.1;
  for (let k = 0; k <= rows; k++) {
    const drift = planted != null && k > 0 ? beta * X[(k - 1) * L + planted] : 0;
    const open = price;
    const close = open * (1 + sigma * (R.normal(0, 1) + drift));
    const high = Math.max(open, close) * (1 + Math.abs(R.normal(0, 0.4)) * sigma);
    const low = Math.min(open, close) * (1 - Math.abs(R.normal(0, 0.4)) * sigma);
    candles.push({ time: new Date(t0 + k * H4).toISOString().slice(0, 19).replace("T", " "), open, high, low, close });
    price = close;
  }
  const g = new Float32Array(rows).fill(1);
  const tag = new Uint8Array(rows).map(() => (R.next() < 0.7 ? 1 : R.int(0, 4)));
  const closeHour = new Uint8Array(rows).map((_, r) => new Date(t0 + (r + 1) * H4).getUTCHours());
  return {
    symbol, style: "swing", layers: Array.from({ length: L }, (_, j) => `layer${j}`) as any,
    maxHold: 30, barMs: H4, cost: { half: 0.00005, slip: 0.00003, commission: 7 },
    candles, atr: new Float64Array(rows + 1).fill(1.1 * sigma * 1.6), X, g, tag, closeHour,
  };
}

export const spec = (symbols = ["EURUSD"]): BlueprintSpec => ({
  version: 1, style: "swing", symbols,
  objective: { totalR: 1, drawdownPenalty: 0.5, consistencyPenalty: 0.5 },
  constraints: {},
  risk: { riskPercentPerTrade: 1, maxOpenPositions: 1 },
});

export const defaults = (L = 6) => ({ defaultWeights: new Array(L).fill(1 / L), defaultStop: 1.5, defaultRr: 2 });
