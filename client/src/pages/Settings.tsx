import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings as SettingsIcon, Bell, Shield, LogOut, Save,
  CheckCircle2, XCircle, Loader2, Wifi, Eye, EyeOff,
  PlugZap, Monitor, CandlestickChart, Building2, Server,
  AlertCircle, Bot, LineChart, User, RefreshCw, Radio, BarChart2,
  Mail, Send, Link2, Copy, Smartphone, History, Sparkles, Zap,
  Star, TrendingUp, BookOpen, Activity, Crown, ChevronDown, ChevronUp,
  Map, Globe,
} from "lucide-react";
import { useTourReset } from "@/components/AppTour";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useToast } from "@/hooks/use-toast";
import { useSettings, useSaveSettings, useMarketStatus } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserSettings } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

type TestStatus = "idle" | "testing" | "connected" | "failed";

const AI_PROVIDER_LIST = [
  { id: "openai", name: "OpenAI", model: "GPT-4o", color: "text-pos", placeholder: "sk-proj-...", hint: "Get key at platform.openai.com → API Keys", logo: "" },
  { id: "anthropic", name: "Anthropic", model: "Claude 3.5", color: "text-warn", placeholder: "sk-ant-...", hint: "Get key at console.anthropic.com", logo: "" },
  { id: "gemini", name: "Google Gemini", model: "Gemini 1.5 Pro", color: "text-info", placeholder: "AIzaSy...", hint: "Get key at aistudio.google.com", logo: "" },
  { id: "groq", name: "Groq", model: "Llama 3.1 70B", color: "text-warn", placeholder: "gsk_...", hint: "Get key at console.groq.com", logo: "" },
  { id: "xai", name: "Grok by xAI", model: "Grok-2", color: "text-info", placeholder: "xai-...", hint: "Get key at console.x.ai", logo: "𝕏" },
  { id: "perplexity", name: "Perplexity", model: "Sonar Online", color: "text-info", placeholder: "pplx-...", hint: "Get key at perplexity.ai/settings/api", logo: "" },
];

interface AIProviderStatus {
  connected: boolean; connectedAt: string | null; hasKey: boolean;
}

interface IntegrationStatus {
  broker: { connected: boolean; connectedAt: string | null; brokerType: string; account: string | null };
  tradingview: { connected: boolean; connectedAt: string | null; username: string | null };
  ai: {
    selectedProvider: string;
    openai: AIProviderStatus; anthropic: AIProviderStatus; gemini: AIProviderStatus;
    groq: AIProviderStatus; xai: AIProviderStatus; perplexity: AIProviderStatus;
  };
}

const CHANGELOG: Array<{
  version: string;
  date: string;
  label?: "new" | "update" | "fix";
  features: Array<{ icon: React.ElementType; text: string; tag?: string }>;
}> = [
  {
    version: "2.6", date: "Mar 25, 2026", label: "new",
    features: [
      { icon: Globe, text: "Multi-asset news — instrument tabs (Forex, Stocks, Crypto, Bonds, Commodities, Indices) with AI sentiment for each asset class", tag: "News" },
      { icon: Map, text: "Trading Hours & Sessions — set your timezone, select active sessions (London, NY, Tokyo…), and configure off-hours AI behavior", tag: "Settings" },
      { icon: Bot, text: "Off-hours AI Autonomy — AI can trade autonomously at reduced risk outside your preferred sessions, or generate alerts only", tag: "AI" },
      { icon: Sparkles, text: "Instrument selection in onboarding — personalize the AI and news to the markets you trade (forex, stocks, crypto, bonds, commodities, indices)", tag: "Onboarding" },
    ],
  },
  {
    version: "2.5", date: "Mar 24, 2026", label: "new",
    features: [
      { icon: Crown, text: "Admin Panel with full user management, platform stats, trade monitoring, marketplace moderation, and broadcast messaging", tag: "Admin" },
      { icon: RefreshCw, text: "Refresh Account button — reload all your account data without signing out", tag: "Account" },
      { icon: History, text: "Update Log (this panel) — see every improvement made to the platform", tag: "New" },
    ],
  },
  {
    version: "2.4", date: "Mar 23, 2026", label: "new",
    features: [
      { icon: Activity, text: "Platform Health Score — rate your entire setup across 8 categories with improvement suggestions for each", tag: "New" },
      { icon: TrendingUp, text: "Strategy Scorecard — 6-section graded analysis with Capital, Risk, R:R, Exposure, Style Alignment, and AI Instructions scores", tag: "New" },
    ],
  },
  {
    version: "2.3", date: "Mar 22, 2026", label: "update",
    features: [
      { icon: Sparkles, text: "Momentum Forecast now visible on the Active Profile tab — no more hidden away in Strategy Builder", tag: "UX" },
      { icon: Bot, text: "AI Strategy Analysis updated with recommended alternative strategies and one-click Apply", tag: "AI" },
    ],
  },
  {
    version: "2.2", date: "Mar 20, 2026", label: "new",
    features: [
      { icon: BookOpen, text: "AI Trade Reviews — automatic post-trade analysis with grades (A+ to F), strengths, mistakes, and lessons extracted", tag: "AI" },
      { icon: Sparkles, text: "AI Weekly Report — personal coach report covering your last 7 days of trading with actionable feedback", tag: "AI" },
      { icon: Star, text: "AI Knowledge Base — 24 expert lessons seeded into every signal prompt for higher-quality trade calls", tag: "AI" },
    ],
  },
  {
    version: "2.1", date: "Mar 18, 2026", label: "update",
    features: [
      { icon: Smartphone, text: "Push Notifications — real-time alerts on your device via browser push (no app install needed)", tag: "New" },
      { icon: Mail, text: "Email Notifications — trade alerts and weekly digests via custom SMTP or Gmail", tag: "New" },
      { icon: Bell, text: "10-minute trade digest — automatic push summary of open positions sent every 10 minutes", tag: "Auto" },
    ],
  },
  {
    version: "2.0", date: "Mar 15, 2026", label: "new",
    features: [
      { icon: Shield, text: "Risk Management Dashboard — daily loss limits, max drawdown tracking, auto-pause when limits are hit", tag: "Risk" },
      { icon: Zap, text: "Auto-Trade Mode — AI signals execute automatically at high confidence without manual confirmation", tag: "Trading" },
      { icon: Bot, text: "5 AI Providers — OpenAI, Anthropic Claude, Google Gemini, Groq, and Perplexity all supported", tag: "AI" },
      { icon: TrendingUp, text: "Strategy Marketplace — publish, discover, and copy community trading strategies", tag: "Social" },
    ],
  },
  {
    version: "1.5", date: "Mar 10, 2026", label: "update",
    features: [
      { icon: BarChart2, text: "Analytics Dashboard — 6-tab deep-dive into your performance, patterns, and psychological trends", tag: "Analytics" },
      { icon: BookOpen, text: "Trade Journal — log every trade with emotions, notes, and outcome tagging", tag: "Journal" },
      { icon: Bell, text: "Price Alerts — set alerts on any forex pair or asset, get notified when levels are hit", tag: "Alerts" },
    ],
  },
  {
    version: "1.0", date: "Mar 5, 2026", label: "new",
    features: [
      { icon: LineChart, text: "Trading Terminal with live charts, order panel, and real-time position tracking", tag: "Core" },
      { icon: Sparkles, text: "AI Signal Generation powered by ICT/SMC methodology and institutional knowledge", tag: "AI" },
      { icon: TrendingUp, text: "Strategy Builder — configure your trading profile and get AI momentum forecasts", tag: "Core" },
    ],
  },
];

const LABEL_COLOR: Record<string, string> = {
  new:    "bg-pos/20 text-pos border-pos/30",
  update: "bg-info/20 text-info border-info/30",
  fix:    "bg-warn/20 text-warn border-warn/30",
};

function ChangelogSection() {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["2.5"]));

  const toggle = (version: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(version) ? next.delete(version) : next.add(version);
      return next;
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
      className="bg-card/50 border border-border rounded-xl overflow-hidden">

      <div className="px-5 py-4 border-b border-border/60 bg-card/30 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <History className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm">Update Log</p>
          <p className="text-[11px] text-muted-foreground">Full history of platform improvements and new features</p>
        </div>
      </div>

      <div className="divide-y divide-border/40">
        {CHANGELOG.map((entry, idx) => {
          const isOpen = expanded.has(entry.version);
          const isLatest = idx === 0;
          return (
            <div key={entry.version}>
              <button
                onClick={() => toggle(entry.version)}
                className="w-full px-5 py-3 flex items-center gap-3 hover:bg-muted/10 transition-colors text-left"
                data-testid={`changelog-toggle-v${entry.version}`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-bold text-sm text-foreground">v{entry.version}</span>
                  {isLatest && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                      LATEST
                    </span>
                  )}
                  {entry.label && !isLatest && (
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", LABEL_COLOR[entry.label])}>
                      {entry.label.toUpperCase()}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground ml-1">{entry.date}</span>
                  <span className="text-[11px] text-muted-foreground hidden sm:block">·</span>
                  <span className="text-[11px] text-muted-foreground hidden sm:block">{entry.features.length} change{entry.features.length !== 1 ? "s" : ""}</span>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4 space-y-2">
                      {entry.features.map((f, i) => (
                        <div key={i} className="flex items-start gap-3" data-testid={`changelog-item-${entry.version}-${i}`}>
                          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <f.icon className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0 flex items-start gap-2 flex-wrap">
                            {f.tag && (
                              <span className="text-[10px] font-bold bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded shrink-0 mt-0.5">{f.tag}</span>
                            )}
                            <p className="text-xs text-muted-foreground leading-relaxed">{f.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function WebhookTokenField() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    apiRequest("GET", "/api/settings/webhook").then(r => r.json()).then(d => setToken(d.token)).catch(() => {});
  }, []);
  const rotate = async () => {
    const d = await apiRequest("POST", "/api/settings/webhook/rotate").then(r => r.json());
    setToken(d.token);
    toast({ title: "Token rotated", description: "Update your TradingView alerts with the new token." });
  };
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1 block">Webhook Token (private)</Label>
      <div className="flex gap-2">
        <Input value={token ? (shown ? token : "•".repeat(24)) : "Loading…"} readOnly className="font-mono text-xs bg-muted/20" onFocus={() => setShown(true)} />
        <Button variant="outline" size="icon" className="shrink-0" disabled={!token}
          onClick={() => { navigator.clipboard.writeText(token!); toast({ title: "Token copied" }); }}>
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="shrink-0" title="Rotate token" onClick={rotate}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const { data: rawSettings, refetch } = useSettings();
  const settings = rawSettings as UserSettings | null | undefined;
  const saveSettings = useSaveSettings();

  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Form state
  const [tvUsername, setTvUsername] = useState("");
  const [brokerType, setBrokerType] = useState("demo");
  const [mql5Account, setMql5Account] = useState("");
  const [mql5Password, setMql5Password] = useState("");
  const [mql5Server, setMql5Server] = useState("");
  const [brokerApiKey, setBrokerApiKey] = useState("");
  const [brokerBalance, setBrokerBalance] = useState("");
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [showBrokerPass, setShowBrokerPass] = useState(false);

  // Push notifications
  const push = usePushNotifications();
  const [pushTestDone, setPushTestDone] = useState(false);

  // Preferences
  const [notifications, setNotifications] = useState(true);
  const [autoTrade, setAutoTrade] = useState(false);
  const [riskMode, setRiskMode] = useState("moderate");

  // Trading Hours
  const [tradingTimezone, setTradingTimezone] = useState("UTC");
  const [activeSessions, setActiveSessions] = useState<string[]>([]);
  const [offHoursBehavior, setOffHoursBehavior] = useState("pause");
  const [offHoursRiskReduction, setOffHoursRiskReduction] = useState(50);

  // Per-integration test state
  const [tvStatus, setTvStatus] = useState<TestStatus>("idle");
  const [tvMsg, setTvMsg] = useState("");
  const [bkStatus, setBkStatus] = useState<TestStatus>("idle");
  const [bkMsg, setBkMsg] = useState("");

  // Email notifications
  const [emailAddress, setEmailAddress] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [emailTestStatus, setEmailTestStatus] = useState<TestStatus>("idle");
  const [emailTestMsg, setEmailTestMsg] = useState("");

  // MT5 Bridge
  const [mt5BridgeUrl, setMt5BridgeUrl] = useState("");
  const [mt5Status, setMt5Status] = useState<TestStatus>("idle");
  const [mt5Msg, setMt5Msg] = useState("");

  // Refresh account
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const resetTour = useTourReset();
  const refreshAccount = async () => {
    setRefreshing(true); setRefreshed(false);
    await queryClient.invalidateQueries();
    await refetch();
    await loadStatus();
    setRefreshing(false); setRefreshed(true);
    setTimeout(() => setRefreshed(false), 3000);
    toast({ title: "Account refreshed", description: "All data has been reloaded from the server.", className: "border-pos/50" });
  };

  const testMT5 = async () => {
    if (!mt5BridgeUrl.trim()) { setMt5Msg("Enter bridge URL first."); setMt5Status("failed"); return; }
    setMt5Status("testing"); setMt5Msg("");
    try {
      const res = await apiRequest("POST", "/api/broker/mt5/test", { bridgeUrl: mt5BridgeUrl });
      const data = await res.json();
      setMt5Status(data.connected ? "connected" : "failed");
      setMt5Msg(data.message || (data.connected ? "Connected!" : "Failed"));
    } catch { setMt5Status("failed"); setMt5Msg("Network error."); }
  };

  const testEmail = async () => {
    setEmailTestStatus("testing"); setEmailTestMsg("");
    try {
      const res = await apiRequest("POST", "/api/email/test", { email: emailAddress });
      const data = await res.json();
      setEmailTestStatus(data.ok ? "connected" : "failed");
      setEmailTestMsg(data.message || (data.ok ? "Test email sent!" : "Failed"));
    } catch { setEmailTestStatus("failed"); setEmailTestMsg("Network error."); }
  };

  const saveEmailSettings = async () => {
    await saveSettings.mutateAsync({
      emailAddress, emailNotifications, smtpHost,
      smtpPort: smtpPort ? parseInt(smtpPort) : undefined,
      smtpUser, smtpPass,
    } as any);
    toast({ title: "Email settings saved", className: "border-pos/50" });
  };

  // Market data (Twelve Data)
  const { data: marketStatusRaw, refetch: refetchMarketStatus } = useMarketStatus();
  const marketStatus = marketStatusRaw as any;
  const [mdVerifyStatus, setMdVerifyStatus] = useState<TestStatus>("idle");
  const [mdVerifyMsg, setMdVerifyMsg] = useState("");

  const verifyMarketData = async () => {
    setMdVerifyStatus("testing"); setMdVerifyMsg("");
    try {
      const res = await apiRequest("POST", "/api/market/verify", {});
      const data = await res.json();
      setMdVerifyStatus(data.connected ? "connected" : "failed");
      setMdVerifyMsg(data.message);
      if (data.connected) { refetchMarketStatus(); toast({ title: "Market data connected!", description: data.message, className: "border-pos/50" }); }
    } catch { setMdVerifyStatus("failed"); setMdVerifyMsg("Network error. Try again."); }
  };

  // AI provider state
  const [aiKeys, setAiKeys] = useState<Record<string, string>>({});
  const [aiKeyVisibility, setAiKeyVisibility] = useState<Record<string, boolean>>({});
  const [aiProviderStatuses, setAiProviderStatuses] = useState<Record<string, TestStatus>>({
    openai: "idle", anthropic: "idle", gemini: "idle", groq: "idle", perplexity: "idle",
  });
  const [aiMsgs, setAiMsgs] = useState<Record<string, string>>({});

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await apiRequest("GET", "/api/settings/status");
      const data: IntegrationStatus = await res.json();
      setIntegrations(data);
      if (data.tradingview?.connected) setTvStatus("connected");
      if (data.broker?.connected) setBkStatus("connected");
    } catch { /* ignore */ } finally {
      setLoadingStatus(false);
    }
  };

  const testAiProvider = async (providerId: string) => {
    const key = aiKeys[providerId]?.trim();
    if (!key) { setAiMsgs(p => ({ ...p, [providerId]: "Enter your API key first." })); setAiProviderStatuses(p => ({ ...p, [providerId]: "failed" })); return; }
    setAiProviderStatuses(p => ({ ...p, [providerId]: "testing" })); setAiMsgs(p => ({ ...p, [providerId]: "" }));
    try {
      const res = await apiRequest("POST", "/api/settings/test-ai", { provider: providerId, apiKey: key });
      const data = await res.json();
      setAiProviderStatuses(p => ({ ...p, [providerId]: data.connected ? "connected" : "failed" }));
      setAiMsgs(p => ({ ...p, [providerId]: data.message }));
      if (data.connected) { await loadStatus(); refetch(); toast({ title: `${data.provider || providerId} connected!`, description: data.message, className: "border-pos/50" }); }
    } catch { setAiProviderStatuses(p => ({ ...p, [providerId]: "failed" })); setAiMsgs(p => ({ ...p, [providerId]: "Network error. Try again." })); }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (settings) {
      setTvUsername(settings.tradingViewUser ?? "");
      setBrokerType(settings.brokerType ?? "demo");
      setMql5Account(settings.mql5Account ?? "");
      setMql5Password(settings.mql5Password ?? "");
      setMql5Server(settings.brokerServer ?? "");
      setBrokerApiKey(settings.brokerApiKey ?? "");
      setBrokerBalance(settings.brokerBalance ? String(settings.brokerBalance) : "");
      setNotifications(settings.notifications ?? true);
      setAutoTrade(settings.autoTrade ?? false);
      setRiskMode(settings.riskMode ?? "moderate");
      // Trading Hours
      const s = settings as any;
      setTradingTimezone(s.tradingTimezone ?? "UTC");
      setActiveSessions(s.activeSessions ?? []);
      setOffHoursBehavior(s.offHoursBehavior ?? "pause");
      setOffHoursRiskReduction(s.offHoursRiskReduction ?? 50);
      // Email settings
      setEmailAddress(s.emailAddress ?? "");
      setEmailNotifications(s.emailNotifications ?? false);
      setSmtpHost(s.smtpHost ?? "");
      setSmtpPort(String(s.smtpPort ?? "587"));
      setSmtpUser(s.smtpUser ?? "");
    }
  }, [settings]);

  const testTradingView = async () => {
    setTvStatus("testing"); setTvMsg("");
    try {
      const res = await apiRequest("POST", "/api/settings/test-tradingview", { username: tvUsername });
      const data = await res.json();
      setTvStatus(data.connected ? "connected" : "failed");
      setTvMsg(data.message);
      if (data.connected) { await loadStatus(); refetch(); toast({ title: "TradingView linked!", description: data.message, className: "border-pos/50" }); }
    } catch { setTvStatus("failed"); setTvMsg("Network error. Try again."); }
  };

  const testBroker = async () => {
    setBkStatus("testing"); setBkMsg("");
    try {
      const res = await apiRequest("POST", "/api/settings/test-broker", {
        brokerType, mql5Account, mql5Password, brokerServer: mql5Server, brokerApiKey, brokerBalance,
      });
      const data = await res.json();
      setBkStatus(data.connected ? "connected" : "failed");
      setBkMsg(data.message);
      if (data.connected) { await loadStatus(); refetch(); toast({ title: "Broker connected!", description: data.message, className: "border-pos/50" }); }
    } catch { setBkStatus("failed"); setBkMsg("Network error. Try again."); }
  };

  const saveBalance = async () => {
    if (!brokerBalance || parseFloat(brokerBalance) <= 0) {
      toast({ title: "Invalid balance", description: "Enter a balance greater than 0.", variant: "destructive" });
      return;
    }
    setBalanceSaving(true);
    try {
      await apiRequest("POST", "/api/settings/balance", { brokerBalance });
      await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/risk/dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/portfolio/risk"] });
      toast({ title: "Balance updated!", description: `Account balance set to $${parseFloat(brokerBalance).toLocaleString()}.`, className: "border-pos/50" });
    } catch { toast({ title: "Failed to save balance", variant: "destructive" }); }
    finally { setBalanceSaving(false); }
  };

  const savePrefs = async () => {
    try {
      await saveSettings.mutateAsync({ notifications, autoTrade, riskMode } as any);
      toast({ title: "Preferences saved", className: "border-pos/50" });
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
  };

  const saveHours = async () => {
    try {
      await saveSettings.mutateAsync({
        tradingTimezone, activeSessions, offHoursBehavior, offHoursRiskReduction,
      } as any);
      toast({ title: "Trading hours saved", className: "border-pos/50" });
    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
  };

  const toggleSession = (id: string) =>
    setActiveSessions(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  // --- Sub-components ---

  const StatusPill = ({ status, connectedAt }: { status: TestStatus; connectedAt?: string | null }) => (
    <div className={cn(
      "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border",
      status === "connected" && "text-pos bg-pos/10 border-pos/25",
      status === "failed" && "text-neg bg-neg/10 border-neg/25",
      status === "testing" && "text-warn bg-warn/10 border-warn/25",
      status === "idle" && "text-muted-foreground bg-muted/50 border-border",
    )}>
      {status === "connected" && <><div className="w-1.5 h-1.5 rounded-full bg-pos animate-pulse" /> Connected</>}
      {status === "failed" && <><XCircle className="w-3 h-3" /> Failed</>}
      {status === "testing" && <><Loader2 className="w-3 h-3 animate-spin" /> Testing…</>}
      {status === "idle" && <><div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" /> Not connected</>}
      {status === "connected" && connectedAt && (
        <span className="text-muted-foreground font-normal ml-0.5">
          · {formatDistanceToNow(new Date(connectedAt), { addSuffix: true })}
        </span>
      )}
    </div>
  );

  const FeedbackBar = ({ status, msg }: { status: TestStatus; msg: string }) => {
    if (status === "idle" || !msg) return null;
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg border",
          status === "connected" && "bg-pos/8 border-pos/25 text-pos",
          status === "failed" && "bg-neg/8 border-neg/25 text-neg",
          status === "testing" && "bg-warn/8 border-warn/25 text-warn",
        )}
      >
        {status === "connected" && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
        {status === "failed" && <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
        {msg}
      </motion.div>
    );
  };

  const brokerMeta: Record<string, { label: string; Icon: any }> = {
    demo: { label: "Demo / Paper Trading", Icon: Monitor },
    mql5: { label: "MetaTrader 5 (bridge)", Icon: CandlestickChart },
    oanda: { label: "OANDA", Icon: Building2 },
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-hidden flex flex-col h-full bg-background">
        {/* Header */}
        <div className="h-16 border-b border-border px-6 py-4 bg-card/40 shrink-0 flex items-center justify-between">
          <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="text-xl font-bold flex items-center gap-3">
            <SettingsIcon className="w-6 h-6 text-primary" />
            Settings & Integrations
          </motion.h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={loadStatus} disabled={loadingStatus}>
              <RefreshCw className={cn("w-3.5 h-3.5", loadingStatus && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive gap-2" onClick={logout}>
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-5 pb-20">

            {/* Account card */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-card/50 border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center font-bold text-xl text-primary">
                    {user?.username?.charAt(0).toUpperCase()}
                  </div>
                  {(user as any)?.isAdmin && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-warn flex items-center justify-center border-2 border-background">
                      <Crown className="w-2.5 h-2.5 text-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{user?.username}</p>
                    {(user as any)?.isAdmin && (
                      <span className="text-[10px] bg-warn/20 text-warn px-1.5 py-0.5 rounded font-bold">ADMIN</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Active session · All data synced</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-pos font-medium shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-pos animate-pulse" />
                  Online
                </div>
              </div>

              {/* Refresh account button */}
              <button
                onClick={refreshAccount}
                disabled={refreshing}
                data-testid="button-refresh-account"
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-lg border py-2 text-xs font-semibold transition-all duration-200",
                  refreshed
                    ? "border-pos/40 bg-pos/10 text-pos"
                    : "border-border bg-background/50 text-muted-foreground hover:text-foreground hover:bg-muted/30",
                  refreshing && "opacity-60"
                )}
              >
                {refreshing ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Refreshing account…</>
                ) : refreshed ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Account refreshed successfully</>
                ) : (
                  <><RefreshCw className="w-3.5 h-3.5" /> Refresh Account</>
                )}
              </button>
            </motion.div>

            {/* ━━━━ INTEGRATIONS ━━━━ */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">Connected Integrations</p>

              {/* ── Twelve Data — Market Feed ── */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="bg-card/50 border border-border rounded-xl overflow-hidden mb-3">
                <div className="px-5 py-4 border-b border-border/60 bg-card/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-pos/15 flex items-center justify-center">
                      <BarChart2 className="w-4 h-4 text-pos" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Yahoo Finance — Live Prices</p>
                      <p className="text-[11px] text-muted-foreground">
                        {marketStatus?.status === "connected"
                          ? "Connected · Real-time forex · No API key required"
                          : marketStatus?.status === "failed"
                          ? "Connection failed — check server connectivity"
                          : "Free real-time feed · No account needed"}
                      </p>
                    </div>
                  </div>
                  <StatusPill
                    status={mdVerifyStatus !== "idle" ? mdVerifyStatus : (marketStatus?.status === "connected" ? "connected" : "idle")}
                    connectedAt={marketStatus?.lastVerifiedAt ? new Date(marketStatus.lastVerifiedAt).toISOString() : null}
                  />
                </div>
                <div className="p-5 space-y-3">
                  <div className="bg-muted/20 border border-border rounded-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-pos" /> No API key required
                    </p>
                    <p className="text-muted-foreground">Prices come directly from Yahoo Finance — completely free, no account or key needed. All users get real-time forex data automatically.</p>
                    {marketStatus?.cacheAge != null && (
                      <p className="text-muted-foreground">Cache age: <span className="font-mono text-foreground">{Math.round(marketStatus.cacheAge / 1000)}s</span> · Refreshes every 30s</p>
                    )}
                  </div>
                  <Button
                    onClick={verifyMarketData}
                    disabled={mdVerifyStatus === "testing"}
                    className={cn("w-full gap-2", mdVerifyStatus === "connected" && "bg-pos hover:bg-pos")}
                    data-testid="button-verify-marketdata"
                  >
                    {mdVerifyStatus === "testing" ? <><Loader2 className="w-4 h-4 animate-spin" />Pinging Twelve Data…</>
                      : mdVerifyStatus === "connected" ? <><CheckCircle2 className="w-4 h-4" />Live — Re-verify</>
                      : <><Wifi className="w-4 h-4" />Verify Live Connection</>}
                  </Button>
                  <FeedbackBar status={mdVerifyStatus} msg={mdVerifyMsg} />
                </div>
              </motion.div>

              {/* ── TradingView ── */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="bg-card/50 border border-border rounded-xl overflow-hidden mb-3">
                <div className="px-5 py-4 border-b border-border/60 bg-card/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center justify-center">
                      <LineChart className="w-4 h-4 text-info" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">TradingView</p>
                      <p className="text-[11px] text-muted-foreground">
                        {integrations?.tradingview.username ? `@${integrations.tradingview.username}` : "No account linked"}
                      </p>
                    </div>
                  </div>
                  <StatusPill status={tvStatus} connectedAt={integrations?.tradingview.connectedAt} />
                </div>
                <div className="p-5 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Username</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="your_tradingview_username"
                        value={tvUsername}
                        onChange={(e) => { setTvUsername(e.target.value); setTvStatus("idle"); setTvMsg(""); }}
                        className="h-10 bg-background/60 text-sm flex-1"
                        data-testid="input-tradingview-username"
                      />
                      <Button
                        onClick={testTradingView}
                        disabled={tvStatus === "testing" || !tvUsername.trim()}
                        className={cn("h-10 px-4 gap-2 shrink-0", tvStatus === "connected" && "bg-pos hover:bg-pos")}
                        data-testid="button-test-tradingview"
                      >
                        {tvStatus === "testing" ? <Loader2 className="w-4 h-4 animate-spin" />
                          : tvStatus === "connected" ? <CheckCircle2 className="w-4 h-4" />
                          : <PlugZap className="w-4 h-4" />}
                        {tvStatus === "testing" ? "Checking…" : tvStatus === "connected" ? "Verified" : "Verify"}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">We'll verify this username exists on TradingView.</p>
                  </div>
                  <FeedbackBar status={tvStatus} msg={tvMsg} />
                </div>
              </motion.div>

              {/* ── AI Providers ── */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="bg-card/50 border border-border rounded-xl overflow-hidden mb-3">
                <div className="px-5 py-4 border-b border-border/60 bg-card/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-info" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">AI Providers</p>
                      <p className="text-[11px] text-muted-foreground">
                        {integrations?.ai.selectedProvider && integrations.ai.selectedProvider !== "none"
                          ? `Active: ${integrations.ai.selectedProvider.charAt(0).toUpperCase() + integrations.ai.selectedProvider.slice(1)}`
                          : "No provider connected"}
                      </p>
                    </div>
                  </div>
                  {integrations?.ai.selectedProvider && integrations.ai.selectedProvider !== "none" && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-pos">
                      <div className="w-1.5 h-1.5 rounded-full bg-pos animate-pulse" /> Active
                    </div>
                  )}
                </div>
                <div className="divide-y divide-border/50">
                  {AI_PROVIDER_LIST.map((p) => {
                    const provStatus = aiProviderStatuses[p.id];
                    const savedStatus = integrations?.ai[p.id as keyof typeof integrations.ai] as any;
                    const isConnected = provStatus === "connected" || (provStatus === "idle" && savedStatus?.connected);
                    const displayStatus: TestStatus = provStatus !== "idle" ? provStatus : (savedStatus?.connected ? "connected" : "idle");
                    const connectedAt = savedStatus?.connectedAt;

                    return (
                      <div key={p.id} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">{p.logo}</span>
                            <div>
                              <p className="font-semibold text-sm">{p.name}</p>
                              <p className={cn("text-[11px] font-medium", p.color)}>{p.model}</p>
                            </div>
                          </div>
                          <StatusPill status={displayStatus} connectedAt={connectedAt} />
                        </div>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={aiKeyVisibility[p.id] ? "text" : "password"}
                              placeholder={p.placeholder}
                              value={aiKeys[p.id] || ""}
                              onChange={(e) => { setAiKeys(prev => ({ ...prev, [p.id]: e.target.value })); setAiProviderStatuses(prev => ({ ...prev, [p.id]: "idle" })); setAiMsgs(prev => ({ ...prev, [p.id]: "" })); }}
                              className="h-10 bg-background/60 font-mono text-xs pr-9"
                              data-testid={`input-ai-key-${p.id}`}
                            />
                            <button onClick={() => setAiKeyVisibility(prev => ({ ...prev, [p.id]: !prev[p.id] }))} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                              {aiKeyVisibility[p.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => testAiProvider(p.id)}
                            disabled={provStatus === "testing" || !aiKeys[p.id]?.trim()}
                            className={cn("h-10 px-3 gap-1.5 shrink-0 text-xs", isConnected && "bg-pos hover:bg-pos")}
                            data-testid={`button-test-ai-${p.id}`}
                          >
                            {provStatus === "testing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : isConnected ? <CheckCircle2 className="w-3.5 h-3.5" />
                              : <PlugZap className="w-3.5 h-3.5" />}
                            {provStatus === "testing" ? "Testing…" : isConnected ? "Re-test" : "Test & Save"}
                          </Button>
                        </div>
                        {aiMsgs[p.id] && (
                          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className={cn("text-xs mt-1.5 flex items-center gap-1",
                              displayStatus === "connected" ? "text-pos" : "text-neg"
                            )}>
                            {displayStatus === "connected" ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {aiMsgs[p.id]}
                          </motion.p>
                        )}
                        {!aiMsgs[p.id] && savedStatus?.connected && (
                          <p className="text-[11px] text-muted-foreground mt-1">Key saved. Enter a new key above to update.</p>
                        )}
                        {!savedStatus?.connected && !aiMsgs[p.id] && (
                          <p className="text-[11px] text-muted-foreground mt-1">{p.hint}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>

              {/* ── Brokerage ── */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="bg-card/50 border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-card/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                      <Wifi className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Brokerage</p>
                      <p className="text-[11px] text-muted-foreground">
                        {integrations
                          ? `${brokerMeta[integrations.broker.brokerType]?.label ?? integrations.broker.brokerType}${integrations.broker.account ? ` · #${integrations.broker.account}` : ""}`
                          : "Loading…"}
                      </p>
                    </div>
                  </div>
                  <StatusPill status={bkStatus} connectedAt={integrations?.broker.connectedAt} />
                </div>
                <div className="p-5 space-y-3">
                  {/* Broker type selector */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Platform</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(brokerMeta).map(([id, { label, Icon }]) => (
                        <button
                          key={id}
                          onClick={() => { setBrokerType(id); setBkStatus("idle"); setBkMsg(""); }}
                          className={cn(
                            "flex items-center gap-2 p-3 rounded-lg border-2 text-sm transition-all text-left",
                            brokerType === id
                              ? "border-primary bg-primary/8 text-foreground"
                              : "border-border bg-background/40 text-muted-foreground hover:border-primary/40"
                          )}
                          data-testid={`broker-option-${id}`}
                        >
                          <Icon className={cn("w-4 h-4 shrink-0", brokerType === id ? "text-primary" : "")} />
                          <span className="font-medium text-xs">{label}</span>
                          {brokerType === id && <CheckCircle2 className="w-3.5 h-3.5 text-primary ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Credential fields */}
                  <AnimatePresence mode="wait">
                    {brokerType === "demo" && (
                      <motion.div key="demo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5">
                        <div className="p-3 bg-pos/8 border border-pos/20 rounded-lg text-xs text-muted-foreground">
                          <p className="font-semibold text-pos mb-0.5">Paper Trading Mode</p>
                          All trades simulated — zero real-money risk.
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-muted-foreground">Starting Account Balance (USD)</Label>
                          <div className="flex gap-2">
                            <Input type="number" min="100" placeholder="e.g. 10000" value={brokerBalance} onChange={(e) => setBrokerBalance(e.target.value)} className="h-10 bg-background/60 text-sm flex-1" data-testid="input-broker-balance" />
                            <Button size="sm" onClick={saveBalance} disabled={balanceSaving} className="h-10 px-4 shrink-0" data-testid="button-save-balance">
                              {balanceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Update"}
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">Set this to match your account so P&amp;L tracking is accurate.</p>
                        </div>
                      </motion.div>
                    )}
                    {brokerType === "mql5" && (
                      <motion.div key="mql5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-muted-foreground">Account Number</Label>
                            <Input placeholder="12345678" value={mql5Account} onChange={(e) => { setMql5Account(e.target.value); setBkStatus("idle"); }} className="h-10 bg-background/60 text-sm" data-testid="input-mql5-account" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-muted-foreground">Bridge URL</Label>
                            <Input placeholder="https://your-mt5-bridge.example.com" value={mql5Server} onChange={(e) => { setMql5Server(e.target.value); setBkStatus("idle"); }} className="h-10 bg-background/60 text-sm" data-testid="input-mql5-server" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-muted-foreground">Investor Password</Label>
                          <div className="relative">
                            <Input type={showBrokerPass ? "text" : "password"} placeholder="Read-only investor password" value={mql5Password} onChange={(e) => { setMql5Password(e.target.value); setBkStatus("idle"); }} className="h-10 bg-background/60 text-sm pr-9" data-testid="input-mql5-password" />
                            <button onClick={() => setShowBrokerPass(!showBrokerPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                              {showBrokerPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">Use the Investor (read-only) password, not your master password.</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-muted-foreground">Account Balance (USD)</Label>
                          <div className="flex gap-2">
                            <Input type="number" min="100" placeholder="e.g. 50000" value={brokerBalance} onChange={(e) => setBrokerBalance(e.target.value)} className="h-10 bg-background/60 text-sm flex-1" data-testid="input-broker-balance" />
                            <Button size="sm" onClick={saveBalance} disabled={balanceSaving} className="h-10 px-4 shrink-0" data-testid="button-save-balance">
                              {balanceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Update"}
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">Enter your MT5 account balance — the top bar and all analytics will update instantly.</p>
                        </div>
                      </motion.div>
                    )}
                    {(brokerType === "oanda" || brokerType === "interactive") && (
                      <motion.div key="apikey" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">{brokerType === "oanda" ? "OANDA API Key" : "IBKR Client Portal API Key"}</Label>
                        <div className="relative">
                          <Input type={showBrokerPass ? "text" : "password"} placeholder="Enter API key" value={brokerApiKey} onChange={(e) => { setBrokerApiKey(e.target.value); setBkStatus("idle"); }} className="h-10 bg-background/60 font-mono text-sm pr-9" data-testid="input-broker-apikey" />
                          <button onClick={() => setShowBrokerPass(!showBrokerPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showBrokerPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {brokerType === "oanda" && <p className="text-[11px] text-muted-foreground">Found at <span className="text-primary">oanda.com</span> → My Account → API Access.</p>}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <FeedbackBar status={bkStatus} msg={bkMsg} />

                  <Button
                    onClick={testBroker}
                    disabled={bkStatus === "testing"}
                    className={cn("w-full gap-2 h-10", bkStatus === "connected" && "bg-pos hover:bg-pos")}
                    data-testid="button-test-broker"
                  >
                    {bkStatus === "testing" ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</>
                      : bkStatus === "connected" ? <><CheckCircle2 className="w-4 h-4" /> Connected — Re-test</>
                      : <><Wifi className="w-4 h-4" /> Test Connection</>}
                  </Button>
                </div>
              </motion.div>
            </div>

            {/* ━━━━ PREFERENCES ━━━━ */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">Trading Preferences</p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="bg-card/50 border border-border rounded-xl overflow-hidden">
                <div className="p-5 space-y-1">
                  {[
                    { label: "Trade Alerts", desc: "Notify when AI generates a new signal", val: notifications, set: setNotifications },
                    { label: "Auto Trading", desc: "AI executes trades automatically without confirmation", val: autoTrade, set: setAutoTrade },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-3.5 border-b border-border/30 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{row.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{row.desc}</p>
                      </div>
                      <Switch checked={row.val} onCheckedChange={row.set} />
                    </div>
                  ))}
                  <div className="pt-4">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 block">Risk Mode</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "low", label: "Low", desc: "Conservative" },
                        { id: "moderate", label: "Moderate", desc: "Balanced" },
                        { id: "high", label: "High", desc: "Aggressive" },
                      ].map(m => (
                        <button key={m.id} onClick={() => setRiskMode(m.id)}
                          className={cn("py-3 rounded-lg text-xs font-semibold border transition-all",
                            riskMode === m.id ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/50"
                          )}>
                          <p>{m.label}</p>
                          <p className={cn("font-normal mt-0.5", riskMode === m.id ? "opacity-80" : "opacity-60")}>{m.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pt-3">
                    <Button className="w-full gap-2" onClick={savePrefs} disabled={saveSettings.isPending}>
                      <Save className="w-4 h-4" />
                      {saveSettings.isPending ? "Saving…" : "Save Preferences"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* ━━━━ TRADING HOURS ━━━━ */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">Trading Hours & Sessions</p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }}
                className="bg-card/50 border border-border rounded-xl p-5 space-y-5">

                {/* Timezone */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Your Timezone</Label>
                  <select
                    value={tradingTimezone}
                    onChange={e => setTradingTimezone(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    data-testid="select-timezone"
                  >
                    {[
                      ["UTC",              "UTC — Coordinated Universal Time"],
                      ["America/New_York", "UTC-5/4 — New York (US Eastern)"],
                      ["America/Chicago",  "UTC-6/5 — Chicago (US Central)"],
                      ["America/Denver",   "UTC-7/6 — Denver (US Mountain)"],
                      ["America/Los_Angeles","UTC-8/7 — Los Angeles (US Pacific)"],
                      ["Europe/London",    "UTC+0/1 — London (UK)"],
                      ["Europe/Paris",     "UTC+1/2 — Paris / Frankfurt (CE(S)T)"],
                      ["Asia/Tokyo",       "UTC+9 — Tokyo"],
                      ["Asia/Singapore",   "UTC+8 — Singapore / Hong Kong"],
                      ["Asia/Dubai",       "UTC+4 — Dubai (GST)"],
                      ["Australia/Sydney", "UTC+10/11 — Sydney"],
                    ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">Used to display session times in your local timezone.</p>
                </div>

                {/* Active Sessions */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Active Trading Sessions</Label>
                  <p className="text-[11px] text-muted-foreground mb-3">Select the sessions the AI is allowed to trade. Leave all unselected to trade 24/7.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { id: "sydney",            label: "Sydney",              hours: "21:00 – 06:00 UTC", color: "text-info" },
                      { id: "tokyo",             label: "Tokyo",               hours: "23:00 – 08:00 UTC", color: "text-neg" },
                      { id: "london",            label: "London",              hours: "07:00 – 16:00 UTC", color: "text-info" },
                      { id: "new_york",          label: "New York",            hours: "12:00 – 21:00 UTC", color: "text-pos" },
                      { id: "us_london_overlap", label: "US/London Overlap",   hours: "12:00 – 16:00 UTC", color: "text-warn" },
                    ].map(s => {
                      const active = activeSessions.includes(s.id);
                      return (
                        <button key={s.id} onClick={() => toggleSession(s.id)}
                          className={cn("flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                            active ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:border-border/80"
                          )}
                          data-testid={`session-${s.id}`}
                        >
                          <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", active ? "bg-primary" : "bg-muted-foreground/30")} />
                          <div>
                            <p className={cn("text-xs font-semibold", active ? s.color : "text-foreground")}>{s.label}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{s.hours}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Off-Hours Behavior */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Off-Hours AI Behavior</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: "pause",         label: "Pause",          desc: "AI stops all trading outside sessions", icon: "" },
                      { id: "ai_autonomous", label: "AI Autonomous",  desc: "AI trades at reduced risk autonomously", icon: "" },
                      { id: "alert_only",    label: "Alert Only",     desc: "AI generates signals but doesn't execute", icon: "" },
                    ].map(b => (
                      <button key={b.id} onClick={() => setOffHoursBehavior(b.id)}
                        className={cn("p-3 rounded-lg border text-left transition-all",
                          offHoursBehavior === b.id ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:border-border/80"
                        )}
                        data-testid={`offhours-${b.id}`}
                      >
                        <span className="text-base">{b.icon}</span>
                        <p className="text-xs font-semibold mt-1">{b.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{b.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Risk reduction slider — only shown for AI Autonomous */}
                {offHoursBehavior === "ai_autonomous" && (
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                      Off-Hours Risk Reduction: <span className="text-primary">{offHoursRiskReduction}%</span>
                    </Label>
                    <input
                      type="range" min={10} max={90} step={5}
                      value={offHoursRiskReduction}
                      onChange={e => setOffHoursRiskReduction(parseInt(e.target.value))}
                      className="w-full accent-primary"
                      data-testid="slider-risk-reduction"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>10% reduction (minimal)</span>
                      <span>90% reduction (very cautious)</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      During off-hours the AI will reduce position sizes by {offHoursRiskReduction}% to limit overnight exposure.
                    </p>
                  </div>
                )}

                <Button className="w-full gap-2" onClick={saveHours} disabled={saveSettings.isPending} data-testid="save-trading-hours">
                  <Save className="w-4 h-4" />
                  {saveSettings.isPending ? "Saving…" : "Save Trading Hours"}
                </Button>
              </motion.div>
            </div>

            {/* ━━━━ EMAIL NOTIFICATIONS ━━━━ */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">Email Notifications</p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
                className="bg-card/50 border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium">Email Trade Alerts</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Receive an email when a trade opens, closes, or hits SL/TP</p>
                  </div>
                  <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Email Address</Label>
                    <Input value={emailAddress} onChange={e => setEmailAddress(e.target.value)} placeholder="you@example.com" type="email" data-testid="input-email-address" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">SMTP Host (optional)</Label>
                    <Input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" data-testid="input-smtp-host" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">SMTP Port</Label>
                    <Input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" data-testid="input-smtp-port" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">SMTP Username</Label>
                    <Input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="user@gmail.com" data-testid="input-smtp-user" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">SMTP Password / App Password</Label>
                    <Input value={smtpPass} onChange={e => setSmtpPass(e.target.value)} type="password" placeholder="••••••••" data-testid="input-smtp-pass" />
                  </div>
                </div>
                {emailTestMsg && (
                  <p className={cn("text-xs flex items-center gap-1.5", emailTestStatus === "connected" ? "text-pos" : "text-neg")}>
                    {emailTestStatus === "connected" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {emailTestMsg}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2 text-xs" onClick={testEmail} disabled={!emailAddress || emailTestStatus === "testing"} data-testid="button-test-email">
                    {emailTestStatus === "testing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send Test Email
                  </Button>
                  <Button className="flex-1 gap-2 text-xs" onClick={saveEmailSettings} disabled={saveSettings.isPending} data-testid="button-save-email">
                    <Save className="w-3.5 h-3.5" />
                    {saveSettings.isPending ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </motion.div>
            </div>

            {/* ━━━━ PUSH NOTIFICATIONS ━━━━ */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">Mobile &amp; Browser Push Alerts</p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.23 }}
                className="bg-card/50 border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                    <Smartphone className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">10-Minute Trade Digest</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Every 10 minutes a summary of closed trades (wins / losses / net P&amp;L) is pushed directly to your phone or browser. Works on Android Chrome, iOS Safari 16.4+, and all desktop browsers.
                    </p>
                  </div>
                </div>

                {push.state === "unsupported" && (
                  <div className="flex items-center gap-2 text-xs text-warn bg-warn/10 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Push notifications are not supported in this browser. Try Chrome or Firefox.
                  </div>
                )}
                {push.state === "denied" && (
                  <div className="flex items-center gap-2 text-xs text-neg bg-neg/10 rounded-lg px-3 py-2">
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    Notifications blocked. Open your browser site settings and allow notifications for this site, then reload.
                  </div>
                )}
                {push.error && (
                  <p className="text-xs text-neg flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" />{push.error}
                  </p>
                )}

                {push.state !== "unsupported" && (
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium">Enable Push Alerts</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {push.state === "subscribed" ? "Active — digest sends every 10 min" : "Off — tap to enable"}
                      </p>
                    </div>
                    {push.state === "loading" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={push.state === "subscribed"}
                        onCheckedChange={async (on) => { on ? push.subscribe() : push.unsubscribe(); }}
                        data-testid="switch-push-notifications"
                        disabled={(push.state as string) === "denied" || (push.state as string) === "unsupported"}
                      />
                    )}
                  </div>
                )}

                {push.state === "subscribed" && (
                  <Button
                    variant="outline"
                    className="w-full gap-2 text-xs"
                    data-testid="button-test-push"
                    disabled={pushTestDone}
                    onClick={async () => {
                      await push.sendTest();
                      setPushTestDone(true);
                      setTimeout(() => setPushTestDone(false), 5000);
                    }}
                  >
                    {pushTestDone ? (
                      <><CheckCircle2 className="w-3.5 h-3.5 text-pos" /> Notification sent to your device!</>
                    ) : (
                      <><Send className="w-3.5 h-3.5" /> Send Test Notification</>
                    )}
                  </Button>
                )}
              </motion.div>
            </div>

            {/* ━━━━ MT5 BRIDGE ━━━━ */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">MT5 JSON Bridge</p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.23 }}
                className="bg-card/50 border border-border rounded-xl p-5 space-y-3">
                <p className="text-xs text-muted-foreground">For direct MT5 execution, run the MQL5-JSON-API bridge on your MT5 terminal and enter its URL below.</p>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Bridge URL</Label>
                  <Input value={mt5BridgeUrl} onChange={e => setMt5BridgeUrl(e.target.value)} placeholder="http://localhost:8080" data-testid="input-mt5-bridge-url" />
                </div>
                {mt5Msg && (
                  <p className={cn("text-xs flex items-center gap-1.5", mt5Status === "connected" ? "text-pos" : "text-neg")}>
                    {mt5Status === "connected" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {mt5Msg}
                  </p>
                )}
                <Button variant="outline" className="w-full gap-2 text-xs" onClick={testMT5} disabled={!mt5BridgeUrl || mt5Status === "testing"} data-testid="button-test-mt5">
                  {mt5Status === "testing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                  Test MT5 Bridge Connection
                </Button>
              </motion.div>
            </div>

            {/* ━━━━ TRADINGVIEW WEBHOOK ━━━━ */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">TradingView Webhook</p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
                className="bg-card/50 border border-border rounded-xl p-5 space-y-3">
                <p className="text-xs text-muted-foreground">Send TradingView alerts to your account. Your token is a private secret — anyone with it can send you signals, so rotate it if it leaks.</p>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input value={`${window.location.origin}/api/webhook/tradingview`} readOnly className="font-mono text-xs" data-testid="input-webhook-url" />
                    <Button variant="outline" size="icon" className="shrink-0" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhook/tradingview`); toast({ title: "Copied!" }); }} data-testid="button-copy-webhook">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <WebhookTokenField />
                <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-3 space-y-1">
                  <p className="font-semibold">Alert message format:</p>
                  <code className="text-primary block break-all">{'{"token":"YOUR_WEBHOOK_TOKEN","action":"BUY","symbol":"EURUSD","price":"{{close}}","sl":"","tp":""}'}</code>
                  <p>Alerts arrive as pending signals. Auto-trade executes them only if they include a stop loss.</p>
                </div>
              </motion.div>
            </div>

            {/* ━━━━ UPDATE LOG ━━━━ */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">Update Log</p>
              <ChangelogSection />
            </div>

            {/* ━━━━ SECURITY ━━━━ */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">Security</p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                className="bg-card/50 border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-start gap-2.5 p-3 bg-background/50 rounded-lg border border-border/50 text-xs text-muted-foreground">
                  <Shield className="w-4 h-4 text-pos shrink-0 mt-0.5" />
                  <span>All credentials are encrypted server-side, stored only on your account, and never shared with third parties.</span>
                </div>
                <Button variant="outline" className="w-full gap-2 text-muted-foreground" onClick={resetTour} data-testid="button-replay-tour">
                  <Map className="w-4 h-4" /> Replay App Tour
                </Button>
                <Button variant="outline" className="w-full gap-2 text-muted-foreground" onClick={() => { localStorage.removeItem("tradeai_onboarded"); window.location.href = "/onboarding"; }}>
                  Re-run Setup Wizard
                </Button>
                <Button variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive hover:text-on-strong gap-2" onClick={logout}>
                  <LogOut className="w-4 h-4" /> Sign Out
                </Button>
              </motion.div>
            </div>

          </div>
        </div>
      </div>
    </AppLayout>
  );
}
