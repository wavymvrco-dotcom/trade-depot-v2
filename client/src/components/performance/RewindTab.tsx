// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// "Your trades, rewound" (§10.3). Each change is applied to every trade and
// summed, so a change can't look good by being tried only on the losers.

import { useQuery } from "@tanstack/react-query";
import { lab } from "@/components/lab/api";

interface Report {
  trades: number; actualTotal: number; skippedOld: number;
  mutations: { key: string; label: string; total: number; delta: number; helped: number; hurt: number }[];
  best: { key: string; label: string; delta: number } | null;
  worst10: { id: string; actual: number; variants: Record<string, number> }[];
}

const money = (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function RewindTab() {
  const q = useQuery<Report>({ queryKey: ["/api/performance/rewind"], queryFn: () => lab("GET", "/api/performance/rewind"), staleTime: 60_000, retry: false });
  const r = q.data;
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl m-0">Your trades, rewound</h2>
          <p className="text-muted-foreground m-0 mt-2">Each change below is replayed on the real candles for every one of your closed trades, then added up. A change only counts as better if it helps across all of them — not just the trades it would have saved.</p>
        </div>
        {q.isLoading && <p className="text-muted-foreground">Replaying your trades…</p>}
        {q.error && <p role="alert" className="text-destructive">{(q.error as Error).message}</p>}
        {r && r.trades === 0 && <p className="text-muted-foreground">No closed trades in the last ~7 months to rewind yet.</p>}
        {r && r.trades > 0 && (
          <>
            <section className="bg-card border border-border rounded-2xl p-5 md:p-7">
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground m-0 mb-2">THE ONE CHANGE THAT HELPED MOST, ACROSS ALL {r.trades} TRADES</p>
              {r.best ? (
                <p className="m-0 text-lg"><span className="font-medium">{r.best.label}</span> would have changed your total by <span className="font-mono text-pos">{money(r.best.delta)}</span> (actual total {money(r.actualTotal)}).</p>
              ) : <p className="m-0 text-lg">None of these changes would have improved your total. Your entries and stops held up.</p>}
              <p className="text-xs text-muted-foreground m-0 mt-2">Hindsight on past trades — not a prediction. {r.skippedOld ? `${r.skippedOld} older trades are outside the loaded price history.` : ""}</p>
            </section>

            <section className="bg-card border border-border rounded-2xl p-5 md:p-7 overflow-x-auto" aria-labelledby="rw-all">
              <h3 id="rw-all" className="font-display text-xl m-0 mb-3">Every change, every trade</h3>
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="text-xs text-muted-foreground border-b border-border">
                  {["Change", "Total", "vs actual", "Helped", "Hurt"].map(h => <th key={h} scope="col" className={`font-normal py-2 ${h === "Change" ? "text-left" : "text-right"}`}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {r.mutations.map(m => (
                    <tr key={m.key} className="border-b border-border/60">
                      <th scope="row" className="text-left font-medium py-2">{m.label}</th>
                      <td className="text-right font-mono">{money(m.total)}</td>
                      <td className={`text-right font-mono ${m.delta > 0 ? "text-pos" : m.delta < 0 ? "text-neg" : ""}`}>{money(m.delta)}</td>
                      <td className="text-right font-mono">{m.helped}</td>
                      <td className="text-right font-mono">{m.hurt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground m-0 mt-2">Half or double size scales wins and losses alike, so it is shown but never suggested as the fix.</p>
            </section>

            <section className="bg-card border border-border rounded-2xl p-5 md:p-7 overflow-x-auto" aria-labelledby="rw-worst">
              <h3 id="rw-worst" className="font-display text-xl m-0 mb-3">Your 10 worst trades, rewound</h3>
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="text-xs text-muted-foreground border-b border-border">
                  <th scope="col" className="text-left font-normal py-2">Actual</th>
                  {r.mutations.filter(m => m.key !== "half_size" && m.key !== "double_size").map(m => <th key={m.key} scope="col" className="text-right font-normal">{m.label}</th>)}
                </tr></thead>
                <tbody className="font-mono">
                  {r.worst10.map(w => (
                    <tr key={w.id} className="border-b border-border/60">
                      <td className="py-2 text-neg">{money(w.actual)}</td>
                      {r.mutations.filter(m => m.key !== "half_size" && m.key !== "double_size").map(m => (
                        <td key={m.key} className={`text-right ${w.variants[m.key] > w.actual ? "text-pos" : ""}`}>{money(w.variants[m.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
