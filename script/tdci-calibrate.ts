// Calibrate the TDCI from the command line and print a readable summary.
// Usage: npx tsx script/tdci-calibrate.ts EURUSD 4h
import "../server/env";
import { calibrate } from "../server/tdci-service";

const [symbol = "EURUSD", interval = "4h"] = process.argv.slice(2);

const fmtBuckets = (bs: any[]) => bs.map(b =>
  `    ${String(b.min).padStart(3)}–${String(Math.min(b.max, 100)).padEnd(3)}  ${String(b.trades).padStart(5)} trades  win ${String(b.winRate).padStart(5)}%  avg ${b.avgR >= 0 ? "+" : ""}${b.avgR.toFixed(3)}R  PF ${b.profitFactor}`).join("\n");

calibrate(symbol.toUpperCase(), interval as "1h" | "4h").then(r => {
  console.log(`\nTDCI calibration — ${r.symbol} ${r.interval}`);
  console.log(`Model: stop ${r.model.stopAtr}×ATR, target ${r.model.rr}R, max hold ${r.model.maxHoldBars} bars, spread ${r.model.spreadPips} pips, slippage ${r.model.slippagePips}, commission $${r.model.commissionPerLot}/lot`);
  console.log(`\nLayer predictive power (Spearman IC vs forward return): in-sample | out-of-sample`);
  for (const k of Object.keys(r.ic)) console.log(`  ${k.padEnd(12)} ${(r.ic as any)[k].toFixed(4).padStart(8)} | ${(r.icOutOfSample as any)[k].toFixed(4).padStart(8)}   weight ${(r.weights as any)[k]}`);
  for (const [name, p] of [["IN-SAMPLE", r.inSample], ["OUT-OF-SAMPLE (learned weights)", r.outOfSample], ["OUT-OF-SAMPLE (default weights)", r.outOfSampleDefaultWeights]] as const) {
    console.log(`\n${name}: ${p.from} → ${p.to} (${p.bars} bars)`);
    console.log(fmtBuckets(p.buckets));
    console.log(`    any signal: ${p.anySignal.trades} · avg ${p.anySignal.avgR}R · coin-flip direction avg ${p.randomDirection}R · score→result monotonic ${p.monotonic}`);
    if (p.strategy) console.log(`    strategy (score ≥ ${p.strategy.threshold}, one trade at a time): ${p.strategy.trades} trades, win ${p.strategy.winRate}%, total ${p.strategy.totalR}R, max DD ${p.strategy.maxDrawdownR}R`);
  }
  console.log(`\nRecommended minimum score: ${r.recommendedMin ?? "none"}`);
  console.log(`Verdict: ${r.verdict}\n`);
  process.exit(0);
}).catch(e => { console.error("Calibration failed:", e.message); process.exit(1); });
