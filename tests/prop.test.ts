// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateProp, challengeOdds, wilson, type PropRules } from "../server/lab/engine/prop";
import { rng } from "../server/lab/engine/rng";

const base: PropRules = { firmLabel: "Test", accountSize: 100_000, dailyLossLimitPct: 5, maxDrawdownPct: 10, drawdownType: "static", profitTargetPct: 10, weekendHoldingAllowed: false };
const seq = (rs: number[], perDay = 1) => rs.map((r, i) => ({ r, day: Math.floor(i / perDay) }));

test("static drawdown: the floor never moves, however high equity went", () => {
  // Up ~9.4% (peak ≈ 109.4), then down ~11%: static floor 90 → alive; trailing floor ≈ 99.4 → breached
  const rs = [...Array(9).fill(1), ...Array(12).fill(-1)];
  const s = simulateProp(seq(rs), { ...base, profitTargetPct: 50 }, 1);
  assert.notEqual(s.reason, "max_drawdown");
  const t = simulateProp(seq(rs), { ...base, profitTargetPct: 50, drawdownType: "trailing" }, 1);
  assert.equal(t.status, "failed");
  assert.equal(t.reason, "max_drawdown");
});

test("trailing end-of-day only raises its peak at day boundaries", () => {
  // Day 0: up 4% then down 3% intraday; day 1 starts.  Intraday trailing (6%) peak = 104 → floor 98;
  // end-of-day peak = 101 (day close) → floor 95.
  const day0 = [{ r: 4, day: 0 }, { r: -3.1, day: 0 }];
  const then = [{ r: -1.5, day: 1 }, { r: -1.5, day: 1 }];
  const rules = { ...base, maxDrawdownPct: 6, drawdownType: "trailing" as const, profitTargetPct: 50, dailyLossLimitPct: 50 };
  assert.equal(simulateProp([...day0, ...then], { ...rules, drawdownMeasure: "intraday" }, 1).reason, "max_drawdown");
  assert.equal(simulateProp([...day0, ...then], { ...rules, drawdownMeasure: "end_of_day" }, 1).status, "open");
});

test("the daily loss limit resets each day", () => {
  // −4% every day for 2 days: never −5% in one day (static 10% floor not reached either) → alive
  const two = [{ r: -2, day: 0 }, { r: -2, day: 0 }, { r: -2, day: 1 }, { r: -2, day: 1 }];
  assert.equal(simulateProp(two, base, 1).status, "open");
  // The same 6 losses in one day breach it
  assert.equal(simulateProp([1, 2, 3].flatMap(() => [{ r: -2, day: 0 }]), { ...base, dailyLossLimitPct: 5 }, 1).reason, "daily_loss");
});

test("passing needs the target, the minimum days and (if set) consistency", () => {
  const big = seq([12], 1); // +12% in one trade on day 0
  assert.equal(simulateProp(big, base, 1).status, "passed");
  assert.equal(simulateProp(big, { ...base, minTradingDays: 3 }, 1).status, "open");
  assert.equal(simulateProp(big, { ...base, consistencyRulePct: 40 }, 1).status, "open", "one day made 100% of profit");
  const spread = seq([3, 3, 3, 3], 1);
  assert.equal(simulateProp(spread, { ...base, consistencyRulePct: 40 }, 1).status, "passed");
  assert.equal(simulateProp(seq(Array(40).fill(0.01)), { ...base, timeLimitDays: 30 }, 1).reason, "time_limit");
});

test("Challenge Odds: a range, not a point; wider with fewer real trades", () => {
  const R = rng(9);
  const good = Array.from({ length: 400 }, () => (R.next() < 0.45 ? 2 : -1));
  const rules = { ...base, timeLimitDays: 60 };
  const many = challengeOdds(good, 2, rules, 1, rng(1), 3000)!;
  const few = challengeOdds(good.slice(0, 40), 2, rules, 1, rng(1), 3000)!;
  assert.ok(many.lo < many.passRate && many.passRate < many.hi);
  assert.ok(few.hi - few.lo > many.hi - many.lo, "fewer real trades → wider interval");
  const bad = Array.from({ length: 400 }, () => (R.next() < 0.25 ? 2 : -1));
  assert.ok(challengeOdds(bad, 2, rules, 1, rng(2), 3000)!.passRate < many.passRate);
  assert.equal(challengeOdds(good.slice(0, 5), 2, rules, 1, rng(3)), null, "too little evidence: no number at all");
  const w = wilson(50, 100);
  assert.ok(w.lo < 0.5 && w.hi > 0.5 && Math.abs(w.hi - w.lo - 0.162) < 0.01);
});
