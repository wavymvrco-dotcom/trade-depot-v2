import { useState, useRef, useEffect, memo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  LineChart as ChartIcon, Zap, RefreshCw, TrendingUp, TrendingDown,
  Minus, ChevronDown, AlertCircle, BookOpen, Copy, Check, PlusSquare, X,
} from "lucide-react";

const PAIRS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "GBPJPY", "EURJPY", "EURGBP", "AUDJPY", "XAUUSD",
];
const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"];
const TV_TF: Record<string, string> = {
  "1m":"1","5m":"5","15m":"15","30m":"30","1h":"60","4h":"240","1D":"D","1W":"W"
};

function tvSymbol(pair: string): string {
  if (pair === "XAUUSD") return "TVC:GOLD";
  return `FX:${pair}`;
}

const TradingViewChart = memo(function TradingViewChart({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container";
    wrapper.style.cssText = "height:100%;width:100%";
    const inner = document.createElement("div");
    inner.id = `tv-chart-${symbol}-${timeframe}`;
    inner.style.cssText = "height:calc(100% - 32px);width:100%";
    wrapper.appendChild(inner);
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: tvSymbol(symbol),
      interval: TV_TF[timeframe] || "60",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      backgroundColor: "rgba(19, 23, 34, 1)",
      gridColor: "rgba(255,255,255,0.05)",
      allow_symbol_change: false,
    });
    wrapper.appendChild(script);
    container.current.appendChild(wrapper);
    return () => { if (container.current) container.current.innerHTML = ""; };
  }, [symbol, timeframe]);
  return <div ref={container} className="h-full w-full" />;
});

const TechnicalAnalysisWidget = memo(function TechnicalAnalysisWidget({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container";
    wrapper.style.cssText = "height:100%;width:100%";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.cssText = "height:calc(100% - 32px);width:100%";
    wrapper.appendChild(inner);
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
    script.async = true;
    script.textContent = JSON.stringify({
      interval: TV_TF[timeframe] || "60",
      width: "100%",
      height: "100%",
      isTransparent: true,
      symbol: tvSymbol(symbol),
      showIntervalTabs: true,
      displayMode: "multiple",
      locale: "en",
      colorTheme: "dark",
    });
    wrapper.appendChild(script);
    container.current.appendChild(wrapper);
    return () => { if (container.current) container.current.innerHTML = ""; };
  }, [symbol, timeframe]);
  return <div ref={container} className="h-full w-full" />;
});

function analysisToString(raw: any): string {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return String(raw ?? "");
  const lines: string[] = [];
  for (const [key, val] of Object.entries(raw)) {
    lines.push(`## ${key}`);
    if (typeof val === "string") { lines.push(val); }
    else if (typeof val === "object" && val !== null) {
      for (const [k, v] of Object.entries(val)) {
        if (Array.isArray(v)) {
          lines.push(`**${k}:**`);
          v.forEach((item: any) => lines.push(`- ${typeof item === "object" ? Object.values(item).join(" | ") : item}`));
        } else if (typeof v === "string" || typeof v === "number") {
          lines.push(`**${k}:** ${v}`);
        }
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function MarkdownRenderer({ text }: { text: any }) {
  const lines = analysisToString(text).split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) return (
          <h3 key={i} className="text-sm font-bold text-primary mt-4 first:mt-0 flex items-center gap-2">
            <span className="w-1 h-4 bg-primary rounded-full inline-block" />
            {line.replace(/^## /, "")}
          </h3>
        );
        if (line.startsWith("### ")) return (
          <h4 key={i} className="text-xs font-semibold text-foreground/90 mt-2">{line.replace(/^### /, "")}</h4>
        );
        if (line.startsWith("- ") || line.startsWith("* ")) return (
          <div key={i} className="flex items-start gap-2 text-xs text-foreground/90 leading-relaxed pl-2">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground shrink-0" />
            <span>{line.replace(/^[-*] /, "")}</span>
          </div>
        );
        if (/^\*\*(.+)\*\*/.test(line)) return (
          <p key={i} className="text-xs font-semibold text-foreground/90 leading-relaxed mt-1">{line.replace(/\*\*/g, "")}</p>
        );
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} className="text-xs text-foreground/85 leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

export default function Analysis() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("1h");
  const [pairOpen, setPairOpen] = useState(false);
  const [aiResult, setAiResult] = useState<{ analysis: string; currentPrice: any; timestamp: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"chart" | "technical">("chart");
  const [showSecondChart, setShowSecondChart] = useState(false);
  const [secondSymbol, setSecondSymbol] = useState("GBPUSD");

  const analyze = useMutation({
    mutationFn: () => apiRequest("POST", "/api/analysis/ai-read", { symbol, timeframe }).then(r => r.json()),
    onSuccess: (data: any) => setAiResult(data),
    onError: () => {},
  });

  const copyAnalysis = useCallback(() => {
    if (aiResult?.analysis) {
      navigator.clipboard.writeText(aiResult.analysis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [aiResult]);

  return (
    <AppLayout>
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-card/40 px-4 md:px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <ChartIcon className="w-5 h-5 text-primary" />
              Market Analysis
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              {/* Pair selector */}
              <div className="relative">
                <button
                  onClick={() => setPairOpen(o => !o)}
                  className="flex items-center gap-2 h-8 px-3 rounded-lg bg-muted border border-border text-sm font-mono font-semibold hover:border-primary/50 transition-colors"
                  data-testid="pair-selector"
                >
                  {symbol}
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", pairOpen && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {pairOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-xl p-2 grid grid-cols-2 gap-0.5 min-w-[160px]"
                    >
                      {PAIRS.map(p => (
                        <button
                          key={p}
                          onClick={() => { setSymbol(p); setPairOpen(false); setAiResult(null); }}
                          className={cn("text-xs font-mono px-3 py-1.5 rounded-lg text-left hover:bg-primary/10 hover:text-primary transition-colors",
                            symbol === p && "bg-primary/15 text-primary font-semibold")}
                          data-testid={`pair-option-${p}`}
                        >
                          {p}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Timeframe pills */}
              <div className="flex gap-0.5 bg-muted/50 rounded-lg p-0.5 border border-border">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={cn("px-2.5 py-1 text-xs rounded-md font-medium transition-colors",
                      timeframe === tf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    data-testid={`tf-btn-${tf}`}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              {/* AI Read button */}
              <button
                onClick={() => analyze.mutate()}
                disabled={analyze.isPending}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors disabled:opacity-60"
                data-testid="ai-read-btn"
              >
                {analyze.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {analyze.isPending ? "Analyzing..." : "AI Read Chart"}
              </button>
            </div>
          </div>

          {/* Chart type tabs */}
          <div className="flex gap-1 mt-3">
            {(["chart", "technical"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn("px-3 py-1 text-xs rounded-lg font-medium transition-colors capitalize",
                  activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                data-testid={`tab-${tab}`}
              >
                {tab === "chart" ? "Live Chart" : "Technical Analysis"}
              </button>
            ))}
          </div>
        </div>

        {/* Body: chart + AI panel */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Chart column */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Primary chart */}
            <div className={cn("bg-[#131722]", showSecondChart ? "flex-1 min-h-[200px]" : "flex-1 min-h-[300px] lg:min-h-0")}>
              {activeTab === "chart"
                ? <TradingViewChart symbol={symbol} timeframe={timeframe} />
                : <TechnicalAnalysisWidget symbol={symbol} timeframe={timeframe} />
              }
            </div>

            {/* Add Chart strip */}
            <div className="shrink-0 h-8 bg-card/30 border-y border-border/40 flex items-center px-3 gap-3">
              {!showSecondChart ? (
                <button onClick={() => setShowSecondChart(true)} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors" data-testid="analysis-add-chart-btn">
                  <PlusSquare className="w-3.5 h-3.5" />
                  Add Chart
                </button>
              ) : (
                <>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <PlusSquare className="w-3.5 h-3.5 text-primary" />
                    <select value={secondSymbol} onChange={e => setSecondSymbol(e.target.value)} className="bg-transparent text-[11px] font-mono text-foreground border-none outline-none cursor-pointer">
                      {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </span>
                  <button onClick={() => setShowSecondChart(false)} className="ml-auto text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors" data-testid="analysis-remove-chart-btn">
                    <X className="w-3 h-3" />
                    Remove
                  </button>
                </>
              )}
            </div>

            {/* Second chart */}
            {showSecondChart && (
              <div className="flex-1 bg-[#131722] min-h-[200px]">
                <TradingViewChart symbol={secondSymbol} timeframe={timeframe} />
              </div>
            )}
          </div>

          {/* AI Analysis Panel */}
          <div className="lg:w-[340px] xl:w-[380px] border-t lg:border-t-0 lg:border-l border-border flex flex-col bg-background/50">
            <div className="shrink-0 px-4 py-3 border-b border-border bg-card/40">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  AI Analysis — {symbol}
                </h2>
                {aiResult && (
                  <button
                    onClick={copyAnalysis}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy analysis"
                    data-testid="copy-analysis-btn"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {aiResult?.currentPrice && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Price at analysis: <span className="font-mono text-foreground">{String(aiResult.currentPrice)}</span>
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-20 lg:pb-4">
              {analyze.isPending ? (
                <div className="space-y-3 animate-pulse">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className={cn("h-3 bg-muted/50 rounded", i === 0 && "w-1/3", i % 2 === 0 ? "w-full" : "w-3/4")} />
                  ))}
                  <p className="text-xs text-muted-foreground text-center pt-4">AI is reading the chart...</p>
                </div>
              ) : analyze.isError ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                  <AlertCircle className="w-8 h-8 text-destructive/60" />
                  <p className="text-xs text-muted-foreground">
                    {(analyze.error as any)?.message || "Analysis failed. Connect an AI provider in Settings."}
                  </p>
                </div>
              ) : aiResult ? (
                <MarkdownRenderer text={aiResult.analysis} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">AI Chart Analysis</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                      Select a pair and timeframe, then click "AI Read Chart" for a detailed written analysis with trade setups.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
