// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Shadow Run (§9.9): live ledger, disagreements with the incumbent, progress
// toward graduation, and the License button when every criterion is met.

import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { fmtR, useLabNav, useLicense, useLicenseAction, useLicenses, useShadowTrades, LAYER_LABELS } from "./api";

export function ShadowTab() {
  const lics = useLicenses();
  const { licenseId, go } = useLabNav();
  const inShadow = (lics.data ?? []).filter(l => l.stage === "shadow" || l.stage === "live");
  const id = licenseId && inShadow.some(l => l.id === licenseId) ? licenseId : inShadow[0]?.id ?? null;
  const lic = useLicense(id);
  const trades = useShadowTrades(id);
  const act = useLicenseAction();
  const ev = lic.data?.evidence;
  const eligible = lic.data?.grade === "probation" && ev?.kind === "shadow" && ev.verdict === "graduate";

  if (!lics.isLoading && !inShadow.length) {
    return <div className="flex-1 p-8 text-muted-foreground max-w-2xl">No strategy is in Shadow Run. A strategy that passes the Vault Exam can start one from its report.</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <label className="flex flex-col gap-1.5 text-sm md:w-[480px]">
          <span className="font-medium">Strategy</span>
          <select className="min-h-[44px] rounded-md border border-border bg-card px-3" value={id ?? ""} onChange={e => go("shadow", { license: e.target.value })}>
            {inShadow.map(l => <option key={l.id} value={l.id}>{l.name} · {l.grade} · {l.stage}</option>)}
          </select>
        </label>

        {lic.data && (
          <>
            <header className="flex flex-wrap items-center gap-3">
              <StatusBadge status={lic.data.stage === "live" ? "live" : lic.data.grade === "licensed" ? "licensed" : "shadow"} />
              <span className="font-mono text-sm text-muted-foreground">{lic.data.symbols.join(" · ")} · started {lic.data.shadowStartedAt ? new Date(lic.data.shadowStartedAt).toLocaleDateString() : "—"}</span>
            </header>

            {ev?.kind === "shadow" && (
              <section className="bg-card border border-border rounded-2xl p-5 md:p-7" aria-labelledby="grad">
                <h3 id="grad" className="font-display text-xl m-0 mb-1">Graduation</h3>
                <p className="text-sm text-muted-foreground m-0 mb-4">
                  {ev.trades} closed trades · average {fmtR(ev.meanR, 3)} · {ev.disagreements ?? 0} disagreements with the incumbent in {ev.decisions ?? 0} decisions ·
                  evidence ratio {Number(ev.msprtLambda ?? 1).toFixed(2)} (early decision at 20)
                </p>
                <ul className="m-0 p-0 list-none flex flex-col gap-2">
                  {ev.checks?.map(c => (
                    <li key={c.key} className="flex items-start gap-3 text-sm">
                      <span aria-hidden="true" className={`mt-0.5 w-4 h-4 rounded-full shrink-0 ${c.ok ? "bg-pos" : "bg-rule"}`} />
                      <span className="flex-1">{c.label}</span>
                      <span className="font-mono text-muted-foreground">{c.ok ? "met" : "not yet"} · {c.detail}</span>
                    </li>
                  ))}
                </ul>
                {!!ev.reasons?.length && <p className="text-destructive mt-3 mb-0">{ev.reasons.join(" ")}</p>}
                {eligible && (
                  <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center">
                    <Button className="min-h-[44px]" disabled={act.isPending} onClick={() => act.mutate({ id: lic.data!.id, action: "license" })}>License</Button>
                    <span className="text-sm text-muted-foreground">Every criterion is met. Licensing lets it trade real money once you set it Live.</span>
                  </div>
                )}
              </section>
            )}
            {!ev && <p className="text-muted-foreground m-0">Waiting for the first closed bar. Decisions appear here as they are made.</p>}
            {act.error && <p role="alert" className="text-destructive m-0">{(act.error as Error).message}</p>}

            <section className="bg-card border border-border rounded-2xl p-5 md:p-7" aria-labelledby="ledger">
              <h3 id="ledger" className="font-display text-xl m-0 mb-1">Ledger</h3>
              <p className="text-sm text-muted-foreground m-0 mb-3">Every decision is written when it is made, beside what the incumbent would have done. Simulated (no money).</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      {["Bar", "Pair", "This strategy", "Incumbent", "Result", "Why it took the trade"].map(h => <th key={h} scope="col" className="text-left font-normal py-2 pr-3">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(trades.data ?? []).map(t => {
                      const disagree = (t.side ?? "FLAT") !== t.incumbentAction;
                      return (
                        <tr key={t.id} className={`border-b border-border/60 ${disagree ? "bg-secondary" : ""}`}>
                          <td className="py-2 pr-3 font-mono whitespace-nowrap">{t.signalTime.slice(0, 16)}</td>
                          <td className="pr-3 font-mono">{t.symbol}</td>
                          <td className="pr-3">{t.side ?? "Flat"}{t.score != null && <span className="text-muted-foreground font-mono"> · {t.score}</span>}</td>
                          <td className="pr-3">{t.incumbentAction === "FLAT" ? "Flat" : t.incumbentAction}{disagree && <span className="sr-only"> (disagrees)</span>}</td>
                          <td className={`pr-3 font-mono ${t.r == null ? "" : t.r >= 0 ? "text-pos" : "text-neg"}`}>{t.status === "closed" ? fmtR(t.r, 2) : t.side ? t.status : "—"}</td>
                          <td className="pr-3 text-muted-foreground">{t.attribution?.map(a => `${Math.round(a.share * 100)}% ${LAYER_LABELS[a.key] ?? a.key}`).join(" · ") ?? ""}</td>
                        </tr>
                      );
                    })}
                    {!trades.data?.length && <tr><td colSpan={6} className="py-4 text-muted-foreground">No decisions yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
