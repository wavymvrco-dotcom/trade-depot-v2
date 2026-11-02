import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import {
  TrendingUp, Target, ShieldCheck, Bot, Bell, BookOpen,
  Wallet, GraduationCap, RefreshCw, ChevronDown, ChevronUp,
  Sparkles, ArrowRight, CheckCircle2, AlertTriangle, XCircle, Info,
  BarChart2, Link as LinkIcon,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface ScoreSection {
  key: string;
  label: string;
  icon: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  status: "excellent" | "good" | "fair" | "poor" | "critical";
  summary: string;
  improvements: string[];
  stats: Record<string, string | number>;
}

interface HealthData {
  overallScore: number;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  sections: ScoreSection[];
  scoredAt: number;
}

const ICON_MAP: Record<string, React.ElementType> = {
  TrendingUp, Target, ShieldCheck, Bot, Bell, BookOpen, Wallet, GraduationCap,
};

const SECTION_LINKS: Record<string, string> = {
  performance: "/analytics",
  strategy: "/strategy",
  risk: "/strategy",
  ai: "/settings",
  monitoring: "/alerts",
  journal: "/journal",
  account: "/settings",
  mastery: "/learn",
};

const GRADE_COLORS: Record<string, { ring: string; text: string; bg: string; border: string; bar: string }> = {
  A: { ring: "stroke-green-400",  text: "text-green-400",  bg: "bg-green-400/10",  border: "border-green-400/30", bar: "bg-green-400" },
  B: { ring: "stroke-blue-400",   text: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/30",  bar: "bg-blue-400" },
  C: { ring: "stroke-yellow-400", text: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/30", bar: "bg-yellow-400" },
  D: { ring: "stroke-orange-400", text: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/30", bar: "bg-orange-400" },
  F: { ring: "stroke-red-400",    text: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/30",   bar: "bg-red-400" },
};

const STATUS_LABEL: Record<string, string> = {
  excellent: "Excellent", good: "Good", fair: "Fair", poor: "Poor", critical: "Critical",
};

function ScoreRing({ score, grade, size = 120 }: { score: number; grade: string; size?: number }) {
  const colors = GRADE_COLORS[grade] || GRADE_COLORS.F;
  const r = (size - 16) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={8} className="text-muted/20" />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8}
        strokeLinecap="round" strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className={colors.ring}
      />
    </svg>
  );
}

function SmallScoreBar({ score, grade }: { score: number; grade: string }) {
  const colors = GRADE_COLORS[grade] || GRADE_COLORS.F;
  return (
    <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full opacity-70 ${colors.bar}`}
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

function SectionCard({ section, idx }: { section: ScoreSection; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const colors = GRADE_COLORS[section.grade] || GRADE_COLORS.F;
  const Icon = ICON_MAP[section.icon] || BarChart2;
  const link = SECTION_LINKS[section.key];

  const statusIcon =
    section.status === "excellent" || section.status === "good" ? <CheckCircle2 className="w-3.5 h-3.5" /> :
    section.status === "fair" ? <Info className="w-3.5 h-3.5" /> :
    section.status === "poor" ? <AlertTriangle className="w-3.5 h-3.5" /> :
    <XCircle className="w-3.5 h-3.5" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.07, duration: 0.4 }}
      className={`bg-card/60 border rounded-xl overflow-hidden transition-all ${colors.border}`}
      data-testid={`health-section-${section.key}`}
    >
      <button
        className="w-full p-4 text-left hover:bg-muted/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-expand-${section.key}`}
      >
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colors.bg} ${colors.border} border`}>
            <Icon className={`w-4.5 h-4.5 ${colors.text}`} style={{ width: 18, height: 18 }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-bold truncate">{section.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>{section.grade}</span>
                <span className="text-sm font-mono font-bold text-foreground">{section.score}</span>
              </div>
            </div>
            <SmallScoreBar score={section.score} grade={section.grade} />
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`flex items-center gap-1 text-[10px] font-semibold ${colors.text}`}>
                {statusIcon} {STATUS_LABEL[section.status]}
              </span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-muted-foreground line-clamp-1">{section.summary}</span>
            </div>
          </div>
          <div className="shrink-0 text-muted-foreground mt-1">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border/50 space-y-4 pt-3">
              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(section.stats).map(([k, v]) => (
                  <div key={k} className="bg-muted/20 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{k}</p>
                    <p className="text-sm font-bold text-foreground mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              {/* Improvements */}
              {section.improvements.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Improvements</p>
                  {section.improvements.map((imp, i) => (
                    <div key={i} className="flex items-start gap-2" data-testid={`improvement-${section.key}-${i}`}>
                      <div className={`w-4 h-4 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-bold ${colors.bg} ${colors.text}`}>{i + 1}</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{imp}</p>
                    </div>
                  ))}
                </div>
              )}

              {section.improvements.length === 0 && (
                <div className="flex items-center gap-2 text-green-400 text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  This area is performing at its best. Keep it up!
                </div>
              )}

              {link && (
                <Link href={link}>
                  <Button variant="ghost" size="sm" className={`w-full text-xs ${colors.text} border ${colors.border} hover:${colors.bg}`}>
                    <LinkIcon className="w-3 h-3 mr-1.5" />
                    Go to {section.label}
                    <ArrowRight className="w-3 h-3 ml-1.5" />
                  </Button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AppHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("GET", "/api/app/health-score");
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const overallColors = data ? (GRADE_COLORS[data.overallGrade] || GRADE_COLORS.F) : null;

  const criticalCount = data?.sections.filter(s => s.status === "critical").length ?? 0;
  const poorCount = data?.sections.filter(s => s.status === "poor").length ?? 0;
  const excellentCount = data?.sections.filter(s => s.status === "excellent").length ?? 0;

  const overallVerdict = data
    ? criticalCount >= 2 ? "Needs significant work — critical issues in multiple areas."
    : criticalCount === 1 ? "One critical area needs your immediate attention."
    : poorCount >= 2 ? "Room for improvement in several areas."
    : excellentCount >= 6 ? "Excellent overall — you're using TradeAI at a high level."
    : "Good foundation — keep building your habits and configuration."
    : null;

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Platform Health Score</h1>
              <p className="text-sm text-muted-foreground mt-1">
                A comprehensive rating of your trading setup, habits, and performance across 8 key areas.
              </p>
            </div>
            <Button
              onClick={fetchScore}
              disabled={loading}
              data-testid="button-run-health-score"
              className="flex items-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? "Scoring…" : data ? "Refresh Score" : "Run Score"}
            </Button>
          </div>

          {/* Pre-run empty state */}
          {!data && !loading && !error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20 space-y-4"
            >
              <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center mx-auto">
                <Sparkles className="w-10 h-10 text-primary opacity-60" />
              </div>
              <div>
                <p className="font-semibold text-lg text-foreground">Ready to analyze your platform</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Click <strong>Run Score</strong> to rate your trading performance, strategy, risk management, AI usage, and more — each with specific improvements.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto pt-4">
                {["Trading Performance", "Risk Management", "AI Integration", "Journal Activity"].map(label => (
                  <div key={label} className="bg-card/50 border border-border rounded-lg p-3 text-center">
                    <div className="w-8 h-8 rounded-full bg-muted/40 mx-auto mb-2" />
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {error && (
            <div className="text-center py-8 text-destructive text-sm">{error}</div>
          )}

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-card/40 border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {data && !loading && (
            <AnimatePresence>
              <motion.div key={data.scoredAt} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

                {/* Overall score */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className={`bg-card/60 border rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6 ${overallColors?.border}`}
                  data-testid="overall-health-card"
                >
                  <div className="relative shrink-0">
                    <ScoreRing score={data.overallScore} grade={data.overallGrade} size={130} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className={`text-4xl font-black ${overallColors?.text}`}
                        data-testid="overall-score"
                      >
                        {data.overallScore}
                      </motion.span>
                      <span className={`text-sm font-bold ${overallColors?.text}`}>/100</span>
                    </div>
                  </div>

                  <div className="flex-1 text-center sm:text-left space-y-2">
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <span className={`text-3xl font-black ${overallColors?.text}`}>{data.overallGrade}</span>
                      <div>
                        <p className="font-bold text-lg text-foreground">Overall Platform Score</p>
                        <p className="text-xs text-muted-foreground">Weighted across 8 categories</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{overallVerdict}</p>

                    <div className="flex flex-wrap gap-3 justify-center sm:justify-start pt-1">
                      <div className="text-center">
                        <p className="text-lg font-bold text-green-400">{excellentCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Excellent</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-yellow-400">{poorCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Need Work</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-red-400">{criticalCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Critical</p>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Section overview mini-grid */}
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {data.sections.map((s) => {
                    const c = GRADE_COLORS[s.grade] || GRADE_COLORS.F;
                    const Icon = ICON_MAP[s.icon] || BarChart2;
                    return (
                      <div key={s.key} className={`flex flex-col items-center gap-1 p-2 rounded-lg border ${c.border} ${c.bg}`} title={s.label}>
                        <Icon className={`w-4 h-4 ${c.text}`} />
                        <span className={`text-sm font-black ${c.text}`}>{s.grade}</span>
                        <span className="text-[9px] text-muted-foreground text-center leading-tight">{s.label.split(" ")[0]}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Section cards */}
                <div className="space-y-3">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Category Breakdown</p>
                  {data.sections.map((section, i) => (
                    <SectionCard key={section.key} section={section} idx={i} />
                  ))}
                </div>

                {/* Footer */}
                <div className="text-center text-[10px] text-muted-foreground pt-2">
                  Scored at {new Date(data.scoredAt).toLocaleTimeString()} · Scores are based on your live account data
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
