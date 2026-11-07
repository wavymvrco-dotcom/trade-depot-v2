// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// A small dense two-phase simplex solver (Bland's rule, so it cannot cycle).
// minimize c·x  subject to  rows (a·x ≤ / = / ≥ b),  x ≥ 0.
// Sized for Fleet: a few strategies × a few hundred days.

export interface LpRow { a: number[]; op: "<=" | "=" | ">="; b: number }
export type LpResult = { status: "optimal"; x: number[]; value: number } | { status: "infeasible" | "unbounded" };

const EPS = 1e-9;

export function solveLp(c: number[], rows: LpRow[]): LpResult {
  const n = c.length;
  // Normalize so every b ≥ 0
  const R = rows.map(r => (r.b < 0 ? { a: r.a.map(v => -v), op: (r.op === "<=" ? ">=" : r.op === ">=" ? "<=" : "=") as LpRow["op"], b: -r.b } : r));
  const m = R.length;
  const slackCount = R.filter(r => r.op !== "=").length;
  const artCount = R.filter(r => r.op !== "<=").length;
  const cols = n + slackCount + artCount;
  // Tableau: m constraint rows + objective row; last column = RHS
  const T: number[][] = Array.from({ length: m + 1 }, () => new Array(cols + 1).fill(0));
  const basis: number[] = new Array(m);
  let s = n, a = n + slackCount;
  const artificial: number[] = [];
  R.forEach((r, i) => {
    for (let j = 0; j < n; j++) T[i][j] = r.a[j] ?? 0;
    T[i][cols] = r.b;
    if (r.op === "<=") { T[i][s] = 1; basis[i] = s++; }
    else if (r.op === ">=") { T[i][s++] = -1; T[i][a] = 1; artificial.push(a); basis[i] = a++; }
    else { T[i][a] = 1; artificial.push(a); basis[i] = a++; }
  });

  const pivot = (pr: number, pc: number) => {
    const pv = T[pr][pc];
    for (let j = 0; j <= cols; j++) T[pr][j] /= pv;
    for (let i = 0; i <= m; i++) {
      if (i === pr) continue;
      const f = T[i][pc];
      if (Math.abs(f) > EPS) for (let j = 0; j <= cols; j++) T[i][j] -= f * T[pr][j];
    }
    basis[pr] = pc;
  };

  const run = (allowed: (j: number) => boolean): "optimal" | "unbounded" => {
    for (let iter = 0; iter < 50_000; iter++) {
      let pc = -1;
      for (let j = 0; j < cols; j++) if (allowed(j) && T[m][j] < -EPS) { pc = j; break; } // Bland: first improving column
      if (pc < 0) return "optimal";
      let pr = -1, best = Infinity;
      for (let i = 0; i < m; i++) {
        if (T[i][pc] > EPS) {
          const ratio = T[i][cols] / T[i][pc];
          if (ratio < best - EPS || (Math.abs(ratio - best) <= EPS && basis[i] < basis[pr])) { best = ratio; pr = i; }
        }
      }
      if (pr < 0) return "unbounded";
      pivot(pr, pc);
    }
    return "optimal";
  };

  const isArt = new Set(artificial);
  // Phase 1: minimize the sum of artificials
  if (artificial.length) {
    T[m].fill(0);
    for (const j of artificial) T[m][j] = 1;
    for (let i = 0; i < m; i++) if (isArt.has(basis[i])) for (let j = 0; j <= cols; j++) T[m][j] -= T[i][j];
    run(() => true);
    if (-T[m][cols] > 1e-7) return { status: "infeasible" };
    // Drive any artificial still in the basis (at zero) out
    for (let i = 0; i < m; i++) if (isArt.has(basis[i])) {
      const j = Array.from({ length: n + slackCount }, (_, k) => k).find(k => Math.abs(T[i][k]) > EPS);
      if (j != null) pivot(i, j);
    }
  }
  // Phase 2: the real objective, artificials excluded
  T[m].fill(0);
  for (let j = 0; j < n; j++) T[m][j] = c[j];
  for (let i = 0; i < m; i++) { const cb = basis[i] < n ? c[basis[i]] : 0; if (cb) for (let j = 0; j <= cols; j++) T[m][j] -= cb * T[i][j]; }
  if (run(j => !isArt.has(j)) === "unbounded") return { status: "unbounded" };
  const x = new Array(n).fill(0);
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][cols];
  return { status: "optimal", x, value: c.reduce((s, ci, j) => s + ci * x[j], 0) };
}
