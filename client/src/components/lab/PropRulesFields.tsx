// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Prop-firm rules form (§10.5). Templates are editable starting points; users
// enter their own firm's exact rules (firms change them).

import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PropRulesInput } from "@shared/lab-schemas";
import { lab } from "./api";

export const EMPTY_PROP: PropRulesInput = {
  firmLabel: "My challenge", accountSize: 100_000, dailyLossLimitPct: 5, maxDrawdownPct: 10, drawdownType: "static",
  profitTargetPct: 10, minTradingDays: 4, weekendHoldingAllowed: false, timeLimitDays: 30,
};

export function PropRulesFields({ value, onChange, idPrefix = "prop" }: { value: PropRulesInput; onChange: (v: PropRulesInput) => void; idPrefix?: string }) {
  const templates = useQuery<Record<string, Omit<PropRulesInput, "firmLabel" | "accountSize">>>({ queryKey: ["/api/lab/prop-templates"], queryFn: () => lab("GET", "/api/lab/prop-templates"), staleTime: Infinity });
  const set = <K extends keyof PropRulesInput>(k: K, v: PropRulesInput[K]) => onChange({ ...value, [k]: v });
  const num = (k: keyof PropRulesInput, optional = false) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, (e.target.value === "" && optional ? undefined : Number(e.target.value)) as any);
  const field = "flex flex-col gap-1.5";
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <div className="grid gap-4">
      {templates.data && (
        <div className={field}>
          <Label htmlFor={id("tpl")}>Start from a template (then edit to match your firm)</Label>
          <select id={id("tpl")} defaultValue="" className="min-h-[44px] rounded-md border border-border bg-card px-3"
            onChange={e => { const t = templates.data![e.target.value]; if (t) onChange({ firmLabel: value.firmLabel, accountSize: value.accountSize, ...t }); }}>
            <option value="" disabled>Choose…</option>
            {Object.keys(templates.data).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className={field}><Label htmlFor={id("label")}>Name (your firm and account)</Label><Input id={id("label")} value={value.firmLabel} maxLength={80} onChange={e => set("firmLabel", e.target.value)} className="min-h-[44px]" /></div>
        <div className={field}><Label htmlFor={id("size")}>Account size</Label><Input id={id("size")} type="number" min={100} value={value.accountSize} onChange={num("accountSize")} className="min-h-[44px] font-mono" /></div>
        <div className={field}><Label htmlFor={id("daily")}>Daily loss limit (%)</Label><Input id={id("daily")} type="number" step={0.1} value={value.dailyLossLimitPct} onChange={num("dailyLossLimitPct")} className="min-h-[44px] font-mono" /></div>
        <div className={field}><Label htmlFor={id("dd")}>Maximum drawdown (%)</Label><Input id={id("dd")} type="number" step={0.1} value={value.maxDrawdownPct} onChange={num("maxDrawdownPct")} className="min-h-[44px] font-mono" /></div>
        <div className={field}>
          <Label htmlFor={id("ddtype")}>Drawdown type</Label>
          <select id={id("ddtype")} className="min-h-[44px] rounded-md border border-border bg-card px-3" value={`${value.drawdownType}:${value.drawdownMeasure ?? "intraday"}`}
            onChange={e => { const [t, m] = e.target.value.split(":"); onChange({ ...value, drawdownType: t as any, drawdownMeasure: t === "trailing" ? (m as any) : undefined }); }}>
            <option value="static:intraday">Static (fixed floor)</option>
            <option value="trailing:intraday">Trailing, intraday</option>
            <option value="trailing:end_of_day">Trailing, end of day</option>
          </select>
        </div>
        <div className={field}><Label htmlFor={id("target")}>Profit target (%)</Label><Input id={id("target")} type="number" step={0.1} placeholder="None" value={value.profitTargetPct ?? ""} onChange={num("profitTargetPct", true)} className="min-h-[44px] font-mono" /></div>
        <div className={field}><Label htmlFor={id("days")}>Minimum trading days</Label><Input id={id("days")} type="number" placeholder="None" value={value.minTradingDays ?? ""} onChange={num("minTradingDays", true)} className="min-h-[44px] font-mono" /></div>
        <div className={field}><Label htmlFor={id("limit")}>Time limit (days)</Label><Input id={id("limit")} type="number" placeholder="None" value={value.timeLimitDays ?? ""} onChange={num("timeLimitDays", true)} className="min-h-[44px] font-mono" /></div>
        <div className={field}><Label htmlFor={id("cons")}>Consistency rule: max % of profit from one day</Label><Input id={id("cons")} type="number" placeholder="None" value={value.consistencyRulePct ?? ""} onChange={num("consistencyRulePct", true)} className="min-h-[44px] font-mono" /></div>
        <div className={field}><Label htmlFor={id("reset")}>Daily limit resets at (UTC hour)</Label><Input id={id("reset")} type="number" min={0} max={23} placeholder="0" value={value.dailyResetHourUtc ?? ""} onChange={num("dailyResetHourUtc", true)} className="min-h-[44px] font-mono" /></div>
      </div>
      <label className="flex items-center gap-3 min-h-[44px]"><Switch checked={value.weekendHoldingAllowed} onCheckedChange={v => set("weekendHoldingAllowed", v)} /> Weekend holding allowed</label>
    </div>
  );
}
