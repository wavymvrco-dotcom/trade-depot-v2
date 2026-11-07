// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Forge (§11.1) and Layer Kit submissions (§11.6): new layers, written as small
// JSON programs, accepted only if they pass the same tests on training data.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { lab, useLabMe } from "./api";

interface Archive {
  style: string; layerTrials: number; nextThreshold: number;
  accepted: { id: string; text: string; niche: string; score: number; stats: any; authorType: string }[];
  recent: { id: string; text: string; niche: string; status: string; score: number; reasons: string[]; authorType: string }[];
}

const STYLES = ["scalp", "day", "swing", "position"] as const;

export function ForgeTab() {
  const qc = useQueryClient();
  const me = useLabMe();
  const [style, setStyle] = useState<(typeof STYLES)[number]>("swing");
  const q = useQuery<Archive>({ queryKey: ["/api/lab/forge", style], queryFn: () => lab("GET", `/api/lab/forge?style=${style}`), refetchInterval: 15_000 });
  const [steps, setSteps] = useState(20);
  const [useAi, setUseAi] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [layer, setLayer] = useState(`{"op":"clamp","lo":-1,"hi":1,"x":{"op":"neg","x":{"op":"zscore","n":20,"x":{"op":"series","name":"close"}}}}`);
  const run = async () => {
    setMsg(null);
    try { await lab("POST", "/api/lab/forge", { style, steps, useAi }); setMsg(`Forge started: ${steps} proposals for ${style}. Results appear below as they are tested.`); }
    catch (e: any) { setMsg(e.message); }
  };
  const submit = async () => {
    setMsg(null);
    let parsed: unknown;
    try { parsed = JSON.parse(layer); } catch { setMsg("That isn't valid JSON."); return; }
    try {
      const r = await lab<any>("POST", "/api/lab/forge/submit", { style, layer: parsed });
      setMsg(r.duplicate ? `Already tested (${r.status}).` : r.status === "accepted" ? "Accepted: it joins the next Arena runs as a new layer." : `Not accepted: ${r.result?.reasons?.join("; ")}`);
      qc.invalidateQueries({ queryKey: ["/api/lab/forge", style] });
    } catch (e: any) { setMsg(e.message); }
  };
  const a = q.data;
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl m-0">The Forge</h2>
          <p className="text-muted-foreground m-0 mt-2">New layers are invented as small programs in a safe language — never code that runs. A layer is accepted only if it predicts on training data with a bar that rises every time any layer is tried, isn't a copy of one that already exists, and cannot read the future.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Style">
          {STYLES.map(s => (
            <button key={s} type="button" role="radio" aria-checked={style === s} onClick={() => setStyle(s)}
              className={`min-h-[44px] px-4 rounded-full border text-sm ${style === s ? "bg-primary text-primary-foreground border-primary" : "border-rule"}`}>{s}</button>
          ))}
        </div>
        {a && (
          <section className="bg-card border border-border rounded-2xl p-5 md:p-7">
            <p className="m-0"><span className="font-mono text-2xl">{a.accepted.length}</span> accepted of <span className="font-mono">{a.layerTrials}</span> tried for {style}. The next layer needs |t| ≥ <span className="font-mono">{a.nextThreshold.toFixed(2)}</span>.</p>
            {a.accepted.length ? (
              <ul className="mt-3 mb-0 pl-0 list-none flex flex-col gap-2 font-mono text-sm">{a.accepted.map(x => <li key={x.id} className="bg-secondary rounded-lg p-3 break-all">{x.text} <span className="text-muted-foreground">· {x.niche} · |t| {Math.abs(x.stats?.tStat ?? 0).toFixed(2)}</span></li>)}</ul>
            ) : <p className="text-sm text-muted-foreground mt-2 mb-0">None accepted yet. That is a real result: no candidate has shown an edge strong enough to beat the rising bar.</p>}
          </section>
        )}
        {me.data?.tier === "pro" && (
          <section className="bg-card border border-border rounded-2xl p-5 md:p-7 flex flex-col gap-3">
            <h3 className="font-display text-xl m-0">Run the Forge</h3>
            <label className="flex items-center gap-3 text-sm">Proposals <input type="number" min={1} max={50} value={steps} onChange={e => setSteps(Number(e.target.value))} className="w-24 min-h-[44px] rounded-md border border-border bg-card px-3 font-mono" /></label>
            <label className="flex items-center gap-3 min-h-[44px] text-sm"><Switch checked={useAi} onCheckedChange={setUseAi} /> Ask my AI provider to propose (uses my key); otherwise mutate the best existing programs</label>
            <Button className="min-h-[44px] self-start" onClick={run}>Run</Button>
          </section>
        )}
        <section className="bg-card border border-border rounded-2xl p-5 md:p-7 flex flex-col gap-3">
          <h3 className="font-display text-xl m-0">Submit your own layer (Layer Kit)</h3>
          <p className="text-sm text-muted-foreground m-0">Write a layer as JSON in the Forge language. It goes through exactly the same tests.</p>
          <Textarea aria-label="Layer JSON" rows={4} className="font-mono text-xs" value={layer} onChange={e => setLayer(e.target.value)} />
          <Button variant="outline" className="min-h-[44px] self-start" onClick={submit}>Test it</Button>
        </section>
        {msg && <p role="status" className="m-0">{msg}</p>}
        {a && !!a.recent.length && (
          <section className="bg-card border border-border rounded-2xl p-5 md:p-7 overflow-x-auto">
            <h3 className="font-display text-xl m-0 mb-3">Recently tested</h3>
            <table className="w-full min-w-[640px] text-sm"><tbody>
              {a.recent.slice(0, 25).map(r => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-mono text-xs break-all">{r.text}</td>
                  <td className="pr-3 whitespace-nowrap">{r.niche}</td>
                  <td className={`pr-3 ${r.status === "accepted" ? "text-pos" : "text-muted-foreground"}`}>{r.status}</td>
                  <td className="text-muted-foreground">{r.reasons.join("; ")}</td>
                </tr>
              ))}
            </tbody></table>
          </section>
        )}
      </div>
    </div>
  );
}
