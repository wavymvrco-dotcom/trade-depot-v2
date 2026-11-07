// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Rewind service (§10.3): the user's real trades (closed positions, plus journal
// entries that are not copies of a position) replayed on real 15-minute candles;
// the "you" genome for Gen Zero; and the user's worst drawdown windows for the
// Vault Exam.

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { positions, tradeJournal } from "@shared/schema";
import { getSymbolConfig } from "@shared/pips";
import { PROFILES, computeAt, parseTime, type StyleKey } from "../../tdci";
import { loadContext } from "../../tdci-service";
import { defaultSpreadPips } from "../../backtest";
import { storage } from "../../storage";
import { rewind, fitUserGenome, type RealTrade, type RewindReport } from "../engine/rewind";
import { scoreRow, weightNorm } from "../engine/combine";
import { nearestGrid, type EnvData } from "../engine/env";
import { rng, hashSeed } from "../engine/rng";
import type { Genome } from "../engine/types";
import { TDCI_SYMBOLS } from "../../tdci-service";

interface Closed { id: string; symbol: string; side: 1 | -1; openedAt: Date; closedAt: Date; entry: number; exit: number; lots: number; stop: number | null; profit: number }

/** Closed positions, plus journal entries that don't duplicate one (same symbol, opened within a minute). */
export async function closedTrades(userId: string): Promise<Closed[]> {
  const pos = await db.select().from(positions).where(and(eq(positions.userId, userId), eq(positions.status, "closed"), isNotNull(positions.closedAt)));
  const out: Closed[] = pos.filter(p => p.openedAt && p.closedAt && p.currentPrice != null).map(p => ({
    id: p.id, symbol: p.symbol, side: /buy|long/i.test(p.type) ? 1 : -1, openedAt: p.openedAt!, closedAt: p.closedAt!,
    entry: p.entryPrice, exit: p.currentPrice!, lots: p.size, stop: p.stopLoss, profit: p.profit,
  }));
  const jr = await db.select().from(tradeJournal).where(and(eq(tradeJournal.userId, userId), isNotNull(tradeJournal.closedAt), isNotNull(tradeJournal.exitPrice)));
  for (const j of jr) {
    if (!j.openedAt || !j.closedAt) continue;
    const dup = out.some(p => p.symbol === j.symbol && Math.abs(+p.openedAt - +j.openedAt!) < 60_000);
    if (dup) continue;
    const side = /buy|long/i.test(j.direction) ? 1 : -1;
    const cfg = getSymbolConfig(j.symbol);
    const profit = j.profitLoss ?? side * (j.exitPrice! - j.entryPrice) / cfg.pipSize * cfg.pipValue * j.lots;
    out.push({ id: `journal:${j.id}`, symbol: j.symbol, side, openedAt: j.openedAt, closedAt: j.closedAt, entry: j.entryPrice, exit: j.exitPrice!, lots: j.lots, stop: j.stopLoss, profit });
  }
  return out.filter(t => TDCI_SYMBOLS.includes(t.symbol)).sort((a, b) => +a.closedAt - +b.closedAt);
}

/** Index of the bar containing time t (last bar opening at or before t). */
function barAt(times: number[], t: number) {
  let lo = 0, hi = times.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (times[m] <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

/** "Your trades, rewound": every change applied to every trade (Performance hub). */
export async function userRewind(userId: string): Promise<RewindReport & { skippedOld: number }> {
  const trades = await closedTrades(userId);
  const settings = await storage.getUserSettings(userId);
  const threshold = settings?.tdciMinScore ?? 60;
  const profile = PROFILES.day; // 15-minute bars: fine enough to place entries, ~7 months of history
  const reports: RewindReport[] = [];
  let skippedOld = 0;
  for (const symbol of Array.from(new Set(trades.map(t => t.symbol)))) {
    const ctx = await loadContext(symbol, profile, profile.history.calibrate);
    const times = ctx.p.map(c => parseTime(c.time));
    const cfg = getSymbolConfig(symbol);
    const real: RealTrade[] = [];
    for (const t of trades.filter(x => x.symbol === symbol)) {
      const e = barAt(times, +t.openedAt), x = barAt(times, +t.closedAt);
      if (e < 1 || x < e) { skippedOld++; continue; } // older than the loaded history
      real.push({
        id: t.id, side: t.side, entryIdx: e, exitIdx: x, entryPrice: t.entry, exitPrice: t.exit, stopPrice: t.stop,
        valuePerPoint: (t.lots * cfg.pipValue) / cfg.pipSize, profit: t.profit,
        scoreAtEntry: computeAt(ctx, e - 1).score,
      });
    }
    if (real.length) reports.push(rewind(ctx.p, ctx.pAtr, real, threshold, defaultSpreadPips(symbol) * cfg.pipSize));
  }
  return { ...mergeReports(reports), skippedOld };
}

function mergeReports(rs: RewindReport[]): RewindReport {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  if (!rs.length) return { trades: 0, actualTotal: 0, mutations: [], best: null, worst10: [] };
  const mutations = rs[0].mutations.map(m => {
    const all = rs.map(r => r.mutations.find(x => x.key === m.key)!);
    return { ...m, total: r2(all.reduce((s, x) => s + x.total, 0)), delta: r2(all.reduce((s, x) => s + x.delta, 0)), helped: all.reduce((s, x) => s + x.helped, 0), hurt: all.reduce((s, x) => s + x.hurt, 0) };
  });
  const best = mutations.filter(m => m.key !== "half_size" && m.key !== "double_size" && m.delta > 0).sort((a, b) => b.delta - a.delta)[0];
  return {
    trades: rs.reduce((s, r) => s + r.trades, 0), actualTotal: r2(rs.reduce((s, r) => s + r.actualTotal, 0)), mutations,
    best: best ? { key: best.key, label: best.label, delta: best.delta } : null,
    worst10: rs.flatMap(r => r.worst10).sort((a, b) => a.actual - b.actual).slice(0, 10),
  };
}

/** Gen Zero "you": a genome fitted to where the user actually entered, on this run's environments. */
export async function userGenome(userId: string, style: StyleKey, envs: EnvData[]): Promise<Genome | null> {
  const trades = await closedTrades(userId);
  const entryRows: number[][] = [], otherRows: number[][] = [];
  const R = rng(hashSeed(userId + style));
  for (const d of envs) {
    const L = d.layers.length, n = d.candles.length - 1;
    const times = d.candles.map(c => parseTime(c.time));
    const taken = new Set<number>();
    for (const t of trades.filter(x => x.symbol === d.symbol)) {
      const row = barAt(times, +t.openedAt) - 1; // the decision bar before the entry
      if (row < 0 || row >= n) continue;
      taken.add(row);
      entryRows.push(Array.from(d.X.subarray(row * L, row * L + L)));
    }
    for (let k = 0; k < taken.size * 5; k++) {
      const row = R.int(0, n);
      if (!taken.has(row)) otherRows.push(Array.from(d.X.subarray(row * L, row * L + L)));
    }
  }
  const w = fitUserGenome(entryRows, otherRows);
  if (!w) return null;
  // Threshold: the median score of the user's own entries under these weights
  const norm = weightNorm(w);
  const scores = entryRows.map(x => scoreRow(x, x.length, 0, 1, w, norm).score).sort((a, b) => a - b);
  const threshold = Math.min(90, Math.max(15, scores[Math.floor(scores.length / 2)] ?? 40));
  const prof = PROFILES[style];
  return { w: w.map(v => Math.round(v * 1000) / 1000), threshold, ...nearestGrid(prof.model.stopAtr, prof.model.rr) };
}

/** The user's two worst drawdown periods (peak → trough of realised P&L), for the Vault Exam. */
export async function worstDrawdownWindows(userId: string, symbols: string[], count = 2) {
  const trades = await closedTrades(userId);
  if (trades.length < 10) return [];
  let eq = 0, peak = 0, peakAt = +trades[0].openedAt;
  const dds: { from: number; to: number; depth: number }[] = [];
  let cur: { from: number; to: number; depth: number } | null = null;
  for (const t of trades) {
    eq += t.profit;
    if (eq >= peak) { if (cur) dds.push(cur); cur = null; peak = eq; peakAt = +t.closedAt; continue; }
    const depth = peak - eq;
    if (!cur || depth > cur.depth) cur = { from: peakAt, to: +t.closedAt, depth };
  }
  if (cur) dds.push(cur);
  const worst = dds.sort((a, b) => b.depth - a.depth).slice(0, count);
  return worst.flatMap(w => symbols.map(symbol => ({ symbol, fromMs: w.from, toMs: w.to })));
}
