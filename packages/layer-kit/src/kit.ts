// Copyright © 2026 [OWNER ENTITY]. Layer Kit: see LICENSE in this package.
// Everything the CLI does, as plain functions: read candles, build the higher
// timeframe, evaluate a layer, check it can't see the future, and a local
// (unofficial) predictive check. Acceptance itself only happens on the platform.

import { validateLayer, printLayer, countNodes, depthOf, GRAMMAR, LIMITS, type Node } from "./dsl";
import { evaluateLayer, type LayerInput } from "./interp";
import type { Candle } from "./types";

export { validateLayer, printLayer, GRAMMAR, LIMITS, evaluateLayer, type Node, type LayerInput, type Candle };

function parseTime(s: string): number {
  const t = s.trim();
  if (/^\d{12,}$/.test(t)) return Number(t);            // unix ms
  if (/^\d{9,11}$/.test(t)) return Number(t) * 1000;     // unix seconds
  const iso = t.length <= 10 ? `${t}T00:00:00Z` : /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t.replace(" ", "T") : `${t.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`Unreadable time "${s}"`);
  return ms;
}

/** CSV with a header containing time, open, high, low, close (any order, any case). */
export function readCsv(text: string): { candles: Candle[]; times: number[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const head = lines[0].split(",").map(h => h.trim().toLowerCase());
  const col = (n: string) => { const i = head.indexOf(n); if (i < 0) throw new Error(`CSV needs a "${n}" column`); return i; };
  const [ti, oi, hi, li, ci] = ["time", "open", "high", "low", "close"].map(col);
  const candles: Candle[] = [], times: number[] = [];
  for (const l of lines.slice(1)) {
    const f = l.split(",");
    const c = { time: f[ti].trim(), open: +f[oi], high: +f[hi], low: +f[li], close: +f[ci] };
    if (![c.open, c.high, c.low, c.close].every(Number.isFinite)) continue;
    candles.push(c); times.push(parseTime(c.time));
  }
  if (candles.length < 50) throw new Error("Need at least 50 candles");
  return { candles, times };
}

/** Primary input plus a higher timeframe made of `factor` primary bars (only closed HTF bars are visible). */
export function inputFrom(candles: Candle[], times: number[], factor = 4): LayerInput {
  const d = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  const barMs = d[Math.floor(d.length / 2)];
  const h: Candle[] = [], hTimes: number[] = [];
  for (let j = 0; (j + 1) * factor <= candles.length; j++) {
    const s = candles.slice(j * factor, (j + 1) * factor);
    h.push({ time: s[0].time, open: s[0].open, high: Math.max(...s.map(c => c.high)), low: Math.min(...s.map(c => c.low)), close: s[s.length - 1].close });
    hTimes.push(times[j * factor]);
  }
  const hIdx = candles.map((_, i) => Math.floor((i + 1) / factor) - 1);
  return { p: candles, times, barMs, h, hTimes, htfMs: barMs * factor, hIdx };
}

function ranks(x: number[]) {
  const o = x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(x.length);
  for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; }
  return r;
}
function pearson(a: number[], b: number[]) {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

export interface LocalReport {
  printed: string; nodes: number; depth: number; warmup: number; rows: number;
  mean: number; std: number; nonZero: number; last: number[];
  ic: number; t: number; horizon: number; lookaheadSafe: boolean;
}

/** Evaluate a layer on local candles and report what it does. Not an acceptance decision. */
export function localReport(node: Node, inp: LayerInput, horizon = 10, seed = 7): LocalReport {
  const { values, warmup } = evaluateLayer(node, inp);
  const N = values.length, closes = inp.p.map(c => c.close);
  const xs: number[] = [], ys: number[] = [];
  for (let i = warmup; i + horizon < N; i++) { xs.push(values[i]); ys.push(Math.log(closes[i + horizon] / closes[i])); }
  const ic = xs.length > 10 ? pearson(ranks(xs), ranks(ys)) : 0;
  // Non-overlapping effective sample: forward windows overlap, so divide by the horizon
  const nEff = Math.max(3, Math.floor(xs.length / horizon));
  const t = ic * Math.sqrt((nEff - 2) / Math.max(1e-12, 1 - ic * ic));
  const live = Array.from(values.slice(warmup));
  const mean = live.reduce((s, v) => s + v, 0) / Math.max(1, live.length);
  const std = Math.sqrt(live.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, live.length));
  return {
    printed: printLayer(node), nodes: countNodes(node), depth: depthOf(node), warmup, rows: N, mean, std,
    nonZero: live.filter(v => v !== 0).length / Math.max(1, live.length), last: Array.from(values.slice(-5)),
    ic, t, horizon, lookaheadSafe: lookaheadFuzz(node, inp, seed),
  };
}

/** Change every bar after a cut point and check no value up to the cut moves. */
export function lookaheadFuzz(node: Node, inp: LayerInput, seed = 7, rounds = 6): boolean {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const base = evaluateLayer(node, inp).values;
  const N = inp.p.length;
  for (let r = 0; r < rounds; r++) {
    const cut = Math.floor(N * (0.3 + 0.6 * rnd()));
    const p = inp.p.map((c, i) => (i <= cut ? c : { ...c, open: c.open * (1 + (rnd() - 0.5) * 0.2), high: c.high * 1.1, low: c.low * 0.9, close: c.close * (1 + (rnd() - 0.5) * 0.2) }));
    const factor = Math.round((inp.htfMs ?? inp.barMs * 4) / inp.barMs);
    const v = evaluateLayer(node, inputFrom(p as Candle[], Array.from(inp.times), factor)).values;
    for (let i = 0; i <= cut; i++) if (!(Object.is(v[i], base[i]) || Math.abs(v[i] - base[i]) < 1e-12)) return false;
  }
  return true;
}

/** Synthetic candles (a random walk with slow-changing volatility) for trying the kit without market data. */
export function sampleCsv(n = 2000, seed = 1, start = Date.UTC(2025, 0, 6), barMs = 3_600_000): string {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rnd()))) * Math.cos(2 * Math.PI * rnd());
  let px = 1.1, vol = 0.001;
  const rows = ["time,open,high,low,close"];
  for (let i = 0; i < n; i++) {
    vol = Math.max(0.0003, Math.min(0.004, vol * Math.exp(0.05 * gauss())));
    const o = px, c = o * Math.exp(vol * gauss());
    const hi = Math.max(o, c) * (1 + Math.abs(gauss()) * vol * 0.5), lo = Math.min(o, c) * (1 - Math.abs(gauss()) * vol * 0.5);
    rows.push(`${new Date(start + i * barMs).toISOString().replace("T", " ").slice(0, 19)},${o.toFixed(5)},${hi.toFixed(5)},${lo.toFixed(5)},${c.toFixed(5)}`);
    px = c;
  }
  return rows.join("\n") + "\n";
}
