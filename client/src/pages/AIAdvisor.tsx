import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Brain, Zap, TrendingUp, TrendingDown, RefreshCw,
  BookOpen, Star, AlertTriangle, CheckCircle2, ChevronRight,
  BarChart2, Target, FileText, Lightbulb, Award, Clock,
  ArrowUpRight, ArrowDownRight, Minus, Shield, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Tab = "signals" | "brain" | "reviews" | "report";

const CATEGORY_META: Record<string, { label: string; color: string; icon: typeof Zap }> = {
  entry_pattern:    { label: "Entry Pattern",    color: "bg-blue-500/15 text-blue-400 border-blue-500/20",   icon: Target },
  risk_rule:        { label: "Risk Rule",         color: "bg-amber-500/15 text-amber-400 border-amber-500/20", icon: Shield },
  pair_behavior:    { label: "Pair Behavior",     color: "bg-violet-500/15 text-violet-400 border-violet-500/20", icon: Activity },
  psychology:       { label: "Psychology",        color: "bg-rose-500/15 text-rose-400 border-rose-500/20",   icon: Brain },
  market_mechanics: { label: "Market Mechanics",  color: "bg-green-500/15 text-green-400 border-green-500/20", icon: BarChart2 },
  learned:          { label: "AI Learned",        color: "bg-primary/15 text-primary border-primary/20",      icon: Zap },
};

const GRADE_META: Record<string, { color: string; bg: string }> = {
  "A+": { color: "text-green-400",  bg: "bg-green-500/15 border-green-500/30" },
  "A":  { color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20" },
  "B":  { color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20"   },
  "C":  { color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
  "D":  { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  "F":  { color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20"     },
};

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 85 ? "bg-green-500" : value >= 75 ? "bg-blue-500" : value >= 65 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{value}%</span>
    </div>
  );
}

// ─── Signals Tab ─────────────────────────────────────────────────────────────
function SignalsTab() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "GBPJPY"];

  const { data: signals = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/signals"],
    queryFn: () => apiRequest("GET", "/api/signals").then(r => r.json()),
    refetchInterval: 120000,
  });

  const generate = useMutation({
    mutationFn: (symbol: string) =>
      apiRequest("POST", "/api/signals/generate", { symbol }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/signals"] }),
  });

  const latestBySymbol = SYMBOLS.reduce<Record<string, any>>((acc, sym) => {
    const match = signals.find((s: any) => s.symbol === sym);
    if (match) acc[sym] = match;
    return acc;
  }, {});

  const selectedSignal = selectedSymbol ? latestBySymbol[selectedSymbol] : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> Live AI Signals
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Multi-provider AI analysis · Knowledge-enhanced recommendations
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5 text-xs h-8">
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {SYMBOLS.map(sym => {
          const sig = latestBySymbol[sym];
          const isSelected = selectedSymbol === sym;
          const isGenerating = generate.isPending && generate.variables === sym;

          return (
            <motion.div key={sym} layout className="overflow-hidden">
              <button
                className={cn(
                  "w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left",
                  isSelected
                    ? "bg-primary/5 border-primary/40"
                    : "bg-card/40 border-border hover:border-border/80 hover:bg-card/60"
                )}
                onClick={() => setSelectedSymbol(isSelected ? null : sym)}
                data-testid={`signal-${sym}`}
              >
                <div className="w-16 font-mono font-bold text-sm shrink-0">{sym}</div>

                {sig ? (
                  <>
                    <div className={cn(
                      "px-2.5 py-0.5 rounded-md text-xs font-bold border shrink-0",
                      sig.action === "BUY"
                        ? "bg-green-500/15 text-green-400 border-green-500/30"
                        : sig.action === "SELL"
                        ? "bg-red-500/15 text-red-400 border-red-500/30"
                        : "bg-muted text-muted-foreground border-border"
                    )}>
                      {sig.action === "BUY" ? <><ArrowUpRight className="w-3 h-3 inline mr-0.5" />BUY</> : sig.action === "SELL" ? <><ArrowDownRight className="w-3 h-3 inline mr-0.5" />SELL</> : <><Minus className="w-3 h-3 inline mr-0.5" />HOLD</>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <ConfidenceBar value={sig.confidence} />
                    </div>
                    <div className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(sig.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1 text-xs text-muted-foreground">No signal yet</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-2 text-primary hover:bg-primary/10 shrink-0"
                      disabled={isGenerating}
                      onClick={e => { e.stopPropagation(); generate.mutate(sym); }}
                    >
                      {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Generate"}
                    </Button>
                  </>
                )}
              </button>

              <AnimatePresence>
                {isSelected && sig && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 p-4 rounded-xl bg-card/30 border border-border/50 space-y-3">
                      <p className="text-sm text-muted-foreground leading-relaxed">{sig.reasoning}</p>
                      <div className="grid grid-cols-3 gap-3">
                        {sig.entryPrice && (
                          <div className="bg-card/60 rounded-lg p-2.5">
                            <p className="text-[9px] text-muted-foreground uppercase mb-0.5">Entry</p>
                            <p className="text-sm font-mono font-bold">{sig.entryPrice}</p>
                          </div>
                        )}
                        {sig.stopLoss && (
                          <div className="bg-red-500/5 rounded-lg p-2.5 border border-red-500/10">
                            <p className="text-[9px] text-red-400 uppercase mb-0.5">Stop Loss</p>
                            <p className="text-sm font-mono font-bold text-red-400">{sig.stopLoss}</p>
                          </div>
                        )}
                        {sig.takeProfit && (
                          <div className="bg-green-500/5 rounded-lg p-2.5 border border-green-500/10">
                            <p className="text-[9px] text-green-400 uppercase mb-0.5">Take Profit</p>
                            <p className="text-sm font-mono font-bold text-green-400">{sig.takeProfit}</p>
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs gap-1.5"
                        onClick={() => generate.mutate(sym)}
                        disabled={generate.isPending}
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", generate.isPending && "animate-spin")} />
                        Refresh Signal
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Brain Tab ────────────────────────────────────────────────────────────────
function BrainTab() {
  const [filter, setFilter] = useState<string>("all");
  const { data: knowledge = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/ai/knowledge"],
    queryFn: () => apiRequest("GET", "/api/ai/knowledge").then(r => r.json()),
  });

  const categories = ["all", ...Array.from(new Set(knowledge.map((k: any) => k.category)))];
  const filtered = filter === "all" ? knowledge : knowledge.filter((k: any) => k.category === filter);

  const expertCount = knowledge.filter((k: any) => k.source === "expert").length;
  const learnedCount = knowledge.filter((k: any) => k.source === "trade_review").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" /> AI Knowledge Base
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {expertCount} expert lessons seeded · {learnedCount} learned from your trades
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card/40 border border-border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-primary">{knowledge.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Total Lessons</p>
        </div>
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{expertCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Expert Rules</p>
        </div>
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-primary">{learnedCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">AI Learned</p>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {categories.map(cat => {
          const meta = cat === "all" ? null : CATEGORY_META[cat];
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-all capitalize",
                filter === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/40 text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {cat === "all" ? "All" : (meta?.label ?? cat.replace("_", " "))}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading knowledge base…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((k: any) => {
            const meta = CATEGORY_META[k.category] ?? CATEGORY_META["learned"];
            const Icon = meta.icon;
            return (
              <motion.div
                key={k.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card/40 border border-border rounded-xl p-4 space-y-3"
                data-testid={`knowledge-${k.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{k.title}</span>
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold", meta.color)}>
                        {meta.label}
                      </span>
                      {k.source === "trade_review" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/20 font-semibold">
                          AI Learned
                        </span>
                      )}
                    </div>
                    {k.pairs && k.pairs.length > 0 && (
                      <div className="flex gap-1 mb-2 flex-wrap">
                        {k.pairs.map((p: string) => (
                          <span key={p} className="text-[9px] px-1 py-0.5 bg-muted rounded font-mono">{p}</span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground leading-relaxed">{k.content}</p>
                  </div>
                </div>
                <ConfidenceBar value={k.confidence} />
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Reviews Tab ──────────────────────────────────────────────────────────────
function ReviewsTab() {
  const { data: reviews = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/ai/reviews"],
    queryFn: () => apiRequest("GET", "/api/ai/reviews?limit=30").then(r => r.json()),
    refetchInterval: 30000,
  });

  const avgGrade = reviews.length > 0
    ? Math.round(reviews.reduce((s: number, r: any) => s + r.gradeScore, 0) / reviews.length)
    : 0;

  const mistakeCounts = reviews.reduce((acc: Record<string, number>, r: any) => {
    if (r.mistakeType) acc[r.mistakeType] = (acc[r.mistakeType] || 0) + 1;
    return acc;
  }, {});

  const MISTAKE_LABELS: Record<string, string> = {
    early_exit: "Early Exit",
    oversize: "Oversize",
    no_sl: "No Stop Loss",
    revenge: "Revenge Trade",
    fomo: "FOMO Entry",
    overtrading: "Overtrading",
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-lg flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" /> AI Trade Reviews
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          AI grades every closed trade and extracts lessons automatically
        </p>
      </div>

      {reviews.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card/40 border border-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{reviews.length}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Reviews</p>
          </div>
          <div className="bg-card/40 border border-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{avgGrade}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Avg Score</p>
          </div>
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-400">
              {reviews.filter((r: any) => ["A+", "A"].includes(r.grade)).length}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">A Grades</p>
          </div>
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-red-400">
              {reviews.filter((r: any) => ["D", "F"].includes(r.grade)).length}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Need Work</p>
          </div>
        </div>
      )}

      {Object.keys(mistakeCounts).length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-400 mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Recurring Mistakes
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(mistakeCounts).sort(([,a],[,b]) => b-a).map(([type, count]) => (
              <div key={type} className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1">
                <span className="text-xs text-amber-400">{MISTAKE_LABELS[type] ?? type}</span>
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 rounded px-1">{count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading reviews…
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold">No reviews yet</p>
          <p className="text-sm mt-1">Close trades with an AI provider connected to get automatic reviews.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r: any) => {
            const gradeM = GRADE_META[r.grade] ?? GRADE_META["C"];
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card/40 border border-border rounded-xl p-4 space-y-3"
                data-testid={`review-${r.id}`}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={cn("text-xl font-black w-10 h-10 rounded-xl border flex items-center justify-center shrink-0", gradeM.bg, gradeM.color)}>
                    {r.grade}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm font-mono">{r.symbol}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border",
                        r.direction === "long" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                      )}>
                        {r.direction === "long" ? "↑ LONG" : "↓ SHORT"}
                      </span>
                      <span className={cn("text-xs font-bold", r.profit >= 0 ? "text-green-400" : "text-red-400")}>
                        {r.profit >= 0 ? "+" : ""}${r.profit.toFixed(2)}
                      </span>
                      {r.pips != null && (
                        <span className="text-[10px] text-muted-foreground">{r.pips >= 0 ? "+" : ""}{r.pips} pips</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(r.createdAt).toLocaleDateString()} · {r.aiProvider || "AI"}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">{r.review}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {r.strengths?.length > 0 && (
                    <div className="bg-green-500/5 border border-green-500/15 rounded-lg p-2.5">
                      <p className="text-[9px] text-green-400 font-semibold mb-1.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Strengths
                      </p>
                      <ul className="space-y-0.5">
                        {r.strengths.map((s: string, i: number) => (
                          <li key={i} className="text-[10px] text-green-300">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.improvements?.length > 0 && (
                    <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg p-2.5">
                      <p className="text-[9px] text-amber-400 font-semibold mb-1.5 flex items-center gap-1">
                        <Lightbulb className="w-3 h-3" /> Improvements
                      </p>
                      <ul className="space-y-0.5">
                        {r.improvements.map((s: string, i: number) => (
                          <li key={i} className="text-[10px] text-amber-300">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {r.lessonLearned && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5 flex items-start gap-2">
                    <Brain className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <p className="text-[10px] text-primary/90 leading-relaxed">{r.lessonLearned}</p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Report Tab ───────────────────────────────────────────────────────────────
function ReportTab() {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    setReport(null);
    try {
      const res = await apiRequest("GET", "/api/ai/weekly-report");
      const data = await res.json();
      setReport(data.report || "No trades to analyze.");
    } catch {
      setReport("Failed to generate report. Make sure an AI provider is connected in Settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-bold text-lg flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" /> Weekly Performance Report
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          AI coach analyzes your last 7 days — strengths, mistakes, action plan
        </p>
      </div>

      <div className="bg-card/40 border border-border rounded-xl p-5 text-center space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <BarChart2 className="w-8 h-8 text-primary" />
        </div>
        <div>
          <p className="font-semibold">AI Weekly Coach Report</p>
          <p className="text-xs text-muted-foreground mt-1">
            Requires an AI provider connected in Settings and at least 1 closed trade this week.
          </p>
        </div>
        <Button onClick={generate} disabled={loading} className="gap-2 w-full max-w-xs">
          {loading
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating report…</>
            : <><BarChart2 className="w-4 h-4" /> Generate This Week's Report</>
          }
        </Button>
      </div>

      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card/40 border border-border rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              <h3 className="font-bold">Your Weekly Report</h3>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </span>
            </div>
            <div className="prose prose-sm max-w-none">
              {report.split("\n\n").filter(Boolean).map((para, i) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-3">{para}</p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AIAdvisor() {
  const [tab, setTab] = useState<Tab>("signals");

  const TABS: { key: Tab; label: string; icon: typeof Bot }[] = [
    { key: "signals", label: "Live Signals", icon: Zap },
    { key: "brain",   label: "AI Brain",     icon: Brain },
    { key: "reviews", label: "Trade Reviews",icon: FileText },
    { key: "report",  label: "Weekly Report",icon: BarChart2 },
  ];

  return (
    <AppLayout>
      <div className="flex-1 overflow-hidden flex flex-col h-full bg-background">
        <div className="h-auto border-b border-border px-4 md:px-6 py-4 bg-card/40 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xl font-bold flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              AI Trading Advisor
            </motion.h1>
          </div>

          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  data-testid={`tab-ai-${t.key}`}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0",
                    tab === t.key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          <div className="max-w-3xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {tab === "signals" && <SignalsTab />}
                {tab === "brain"   && <BrainTab />}
                {tab === "reviews" && <ReviewsTab />}
                {tab === "report"  && <ReportTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
