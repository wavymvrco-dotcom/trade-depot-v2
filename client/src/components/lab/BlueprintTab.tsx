// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Blueprint (§9.1, Phase 1 form): describe the strategy, read it back in plain
// English, check feasibility (free), then train (one credit).

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { describeBlueprint, GOAL_PRESETS, LAB_SYMBOLS, blueprintSpecSchema, type BlueprintSpecInput } from "@shared/lab-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { lab, useBlueprints, useLabMe, useLabNav, type Feasibility } from "./api";

type Goal = keyof typeof GOAL_PRESETS;
const STYLES = [
  { id: "scalp", label: "Scalp", note: "5-minute bars. Short history: about 2 weeks of locked test data." },
  { id: "day", label: "Day", note: "15-minute bars." },
  { id: "swing", label: "Swing", note: "4-hour bars." },
  { id: "position", label: "Position", note: "Daily bars." },
] as const;

const field = "flex flex-col gap-1.5";
const card = "bg-card border border-border rounded-xl p-5 md:p-6";

export function BlueprintTab() {
  const qc = useQueryClient();
  const { go } = useLabNav();
  const me = useLabMe();
  const bps = useBlueprints();
  const [name, setName] = useState("My strategy");
  const [style, setStyle] = useState<BlueprintSpecInput["style"]>("swing");
  const [symbols, setSymbols] = useState<string[]>(["EURUSD", "GBPUSD", "USDJPY"]);
  const [goal, setGoal] = useState<Goal>("balanced");
  const [risk, setRisk] = useState(1);
  const [maxPos, setMaxPos] = useState(3);
  const [maxLosses, setMaxLosses] = useState<string>("");
  const [noWeekend, setNoWeekend] = useState(false);
  const [sessionOn, setSessionOn] = useState(false);
  const [sess, setSess] = useState<[number, number]>([7, 17]);
  const [maxStop, setMaxStop] = useState<string>("");
  const [minRr, setMinRr] = useState<string>("");
  const [minWeek, setMinWeek] = useState<string>("");
  const [maxWeek, setMaxWeek] = useState<string>("");
  const [feas, setFeas] = useState<Feasibility | null>(null);
  const [busy, setBusy] = useState<"" | "check" | "train">("");
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const spec = useMemo(() => {
    const tf = num(minWeek) != null || num(maxWeek) != null ? { minPerWeek: num(minWeek), maxPerWeek: num(maxWeek) } : undefined;
    return {
      version: 1 as const, style, symbols: symbols as BlueprintSpecInput["symbols"],
      objective: { ...GOAL_PRESETS[goal], ...(tf ? { tradeFrequency: tf } : {}) },
      constraints: {
        ...(num(maxLosses) ? { maxConsecutiveLosses: num(maxLosses) } : {}),
        ...(noWeekend ? { noWeekendHolding: true } : {}),
        ...(sessionOn ? { sessionHoursUtc: sess } : {}),
        ...(num(maxStop) ? { maxStopAtr: num(maxStop) } : {}),
        ...(num(minRr) ? { minRr: num(minRr) } : {}),
      },
      risk: { riskPercentPerTrade: risk, maxOpenPositions: maxPos },
    };
  }, [style, symbols, goal, risk, maxPos, maxLosses, noWeekend, sessionOn, sess, maxStop, minRr, minWeek, maxWeek]);
  const parsed = blueprintSpecSchema.safeParse(spec);
  const summary = parsed.success ? describeBlueprint(parsed.data) : null;

  // Any change invalidates the last feasibility check
  useEffect(() => { setFeas(null); setError(null); }, [spec]);

  const limits = me.data?.limits;
  const credits = limits ? Math.max(0, limits.runsPerMonth - (me.data?.creditsUsed ?? 0)) : null;
  const population = limits ? Math.min(128, limits.maxPopulation) : 48;
  const generations = limits ? Math.min(40, limits.maxGenerations) : 20;
  const estSeconds = Math.round(20 * symbols.length + (population * generations * 8) / 20000);

  async function check() {
    if (!parsed.success) return;
    setBusy("check"); setError(null);
    try { setFeas(await lab<Feasibility>("POST", "/api/lab/feasibility", { spec: parsed.data })); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function train() {
    if (!parsed.success || !feas?.ok) return;
    setBusy("train"); setError(null);
    try {
      const bp = await lab<{ id: string }>("POST", "/api/lab/blueprints", { name, spec: parsed.data });
      const run = await lab<{ runId: string }>("POST", "/api/lab/runs", { blueprintId: bp.id, population, generations });
      qc.invalidateQueries({ queryKey: ["/api/lab/runs"] });
      qc.invalidateQueries({ queryKey: ["/api/lab/me"] });
      qc.invalidateQueries({ queryKey: ["/api/lab/blueprints"] });
      go("arena", { run: run.runId });
    } catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  }

  const loadBlueprint = (id: string) => {
    const b = bps.data?.find(x => x.id === id); if (!b) return;
    const s = b.spec;
    setName(b.name); setStyle(s.style); setSymbols(s.symbols); setRisk(s.risk.riskPercentPerTrade); setMaxPos(s.risk.maxOpenPositions);
    const g = (Object.keys(GOAL_PRESETS) as Goal[]).find(k => GOAL_PRESETS[k].drawdownPenalty === s.objective.drawdownPenalty) ?? "balanced";
    setGoal(g);
    setMaxLosses(s.constraints.maxConsecutiveLosses?.toString() ?? ""); setNoWeekend(!!s.constraints.noWeekendHolding);
    setSessionOn(!!s.constraints.sessionHoursUtc); if (s.constraints.sessionHoursUtc) setSess(s.constraints.sessionHoursUtc as [number, number]);
    setMaxStop(s.constraints.maxStopAtr?.toString() ?? ""); setMinRr(s.constraints.minRr?.toString() ?? "");
    setMinWeek(s.objective.tradeFrequency?.minPerWeek?.toString() ?? ""); setMaxWeek(s.objective.tradeFrequency?.maxPerWeek?.toString() ?? "");
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl md:text-3xl m-0">Write a Blueprint</h2>
          <p className="text-muted-foreground m-0">Describe the strategy you want. The Arena searches for it, the Vault Exam tests it on data it has never seen, and it is graded honestly — Scrapped is a real answer.</p>
        </div>

        {!!bps.data?.length && (
          <div className={field}>
            <Label htmlFor="bp-load">Start from a saved Blueprint</Label>
            <select id="bp-load" className="min-h-[44px] rounded-md border border-border bg-card px-3" defaultValue="" onChange={e => loadBlueprint(e.target.value)}>
              <option value="" disabled>Choose…</option>
              {bps.data.map(b => <option key={b.id} value={b.id}>{b.name} (v{b.specVersion})</option>)}
            </select>
          </div>
        )}

        <section className={card} aria-labelledby="bp-basics">
          <h3 id="bp-basics" className="font-display text-xl m-0 mb-4">Basics</h3>
          <div className="grid gap-5">
            <div className={field}>
              <Label htmlFor="bp-name">Name</Label>
              <Input id="bp-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} className="min-h-[44px]" />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium mb-2">Style</legend>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {STYLES.map(s => (
                  <label key={s.id} className={`min-h-[44px] rounded-lg border px-3 py-2 cursor-pointer ${style === s.id ? "border-primary bg-accent" : "border-border"}`}>
                    <input type="radio" name="style" value={s.id} checked={style === s.id} onChange={() => setStyle(s.id)} className="sr-only" />
                    <span className="font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.note}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium mb-2">Pairs <span className="text-muted-foreground font-normal">— more pairs means more locked data, and a fairer exam</span></legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {LAB_SYMBOLS.map(s => (
                  <label key={s} className="flex items-center gap-2 min-h-[44px] font-mono text-sm">
                    <Checkbox checked={symbols.includes(s)} onCheckedChange={v => setSymbols(v ? [...symbols, s] : symbols.filter(x => x !== s))} aria-label={s} />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium mb-2">Goal</legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([["conservative", "Conservative", "Strongly avoids drawdowns"], ["balanced", "Balanced", "Weighs return and drawdown"], ["aggressive", "Aggressive", "Accepts deeper drawdowns"]] as const).map(([id, label, note]) => (
                  <label key={id} className={`min-h-[44px] rounded-lg border px-3 py-2 cursor-pointer ${goal === id ? "border-primary bg-accent" : "border-border"}`}>
                    <input type="radio" name="goal" value={id} checked={goal === id} onChange={() => setGoal(id)} className="sr-only" />
                    <span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{note}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-4">
              <div className={field}><Label htmlFor="bp-risk">Risk per trade (%)</Label><Input id="bp-risk" type="number" min={0.05} max={5} step={0.05} value={risk} onChange={e => setRisk(Number(e.target.value))} className="min-h-[44px] font-mono" /></div>
              <div className={field}><Label htmlFor="bp-pos">Max open positions</Label><Input id="bp-pos" type="number" min={1} max={20} value={maxPos} onChange={e => setMaxPos(Number(e.target.value))} className="min-h-[44px] font-mono" /></div>
            </div>
          </div>
        </section>

        <section className={card} aria-labelledby="bp-rules">
          <h3 id="bp-rules" className="font-display text-xl m-0 mb-1">Rules it must follow</h3>
          <p className="text-sm text-muted-foreground m-0 mb-4">Optional. Breaking the losing-streak rule eliminates a candidate in that world; the others shape how it trades.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className={field}><Label htmlFor="bp-losses">Max losses in a row</Label><Input id="bp-losses" type="number" min={1} max={50} placeholder="No limit" value={maxLosses} onChange={e => setMaxLosses(e.target.value)} className="min-h-[44px] font-mono" /></div>
            <div className={field}><Label htmlFor="bp-stop">Widest stop (ATR)</Label>
              <select id="bp-stop" className="min-h-[44px] rounded-md border border-border bg-card px-3 font-mono" value={maxStop} onChange={e => setMaxStop(e.target.value)}>
                <option value="">Any</option>{[1, 1.5, 2, 3].map(v => <option key={v} value={v}>{v}</option>)}
              </select></div>
            <div className={field}><Label htmlFor="bp-rr">Smallest target (R)</Label>
              <select id="bp-rr" className="min-h-[44px] rounded-md border border-border bg-card px-3 font-mono" value={minRr} onChange={e => setMinRr(e.target.value)}>
                <option value="">Any</option>{[1, 1.5, 2, 2.5, 3].map(v => <option key={v} value={v}>{v}</option>)}
              </select></div>
            <div className="grid grid-cols-2 gap-2">
              <div className={field}><Label htmlFor="bp-minw">Min trades/week</Label><Input id="bp-minw" type="number" min={0} value={minWeek} onChange={e => setMinWeek(e.target.value)} className="min-h-[44px] font-mono" /></div>
              <div className={field}><Label htmlFor="bp-maxw">Max trades/week</Label><Input id="bp-maxw" type="number" min={0} value={maxWeek} onChange={e => setMaxWeek(e.target.value)} className="min-h-[44px] font-mono" /></div>
            </div>
            <label className="flex items-center gap-3 min-h-[44px]"><Switch checked={noWeekend} onCheckedChange={setNoWeekend} /> No positions over the weekend</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 min-h-[44px]"><Switch checked={sessionOn} onCheckedChange={setSessionOn} /> Only enter during set hours (UTC)</label>
              {sessionOn && (
                <div className="flex items-center gap-2 font-mono text-sm">
                  <Input aria-label="Session start hour UTC" type="number" min={0} max={23} value={sess[0]} onChange={e => setSess([Number(e.target.value), sess[1]])} className="w-20 min-h-[44px]" />
                  to <Input aria-label="Session end hour UTC" type="number" min={1} max={24} value={sess[1]} onChange={e => setSess([sess[0], Number(e.target.value)])} className="w-20 min-h-[44px]" /> UTC
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={`${card} bg-secondary`} aria-live="polite">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground m-0 mb-2">IN PLAIN ENGLISH</p>
          {summary ? <p className="m-0 text-lg leading-relaxed">{summary}</p> : <p className="m-0 text-destructive">{parsed.success ? "" : parsed.error.issues[0]?.message ?? "Check the fields above."}</p>}
        </section>

        {feas && (
          <section className={`${card} ${feas.ok ? "" : "border-destructive"}`} aria-live="polite">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground m-0 mb-2">FEASIBILITY</p>
            <p className="m-0">{feas.message}</p>
            <ul className="mt-3 mb-0 pl-0 list-none flex flex-wrap gap-x-5 gap-y-1 font-mono text-sm">
              {feas.perPair.map(p => <li key={p.symbol}>{p.symbol} ≈ {p.expectedVaultTrades} trades</li>)}
            </ul>
            {!feas.ok && <ul className="mt-3 mb-0 text-sm">{feas.advice.map(a => <li key={a}>{a}</li>)}</ul>}
          </section>
        )}

        {error && <p role="alert" className="text-destructive m-0">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Button variant="outline" className="min-h-[44px]" disabled={!parsed.success || busy !== ""} onClick={check}>
            {busy === "check" ? "Checking… (first check of a pair loads its history)" : "Check feasibility (free)"}
          </Button>
          <Button className="min-h-[44px]" disabled={!feas?.ok || busy !== "" || credits === 0} onClick={train}>
            {busy === "train" ? "Starting…" : "Train"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {population} agents × {generations} generations · about {Math.max(30, estSeconds)} s · uses 1 of {credits ?? "…"} runs left this month
          </span>
        </div>
      </div>
    </div>
  );
}
