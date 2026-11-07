// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { acceptAiSpec, blueprintSpecSchema, propRulesSchema, BLUEPRINT_JSON_SCHEMA } from "../shared/lab-schemas";

const good = { version: 1, style: "swing", symbols: ["EURUSD"], objective: { totalR: 1, drawdownPenalty: 0.5, consistencyPenalty: 0.5 }, constraints: { noWeekendHolding: true }, risk: { riskPercentPerTrade: 0.5, maxOpenPositions: 2 } };

test("a valid answer is accepted with its notes", () => {
  const a = acceptAiSpec({ spec: good, notes: ["Wants to avoid Fridays — not expressible", 42] });
  assert.ok(a.ok);
  if (a.ok) { assert.equal(a.spec.style, "swing"); assert.deepEqual(a.notes, ["Wants to avoid Fridays — not expressible"]); }
});

test("invented fields, code, wrong types and non-JSON are all rejected — never passed through", () => {
  const bad: unknown[] = [
    null, "here is your strategy", { notes: [] },
    { spec: { ...good, entryRule: "close > sma(20)" } },                           // invented field
    { spec: { ...good, constraints: { ...good.constraints, script: "process.exit()" } } },
    { spec: { ...good, symbols: ["DOGEUSD"] } },                                    // not an allowed symbol
    { spec: { ...good, risk: { riskPercentPerTrade: 50, maxOpenPositions: 2 } } },  // out of range
    { spec: { ...good, style: "yolo" } },
    { spec: { ...good, version: 2 } },
    { spec: { ...good, prop: { firmLabel: "x" } } },                                 // incomplete prop rules
  ];
  for (const b of bad) assert.equal(acceptAiSpec(b).ok, false, JSON.stringify(b)?.slice(0, 80));
});

test("the JSON Schema given to the model lists exactly the zod schema's fields", () => {
  const zKeys = (s: any): string[] => Object.keys(s.shape ?? s._def?.schema?.shape ?? {});
  const unwrap = (s: any) => (s?._def?.innerType ?? s);
  assert.deepEqual(Object.keys(BLUEPRINT_JSON_SCHEMA.properties).sort(), zKeys(blueprintSpecSchema).sort());
  for (const k of ["objective", "constraints", "risk"] as const) {
    assert.deepEqual(Object.keys((BLUEPRINT_JSON_SCHEMA.properties as any)[k].properties).sort(), zKeys(unwrap((blueprintSpecSchema as any).shape[k])).sort(), k);
  }
  assert.deepEqual(Object.keys(BLUEPRINT_JSON_SCHEMA.properties.prop.properties).sort(), zKeys(propRulesSchema).sort());
});

test("no Lab or AI code executes model output (no eval, new Function, or vm)", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".ts")) files.push(p); } };
  walk(join(process.cwd(), "server"));
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/\beval\s*\(|new\s+Function\s*\(|from\s+"(node:)?vm"/.test(src), `${f} executes dynamic code`);
  }
});
