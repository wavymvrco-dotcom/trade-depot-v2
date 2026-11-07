// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Random layer programs and mutations: used by the fuzz test and as the Forge's
// proposal step when no AI provider is connected. Output is always re-validated.

import type { Rng } from "../rng";
import { children, countNodes, depthOf, LIMITS, validateLayer, type Node, type SeriesName } from "./dsl";

const SERIES: SeriesName[] = ["open", "high", "low", "close", "typical", "hour"];
const WIN = () => 0;

function randWin(r: Rng) { return r.choice([3, 5, 8, 10, 14, 20, 30, 50, 100, 200]); }

export function randomNode(r: Rng, depth: number, allowHtf = true): Node {
  if (depth <= 1 || r.next() < 0.25) {
    const t = r.next();
    if (t < 0.55) return { op: "series", name: r.choice(SERIES.slice(0, 5)) };
    if (t < 0.7) return { op: r.choice(["atr", "rsi"] as const), n: randWin(r) };
    if (t < 0.8) return { op: "series", name: "hour" };
    return { op: "const", v: Math.round(r.uniform(-3, 3) * 100) / 100 };
  }
  const t = r.next();
  if (t < 0.35) return { op: r.choice(["ema", "sma", "highest", "lowest", "slope", "zscore"] as const), n: randWin(r), x: randomNode(r, depth - 1, allowHtf) };
  if (t < 0.45) return { op: "lag", k: r.int(1, 20), x: randomNode(r, depth - 1, allowHtf) };
  if (t < 0.5 && allowHtf) return { op: "htf", x: randomNode(r, depth - 1, false) };
  if (t < 0.8) return { op: r.choice(["add", "sub", "mul", "div", "min", "max", "gt", "lt"] as const), a: randomNode(r, depth - 1, allowHtf), b: randomNode(r, depth - 1, allowHtf) };
  if (t < 0.92) return { op: r.choice(["abs", "sign", "tanh", "neg"] as const), x: randomNode(r, depth - 1, allowHtf) };
  return { op: "if", c: randomNode(r, depth - 1, allowHtf), a: randomNode(r, depth - 1, allowHtf), b: randomNode(r, depth - 1, allowHtf) };
}

/** A random, valid layer: clamp(tanh-ish expression, −1, 1). */
export function randomLayer(r: Rng): Node {
  for (;;) {
    const body = randomNode(r, LIMITS.maxDepth - 1);
    const node: Node = { op: "clamp", x: body, lo: -1, hi: 1 };
    if (countNodes(node) <= LIMITS.maxNodes && depthOf(node) <= LIMITS.maxDepth) return node;
  }
}

/** Replace one random sub-tree, or nudge one window, keeping the clamp root. Always returns a valid layer. */
export function mutateLayer(root: Node, r: Rng): Node {
  for (let attempt = 0; attempt < 25; attempt++) {
    const m = mutateOnce(root, r);
    if (validateLayer(m).ok) return m;
  }
  return root;
}

function mutateOnce(root: Node, r: Rng): Node {
  const clone = JSON.parse(JSON.stringify(root)) as Node;
  const all: { node: any; parent: any; key: string }[] = [];
  const walk = (n: any, parent: any, key: string) => { all.push({ node: n, parent, key }); for (const k of ["x", "a", "b", "c"]) if (n[k]) walk(n[k], n, k); };
  walk((clone as any).x, clone, "x");
  const pick = r.choice(all);
  if (r.next() < 0.4 && (pick.node.n || pick.node.k)) {
    if (pick.node.n) pick.node.n = Math.max(LIMITS.minWindow, Math.min(LIMITS.maxWindow, Math.round(pick.node.n * r.uniform(0.5, 2))));
    else pick.node.k = Math.max(1, Math.min(LIMITS.maxWindow, pick.node.k + r.int(-3, 4)));
  } else {
    pick.parent[pick.key] = randomNode(r, Math.max(1, LIMITS.maxDepth - 2), !insideHtf(clone, pick.node));
  }
  return clone;
}

function insideHtf(root: any, target: any): boolean {
  const find = (n: any, inside: boolean): boolean | null => {
    if (n === target) return inside;
    for (const k of ["x", "a", "b", "c"]) if (n[k]) { const v = find(n[k], inside || n.op === "htf"); if (v != null) return v; }
    return null;
  };
  return !!find(root, false);
}

export { children, WIN };
