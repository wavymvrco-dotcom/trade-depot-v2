// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Arena (live): one tile per agent (color = fitness sign and strength, outline =
// elite), generation and level, the champion's validation equity, deaths, Stop.

import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { lab, useLabNav, useRun, useRuns, BELTS, type Run } from "./api";
import { EquityLine } from "./EquityLine";

export function RunPicker({ runs, value, onChange, label = "Run" }: { runs: Run[] | undefined; value: string | null; onChange: (id: string) => void; label?: string }) {
  if (!runs?.length) return null;
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <select className="min-h-[44px] rounded-md border border-border bg-card px-3" value={value ?? ""} onChange={e => onChange(e.target.value)}>
        {!value && <option value="" disabled>Choose a run…</option>}
        {runs.map(r => (
          <option key={r.id} value={r.id}>
            {new Date(r.createdAt).toLocaleString()} · {r.style} · {(r.symbols as string[]).join(", ")} · {r.status}{r.grade ? ` · ${r.grade}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function tileColor(f: number, best: number, worst: number) {
  if (!Number.isFinite(f) || f <= -99) return "var(--rj-arena-bg)";
  const scale = f >= 0 ? Math.min(1, f / Math.max(1e-9, best)) : Math.min(1, f / Math.min(-1e-9, worst));
  const base = f >= 0 ? "var(--rj-pos)" : "var(--rj-neg)";
  return `color-mix(in srgb, ${base} ${Math.round(15 + 70 * scale)}%, var(--rj-surface))`;
}

export function ArenaTab() {
  const qc = useQueryClient();
  const runs = useRuns();
  const { runId, go } = useLabNav();
  const id = runId ?? runs.data?.[0]?.id ?? null;
  const run = useRun(id);
  const r = run.data;
  const p = r?.progress;
  const live = r && (r.status === "queued" || r.status === "running");
  const fit = p?.fitness ?? [];
  const elites = new Set(p?.elites ?? []);
  const best = Math.max(0, ...fit.filter(Number.isFinite)), worst = Math.min(0, ...fit.filter(v => Number.isFinite(v) && v > -99));

  const stop = async () => { if (id) { await lab("POST", `/api/lab/runs/${id}/cancel`); qc.invalidateQueries({ queryKey: ["/api/lab/runs", id] }); } };

  if (!runs.isLoading && !runs.data?.length) {
    return <div className="flex-1 p-8 text-muted-foreground">No runs yet. Write a Blueprint and press Train.</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
          <div className="md:w-[560px]"><RunPicker runs={runs.data} value={id} onChange={v => go("arena", { run: v })} /></div>
          <div className="flex gap-2">
            {live && <Button variant="outline" className="min-h-[44px]" onClick={stop}>Stop</Button>}
            {r?.status === "done" && <Button className="min-h-[44px]" onClick={() => go("report", { run: r.id })}>Read the report</Button>}
          </div>
        </div>

        {r && (
          <>
            <dl className="grid grid-cols-2 md:grid-cols-5 gap-3 m-0">
              {[
                ["Status", r.status === "running" ? p?.phase ?? "running" : r.status],
                ["Generation", p ? `${p.generation} / ${p.generations ?? r.config.generations}` : "—"],
                ["Level", p?.level ? BELTS[p.level] : "—"],
                ["Versions checked on validation", p?.trials ?? r.trials ?? "—"],
                ["Eliminations this generation", p?.deaths ?? "—"],
              ].map(([k, v]) => (
                <div key={k as string} className="bg-card border border-border rounded-xl p-4">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="m-0 mt-1 font-mono">{v as any}</dd>
                </div>
              ))}
            </dl>

            {r.status === "failed" && <p role="alert" className="text-destructive m-0">This run failed: {r.error}. Its credit was returned.</p>}

            <section className="bg-card border border-border rounded-xl p-4 md:p-6" aria-labelledby="arena-grid">
              <div className="flex justify-between items-baseline mb-3 gap-4 flex-wrap">
                <h3 id="arena-grid" className="font-display text-xl m-0">Agents</h3>
                <p className="text-xs text-muted-foreground m-0">Each tile is one version of the strategy. Green: did well across this generation's worlds. Red: lost. Outlined: kept unchanged as an elite. Grey: dropped early by successive halving.</p>
              </div>
              {fit.length ? (
                <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(18px, 1fr))" }} role="img"
                  aria-label={`${fit.length} agents; best fitness ${p?.best ?? "—"}, median ${p?.median ?? "—"}; ${elites.size} elites`}>
                  {fit.map((f, i) => (
                    <div key={i} title={`Agent ${i + 1}: fitness ${f}`} className="aspect-square rounded-[3px]"
                      style={{ background: tileColor(f, best, worst), outline: elites.has(i) ? "2px solid var(--rj-ink)" : "none", outlineOffset: -2 }} />
                  ))}
                </div>
              ) : <p className="text-muted-foreground m-0">{live ? "Loading market data and building the first generation…" : "No generation data for this run."}</p>}
            </section>

            <section className="bg-card border border-border rounded-xl p-4 md:p-6" aria-labelledby="arena-champ">
              <h3 id="arena-champ" className="font-display text-xl m-0 mb-1">Champion so far</h3>
              <p className="text-xs text-muted-foreground m-0 mb-3">Cumulative R on the validation data (not the locked Vault). Simulated.</p>
              {p?.championCurve?.length ? <EquityLine values={p.championCurve} label="Champion validation equity in R" /> : <p className="text-muted-foreground m-0">No candidate has made 30 validation trades yet.</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
