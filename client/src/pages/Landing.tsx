import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  LineChart, Bot, Shield, Newspaper, BookMarked, Store,
  BarChart2, Zap, ArrowRight, Star, TrendingUp,
  Brain, Clock, Globe, ChevronRight, Sparkles, Lock,
  Activity, Target, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Zap,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    border: "border-yellow-400/20",
    title: "AI Signal Engine",
    desc: "5 AI providers (GPT-4o, Claude 3.5, Gemini, Groq, Perplexity) generate confluence-based entry signals with confidence scores, stop-loss, and take-profit levels.",
  },
  {
    icon: Shield,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    border: "border-blue-400/20",
    title: "Intelligent Risk Management",
    desc: "Per-trade lot sizing, daily loss limits, max drawdown guards, session-based trading hours, and off-hours AI autonomy controls.",
  },
  {
    icon: Newspaper,
    color: "text-green-400",
    bg: "bg-green-400/10",
    border: "border-green-400/20",
    title: "News Intelligence",
    desc: "Real-time news filtered by your instruments (forex, stocks, crypto, bonds) with AI sentiment analysis — bullish/bearish scores and urgency ratings per article.",
  },
  {
    icon: Brain,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    border: "border-purple-400/20",
    title: "AI Trade Grading",
    desc: "Every closed trade gets an A+ to F grade from your AI coach. Identifies recurring mistakes (FOMO, revenge trading, oversize) and builds a personal knowledge base.",
  },
  {
    icon: BookMarked,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    border: "border-orange-400/20",
    title: "Trade Journal",
    desc: "Log every trade with emotions, notes, and outcomes. GitHub-style P&L heatmap, equity curve, and CSV export for external analysis.",
  },
  {
    icon: Store,
    color: "text-pink-400",
    bg: "bg-pink-400/10",
    border: "border-pink-400/20",
    title: "Strategy Marketplace",
    desc: "Publish your edge, discover community strategies, one-click copy to your profile. Sorted by win rate, return, and community votes.",
  },
];

const STEPS = [
  {
    n: "01",
    icon: Brain,
    title: "Connect your AI",
    desc: "Paste your API key for OpenAI, Anthropic, Google Gemini, Groq, or Perplexity. The AI analyzes live prices, your strategy, and the knowledge base.",
  },
  {
    n: "02",
    icon: Target,
    title: "Configure your edge",
    desc: "Set your trading style, risk %, R:R ratio, active sessions, and instrument preferences. The terminal personalizes everything to your system.",
  },
  {
    n: "03",
    icon: TrendingUp,
    title: "Trade, review, improve",
    desc: "Get real-time signals, execute trades, receive AI graded reviews, and watch your knowledge base grow smarter with every position.",
  },
];

const STATS = [
  { label: "AI Providers", value: "5", icon: Brain },
  { label: "Trading Tools", value: "13", icon: BarChart2 },
  { label: "Free in Beta", value: "100%", icon: Sparkles },
  { label: "Uptime", value: "99.9%", icon: Activity },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#070710] text-white overflow-x-hidden">
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#070710]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <LineChart className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <span className="font-bold text-lg tracking-tight">TradeAI <span className="text-cyan-400">Terminal</span></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Free Beta
            </span>
            <Link href="/auth">
              <Button variant="ghost" size="sm" className="text-white/70 hover:text-white text-sm">Log in</Button>
            </Link>
            <Link href="/auth">
              <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold shadow-lg shadow-cyan-500/25 text-sm px-4">
                Get started free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 px-4 sm:px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px]" />
          <div className="absolute top-20 left-1/4 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[80px]" />
          <div className="absolute top-20 right-1/4 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-[80px]" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-8 text-sm">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-white/70">Now in open beta — </span>
              <span className="text-cyan-400 font-semibold">100% free until launch</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight mb-6"
          >
            Trade smarter with{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">
              AI you control
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            A professional forex terminal with 5 AI providers, real-time signals, intelligent risk management, AI trade grading, and a growing strategy marketplace — in one sleek platform.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 justify-center mb-16"
          >
            <Link href="/auth">
              <Button size="lg" className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-xl shadow-cyan-500/30 text-base px-8 h-12 gap-2 group">
                Start trading free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline" className="border-white/10 text-white/70 hover:bg-white/5 hover:text-white text-base px-8 h-12">
                See all features
              </Button>
            </a>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.45 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto"
          >
            {STATS.map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
                <Icon className="w-4 h-4 text-cyan-400 mb-2 mx-auto" />
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-xs text-white/40 mt-0.5">{label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Terminal preview mockup */}
        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}
          className="max-w-5xl mx-auto mt-16 relative"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[#070710] via-transparent to-transparent z-10 pointer-events-none" style={{ top: "60%" }} />
          <div className="rounded-2xl border border-white/10 bg-[#0d0d1a] overflow-hidden shadow-2xl shadow-black/60">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <div className="ml-3 flex-1 bg-white/5 rounded px-3 py-1 text-xs text-white/20">tradeai.terminal</div>
            </div>
            <div className="flex h-64 sm:h-80">
              {/* Sidebar preview */}
              <div className="w-14 border-r border-white/5 bg-white/[0.02] flex flex-col items-center gap-2 py-4">
                {[LineChart, BarChart2, Newspaper, Shield, Bot, BookMarked].map((Icon, i) => (
                  <div key={i} className={cn("w-9 h-9 rounded-lg flex items-center justify-center", i === 0 ? "bg-cyan-500/20 text-cyan-400" : "text-white/20")}>
                    <Icon className="w-4 h-4" />
                  </div>
                ))}
              </div>
              {/* Content preview */}
              <div className="flex-1 p-4 space-y-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-5 w-32 rounded bg-white/5" />
                  <div className="h-5 w-20 rounded bg-cyan-500/10 border border-cyan-500/20" />
                  <div className="ml-auto h-5 w-24 rounded bg-green-500/10 border border-green-500/20" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-white/[0.03] border border-white/5 rounded-lg p-3 space-y-2">
                      <div className="h-3 w-16 rounded bg-white/5" />
                      <div className="h-5 w-24 rounded bg-white/10" />
                      <div className={cn("h-2 w-12 rounded", i === 0 ? "bg-green-500/30" : i === 1 ? "bg-red-500/30" : "bg-yellow-500/30")} />
                    </div>
                  ))}
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-cyan-500/20 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 rounded bg-white/10" />
                    <div className="h-2 w-64 rounded bg-white/5" />
                  </div>
                  <div className="h-7 w-20 rounded-lg bg-cyan-500/20 border border-cyan-500/30" />
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 h-20 flex items-end gap-1 px-4">
                  {[40, 55, 35, 70, 45, 80, 60, 75, 50, 90, 65, 85].map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: h > 65 ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.3)" }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-4">
              <span className="w-8 h-px bg-cyan-400/40" />
              Everything you need
              <span className="w-8 h-px bg-cyan-400/40" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Professional tools. AI-powered edge.</h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">Built for serious traders who want systematic, data-driven decision making — not guesswork.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={cn("group rounded-2xl border p-6 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300", f.border)}
              >
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center mb-4", f.bg)}>
                  <f.icon className={cn("w-5 h-5", f.color)} />
                </div>
                <h3 className="font-bold text-base mb-2 text-white">{f.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-24 px-4 sm:px-6 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-widest mb-4">
              <span className="w-8 h-px bg-purple-400/40" />
              Three steps
              <span className="w-8 h-px bg-purple-400/40" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Up and running in minutes</h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">No complex setup. No broker requirement to start. Just connect an AI key and trade.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-[calc(100%+16px)] w-[calc(100%-32px)] h-px bg-gradient-to-r from-white/10 to-transparent" />
                )}
                <div className="text-5xl font-black text-white/[0.04] mb-4 leading-none">{s.n}</div>
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                  <s.icon className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-gradient-to-b from-cyan-500/10 to-blue-500/5 border border-cyan-500/20 rounded-3xl p-12"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-cyan-500/30">
              <LineChart className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to trade with AI?</h2>
            <p className="text-white/40 text-lg mb-8">
              Join traders already using TradeAI Terminal. Free during beta — no card needed.
            </p>
            <Link href="/auth">
              <Button size="lg" className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-xl shadow-cyan-500/30 text-base px-10 h-12 gap-2 group">
                Create free account
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                <LineChart className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-sm text-white/70">TradeAI Terminal</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-white/30">
              <Link href="/terms" className="hover:text-white/60 transition-colors">Terms of Service</Link>
              <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy Policy</Link>
              <Link href="/auth" className="hover:text-white/60 transition-colors">Log in</Link>
            </div>
            <p className="text-xs text-white/20">© 2026 TradeAI Terminal. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
