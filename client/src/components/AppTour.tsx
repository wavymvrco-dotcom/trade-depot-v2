import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, LineChart, Target, BarChart2, Bot,
  BookMarked, Store, Activity, Settings, Bell, Newspaper,
  GraduationCap, X, ChevronRight, ChevronLeft, Sparkles,
  Map, BookOpen, ArrowRight, Zap, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

const TOUR_KEY = "tradeai_tour_seen";

interface TourStep {
  id: string;
  target?: string;
  title: string;
  shortDesc: string;
  detailDesc: string;
  icon: React.ElementType;
  iconColor: string;
  badge?: string;
  navPath?: string;
}

const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to TradeAI Terminal",
    shortDesc: "You're set up! Let's take a quick look at where everything lives so you can start trading smarter right away.",
    detailDesc: "TradeAI Terminal is your all-in-one AI-powered forex trading environment. It combines live market data, intelligent signal generation, risk management, a trade journal, analytics, and a strategy marketplace — all in one place. This tour will walk you through every section of the sidebar.",
    icon: Sparkles,
    iconColor: "text-primary",
    badge: "Welcome",
  },
  {
    id: "terminal",
    target: '[data-testid="nav-link-terminal"]',
    navPath: "/",
    title: "Trading Terminal",
    shortDesc: "Your main hub — live prices, TradingView charts, open positions, and one-click AI signal generation.",
    detailDesc: "The Trading Terminal is where you execute trades. See live forex prices, an embedded TradingView chart, your active positions, and a panel to generate AI-powered BUY/SELL signals using ICT/SMC methodology. Enable Auto-Trade mode to let the AI execute high-confidence signals automatically.",
    icon: LayoutDashboard,
    iconColor: "text-primary",
  },
  {
    id: "analysis",
    target: '[data-testid="nav-link-analysis"]',
    navPath: "/analysis",
    title: "Market Analysis",
    shortDesc: "Deep technical analysis, candlestick patterns, support/resistance levels, and AI chart reading.",
    detailDesc: "The Analysis page gives you a full-screen TradingView chart plus an AI layer that reads the chart, identifies patterns, and produces a written analysis of what it sees. Use this before making trade decisions to get a second opinion from the AI.",
    icon: LineChart,
    iconColor: "text-blue-400",
  },
  {
    id: "strategy",
    target: '[data-testid="nav-link-strategy"]',
    navPath: "/strategy",
    title: "Strategy Builder",
    shortDesc: "Set your trading profile, run the AI scorecard, and get a momentum forecast before you trade.",
    detailDesc: "Define who you are as a trader — your pairs, session, risk per trade, style, and AI instructions. The AI then grades your setup across 6 dimensions and gives you a Momentum Forecast so you know whether market conditions match your strategy today.",
    icon: Target,
    iconColor: "text-orange-400",
  },
  {
    id: "analytics",
    target: '[data-testid="nav-link-analytics"]',
    navPath: "/analytics",
    title: "Analytics Dashboard",
    shortDesc: "6-tab performance breakdown — P&L, win rates, patterns, psychology, and AI weekly coaching.",
    detailDesc: "Track everything: cumulative P&L, win/loss ratios by pair and session, your best and worst trading days, emotional patterns from your journal, and a full AI Weekly Report that reads your last 7 days and gives you a personalised coaching summary.",
    icon: BarChart2,
    iconColor: "text-green-400",
  },
  {
    id: "calendar",
    target: '[data-testid="nav-link-calendar"]',
    navPath: "/calendar",
    title: "Economic Calendar",
    shortDesc: "Live high-impact news events — filter by currency and impact to plan around market-moving announcements.",
    detailDesc: "The Economic Calendar shows upcoming central bank decisions, NFP releases, CPI prints, and other high-impact events that move forex markets. Filter by currency pair relevance and impact level so you know exactly when volatility is expected.",
    icon: CalendarDays,
    iconColor: "text-violet-400",
  },
  {
    id: "alerts",
    target: '[data-testid="nav-link-alerts"]',
    navPath: "/alerts",
    title: "Price Alerts",
    shortDesc: "Set alerts on any pair — get push notifications or emails the moment your level is hit.",
    detailDesc: "Create unlimited price alerts for any forex pair or asset. Set a target price and direction (Above / Below), choose push notification, email, or both. Alerts fire in real time and appear in your notification panel on the sidebar.",
    icon: Bell,
    iconColor: "text-amber-400",
  },
  {
    id: "news",
    target: '[data-testid="nav-link-news"]',
    navPath: "/news",
    title: "Trading News",
    shortDesc: "AI-filtered forex and macro news — only the events that could actually move your pairs.",
    detailDesc: "The News feed pulls from top financial RSS sources and filters stories for forex and macro relevance using AI. Stories are tagged by currency pair so you can instantly see what's driving price action in the markets you trade.",
    icon: Newspaper,
    iconColor: "text-sky-400",
  },
  {
    id: "ai",
    target: '[data-testid="nav-link-ai-advisor"]',
    navPath: "/ai",
    title: "AI Advisor",
    shortDesc: "Your personal trading coach — ask anything about your trades, strategy, or the market.",
    detailDesc: "A dedicated chat interface backed by your configured AI provider (OpenAI, Claude, Gemini, Groq, or Perplexity). It has full context of your trading history, strategy, and open positions — so it gives deeply personalised answers, not generic responses.",
    icon: Bot,
    iconColor: "text-purple-400",
    badge: "AI",
  },
  {
    id: "learn",
    target: '[data-testid="nav-link-learn"]',
    navPath: "/learn",
    title: "Learn",
    shortDesc: "Step-by-step guides, strategy tutorials, and ICT/SMC methodology explained in plain language.",
    detailDesc: "The Learn section contains structured educational content covering platform features, trading concepts, ICT/SMC methodology, and risk management. Start here if you're new to AI-assisted trading or want to understand how the signal engine works under the hood.",
    icon: GraduationCap,
    iconColor: "text-indigo-400",
  },
  {
    id: "journal",
    target: '[data-testid="nav-link-journal"]',
    navPath: "/journal",
    title: "Trade Journal",
    shortDesc: "Log every trade with emotions and notes — the AI reviews each one and gives it a grade.",
    detailDesc: "Every trade you execute is automatically added to your journal. Annotate it with your emotional state, reasoning, and notes. The AI then performs a post-trade review — grading it from A+ to F and highlighting what you did well, what went wrong, and what to do differently next time.",
    icon: BookMarked,
    iconColor: "text-pink-400",
  },
  {
    id: "marketplace",
    target: '[data-testid="nav-link-marketplace"]',
    navPath: "/marketplace",
    title: "Strategy Marketplace",
    shortDesc: "Discover and copy proven strategies from other traders, or publish your own.",
    detailDesc: "Browse community-published trading strategies. Filter by style, pair, win rate, and rating. One click copies any strategy into your profile. If you have a strategy you're proud of, publish it — other traders can rate and copy it.",
    icon: Store,
    iconColor: "text-cyan-400",
  },
  {
    id: "health",
    target: '[data-testid="nav-link-health-score"]',
    navPath: "/health",
    title: "Platform Health Score",
    shortDesc: "See how well your setup is configured — scored across 8 categories with improvement tips.",
    detailDesc: "The Health Score rates your configuration across 8 categories: Trading Performance, Strategy Config, Risk Management, AI Integration, Market Monitoring, Journal Activity, Account Health, and Platform Mastery. Each gets an A–F grade with specific improvement actions.",
    icon: Activity,
    iconColor: "text-emerald-400",
    badge: "New",
  },
  {
    id: "settings",
    target: '[data-testid="nav-link-settings"]',
    navPath: "/settings",
    title: "Settings & Integrations",
    shortDesc: "Connect your AI provider, broker, email, and notifications — plus the full update log.",
    detailDesc: "Wire everything up here. Connect an AI provider (OpenAI, Claude, Gemini, Groq, or Perplexity), configure your live data feed, link your broker (OANDA, IB, or MT5), set up email and push notifications, and view the full Update Log of every feature added to the platform.",
    icon: Settings,
    iconColor: "text-slate-400",
  },
  {
    id: "done",
    title: "You're ready to trade!",
    shortDesc: "That's every section covered. Head to Strategy Builder, fill in your profile, then hit Generate AI Signal to get your first recommendation.",
    detailDesc: "The best starting workflow: go to Strategy Builder → fill in your pairs, session, and risk settings → head to the Terminal → click Generate AI Signal. The AI will analyse the current market and give you a trade recommendation tailored to your setup. Good luck!",
    icon: Zap,
    iconColor: "text-yellow-400",
    badge: "Done!",
  },
];

interface SpotlightBox {
  top: number; left: number; width: number; height: number;
}

function getSpotlight(selector: string): SpotlightBox | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const PAD = 5;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

export function AppTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [detailed, setDetailed] = useState(false);
  const [spotlight, setSpotlight] = useState<SpotlightBox | null>(null);
  const [, setLocation] = useLocation();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (localStorage.getItem(TOUR_KEY) !== "true") {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const updateSpotlight = useCallback((s: TourStep) => {
    if (!s.target) { setSpotlight(null); return; }
    // Cancel any pending timer or animation frame
    if (rafRef.current) {
      clearTimeout(rafRef.current as unknown as number);
      cancelAnimationFrame(rafRef.current);
    }
    const attempt = (tries: number) => {
      const box = getSpotlight(s.target!);
      if (box && box.width > 1) { setSpotlight(box); return; }
      if (tries > 0) rafRef.current = requestAnimationFrame(() => attempt(tries - 1));
    };
    // Wait 450ms for AppLayout to remount and any entrance animations to finish
    rafRef.current = window.setTimeout(() => attempt(20), 450) as unknown as number;
  }, []);

  useEffect(() => {
    if (!visible) return;
    const current = STEPS[step];
    setDetailed(false);
    if (current.navPath) setLocation(current.navPath);
    updateSpotlight(current);
  }, [step, visible, updateSpotlight, setLocation]);

  // Keep spotlight in sync on window resize
  useEffect(() => {
    if (!visible) return;
    const onResize = () => {
      const cur = STEPS[step];
      if (cur.target) {
        const box = getSpotlight(cur.target);
        if (box && box.width > 1) setSpotlight(box);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [visible, step]);

  useEffect(() => () => {
    if (rafRef.current) {
      clearTimeout(rafRef.current as unknown as number);
      cancelAnimationFrame(rafRef.current);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, "true");
    setVisible(false);
  };

  const goTo = (newStep: number) => {
    if (newStep >= 0 && newStep < STEPS.length) setStep(newStep);
    else dismiss();
  };

  const next = () => (step < STEPS.length - 1 ? goTo(step + 1) : dismiss());
  const prev = () => goTo(step - 1);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const isSidebarStep = !!current.target;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const SIDEBAR_W = 64;
  const CARD_GAP  = 14;
  const CARD_W    = isMobile ? Math.min(window.innerWidth - 32, 340) : 340;
  const CARD_APPROX_H = 320;

  const getCardTop = (): number | string => {
    if (!spotlight || !isSidebarStep) return "50%";
    const midY = spotlight.top + spotlight.height / 2;
    const minTop = 16 + CARD_APPROX_H / 2;
    const maxTop = (typeof window !== "undefined" ? window.innerHeight : 800) - CARD_APPROX_H / 2 - 16;
    return Math.max(minTop, Math.min(midY, maxTop));
  };

  const cardTop = getCardTop();
  const cardStyle: React.CSSProperties = isMobile
    ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: CARD_W, maxHeight: "calc(100dvh - 32px)" }
    : { left: SIDEBAR_W + CARD_GAP, top: cardTop, transform: "translateY(-50%)", width: CARD_W, maxHeight: "calc(100dvh - 32px)" };

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Dimmed overlay */}
          <motion.div
            key="tour-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] pointer-events-none"
            style={{ background: "rgba(0,0,0,0.72)" }}
          />

          {/* Sidebar item spotlight */}
          <AnimatePresence mode="wait">
            {!isMobile && spotlight && isSidebarStep && (
              <motion.div
                key={`spotlight-${step}`}
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed z-[9999] pointer-events-none rounded-xl"
                style={{
                  top: spotlight.top,
                  left: spotlight.left,
                  width: spotlight.width,
                  height: spotlight.height,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
                  border: "2px solid hsl(var(--primary) / 0.85)",
                  background: "transparent",
                }}
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.15, 0.6] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 rounded-xl border-2 border-primary"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Connector arrow from card to sidebar item */}
          {!isMobile && spotlight && isSidebarStep && (
            <motion.div
              key={`arrow-${step}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed z-[10001] pointer-events-none"
              style={{
                left: SIDEBAR_W + CARD_GAP - 10,
                top: typeof cardTop === "number" ? cardTop - 6 : "calc(50% - 6px)",
                width: 0,
                height: 0,
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
                borderRight: "10px solid hsl(var(--card))",
              }}
            />
          )}

          {/* Tour card */}
          <motion.div
            key={`card-${step}`}
            initial={{ opacity: 0, x: -8, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed z-[10000] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            style={cardStyle}
          >
            {/* Progress bar header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-card/80 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex gap-0.5 flex-shrink-0">
                  {STEPS.map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        width: i === step ? 14 : 4,
                        background: i <= step ? "hsl(var(--primary))" : "hsl(var(--muted))",
                      }}
                      transition={{ duration: 0.22 }}
                      className="h-1 rounded-full"
                      style={{ width: i === step ? 14 : 4 }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">{step + 1} / {STEPS.length}</span>
              </div>
              <button
                onClick={dismiss}
                data-testid="tour-close"
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 160px)" }}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <current.icon className={cn("w-5 h-5", current.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm leading-tight">{current.title}</h3>
                    {current.badge && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 shrink-0">
                        {current.badge}
                      </span>
                    )}
                  </div>
                  {isSidebarStep && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60" />
                      Sidebar item {step} of {STEPS.length - 2}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                {detailed ? current.detailDesc : current.shortDesc}
              </p>

              {!isFirst && !isLast && (
                <button
                  onClick={() => setDetailed(d => !d)}
                  data-testid="tour-toggle-detail"
                  className="flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary transition-colors font-medium"
                >
                  <BookOpen className="w-3 h-3" />
                  {detailed ? "Show less" : "Tell me more"}
                </button>
              )}

              {isLast && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Map className="w-3.5 h-3.5" /> Want step-by-step guides?
                  </p>
                  <p className="text-[11px] text-muted-foreground">The Learn section has detailed walkthroughs for every feature.</p>
                  <button
                    onClick={() => { dismiss(); setLocation("/learn"); }}
                    data-testid="tour-goto-learn"
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
                  >
                    Open Learn section <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Footer navigation */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border/50">
              {!isFirst && (
                <button
                  onClick={prev}
                  data-testid="tour-prev"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-muted/40 font-medium"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={dismiss}
                data-testid="tour-skip"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg font-medium"
              >
                {isFirst ? "Skip tour" : "Skip"}
              </button>
              <button
                onClick={next}
                data-testid="tour-next"
                className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
              >
                {isLast ? "Get started" : "Next"}
                {!isLast && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function useTourReset() {
  return () => {
    localStorage.removeItem(TOUR_KEY);
    window.location.reload();
  };
}
