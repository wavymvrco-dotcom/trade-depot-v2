// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Challenge Odds (§10.6): always a range, never a single number, never "guaranteed".

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PropRulesInput } from "@shared/lab-schemas";
import { lab } from "./api";
import { PropRulesFields, EMPTY_PROP } from "./PropRulesFields";

interface Odds {
  passRate: number; lo: number; hi: number; paths: number; sourceTrades: number;
  mostCommonFailure: string | null; medianDaysToPass: number | null; failureText: Record<string, string>;
  sources: { vault: number; shadow: number; live: number }; riskPct: number;
}

export function ChallengeOdds({ licenseId }: { licenseId: string }) {
  const [rules, setRules] = useState<PropRulesInput>(EMPTY_PROP);
  const [risk, setRisk] = useState(1);
  const [odds, setOdds] = useState<Odds | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setErr(null);
    try { setOdds(await lab<Odds>("POST", `/api/lab/licenses/${licenseId}/challenge-odds`, { rules, riskPct: risk })); }
    catch (e: any) { setErr(e.message); setOdds(null); }
    finally { setBusy(false); }
  };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <section className="border border-border rounded-xl p-4 md:p-5 flex flex-col gap-4" aria-labelledby={`odds-${licenseId}`}>
      <div>
        <h4 id={`odds-${licenseId}`} className="font-display text-lg m-0">Challenge Odds</h4>
        <p className="text-sm text-muted-foreground m-0 mt-1">Runs this strategy's real trades (Vault, Shadow and Live) through your firm's rules 10,000 times. It is an estimate from past behaviour, not a promise.</p>
      </div>
      <PropRulesFields value={rules} onChange={setRules} idPrefix={`odds-${licenseId}`} />
      <label className="flex flex-col gap-1.5 text-sm sm:w-48">
        <span className="font-medium">Risk per trade (%)</span>
        <input type="number" min={0.05} max={5} step={0.05} value={risk} onChange={e => setRisk(Number(e.target.value))} className="min-h-[44px] rounded-md border border-border bg-card px-3 font-mono" />
      </label>
      <Button className="min-h-[44px] self-start" disabled={busy} onClick={run}>{busy ? "Simulating…" : "Estimate my odds"}</Button>
      {err && <p role="alert" className="text-destructive m-0">{err}</p>}
      {odds && (
        <div className="bg-secondary rounded-xl p-4 flex flex-col gap-2" aria-live="polite">
          <p className="m-0"><span className="font-mono text-2xl">{pct(odds.lo)}–{pct(odds.hi)}</span> <span className="text-muted-foreground">estimated chance to pass</span></p>
          <p className="m-0 text-sm text-muted-foreground">
            {odds.mostCommonFailure ? <>Most common way it fails: {odds.failureText[odds.mostCommonFailure] ?? odds.mostCommonFailure}. </> : null}
            {odds.medianDaysToPass != null ? <>When it passes, it usually takes about {odds.medianDaysToPass} trading days. </> : null}
            Based on {odds.sourceTrades} real trades ({odds.sources.vault} Vault, {odds.sources.shadow} Shadow, {odds.sources.live} Live); the range is wider when there are fewer.
          </p>
        </div>
      )}
    </section>
  );
}
