// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Reproduces the two Phase 1 demos in docs/DEMOS.md:  npx tsx script/lab-demos.ts
import { runLab } from "../server/lab/engine/lab";
import { syntheticEnv, spec, defaults } from "../tests/lab-helpers";

const PAIRS = ["EURUSD", "GBPUSD", "AUDUSD"];
function demo(name: string, planted: number | null, seeds: number[]) {
  console.log(`\n## ${name}\n`);
  console.log("| Seed | Grade | Reasons | Trials | Planted-layer weight (largest?) | Vault trades | Vault R | 2× cost R | Default TDCI R | Luck-adjusted confidence |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const seed of seeds) {
    const envData = PAIRS.map((s, k) => syntheticEnv({ seed: seed * 100 + k, planted, symbol: s }));
    const r = runLab({ envData, spec: spec(PAIRS), seed, population: 128, generations: 40, episodes: 8, ...defaults() });
    const w = r.champion?.genome.w ?? [];
    const absMax = w.length ? w.map(Math.abs).indexOf(Math.max(...w.map(Math.abs))) : -1;
    const pw = planted == null ? "—" : w.length ? `${w[planted].toFixed(2)} (${absMax === planted ? "yes" : "no"})` : "no champion";
    const v = r.vault;
    console.log(`| ${seed} | ${r.grade} | ${r.failureReasons.join(", ") || "—"} | ${r.trials} | ${pw} | ${v?.base.trades ?? "—"} | ${v?.base.totalR ?? "—"} | ${v?.doubleCost.totalR ?? "—"} | ${v?.baseline.totalR ?? "—"} | ${v ? Math.round(v.luck.dsr * 100) + "%" : "—"} |`);
  }
}
demo("Planted signal (layer 2 drives returns; 3 pairs)", 2, [1, 2, 3, 4, 5]);
demo("Pure random walk (no layer has any signal; 3 pairs)", null, [1, 2, 3, 4, 5]);
