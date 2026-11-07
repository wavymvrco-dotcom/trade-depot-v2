// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Every strategy with its grade and stage, its full history (including
// Tripwire), and the actions allowed from where it is.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { StatusBadge, type Status } from "./StatusBadge";
import { fmtR, useLabMe, useLabNav, useLicense, useLicenseAction, useLicenses, type License } from "./api";

const statusOf = (l: License): Status =>
  l.stage === "retired" ? "arena" : l.stage === "live" ? "live" : l.grade === "licensed" ? "licensed" : l.grade === "scrapped" ? "scrapped" : l.stage === "shadow" ? "shadow" : "probation";
const labelOf = (l: License) => (l.stage === "retired" ? "Retired" : undefined);

type Action = "live" | "pause" | "retire" | "close-all" | "shadow";
const CONFIRM: Record<Action, { title: string; body: string; cta: string }> = {
  live: { title: "Set this strategy Live?", body: "It will place real orders on your connected broker account, inside your risk limits and the normal trade guard. Simulated and historical results do not guarantee future performance.", cta: "Go Live" },
  pause: { title: "Pause live trading?", body: "It stops placing real orders and returns to Shadow Run. Open positions stay open.", cta: "Pause" },
  retire: { title: "Retire this strategy?", body: "It stops trading and tracking. Its record is kept. This cannot be undone.", cta: "Retire" },
  "close-all": { title: "Close every position this strategy opened?", body: "Each open position it opened is closed at the current price.", cta: "Close all" },
  shadow: { title: "Start a Shadow Run?", body: "It trades on live prices without money, beside your current strategy.", cta: "Start" },
};

export function LicensesTab() {
  const lics = useLicenses();
  const me = useLabMe();
  const { licenseId, go } = useLabNav();
  const [open, setOpen] = useState<string | null>(licenseId);
  const detail = useLicense(open);
  const act = useLicenseAction();
  const [confirm, setConfirm] = useState<{ id: string; action: Action } | null>(null);

  if (!lics.isLoading && !lics.data?.length) return <div className="flex-1 p-8 text-muted-foreground">No strategies yet. Every examined champion appears here, passed or not.</div>;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground m-0">Plan: <span className="font-medium text-foreground">{me.data?.tier === "pro" ? "Pro" : "Free"}</span>{me.data?.tier !== "pro" && " — Shadow Run and Live trading are part of Pro."}</p>
        <ul className="m-0 p-0 list-none flex flex-col gap-3">
          {lics.data?.map(l => {
            const v = l.vault;
            const isOpen = open === l.id;
            return (
              <li key={l.id} className="bg-card border border-border rounded-xl">
                <button type="button" className="w-full text-left p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-2 md:gap-6 min-h-[44px]" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.id)}>
                  <span className="font-semibold flex-1">{l.name}</span>
                  <StatusBadge status={statusOf(l)} label={labelOf(l)} />
                  <span className="font-mono text-sm text-muted-foreground">{l.style} · {l.symbols.join(" ")}</span>
                  <span className="font-mono text-sm">Vault {fmtR(v?.base.totalR)}</span>
                </button>
                {isOpen && detail.data?.id === l.id && (
                  <div className="border-t border-border p-4 md:p-5 flex flex-col gap-4">
                    {l.evidence?.kind === "live" && (
                      <p className="text-sm m-0">Live: {l.evidence.trades} closed trades · Tripwire statistic {Number(l.evidence.cusum ?? 0).toFixed(2)} (trips at 6) · drawdown {Number(l.evidence.maxDD ?? 0).toFixed(1)}R (limit {v?.envelope.ddP99.toFixed(1)}R)</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {l.grade === "probation" && l.stage === "vault" && <Button className="min-h-[44px]" onClick={() => setConfirm({ id: l.id, action: "shadow" })}>Start Shadow Run</Button>}
                      {(l.stage === "shadow") && <Button variant="outline" className="min-h-[44px]" onClick={() => go("shadow", { license: l.id })}>Open Shadow Run</Button>}
                      {l.grade === "licensed" && l.stage === "shadow" && <Button className="min-h-[44px]" onClick={() => setConfirm({ id: l.id, action: "live" })}>Go Live</Button>}
                      {l.stage === "live" && <Button variant="outline" className="min-h-[44px]" onClick={() => setConfirm({ id: l.id, action: "pause" })}>Pause</Button>}
                      {(l.stage === "live" || l.grade === "licensed") && <Button variant="outline" className="min-h-[44px]" onClick={() => setConfirm({ id: l.id, action: "close-all" })}>Close its open positions</Button>}
                      {l.stage !== "retired" && <Button variant="ghost" className="min-h-[44px]" onClick={() => setConfirm({ id: l.id, action: "retire" })}>Retire</Button>}
                      {l.runId && <Button variant="ghost" className="min-h-[44px]" onClick={() => go("report", { run: l.runId })}>Vault report</Button>}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium m-0 mb-2">History</h4>
                      <ol className="m-0 pl-0 list-none flex flex-col gap-1.5 text-sm">
                        {detail.data.events?.map(e => (
                          <li key={e.id} className="flex flex-col sm:flex-row sm:gap-3">
                            <span className="font-mono text-muted-foreground whitespace-nowrap">{new Date(e.at).toLocaleString()}</span>
                            <span><span className="font-mono">{e.fromGrade ? `${e.fromGrade}/${e.fromStage}` : "new"} → {e.toGrade}/{e.toStage}</span> · {e.reason}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {act.error && <p role="alert" className="text-destructive m-0">{(act.error as Error).message}</p>}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
        <AlertDialogContent>
          {confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONFIRM[confirm.action].title}</AlertDialogTitle>
                <AlertDialogDescription>{CONFIRM[confirm.action].body}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
                <AlertDialogAction className="min-h-[44px]" onClick={() => { act.mutate({ id: confirm.id, action: confirm.action }); setConfirm(null); }}>{CONFIRM[confirm.action].cta}</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
