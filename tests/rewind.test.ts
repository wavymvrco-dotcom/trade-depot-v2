// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rewind, rewindTrade, fitUserGenome, MUTATIONS, type RealTrade } from "../server/lab/engine/rewind";
import { rng } from "../server/lab/engine/rng";
import type { Candle } from "../server/indicators";

// A straight up-trend: each bar opens 1 above the last
const p: Candle[] = Array.from({ length: 200 }, (_, i) => ({ time: String(i), open: 100 + i, high: 100.5 + i, low: 99.5 + i, close: 100.9 + i }));
const atr = new Float64Array(200).fill(2);
const trade = (o: Partial<RealTrade>): RealTrade => ({ id: "t", side: 1, entryIdx: 50, exitIdx: 60, entryPrice: 150, exitPrice: 160, stopPrice: null, valuePerPoint: 10, profit: 100, scoreAtEntry: 70, ...o });

test("entering earlier in an up-trend helps a long; the user's exit is kept", () => {
  assert.equal(rewindTrade(p, atr, trade({}), "enter_minus2", 60), (160 - 148) * 10);
  assert.equal(rewindTrade(p, atr, trade({}), "enter_plus2", 60), (160 - 152) * 10);
  assert.equal(rewindTrade(p, atr, trade({ exitIdx: 51 }), "enter_plus2", 60), 100, "can't enter after the exit: unchanged");
});

test("a tighter stop cuts a trade that dipped below it; size changes scale profit; low-TDCI trades can be skipped", () => {
  const dip = p.map((c, i) => (i === 55 ? { ...c, low: 140 } : c));
  assert.equal(rewindTrade(dip, atr, trade({}), "stop_1atr", 60), (148 - 150) * 10);
  assert.equal(rewindTrade(p, atr, trade({}), "stop_1atr", 60), 100, "no dip: stop not hit, unchanged");
  assert.equal(rewindTrade(p, atr, trade({}), "double_size", 60), 200);
  assert.equal(rewindTrade(p, atr, trade({ scoreAtEntry: 30 }), "skip_low_tdci", 60), 0);
});

test("every change is applied to all trades and summed — no cherry-picking", () => {
  const trades = [trade({ id: "a", profit: 100 }), trade({ id: "b", profit: -50, exitPrice: 145, scoreAtEntry: 20 }), trade({ id: "c", profit: -80, exitPrice: 142, scoreAtEntry: 80 })];
  const rep = rewind(p, atr, trades, 60);
  assert.equal(rep.mutations.length, MUTATIONS.length);
  const skip = rep.mutations.find(m => m.key === "skip_low_tdci")!;
  assert.equal(skip.total, 100 + 0 - 80);            // only b skipped; a and c count as they were
  assert.equal(skip.helped + skip.hurt <= 3, true);
  assert.equal(rep.worst10[0].id, "c");
  assert.ok(rep.best == null || (rep.best.key !== "half_size" && rep.best.key !== "double_size"), "size is never offered as 'the' fix");
});

test("Gen Zero 'you': the fitted genome leans on the layer that predicted the user's entries", () => {
  const R = rng(4);
  const row = (hot: boolean) => Array.from({ length: 6 }, (_, j) => (j === 3 && hot ? R.uniform(0.6, 1) * (R.next() < 0.5 ? -1 : 1) : R.uniform(-0.4, 0.4)));
  const w = fitUserGenome(Array.from({ length: 80 }, () => row(true)), Array.from({ length: 400 }, () => row(false)))!;
  assert.equal(w.indexOf(Math.max(...w)), 3, `weights ${w}`);
  assert.equal(fitUserGenome([row(true)], [row(false)]), null, "too few entries: no genome");
});
