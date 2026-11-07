import { calcProfit, calcPips } from "@shared/pips";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, BookOpen, TrendingUp, TrendingDown, DollarSign,
  Target, BarChart2, Edit2, Check, X, Filter, ChevronDown,
  Award, AlertTriangle, Smile, Meh, Frown, Clock, Download, CalendarDays, List,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { TradeJournal } from "@shared/schema";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";

const SYMBOLS = ["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","GBPJPY","XAUUSD","USDCHF","NZDUSD","EURGBP"];

function PLCalendarHeatmap({ trades }: { trades: TradeJournal[] }) {
  const today = new Date();
  const months = 6;
  const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

  const dayMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of trades) {
      if (!t.closedAt || !t.profitLoss) continue;
      const d = new Date(t.closedAt).toISOString().split("T")[0];
      m[d] = (m[d] || 0) + (t.profitLoss || 0);
    }
    return m;
  }, [trades]);

  const getColor = (pl: number | undefined) => {
    if (pl === undefined) return "bg-muted/30";
    if (pl > 200) return "bg-pos";
    if (pl > 50) return "bg-pos/70";
    if (pl > 0) return "bg-pos/50";
    if (pl < -200) return "bg-neg";
    if (pl < -50) return "bg-neg/70";
    if (pl < 0) return "bg-neg/50";
    return "bg-muted/40";
  };

  const days: { date: string; pl: number | undefined }[] = [];
  let cur = new Date(startDate);
  while (cur <= today) {
    const d = cur.toISOString().split("T")[0];
    days.push({ date: d, pl: dayMap[d] });
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }

  const weeks: { date: string; pl: number | undefined }[][] = [];
  let week: { date: string; pl: number | undefined }[] = [];
  const firstDay = new Date(startDate).getDay();
  for (let i = 0; i < firstDay; i++) week.push({ date: "", pl: undefined });
  for (const d of days) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) { while (week.length < 7) week.push({ date: "", pl: undefined }); weeks.push(week); }

  return (
    <div className="bg-card/50 border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" /> P&L Calendar</h3>
      <div className="flex gap-1 overflow-x-auto pb-2">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="w-8 shrink-0 text-[9px] text-muted-foreground text-center mb-1">{d}</div>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {weeks.map((wk, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {wk.map((cell, ci) => (
              <div
                key={ci}
                title={cell.date ? `${cell.date}: ${cell.pl !== undefined ? `$${cell.pl.toFixed(2)}` : "No trades"}` : ""}
                className={cn("w-8 h-8 rounded-sm transition-all cursor-default", cell.date ? getColor(cell.pl) : "opacity-0")}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-pos" /> Large gain</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-pos/50" /> Small gain</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-neg/50" /> Small loss</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-neg" /> Large loss</div>
      </div>
    </div>
  );
}
const EMOTIONS = [
  { id: "confident", label: "Confident", icon: Smile, color: "text-pos" },
  { id: "neutral", label: "Neutral", icon: Meh, color: "text-warn" },
  { id: "anxious", label: "Anxious", icon: Frown, color: "text-neg" },
  { id: "greedy", label: "Greedy", icon: AlertTriangle, color: "text-warn" },
  { id: "fomo", label: "FOMO", icon: Clock, color: "text-info" },
];

type FormState = {
  symbol: string; direction: string; entryPrice: string; exitPrice: string;
  lots: string; stopLoss: string; takeProfit: string; notes: string;
  emotion: string; mode: string; outcome: string;
};

const emptyForm = (): FormState => ({
  symbol: "EURUSD", direction: "long", entryPrice: "", exitPrice: "", lots: "0.1",
  stopLoss: "", takeProfit: "", notes: "", emotion: "neutral", mode: "paper", outcome: "open",
});

function calcPL(entry: Partial<TradeJournal>) {
  if (!entry.exitPrice || !entry.entryPrice) return null;
  const side = entry.direction === "long" ? "BUY" : "SELL";
  const symbol = entry.symbol || "EURUSD";
  return {
    pips: calcPips(side, entry.entryPrice, entry.exitPrice, symbol),
    pl: calcProfit(side, entry.entryPrice, entry.exitPrice, symbol, entry.lots || 0.1),
  };
}

function MetricCard({ label, value, sub, color = "" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-xl font-bold", color)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Journal() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [filterMode, setFilterMode] = useState<"all" | "paper" | "live">("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [journalView, setJournalView] = useState<"list" | "calendar">("list");

  const exportCSV = () => {
    window.open("/api/export/journal", "_blank");
  };

  const { data: trades = [], isLoading } = useQuery<TradeJournal[]>({
    queryKey: ["/api/journal"],
  });

  const createMut = useMutation({
    mutationFn: async (data: Partial<FormState>) => {
      const payload: any = {
        ...data,
        entryPrice: parseFloat(data.entryPrice || "0"),
        lots: parseFloat(data.lots || "0.1"),
      };
      if (data.exitPrice) payload.exitPrice = parseFloat(data.exitPrice);
      if (data.stopLoss) payload.stopLoss = parseFloat(data.stopLoss);
      if (data.takeProfit) payload.takeProfit = parseFloat(data.takeProfit);
      const calc = calcPL({ ...payload });
      if (calc && data.exitPrice) {
        payload.profitLoss = calc.pl;
        payload.pips = calc.pips;
        payload.outcome = calc.pl > 0 ? "win" : calc.pl < 0 ? "loss" : "breakeven";
        payload.closedAt = new Date().toISOString();
      }
      return apiRequest("POST", "/api/journal", payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/journal"] }); setShowForm(false); setForm(emptyForm()); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/journal/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/journal"] }); setEditId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/journal/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/journal"] }),
  });

  const filtered = trades.filter(t => filterMode === "all" || t.mode === filterMode);
  const closed = filtered.filter(t => t.outcome !== "open");
  const wins = closed.filter(t => t.outcome === "win");
  const winRate = closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(0) : "—";
  const totalPL = closed.reduce((s, t) => s + (t.profitLoss || 0), 0);
  const totalPips = closed.reduce((s, t) => s + (t.pips || 0), 0);
  const avgRR = closed.length > 0
    ? (closed.filter(t => t.stopLoss && t.takeProfit && t.entryPrice).reduce((s, t) => {
        const risk = Math.abs((t.entryPrice || 0) - (t.stopLoss || 0));
        const reward = Math.abs((t.takeProfit || 0) - (t.entryPrice || 0));
        return s + (risk > 0 ? reward / risk : 0);
      }, 0) / closed.length).toFixed(2)
    : "—";

  const equityCurve = (() => {
    let bal = 0;
    return closed.sort((a, b) => new Date(a.closedAt || 0).getTime() - new Date(b.closedAt || 0).getTime())
      .map((t, i) => { bal += t.profitLoss || 0; return { trade: i + 1, pl: parseFloat(bal.toFixed(2)) }; });
  })();

  const f = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto w-full px-4 py-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2.5">
                <BookOpen className="w-6 h-6 text-primary" /> Trade Journal
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">Log paper and live trades. Track your edge.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-muted/40 rounded-lg p-0.5 border border-border text-xs">
                {(["all","paper","live"] as const).map(m => (
                  <button key={m} onClick={() => setFilterMode(m)}
                    className={cn("px-3 py-1.5 rounded-md font-medium capitalize transition-all",
                      filterMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  >{m}</button>
                ))}
              </div>
              <div className="flex bg-muted/40 rounded-lg p-0.5 border border-border">
                <button onClick={() => setJournalView("list")}
                  className={cn("w-8 h-7 rounded flex items-center justify-center transition-all", journalView === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  title="List view" data-testid="button-journal-list"><List className="w-3.5 h-3.5" /></button>
                <button onClick={() => setJournalView("calendar")}
                  className={cn("w-8 h-7 rounded flex items-center justify-center transition-all", journalView === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  title="Calendar heatmap" data-testid="button-journal-calendar"><CalendarDays className="w-3.5 h-3.5" /></button>
              </div>
              <Button variant="outline" size="sm" onClick={exportCSV} className="h-9 gap-1.5 text-xs" data-testid="button-export-csv">
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
              <Button onClick={() => setShowForm(!showForm)} className="gap-1.5" data-testid="button-new-trade">
                <Plus className="w-4 h-4" /> Log Trade
              </Button>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Trades" value={String(closed.length)} sub={`${trades.filter(t=>t.outcome==="open").length} open`} />
            <MetricCard label="Win Rate" value={winRate === "—" ? "—" : `${winRate}%`}
              sub={`${wins.length}W / ${closed.length - wins.length}L`}
              color={Number(winRate) >= 50 ? "text-pos" : "text-neg"} />
            <MetricCard label="Total P&L" value={totalPL === 0 ? "$0.00" : `${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(2)}`}
              sub={`${totalPips >= 0 ? "+" : ""}${totalPips.toFixed(1)} pips`}
              color={totalPL > 0 ? "text-pos" : totalPL < 0 ? "text-neg" : ""} />
            <MetricCard label="Avg Risk:Reward" value={avgRR === "—" ? "—" : `1:${avgRR}`}
              sub={Number(avgRR) >= 2 ? "Excellent" : Number(avgRR) >= 1 ? "Good" : "Below target"} />
          </div>

          {/* Equity curve */}
          {equityCurve.length > 1 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" />Cumulative P&L</p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="trade" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" label={{ value: "Trade #", position: "insideBottom", offset: -2, fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "P&L"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="pl" stroke={totalPL >= 0 ? "var(--rj-pos)" : "var(--rj-neg)"} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Calendar Heatmap View */}
          {journalView === "calendar" && (
            <PLCalendarHeatmap trades={filtered} />
          )}

          {/* Add Trade Form */}
          <AnimatePresence>
            {showForm && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-sm">Log New Trade</h2>
                  <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Mode</Label>
                    <div className="flex mt-1 gap-1">
                      {["paper","live"].map(m => (
                        <button key={m} onClick={() => f("mode", m)} className={cn("flex-1 py-1.5 rounded-md text-xs font-medium border transition-all capitalize",
                          form.mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Symbol</Label>
                    <select value={form.symbol} onChange={e => f("symbol", e.target.value)}
                      className="w-full mt-1 h-9 rounded-md border border-border bg-background px-2 text-xs">
                      {SYMBOLS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Direction</Label>
                    <div className="flex mt-1 gap-1">
                      {["long","short"].map(d => (
                        <button key={d} onClick={() => f("direction", d)} className={cn("flex-1 py-1.5 rounded-md text-xs font-medium border transition-all capitalize",
                          form.direction === d
                            ? d === "long" ? "border-pos bg-pos/10 text-pos" : "border-neg bg-neg/10 text-neg"
                            : "border-border text-muted-foreground hover:text-foreground")}>
                          {d === "long" ? "▲ Long" : "▼ Short"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Lots</Label>
                    <Input value={form.lots} onChange={e => f("lots", e.target.value)} className="mt-1 h-9 text-xs" placeholder="0.01" type="number" step="0.01" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Entry Price *</Label>
                    <Input value={form.entryPrice} onChange={e => f("entryPrice", e.target.value)} className="mt-1 h-9 text-xs" placeholder="1.08500" type="number" step="0.00001" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Exit Price</Label>
                    <Input value={form.exitPrice} onChange={e => f("exitPrice", e.target.value)} className="mt-1 h-9 text-xs" placeholder="Leave blank if open" type="number" step="0.00001" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Stop Loss</Label>
                    <Input value={form.stopLoss} onChange={e => f("stopLoss", e.target.value)} className="mt-1 h-9 text-xs" placeholder="1.08200" type="number" step="0.00001" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Take Profit</Label>
                    <Input value={form.takeProfit} onChange={e => f("takeProfit", e.target.value)} className="mt-1 h-9 text-xs" placeholder="1.09200" type="number" step="0.00001" />
                  </div>
                </div>
                {form.entryPrice && form.exitPrice && (
                  <div className="bg-muted/30 rounded-lg p-3 text-xs border border-border">
                    {(() => { const r = calcPL(form as any); if (!r) return null;
                      return <p>Estimated: <span className={r.pl >= 0 ? "text-pos font-bold" : "text-neg font-bold"}>{r.pl >= 0 ? "+" : ""}${r.pl}</span> ({r.pips >= 0 ? "+" : ""}{r.pips} pips)</p>;
                    })()}
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">How did you feel?</Label>
                  <div className="flex gap-2 flex-wrap">
                    {EMOTIONS.map(e => (
                      <button key={e.id} onClick={() => f("emotion", e.id)}
                        className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all",
                          form.emotion === e.id ? `border-current bg-current/10 ${e.color}` : "border-border text-muted-foreground hover:text-foreground")}>
                        <e.icon className="w-3.5 h-3.5" />{e.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Notes / Reasoning</Label>
                  <textarea value={form.notes} onChange={e => f("notes", e.target.value)}
                    className="w-full mt-1 rounded-md border border-border bg-background p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    rows={2} placeholder="Why did you take this trade? What was your setup?" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setForm(emptyForm()); }}>Cancel</Button>
                  <Button size="sm" onClick={() => createMut.mutate(form)} disabled={!form.entryPrice || createMut.isPending} data-testid="button-save-trade">
                    {createMut.isPending ? "Saving…" : "Save Trade"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trade List */}
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading journal…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground text-sm">No trades logged yet</p>
              <p className="text-xs text-muted-foreground">Click "Log Trade" to start tracking your performance</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{filtered.length} Trades</p>
              {filtered.map(trade => {
                const isWin = trade.outcome === "win";
                const isLoss = trade.outcome === "loss";
                const isOpen = trade.outcome === "open";
                const emotion = EMOTIONS.find(e => e.id === trade.emotion);
                return (
                  <motion.div key={trade.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 group hover:border-border/80 transition-colors"
                    data-testid={`trade-row-${trade.id}`}
                  >
                    {/* Direction indicator */}
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      trade.direction === "long" ? "bg-pos/10" : "bg-neg/10")}>
                      {trade.direction === "long"
                        ? <TrendingUp className="w-4 h-4 text-pos" />
                        : <TrendingDown className="w-4 h-4 text-neg" />}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{trade.symbol}</span>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold",
                          trade.mode === "paper" ? "bg-info/10 text-info" : "bg-warn/10 text-warn")}>
                          {trade.mode.toUpperCase()}
                        </span>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold",
                          isWin ? "bg-pos/10 text-pos" : isLoss ? "bg-neg/10 text-neg" : "bg-muted text-muted-foreground")}>
                          {isOpen ? "OPEN" : isWin ? "WIN" : isLoss ? "LOSS" : "B/E"}
                        </span>
                        {emotion && <span title={emotion.label}><emotion.icon className={cn("w-3.5 h-3.5", emotion.color)} /></span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span>Entry: <span className="text-foreground font-medium">{trade.entryPrice}</span></span>
                        {trade.exitPrice && <span>Exit: <span className="text-foreground font-medium">{trade.exitPrice}</span></span>}
                        <span>{trade.lots}L</span>
                        {trade.openedAt && <span>{format(new Date(trade.openedAt), "MMM d, HH:mm")}</span>}
                      </div>
                      {trade.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{trade.notes}</p>}
                    </div>

                    {/* P&L */}
                    <div className="text-right shrink-0">
                      {trade.profitLoss != null && (
                        <p className={cn("font-bold text-sm", trade.profitLoss > 0 ? "text-pos" : trade.profitLoss < 0 ? "text-neg" : "text-muted-foreground")}>
                          {trade.profitLoss > 0 ? "+" : ""}${trade.profitLoss.toFixed(2)}
                        </p>
                      )}
                      {trade.pips != null && (
                        <p className={cn("text-[11px]", trade.pips > 0 ? "text-pos/70" : "text-neg/70")}>
                          {trade.pips > 0 ? "+" : ""}{trade.pips.toFixed(1)} pips
                        </p>
                      )}
                      {isOpen && <p className="text-[11px] text-warn">open</p>}
                    </div>

                    {/* Delete */}
                    <button onClick={() => deleteMut.mutate(trade.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-neg shrink-0"
                      data-testid={`button-delete-trade-${trade.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  );
}
