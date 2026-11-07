// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Report card (§9.8, §9.11). Always shows: trials tried, vault result, 2× cost
// result, luck-adjusted confidence and the comparison with default TDCI.
// Results are simulated until Live.

import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { RunPicker } from "./ArenaTab";
import { EquityLine } from "./EquityLine";
import { fmtR, useLabMe, useLabNav, useLicenseAction, useRun, useRuns, BELTS, LAYER_LABELS, RR_GRID, STOP_GRID, useLicense } from "./api";

function VaultBar({ s }: { s: { trainFrom: string; trainTo: string; validationFrom: string; validationTo: string; vaultFrom: string; vaultTo: string } }) {
  const parts = [
    { label: "Train", from: s.trainFrom, to: s.trainTo, w: 60, style: { background: "var(--rj-surface-soft)" } },
    { label: "Validation", from: s.validationFrom, to: s.validationTo, w: 20, style: { background: "var(--rj-arena-bg)" } },
    { label: "Locked (Vault)", from: s.vaultFrom, to: s.vaultTo, w: 20, style: { background: "var(--rj-film)", color: "var(--rj-film-text)" } },
  ];
  return (
    <figure className="m-0">
      <div className="flex rounded-lg overflow-hidden border border-border text-xs" role="img" aria-label="Data split: 60% training, 20% validation, 20% locked vault, oldest to newest">
        {parts.map(p => (
          <div key={p.label} style={{ width: `${p.w}%`, ...p.style }} className="px-2 py-2 min-w-0">
            <div className="font-semibold truncate">{p.label}</div>
            <div className="font-mono truncate opacity-80">{p.from.slice(0, 10)} → {p.to.slice(0, 10)}</div>
          </div>
        ))}
      </div>
      <figcaption className="font-display italic text-sm text-muted-foreground mt-2">Fig. 1 — The locked segment was opened once, for this exam only.</figcaption>
    </figure>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-secondary rounded-xl p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 mt-1 font-mono text-xl">{value}</dd>
      {sub && <dd className="m-0 text-xs text-muted-foreground mt-1">{sub}</dd>}
    </div>
  );
}

export function ReportTab() {
  const runs = useRuns();
  const { runId, go } = useLabNav();
  const id = runId ?? runs.data?.find(r => r.status === "done")?.id ?? null;
  const run = useRun(id);
  const me = useLabMe();
  const lic = useLicense(run.data?.licenseId ?? null);
  const act = useLicenseAction();
  const r = run.data?.result;
  const v = r?.vault;
  const firstSplit = r ? Object.values(r.splits)[0] : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <div className="md:w-[560px]"><RunPicker runs={runs.data?.filter(x => x.status === "done" || x.status === "cancelled")} value={id} onChange={x => go("report", { run: x })} /></div>
        {!r && <p className="text-muted-foreground">{run.data ? "This run has no report yet." : "Finished runs appear here."}</p>}

        {r && (
          <>
            <header className="flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge status={r.grade === "probation" ? "probation" : r.grade === "licensed" ? "licensed" : "scrapped"} label={r.grade === "probation" ? "Passed · Probation" : "Scrapped"} />
                <span className="text-xs font-mono text-muted-foreground">SIMULATED · {r.trials} versions checked on validation · seed {r.config.seed}</span>
              </div>
              <h2 className="text-2xl md:text-3xl m-0">
                {r.grade === "probation" ? "It passed the Vault Exam. Next: a Shadow Run on live prices." : r.cancelled ? "This run was stopped before the exam." : "It did not pass. That is a real answer."}
              </h2>
              {r.failureReasons.length > 0 && (
                <ul className="m-0 pl-5 text-ink-2 space-y-1">
                  {r.failureReasons.map(k => <li key={k}>{me.data?.failureText[k] ?? k}</li>)}
                </ul>
              )}
            </header>

            {firstSplit && <VaultBar s={firstSplit} />}

            {v && (
              <section aria-labelledby="rc-title" className="bg-card border border-border rounded-2xl p-5 md:p-7 flex flex-col gap-5">
                <h3 id="rc-title" className="font-display text-xl m-0">Report card</h3>
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 m-0">
                  <Stat label="Vault result" value={fmtR(v.base.totalR)} sub={`${v.base.trades} trades · PF ${v.base.profitFactor} · max DD ${v.base.maxDD}R`} />
                  <Stat label="At 2× costs" value={fmtR(v.doubleCost.totalR)} sub={`PF ${v.doubleCost.profitFactor}`} />
                  <Stat label="Luck-adjusted confidence" value={`${Math.round(v.luck.dsr * 100)}%`} sub={`Deflated Sharpe over ${v.luck.trials} trials · needs 95%`} />
                  <Stat label="Default TDCI, same vault" value={fmtR(v.baseline.totalR)} sub={v.base.totalR > v.baseline.totalR ? "Beaten" : "Not beaten"} />
                </dl>
                <div>
                  <p className="text-sm font-medium m-0 mb-2">Vault equity (R)</p>
                  <EquityLine values={v.base.equity} label="Vault equity in R" />
                </div>
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 m-0 text-sm">
                  <Stat label="Win rate" value={`${Math.round(v.base.winRate * 100)}%`} />
                  <Stat label="Avg R per trade" value={fmtR(v.base.avgR, 3)} sub={`90% range ${fmtR(v.envelope.meanP05, 2)} to ${fmtR(v.envelope.meanP95, 2)}`} />
                  <Stat label="Drawdown to expect" value={`${v.envelope.ddP95.toFixed(1)}R`} sub={`95th percentile · 99th: ${v.envelope.ddP99.toFixed(1)}R`} />
                  <Stat label="Belt" value={r.champion ? BELTS[r.champion.belt] ?? "—" : "—"} />
                </dl>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="text-left text-sm font-medium mb-2">By pair (vault)</caption>
                    <thead><tr className="text-xs text-muted-foreground border-b border-border"><th scope="col" className="text-left font-normal py-2">Pair</th><th scope="col" className="text-right font-normal">Trades</th><th scope="col" className="text-right font-normal">Total</th><th scope="col" className="text-right font-normal">PF</th><th scope="col" className="text-right font-normal">Max DD</th></tr></thead>
                    <tbody className="font-mono">
                      {v.perPair.map(p => (
                        <tr key={p.symbol} className="border-b border-border/60">
                          <th scope="row" className="text-left py-2 font-semibold">{p.symbol}</th>
                          <td className="text-right">{p.trades}</td>
                          <td className={`text-right ${p.totalR >= 0 ? "text-pos" : "text-neg"}`}>{fmtR(p.totalR)}</td>
                          <td className="text-right">{p.profitFactor}</td>
                          <td className="text-right">{p.maxDD}R</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {r.champion && (
              <section className="bg-card border border-border rounded-2xl p-5 md:p-7" aria-labelledby="dna">
                <h3 id="dna" className="font-display text-xl m-0 mb-3">What it learned</h3>
                <p className="text-sm text-muted-foreground m-0 mb-3">
                  Enters when its TDCI score reaches <span className="font-mono">{r.champion.genome.threshold}</span>, stop <span className="font-mono">{STOP_GRID[r.champion.genome.stopIdx]} ATR</span>, target <span className="font-mono">{RR_GRID[r.champion.genome.rrIdx]}R</span>. Layer weights (negative = trades against that layer):
                </p>
                <ul className="m-0 p-0 list-none grid sm:grid-cols-2 gap-2">
                  {(lic.data?.layers ?? []).map((k, j) => {
                    const w = r.champion!.genome.w[j];
                    return (
                      <li key={k} className="flex items-center gap-3 text-sm">
                        <span className="w-40 truncate">{LAYER_LABELS[k] ?? k}</span>
                        <span className="flex-1 h-2 bg-secondary rounded-full relative overflow-hidden" aria-hidden="true">
                          <span className="absolute top-0 bottom-0" style={{ left: w >= 0 ? "50%" : `${50 + w * 50}%`, width: `${Math.abs(w) * 50}%`, background: w >= 0 ? "var(--rj-pos)" : "var(--rj-neg)" }} />
                        </span>
                        <span className="font-mono w-14 text-right">{w.toFixed(2)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {lic.data && lic.data.grade === "probation" && lic.data.stage === "vault" && (
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <Button className="min-h-[44px]" disabled={act.isPending} onClick={() => act.mutate({ id: lic.data!.id, action: "shadow" }, { onSuccess: () => go("shadow", { license: lic.data!.id }) })}>Start Shadow Run</Button>
                <span className="text-sm text-muted-foreground">It trades on live prices without money for at least 14–30 days, beside your current strategy.</span>
              </div>
            )}
            {act.error && <p role="alert" className="text-destructive m-0">{(act.error as Error).message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
