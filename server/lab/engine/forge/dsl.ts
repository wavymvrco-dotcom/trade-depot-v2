// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Forge layer DSL (§11.1). A layer is a small typed program written as a JSON
// tree. Model output is only ever *data* in this language — it is validated
// here and evaluated by our interpreter; nothing it writes is executed
// (invariant 7). Limits: depth ≤ 6, ≤ 40 nodes, windows 2–200, root clamped to
// [−1, 1].

export const LIMITS = { maxDepth: 6, maxNodes: 40, minWindow: 2, maxWindow: 200 } as const;

export type SeriesName = "open" | "high" | "low" | "close" | "typical" | "hour";
export type Node =
  | { op: "series"; name: SeriesName }
  | { op: "const"; v: number }
  | { op: "atr" | "rsi"; n: number }
  | { op: "ema" | "sma" | "highest" | "lowest" | "slope" | "zscore"; n: number; x: Node }
  | { op: "lag"; k: number; x: Node }
  | { op: "htf"; x: Node }
  | { op: "add" | "sub" | "mul" | "div" | "min" | "max" | "gt" | "lt"; a: Node; b: Node }
  | { op: "abs" | "sign" | "tanh" | "neg"; x: Node }
  | { op: "clamp"; x: Node; lo: number; hi: number }
  | { op: "if"; c: Node; a: Node; b: Node };

/**
 * Strict structural parse (hand-written: a recursive zod union re-checks every
 * branch at every level and blows up exponentially on deep trees). Unknown ops,
 * unknown keys, wrong types and out-of-range numbers are all refused.
 */
const KEYS: Record<string, string[]> = {
  series: ["name"], const: ["v"], atr: ["n"], rsi: ["n"],
  ema: ["n", "x"], sma: ["n", "x"], highest: ["n", "x"], lowest: ["n", "x"], slope: ["n", "x"], zscore: ["n", "x"],
  lag: ["k", "x"], htf: ["x"], add: ["a", "b"], sub: ["a", "b"], mul: ["a", "b"], div: ["a", "b"], min: ["a", "b"], max: ["a", "b"],
  gt: ["a", "b"], lt: ["a", "b"], abs: ["x"], sign: ["x"], tanh: ["x"], neg: ["x"], clamp: ["x", "lo", "hi"], if: ["c", "a", "b"],
};
const SERIES_NAMES = ["open", "high", "low", "close", "typical", "hour"];
function parseNode(x: unknown, path: string, budget: { nodes: number }, errors: string[]): Node | null {
  if (--budget.nodes < 0) { errors.push("too many nodes"); return null; }
  if (!x || typeof x !== "object" || Array.isArray(x)) { errors.push(`${path}: not a node`); return null; }
  const o = x as Record<string, unknown>;
  const op = o.op;
  if (typeof op !== "string" || !(op in KEYS)) { errors.push(`${path}: unknown op ${JSON.stringify(op)}`); return null; }
  const allowed = new Set(["op", ...KEYS[op]]);
  for (const k of Object.keys(o)) if (!allowed.has(k)) { errors.push(`${path}: unexpected key "${k}"`); return null; }
  const int = (k: string, lo: number, hi: number) => { const v = o[k]; if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) { errors.push(`${path}.${k}: must be an integer ${lo}–${hi}`); return NaN; } return v; };
  const num = (k: string) => { const v = o[k]; if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1e6) { errors.push(`${path}.${k}: must be a finite number`); return NaN; } return v; };
  const sub = (k: string) => parseNode(o[k], `${path}.${k}`, budget, errors);
  const before = errors.length;
  let n: any;
  switch (op) {
    case "series": if (!SERIES_NAMES.includes(o.name as string)) errors.push(`${path}.name: unknown series`); n = { op, name: o.name }; break;
    case "const": n = { op, v: num("v") }; break;
    case "atr": case "rsi": n = { op, n: int("n", LIMITS.minWindow, LIMITS.maxWindow) }; break;
    case "ema": case "sma": case "highest": case "lowest": case "slope": case "zscore": n = { op, n: int("n", LIMITS.minWindow, LIMITS.maxWindow), x: sub("x") }; break;
    case "lag": n = { op, k: int("k", 1, LIMITS.maxWindow), x: sub("x") }; break;
    case "htf": case "abs": case "sign": case "tanh": case "neg": n = { op, x: sub("x") }; break;
    case "clamp": n = { op, x: sub("x"), lo: num("lo"), hi: num("hi") }; break;
    case "if": n = { op, c: sub("c"), a: sub("a"), b: sub("b") }; break;
    default: n = { op, a: sub("a"), b: sub("b") };
  }
  return errors.length > before ? null : n;
}

export function children(n: Node): Node[] {
  switch (n.op) {
    case "series": case "const": case "atr": case "rsi": return [];
    case "ema": case "sma": case "highest": case "lowest": case "slope": case "zscore": case "lag": case "htf":
    case "abs": case "sign": case "tanh": case "neg": case "clamp": return [n.x];
    case "if": return [n.c, n.a, n.b];
    default: return [(n as any).a, (n as any).b];
  }
}

export const countNodes = (n: Node): number => 1 + children(n).reduce((s, c) => s + countNodes(c), 0);
export const depthOf = (n: Node): number => 1 + Math.max(0, ...children(n).map(depthOf));
const containsHtf = (n: Node): boolean => n.op === "htf" || children(n).some(containsHtf);

/** Validate a candidate layer program. Returns the typed tree or the reasons it was refused. */
export function validateLayer(input: unknown): { ok: true; node: Node } | { ok: false; errors: string[] } {
  const perr: string[] = [];
  const parsed = parseNode(input, "root", { nodes: LIMITS.maxNodes * 4 }, perr);
  if (!parsed) return { ok: false, errors: perr.slice(0, 5) };
  const node = parsed, errors: string[] = [];
  if (node.op !== "clamp" || node.lo !== -1 || node.hi !== 1) errors.push("the root must be clamp(…, −1, 1)");
  if (depthOf(node) > LIMITS.maxDepth) errors.push(`depth ${depthOf(node)} > ${LIMITS.maxDepth}`);
  if (countNodes(node) > LIMITS.maxNodes) errors.push(`${countNodes(node)} nodes > ${LIMITS.maxNodes}`);
  // htf() switches to the higher timeframe once; nesting it is meaningless
  const nested = (n: Node, inside: boolean): boolean => (n.op === "htf" && inside) || children(n).some(c => nested(c, inside || n.op === "htf"));
  if (nested(node, false)) errors.push("htf() cannot be nested");
  return errors.length ? { ok: false, errors } : { ok: true, node };
}

/** Stable text form, for hashing, dedupe and showing a layer to people. */
export function printLayer(n: Node): string {
  switch (n.op) {
    case "series": return n.name;
    case "const": return String(Math.round(n.v * 1e6) / 1e6);
    case "atr": case "rsi": return `${n.op}(${n.n})`;
    case "lag": return `lag(${printLayer(n.x)}, ${n.k})`;
    case "htf": return `htf(${printLayer(n.x)})`;
    case "clamp": return `clamp(${printLayer(n.x)}, ${n.lo}, ${n.hi})`;
    case "if": return `if(${printLayer(n.c)}, ${printLayer(n.a)}, ${printLayer(n.b)})`;
    case "abs": case "sign": case "tanh": case "neg": return `${n.op}(${printLayer(n.x)})`;
    case "ema": case "sma": case "highest": case "lowest": case "slope": case "zscore": return `${n.op}(${printLayer(n.x)}, ${n.n})`;
    default: return `${n.op}(${printLayer((n as any).a)}, ${printLayer((n as any).b)})`;
  }
}

export { containsHtf };

/** The grammar as text, for the AI prompt and the Layer Kit docs. */
export const GRAMMAR = `A layer is a JSON tree. Every node is one of:
  {"op":"series","name":"open|high|low|close|typical|hour"}      price series of the bar (hour = UTC hour of the bar's close)
  {"op":"const","v":number}
  {"op":"atr"|"rsi","n":2..200}                                    Average True Range, RSI(close)
  {"op":"ema"|"sma"|"highest"|"lowest"|"slope"|"zscore","n":2..200,"x":node}   rolling window over x
  {"op":"lag","k":1..200,"x":node}                                 x as it was k bars ago
  {"op":"htf","x":node}                                            evaluate x on the higher timeframe (closed bars only); not nested
  {"op":"add"|"sub"|"mul"|"div"|"min"|"max","a":node,"b":node}     div by ~0 gives 0
  {"op":"gt"|"lt","a":node,"b":node}                               1 if true else 0
  {"op":"abs"|"sign"|"tanh"|"neg","x":node}
  {"op":"clamp","x":node,"lo":number,"hi":number}
  {"op":"if","c":node,"a":node,"b":node}                           a when c > 0 else b
The root must be {"op":"clamp","x":…,"lo":-1,"hi":1}. Max depth 6, max 40 nodes.
Values are read only up to the current bar's close; there is no way to read the future.
Positive output = bullish, negative = bearish, magnitude = conviction.`;
