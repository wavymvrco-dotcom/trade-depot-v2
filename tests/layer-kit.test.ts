// Layer Kit (§11.6): the kit runs the platform's own grammar and interpreter, and its checks work.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inputFrom, localReport, lookaheadFuzz, readCsv, sampleCsv, validateLayer } from "../packages/layer-kit/src/kit";
import { evaluateLayer as platformEval } from "../server/lab/engine/forge/interp";

const root = process.cwd();

test("the kit's grammar and interpreter are in sync with the platform", () => {
  execFileSync(process.execPath, [join(root, "scripts/sync-layer-kit.cjs"), "--check"], { stdio: "pipe" });
});

test("every example is valid, look-ahead safe, and evaluates exactly as on the platform", () => {
  const { candles, times } = readCsv(sampleCsv(1500, 3));
  const inp = inputFrom(candles, times, 4);
  const dir = join(root, "packages/layer-kit/examples");
  for (const f of readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const v = validateLayer(JSON.parse(readFileSync(join(dir, f), "utf8")));
    assert.ok(v.ok, f);
    if (!v.ok) continue;
    const r = localReport(v.node, inp);
    assert.equal(r.lookaheadSafe, true, f);
    assert.ok(r.nonZero > 0.3, `${f} mostly zero`);
    assert.deepEqual(Array.from(platformEval(v.node, inp).values), Array.from(evaluateLayerKit(v.node, inp)), f);
  }
});

test("the higher timeframe only exposes HTF bars that have closed", () => {
  const { candles, times } = readCsv(sampleCsv(400, 5));
  const inp = inputFrom(candles, times, 4);
  // Primary bar i closes HTF bar floor((i+1)/4)-1; that HTF bar's last primary bar is never after i
  for (let i = 0; i < candles.length; i++) { const j = inp.hIdx![i]; if (j >= 0) assert.ok((j + 1) * 4 - 1 <= i); }
  const v = validateLayer({ op: "clamp", lo: -1, hi: 1, x: { op: "htf", x: { op: "zscore", n: 10, x: { op: "series", name: "close" } } } });
  assert.ok(v.ok); if (v.ok) assert.equal(lookaheadFuzz(v.node, inp), true);
});

test("refuses invalid layers with reasons", () => {
  const v = validateLayer({ op: "clamp", lo: -1, hi: 1, x: { op: "ema", n: 1000, x: { op: "series", name: "close" } } });
  assert.equal(v.ok, false);
  const w = validateLayer({ op: "eval", code: "process.exit()" });
  assert.equal(w.ok, false);
});

import { evaluateLayer as kitEval } from "../packages/layer-kit/src/interp";
function evaluateLayerKit(n: Parameters<typeof kitEval>[0], inp: Parameters<typeof kitEval>[1]) { return kitEval(n, inp).values; }
