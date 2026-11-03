import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, LineChart, Shield, ArrowRight, CheckCircle2, Server,
  BookOpen, Wifi, Loader2, Monitor, Building2, CandlestickChart,
  Eye, EyeOff, AlertCircle, PlugZap, Lock, Zap, BarChart2,
  CalendarDays, Bell, TrendingUp, Settings, Brain, Activity,
  DollarSign, Percent, SlidersHorizontal, Info, CheckCheck,
  Newspaper, TrendingDown, Bitcoin, Landmark, Wheat, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

type CS = "idle" | "testing" | "connected" | "failed";

const AI_PROVIDERS = [
  { id: "openai",     name: "OpenAI",         model: "GPT-4o",              color: "text-emerald-400", selectedBg: "border-emerald-500 bg-emerald-500/10", placeholder: "sk-proj-...",  hint: "platform.openai.com → API Keys",     logo: "🤖" },
  { id: "anthropic",  name: "Anthropic",       model: "Claude 3.5 Sonnet",   color: "text-amber-400",   selectedBg: "border-amber-500 bg-amber-500/10",   placeholder: "sk-ant-...",   hint: "console.anthropic.com → API Keys",   logo: "🧠" },
  { id: "gemini",     name: "Google Gemini",   model: "Gemini 1.5 Pro",      color: "text-blue-400",    selectedBg: "border-blue-500 bg-blue-500/10",     placeholder: "AIzaSy...",    hint: "aistudio.google.com → Get API key",  logo: "✨" },
  { id: "groq",       name: "Groq",            model: "Llama 3.1 70B",       color: "text-orange-400",  selectedBg: "border-orange-500 bg-orange-500/10", placeholder: "gsk_...",      hint: "console.groq.com → API Keys",        logo: "⚡" },
  { id: "xai",        name: "Grok by xAI",     model: "Grok-2",              color: "text-sky-400",     selectedBg: "border-sky-500 bg-sky-500/10",       placeholder: "xai-...",      hint: "console.x.ai → API Keys",            logo: "𝕏" },
  { id: "perplexity", name: "Perplexity",      model: "Sonar Online",        color: "text-violet-400",  selectedBg: "border-violet-500 bg-violet-500/10", placeholder: "pplx-...",     hint: "perplexity.ai/settings/api",         logo: "🔍" },
];

const BROKER_OPTIONS = [
  { id: "demo",        Icon: Monitor,          title: "Demo Account",    sub: "Paper Trading",       desc: "$10,000 virtual balance. No real money at risk. Perfect for getting started.",  badge: "Start Here",    badgeCls: "text-green-400 bg-green-500/10 border-green-500/25" },
  { id: "mql5",        Icon: CandlestickChart, title: "MetaTrader 5",    sub: "Live via MQL5",       desc: "Connect your MT5 live or demo account. Credentials validated at runtime.",        badge: "Most Popular",  badgeCls: "text-blue-400 bg-blue-500/10 border-blue-500/25" },
  { id: "oanda",       Icon: Building2,        title: "OANDA",           sub: "Live via REST API",   desc: "Real-time connection verified against OANDA's API. Requires a live account.",      badge: "Verified Live", badgeCls: "text-violet-400 bg-violet-500/10 border-violet-500/25" },
];

const FEATURES = [
  { Icon: LineChart,   label: "Live Terminal",      desc: "Real-time prices, charts, and 1-click trading" },
  { Icon: Brain,       label: "AI Signals",         desc: "GPT-4o, Claude, Gemini generating live signals" },
  { Icon: BarChart2,   label: "Analytics",          desc: "Equity curves, P&L, win rate, Monte Carlo backtest" },
  { Icon: CalendarDays,label: "Economic Calendar",  desc: "Live ForexFactory events with impact filters" },
  { Icon: Bell,        label: "Price Alerts",       desc: "Smart alerts triggered when price crosses your target" },
  { Icon: Zap,         label: "Auto-Trading",       desc: "AI executes pending signals automatically" },
  { Icon: TrendingUp,  label: "Strategy Builder",   desc: "Position sizing, risk management, forecasts" },
  { Icon: Newspaper,   label: "Market News",        desc: "Live financial news and sentiment feed" },
  { Icon: Activity,    label: "AI Advisor",         desc: "Chat directly with your AI about any position" },
];

export default function Onboarding({ onComplete }: { onComplete?: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // ── AI state ──────────────────────────────────────────────────────
  const [selectedProvider, setSelectedProvider] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiStatus, setAiStatus] = useState<CS>("idle");
  const [aiMsg, setAiMsg] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiSkipped, setAiSkipped] = useState(false);
  const [showAiInfo, setShowAiInfo] = useState(false);

  // ── Broker state ──────────────────────────────────────────────────
  const [brokerType, setBrokerType] = useState("demo");
  const [mql5Account, setMql5Account] = useState("");
  const [mql5Password, setMql5Password] = useState("");
  const [brokerServer, setBrokerServer] = useState("");
  const [brokerApiKey, setBrokerApiKey] = useState("");
  const [showBrokerKey, setShowBrokerKey] = useState(false);
  const [brokerStatus, setBrokerStatus] = useState<CS>("idle");
  const [brokerMsg, setBrokerMsg] = useState("");

  // ── Strategy & Prefs ──────────────────────────────────────────────
  const [strategyGoal, setStrategyGoal] = useState("balanced");
  const [tradingStyle, setTradingStyle] = useState("swing");
  const [accountSize, setAccountSize] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("2");
  const [maxPositions, setMaxPositions] = useState("3");
  const [autoTrade, setAutoTrade] = useState(false);
  const [strategyDesc, setStrategyDesc] = useState("");

  // ── Instrument selection ──────────────────────────────────────────
  const [tradingInstruments, setTradingInstruments] = useState<string[]>(["forex"]);

  const toggleInstrument = (id: string) => {
    setTradingInstruments(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const totalSteps = 6;
  const aiDone = aiStatus === "connected";
  const brokerDone = brokerStatus === "connected";

  const canProceed = () => {
    if (step === 2) return tradingInstruments.length > 0;
    if (step === 3) return aiDone || aiSkipped;
    if (step === 4) return brokerDone;
    return true;
  };

  // ── AI test ───────────────────────────────────────────────────────
  const testAi = async () => {
    if (!selectedProvider) { setAiMsg("Select an AI provider first."); setAiStatus("failed"); return; }
    if (!aiApiKey.trim()) { setAiMsg("Enter your API key."); setAiStatus("failed"); return; }
    setAiStatus("testing"); setAiMsg(""); setAiModel("");
    try {
      const res = await apiRequest("POST", "/api/settings/test-ai", { provider: selectedProvider, apiKey: aiApiKey.trim() });
      const data = await res.json();
      setAiStatus(data.connected ? "connected" : "failed");
      setAiMsg(data.message);
      if (data.model) setAiModel(data.model);
    } catch { setAiStatus("failed"); setAiMsg("Network error. Check your internet connection."); }
  };

  // ── Broker test ────────────────────────────────────────────────────
  const testBroker = async () => {
    // MT5: validate required fields before sending
    if (brokerType === "mql5") {
      if (!mql5Account.trim()) { setBrokerStatus("failed"); setBrokerMsg("Account number is required."); return; }
      if (!mql5Password.trim()) { setBrokerStatus("failed"); setBrokerMsg("Investor password is required."); return; }
      if (mql5Account.trim().length < 5) { setBrokerStatus("failed"); setBrokerMsg("Account number must be at least 5 digits."); return; }
    }
    if ((brokerType === "oanda" || brokerType === "interactive") && !brokerApiKey.trim()) {
      setBrokerStatus("failed");
      setBrokerMsg(`${brokerType === "oanda" ? "OANDA" : "IBKR"} API key is required.`);
      return;
    }
    setBrokerStatus("testing"); setBrokerMsg("");
    try {
      const res = await apiRequest("POST", "/api/settings/test-broker", { brokerType, mql5Account, mql5Password, brokerServer, brokerApiKey });
      const data = await res.json();
      setBrokerStatus(data.connected ? "connected" : "failed");
      setBrokerMsg(data.message);
    } catch { setBrokerStatus("failed"); setBrokerMsg("Network error. Could not reach broker."); }
  };

  const handleNext = () => {
    if (!canProceed()) {
      if (step === 2) toast({ title: "Select at least one market", description: "Choose what you'll trade to continue.", variant: "destructive" });
      if (step === 3) toast({ title: "AI connection required", description: "Test and verify your AI provider to continue.", variant: "destructive" });
      if (step === 4) toast({ title: "Broker connection required", description: "Test and verify your broker to continue.", variant: "destructive" });
      return;
    }
    if (step < totalSteps) setStep(s => s + 1);
    else finishSetup();
  };

  const finishSetup = async () => {
    setSaving(true);
    try {
      // 1. Save strategy (AI + broker credentials are already saved by test endpoints)
      const riskPct = parseFloat(riskPercent) || 2.0;
      const maxPos  = parseInt(maxPositions) || 3;
      const acctSz  = parseFloat(accountSize) || 10000;
      await apiRequest("POST", "/api/strategies", {
        name: `${strategyGoal.charAt(0).toUpperCase() + strategyGoal.slice(1)} ${tradingStyle.charAt(0).toUpperCase() + tradingStyle.slice(1)} Strategy`,
        goal: strategyGoal,
        style: tradingStyle,
        description: strategyDesc || `AI-powered ${tradingStyle} strategy with ${riskPct}% risk per trade.`,
        riskPercent: riskPct,
        maxPositions: maxPos,
        rrRatio: strategyGoal === "aggressive" ? 3.0 : strategyGoal === "conservative" ? 1.5 : 2.5,
        accountSize: acctSz,
        isActive: true,
      });

      // 2. Save preferences (autoTrade, riskMode, notifications, instruments)
      await apiRequest("POST", "/api/settings", {
        autoTrade,
        notifications: true,
        riskMode: strategyGoal === "aggressive" ? "high" : strategyGoal === "conservative" ? "low" : "moderate",
        tradingInstruments,
      });

      // 3. Mark onboarding complete — localStorage is the primary gate,
      //    server-side is best-effort (session may have expired on restart)
      localStorage.setItem("tradeai_onboarded", "true");
      localStorage.removeItem("tradeai_tour_seen");
      try {
        await apiRequest("POST", "/api/settings/complete-onboarding", {});
      } catch {
        // Session may have expired — localStorage flag is sufficient to proceed
      }

      toast({ title: "Setup complete! Welcome to TradeAI.", className: "border-green-500/50" });
      onComplete?.();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ── Shared UI ──────────────────────────────────────────────────────
  const FeedbackBar = ({ status, msg }: { status: CS; msg: string }) => {
    if (status === "idle" || !msg) return null;
    return (
      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
        className={cn("flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg border mt-2",
          status === "connected" && "bg-green-500/8 border-green-500/30 text-green-400",
          status === "failed"    && "bg-red-500/8 border-red-500/30 text-red-400",
          status === "testing"   && "bg-amber-500/8 border-amber-500/30 text-amber-400",
        )}>
        {status === "connected" && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
        {status === "failed"    && <AlertCircle  className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
        {status === "testing"   && <Loader2      className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-spin" />}
        <span>{msg}</span>
      </motion.div>
    );
  };

  const providerInfo = AI_PROVIDERS.find(p => p.id === selectedProvider);
  const brokerInfo   = BROKER_OPTIONS.find(b => b.id === brokerType);

  const stepLabels = ["Welcome", "Markets", "AI Provider", "Broker", "Preferences", "Done"];

  return (
    <div className="min-h-[100dvh] w-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-y-auto">
      {/* Ambient glow */}
      <div className="fixed top-1/3 left-1/4 w-96 h-96 bg-primary/12 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/3 right-1/4 w-96 h-96 bg-accent/12 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-2xl bg-card/60 backdrop-blur-xl border border-border rounded-2xl shadow-2xl relative z-10 my-auto overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <motion.div className="h-full bg-gradient-to-r from-primary to-accent" animate={{ width: `${(step / totalSteps) * 100}%` }} transition={{ duration: 0.35 }} />
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1 overflow-x-auto">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-200",
                  step > i + 1  ? "bg-primary border-primary text-primary-foreground" :
                  step === i + 1 ? "border-primary text-primary bg-primary/10" :
                                   "border-border text-muted-foreground bg-transparent"
                )}>
                  {step > i + 1 ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <span className={cn("text-[10px] font-medium hidden sm:block", step === i + 1 ? "text-primary" : "text-muted-foreground")}>
                  {stepLabels[i]}
                </span>
              </div>
              {i < totalSteps - 1 && <div className={cn("h-0.5 w-8 md:w-14 mb-4 transition-colors shrink-0", step > i + 1 ? "bg-primary" : "bg-border")} />}
            </div>
          ))}
        </div>

        <div className="p-6 md:p-8">
          <AnimatePresence mode="wait">

            {/* ─── STEP 1: Welcome ─────────────────────────────── */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/25 shrink-0">
                    <LineChart className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">Welcome to TradeAI{user?.username ? `, ${user.username}` : ""}!</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">Your autonomous AI trading terminal. Let's get you set up in 5 steps.</p>
                  </div>
                </div>

                {/* Feature grid */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> Everything included
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {FEATURES.map(({ Icon, label, desc }) => (
                      <div key={label} className="flex flex-col gap-1.5 p-3 rounded-xl bg-muted/30 border border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-colors group">
                        <Icon className="w-4 h-4 text-primary group-hover:text-primary" />
                        <p className="text-xs font-semibold leading-tight">{label}</p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed hidden sm:block">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Setup checklist */}
                <div className="bg-primary/6 border border-primary/20 rounded-xl p-4 space-y-2.5">
                  <p className="text-xs font-semibold text-primary flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5" />What we'll configure</p>
                  {[
                    { n: "1", t: "AI Provider",          d: "Connect OpenAI, Claude, Gemini, Groq, or Perplexity — live API test required" },
                    { n: "2", t: "Broker / Execution",   d: "Link MT5, OANDA, IBKR, or start with a $100K demo account" },
                    { n: "3", t: "Strategy & Preferences", d: "Set your risk level, account size, trading style, and auto-trade options" },
                  ].map(x => (
                    <div key={x.n} className="flex items-start gap-3 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{x.n}</div>
                      <div><span className="font-semibold text-sm">{x.t}</span><span className="text-muted-foreground text-xs"> — {x.d}</span></div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 shrink-0" /> All credentials are encrypted and stored only on your account. Never shared.
                </p>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    data-testid="button-skip-onboarding"
                    onClick={() => {
                      localStorage.setItem("tradeai_onboarded", "true");
                      localStorage.removeItem("tradeai_tour_seen");
                      fetch("/api/settings/complete-onboarding", { method: "POST", credentials: "include" }).catch(() => {});
                      onComplete?.();
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    Already set up? Skip and enter the app →
                  </button>
                </div>
              </motion.div>
            )}

            {/* ─── STEP 2: What will you trade? ─────────────────── */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold">What will you trade?</h2>
                  <p className="text-muted-foreground text-sm mt-1">Select all asset classes you plan to trade. This personalises your news feed and AI signals. You can change this anytime in Settings.</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { id: "forex",       Icon: Globe,        label: "Forex",        sub: "Currency pairs",         color: "text-blue-400",   bg: "border-blue-500 bg-blue-500/10",   badge: "Core feature" },
                    { id: "stocks",      Icon: TrendingUp,   label: "Stocks",       sub: "Equities & ETFs",        color: "text-green-400",  bg: "border-green-500 bg-green-500/10", badge: "" },
                    { id: "crypto",      Icon: Bitcoin,      label: "Crypto",       sub: "BTC, ETH & more",        color: "text-orange-400", bg: "border-orange-500 bg-orange-500/10", badge: "" },
                    { id: "bonds",       Icon: Landmark,     label: "Bonds",        sub: "Treasuries & fixed income", color: "text-purple-400", bg: "border-purple-500 bg-purple-500/10", badge: "" },
                    { id: "commodities", Icon: Wheat,        label: "Commodities",  sub: "Gold, oil & more",       color: "text-amber-400",  bg: "border-amber-500 bg-amber-500/10", badge: "" },
                    { id: "indices",     Icon: BarChart2,    label: "Indices",      sub: "S&P 500, FTSE & more",   color: "text-cyan-400",   bg: "border-cyan-500 bg-cyan-500/10",   badge: "" },
                  ].map(({ id, Icon, label, sub, color, bg, badge }) => {
                    const selected = tradingInstruments.includes(id);
                    return (
                      <motion.button
                        key={id}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => toggleInstrument(id)}
                        data-testid={`button-instrument-${id}`}
                        className={cn(
                          "p-4 rounded-xl border-2 text-left transition-all duration-150 relative",
                          selected ? bg : "border-border bg-card/40 hover:border-primary/40 hover:bg-muted/20"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className={cn("w-5 h-5", selected ? color : "text-muted-foreground")} />
                          {selected && <CheckCircle2 className={cn("w-4 h-4", color)} />}
                        </div>
                        <p className="font-semibold text-sm">{label}</p>
                        <p className="text-[11px] text-muted-foreground">{sub}</p>
                        {badge && (
                          <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                            {badge}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                {tradingInstruments.length === 0 && (
                  <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Select at least one market to continue.
                  </div>
                )}

                {tradingInstruments.length > 0 && (
                  <div className="text-xs text-primary flex items-center gap-1.5 bg-primary/8 border border-primary/20 rounded-lg px-3 py-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Selected: {tradingInstruments.map(i => i.charAt(0).toUpperCase() + i.slice(1)).join(", ")}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── STEP 3: AI Provider ─────────────────────────── */}
            {step === 3 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold">Connect Your AI Provider</h2>
                  <p className="text-muted-foreground text-sm mt-1">This is the brain behind your signals. The AI reads live prices, your strategy, and your trading history to generate high-confidence entries.</p>
                </div>

                {/* Why it matters */}
                <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">Why connect an AI?</p>
                  <ul className="space-y-1.5">
                    {[
                      "Get real-time trade signals with entry, stop-loss, and take-profit levels",
                      "AI grades every trade you close — A+ to F — so you improve faster",
                      "Signals are built on ICT & Smart Money Concepts, not generic indicators",
                      "Your AI learns from your past trades over time and gets sharper",
                    ].map(point => (
                      <li key={point} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => setShowAiInfo(p => !p)}
                    data-testid="button-ai-info"
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors mt-1"
                  >
                    <Info className="w-3.5 h-3.5" />
                    {showAiInfo ? "Hide explanation" : "What's an API key? Read more →"}
                  </button>
                  <AnimatePresence>
                    {showAiInfo && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-primary/10 pt-3 mt-1 space-y-3 text-xs text-muted-foreground leading-relaxed">
                          <div>
                            <p className="font-semibold text-foreground mb-1">What is an AI API key?</p>
                            <p>Think of it like a password that lets TradeAI Terminal talk to an AI service (like ChatGPT or Claude) on your behalf. Without it, the app has no AI brain — it can't generate signals or grade your trades.</p>
                          </div>
                          <div>
                            <p className="font-semibold text-foreground mb-1">Do I pay for it?</p>
                            <p>You pay the AI provider directly — not us. Most have free tiers to start. <span className="text-foreground font-medium">Groq is completely free</span> and works great for beginners. OpenAI and Anthropic charge small amounts per use (usually cents per signal).</p>
                          </div>
                          <div>
                            <p className="font-semibold text-foreground mb-1">How do I get one?</p>
                            <ol className="space-y-1 list-decimal list-inside">
                              <li>Pick a provider below (Groq is free — good starting point)</li>
                              <li>Click the link shown after selecting a provider</li>
                              <li>Create a free account on their site</li>
                              <li>Copy your API key and paste it here</li>
                            </ol>
                          </div>
                          <div>
                            <p className="font-semibold text-foreground mb-1">Is it safe?</p>
                            <p>Yes. Your key is encrypted and stored only on your account. It never leaves our server in plain text and is only used to generate your signals.</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {AI_PROVIDERS.map(p => (
                    <motion.button key={p.id} whileTap={{ scale: 0.97 }}
                      onClick={() => { setSelectedProvider(p.id); setAiStatus("idle"); setAiMsg(""); setAiApiKey(""); setAiModel(""); }}
                      className={cn(
                        "p-3.5 rounded-xl border-2 text-left transition-all duration-150",
                        selectedProvider === p.id ? p.selectedBg : "border-border bg-card/40 hover:border-primary/40 hover:bg-muted/20"
                      )}
                      data-testid={`button-provider-${p.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xl">{p.logo}</span>
                        {selectedProvider === p.id && <CheckCircle2 className={cn("w-4 h-4", p.color)} />}
                      </div>
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className={cn("text-xs font-medium", p.color)}>{p.model}</p>
                    </motion.button>
                  ))}
                </div>

                <AnimatePresence>
                  {selectedProvider && (
                    <motion.div key="keyinput" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
                      <div className="space-y-1.5">
                        <Label className="font-semibold text-sm">{providerInfo?.name} API Key</Label>
                        <div className="relative">
                          <Input
                            type={showAiKey ? "text" : "password"}
                            placeholder={providerInfo?.placeholder}
                            value={aiApiKey}
                            onChange={e => { setAiApiKey(e.target.value); setAiStatus("idle"); setAiMsg(""); }}
                            className="h-11 bg-background/60 font-mono text-sm pr-10"
                            data-testid="input-ai-key"
                          />
                          <button onClick={() => setShowAiKey(!showAiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Get your key at <span className="text-primary font-medium">{providerInfo?.hint}</span>
                        </p>
                      </div>

                      <Button
                        onClick={testAi}
                        disabled={aiStatus === "testing" || !aiApiKey.trim()}
                        className={cn("w-full gap-2 h-11", aiStatus === "connected" && "bg-green-600 hover:bg-green-700 text-white")}
                        data-testid="button-test-ai"
                      >
                        {aiStatus === "testing"   ? <><Loader2 className="w-4 h-4 animate-spin" />Testing connection to {providerInfo?.name}…</>
                         : aiStatus === "connected" ? <><CheckCircle2 className="w-4 h-4" />Connected — Continue</>
                         : <><PlugZap className="w-4 h-4" />Test Live Connection</>}
                      </Button>

                      <FeedbackBar status={aiStatus} msg={aiMsg} />

                      {aiStatus === "connected" && aiModel && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg border border-border">
                          <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                          Active model: <span className="font-mono font-semibold text-foreground">{aiModel}</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {!selectedProvider && (
                  <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Select a provider above, enter your API key, then click Test Live Connection.
                  </div>
                )}
                {selectedProvider && !aiDone && (
                  <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    A successful connection test is required before continuing.
                  </div>
                )}
                {!aiDone && (
                  <div className="text-center pt-1">
                    <button
                      onClick={() => setAiSkipped(true)}
                      data-testid="button-skip-ai"
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                    >
                      Skip for now — I'll add my API key in Settings
                    </button>
                  </div>
                )}
                {aiSkipped && !aiDone && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/30 border border-border rounded-lg px-3 py-2.5">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    Skipped — AI signals won't work until you add a key in Settings. You can continue setup now.
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── STEP 4: Broker ──────────────────────────────── */}
            {step === 4 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold">Connect Brokerage</h2>
                  <p className="text-muted-foreground text-sm mt-1">Choose where your trades execute. You must verify the connection before continuing.</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {BROKER_OPTIONS.map(opt => (
                    <motion.button key={opt.id} whileTap={{ scale: 0.97 }}
                      onClick={() => { setBrokerType(opt.id); setBrokerStatus("idle"); setBrokerMsg(""); }}
                      className={cn("p-3.5 rounded-xl border-2 text-left transition-all",
                        brokerType === opt.id ? "border-primary bg-primary/8" : "border-border bg-card/40 hover:border-primary/40 hover:bg-muted/10"
                      )}
                      data-testid={`button-broker-${opt.id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <opt.Icon className={cn("w-5 h-5", brokerType === opt.id ? "text-primary" : "text-muted-foreground")} />
                        {brokerType === opt.id && <CheckCircle2 className="w-4 h-4 text-primary" />}
                      </div>
                      <p className="font-bold text-sm">{opt.title}</p>
                      <p className="text-[11px] text-muted-foreground mb-1.5">{opt.sub}</p>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", opt.badgeCls)}>{opt.badge}</span>
                    </motion.button>
                  ))}
                </div>

                {/* Credential fields */}
                <AnimatePresence mode="wait">
                  {brokerType === "demo" && (
                    <motion.div key="demo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="p-4 bg-green-500/8 border border-green-500/25 rounded-xl">
                      <p className="font-semibold text-green-400 mb-1.5 flex items-center gap-1.5 text-sm"><Monitor className="w-4 h-4" />Paper Trading Mode</p>
                      <p className="text-muted-foreground text-xs leading-relaxed">Starts with $10,000 virtual balance. All trades are fully simulated — zero real money at risk. You can switch to a live broker anytime from Settings.</p>
                    </motion.div>
                  )}

                  {brokerType === "mql5" && (
                    <motion.div key="mql5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                      <div className="flex items-start gap-2 text-[11px] text-blue-400 bg-blue-500/8 border border-blue-500/20 rounded-lg px-3 py-2">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        Credentials are saved and validated by the MT5 bridge at first connection. Use your Investor (read-only) password for security.
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-muted-foreground">Account Number <span className="text-destructive">*</span></Label>
                          <Input placeholder="12345678" value={mql5Account} onChange={e => { setMql5Account(e.target.value); setBrokerStatus("idle"); }}
                            className="h-10 bg-background/60 text-sm" data-testid="input-mt5-account" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-muted-foreground">Server (optional)</Label>
                          <Input placeholder="ICMarkets-Demo01" value={brokerServer} onChange={e => { setBrokerServer(e.target.value); setBrokerStatus("idle"); }}
                            className="h-10 bg-background/60 text-sm" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">Investor Password <span className="text-destructive">*</span></Label>
                        <div className="relative">
                          <Input type={showBrokerKey ? "text" : "password"} placeholder="••••••••" value={mql5Password}
                            onChange={e => { setMql5Password(e.target.value); setBrokerStatus("idle"); }}
                            className="h-10 bg-background/60 text-sm pr-9" data-testid="input-mt5-password" />
                          <button onClick={() => setShowBrokerKey(!showBrokerKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showBrokerKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {brokerType === "oanda" && (
                    <motion.div key="oanda" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                      <div className="flex items-start gap-2 text-[11px] text-violet-400 bg-violet-500/8 border border-violet-500/20 rounded-lg px-3 py-2">
                        <CheckCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        A real API call is made to OANDA's servers to verify your key. Requires a live or practice OANDA account.
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">OANDA API Key <span className="text-destructive">*</span></Label>
                        <div className="relative">
                          <Input type={showBrokerKey ? "text" : "password"} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-xxx"
                            value={brokerApiKey} onChange={e => { setBrokerApiKey(e.target.value); setBrokerStatus("idle"); }}
                            className="h-10 bg-background/60 font-mono text-sm pr-9" data-testid="input-oanda-key" />
                          <button onClick={() => setShowBrokerKey(!showBrokerKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showBrokerKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Get at{" "}
                          <a href="https://fxtrade.oanda.com/account/login" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">fxtrade.oanda.com → Manage API Access</a>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          No account yet?{" "}
                          <a href="https://www.oanda.com/register/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 font-medium hover:underline">Create a free practice account →</a>
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {brokerType === "interactive" && (
                    <motion.div key="ibkr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                      <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        Credentials are saved and the IBKR Client Portal Gateway connects at runtime. Ensure the gateway is running locally.
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">IBKR API Key / Account ID <span className="text-destructive">*</span></Label>
                        <div className="relative">
                          <Input type={showBrokerKey ? "text" : "password"} placeholder="U1234567 or your API key"
                            value={brokerApiKey} onChange={e => { setBrokerApiKey(e.target.value); setBrokerStatus("idle"); }}
                            className="h-10 bg-background/60 font-mono text-sm pr-9" data-testid="input-ibkr-key" />
                          <button onClick={() => setShowBrokerKey(!showBrokerKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showBrokerKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button onClick={testBroker} disabled={brokerStatus === "testing"}
                  className={cn("w-full gap-2 h-11", brokerStatus === "connected" && "bg-green-600 hover:bg-green-700 text-white")}
                  data-testid="button-test-broker">
                  {brokerStatus === "testing"   ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying…</>
                   : brokerStatus === "connected" ? <><CheckCircle2 className="w-4 h-4" />Verified — Continue</>
                   : <><Wifi className="w-4 h-4" />Verify Connection</>}
                </Button>

                <FeedbackBar status={brokerStatus} msg={brokerMsg} />

                {!brokerDone && (
                  <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    You must verify the connection before continuing.
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── STEP 5: Strategy & Preferences ─────────────── */}
            {step === 5 && (
              <motion.div key="s4" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold">Strategy & Preferences</h2>
                  <p className="text-muted-foreground text-sm mt-1">Configure your risk profile and trading behavior. You can change these anytime in Settings.</p>
                </div>

                {/* Account size + Risk row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5 col-span-1">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />Account Size
                    </Label>
                    <Input type="number" min="100" placeholder="10000" value={accountSize}
                      onChange={e => setAccountSize(e.target.value)}
                      className="h-11 bg-background/60 text-sm font-mono" data-testid="input-account-size" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Percent className="w-3 h-3" />Risk / Trade
                    </Label>
                    <Select value={riskPercent} onValueChange={setRiskPercent}>
                      <SelectTrigger className="h-11 bg-background/60 text-sm" data-testid="select-risk-percent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.5">0.5% — Ultra low</SelectItem>
                        <SelectItem value="1">1% — Conservative</SelectItem>
                        <SelectItem value="2">2% — Moderate</SelectItem>
                        <SelectItem value="3">3% — Aggressive</SelectItem>
                        <SelectItem value="5">5% — High risk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Activity className="w-3 h-3" />Max Positions
                    </Label>
                    <Select value={maxPositions} onValueChange={setMaxPositions}>
                      <SelectTrigger className="h-11 bg-background/60 text-sm" data-testid="select-max-positions">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["1","2","3","5","8","10"].map(v => <SelectItem key={v} value={v}>{v} position{v !== "1" ? "s" : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Primary goal */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Primary Goal</Label>
                  <Select value={strategyGoal} onValueChange={setStrategyGoal}>
                    <SelectTrigger className="h-12 bg-background/50" data-testid="select-strategy-goal"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aggressive">🚀 Aggressive Growth — High risk, high reward</SelectItem>
                      <SelectItem value="balanced">⚖️ Balanced Growth — Medium risk</SelectItem>
                      <SelectItem value="conservative">🛡️ Capital Preservation — Low risk</SelectItem>
                      <SelectItem value="income">💰 Consistent Daily Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Trading style */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Trading Style</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "scalp", l: "Scalping",    s: "Minutes–hours" },
                      { id: "day",   l: "Day Trading", s: "Intraday only" },
                      { id: "swing", l: "Swing",       s: "Days–weeks"    },
                    ].map(x => (
                      <button key={x.id} onClick={() => setTradingStyle(x.id)}
                        className={cn("p-3 rounded-xl border-2 text-center transition-all",
                          tradingStyle === x.id ? "border-primary bg-primary/8" : "border-border hover:border-primary/40"
                        )}
                        data-testid={`button-style-${x.id}`}>
                        <p className="font-semibold text-sm">{x.l}</p>
                        <p className="text-[11px] text-muted-foreground">{x.s}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto-trade toggle */}
                <div className={cn("flex items-start gap-3 p-4 rounded-xl border-2 transition-all", autoTrade ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20")}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Zap className={cn("w-4 h-4", autoTrade ? "text-primary" : "text-muted-foreground")} />
                      <p className="font-semibold text-sm">Auto-Trade</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">When enabled, the AI automatically executes pending signals within your risk limits. You can toggle this anytime.</p>
                    {autoTrade && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        Auto-Trade is active — AI will execute signals every 60s.
                      </motion.p>
                    )}
                  </div>
                  <Switch checked={autoTrade} onCheckedChange={setAutoTrade} data-testid="switch-autotrade" />
                </div>

                {/* AI focus instructions */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground flex justify-between">
                    <span>AI Focus Instructions</span>
                    <span className="font-normal">Optional</span>
                  </Label>
                  <Textarea
                    placeholder="e.g. Focus on EURUSD and XAUUSD. Avoid trading during high-impact news. Look for breakout setups only."
                    className="h-20 resize-none bg-background/50 text-sm"
                    value={strategyDesc} onChange={e => setStrategyDesc(e.target.value)}
                    data-testid="textarea-ai-instructions"
                  />
                </div>
              </motion.div>
            )}

            {/* ─── STEP 6: Done ────────────────────────────────── */}
            {step === 6 && (
              <motion.div key="s5" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-5">
                <div className="flex flex-col items-center text-center pt-2">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5, delay: 0.15 }}
                    className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </motion.div>
                  <h2 className="text-2xl font-bold">You're all set!</h2>
                  <p className="text-muted-foreground text-sm mt-1.5 max-w-sm">Your terminal is configured and the AI is ready to analyze markets and generate signals.</p>
                </div>

                {/* Setup summary */}
                <div className="bg-muted/30 rounded-xl border border-border p-4 space-y-2.5">
                  <p className="font-semibold text-sm text-foreground mb-1">Your configuration</p>
                  {[
                    { k: "AI Provider",   v: providerInfo ? `${providerInfo.name} (${aiModel || providerInfo.model})` : "—" },
                    { k: "Broker",        v: brokerInfo?.title ?? brokerType },
                    { k: "Account Size",  v: `$${parseFloat(accountSize || "10000").toLocaleString()}` },
                    { k: "Risk / Trade",  v: `${riskPercent}%` },
                    { k: "Max Positions", v: maxPositions },
                    { k: "Style",         v: `${strategyGoal} · ${tradingStyle}` },
                    { k: "Auto-Trade",    v: autoTrade ? "Enabled ⚡" : "Disabled" },
                  ].map(row => (
                    <div key={row.k} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{row.k}</span>
                      <span className="font-semibold text-foreground capitalize">{row.v}</span>
                    </div>
                  ))}
                </div>

                {/* Feature icons */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">What's waiting for you</p>
                  <div className="grid grid-cols-3 gap-2">
                    {FEATURES.map(({ Icon, label }) => (
                      <div key={label} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/50 text-xs font-medium">
                        <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                        {label}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Shield className="w-3.5 h-3.5 shrink-0 text-green-500" />
                  All credentials encrypted. You can update your settings anytime from the Settings page.
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-6 pt-5 border-t border-border/50">
            {step > 1
              ? <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={saving} data-testid="button-back">Back</Button>
              : <div />}
            <Button
              size="lg"
              onClick={handleNext}
              disabled={saving || (!canProceed() && step > 1 && step < 4)}
              className={cn("gap-2 px-8",
                !canProceed() && step > 1 && step < 4 && "opacity-60 cursor-not-allowed"
              )}
              data-testid="button-next"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                : step === totalSteps
                  ? "Launch Terminal"
                  : !canProceed() && step === 2
                    ? "Test AI Connection First"
                    : !canProceed() && step === 3
                      ? "Verify Broker First"
                      : <><span>Continue</span><ArrowRight className="w-4 h-4" /></>
              }
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
