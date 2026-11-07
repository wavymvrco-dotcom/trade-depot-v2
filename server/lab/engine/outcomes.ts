// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Trade simulation, shared by TDCI calibration and the Lab so both judge trades
// by identical rules. Entry at the next bar's open after the signal bar closes;
// stop and target from the signal bar's ATR; a bar touching both counts as the
// stop (conservative); longs exit on the bid, shorts on the ask; spread,
// slippage and commission included.

import { calcProfit } from "@shared/pips";
import type { Candle } from "../../indicators";

export interface TradeCost { half: number; slip: number; commission: number }
export interface TradeModel { stopAtr: number; rr: number; maxHold: number }

export interface SimResult { r: number; exitIdx: number; costR: number }

export function simulateTrade(
  p: readonly Candle[], atrAtSignal: number, symbol: string, i: number, side: 1 | -1,
  model: TradeModel, cost: TradeCost,
): SimResult {
  const { stopAtr, rr, maxHold } = model;
  const a = atrAtSignal;
  const mid = p[i + 1].open;
  const entry = side > 0 ? mid + cost.half + cost.slip : mid - cost.half - cost.slip;
  const sl = entry - side * stopAtr * a, tp = entry + side * rr * stopAtr * a;
  let exit = NaN, exitIdx = Math.min(i + maxHold, p.length - 1);
  for (let j = i + 1; j <= exitIdx; j++) {
    const b = p[j];
    const slHit = side > 0 ? b.low - cost.half <= sl : b.high + cost.half >= sl;
    const tpHit = side > 0 ? b.high - cost.half >= tp : b.low + cost.half <= tp;
    if (slHit) { exit = sl - side * cost.slip; exitIdx = j; break; }
    if (tpHit) { exit = tp; exitIdx = j; break; }
  }
  if (!Number.isFinite(exit)) exit = side > 0 ? p[exitIdx].close - cost.half : p[exitIdx].close + cost.half;
  const commissionR = commissionInR(symbol, entry, stopAtr * a, cost.commission);
  const r = (side * (exit - entry)) / (stopAtr * a) - commissionR;
  const costR = (2 * cost.half + 2 * cost.slip) / (stopAtr * a) + commissionR;
  return { r, exitIdx, costR };
}

/** Round-trip commission as a fraction of 1R for a stop `stopDistance` away. */
export function commissionInR(symbol: string, entry: number, stopDistance: number, commissionPerLot: number) {
  const riskPerLot = Math.abs(calcProfit("BUY", entry, entry - stopDistance, symbol, 1));
  return riskPerLot > 0 ? commissionPerLot / riskPerLot : 0;
}

/**
 * R of a position closed at the close of bar `k` (used when a rule forces an
 * exit, e.g. no weekend holding). Same entry and cost conventions as above.
 */
export function closeAtBarR(
  p: readonly Candle[], atrAtSignal: number, symbol: string, i: number, side: 1 | -1, k: number,
  stopAtr: number, cost: TradeCost,
) {
  const mid = p[i + 1].open;
  const entry = side > 0 ? mid + cost.half + cost.slip : mid - cost.half - cost.slip;
  const exit = side > 0 ? p[k].close - cost.half : p[k].close + cost.half;
  const d = stopAtr * atrAtSignal;
  return (side * (exit - entry)) / d - commissionInR(symbol, entry, d, cost.commission);
}

/**
 * Resolve a trade on live data where only bars up to `lastClosed` exist.
 * Same rules as simulateTrade. `final` is false while the trade is still open
 * (no stop/target hit yet and max hold not reached).
 */
export function resolveTrade(
  p: readonly Candle[], atrAtSignal: number, symbol: string, i: number, side: 1 | -1,
  model: TradeModel, cost: TradeCost, lastClosed: number,
): (SimResult & { final: boolean; entry: number; sl: number; tp: number; exitPrice: number | null }) | null {
  if (i + 1 > lastClosed) return null; // entry bar not open yet
  const { stopAtr, rr, maxHold } = model;
  const a = atrAtSignal;
  const mid = p[i + 1].open;
  const entry = side > 0 ? mid + cost.half + cost.slip : mid - cost.half - cost.slip;
  const sl = entry - side * stopAtr * a, tp = entry + side * rr * stopAtr * a;
  const commissionR = commissionInR(symbol, entry, stopAtr * a, cost.commission);
  const costR = (2 * cost.half + 2 * cost.slip) / (stopAtr * a) + commissionR;
  const horizon = Math.min(i + maxHold, lastClosed);
  for (let j = i + 1; j <= horizon; j++) {
    const b = p[j];
    const slHit = side > 0 ? b.low - cost.half <= sl : b.high + cost.half >= sl;
    const tpHit = side > 0 ? b.high - cost.half >= tp : b.low + cost.half <= tp;
    if (slHit || tpHit) {
      const exit = slHit ? sl - side * cost.slip : tp;
      return { r: (side * (exit - entry)) / (stopAtr * a) - commissionR, exitIdx: j, costR, final: true, entry, sl, tp, exitPrice: exit };
    }
  }
  if (i + maxHold <= lastClosed) {
    const k = i + maxHold;
    const exit = side > 0 ? p[k].close - cost.half : p[k].close + cost.half;
    return { r: (side * (exit - entry)) / (stopAtr * a) - commissionR, exitIdx: k, costR, final: true, entry, sl, tp, exitPrice: exit };
  }
  return { r: 0, exitIdx: -1, costR, final: false, entry, sl, tp, exitPrice: null };
}
