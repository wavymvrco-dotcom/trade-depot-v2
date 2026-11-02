import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target, Search, Zap, Save, RotateCcw, Bot, Shield, CheckCircle2,
  AlertTriangle, TrendingUp, TrendingDown, RefreshCw, DollarSign,
  BarChart2, Info, XCircle, Lightbulb, Sparkles, ChevronRight, FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useActiveStrategy, useSaveStrategy, usePositions, usePositionHistory, useSettings } from "@/hooks/useApi";
import { apiRequest } from "@/lib/queryClient";
import type { Position, Strategy as StrategyType } from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  aggressive: "Aggressive Growth",
  balanced: "Balanced Growth",
  conservative: "Capital Preservation",
  income: "Daily Income",
};

const STYLE_LABELS: Record<string, string> = {
  scalp: "Scalping",
  day: "Day Trading",
  swing: "Swing Trading",
  position: "Position / Weekly",
};

const STYLE_META: Record<string, { horizon: string; bars: string; holdTime: string; minAccount: number; defaultStop: number }> = {
  scalp:    { horizon: "15–60 min",  bars: "1m–5m",       holdTime: "Minutes",     minAccount: 500,   defaultStop: 10  },
  day:      { horizon: "Today",      bars: "15m–1H",      holdTime: "Hours",       minAccount: 1000,  defaultStop: 20  },
  swing:    { horizon: "3–7 days",   bars: "4H–Daily",    holdTime: "Days",        minAccount: 500,   defaultStop: 50  },
  position: { horizon: "2–4 weeks",  bars: "Daily–Weekly",holdTime: "Weeks",       minAccount: 2000,  defaultStop: 100 },
};

// ─── Position sizing math ─────────────────────────────────────────────────────

function calcPositionSize(accountSize: number, riskPercent: number, stopPips: number, symbol: string) {
  const riskDollars = accountSize * (riskPercent / 100);
  const pipValuePerLot = symbol === "XAUUSD" ? 10 : symbol.includes("JPY") ? 6.5 : 10;
  const lotsRaw = riskDollars / (stopPips * pipValuePerLot);
  const lots = Math.max(0.01, Math.round(lotsRaw * 100) / 100);
  const category = lots >= 1 ? "Standard" : lots >= 0.1 ? "Mini" : "Micro";
  const actualRisk = lots * stopPips * pipValuePerLot;
  return { riskDollars, lots, category, actualRisk };
}

function getRiskWarnings(
  accountSize: number,
  riskPercent: number,
  maxPositions: number,
  style: string,
  lots: number
): Array<{ level: "error" | "warn" | "info"; message: string }> {
  const warnings: Array<{ level: "error" | "warn" | "info"; message: string }> = [];
  const meta = STYLE_META[style] || STYLE_META.swing;
  const concurrentRisk = riskPercent * maxPositions;

  if (accountSize < meta.minAccount) {
    warnings.push({
      level: "error",
      message: `${STYLE_LABELS[style]} typically requires a minimum of $${meta.minAccount.toLocaleString()}. Your $${accountSize.toLocaleString()} account is below this threshold — consider switching to Scalping or Swing style, or funding more capital.`,
    });
  }
  if (concurrentRisk > 20) {
    warnings.push({
      level: "error",
      message: `Total portfolio risk is ${concurrentRisk.toFixed(1)}% if all ${maxPositions} positions open simultaneously. This is dangerously high — a bad streak could wipe your account. Reduce risk per trade or max positions.`,
    });
  } else if (concurrentRisk > 10) {
    warnings.push({
      level: "warn",
      message: `Combined risk across all ${maxPositions} positions is ${concurrentRisk.toFixed(1)}% of capital. Consider capping total exposure to 6–10% max to survive drawdown periods.`,
    });
  }
  if (riskPercent > 3) {
    warnings.push({
      level: "warn",
      message: `Risking ${riskPercent}% per trade is aggressive. Professional risk management recommends 1–2% per trade. At ${riskPercent}% you need only ${Math.ceil(100 / riskPercent)} consecutive losses to lose your entire account.`,
    });
  }
  if (lots === 0.01 && accountSize > 5000) {
    warnings.push({
      level: "info",
      message: `Your position size is very small relative to your account. You may be over-cautious — consider increasing risk % slightly to improve capital efficiency.`,
    });
  }
  if (accountSize < 100) {
    warnings.push({
      level: "error",
      message: `$${accountSize} is below the minimum viable trading capital. Most brokers require $100–$500 minimum, and this account size cannot support meaningful position sizing.`,
    });
  }
  return warnings;
}

// ─── Strategy Analysis Panel ──────────────────────────────────────────────────

interface AnalysisIssue {
  severity: "critical" | "warning" | "info";
  field: string;
  message: string;
  fix: string;
}

interface AnalysisAlternative {
  name: string;
  style: string;
  goal: string;
  riskPercent: number;
  maxPositions: number;
  rrRatio: number;
  description: string;
  rationale: string;
  historicalEdge: string;
}

interface AnalysisResult {
  verdict: "strong" | "adequate" | "risky" | "flawed";
  issues: AnalysisIssue[];
  alternatives: AnalysisAlternative[];
  aiAnalysis: { summary: string; deepInsight: string; hybridSuggestion: string } | null;
  analyzedAt: number;
}

const VERDICT_CONFIG = {
  strong:   { label: "Strategy Looks Solid",     color: "text-green-400",  bg: "bg-green-500/10  border-green-500/30",  icon: CheckCircle2 },
  adequate: { label: "Workable — Improvements Suggested", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: AlertTriangle },
  risky:    { label: "High Risk — Likely Unprofitable",   color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", icon: AlertTriangle },
  flawed:   { label: "Critical Flaws Detected",  color: "text-red-400",    bg: "bg-red-500/10    border-red-500/30",    icon: XCircle },
};

function StrategyAnalysisPanel({
  form,
  onApplyAlternative,
}: {
  form: { style: string; goal: string; riskPercent: number; maxPositions: number; rrRatio: number; accountSize: number; description: string };
  onApplyAlternative: (alt: AnalysisAlternative) => void;
}) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [expandedAlt, setExpandedAlt] = useState<number | null>(null);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/strategy/analyze", form);
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [form]);

  const verdict = result ? VERDICT_CONFIG[result.verdict] : null;
  const VerdictIcon = verdict?.icon;

  return (
    <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
      <div className="bg-card/70 px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">AI Strategy Analysis</span>
          {result && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${verdict?.bg} ${verdict?.color}`}>
              {result.verdict.toUpperCase()}
            </span>
          )}
        </div>
        <button
          onClick={analyze}
          disabled={loading}
          data-testid="button-analyze-strategy"
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? "Analyzing…" : result ? "Re-analyze" : "Analyze Strategy"}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {!result && !loading && !error && (
          <div className="text-center py-8 text-muted-foreground text-sm space-y-2">
            <Lightbulb className="w-8 h-8 mx-auto opacity-30" />
            <p>Click <strong className="text-foreground">Analyze Strategy</strong> to get a data-backed critique of your current settings — including specific flaws, rebuttals, and recommended alternatives.</p>
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-4 text-destructive text-sm">{error}</div>
        )}

        {result && !loading && (
          <AnimatePresence mode="wait">
            <motion.div key={result.analyzedAt} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

              {/* Verdict banner */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${verdict?.bg}`}>
                {VerdictIcon && <VerdictIcon className={`w-5 h-5 shrink-0 mt-0.5 ${verdict?.color}`} />}
                <div>
                  <p className={`font-bold text-sm ${verdict?.color}`}>{verdict?.label}</p>
                  {result.aiAnalysis?.summary && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{result.aiAnalysis.summary}</p>
                  )}
                  {!result.aiAnalysis && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {result.issues.length === 0
                        ? "Your parameters align with institutional risk management standards."
                        : `${result.issues.length} issue${result.issues.length > 1 ? "s" : ""} identified below. Connect an AI provider in Settings for deeper analysis.`}
                    </p>
                  )}
                </div>
              </div>

              {/* Issues */}
              {result.issues.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Issues Found ({result.issues.length})</p>
                  {result.issues.map((issue, i) => (
                    <div key={i} data-testid={`issue-card-${i}`} className="rounded-lg border overflow-hidden">
                      <button
                        className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/20 transition-colors ${
                          issue.severity === "critical" ? "border-red-500/30 bg-red-500/5" :
                          issue.severity === "warning"  ? "border-yellow-500/30 bg-yellow-500/5" :
                          "border-blue-500/30 bg-blue-500/5"
                        }`}
                        onClick={() => setExpandedIssue(expandedIssue === i ? null : i)}
                      >
                        {issue.severity === "critical"
                          ? <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                          : issue.severity === "warning"
                          ? <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                          : <Info className="w-4 h-4 text-blue-400 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              issue.severity === "critical" ? "bg-red-500/20 text-red-400" :
                              issue.severity === "warning"  ? "bg-yellow-500/20 text-yellow-400" :
                              "bg-blue-500/20 text-blue-400"
                            }`}>{issue.severity}</span>
                            <span className="text-xs font-semibold capitalize">{issue.field.replace(/([A-Z])/g, ' $1').trim()}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{issue.message}</p>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expandedIssue === i ? "rotate-90" : ""}`} />
                      </button>
                      {expandedIssue === i && (
                        <div className="px-4 py-3 bg-muted/10 border-t border-border/50 space-y-2">
                          <p className="text-xs text-foreground leading-relaxed">{issue.message}</p>
                          <div className="flex items-start gap-2 pt-1">
                            <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <p className="text-xs text-primary leading-relaxed"><strong>Fix: </strong>{issue.fix}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* AI Deep Insight */}
              {result.aiAnalysis?.deepInsight && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-primary">AI Deep Insight</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{result.aiAnalysis.deepInsight}</p>
                  {result.aiAnalysis.hybridSuggestion && (
                    <div className="pt-1 border-t border-primary/10">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-primary mb-1">Hybrid Strategy Suggestion</p>
                      <p className="text-xs text-foreground leading-relaxed">{result.aiAnalysis.hybridSuggestion}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Alternative Strategies */}
              {result.alternatives.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Recommended Alternatives ({result.alternatives.length})</p>
                  {result.alternatives.map((alt, i) => (
                    <div key={i} data-testid={`alt-strategy-${i}`} className="rounded-lg border border-border overflow-hidden">
                      <button
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/10 transition-colors bg-card/30"
                        onClick={() => setExpandedAlt(expandedAlt === i ? null : i)}
                      >
                        <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold">{alt.name}</p>
                          <p className="text-[10px] text-muted-foreground">{STYLE_LABELS[alt.style]} · {(alt.riskPercent)}% risk · 1:{alt.rrRatio} R:R · Max {alt.maxPositions} positions</p>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expandedAlt === i ? "rotate-90" : ""}`} />
                      </button>
                      {expandedAlt === i && (
                        <div className="px-4 py-3 bg-muted/10 border-t border-border/50 space-y-3">
                          <p className="text-xs text-muted-foreground leading-relaxed">{alt.rationale}</p>
                          <div className="flex items-start gap-2">
                            <BarChart2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-green-400 leading-relaxed">{alt.historicalEdge}</p>
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground border-t border-border/30 pt-2">AI Instructions: <span className="text-foreground">{alt.description}</span></p>
                          <Button
                            size="sm"
                            className="w-full bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 text-xs"
                            onClick={() => onApplyAlternative(alt)}
                            data-testid={`button-apply-alt-${i}`}
                          >
                            Apply This Strategy
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {result.issues.length === 0 && result.alternatives.length === 0 && (
                <div className="flex items-center gap-2 text-green-400 text-xs p-2 rounded-lg bg-green-500/5 border border-green-500/20">
                  <CheckCircle2 className="w-4 h-4" />
                  Your strategy is well-configured. No critical changes recommended.
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ─── Forecast panel ───────────────────────────────────────────────────────────

interface ForecastData {
  style: string;
  timeframe: { label: string; horizon: string; bars: string };
  forecasts: Array<{ symbol: string; bias: string; confidence: number; summary: string; keyLevel: number; change: number }>;
  generatedBy: string;
}

function ForecastPanel({ style, goal, accountSize }: { style: string; goal: string; accountSize: number }) {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/strategy/forecast", { style, goal });
      const data = await res.json();
      setForecast(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [style, goal]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  return (
    <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
      <div className="bg-card/70 px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-accent" />
          <span className="font-bold text-sm">Momentum Forecast</span>
          {forecast && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {forecast.timeframe.label} · {forecast.timeframe.horizon}
            </span>
          )}
        </div>
        <button
          onClick={fetchForecast}
          disabled={loading}
          data-testid="button-refresh-forecast"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Analyzing market momentum…
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-6 text-destructive text-sm">{error}</div>
        )}

        {forecast && !loading && (
          <div className="space-y-3">
            {forecast.forecasts.map((f) => (
              <div
                key={f.symbol}
                data-testid={`forecast-card-${f.symbol}`}
                className={`rounded-lg border p-3 ${
                  f.bias === "BULLISH"
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-red-500/30 bg-red-500/5"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {f.bias === "BULLISH"
                      ? <TrendingUp className="w-4 h-4 text-green-500" />
                      : <TrendingDown className="w-4 h-4 text-red-400" />}
                    <span className="font-bold font-mono text-sm">{f.symbol}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      f.bias === "BULLISH" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    }`}>
                      {f.bias}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold">{f.confidence}%</div>
                    <div className="text-[10px] text-muted-foreground">confidence</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">{f.summary}</p>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                  <span>Key level:</span>
                  <span className="text-foreground font-bold">{f.keyLevel}</span>
                  <span className="ml-2">Today: {f.change >= 0 ? "+" : ""}{f.change}%</span>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground">
              <Info className="w-3 h-3" />
              {forecast.generatedBy === "heuristic"
                ? "Momentum-based forecast. Connect an AI provider for AI-generated analysis."
                : `Generated by ${forecast.generatedBy} using live prices.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Risk & sizing panel ──────────────────────────────────────────────────────

function RiskPanel({
  accountSize, riskPercent, maxPositions, style,
}: {
  accountSize: number; riskPercent: number; maxPositions: number; style: string;
}) {
  const meta = STYLE_META[style] || STYLE_META.swing;
  const { riskDollars, lots, category, actualRisk } = calcPositionSize(
    accountSize, riskPercent, meta.defaultStop, "EURUSD"
  );
  const warnings = getRiskWarnings(accountSize, riskPercent, maxPositions, style, lots);
  const maxConcurrentRisk = actualRisk * maxPositions;
  const maxConcurrentPct = (maxConcurrentRisk / accountSize) * 100;

  return (
    <div className="space-y-4">
      {/* Position sizing card */}
      <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
        <div className="bg-card/70 px-4 py-3 border-b border-border flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">Position Sizing for ${accountSize.toLocaleString()}</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Risk Per Trade", value: `$${riskDollars.toFixed(2)}`, sub: `${riskPercent}% of capital`, color: "text-foreground" },
              { label: "Recommended Lots", value: lots.toFixed(2), sub: `${category} lot`, color: lots < 0.05 ? "text-muted-foreground" : "text-primary" },
              { label: "Max Loss / Trade", value: `$${actualRisk.toFixed(2)}`, sub: `${meta.defaultStop} pip stop`, color: "text-destructive" },
              { label: "Max Portfolio Risk", value: `$${maxConcurrentRisk.toFixed(2)}`, sub: `${maxConcurrentPct.toFixed(1)}% if all ${maxPositions} open`, color: maxConcurrentPct > 10 ? "text-orange-400" : "text-foreground" },
            ].map((item, i) => (
              <div key={i} className="bg-background/50 rounded-lg p-3 border border-border/50">
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1">{item.label}</p>
                <p className={`text-xl font-bold font-mono ${item.color}`}>{item.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-background/30 rounded-lg p-3 border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-mono">Capital Exposure Gauge</p>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  maxConcurrentPct > 15 ? "bg-destructive" :
                  maxConcurrentPct > 8 ? "bg-orange-400" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(100, maxConcurrentPct * 4)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1 font-mono">
              <span>0%</span>
              <span className={maxConcurrentPct > 8 ? "text-orange-400 font-bold" : "text-green-500 font-bold"}>
                {maxConcurrentPct.toFixed(1)}% at risk
              </span>
              <span>25%+</span>
            </div>
          </div>
        </div>
      </div>

      {/* Risk warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence>
            {warnings.map((w, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className={`flex gap-3 p-3 rounded-lg border text-xs ${
                  w.level === "error"
                    ? "bg-destructive/10 border-destructive/30 text-destructive"
                    : w.level === "warn"
                    ? "bg-orange-500/10 border-orange-500/30 text-orange-400"
                    : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{w.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {warnings.length === 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/30 bg-green-500/5 text-green-400 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Risk parameters look healthy. Your position sizing is appropriate for this account size.
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Strategy() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("active");

  const { data: rawStrategy, isLoading } = useActiveStrategy();
  const activeStrategy = rawStrategy as StrategyType | null | undefined;
  const saveStrategy = useSaveStrategy();
  const { data: rawSettings } = useSettings();
  const liveBalance = parseFloat(String((rawSettings as any)?.brokerBalance ?? 10000));
  const { data: openPositions = [] } = usePositions();
  const { data: closedPositions = [] } = usePositionHistory();

  const positions = openPositions as Position[];
  const history = closedPositions as Position[];
  const wins = history.filter((p: Position) => p.profit > 0).length;
  const winRate = history.length > 0 ? ((wins / history.length) * 100).toFixed(1) : "—";
  const totalPL = history.reduce((s: number, p: Position) => s + (p.profit || 0), 0);

  const [form, setForm] = useState({
    name: "Aggressive Growth AI",
    goal: "aggressive",
    style: "swing",
    riskPercent: 2.0,
    maxPositions: 3,
    rrRatio: 2.5,
    accountSize: liveBalance,
    description: "Focus on EURUSD. Look for breakout patterns and MACD crossovers. Assess economic impact on upswings/downswings. Avoid trading 30m before NFP data.",
  });

  useEffect(() => {
    const baseBalance = liveBalance;
    if (activeStrategy) {
      setForm({
        name: activeStrategy.name,
        goal: activeStrategy.goal,
        style: activeStrategy.style,
        riskPercent: activeStrategy.riskPercent,
        maxPositions: activeStrategy.maxPositions,
        rrRatio: activeStrategy.rrRatio,
        accountSize: (activeStrategy as any).accountSize ?? baseBalance,
        description: activeStrategy.description || "",
      });
    } else if (baseBalance !== 10000) {
      setForm(f => ({ ...f, accountSize: baseBalance }));
    }
  }, [activeStrategy, liveBalance]);

  const handleSave = async () => {
    try {
      await saveStrategy.mutateAsync(form);
      toast({
        title: "Strategy Saved",
        description: "Your AI strategy profile has been saved and is now active.",
        className: "border-green-500/50",
      });
      setActiveTab("active");
    } catch (e: any) {
      toast({ title: "Save Failed", description: e.message, variant: "destructive" });
    }
  };

  const strategy = activeStrategy || {
    name: "No Strategy Set", goal: "aggressive", style: "swing",
    riskPercent: 2.0, maxPositions: 3, rrRatio: 2.5,
  };

  const meta = STYLE_META[form.style] || STYLE_META.swing;
  const { lots, category } = calcPositionSize(form.accountSize, form.riskPercent, meta.defaultStop, "EURUSD");

  return (
    <AppLayout>
      <div className="flex-1 overflow-hidden flex flex-col h-full bg-background relative">
        {/* Header */}
        <div className="h-16 border-b border-border px-4 md:px-6 py-4 bg-card/40 shrink-0 flex items-center justify-between">
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xl md:text-2xl font-bold flex items-center gap-3"
          >
            <Target className="w-6 h-6 text-primary" />
            AI Strategy Center
          </motion.h1>
          <div className="flex bg-muted/50 rounded-lg p-1">
            {["active", "builder"].map((tab) => (
              <button
                key={tab}
                data-testid={`tab-${tab}`}
                className={`px-3 md:px-6 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "active" ? "Active Profile" : "Strategy Builder"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 w-full">
          <div className="max-w-6xl mx-auto space-y-6 pb-20">

            {/* ── Active Profile tab ── */}
            {activeTab === "active" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                {/* Hero */}
                <div className="bg-gradient-to-br from-card/80 to-card border border-border rounded-xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
                  <div className="relative">
                    <div className="w-28 h-28 rounded-full border-4 border-primary/20 flex items-center justify-center relative z-10 bg-background/50">
                      <div className="absolute inset-0 rounded-full border-t-4 border-primary animate-spin" style={{ animationDuration: "4s" }} />
                      <div className="text-center">
                        <Zap className="w-7 h-7 text-primary mx-auto mb-1" />
                        <span className="text-[10px] font-mono font-bold text-primary tracking-widest">
                          {isLoading ? "..." : activeStrategy ? "ACTIVE" : "IDLE"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 text-center md:text-left relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono mb-3 border border-primary/20">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                      {activeStrategy ? "Analyzing Markets" : "No Active Strategy"}
                    </div>
                    <h2 className="text-2xl font-bold mb-2" data-testid="text-strategy-name">{strategy.name}</h2>
                    <p className="text-sm text-muted-foreground max-w-xl">
                      {activeStrategy
                        ? `${GOAL_LABELS[strategy.goal] || strategy.goal} · ${STYLE_LABELS[strategy.style] || strategy.style} · ${strategy.riskPercent}% risk per trade · Max ${strategy.maxPositions} positions · Min 1:${strategy.rrRatio} R:R`
                        : "Set up your AI strategy in the Strategy Builder tab to start trading."}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 shrink-0 relative z-10 w-full md:w-auto">
                    <Button variant="outline" className="w-full" onClick={() => setActiveTab("builder")} data-testid="button-edit-strategy">
                      Edit Strategy
                    </Button>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Open Positions", value: String(positions.length), color: "text-accent" },
                    { label: "Win Rate (All Time)", value: history.length > 0 ? `${winRate}%` : "—", color: "text-primary" },
                    { label: "Total P/L (Closed)", value: history.length > 0 ? `${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(2)}` : "—", color: totalPL >= 0 ? "text-green-500" : "text-destructive" },
                    { label: "Trades Closed", value: String(history.length), color: "text-foreground" },
                  ].map((stat, i) => (
                    <div key={i} className="bg-card/40 border border-border rounded-lg p-4 text-center">
                      <p className="text-[10px] text-muted-foreground mb-1.5 font-mono uppercase tracking-wider">{stat.label}</p>
                      <p className={`text-2xl font-bold ${stat.color}`} data-testid={`stat-${stat.label.toLowerCase().replace(/ /g, '-')}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Momentum Forecast — always visible on Active Profile */}
                <ForecastPanel
                  style={strategy.style || "swing"}
                  goal={strategy.goal || "balanced"}
                  accountSize={(activeStrategy as any)?.accountSize ?? liveBalance}
                />

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Risk parameters */}
                  <div className="bg-card/40 border border-border rounded-lg overflow-hidden">
                    <div className="bg-card/60 p-4 border-b border-border flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <h3 className="font-bold">Risk Parameters</h3>
                    </div>
                    {[
                      { label: "Account Capital", value: `$${((activeStrategy as any)?.accountSize ?? liveBalance).toLocaleString()}` },
                      { label: "Max Risk Per Trade", value: `${strategy.riskPercent}%` },
                      { label: "Max Risk Per Trade ($)", value: `$${(((activeStrategy as any)?.accountSize ?? liveBalance) * strategy.riskPercent / 100).toFixed(2)}` },
                      { label: "Min Reward-to-Risk", value: `1:${strategy.rrRatio}` },
                      { label: "Max Open Positions", value: String(strategy.maxPositions) },
                      { label: "Trading Goal", value: GOAL_LABELS[strategy.goal] || strategy.goal },
                    ].map((row, i) => (
                      <div key={i} className="flex justify-between items-center px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                        <span className="text-sm text-muted-foreground">{row.label}</span>
                        <span className="font-mono text-sm font-semibold">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Trading logic */}
                  <div className="bg-card/40 border border-border rounded-lg overflow-hidden">
                    <div className="bg-card/60 p-4 border-b border-border flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <h3 className="font-bold">Trading Logic</h3>
                    </div>
                    {[
                      { label: "Style", value: STYLE_LABELS[strategy.style] || strategy.style },
                      { label: "Hold Duration", value: STYLE_META[strategy.style]?.holdTime || "—" },
                      { label: "Timeframe", value: STYLE_META[strategy.style]?.bars || "—" },
                      { label: "Asset Focus", value: "Forex Majors + Gold" },
                      { label: "News Avoidance", value: "30m Before High Impact" },
                      { label: "Signal Source", value: "AI Engine" },
                    ].map((row, i) => (
                      <div key={i} className="flex justify-between items-center px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                        <span className="text-sm text-muted-foreground">{row.label}</span>
                        <span className="font-mono text-sm font-semibold">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Builder tab ── */}
            {activeTab === "builder" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

                <div className="bg-primary/10 border border-primary/20 p-5 rounded-lg flex gap-4">
                  <Search className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-primary mb-1">AI Strategy Architect</h3>
                    <p className="text-sm text-muted-foreground">
                      Configure your trading profile. Position sizing, lot sizes, and risk limits are all calculated from your account size automatically.
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Left: form */}
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Strategy Name</label>
                      <input
                        data-testid="input-strategy-name"
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none"
                      />
                    </div>

                    {/* Account size — the key new field */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold flex justify-between">
                        <span>Account Capital</span>
                        <span className="font-mono text-primary">${form.accountSize.toLocaleString()}</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono">$</span>
                        <input
                          data-testid="input-account-size"
                          type="number"
                          min="50"
                          max="1000000"
                          step="50"
                          value={form.accountSize}
                          onChange={(e) => setForm({ ...form, accountSize: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-full bg-background border border-border rounded-md pl-7 pr-3 py-2 text-sm focus:border-primary outline-none font-mono"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        All lot sizes and max risk amounts are calculated from this figure.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Primary Goal</label>
                        <select
                          data-testid="select-goal"
                          value={form.goal}
                          onChange={(e) => setForm({ ...form, goal: e.target.value })}
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none"
                        >
                          <option value="aggressive">Aggressive Growth</option>
                          <option value="balanced">Balanced Growth</option>
                          <option value="conservative">Capital Preservation</option>
                          <option value="income">Daily Income</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Trading Style</label>
                        <select
                          data-testid="select-style"
                          value={form.style}
                          onChange={(e) => setForm({ ...form, style: e.target.value })}
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none"
                        >
                          <option value="scalp">Scalping (Minutes)</option>
                          <option value="day">Day Trading (Hours)</option>
                          <option value="swing">Swing (Days)</option>
                          <option value="position">Weekly (Weeks)</option>
                        </select>
                      </div>
                    </div>

                    {/* Style info badge */}
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 text-xs text-muted-foreground">
                      <BarChart2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        <strong className="text-foreground">{STYLE_LABELS[form.style]}</strong>
                        {" "}· Outlook: {meta.horizon}
                        {" "}· Charts: {meta.bars}
                        {" "}· Hold: {meta.holdTime}
                        {" "}· Recommended lots: <strong className="text-primary font-mono">{lots.toFixed(2)}</strong> ({category})
                      </span>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold flex justify-between">
                        <span>Risk Per Trade</span>
                        <span className="font-mono text-primary">{form.riskPercent}%
                          <span className="text-muted-foreground ml-1 text-xs">
                            (${(form.accountSize * form.riskPercent / 100).toFixed(2)})
                          </span>
                        </span>
                      </label>
                      <input
                        data-testid="input-risk-percent"
                        type="range" min="0.5" max="5" step="0.5"
                        value={form.riskPercent}
                        onChange={(e) => setForm({ ...form, riskPercent: parseFloat(e.target.value) })}
                        className="w-full accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                        <span>0.5% (Cautious)</span>
                        <span>2% (Standard)</span>
                        <span>5% (Aggressive)</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold flex justify-between">
                        <span>Max Open Positions</span>
                        <span className="font-mono text-primary">{form.maxPositions}
                          <span className="text-muted-foreground ml-1 text-xs">
                            (up to ${(form.accountSize * form.riskPercent / 100 * form.maxPositions).toFixed(2)} at risk)
                          </span>
                        </span>
                      </label>
                      <input
                        data-testid="input-max-positions"
                        type="range" min="1" max="10" step="1"
                        value={form.maxPositions}
                        onChange={(e) => setForm({ ...form, maxPositions: parseInt(e.target.value) })}
                        className="w-full accent-primary"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold flex justify-between">
                        <span>Min Reward-to-Risk</span>
                        <span className="font-mono text-primary">1:{form.rrRatio}</span>
                      </label>
                      <input
                        data-testid="input-rr-ratio"
                        type="range" min="1" max="5" step="0.5"
                        value={form.rrRatio}
                        onChange={(e) => setForm({ ...form, rrRatio: parseFloat(e.target.value) })}
                        className="w-full accent-primary"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold">AI Trading Instructions</label>
                      <textarea
                        data-testid="textarea-description"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none h-24 resize-none font-mono text-xs text-muted-foreground"
                        placeholder="e.g. Focus on EURUSD breakouts. Avoid NFP week. Prefer Asian session entries..."
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => setActiveTab("active")}
                        data-testid="button-cancel-strategy"
                      >
                        <RotateCcw className="w-4 h-4" /> Cancel
                      </Button>
                      <Button
                        className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                        onClick={handleSave}
                        disabled={saveStrategy.isPending}
                        data-testid="button-save-strategy"
                      >
                        <Save className="w-4 h-4" />
                        {saveStrategy.isPending ? "Saving..." : "Save & Activate"}
                      </Button>
                    </div>
                  </div>

                  {/* Right: analysis + risk panel + forecast */}
                  <div className="space-y-5">
                    <StrategyAnalysisPanel
                      form={form}
                      onApplyAlternative={(alt) => {
                        setForm(f => ({
                          ...f,
                          style: alt.style,
                          goal: alt.goal,
                          riskPercent: alt.riskPercent,
                          maxPositions: alt.maxPositions,
                          rrRatio: alt.rrRatio,
                          description: alt.description,
                          name: alt.name,
                        }));
                        toast({
                          title: "Strategy Applied",
                          description: `"${alt.name}" has been loaded into the builder. Review and save to activate it.`,
                          className: "border-primary/50",
                        });
                      }}
                    />

                    <RiskPanel
                      accountSize={form.accountSize}
                      riskPercent={form.riskPercent}
                      maxPositions={form.maxPositions}
                      style={form.style}
                    />

                    <ForecastPanel
                      style={form.style}
                      goal={form.goal}
                      accountSize={form.accountSize}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
