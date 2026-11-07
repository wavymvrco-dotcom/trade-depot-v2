// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Forge interpreter. Every operation computes bar i only from bars ≤ i, so a
// layer cannot read the future — the fuzz test perturbs later bars and checks.
// Shared sub-expressions are computed once. NaN during warmup becomes 0
// (neutral); a non-finite value after warmup rejects the layer.

import type { Candle } from "../../../indicators";
import { printLayer, type Node } from "./dsl";

export interface LayerInput {
  p: readonly Candle[];
  barMs: number;
  times: ArrayLike<number>;          // open time (ms) of each primary bar
  h?: readonly Candle[];             // higher-timeframe bars
  hTimes?: ArrayLike<number>;
  htfMs?: number;
  hIdx?: ArrayLike<number>;          // index of the last HTF bar closed by each primary bar's close (−1 if none)
}

type Arr = Float64Array;
const NaNArr = (n: number) => new Float64Array(n).fill(NaN);

function ema(x: Arr, n: number): Arr {
  const out = NaNArr(x.length), k = 2 / (n + 1);
  let prev = NaN;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!Number.isFinite(v)) { out[i] = prev; continue; }
    prev = Number.isFinite(prev) ? prev + k * (v - prev) : v;
    out[i] = prev;
  }
  return out;
}

function rolling(x: Arr, n: number, f: (w: Arr) => number): Arr {
  const out = NaNArr(x.length);
  for (let i = n - 1; i < x.length; i++) {
    const w = x.subarray(i - n + 1, i + 1);
    let ok = true;
    for (let j = 0; j < w.length; j++) if (!Number.isFinite(w[j])) { ok = false; break; }
    if (ok) out[i] = f(w);
  }
  return out;
}

const sum = (w: Arr) => { let s = 0; for (let j = 0; j < w.length; j++) s += w[j]; return s; };
const slopeOf = (w: Arr) => {
  const n = w.length, mx = (n - 1) / 2, my = sum(w) / n;
  let num = 0, den = 0;
  for (let j = 0; j < n; j++) { num += (j - mx) * (w[j] - my); den += (j - mx) ** 2; }
  return den ? num / den : 0;
};
const zOf = (w: Arr) => {
  const n = w.length, m = sum(w) / n;
  let s = 0; for (let j = 0; j < n; j++) s += (w[j] - m) ** 2;
  const sd = Math.sqrt(s / n);
  return sd > 1e-12 ? (w[n - 1] - m) / sd : 0;
};

function atrOf(p: readonly Candle[], n: number): Arr {
  const tr = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) {
    const pc = i ? p[i - 1].close : p[i].close;
    tr[i] = Math.max(p[i].high - p[i].low, Math.abs(p[i].high - pc), Math.abs(p[i].low - pc));
  }
  const out = NaNArr(p.length);
  let a = NaN;
  for (let i = 0; i < p.length; i++) {
    if (i === n - 1) { a = sum(tr.subarray(0, n)) / n; out[i] = a; }
    else if (i >= n) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  }
  return out;
}

function rsiOf(close: Arr, n: number): Arr {
  const out = NaNArr(close.length);
  let g = 0, l = 0;
  for (let i = 1; i < close.length; i++) {
    const d = close[i] - close[i - 1], up = Math.max(0, d), dn = Math.max(0, -d);
    if (i <= n) { g += up / n; l += dn / n; if (i === n) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  }
  return out;
}

function evalNode(n: Node, inp: LayerInput, memo: Map<string, Arr>): Arr {
  const key = printLayer(n);
  const hit = memo.get(key);
  if (hit) return hit;
  const N = inp.p.length;
  const map1 = (x: Arr, f: (v: number) => number) => { const o = new Float64Array(N); for (let i = 0; i < N; i++) o[i] = f(x[i]); return o; };
  const map2 = (a: Arr, b: Arr, f: (x: number, y: number) => number) => { const o = new Float64Array(N); for (let i = 0; i < N; i++) o[i] = (Number.isFinite(a[i]) && Number.isFinite(b[i])) ? f(a[i], b[i]) : NaN; return o; };
  let out: Arr;
  switch (n.op) {
    case "series": {
      const p = inp.p;
      out = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const c = p[i];
        out[i] = n.name === "typical" ? (c.high + c.low + c.close) / 3
          : n.name === "hour" ? new Date(inp.times[i] + inp.barMs).getUTCHours()
          : c[n.name];
      }
      break;
    }
    case "const": out = new Float64Array(N).fill(n.v); break;
    case "atr": out = atrOf(inp.p, n.n); break;
    case "rsi": out = rsiOf(Float64Array.from(inp.p, c => c.close), n.n); break;
    case "ema": out = ema(evalNode(n.x, inp, memo), n.n); break;
    case "sma": out = rolling(evalNode(n.x, inp, memo), n.n, w => sum(w) / w.length); break;
    case "highest": out = rolling(evalNode(n.x, inp, memo), n.n, w => { let m = -Infinity; for (let j = 0; j < w.length; j++) if (w[j] > m) m = w[j]; return m; }); break;
    case "lowest": out = rolling(evalNode(n.x, inp, memo), n.n, w => { let m = Infinity; for (let j = 0; j < w.length; j++) if (w[j] < m) m = w[j]; return m; }); break;
    case "slope": out = rolling(evalNode(n.x, inp, memo), n.n, slopeOf); break;
    case "zscore": out = rolling(evalNode(n.x, inp, memo), n.n, zOf); break;
    case "lag": { const x = evalNode(n.x, inp, memo); out = NaNArr(N); for (let i = n.k; i < N; i++) out[i] = x[i - n.k]; break; }
    case "htf": {
      if (!inp.h || !inp.hTimes || !inp.hIdx || !inp.htfMs) { out = NaNArr(N); break; }
      // Evaluate on the higher timeframe, then read only bars already closed at each primary bar's close
      const H = evalNode(n.x, { p: inp.h, times: inp.hTimes, barMs: inp.htfMs }, new Map());
      out = NaNArr(N);
      for (let i = 0; i < N; i++) { const j = inp.hIdx[i]; if (j >= 0 && j < H.length) out[i] = H[j]; }
      break;
    }
    case "add": out = map2(evalNode(n.a, inp, memo), evalNode(n.b, inp, memo), (x, y) => x + y); break;
    case "sub": out = map2(evalNode(n.a, inp, memo), evalNode(n.b, inp, memo), (x, y) => x - y); break;
    case "mul": out = map2(evalNode(n.a, inp, memo), evalNode(n.b, inp, memo), (x, y) => x * y); break;
    case "div": out = map2(evalNode(n.a, inp, memo), evalNode(n.b, inp, memo), (x, y) => (Math.abs(y) < 1e-12 ? 0 : x / y)); break;
    case "min": out = map2(evalNode(n.a, inp, memo), evalNode(n.b, inp, memo), Math.min); break;
    case "max": out = map2(evalNode(n.a, inp, memo), evalNode(n.b, inp, memo), Math.max); break;
    case "gt": out = map2(evalNode(n.a, inp, memo), evalNode(n.b, inp, memo), (x, y) => (x > y ? 1 : 0)); break;
    case "lt": out = map2(evalNode(n.a, inp, memo), evalNode(n.b, inp, memo), (x, y) => (x < y ? 1 : 0)); break;
    case "abs": out = map1(evalNode(n.x, inp, memo), Math.abs); break;
    case "sign": out = map1(evalNode(n.x, inp, memo), v => (Number.isFinite(v) ? Math.sign(v) : NaN)); break;
    case "tanh": out = map1(evalNode(n.x, inp, memo), Math.tanh); break;
    case "neg": out = map1(evalNode(n.x, inp, memo), v => -v); break;
    case "clamp": out = map1(evalNode(n.x, inp, memo), v => (Number.isFinite(v) ? Math.max(n.lo, Math.min(n.hi, v)) : NaN)); break;
    case "if": {
      const c = evalNode(n.c, inp, memo), a = evalNode(n.a, inp, memo), b = evalNode(n.b, inp, memo);
      out = new Float64Array(N);
      // Like every other op, `if` is warmed up only once all its inputs are (otherwise a branch
      // still warming up would surface later as a non-finite value and wrongly reject the layer)
      for (let i = 0; i < N; i++) out[i] = !Number.isFinite(c[i]) || !Number.isFinite(a[i]) || !Number.isFinite(b[i]) ? NaN : c[i] > 0 ? a[i] : b[i];
      break;
    }
  }
  memo.set(key, out!);
  return out!;
}

export interface LayerValues { values: Float64Array; warmup: number }

/**
 * Evaluate a validated layer over every primary bar. Values before the layer
 * has enough history are 0 (neutral). Throws if any value after warmup is
 * NaN or infinite — such a layer is rejected.
 */
export function evaluateLayer(node: Node, inp: LayerInput): LayerValues {
  const raw = evalNode(node, inp, new Map());
  let warmup = 0;
  while (warmup < raw.length && !Number.isFinite(raw[warmup])) warmup++;
  const values = new Float64Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    if (i < warmup) { values[i] = 0; continue; }
    if (!Number.isFinite(raw[i])) throw new Error(`layer produced a non-finite value at bar ${i}`);
    values[i] = Math.max(-1, Math.min(1, raw[i]));
  }
  return { values, warmup };
}
