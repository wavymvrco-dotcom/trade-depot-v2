import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, LineChart, Target, BarChart2, Bot,
  BookMarked, Store, Activity, Settings, Bell, Newspaper,
  GraduationCap, X, ChevronRight, ChevronLeft, Sparkles,
  Map, BookOpen, ArrowRight, Zap, CalendarDays, FlaskConical,
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
    title: "Welcome to Trade Depot",
    shortDesc: "Everything lives in five places. Here is a quick look at each.",
    detailDesc: "Trade Depot is a self-directed trading and strategy-testing tool. The menu has five hubs: Terminal, Lab, Performance, Learn and Settings. Nothing here is investment advice, and simulated results do not guarantee future performance.",
    icon: Sparkles,
    iconColor: "text-primary",
    badge: "Welcome",
  },
  {
    id: "terminal",
    target: '[data-testid="nav-link-terminal"]',
    navPath: "/",
    title: "Terminal",
    shortDesc: "Live prices, charts, orders and your open positions. News and the economic calendar open in a side panel.",
    detailDesc: "Trade from the Terminal. The News & calendar button opens market news and upcoming high-impact events. Chart analysis, the order ticket and price alerts are linked from that panel.",
    icon: LayoutDashboard,
    iconColor: "text-primary",
  },
  {
    id: "lab",
    target: '[data-testid="nav-link-lab"]',
    navPath: "/lab",
    title: "Lab",
    shortDesc: "Where strategies are built and examined before they trade. Early access.",
    detailDesc: "The Strategy Lab is being built. Until it opens, your strategy settings and the TDCI calibration tools are here. TDCI calibration tests each confluence layer on real history and reports out-of-sample results, including when it finds no edge.",
    icon: FlaskConical,
    iconColor: "text-primary",
    badge: "Early access",
  },
  {
    id: "performance",
    target: '[data-testid="nav-link-performance"]',
    navPath: "/performance",
    title: "Performance",
    shortDesc: "Analytics, your trade journal and AI reviews of closed trades.",
    detailDesc: "Track results by pair and session, keep notes on every trade in the journal, and read AI reviews of closed trades. Price alerts are under the bell icon.",
    icon: BarChart2,
    iconColor: "text-primary",
  },
  {
    id: "learn",
    target: '[data-testid="nav-link-learn"]',
    navPath: "/learn",
    title: "Learn",
    shortDesc: "Lessons, and the AI Advisor beside them.",
    detailDesc: "Guides on trading concepts, risk management and how the platform works, plus the AI Advisor, which uses your own AI provider key.",
    icon: GraduationCap,
    iconColor: "text-primary",
  },
  {
    id: "settings",
    target: '[data-testid="nav-link-settings"]',
    navPath: "/settings",
    title: "Settings",
    shortDesc: "Connect your AI provider, broker, email and notifications.",
    detailDesc: "Add an AI provider key, link your broker (OANDA or MT5), and set up email and push notifications. Keys are encrypted at rest.",
    icon: Settings,
    iconColor: "text-primary",
  },
  {
    id: "done",
    title: "That is the whole map",
    shortDesc: "Start in Settings to connect your accounts, then explore the Terminal.",
    detailDesc: "You can restart this tour any time from the user menu.",
    icon: Zap,
    iconColor: "text-primary",
    badge: "Done",
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
