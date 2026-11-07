// Copies the Forge grammar and interpreter into packages/layer-kit so the kit
// runs exactly the code the platform runs. `--check` fails if the copies are stale.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const SRC = path.join(root, "server/lab/engine/forge"), DST = path.join(root, "packages/layer-kit/src");
const NOTE = "// GENERATED from server/lab/engine/forge by scripts/sync-layer-kit.cjs — do not edit here.\n";
function transform(file) {
  let s = fs.readFileSync(path.join(SRC, file), "utf8");
  s = s.replace(/^\/\/ Copyright .*\n/, "// Copyright © 2026 [OWNER ENTITY]. Layer Kit: see LICENSE in this package.\n" + NOTE);
  s = s.replace(`import type { Candle } from "../../../indicators";`, `import type { Candle } from "./types";`);
  return s;
}
const check = process.argv.includes("--check");
let stale = [];
for (const f of ["dsl.ts", "interp.ts"]) {
  const want = transform(f), at = path.join(DST, f);
  const have = fs.existsSync(at) ? fs.readFileSync(at, "utf8") : null;
  if (have !== want) { if (check) stale.push(f); else fs.writeFileSync(at, want); }
}
if (check && stale.length) { console.error("layer-kit is out of date: " + stale.join(", ") + " (run node scripts/sync-layer-kit.cjs)"); process.exit(1); }
console.log(check ? "layer-kit is up to date" : "layer-kit synced");
