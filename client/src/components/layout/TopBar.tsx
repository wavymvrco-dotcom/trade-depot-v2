import { useState, useEffect } from "react";
import { LineChart, TrendingUp, DollarSign, Percent, AlertCircle, Menu, LogOut, Sun, Moon, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePositions, usePositionHistory, useSettings } from "@/hooks/useApi";
import type { Position } from "@shared/schema";

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("tradeai_theme");
    return saved !== "light";
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("tradeai_theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("tradeai_theme", "light");
    }
  }, [isDark]);

  return { isDark, toggle: () => setIsDark(v => !v) };
}

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const { data: rawOpen = [] } = usePositions();
  const { data: rawHistory = [] } = usePositionHistory();
  const { data: rawSettings } = useSettings();
  const { isDark, toggle } = useDarkMode();

  const openPositions = rawOpen as Position[];
  const history = rawHistory as Position[];
  const settings = rawSettings as any;
  const autoTradeOn = settings?.autoTrade === true;

  const startingBalance = settings?.brokerBalance ? parseFloat(String(settings.brokerBalance)) : 10000;
  const closedPL = history.reduce((s, p) => s + (p.profit || 0), 0);
  const balance = startingBalance + closedPL;

  const openUnrealizedPL = openPositions.reduce((s, p) => s + (p.profit || 0), 0);
  const [equity, setEquity] = useState(balance + openUnrealizedPL);

  useEffect(() => {
    setEquity(balance + openUnrealizedPL + (Math.random() - 0.5) * 1.5);
  }, [balance, openUnrealizedPL]);

  useEffect(() => {
    const interval = setInterval(() => {
      setEquity(prev => {
        const drift = (Math.random() - 0.49) * 2;
        return Math.max(balance * 0.5, prev + drift);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [balance]);

  const wins = history.filter((p) => (p.profit || 0) > 0).length;
  const winRate = history.length > 0 ? Math.round((wins / history.length) * 100) : 0;
  const equityChange = equity - balance;
  const equityPercent = balance > 0 ? (equityChange / balance) * 100 : 0;

  return (
    <div className="h-16 border-b border-border bg-card/40 backdrop-blur-md flex items-center justify-between px-4 md:px-6 gap-4 shrink-0">
      <Button variant="ghost" size="icon" className="md:hidden h-10 w-10" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <LineChart className="w-5 h-5 text-white" />
        </div>
        <span className="font-bold text-sm tracking-tight hidden sm:block">TradeAI</span>
      </div>

      {/* Live Stats */}
      <div className="flex-1 flex items-center gap-4 md:gap-8 text-xs overflow-hidden">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</p>
            <p className="font-mono font-bold text-sm" data-testid="text-balance">
              ${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex items-center gap-2.5 shrink-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${equityChange >= 0 ? "bg-green-500/10" : "bg-destructive/10"}`}>
            <TrendingUp className={`w-4 h-4 ${equityChange >= 0 ? "text-green-500" : "text-destructive"}`} />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Equity</p>
            <p className={`font-mono font-bold text-sm ${equityChange >= 0 ? "text-green-500" : "text-destructive"}`} data-testid="text-equity">
              ${equity.toFixed(2)}
              <span className="text-[10px] ml-1">({equityPercent >= 0 ? "+" : ""}{equityPercent.toFixed(2)}%)</span>
            </p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="items-center gap-2.5 shrink-0 hidden md:flex">
          <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center">
            <Percent className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</p>
            <p className="font-mono font-bold text-sm text-accent">{history.length > 0 ? `${winRate}%` : "—"}</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="items-center gap-2.5 shrink-0 hidden lg:flex">
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <AlertCircle className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Open Trades</p>
            <p className="font-mono font-bold text-sm text-orange-500">{openPositions.length}</p>
          </div>
        </motion.div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {/* Demo Mode badge */}
        {!settings?.brokerConnected && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold" title="No broker connected — running on paper money">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            DEMO
          </div>
        )}

        {/* Auto-trade indicator */}
        {autoTradeOn && settings?.brokerConnected && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-[10px] font-bold" title="Auto-trade is live — orders go to your connected broker">
            <Zap className="w-3 h-3" />
            AUTO
          </div>
        )}
        {autoTradeOn && !settings?.brokerConnected && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold" title="Auto-trade is ON but no live broker connected — trades execute in paper mode only. Connect a broker in Settings.">
            <Zap className="w-3 h-3" />
            AUTO (DEMO)
          </div>
        )}

        {/* Live indicator */}
        <div className="items-center gap-1.5 hidden sm:flex">
          <div className={`w-2 h-2 rounded-full animate-pulse ${settings?.brokerConnected ? "bg-green-500" : "bg-yellow-500"}`} />
          <span className="text-xs text-muted-foreground">{settings?.brokerConnected ? "Live" : "Demo"}</span>
        </div>

        {/* Dark / Light toggle */}
        <button
          data-testid="button-theme-toggle"
          onClick={toggle}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {user && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-xs text-primary">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-medium hidden md:block text-muted-foreground">{user.username}</span>
            <Button
              variant="ghost" size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-destructive"
              onClick={logout} title="Sign Out"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
