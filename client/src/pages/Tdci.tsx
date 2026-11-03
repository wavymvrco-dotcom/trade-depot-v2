import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/hooks/useApi";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Gauge, RefreshCw, FlaskConical, Info, ShieldCheck, ShieldAlert, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "GBPJPY", "XAUUSD"];

type Layer = { key: string; label: string; value: number; weight: number; detail: string };
type Bucket = { min: number; max: number; trades: number; winRate: number; avgR: number; profitFactor: number };
type Period = {
  from: string; to: string; bars: number; buckets: Bucket[]; anySignal: Bucket;
  randomDirection: number; monotonic: number;
  strategy: { threshold: number; trades: number; winRate: number; totalR: number; maxDrawdownR: number } | null;
};

const fmtR = (r: number) => `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`;
const rColor = (r: number) => r > 0.02 ? "text-green-500" : r < -0.02 ? "text-red-500" : "text-muted-foreground";

function ScoreRing({ score, direction }: { score: number; direction: string }) {
  const r = 54, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  const color = direction === "LONG" ? "#22c55e" : direction === "SHORT" ? "#ef4444" : "hsl(var(--muted-foreground))";
  return (
    <div className="relative w-36 h-36 shrink-0">
      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black font-mono">{score}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">of 100</span>
      </div>
    </div>
  );
}

/** Centered bar: left = bearish, right = bullish. */
function LayerBar({ value, regime }: { value: number; regime?: boolean }) {
  if (regime) {
    return (
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    );
  }
  const pct = Math.min(50, Math.abs(value) * 50);
  return (
    <div className="relative h-2 bg-muted rounded-full overflow-hidden">
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
      <div
        className={cn("absolute top-0 bottom-0 rounded-full", value >= 0 ? "bg-green-500" : "bg-red-500")}
        style={value >= 0 ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
      />
    </div>
  );
}

function BucketTable({ title, p, highlight }: { title: string; p: Period; highlight?: number | null }) {
  return (
    <div className="bg-background/40 border border-border/60 rounded-lg p-3">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[10px] text-muted-foreground font-mono">{p.from.slice(0, 10)} → {p.to.slice(0, 10)}</p>
      </div>
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="text-muted-foreground text-[10px]">
            <th className="text-left font-normal">Score</th><th className="text-right font-normal">Trades</th>
            <th className="text-right font-normal">Win</th><th className="text-right font-normal">Avg</th><th className="text-right font-normal">PF</th>
          </tr>
        </thead>
        <tbody>
          {p.buckets.map(b => (
            <tr key={b.min} className={cn(highlight != null && b.min >= highlight && "bg-primary/5")}>
              <td>{b.min}–{Math.min(b.max, 100)}</td>
              <td className="text-right">{b.trades}</td>
              <td className="text-right">{b.winRate}%</td>
              <td className={cn("text-right", rColor(b.avgR))}>{fmtR(b.avgR)}</td>
              <td className="text-right">{b.profitFactor}</td>
            </tr>
          ))}
          <tr className="border-t border-border/50 text-muted-foreground">
            <td>All signals</td><td className="text-right">{p.anySignal.trades}</td><td className="text-right">{p.anySignal.winRate}%</td>
            <td className={cn("text-right", rColor(p.anySignal.avgR))}>{fmtR(p.anySignal.avgR)}</td><td className="text-right">{p.anySignal.profitFactor}</td>
          </tr>
          <tr className="text-muted-foreground">
            <td colSpan={3}>Coin-flip direction</td><td className={cn("text-right", rColor(p.randomDirection))}>{fmtR(p.randomDirection)}</td><td />
          </tr>
        </tbody>
      </table>
      {p.strategy && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Real strategy (score ≥ {p.strategy.threshold}, one trade at a time): {p.strategy.trades} trades, {p.strategy.winRate}% win,{" "}
          <span className={rColor(p.strategy.totalR)}>{fmtR(p.strategy.totalR)}</span> total, max drawdown {p.strategy.maxDrawdownR}R
        </p>
      )}
    </div>
  );
}

type ProfileInfo = {
  key: string; label: string; description: string; interval: string; htf: string;
  model: { stopAtr: number; rr: number; maxHold: number; icHorizon: number };
  sessionHours: [number, number] | null;
  layers: { key: string; label: string; about: string; weight: number | null }[];
};

const TF_LABEL: Record<string, string> = { "5min": "5m", "15min": "15m", "1h": "1H", "4h": "4H", "1day": "Daily", "1week": "Weekly" };

export default function Tdci() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [style, setStyle] = useState("swing");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const [minScore, setMinScore] = useState<number | null>(null);
  const userMin = minScore ?? ((settings as any)?.tdciMinScore ?? 60);

  const meta = useQuery<{ symbols: string[]; profiles: ProfileInfo[] }>({ queryKey: ["/api/tdci/profiles"], staleTime: Infinity });
  const profile = meta.data?.profiles.find(p => p.key === style);

  const live = useQuery<any>({
    queryKey: ["/api/tdci", symbol, style],
    queryFn: () => apiRequest("GET", `/api/tdci/${symbol}?style=${style}`).then(r => r.json()),
    refetchInterval: style === "scalp" ? 60_000 : 5 * 60_000,
    staleTime: 30_000,
    retry: false,
  });

  const cal = useQuery<any>({
    queryKey: ["/api/tdci/calibration", symbol, style],
    queryFn: async () => {
      const r = await fetch(`/api/tdci/calibration/${symbol}/${style}`, { credentials: "include" });
      return r.status === 404 ? null : r.json();
    },
    staleTime: 60_000,
  });

  const overview = useQuery<any[]>({ queryKey: ["/api/tdci/calibrations"], staleTime: 30_000 });

  // Poll the background calibration job while it runs
  const job = useQuery<any>({
    queryKey: ["/api/tdci/job"],
    refetchInterval: q => (q.state.data?.running ? 3000 : false),
    staleTime: 0,
  });
  const running = !!job.data?.running;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) {
      qc.invalidateQueries({ queryKey: ["/api/tdci/calibrations"] });
      qc.invalidateQueries({ queryKey: ["/api/tdci/calibration"] });
      qc.invalidateQueries({ queryKey: ["/api/tdci"] });
      toast({ title: "Calibration finished", description: `${job.data?.done ?? 0} backtests complete.` });
    }
    wasRunning.current = running;
  }, [running]);

  const startJob = useMutation({
    mutationFn: (all: boolean) => apiRequest("POST", all ? "/api/tdci/calibrate-all" : "/api/tdci/calibrate", all ? {} : { symbol, style }).then(r => r.json()),
    onSuccess: (d) => { qc.setQueryData(["/api/tdci/job"], d); qc.invalidateQueries({ queryKey: ["/api/tdci/job"] }); },
    onError: (e: any) => toast({ title: "Could not start calibration", description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  const saveMin = useMutation({
    mutationFn: (v: number) => apiRequest("POST", "/api/settings", { tdciMinScore: v }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/settings"] }); toast({ title: "Auto-trade threshold saved" }); },
  });

  const t = live.data;
  const c = cal.data;
  const sel = "bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono";
  const DirIcon = t?.direction === "LONG" ? ArrowUpRight : t?.direction === "SHORT" ? ArrowDownRight : Minus;
  const symbols = meta.data?.symbols ?? SYMBOLS;
  const profiles = meta.data?.profiles ?? [];
  const cell = (sym: string, st: string) => overview.data?.find(o => o.symbol === sym && o.style === st);
  const activeItem = job.data?.items?.find((i: any) => i.status === "running");

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 md:pb-8 space-y-5">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2"><Gauge className="w-5 h-5 text-primary" /> Trade Depot Confluence Index</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Layers curated per trading style → one 0–100 conviction score, backtested with costs and judged out-of-sample.</p>
            </div>
            <div className="flex items-center gap-2">
              <select className={sel} value={symbol} onChange={e => setSymbol(e.target.value)} data-testid="tdci-symbol">
                {symbols.map(s => <option key={s}>{s}</option>)}
              </select>
              <Button variant="outline" size="sm" className="h-8" onClick={() => live.refetch()} disabled={live.isFetching}>
                <RefreshCw className={cn("w-3.5 h-3.5", live.isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Style selector */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {profiles.map(p => (
              <button
                key={p.key}
                onClick={() => setStyle(p.key)}
                data-testid={`tdci-style-${p.key}`}
                className={cn("text-left rounded-xl border p-3 transition-all", style === p.key ? "border-primary bg-primary/10" : "border-border bg-card/40 hover:border-primary/40")}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-sm">{p.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{TF_LABEL[p.interval]} · HTF {TF_LABEL[p.htf]}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug line-clamp-2">{p.description}</p>
              </button>
            ))}
          </div>

          {/* Live score */}
          <div className="grid lg:grid-cols-[320px_1fr] gap-4">
            <div className="bg-card/50 border border-border rounded-xl p-5 flex flex-col items-center text-center gap-3">
              {live.isLoading ? <p className="text-xs text-muted-foreground py-16">Scoring {symbol}…</p>
                : live.error ? <p className="text-xs text-red-500 py-16">{(live.error as Error).message.replace(/^\d+:\s*/, "")}</p>
                : t && (<>
                  <ScoreRing score={t.score} direction={t.direction} />
                  <div className={cn("flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold border",
                    t.direction === "LONG" ? "text-green-500 border-green-500/30 bg-green-500/10" : t.direction === "SHORT" ? "text-red-500 border-red-500/30 bg-red-500/10" : "text-muted-foreground border-border")}>
                    <DirIcon className="w-4 h-4" /> {t.direction}
                  </div>
                  <div className="grid grid-cols-2 gap-2 w-full text-[11px]">
                    <div className="bg-muted/20 rounded-lg p-2"><p className="text-muted-foreground text-[9px] uppercase">Layer agreement</p><p className="font-mono font-bold">{Math.round(t.agreement * 100)}%</p></div>
                    <div className="bg-muted/20 rounded-lg p-2"><p className="text-muted-foreground text-[9px] uppercase">Regime quality</p><p className="font-mono font-bold">{Math.round(t.regime * 100)}%</p></div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{TF_LABEL[t.interval] ?? t.interval} bar closed {t.time} UTC · weights: {t.weightsSource === "calibrated" ? `calibrated ${t.calibratedAt?.slice(0, 10)}` : "default (not calibrated)"}</p>
                  {t.historical && t.historical.trades >= 20 ? (
                    <div className="w-full text-left bg-background/50 border border-border/60 rounded-lg p-2.5 text-[11px]">
                      <p className="text-muted-foreground text-[9px] uppercase mb-0.5">What this score did out-of-sample</p>
                      <p className="font-mono">{t.historical.trades} trades · {t.historical.winRate}% win · <span className={rColor(t.historical.avgR)}>{fmtR(t.historical.avgR)}</span> avg after costs</p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Calibrate this style to see how the score has performed historically.</p>
                  )}
                </>)}
            </div>

            <div className="bg-card/50 border border-border rounded-xl p-5">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{profile?.label ?? ""} layers</p>
                {profile && <p className="text-[10px] font-mono text-muted-foreground">model: stop {profile.model.stopAtr}×ATR · target {profile.model.rr}R · max {profile.model.maxHold} bars{profile.sessionHours ? ` · ${profile.sessionHours[0]}–${profile.sessionHours[1]}h UTC` : ""}</p>}
              </div>
              <div className="space-y-3">
                {(t?.layers ?? []).map((l: Layer) => (
                  <div key={l.key} data-testid={`tdci-layer-${l.key}`}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold" title={profile?.layers.find(x => x.key === l.key)?.about}>{l.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {l.key === "regime" ? `quality ${Math.round(l.value * 100)}%` : `${l.value >= 0 ? "+" : ""}${l.value.toFixed(2)} · weight ${l.weight < 0 ? `${l.weight} (contrarian)` : l.weight}`}
                      </span>
                    </div>
                    <LayerBar value={l.value} regime={l.key === "regime"} />
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{l.detail}</p>
                  </div>
                ))}
                {!t && !live.isLoading && profile && (
                  <ul className="space-y-1.5">
                    {profile.layers.map(l => <li key={l.key} className="text-[11px]"><span className="font-semibold">{l.label}</span> <span className="text-muted-foreground">— {l.about}</span></li>)}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Calibration */}
          <div className="bg-card/50 border border-border rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold flex items-center gap-2"><FlaskConical className="w-4 h-4 text-primary" /> Calibration — does the score actually predict results?</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Scores every historical bar using only data available then, simulates this style's trade with spread, slippage and commission, learns weights on the first 70% and tests them on the last 30%.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => startJob.mutate(false)} disabled={running || startJob.isPending} data-testid="tdci-calibrate">
                  Calibrate {symbol} {profile?.label ?? ""}
                </Button>
                <Button size="sm" onClick={() => startJob.mutate(true)} disabled={running || startJob.isPending} data-testid="tdci-calibrate-all">
                  Calibrate all ({symbols.length * Math.max(1, profiles.length)})
                </Button>
              </div>
            </div>

            {job.data && job.data.total > 0 && (running || job.data.finishedAt) && (
              <div className="bg-background/40 border border-border/60 rounded-lg p-3 text-[11px]">
                <div className="flex justify-between mb-1.5">
                  <span className="font-semibold">{running ? "Calibrating in the background…" : "Last calibration run"}</span>
                  <span className="font-mono">{job.data.done}/{job.data.total}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${(job.data.done / job.data.total) * 100}%` }} />
                </div>
                {activeItem && <p className="text-muted-foreground mt-1.5">{activeItem.symbol} {activeItem.style}: {activeItem.message ?? "starting"}</p>}
                {job.data.items.filter((i: any) => i.status === "failed").slice(-3).map((i: any) => (
                  <p key={`${i.symbol}${i.style}`} className="text-red-500 mt-1">{i.symbol} {i.style} failed: {i.message}</p>
                ))}
                <p className="text-muted-foreground mt-1.5">Data is rate-limited to 8 requests/minute on the free plan, so a full run takes a while. You can leave this page.</p>
              </div>
            )}

            {!c ? (
              <p className="text-xs text-muted-foreground py-4">{cal.isLoading ? "Loading…" : "Not calibrated yet. Until it is, the score uses the style's default weights and auto-trade will not act on it."}</p>
            ) : (
              <>
                <div className={cn("flex gap-2 items-start rounded-lg p-3 text-xs border",
                  c.recommendedMin != null ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5")}>
                  {c.recommendedMin != null ? <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" /> : <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />}
                  <div>
                    <p className="font-semibold">{c.recommendedMin != null ? `Edge found: scores ≥ ${c.recommendedMin}` : "No proven edge — auto-trade stays off for this market and style"}</p>
                    <p className="text-muted-foreground mt-0.5">{c.verdict}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Calibrated {new Date(c.createdAt ?? c.generatedAt).toLocaleString()} · avg hold {c.avgHoldBars} bars · costs ≈ {Math.round((c.costShareOfRisk ?? 0) * 100)}% of risk per trade · spread {c.model.spreadPips} pips, slippage {c.model.slippagePips}, ${c.model.commissionPerLot}/lot
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <BucketTable title="In-sample (weights fit here)" p={c.inSample} highlight={c.recommendedMin} />
                  <BucketTable title="Out-of-sample — learned weights" p={c.outOfSample} highlight={c.recommendedMin} />
                  <BucketTable title="Out-of-sample — default weights" p={c.outOfSampleDefaultWeights} />
                </div>

                <div className="bg-background/40 border border-border/60 rounded-lg p-3">
                  <p className="text-xs font-semibold mb-2">Layer predictive power</p>
                  <table className="w-full text-[11px] font-mono">
                    <thead><tr className="text-muted-foreground text-[10px]">
                      <th className="text-left font-normal">Layer</th><th className="text-right font-normal">IC in-sample</th><th className="text-right font-normal">t-stat</th>
                      <th className="text-right font-normal">IC out-of-sample</th><th className="text-right font-normal">Weight used</th>
                    </tr></thead>
                    <tbody>
                      {Object.keys(c.ic).map((k: string) => (
                        <tr key={k}>
                          <td>{profile?.layers.find(l => l.key === k)?.label ?? k}</td>
                          <td className={cn("text-right", rColor(c.ic[k] * 10))}>{c.ic[k].toFixed(3)}</td>
                          <td className={cn("text-right", Math.abs(c.icTStat?.[k] ?? 0) >= 2 ? "font-bold text-primary" : "text-muted-foreground")}>{c.icTStat?.[k] ?? "—"}</td>
                          <td className={cn("text-right", rColor(c.icOutOfSample[k] * 10))}>{c.icOutOfSample[k].toFixed(3)}</td>
                          <td className="text-right">{c.weights[k] ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    IC = rank correlation between the layer and the next {profile?.model.icHorizon ?? "few"} bars of price movement. A layer only earns a learned weight with |t| ≥ 3 (strict, because ~200 combinations are tested);
                    {c.weightsLearned ? " significant negative layers are used contrarian." : " none were significant here, so the style's default weights are kept."}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Market × style matrix + threshold */}
          <div className="grid lg:grid-cols-[1fr_300px] gap-4">
            <div className="bg-card/50 border border-border rounded-xl p-5 overflow-x-auto">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Edge by market and style</p>
              <table className="w-full text-[11px] font-mono">
                <thead><tr className="text-muted-foreground text-[10px]">
                  <th className="text-left font-normal">Market</th>
                  {profiles.map(p => <th key={p.key} className="text-center font-normal">{p.label} <span className="opacity-60">{TF_LABEL[p.interval]}</span></th>)}
                </tr></thead>
                <tbody>
                  {symbols.map(sym => (
                    <tr key={sym}>
                      <td className="py-1">{sym}</td>
                      {profiles.map(p => {
                        const o = cell(sym, p.key);
                        return (
                          <td key={p.key} className="text-center py-1">
                            <button
                              onClick={() => { setSymbol(sym); setStyle(p.key); }}
                              title={o ? o.verdict : "Not calibrated"}
                              className={cn("px-2 py-0.5 rounded border w-full",
                                !o ? "border-border/50 text-muted-foreground/60" : o.recommendedMin != null ? "border-green-500/40 bg-green-500/10 text-green-500" : "border-border text-muted-foreground",
                                symbol === sym && style === p.key && "ring-1 ring-primary")}
                            >
                              {!o ? "—" : o.recommendedMin != null ? `≥${o.recommendedMin}` : fmtR(o.oosAnySignalAvgR)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-2">Green = proven out-of-sample edge (minimum score shown). Otherwise: average out-of-sample result per signal after costs.</p>
            </div>
            <div className="bg-card/50 border border-border rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Auto-trade threshold</p>
              <p className="text-[11px] text-muted-foreground">Generated signals use your strategy's style. They auto-execute only when that market and style have a proven edge <em>and</em> the TDCI is at least the higher of this number and the calibrated minimum, pointing the same way.</p>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} step={5} value={userMin} onChange={e => setMinScore(parseInt(e.target.value))} className="flex-1 accent-primary" />
                <span className="font-mono font-bold w-8 text-right">{userMin}</span>
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={() => saveMin.mutate(userMin)} disabled={saveMin.isPending}>Save threshold</Button>
            </div>
          </div>

          <div className="flex gap-2 text-[11px] text-muted-foreground bg-muted/20 rounded-lg p-3">
            <Info className="w-4 h-4 shrink-0" />
            <p>The TDCI measures how strongly independent evidence lines up — it is not a win probability. Layers without proven predictive power are still useful context, but only calibrated, out-of-sample results justify risking money. This is not financial advice.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
