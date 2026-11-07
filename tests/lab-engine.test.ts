// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Strategy Lab engine tests (build sheet §9.13).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { normCdf, normInv, deflatedSharpe, cusumTrips, maxDrawdown, moments } from "../server/lab/engine/stats";
import { rng } from "../server/lab/engine/rng";
import { scoreRow, weightNorm, attribution } from "../server/lab/engine/combine";
import { simulateTrade, resolveTrade } from "../server/lab/engine/outcomes";
import { nextState, mayTradeLive, IllegalTransition } from "../server/lab/engine/license-rules";
import { buildEnvData, makeEnv, sliceEnvData } from "../server/lab/engine/env";
import { makeSplits } from "../server/lab/engine/splits";
import { runGenome } from "../server/lab/engine/episode";
import { runLab } from "../server/lab/engine/lab";
import { TRIPWIRE, judgeLive, judgeShadow } from "../server/lab/engine/verdicts";
import { combine, prepare, warmup, PROFILES, type LayerKey, type Weights } from "../server/tdci";
import { calcProfit } from "../shared/pips";
import type { Candle } from "../server/indicators";
import { syntheticEnv, spec, defaults } from "./lab-helpers";

// ─── Stats ────────────────────────────────────────────────────────────────────

test("Φ and Φ⁻¹ match known values", () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-15);
  assert.ok(Math.abs(normCdf(1.959963984540054) - 0.975) < 1e-12);
  assert.ok(Math.abs(normCdf(-3) - 0.0013498980316301) < 1e-13);
  assert.ok(Math.abs(normInv(0.975) - 1.959963984540054) < 1e-9);
  assert.ok(Math.abs(normInv(0.01) + 2.326347874040841) < 1e-9);
  for (const p of [1e-8, 0.001, 0.2, 0.5, 0.8, 0.999, 1 - 1e-8]) assert.ok(Math.abs(normCdf(normInv(p)) - p) < 1e-12 * Math.max(1, 1 / p));
});

test("Deflated Sharpe matches Bailey & López de Prado's worked example (DSR ≈ 0.9004)", () => {
  // Annualized SR 2.5 on 1,250 daily returns, skew −3, kurtosis 10, N = 100 trials, V = 0.5 (annualized)
  const r = deflatedSharpe({ sharpe: 2.5 / Math.sqrt(250), observations: 1250, skew: -3, kurt: 10, trials: 100, varianceOfSharpes: 0.5 / 250 });
  assert.ok(Math.abs(r.sr0 - 0.1132) < 5e-4, `SR0 ${r.sr0}`);
  assert.ok(Math.abs(r.dsr - 0.9004) < 1e-3, `DSR ${r.dsr}`);
});

test("moments: normal-ish sample has skew ≈ 0 and kurtosis ≈ 3", () => {
  const R = rng(5); const xs = Array.from({ length: 200_000 }, () => R.normal());
  const m = moments(xs);
  assert.ok(Math.abs(m.skew) < 0.03 && Math.abs(m.kurt - 3) < 0.06, JSON.stringify(m));
});

// ─── Tripwire (CUSUM) ─────────────────────────────────────────────────────────

// Trade-shaped returns: 40% wins at +2R, 60% losses at −1R (mean 0.2R)
const trade = (R: ReturnType<typeof rng>, p: number) => (R.next() < p ? 2 : -1);
const vaultLike = { meanR: 0.2, sigmaR: Math.sqrt(0.4 * 4 + 0.6 - 0.04), meanP05: 0.05, meanP95: 0.35, ddP95: 12, ddP99: 1e9 };

test("Tripwire false-trip rate is under 5% over 1,000 stationary trades", () => {
  const R = rng(11); let trips = 0;
  for (let run = 0; run < 400; run++) {
    const rs = Array.from({ length: 1000 }, () => trade(R, 0.4));
    if (cusumTrips(rs, vaultLike.meanR, vaultLike.sigmaR, TRIPWIRE.k, TRIPWIRE.h).tripped) trips++;
  }
  assert.ok(trips / 400 < 0.05, `false-trip rate ${(trips / 4).toFixed(1)}%`);
});

test("Tripwire catches a planted drop in the edge", () => {
  const R = rng(12); let caught = 0;
  for (let run = 0; run < 200; run++) {
    const rs = Array.from({ length: 1000 }, () => trade(R, 0.2)); // win rate 40% → 20%, same 1,000-trade horizon
    if (judgeLive(rs, vaultLike).tripped) caught++;
  }
  assert.ok(caught / 200 > 0.95, `caught ${caught}/200`);
});

test("Shadow judge: a strategy performing as predicted graduates; a collapsing one is scrapped", () => {
  const R = rng(13);
  const good = Array.from({ length: 40 }, () => trade(R, 0.5));
  const v = { ...vaultLike, meanR: 0.5, meanP05: 0.1, ddP95: 15, ddP99: 25 };
  const ok = judgeShadow(good, good.map(r => r), 31, v);
  assert.equal(ok.verdict, "graduate", JSON.stringify(ok.checks));
  const bad = Array.from({ length: 30 }, () => -1);
  assert.equal(judgeShadow(bad, bad, 20, v).verdict, "scrap");
});

// ─── Parity with the existing TDCI code ───────────────────────────────────────

test("engine scoreRow equals tdci.combine on 10,000 random inputs", () => {
  const R = rng(21);
  const keys: LayerKey[] = ["trend", "momentum", "structure", "liquidity", "value", "fibonacci", "positioning", "adx"];
  for (let k = 0; k < 10_000; k++) {
    const x = keys.map(() => R.uniform(-1, 1)), w = keys.map(() => (R.next() < 0.1 ? 0 : R.uniform(-1, 1)));
    const regime = R.next();
    const xr = Object.fromEntries(keys.map((key, j) => [key, x[j]])), wr: Weights = Object.fromEntries(keys.map((key, j) => [key, w[j]]));
    const a = combine(xr, regime, wr), b = scoreRow(x, keys.length, 0, regime, w, weightNorm(w));
    assert.equal(b.composite, a.composite);
    assert.equal(b.score, a.score);
    assert.equal(b.direction === 0 ? "NEUTRAL" : b.direction > 0 ? "LONG" : "SHORT", a.direction);
  }
});

// Verbatim copy of tdci-service.simulate() before it was moved to the engine
function legacySimulate(p: Candle[], pAtr: number[], symbol: string, model: { stopAtr: number; rr: number; maxHold: number }, i: number, side: 1 | -1, cost: { half: number; slip: number; commission: number }) {
  const { stopAtr, rr, maxHold } = model;
  const a = pAtr[i];
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
  const riskPerLot = Math.abs(calcProfit("BUY", entry, entry - stopAtr * a, symbol, 1));
  const commissionR = riskPerLot > 0 ? cost.commission / riskPerLot : 0;
  const r = (side * (exit - entry)) / (stopAtr * a) - commissionR;
  const costR = (2 * cost.half + 2 * cost.slip) / (stopAtr * a) + commissionR;
  return { r, exitIdx, costR };
}

test("shared simulateTrade equals the previous calibration simulate()", () => {
  const d = syntheticEnv({ seed: 3, rows: 1500 });
  const atr = Array.from(d.atr);
  for (const model of [{ stopAtr: 1.5, rr: 2, maxHold: 30 }, { stopAtr: 3, rr: 1.5, maxHold: 48 }, { stopAtr: 1, rr: 3, maxHold: 5 }]) {
    for (let i = 0; i < 1499; i += 7) for (const side of [1, -1] as const) {
      assert.deepEqual(simulateTrade(d.candles, atr[i], d.symbol, i, side, model, d.cost), legacySimulate(d.candles, atr, d.symbol, model, i, side, d.cost));
    }
  }
});

test("trade attribution: layer contributions sum to the composite", () => {
  const R = rng(4);
  for (let k = 0; k < 500; k++) {
    const x = Array.from({ length: 8 }, () => R.uniform(-1, 1)), w = Array.from({ length: 8 }, () => R.uniform(-1, 1));
    const a = attribution(x, w, x.map((_, j) => `l${j}`));
    const direct = scoreRow(x, 8, 0, 1, w, weightNorm(w)).composite;
    assert.ok(Math.abs(a.composite - direct) < 1e-12);
    assert.ok(Math.abs(a.top.reduce((s, t) => s + t.share, 0) - 1) < 1e-9 || a.top.length === 4);
  }
});

// ─── No look-ahead (invariant 1) ─────────────────────────────────────────────

test("env rows and decisions at bar i do not change when later candles change", () => {
  const prof = PROFILES.day;
  const t0 = Date.UTC(2020, 0, 6);
  const mk = (n: number, step: number, seed: number) => {
    const R = rng(seed); let price = 1.1;
    return Array.from({ length: n }, (_, i) => {
      const open = price, close = open * (1 + R.normal(0, 0.001));
      price = close;
      const d = new Date(t0 + i * step).toISOString();
      return { time: d.slice(0, 19).replace("T", " "), open, high: Math.max(open, close) * 1.0005, low: Math.min(open, close) * 0.9995, close };
    });
  };
  const p = mk(1600, 900e3, 1), h = mk(500, 4 * 3600e3, 2).map((c, i) => ({ ...c, time: new Date(t0 - 60 * 4 * 3600e3 + i * 4 * 3600e3).toISOString().slice(0, 19).replace("T", " ") }));
  const full = buildEnvData(prepare("EURUSD", prof, p, h, { spread: 0.0001 }), { half: 0.00005, slip: 0.00003, commission: 7 });
  const R = rng(9);
  for (let trial = 0; trial < 6; trial++) {
    const cut = warmup(prepare("EURUSD", prof, p, h)) + 200 + R.int(0, 900);
    // Perturb every candle after `cut`
    const p2 = p.map((c, i) => (i > cut ? { ...c, close: c.close * 1.01, high: c.high * 1.02, low: c.low * 0.99 } : c));
    const pert = buildEnvData(prepare("EURUSD", prof, p2, h, { spread: 0.0001 }), { half: 0.00005, slip: 0.00003, commission: 7 });
    const start = p.length - full.candles.length; // first scorable candle
    const rowsToCheck = cut - start; // rows whose signal bar closes at or before `cut`
    const L = full.layers.length;
    for (let r = 0; r <= rowsToCheck; r++) {
      for (let j = 0; j < L; j++) assert.equal(pert.X[r * L + j], full.X[r * L + j], `layer ${j} changed at row ${r} (cut ${cut})`);
      assert.equal(pert.g[r], full.g[r]);
      const w = full.layers.map((_, j) => (j % 2 ? 0.5 : -0.3));
      assert.deepEqual(scoreRow(pert.X, L, r, pert.g[r], w, weightNorm(w)), scoreRow(full.X, L, r, full.g[r], w, weightNorm(w)));
    }
  }
});

// ─── Splits, purge, embargo ───────────────────────────────────────────────────

test("splits: segments don't overlap, embargo ≥ maxHold, and no trade crosses into the next segment", () => {
  const d = syntheticEnv({ seed: 8, rows: 3000 });
  const s = makeSplits(3000, d.maxHold);
  assert.ok(s.train.to <= s.validation.from - d.maxHold);
  assert.ok(s.validation.to <= s.vault.from - d.maxHold);
  assert.equal(s.train.limit, s.validation.from);
  const env = makeEnv(d);
  for (const seg of [s.train, s.validation]) {
    const res = runGenome(env, { w: [1, 0, 0, 0, 0, 0], threshold: 15, stopIdx: 3, rrIdx: 4 }, { ...seg, costMult: 1, constraints: {} });
    assert.ok(res.trades.length > 10);
    for (const t of res.trades) { assert.ok(t.t >= seg.from && t.t < seg.to); assert.ok(t.exit < seg.limit, `trade exits at ${t.exit} ≥ ${seg.limit}`); }
  }
});

// ─── The Vault (invariant 2) ──────────────────────────────────────────────────

test("training never sees the vault: changing vault candles leaves training results identical", () => {
  const a = syntheticEnv({ seed: 30, planted: 2 });
  const s = makeSplits(a.candles.length - 1, a.maxHold);
  const b = { ...a, candles: a.candles.map((c, i) => (i >= s.vault.from ? { ...c, close: c.close * 1.05, high: c.high * 1.06 } : c)) };
  const cfg = { spec: spec(), seed: 4, population: 24, generations: 6, episodes: 4, ...defaults() };
  const ra = runLab({ ...cfg, envData: [a] }), rb = runLab({ ...cfg, envData: [b] });
  assert.deepEqual(rb.hallOfFame, ra.hallOfFame);
  assert.deepEqual(rb.champion, ra.champion);
  assert.notDeepEqual(rb.vault?.base, ra.vault?.base, "the vault itself did change");
  assert.notEqual(rb.vault?.vaultHashes.EURUSD, undefined);
});

test("the vault opens only once per strategy", () => {
  const opened = new Set<string>();
  const claimVault = (h: string, vh: Record<string, string>) => { const k = h + JSON.stringify(vh); if (opened.has(k)) return false; opened.add(k); return true; };
  const cfg = { envData: [syntheticEnv({ seed: 31, planted: 2 })], spec: spec(), seed: 4, population: 24, generations: 5, episodes: 4, ...defaults(), claimVault };
  runLab(cfg);
  assert.throws(() => runLab(cfg), /only once/);
});

// ─── Determinism (invariant 10) ───────────────────────────────────────────────

test("same seed + data + config gives byte-identical result JSON", () => {
  const cfg = { envData: [syntheticEnv({ seed: 40, planted: 1 }), syntheticEnv({ seed: 41, planted: 1, symbol: "GBPUSD" })], spec: spec(["EURUSD", "GBPUSD"]), seed: 77, population: 32, generations: 8, episodes: 6, ...defaults() };
  assert.equal(JSON.stringify(runLab(cfg)), JSON.stringify(runLab(cfg)));
  assert.notEqual(JSON.stringify(runLab({ ...cfg, seed: 78 })), JSON.stringify(runLab(cfg)));
});

// ─── Honesty guarantee ────────────────────────────────────────────────────────

test("planted signal: the champion leans hardest on the planted layer and the vault is positive", () => {
  for (const seed of [1, 2, 3, 4]) {
    const res = runLab({ envData: [syntheticEnv({ seed: seed * 10, planted: 2 })], spec: spec(), seed, population: 48, generations: 15, episodes: 6, ...defaults() });
    assert.ok(res.champion, "a champion was found");
    const w = res.champion!.genome.w.map(Math.abs);
    assert.equal(w.indexOf(Math.max(...w)), 2, `weights ${res.champion!.genome.w}`);
    assert.ok(res.champion!.genome.w[2] > 0, "it trades with the signal, not against it");
    assert.ok(res.vault!.base.totalR > 0, `vault ${res.vault!.base.totalR}R`);
  }
});

test("pure random walk: Scrapped (likely luck or vault negative) in at least 95% of 40 seeds", () => {
  let scrapped = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const res = runLab({ envData: [syntheticEnv({ seed: 1000 + seed, planted: null })], spec: spec(), seed, population: 32, generations: 10, episodes: 6, ...defaults() });
    if (res.grade === "scrapped" && (res.failureReasons.includes("likely_luck") || res.failureReasons.includes("vault_negative") || res.failureReasons.includes("no_champion"))) scrapped++;
  }
  assert.ok(scrapped >= 38, `scrapped ${scrapped}/40`);
});

test("successive halving finds the planted layer as reliably as full evaluation, with less compute", () => {
  const N = 12, hits = { true: 0, false: 0 }, evals = { true: 0, false: 0 };
  for (let s = 1; s <= N; s++) {
    const planted = s % 6;
    for (const successiveHalving of [true, false]) {
      const res = runLab({ envData: [syntheticEnv({ seed: 500 + s, planted })], spec: spec(), seed: s, population: 48, generations: 15, episodes: 8, successiveHalving, ...defaults() });
      const w = res.champion!.genome.w.map(Math.abs);
      if (w.indexOf(Math.max(...w)) === planted) hits[String(successiveHalving) as "true"]++;
      evals[String(successiveHalving) as "true"] += res.evaluations;
    }
  }
  assert.ok(hits.true >= N - 1 && hits.true >= hits.false - 1, `halving ${hits.true}/${N}, full ${hits.false}/${N}`);
  assert.ok(evals.false / evals.true >= 2, `compute saving ${(evals.false / evals.true).toFixed(2)}×`);
});

// ─── Module boundary ──────────────────────────────────────────────────────────

test("engine code never imports the database, HTTP server, or service layer", () => {
  const dir = join(process.cwd(), "server/lab/engine");
  for (const f of readdirSync(dir).filter(f => f.endsWith(".ts"))) {
    const src = readFileSync(join(dir, f), "utf8");
    const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map(m => m[1]);
    for (const i of imports) assert.ok(!/(^|\/)(db|service|routes|storage|express|pg|pg-boss)(\.ts)?$|\/service\//.test(i) && i !== "express", `${f} imports ${i}`);
    assert.ok(!/\bfetch\(/.test(src), `${f} calls fetch`);
  }
});

test("max drawdown helper", () => assert.equal(maxDrawdown([1, -2, 1, -3, 5]), 4));

test("live trade resolution matches the simulator once the trade is final", () => {
  const d = syntheticEnv({ seed: 60, rows: 800 });
  const model = { stopAtr: 1.5, rr: 2, maxHold: 30 };
  for (let i = 10; i < 700; i += 13) for (const side of [1, -1] as const) {
    const sim = simulateTrade(d.candles, d.atr[i], d.symbol, i, side, model, d.cost);
    // Before the exit bar has closed the trade is still open; once it has, results match exactly
    const early = resolveTrade(d.candles, d.atr[i], d.symbol, i, side, model, d.cost, sim.exitIdx - 1);
    if (sim.exitIdx - 1 > i) assert.equal(early!.final, false);
    const done = resolveTrade(d.candles, d.atr[i], d.symbol, i, side, model, d.cost, sim.exitIdx);
    assert.equal(done!.final, true);
    assert.equal(done!.exitIdx, sim.exitIdx);
    assert.equal(done!.r, sim.r);
  }
});

test("license transitions: legal moves work, illegal ones throw", () => {
  let s = nextState(null, "exam_passed");
  assert.deepEqual(s, { grade: "probation", stage: "vault" });
  s = nextState(s, "start_shadow"); s = nextState(s, "graduate"); s = nextState(s, "go_live");
  assert.ok(mayTradeLive(s));
  assert.deepEqual(nextState(s, "tripwire"), { grade: "probation", stage: "shadow" });
  assert.throws(() => nextState({ grade: "probation", stage: "vault" }, "go_live"), IllegalTransition);
  assert.throws(() => nextState({ grade: "scrapped", stage: "vault" }, "start_shadow"), IllegalTransition);
  assert.throws(() => nextState({ grade: "probation", stage: "shadow" }, "go_live"), IllegalTransition);
  assert.throws(() => nextState(null, "graduate"), IllegalTransition);
  assert.ok(!mayTradeLive({ grade: "probation", stage: "live" as any }));
});

test("grades change only through server/lab/service/licenses.ts", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".ts")) files.push(p); } };
  walk(join(process.cwd(), "server"));
  for (const f of files) {
    if (f.split("\\").join("/").endsWith("server/lab/service/licenses.ts")) continue;
    const src = readFileSync(f, "utf8");
    assert.ok(!/update\(\s*strategyLicenses\s*\)/.test(src), `${f} updates strategy_licenses directly`);
    assert.ok(!/insert\(\s*strategyLicenses\s*\)/.test(src), `${f} inserts strategy_licenses directly`);
  }
});

test("a bar that opens beyond the stop fills at the open (gap), not at the stop", () => {
  const atr = 0.001, cost = { half: 0, slip: 0, commission: 0 };
  const c = (o: number, h: number, l: number, cl: number) => ({ time: "t", open: o, high: h, low: l, close: cl });
  // Long from 1.1000 with a 1.5 ATR stop at 1.0985; the next bar gaps down and opens at 1.0950
  const p = [c(1.1, 1.1, 1.1, 1.1), c(1.1, 1.1005, 1.0995, 1.1), c(1.095, 1.0955, 1.094, 1.0945)];
  const r = simulateTrade(p, atr, "EURUSD", 0, 1, { stopAtr: 1.5, rr: 2, maxHold: 5 }, cost);
  assert.ok(Math.abs(r.r - (1.095 - 1.1) / 0.0015) < 1e-9, `gap loss ${r.r}R, worse than −1R`);
  // Without a gap the stop fills at the stop: exactly −1R
  const q = [c(1.1, 1.1, 1.1, 1.1), c(1.1, 1.1005, 1.0995, 1.1), c(1.0999, 1.1, 1.098, 1.0982)];
  assert.ok(Math.abs(simulateTrade(q, atr, "EURUSD", 0, 1, { stopAtr: 1.5, rr: 2, maxHold: 5 }, cost).r + 1) < 1e-9);
});
