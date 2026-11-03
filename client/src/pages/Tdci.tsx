import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/hooks/useApi";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Gauge, RefreshCw, FlaskConical, Info, ShieldCheck, ShieldAlert, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "GBPJPY", "XAUUSD"];
const INTERVALS = [{ v: "4h", l: "H4" }, { v: "1h", l: "H1" }];

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

export default function Tdci() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [interval, setInterval] = useState("4h");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const [minScore, setMinScore] = useState<number | null>(null);
  const userMin = minScore ?? ((settings as any)?.tdciMinScore ?? 60);

  const live = useQuery<any>({
    queryKey: ["/api/tdci", symbol, interval],
    queryFn: () => apiRequest("GET", `/api/tdci/${symbol}?interval=${interval}`).then(r => r.json()),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: false,
  });

  const cal = useQuery<any>({
    queryKey: ["/api/tdci/calibration", symbol, interval],
    queryFn: async () => {
      const r = await fetch(`/api/tdci/calibration/${symbol}/${interval}`, { credentials: "include" });
      return r.status === 404 ? null : r.json();
    },
    staleTime: 60_000,
  });

  const overview = useQuery<any[]>({ queryKey: ["/api/tdci/calibrations"], staleTime: 60_000 });

  const calibrate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tdci/calibrate", { symbol, interval }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tdci/calibration", symbol, interval] });
      qc.invalidateQueries({ queryKey: ["/api/tdci", symbol, interval] });
      qc.invalidateQueries({ queryKey: ["/api/tdci/calibrations"] });
      toast({ title: "Calibration complete", description: `${symbol} ${interval} backtested on years of history.` });
    },
    onError: (e: any) => toast({ title: "Calibration failed", description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  const saveMin = useMutation({
    mutationFn: (v: number) => apiRequest("POST", "/api/settings", { tdciMinScore: v }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/settings"] }); toast({ title: "Auto-trade threshold saved" }); },
  });

  const t = live.data;
  const c = cal.data;
  const sel = "bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono";
  const DirIcon = t?.direction === "LONG" ? ArrowUpRight : t?.direction === "SHORT" ? ArrowDownRight : Minus;

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 md:pb-8 space-y-5">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2"><Gauge className="w-5 h-5 text-primary" /> Trade Depot Confluence Index</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Seven rule-based layers → one 0–100 conviction score, backtested with costs and judged out-of-sample.</p>
            </div>
            <div className="flex items-center gap-2">
              <select className={sel} value={symbol} onChange={e => setSymbol(e.target.value)} data-testid="tdci-symbol">
                {SYMBOLS.map(s => <option key={s}>{s}</option>)}
              </select>
              <select className={sel} value={interval} onChange={e => setInterval(e.target.value)} data-testid="tdci-interval">
                {INTERVALS.map(i => <option key={i.v} value={i.v}>{i.l}</option>)}
              </select>
              <Button variant="outline" size="sm" className="h-8" onClick={() => live.refetch()} disabled={live.isFetching}>
                <RefreshCw className={cn("w-3.5 h-3.5", live.isFetching && "animate-spin")} />
              </Button>
            </div>
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
                  <p className="text-[10px] text-muted-foreground">Bar closed {t.time} UTC · weights: {t.weightsSource === "calibrated" ? `calibrated ${t.calibratedAt?.slice(0, 10)}` : "default (not calibrated)"}</p>
                  {t.historical && t.historical.trades >= 20 ? (
                    <div className="w-full text-left bg-background/50 border border-border/60 rounded-lg p-2.5 text-[11px]">
                      <p className="text-muted-foreground text-[9px] uppercase mb-0.5">What this score did out-of-sample</p>
                      <p className="font-mono">{t.historical.trades} trades · {t.historical.winRate}% win · <span className={rColor(t.historical.avgR)}>{fmtR(t.historical.avgR)}</span> avg after costs</p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Calibrate to see how this score has performed historically.</p>
                  )}
                </>)}
            </div>

            <div className="bg-card/50 border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">The seven layers</p>
              <div className="space-y-3">
                {(t?.layers ?? []).map((l: Layer) => (
                  <div key={l.key} data-testid={`tdci-layer-${l.key}`}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold">{l.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {l.key === "regime" ? `quality ${Math.round(l.value * 100)}%` : `${l.value >= 0 ? "+" : ""}${l.value.toFixed(2)} · weight ${l.weight < 0 ? `${l.weight} (contrarian)` : l.weight}`}
                      </span>
                    </div>
                    <LayerBar value={l.value} regime={l.key === "regime"} />
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{l.detail}</p>
                  </div>
                ))}
                {!t && !live.isLoading && <p className="text-xs text-muted-foreground">No reading.</p>}
              </div>
            </div>
          </div>

          {/* Calibration */}
          <div className="bg-card/50 border border-border rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold flex items-center gap-2"><FlaskConical className="w-4 h-4 text-primary" /> Calibration — does the score actually predict results?</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Scores every historical bar using only data available then, simulates the trade (stop 1.5×ATR, target 2R, spread + slippage + commission), learns weights on the first 70% and tests them on the last 30%.</p>
              </div>
              <Button size="sm" onClick={() => calibrate.mutate()} disabled={calibrate.isPending} data-testid="tdci-calibrate">
                {calibrate.isPending ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Backtesting…</> : `Calibrate ${symbol} ${interval.toUpperCase()}`}
              </Button>
            </div>

            {!c ? (
              <p className="text-xs text-muted-foreground py-4">{cal.isLoading ? "Loading…" : "Not calibrated yet. Until it is, the score uses default weights and auto-trade will not act on it."}</p>
            ) : (
              <>
                <div className={cn("flex gap-2 items-start rounded-lg p-3 text-xs border",
                  c.recommendedMin != null ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5")}>
                  {c.recommendedMin != null ? <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" /> : <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />}
                  <div>
                    <p className="font-semibold">{c.recommendedMin != null ? `Edge found: scores ≥ ${c.recommendedMin}` : "No proven edge — auto-trade stays off for this market"}</p>
                    <p className="text-muted-foreground mt-0.5">{c.verdict}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Calibrated {new Date(c.createdAt ?? c.generatedAt).toLocaleString()} · avg hold {c.avgHoldBars} bars · spread {c.model.spreadPips} pips, slippage {c.model.slippagePips}, ${c.model.commissionPerLot}/lot</p>
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
                          <td className="capitalize">{k}</td>
                          <td className={cn("text-right", rColor(c.ic[k] * 10))}>{c.ic[k].toFixed(3)}</td>
                          <td className={cn("text-right", Math.abs(c.icTStat?.[k] ?? 0) >= 2 ? "font-bold" : "text-muted-foreground")}>{c.icTStat?.[k] ?? "—"}</td>
                          <td className={cn("text-right", rColor(c.icOutOfSample[k] * 10))}>{c.icOutOfSample[k].toFixed(3)}</td>
                          <td className="text-right">{c.weights[k]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    IC = rank correlation between the layer and the next {interval === "4h" ? "6 bars" : "12 bars"} of price movement. A layer only earns a learned weight with |t| ≥ 2;
                    {c.weightsLearned ? " negative significant layers are used contrarian." : " none were significant here, so the default weights are kept."}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Overview + auto-trade threshold */}
          <div className="grid lg:grid-cols-[1fr_320px] gap-4">
            <div className="bg-card/50 border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All calibrated markets</p>
              {!overview.data?.length ? <p className="text-xs text-muted-foreground">None yet.</p> : (
                <table className="w-full text-[11px] font-mono">
                  <thead><tr className="text-muted-foreground text-[10px]">
                    <th className="text-left font-normal">Market</th><th className="text-right font-normal">OOS avg / signal</th>
                    <th className="text-right font-normal">Score→result</th><th className="text-right font-normal">Edge</th>
                  </tr></thead>
                  <tbody>
                    {overview.data.map(o => (
                      <tr key={`${o.symbol}${o.interval}`} className="cursor-pointer hover:bg-muted/30" onClick={() => { setSymbol(o.symbol); setInterval(o.interval); }}>
                        <td>{o.symbol} {o.interval.toUpperCase()}</td>
                        <td className={cn("text-right", rColor(o.oosAnySignalAvgR))}>{fmtR(o.oosAnySignalAvgR)}</td>
                        <td className="text-right">{o.oosMonotonic}</td>
                        <td className={cn("text-right", o.recommendedMin != null ? "text-green-500" : "text-muted-foreground")}>{o.recommendedMin != null ? `≥ ${o.recommendedMin}` : "none"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="bg-card/50 border border-border rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Auto-trade threshold</p>
              <p className="text-[11px] text-muted-foreground">Generated signals only auto-execute when the market has a proven edge <em>and</em> the TDCI is at least the higher of this number and the calibrated minimum, pointing the same way.</p>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} step={5} value={userMin} onChange={e => setMinScore(parseInt(e.target.value))} className="flex-1 accent-primary" />
                <span className="font-mono font-bold w-8 text-right">{userMin}</span>
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={() => saveMin.mutate(userMin)} disabled={saveMin.isPending}>Save threshold</Button>
            </div>
          </div>

          <div className="flex gap-2 text-[11px] text-muted-foreground bg-muted/20 rounded-lg p-3">
            <Info className="w-4 h-4 shrink-0" />
            <p>The TDCI measures how strongly independent evidence lines up — it is not a win probability. A layer that has shown no predictive power is still useful context, but only calibrated, out-of-sample results justify risking money. This is not financial advice.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
