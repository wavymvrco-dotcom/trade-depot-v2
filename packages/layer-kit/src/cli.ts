#!/usr/bin/env node
// Copyright © 2026 [OWNER ENTITY]. Layer Kit: see LICENSE in this package.
// layer-kit: write, check and try Trade Depot layers locally.

import { readFileSync, writeFileSync } from "node:fs";
import { GRAMMAR, inputFrom, localReport, readCsv, sampleCsv, validateLayer } from "./kit";

const HELP = `layer-kit — write, check and try Trade Depot layers

  layer-kit grammar                       print the layer language
  layer-kit validate <layer.json>         check a layer against the grammar and limits
  layer-kit run <layer.json> <candles.csv> [--horizon 10] [--htf 4]
                                          evaluate it, fuzz for look-ahead, and a local predictive check
  layer-kit sample [out.csv] [--bars 2000] [--seed 1]
                                          write synthetic candles to try things on

The CSV needs a header with time, open, high, low, close.
A local result is not acceptance: on Trade Depot a layer is tested on the
platform's own training data, against a bar that rises with every layer tried.
Submit a layer in the app: Lab → Forge → "Submit your own layer".`;

const args = process.argv.slice(2);
const flag = (name: string, d: number) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : d; };
const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));

function load(file: string) {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch (e: any) { fail(`Can't read ${file}: ${e.message}`); }
  const v = validateLayer((raw as any)?.layer ?? raw);
  if (!v.ok) fail(`Not a valid layer:\n  - ${v.errors.join("\n  - ")}`);
  return v.node;
}
function fail(msg: string): never { console.error(msg); process.exit(1); }

const [cmd] = pos;
if (!cmd || cmd === "help" || args.includes("--help")) console.log(HELP);
else if (cmd === "grammar") console.log(GRAMMAR);
else if (cmd === "validate") {
  if (!pos[1]) fail("Usage: layer-kit validate <layer.json>");
  load(pos[1]); console.log("valid");
}
else if (cmd === "run") {
  if (!pos[1] || !pos[2]) fail("Usage: layer-kit run <layer.json> <candles.csv>");
  const node = load(pos[1]);
  const { candles, times } = readCsv(readFileSync(pos[2], "utf8"));
  const r = localReport(node, inputFrom(candles, times, flag("htf", 4)), flag("horizon", 10));
  console.log(`layer     ${r.printed}`);
  console.log(`size      ${r.nodes} nodes, depth ${r.depth}`);
  console.log(`bars      ${r.rows} (first ${r.warmup} are warmup and read as 0)`);
  console.log(`values    mean ${r.mean.toFixed(3)}, spread ${r.std.toFixed(3)}, non-zero ${(r.nonZero * 100).toFixed(0)}%, last ${r.last.map(v => v.toFixed(3)).join(" ")}`);
  console.log(`future    ${r.lookaheadSafe ? "safe: changing later bars never changed an earlier value" : "UNSAFE: an earlier value changed when later bars changed"}`);
  console.log(`local IC  ${r.ic.toFixed(3)} vs the next ${r.horizon} bars, t ≈ ${r.t.toFixed(2)} (unofficial; costs, the rising bar and novelty are judged on the platform)`);
  if (!r.lookaheadSafe) process.exit(2);
}
else if (cmd === "sample") {
  const csv = sampleCsv(flag("bars", 2000), flag("seed", 1));
  if (pos[1]) { writeFileSync(pos[1], csv); console.log(`wrote ${pos[1]}`); } else process.stdout.write(csv);
}
else fail(`Unknown command "${cmd}".\n\n${HELP}`);
