import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/hooks/useApi";
import { TradingViewCalendar } from "@/components/news/TradingViewCalendar";
import { cn } from "@/lib/utils";
import {
  Newspaper, RefreshCw, TrendingUp, TrendingDown, Minus,
  ExternalLink, Zap, Calendar, Clock, ChevronDown, ChevronUp,
  AlertTriangle, Globe, Star, Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const INSTRUMENT_TABS = [
  { id: "all",         label: "All",          color: "text-foreground" },
  { id: "forex",       label: "Forex",        color: "text-blue-400" },
  { id: "stocks",      label: "Stocks",       color: "text-green-400" },
  { id: "crypto",      label: "Crypto",       color: "text-orange-400" },
  { id: "bonds",       label: "Bonds",        color: "text-purple-400" },
  { id: "commodities", label: "Commodities",  color: "text-amber-400" },
  { id: "indices",     label: "Indices",      color: "text-sky-400" },
] as const;

const CURRENCY_TABS = ["All", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "XAU"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  "central-bank": "Central Bank",
  "macro": "Macro",
  "trade": "Trade",
  "market": "Markets",
  "technical": "Technical",
  "general": "General",
};
const CATEGORY_COLORS: Record<string, string> = {
  "central-bank": "text-amber-400 bg-amber-400/10 border-amber-400/20",
  "macro": "text-blue-400 bg-blue-400/10 border-blue-400/20",
  "trade": "text-orange-400 bg-orange-400/10 border-orange-400/20",
  "market": "text-green-400 bg-green-400/10 border-green-400/20",
  "technical": "text-purple-400 bg-purple-400/10 border-purple-400/20",
  "general": "text-muted-foreground bg-muted/50 border-border",
};

interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  publishedAt: string;
  currencies: string[];
  instruments: string[];
  category: string;
}

interface SentimentResult {
  sentiment: "bullish" | "bearish" | "neutral";
  score: number;
  impact: string;
  pairs: string[];
  urgency: "high" | "medium" | "low";
}

function SentimentBadge({ sentiment, score }: { sentiment: string; score: number }) {
  if (sentiment === "bullish") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
      <TrendingUp className="w-3 h-3" /> Bullish +{score}
    </span>
  );
  if (sentiment === "bearish") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
      <TrendingDown className="w-3 h-3" /> Bearish {score}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
      <Minus className="w-3 h-3" /> Neutral
    </span>
  );
}

function UrgencyDot({ urgency }: { urgency: string }) {
  if (urgency === "high") return <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" title="High impact" />;
  if (urgency === "medium") return <span className="w-2 h-2 rounded-full bg-amber-400" title="Medium impact" />;
  return <span className="w-2 h-2 rounded-full bg-muted-foreground/40" title="Low impact" />;
}

function ArticleCard({ article, index }: { article: NewsArticle; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [sentiment, setSentiment] = useState<SentimentResult | null>(null);

  const analyzeSentiment = useMutation({
    mutationFn: () => apiRequest("POST", "/api/news/sentiment", {
      title: article.title,
      summary: article.summary,
      currencies: article.currencies,
    }).then(r => r.json()),
    onSuccess: (data: any) => setSentiment(data),
    onError: () => {},
  });

  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }); }
    catch { return "recently"; }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group bg-card/40 border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-all duration-200"
      data-testid={`news-article-${article.id}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium",
                CATEGORY_COLORS[article.category] || CATEGORY_COLORS.general)}>
                {CATEGORY_LABELS[article.category] || article.category}
              </span>
              {article.currencies.slice(0, 3).map(c => (
                <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-semibold">
                  {c}
                </span>
              ))}
              {sentiment && <SentimentBadge sentiment={sentiment.sentiment} score={sentiment.score} />}
              {sentiment?.urgency && <UrgencyDot urgency={sentiment.urgency} />}
            </div>

            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold leading-snug hover:text-primary transition-colors line-clamp-2 block"
              data-testid={`news-link-${article.id}`}
            >
              {article.title}
              <ExternalLink className="inline-block w-3 h-3 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
            </a>

            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
              <Globe className="w-3 h-3" />
              <span className="font-medium">{article.source}</span>
              <span>·</span>
              <Clock className="w-3 h-3" />
              <span>{timeAgo}</span>
            </div>
          </div>
        </div>

        {article.summary && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {article.summary.replace(/<[^>]*>/g, "")}
          </p>
        )}

        <AnimatePresence>
          {sentiment && expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 pt-3 border-t border-border"
            >
              <p className="text-xs text-foreground/90 leading-relaxed">{sentiment.impact}</p>
              {sentiment.pairs && sentiment.pairs.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-muted-foreground">Affected pairs:</span>
                  {sentiment.pairs.map(p => (
                    <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-semibold">{p}</span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => { analyzeSentiment.mutate(); setExpanded(true); }}
            disabled={analyzeSentiment.isPending}
            className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-colors disabled:opacity-60"
            data-testid={`analyze-btn-${article.id}`}
          >
            <Zap className="w-3 h-3" />
            {analyzeSentiment.isPending ? "Analyzing..." : sentiment ? "Re-analyze" : "AI Impact"}
          </button>
          {sentiment && (
            <button
              onClick={() => setExpanded(x => !x)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
              data-testid={`expand-btn-${article.id}`}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Hide" : "Show"} analysis
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function News() {
  const [instrumentTab, setInstrumentTab] = useState<string>("all");
  const [currencyTab, setCurrencyTab] = useState<string>("All");
  const [showCalendar, setShowCalendar] = useState(false);

  const { data: rawSettings } = useSettings();
  const userInstruments: string[] = (rawSettings as any)?.tradingInstruments ?? [];

  const instrumentsQuery = instrumentTab !== "all" ? instrumentTab : undefined;

  const { data: articles = [], isLoading, refetch, isFetching } = useQuery<NewsArticle[]>({
    queryKey: ["/api/news/forex", instrumentsQuery],
    queryFn: () => {
      const url = instrumentsQuery
        ? `/api/news/forex?instruments=${instrumentsQuery}`
        : "/api/news/forex";
      return apiRequest("GET", url).then(r => r.json());
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const filtered = (articles as NewsArticle[]).filter(a =>
    currencyTab === "All" || a.currencies.includes(currencyTab)
  );

  const isPersonalized = userInstruments.length > 0 && instrumentTab !== "all";

  return (
    <AppLayout>
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-card/40">
          <div className="px-4 md:px-6 pt-3 pb-0">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
                  <Newspaper className="w-5 h-5 text-primary" />
                  Market News
                  {isPersonalized && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" /> Personalized
                    </span>
                  )}
                </h1>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isLoading ? "Loading..." : `${(articles as any[]).length} articles · AI sentiment analysis`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCalendar(c => !c)}
                  className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                    showCalendar ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"
                  )}
                  data-testid="toggle-calendar-btn"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Calendar</span>
                </button>
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  data-testid="refresh-news-btn"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>

            {/* Instrument tabs — underline style */}
            <div className="flex overflow-x-auto scrollbar-hide gap-0 border-b border-border/0 -mb-px">
              {INSTRUMENT_TABS.map(tab => {
                const isMyInstrument = tab.id !== "all" && userInstruments.includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => setInstrumentTab(tab.id)}
                    className={cn(
                      "shrink-0 px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-all flex items-center gap-1",
                      instrumentTab === tab.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                    data-testid={`instrument-tab-${tab.id}`}
                  >
                    {tab.label}
                    {isMyInstrument && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" title="You trade this" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Currency tabs */}
          <div className="flex gap-1 px-4 md:px-6 py-2 overflow-x-auto scrollbar-none">
            {CURRENCY_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setCurrencyTab(tab)}
                className={cn(
                  "shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors",
                  currencyTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
                data-testid={`currency-tab-${tab}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* News Feed */}
          <div className={cn("overflow-y-auto p-4 pb-20 md:pb-4 space-y-3", showCalendar ? "flex-1 md:w-1/2" : "flex-1")}>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-card/40 border border-border rounded-xl p-4 animate-pulse">
                    <div className="h-3 bg-muted/50 rounded w-1/3 mb-2" />
                    <div className="h-4 bg-muted/50 rounded w-full mb-1" />
                    <div className="h-4 bg-muted/50 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Newspaper className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">
                  {instrumentTab !== "all"
                    ? `No ${instrumentTab} news right now`
                    : currencyTab !== "All"
                    ? `No ${currencyTab} news right now`
                    : "No articles available"}
                </p>
                <p className="text-xs mt-1 opacity-60">Try refreshing or switching the filter</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-1">
                  <p className="text-xs text-muted-foreground font-medium">{filtered.length} articles</p>
                  {(instrumentTab !== "all" || currencyTab !== "All") && (
                    <span className="text-xs text-primary font-semibold capitalize">
                      {instrumentTab !== "all" ? instrumentTab : currencyTab} filter active
                    </span>
                  )}
                </div>
                {filtered.map((article, i) => (
                  <ArticleCard key={article.id} article={article} index={i} />
                ))}
              </>
            )}
          </div>

          {/* Economic Calendar */}
          <AnimatePresence>
            {showCalendar && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="md:w-[420px] border-t md:border-t-0 md:border-l border-border flex flex-col"
                style={{ minHeight: 300 }}
              >
                <div className="shrink-0 px-4 py-3 border-b border-border bg-card/40">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Economic Calendar
                  </h2>
                </div>
                <div className="flex-1 bg-[#131722]">
                  <TradingViewCalendar />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AppLayout>
  );
}
