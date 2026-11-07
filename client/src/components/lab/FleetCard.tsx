// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Fleet (§11.9): allocate across Licensed strategies to limit the worst days,
// with a holdout check before it may be used live.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { lab } from "./api";

export function FleetCard() {
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setErr(null);
    try { setRes(await lab("POST", "/api/lab/fleet", { cap: 0.6 })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="bg-card border border-border rounded-xl p-4 md:p-5 flex flex-col gap-3" aria-labelledby="fleet-h">
      <h3 id="fleet-h" className="font-display text-lg m-0">Fleet</h3>
      <p className="text-sm text-muted-foreground m-0">Splits risk across your Licensed strategies to make the worst 5% of days as mild as possible (no single strategy above 60%). It is checked on the most recent 30% of days it never saw before it can be used.</p>
      <Button variant="outline" className="min-h-[44px] self-start" disabled={busy} onClick={run}>{busy ? "Optimizing…" : "Build my Fleet"}</Button>
      {err && <p role="alert" className="text-destructive m-0 text-sm">{err}</p>}
      {res && !res.ok && <p className="m-0 text-sm">{res.reason}</p>}
      {res?.ok && (
        <div className="bg-secondary rounded-lg p-4 text-sm flex flex-col gap-2">
          <ul className="m-0 pl-0 list-none">
            {res.strategies.map((s: any, i: number) => <li key={s.id} className="flex justify-between gap-4"><span>{s.name}</span><span className="font-mono">{Math.round(res.weights[i] * 100)}%</span></li>)}
          </ul>
          <p className="m-0">On {res.holdout.days} unseen days: worst-5%-day average loss <span className="font-mono">{res.holdout.fleetCvar.toFixed(2)}R</span> vs <span className="font-mono">{res.holdout.equalCvar.toFixed(2)}R</span> for equal weights.</p>
          <p className="m-0 font-medium">{res.passed ? "Passed the holdout check: usable for Live." : "Did not pass the holdout check: not used for Live."}</p>
        </div>
      )}
    </section>
  );
}
