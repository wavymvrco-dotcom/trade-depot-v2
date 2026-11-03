import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, TrendingUp, TrendingDown, Trophy, Target, RefreshCw,
  Award, Percent, DollarSign, Activity, AlertTriangle, Users, Copy, Check, X, Download, Grid3x3, Clock,
  Shield, PlayCircle, PauseCircle, Zap,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell,
} from "recharts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePositionHistory, useActiveStrategy, useSettings } from "@/hooks/useApi";
import type { Position, Strategy } from "@shared/schema";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

function computeEquityCurve(history: Position[], startingBalance: number) {
  const sorted = [...history].sort((a, b) =>
    new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime()
  );
  let balance = startingBalance;
  return sorted.map((p, i) => {
    balance += p.profit || 0;
    return { trade: i + 1, balance: parseFloat(balance.toFixed(2)), pl: p.profit || 0 };
  });
}

function computeMetrics(history: Position[], startingBalance: number) {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) =>
    new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime()
  );
  const wins = history.filter(p => p.profit > 0);
  const losses = history.filter(p => p.profit <= 0);
  const totalWin = wins.reduce((s, p) => s + p.profit, 0);
  const totalLoss = Math.abs(losses.reduce((s, p) => s + p.profit, 0));
  const profitFactor = totalLoss > 0 ? parseFloat((totalWin / totalLoss).toFixed(2)) : null;
  const winRate = parseFloat(((wins.length / history.length) * 100).toFixed(1));
  const avgWin = wins.length > 0 ? parseFloat((totalWin / wins.length).toFixed(2)) : 0;
  const avgLoss = losses.length > 0 ? parseFloat((totalLoss / losses.length).toFixed(2)) : 0;
  const curve = computeEquityCurve(history, startingBalance);
  let peak = startingBalance;
  let maxDD = 0;
  for (const pt of curve) {
    if (pt.balance > peak) peak = pt.balance;
    const dd = peak - pt.balance;
    if (dd > maxDD) maxDD = dd;
  }
  const maxDrawdownPct = parseFloat(((maxDD / peak) * 100).toFixed(1));

  // Streak calculation
  let currentStreak = 0, bestWinStreak = 0, worstLossStreak = 0;
  let runStreak = 0;
  let lastWin: boolean | null = null;
  for (const p of sorted) {
    const isWin = (p.profit || 0) > 0;
    if (lastWin === null || lastWin === isWin) {
      runStreak++;
    } else {
      runStreak = 1;
    }
    lastWin = isWin;
    if (isWin) bestWinStreak = Math.max(bestWinStreak, runStreak);
    else worstLossStreak = Math.max(worstLossStreak, runStreak);
  }
  // Current streak
  if (sorted.length > 0) {
    const lastIsWin = (sorted[sorted.length - 1]?.profit || 0) > 0;
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const isWin = (sorted[i].profit || 0) > 0;
      if (isWin !== lastIsWin) break;
      streak++;
    }
    currentStreak = lastIsWin ? streak : -streak;
  }

  const bestTrade = history.reduce((b, p) => p.profit > b.profit ? p : b, history[0]);
  const worstTrade = history.reduce((b, p) => p.profit < b.profit ? p : b, history[0]);

  return {
    winRate, profitFactor, avgWin, avgLoss, maxDrawdownPct,
    wins: wins.length, losses: losses.length,
    currentStreak, bestWinStreak, worstLossStreak,
    bestTrade: bestTrade?.profit ?? 0,
    worstTrade: worstTrade?.profit ?? 0,
    totalPL: parseFloat((totalWin - totalLoss).toFixed(2)),
  };
}

function computeBySymbol(history: Position[]) {
  const map: Record<string, { pl: number; wins: number; total: number }> = {};
  for (const p of history) {
    if (!map[p.symbol]) map[p.symbol] = { pl: 0, wins: 0, total: 0 };
    map[p.symbol].pl += p.profit || 0;
    map[p.symbol].total++;
    if ((p.profit || 0) > 0) map[p.symbol].wins++;
  }
  return Object.entries(map).map(([symbol, d]) => ({
    symbol,
    pl: parseFloat(d.pl.toFixed(2)),
    winRate: Math.round((d.wins / d.total) * 100),
    trades: d.total,
  })).sort((a, b) => b.pl - a.pl);
}

function StatCard({ label, value, sub, color = "text-foreground", icon: Icon }: any) {
  return (
    <div className="bg-card/40 border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}


// Live market session clock
function MarketSessionClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const SESSIONS = [
    { name: "Sydney",   color: "#10b981", open: 21, close: 6  },
    { name: "Tokyo",    color: "#3b82f6", open: 23, close: 8  },
    { name: "London",   color: "#f59e0b", open: 7,  close: 16 },
    { name: "New York", color: "#ef4444", open: 12, close: 21 },
  ];

  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const isOpen = (open: number, close: number) => {
    if (open < close) return utcHour >= open && utcHour < close;
    return utcHour >= open || utcHour < close;
  };
  const minsToChange = (open: number, close: number) => {
    const active = isOpen(open, close);
    const target = active ? close : open;
    let diff = (target - utcHour + 24) % 24;
    return Math.round(diff * 60);
  };

  return (
    <div className="bg-card/40 border border-border rounded-xl p-4 md:p-5">
      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" /> Live Market Sessions
        <span className="ml-auto text-xs text-muted-foreground font-mono">
          {now.toUTCString().replace("GMT", "UTC").split(" ").slice(-2).join(" ")}
        </span>
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SESSIONS.map(s => {
          const open = isOpen(s.open, s.close);
          const mins = minsToChange(s.open, s.close);
          const hrs = Math.floor(mins / 60);
          const m = mins % 60;
          return (
            <div key={s.name} className={`rounded-lg border p-3 transition-all ${open ? "border-border bg-card/60" : "border-border/40 bg-card/20 opacity-60"}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${open ? "animate-pulse" : "opacity-30"}`} style={{ background: s.color }} />
                <span className="font-semibold text-xs">{s.name}</span>
                <span className={`ml-auto text-[10px] font-bold ${open ? "text-green-500" : "text-muted-foreground"}`}>
                  {open ? "OPEN" : "CLOSED"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {open ? `Closes in ${hrs}h ${m}m` : `Opens in ${hrs}h ${m}m`}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {String(s.open).padStart(2,"0")}:00–{String(s.close).padStart(2,"0")}:00 UTC
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Session Win Rate Chart ────────────────────────────────────────────────────
function SessionWinRate({ history }: { history: Position[] }) {
  const SESSION_HOURS: Record<string, number[]> = {
    "Tokyo\n(0–8 UTC)":   [0,1,2,3,4,5,6,7,8],
    "London\n(7–16 UTC)": [7,8,9,10,11,12,13,14,15,16],
    "NY\n(13–22 UTC)":    [13,14,15,16,17,18,19,20,21,22],
    "Overlap\n(13–16)":   [13,14,15,16],
  };

  const sessionStats = Object.entries(SESSION_HOURS).map(([label, hours]) => {
    const trades = history.filter(p => {
      if (!p.closedAt) return false;
      const h = new Date(p.closedAt).getUTCHours();
      return hours.includes(h);
    });
    const wins = trades.filter(p => p.profit > 0).length;
    const totalPL = trades.reduce((s, p) => s + (p.profit || 0), 0);
    return {
      label,
      trades: trades.length,
      wins,
      winRate: trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0,
      totalPL: parseFloat(totalPL.toFixed(2)),
    };
  });

  // Hourly win rate breakdown
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const trades = history.filter(p => p.closedAt && new Date(p.closedAt).getUTCHours() === h);
    const wins = trades.filter(p => p.profit > 0).length;
    return {
      hour: `${h}:00`,
      winRate: trades.length >= 2 ? Math.round((wins / trades.length) * 100) : null,
      trades: trades.length,
      pl: parseFloat(trades.reduce((s, p) => s + (p.profit || 0), 0).toFixed(2)),
    };
  }).filter(d => d.trades > 0);

  const bestSession = [...sessionStats].sort((a, b) => b.winRate - a.winRate)[0];
  const bestHour = hourlyData.length > 0 ? [...hourlyData].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0] : null;

  if (history.length === 0) {
    return (
      <div className="bg-card/50 border border-border rounded-xl p-5 text-center text-muted-foreground text-sm py-10">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
        Close some trades to see your session win rates
      </div>
    );
  }

  return (
    <div className="bg-card/50 border border-border rounded-xl p-5 space-y-5">
      <div>
        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> Your Win Rate by Session</h3>
        <p className="text-xs text-muted-foreground">Based on your actual closed trades — when do YOU actually make money?</p>
      </div>

      {bestSession && bestSession.trades >= 2 && (
        <div className="bg-green-500/8 border border-green-500/20 rounded-lg px-4 py-2.5 flex items-center gap-3">
          <Trophy className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-xs text-green-300">
            <strong>Best session:</strong> {bestSession.label.split("\n")[0]} with <strong>{bestSession.winRate}% win rate</strong> over {bestSession.trades} trades (${bestSession.totalPL >= 0 ? "+" : ""}{bestSession.totalPL})
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sessionStats.map(s => (
          <div key={s.label} className="bg-background/50 rounded-lg p-3 border border-border/50 text-center">
            <p className="text-[10px] text-muted-foreground font-mono uppercase whitespace-pre-line leading-tight mb-2">{s.label}</p>
            {s.trades < 2 ? (
              <p className="text-xs text-muted-foreground italic">Need 2+ trades</p>
            ) : (
              <>
                <p className={cn("text-2xl font-bold font-mono", s.winRate >= 60 ? "text-green-500" : s.winRate >= 45 ? "text-orange-400" : "text-destructive")}>{s.winRate}%</p>
                <p className="text-[10px] text-muted-foreground mt-1">{s.trades} trades · {s.totalPL >= 0 ? "+" : ""}${s.totalPL}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {hourlyData.length >= 3 && (
        <div>
          <p className="text-[10px] text-muted-foreground font-mono uppercase mb-2">Win Rate by Hour (UTC) — min 2 trades</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={hourlyData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="hour" tick={{ fontSize: 8, fill: "#666" }} />
              <YAxis tick={{ fontSize: 9, fill: "#666" }} domain={[0, 100]} />
              <Tooltip
                formatter={(v: any, name: string) => [v != null ? `${v}%` : "—", "Win Rate"]}
                contentStyle={{ background: "#1a1a2e", border: "1px solid #333", fontSize: 11 }}
              />
              <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
                {hourlyData.map((d, i) => (
                  <Cell key={i} fill={(d.winRate ?? 0) >= 60 ? "#22c55e" : (d.winRate ?? 0) >= 45 ? "#f97316" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {bestHour && bestHour.winRate != null && (
            <p className="text-[10px] text-muted-foreground mt-1">Peak hour: {bestHour.hour} UTC — {bestHour.winRate}% win rate over {bestHour.trades} trades</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Daily P&L Bar ────────────────────────────────────────────────────────────
function DailyPLBar({ history }: { history: Position[] }) {
  const today = new Date().toDateString();
  const todayTrades = history.filter(p => p.closedAt && new Date(p.closedAt).toDateString() === today);
  const todayPL = todayTrades.reduce((s, p) => s + (p.profit || 0), 0);
  const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
  const yesterdayPL = history.filter(p => p.closedAt && new Date(p.closedAt).toDateString() === yesterdayStr)
    .reduce((s, p) => s + (p.profit || 0), 0);

  // Last 14 days for the sparkline
  const last14: { day: string; pl: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const ds = d.toDateString();
    const pl = history.filter(p => p.closedAt && new Date(p.closedAt).toDateString() === ds)
      .reduce((s, p) => s + (p.profit || 0), 0);
    if (pl !== 0 || i <= 7) last14.push({ day: format(d, "MMM d"), pl: parseFloat(pl.toFixed(2)) });
  }

  return (
    <div className="bg-card/40 border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> Daily P&amp;L</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Yesterday: <span className={yesterdayPL >= 0 ? "text-green-400" : "text-red-400"}>{yesterdayPL >= 0 ? "+" : ""}${yesterdayPL.toFixed(2)}</span></span>
          <span className={cn("font-bold text-sm", todayPL >= 0 ? "text-green-500" : "text-destructive")}>
            Today: {todayPL >= 0 ? "+" : ""}${todayPL.toFixed(2)}
          </span>
        </div>
      </div>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={last14} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
            <XAxis dataKey="day" tick={{ fontSize: 8, fill: "#666" }} />
            <YAxis tick={{ fontSize: 8, fill: "#666" }} tickFormatter={v => `$${v}`} />
            <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "P&L"]} contentStyle={{ background: "#1a1a2e", border: "1px solid #333", fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#444" strokeDasharray="4 4" />
            <Bar dataKey="pl" radius={[3, 3, 0, 0]}>
              {last14.map((d, i) => <Cell key={i} fill={d.pl >= 0 ? "#22c55e" : "#ef4444"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {todayTrades.length === 0 && <p className="text-[10px] text-muted-foreground text-center">No trades closed today</p>}
    </div>
  );
}

// ─── Trade Streak Tracker ──────────────────────────────────────────────────────
function TradeStreaks({ history }: { history: Position[] }) {
  const sorted = [...history].sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());
  let currentStreak = 0;
  let currentType: "win" | "loss" | null = null;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let tempWin = 0;
  let tempLoss = 0;

  for (const t of sorted) {
    const won = t.profit > 0;
    if (won) {
      tempWin++;
      tempLoss = 0;
      if (tempWin > maxWinStreak) maxWinStreak = tempWin;
    } else {
      tempLoss++;
      tempWin = 0;
      if (tempLoss > maxLossStreak) maxLossStreak = tempLoss;
    }
    const type = won ? "win" : "loss";
    if (currentType === type) { currentStreak++; }
    else { currentStreak = 1; currentType = type; }
  }

  const recentTen = sorted.slice(-10).map(t => t.profit > 0 ? "W" : "L");

  return (
    <div className="bg-card/40 border border-border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Trade Streaks</h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Current</p>
          <p className={cn("text-xl font-bold font-mono", currentType === "win" ? "text-green-500" : currentType === "loss" ? "text-destructive" : "text-muted-foreground")}>
            {sorted.length === 0 ? "—" : `${currentStreak}${currentType === "win" ? "W" : "L"}`}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Best Win</p>
          <p className="text-xl font-bold font-mono text-green-500">{maxWinStreak}W</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase font-mono mb-1">Worst Loss</p>
          <p className="text-xl font-bold font-mono text-destructive">{maxLossStreak}L</p>
        </div>
      </div>
      {recentTen.length > 0 && (
        <div className="flex gap-1 justify-center flex-wrap">
          <span className="text-[10px] text-muted-foreground mr-1">Last {recentTen.length}:</span>
          {recentTen.map((r, i) => (
            <span key={i} className={cn("w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center", r === "W" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>{r}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Correlation Matrix (computed from real daily returns) ─────────────────────
function LiveCorrelationMatrix() {
  const { data } = useQuery<any>({
    queryKey: ["/api/market/correlation"],
    staleTime: 30 * 60_000,
  });

  const PAIRS: string[] = data?.pairs?.length ? data.pairs : ["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","XAUUSD","USDCHF","GBPJPY"];
  const CORR: (number | null)[][] = data?.matrix ?? [];

  const getCellStyle = (v: number | null): React.CSSProperties => {
    if (v == null) return { color: "hsl(var(--muted-foreground))" };
    const abs = Math.abs(v);
    const opacity = v === 1 ? 0.15 : abs > 0.8 ? 0.85 : abs > 0.6 ? 0.65 : abs > 0.4 ? 0.45 : abs > 0.2 ? 0.25 : 0.12;
    if (v === 1) return { background: `hsl(var(--primary) / ${opacity})`, color: "hsl(var(--primary))" };
    const rgb = v > 0 ? "34,197,94" : "239,68,68";
    return { background: `rgba(${rgb},${opacity})`, color: abs > 0.4 ? (v > 0 ? "#16a34a" : "#dc2626") : "hsl(var(--foreground))" };
  };

  return (
    <div className="bg-card/50 border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Grid3x3 className="w-4 h-4 text-primary" /> Correlation Matrix</h3>
        {data?.live && <span className="text-[10px] text-muted-foreground font-mono">{data.window} · {new Date(data.asOf).toLocaleDateString()}</span>}
      </div>
      <p className="text-xs text-muted-foreground mb-4">Pearson correlation of daily returns. High positive = the positions are effectively one bet; negative = they offset.</p>
      {!CORR.length ? (
        <p className="text-xs text-muted-foreground py-6 text-center">{data?.message || "Loading market history…"}</p>
      ) : (
      <div className="overflow-x-auto">
        <table className="text-[10px] border-collapse w-full">
          <thead>
            <tr>
              <th className="w-14 text-left text-muted-foreground font-normal pb-1 pr-2"></th>
              {PAIRS.map(p => <th key={p} className="text-center font-mono text-muted-foreground font-normal pb-1 px-0.5">{p.slice(0,3)}<br/>{p.slice(3)}</th>)}
            </tr>
          </thead>
          <tbody>
            {PAIRS.map((row, i) => (
              <tr key={row}>
                <td className="font-mono text-muted-foreground pr-2 py-0.5 whitespace-nowrap text-[9px]">{row}</td>
                {(CORR[i] ?? []).map((v, j) => (
                  <td key={j} className="text-center font-mono font-semibold py-1 px-0.5 rounded-sm" style={getCellStyle(v)}>
                    {v === 1 ? "—" : v == null ? "n/a" : v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1"><div className="w-6 h-3 rounded" style={{background:"rgba(34,197,94,0.6)"}} /> Positive correlation</div>
        <div className="flex items-center gap-1"><div className="w-6 h-3 rounded" style={{background:"rgba(239,68,68,0.6)"}} /> Negative / offsetting</div>
      </div>
    </div>
  );
}

// Session heatmap - show which hours/days are most active for trading
function SessionHeatmap({ history }: { history: Position[] }) {
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0)) as number[][];
  const plMap = Array.from({ length: 7 }, () => Array(24).fill(0)) as number[][];

  for (const p of history) {
    if (!p.closedAt) continue;
    const d = new Date(p.closedAt);
    heatmap[d.getDay()][d.getHours()]++;
    plMap[d.getDay()][d.getHours()] += p.profit || 0;
  }

  const maxTrades = Math.max(...heatmap.flat(), 1);

  const sessions = [
    { label: "Tokyo", hours: [0, 1, 2, 3, 4, 5, 6, 7, 8], color: "bg-blue-500/30" },
    { label: "London", hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16], color: "bg-green-500/30" },
    { label: "NY", hours: [13, 14, 15, 16, 17, 18, 19, 20, 21], color: "bg-orange-500/30" },
  ];

  return (
    <div className="bg-card/50 border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm mb-1 flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Session Heatmap</h3>
      <p className="text-xs text-muted-foreground mb-4">Trade frequency by day and hour (UTC). Intensity = trade count.</p>
      <div className="overflow-x-auto">
        <div className="flex gap-0.5 mb-0.5 ml-7">
          {HOURS.map(h => (
            <div key={h} className="w-7 text-[8px] text-muted-foreground text-center">{h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}</div>
          ))}
        </div>
        {DAYS.map((day, di) => (
          <div key={day} className="flex items-center gap-0.5 mb-0.5">
            <div className="w-7 text-[9px] text-muted-foreground shrink-0">{day}</div>
            {HOURS.map(hi => {
              const trades = heatmap[di][hi];
              const pl = plMap[di][hi];
              const intensity = trades / maxTrades;
              const bgColor = trades === 0 ? "bg-muted/20"
                : pl >= 0 ? `bg-green-500` : `bg-red-500`;
              return (
                <div
                  key={hi}
                  title={`${day} ${hi}:00 - ${trades} trades, P&L: $${pl.toFixed(0)}`}
                  className={cn("w-7 h-6 rounded-sm transition-all", bgColor)}
                  style={{ opacity: trades === 0 ? 0.15 : 0.15 + intensity * 0.85 }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1"><div className="w-4 h-3 rounded bg-green-500/70" /> Profitable hour</div>
        <div className="flex items-center gap-1"><div className="w-4 h-3 rounded bg-red-500/70" /> Losing hour</div>
        {history.length === 0 && <span className="ml-2 italic">No trade history yet</span>}
      </div>
    </div>
  );
}

// ─── Historical backtest on real candles (with costs and out-of-sample split) ──
function HistoricalBacktestPanel({ strategy }: { strategy: Strategy | null | undefined }) {
  const [p, setP] = useState({
    symbol: "EURUSD", timeframe: "1h", periods: 2000,
    strategy: "trend_follow", riskPercent: strategy?.riskPercent || 1, rrRatio: strategy?.rrRatio || 2,
  });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiRequest("POST", "/api/backtest/historical", p);
      setResult(await r.json());
    } catch (e: any) {
      setError(e.message.replace(/^\d+:\s*/, ""));
    } finally {
      setLoading(false);
    }
  };

  const Stat = ({ label, value, good }: { label: string; value: string; good?: boolean }) => (
    <div className="bg-muted/20 rounded-lg p-2.5">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className={cn("font-mono font-bold text-sm", good === undefined ? "" : good ? "text-green-500" : "text-red-500")}>{value}</p>
    </div>
  );
  const sel = "bg-background border border-border rounded px-2 py-1 text-xs font-mono";

  return (
    <div className="bg-card/40 border border-border rounded-xl overflow-hidden">
      <div className="bg-card/60 px-5 py-4 border-b border-border flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-primary" />
        <h3 className="font-bold">Historical Backtest</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Real candles · spread, slippage & commission included</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <select className={sel} value={p.symbol} onChange={e => setP({ ...p, symbol: e.target.value })}>
            {["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","XAUUSD","GBPJPY"].map(s => <option key={s}>{s}</option>)}
          </select>
          <select className={sel} value={p.timeframe} onChange={e => setP({ ...p, timeframe: e.target.value })}>
            {[["15min","M15"],["1h","H1"],["4h","H4"],["1day","D1"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className={sel} value={p.strategy} onChange={e => setP({ ...p, strategy: e.target.value })}>
            <option value="trend_follow">Trend follow (EMA + RSI)</option>
            <option value="mean_revert">Mean revert (RSI 30/70)</option>
            <option value="breakout">20-bar breakout</option>
          </select>
          <label className="text-[10px] text-muted-foreground">Risk %<input type="number" step="0.25" min="0.1" max="5" className={cn(sel, "w-16 ml-1")} value={p.riskPercent} onChange={e => setP({ ...p, riskPercent: parseFloat(e.target.value) || 1 })} /></label>
          <label className="text-[10px] text-muted-foreground">R:R<input type="number" step="0.5" min="0.5" max="10" className={cn(sel, "w-16 ml-1")} value={p.rrRatio} onChange={e => setP({ ...p, rrRatio: parseFloat(e.target.value) || 2 })} /></label>
          <Button size="sm" onClick={run} disabled={loading} className="h-8">{loading ? "Running…" : "Run on history"}</Button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {result && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">{result.startDate} → {result.endDate} · {result.totalTrades} trades · costs assumed: {result.assumptions.spreadPips} pip spread, {result.assumptions.slippagePips} pip slippage, ${result.assumptions.commissionPerLot}/lot</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Net profit" value={`$${result.netProfit.toFixed(2)}`} good={result.netProfit > 0} />
              <Stat label="Profit factor" value={String(result.profitFactor)} good={result.profitFactor > 1} />
              <Stat label="Win rate" value={`${result.winRate}%`} />
              <Stat label="Max drawdown" value={`${result.maxDrawdownPct}%`} good={result.maxDrawdownPct < 20} />
              <Stat label="Expectancy / trade" value={`$${result.expectancy}`} good={result.expectancy > 0} />
              <Stat label="Costs paid" value={`$${result.totalCosts.toFixed(2)}`} />
              <Stat label="In-sample PF (first 70%)" value={`${result.inSample.profitFactor} · ${result.inSample.trades} tr`} good={result.inSample.profitFactor > 1} />
              <Stat label="Out-of-sample PF (last 30%)" value={`${result.outOfSample.profitFactor} · ${result.outOfSample.trades} tr`} good={result.outOfSample.profitFactor > 1} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {result.totalTrades < 100
                ? "Fewer than 100 trades — too few to conclude anything. Use a longer history or lower timeframe."
                : result.outOfSample.profitFactor < 1 && result.inSample.profitFactor > 1
                ? "Profitable in-sample but not out-of-sample: a classic sign of overfitting. Don't trade this as-is."
                : result.outOfSample.profitFactor > 1
                ? "Held up out-of-sample. Next step: paper-trade it for several weeks before risking money."
                : "Not profitable after costs on this history."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BacktestPanel({ strategy }: { strategy: Strategy | null | undefined }) {
  const { data: settings } = useSettings();
  const liveBalance = parseFloat(String((settings as any)?.brokerBalance ?? 0)) || (strategy as any)?.accountSize || 10000;

  const [params, setParams] = useState({
    winRate: 55, riskPercent: strategy?.riskPercent || 2,
    rrRatio: strategy?.rrRatio || 2.5, numTrades: 100,
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const r = await apiRequest("POST", "/api/backtest", { ...params, startBalance: liveBalance });
      setResult(await r.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card/40 border border-border rounded-xl overflow-hidden">
      <div className="bg-card/60 px-5 py-4 border-b border-border flex items-center gap-2">
        <Activity className="w-4 h-4 text-accent" />
        <h3 className="font-bold">Risk-of-Ruin Simulator</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Uses the win rate you enter — not market data</span>
      </div>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Win Rate %", key: "winRate", min: 30, max: 80 },
            { label: "Risk/Trade %", key: "riskPercent", min: 0.5, max: 5, step: 0.5 },
            { label: "R:R Ratio", key: "rrRatio", min: 1, max: 5, step: 0.5 },
            { label: "# of Trades", key: "numTrades", min: 20, max: 500, step: 10 },
          ].map(({ label, key, min, max, step = 1 }) => (
            <div key={key}>
              <label className="text-[10px] text-muted-foreground font-mono uppercase">{label}</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="range" min={min} max={max} step={step}
                  value={(params as any)[key]}
                  onChange={e => setParams({ ...params, [key]: parseFloat(e.target.value) })}
                  className="flex-1 accent-primary"
                />
                <span className="font-mono text-sm font-bold text-primary w-10 text-right">{(params as any)[key]}</span>
              </div>
            </div>
          ))}
        </div>

        <Button onClick={run} disabled={loading} className="w-full gap-2" data-testid="button-run-backtest">
          {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Simulating…</> : <><Activity className="w-4 h-4" /> Run Simulation</>}
        </Button>

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Profit Factor", value: result.stats.profitFactor?.toFixed(2) ?? "—", color: result.stats.profitFactor > 1.5 ? "text-green-500" : "text-orange-400" },
                { label: "Win Probability", value: `${result.stats.winProbability}%`, color: result.stats.winProbability > 60 ? "text-green-500" : "text-orange-400" },
                { label: "Median Return", value: `${result.stats.medianReturn > 0 ? "+" : ""}${result.stats.medianReturn}%`, color: result.stats.medianReturn > 0 ? "text-green-500" : "text-destructive" },
                { label: "Median Balance", value: `$${result.stats.medianFinal?.toLocaleString()}`, color: "text-foreground" },
                { label: "Worst 10% Case", value: `$${result.stats.worstCase?.toLocaleString()}`, color: "text-destructive" },
                { label: "Best 10% Case", value: `$${result.stats.bestCase?.toLocaleString()}`, color: "text-green-500" },
              ].map((s, i) => (
                <div key={i} className="bg-background/50 rounded p-3 border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {result.stats.ruin && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  <h4 className="text-sm font-semibold text-destructive">Risk of Ruin Analysis</h4>
                  <span className="ml-auto text-[10px] text-muted-foreground">Max drawdown across all paths: <strong>{result.stats.ruin.worstDrawdownPct}%</strong></span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "≥30% Drawdown", pct: result.stats.ruin.at30pct, color: result.stats.ruin.at30pct > 30 ? "text-destructive" : result.stats.ruin.at30pct > 15 ? "text-orange-400" : "text-green-500" },
                    { label: "≥50% Drawdown", pct: result.stats.ruin.at50pct, color: result.stats.ruin.at50pct > 15 ? "text-destructive" : result.stats.ruin.at50pct > 5 ? "text-orange-400" : "text-green-500" },
                    { label: "≥80% Drawdown", pct: result.stats.ruin.at80pct, color: result.stats.ruin.at80pct > 5 ? "text-destructive" : "text-green-500" },
                  ].map(s => (
                    <div key={s.label} className="bg-background/50 border border-border/50 rounded p-2.5 text-center">
                      <p className="text-[9px] text-muted-foreground uppercase font-mono mb-1">{s.label}</p>
                      <p className={cn("text-2xl font-bold font-mono", s.color)}>{s.pct}%</p>
                      <p className="text-[9px] text-muted-foreground">of simulations</p>
                    </div>
                  ))}
                </div>
                {result.stats.ruin.at50pct > 20 && (
                  <p className="text-[10px] text-destructive/80">
                    ⚠ High ruin risk detected. Consider reducing position size or improving win rate before trading live.
                  </p>
                )}
              </div>
            )}

            <div className="h-48">
              <p className="text-[10px] text-muted-foreground font-mono uppercase mb-2">Simulated Equity Paths (20 scenarios)</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="trade" type="number" domain={[0, params.numTrades]} tick={{ fontSize: 9, fill: "#666" }} />
                  <YAxis tick={{ fontSize: 9, fill: "#666" }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(0)}`, "Balance"]} contentStyle={{ background: "#1a1a2e", border: "1px solid #333" }} />
                  {result.paths?.map((path: number[], i: number) => (
                    <Line
                      key={i} data={path.map((b, t) => ({ trade: t, balance: b }))}
                      dataKey="balance" dot={false} strokeWidth={1}
                      stroke={path[path.length - 1] > liveBalance ? "#22c55e" : "#ef4444"}
                      opacity={0.35}
                    />
                  ))}
                  <ReferenceLine y={liveBalance} stroke="#888" strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Copy Strategy Modal ───────────────────────────────────────────────────────

function CopyStrategyModal({ trader, onClose, onCopied }: { trader: any; onClose: () => void; onCopied: () => void }) {
  const { toast } = useToast();
  const { data: strategy, isLoading } = useQuery<any>({
    queryKey: ["/api/leaderboard", trader.userId, "strategy"],
    queryFn: () => apiRequest("GET", `/api/leaderboard/${trader.userId}/strategy`).then(r => r.json()),
  });

  const copyMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/strategy/copy", { fromUserId: trader.userId }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Strategy Copied!", description: `Now using ${trader.username}'s strategy.`, className: "border-green-500/50" });
      onCopied();
      onClose();
    },
    onError: () => toast({ title: "Copy failed", variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-card/80 px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">{trader.username}'s Strategy</h3>
            <p className="text-xs text-muted-foreground">
              {trader.trades} trades · {trader.winRate}% win rate ·
              <span className={trader.totalPL >= 0 ? "text-green-500" : "text-destructive"}>
                {" "}{trader.totalPL >= 0 ? "+" : ""}${trader.totalPL.toFixed(2)} P&L
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading strategy…
            </div>
          ) : strategy?.message ? (
            <p className="text-muted-foreground text-sm text-center py-6">{strategy.message}</p>
          ) : strategy ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase mb-1">Strategy Name</p>
                <p className="font-semibold">{strategy.name}</p>
              </div>
              {strategy.description && (
                <div>
                  <p className="text-xs text-muted-foreground font-mono uppercase mb-1">Description</p>
                  <p className="text-sm text-muted-foreground">{strategy.description}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Risk / Trade", value: `${strategy.riskPercent}%` },
                  { label: "R:R Ratio", value: `${strategy.rrRatio}:1` },
                  { label: "Max Positions", value: strategy.maxPositions },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-background/50 rounded-lg p-3 border border-border/50 text-center">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">{label}</p>
                    <p className="font-bold text-primary">{value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background/50 rounded-lg p-3 border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">Goal</p>
                  <p className="text-sm font-semibold capitalize">{strategy.goal}</p>
                </div>
                <div className="bg-background/50 rounded-lg p-3 border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">Style</p>
                  <p className="text-sm font-semibold capitalize">{strategy.style}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 gap-2 bg-primary"
            onClick={() => copyMutation.mutate()}
            disabled={copyMutation.isPending || isLoading || !strategy || !!strategy?.message}
            data-testid="button-copy-strategy"
          >
            {copyMutation.isPending
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Copying…</>
              : <><Copy className="w-4 h-4" /> Copy This Strategy</>}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function LeaderboardPanel() {
  const queryClient = useQueryClient();
  const [selectedTrader, setSelectedTrader] = useState<any>(null);
  const { data: board = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/leaderboard"],
    queryFn: () => apiRequest("GET", "/api/leaderboard").then(r => r.json()),
    refetchInterval: 60000,
  });

  return (
    <>
      <div className="bg-card/40 border border-border rounded-xl overflow-hidden">
        <div className="bg-card/60 px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-bold">Trader Leaderboard</h3>
          </div>
          <p className="text-[11px] text-muted-foreground">Click a trader to copy their strategy</p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : board.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No traders yet</div>
        ) : (
          <div className="divide-y divide-border/30">
            {board.map((trader: any, i: number) => (
              <button
                key={trader.userId}
                className={`w-full flex items-center px-5 py-3 gap-4 hover:bg-muted/20 transition-colors text-left ${i === 0 ? "bg-yellow-500/5" : ""}`}
                onClick={() => setSelectedTrader(trader)}
                data-testid={`leaderboard-row-${i}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                  i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                  i === 1 ? "bg-gray-500/20 text-gray-300" :
                  i === 2 ? "bg-orange-500/20 text-orange-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {i === 0 ? <Trophy className="w-4 h-4" /> : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{trader.username}</p>
                  <p className="text-[11px] text-muted-foreground">{trader.trades} trades · {trader.winRate}% win rate</p>
                </div>
                <div className={`font-mono font-bold text-sm ${trader.totalPL >= 0 ? "text-green-500" : "text-destructive"}`}>
                  {trader.totalPL >= 0 ? "+" : ""}${trader.totalPL.toFixed(2)}
                </div>
                <Copy className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedTrader && (
          <CopyStrategyModal
            trader={selectedTrader}
            onClose={() => setSelectedTrader(null)}
            onCopied={() => queryClient.invalidateQueries({ queryKey: ["/api/strategies"] })}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Risk Dashboard ───────────────────────────────────────────────────────────
function RiskDashboard() {
  const queryClient = useQueryClient();
  const { data: dash, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/risk/dashboard"],
    queryFn: () => apiRequest("GET", "/api/risk/dashboard").then(r => r.json()),
    refetchInterval: 30000,
  });

  const resume = useMutation({
    mutationFn: () => apiRequest("POST", "/api/risk/resume").then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/risk/dashboard"] }),
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ dailyLossLimit: 500, maxDrawdownLimit: 2000, maxOpenPositions: 5 });

  const saveLimits = useMutation({
    mutationFn: (vals: typeof form) => apiRequest("PUT", "/api/risk/limits", vals).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/risk/dashboard"] }); setEditing(false); },
  });

  useEffect(() => {
    if (dash?.limits) {
      setForm({
        dailyLossLimit: dash.limits.dailyLossLimit ?? 500,
        maxDrawdownLimit: dash.limits.maxDrawdownLimit ?? 2000,
        maxOpenPositions: dash.limits.maxOpenPositions ?? 5,
      });
    }
  }, [dash?.limits]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading risk data…
    </div>
  );

  const RiskGauge = ({ label, current, limit, breached, percentUsed, barHue = "#3b82f6" }: any) => {
    const pct = Math.min(100, percentUsed);
    const barColor = breached ? "#ef4444" : pct > 70 ? "#f59e0b" : barHue;
    return (
      <div className={`rounded-xl border p-4 ${breached ? "border-destructive/50 bg-destructive/5" : "border-border bg-card/40"}`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
          {breached && <span className="text-[9px] font-bold text-destructive bg-destructive/10 border border-destructive/20 rounded px-1.5 py-0.5">BREACHED</span>}
        </div>
        <p className={`text-xl font-bold mb-1 ${breached ? "text-destructive" : ""}`}>
          {current}
          {limit != null && <span className="text-xs text-muted-foreground font-normal"> / {limit}</span>}
        </p>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">{pct}% of limit used</p>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {dash?.tradingPaused && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
          <PauseCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-destructive text-sm">Trading Paused</p>
            <p className="text-xs text-muted-foreground mt-0.5">{dash.pauseReason || "Risk limit reached"}</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5 text-xs" onClick={() => resume.mutate()} disabled={resume.isPending}>
            <PlayCircle className="w-3.5 h-3.5" /> Resume
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <RiskGauge
          label="Daily P&L"
          current={`${(dash?.daily?.pl ?? 0) >= 0 ? "+" : ""}$${Math.abs(dash?.daily?.pl ?? 0).toFixed(0)}`}
          limit={`$${dash?.daily?.limit ?? 500} limit`}
          breached={dash?.daily?.breached}
          percentUsed={dash?.daily?.percentUsed ?? 0}
          barHue="#ef4444"
        />
        <RiskGauge
          label="Drawdown"
          current={`$${(dash?.drawdown?.current ?? 0).toFixed(0)}`}
          limit={`$${dash?.drawdown?.limit ?? 2000} max`}
          breached={dash?.drawdown?.breached}
          percentUsed={dash?.drawdown?.percentUsed ?? 0}
          barHue="#f97316"
        />
        <RiskGauge
          label="Open Positions"
          current={dash?.positions?.open ?? 0}
          limit={`${dash?.positions?.limit ?? 5} max`}
          breached={dash?.positions?.breached}
          percentUsed={dash?.positions?.open != null && dash?.positions?.limit
            ? Math.round((dash.positions.open / dash.positions.limit) * 100) : 0}
          barHue="#3b82f6"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card/40 border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Account Balance</p>
          <p className="text-xl font-bold">${(dash?.balance ?? dash?.startingBalance ?? 10000).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Starting: ${(dash?.startingBalance ?? 10000).toLocaleString()}</p>
        </div>
        <div className="bg-card/40 border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Open Exposure</p>
          <p className="text-xl font-bold">{(dash?.positions?.totalLots ?? 0).toFixed(2)} lots</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total position size</p>
        </div>
      </div>

      <div className="bg-card/40 border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Risk Limits
          </h3>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditing(!editing)}>
            {editing ? <><X className="w-3 h-3" /> Cancel</> : "Edit Limits"}
          </Button>
        </div>

        {editing ? (
          <div className="space-y-3">
            {[
              { key: "dailyLossLimit", label: "Daily Loss Limit ($)", min: 50, max: 10000, step: 50 },
              { key: "maxDrawdownLimit", label: "Max Drawdown Limit ($)", min: 100, max: 50000, step: 100 },
              { key: "maxOpenPositions", label: "Max Open Positions", min: 1, max: 20, step: 1 },
            ].map(({ key, label, min, max, step }) => (
              <div key={key}>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number" min={min} max={max} step={step}
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) }))}
                    className="flex-1 h-8 rounded-md border border-border bg-background px-3 text-sm"
                  />
                </div>
              </div>
            ))}
            <Button className="w-full h-8 text-xs gap-1.5" onClick={() => saveLimits.mutate(form)} disabled={saveLimits.isPending}>
              {saveLimits.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save Limits
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Daily Loss</p>
              <p className="font-bold text-sm">${dash?.limits?.dailyLossLimit ?? 500}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Max Drawdown</p>
              <p className="font-bold text-sm">${dash?.limits?.maxDrawdownLimit ?? 2000}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Max Positions</p>
              <p className="font-bold text-sm">{dash?.limits?.maxOpenPositions ?? 5}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { data: rawHistory = [] } = usePositionHistory();
  const { data: rawStrategy } = useActiveStrategy();
  const history = rawHistory as Position[];
  const strategy = rawStrategy as Strategy | null | undefined;

  const { data: riskDash } = useQuery<any>({
    queryKey: ["/api/risk/dashboard"],
    queryFn: () => apiRequest("GET", "/api/risk/dashboard").then(r => r.json()),
    staleTime: 30000,
  });
  const startingBalance: number = riskDash?.startingBalance ?? 10000;

  const [activeTab, setActiveTab] = useState("overview");

  const equityCurve = useMemo(() => computeEquityCurve(history, startingBalance), [history, startingBalance]);
  const metrics = useMemo(() => computeMetrics(history, startingBalance), [history, startingBalance]);
  const bySymbol = useMemo(() => computeBySymbol(history), [history]);

  return (
    <AppLayout>
      <div className="flex-1 overflow-hidden flex flex-col h-full bg-background">
        <div className="border-b border-border bg-card/40 shrink-0">
          <div className="h-12 md:h-14 px-4 md:px-6 flex items-center justify-between">
            <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="text-lg md:text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-primary" />
              Analytics
            </motion.h1>
            <Button variant="outline" size="sm" className="h-7 md:h-8 gap-1.5 text-xs shrink-0" onClick={() => window.open("/api/export/analytics", "_blank")} data-testid="button-export-analytics">
              <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">CSV</span>
            </Button>
          </div>
          <div className="flex overflow-x-auto scrollbar-hide border-t border-border/40 px-2 md:px-4 gap-0.5 pb-0">
            {[
              { id: "overview", label: "Overview" },
              { id: "risk", label: "Risk" },
              { id: "backtest", label: "Backtest" },
              { id: "correlation", label: "Correlation" },
              { id: "sessions", label: "Sessions" },
              { id: "leaderboard", label: "Leaderboard" },
            ].map(tab => (
              <button key={tab.id} data-testid={`tab-${tab.id}`}
                className={`px-3 md:px-5 py-2 text-[11px] md:text-xs font-semibold transition-all whitespace-nowrap border-b-2 -mb-px ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setActiveTab(tab.id)}
              >{tab.label}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-6 pb-24 md:pb-6">
          <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">

            {activeTab === "overview" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 md:space-y-6">
                {history.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground">
                    <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="font-semibold">No closed trades yet</p>
                    <p className="text-sm mt-1">Execute trades in the terminal to see analytics here.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                      <StatCard icon={Percent} label="Win Rate" value={`${metrics?.winRate}%`} color={metrics && metrics.winRate >= 50 ? "text-green-500" : "text-destructive"} sub={`${metrics?.wins}W / ${metrics?.losses}L`} />
                      <StatCard icon={TrendingUp} label="Profit Factor" value={metrics?.profitFactor ?? "—"} color={metrics?.profitFactor && metrics.profitFactor >= 1.5 ? "text-green-500" : "text-orange-400"} sub="Gross win / gross loss" />
                      <StatCard icon={AlertTriangle} label="Max Drawdown" value={`${metrics?.maxDrawdownPct}%`} color={metrics?.maxDrawdownPct && metrics.maxDrawdownPct > 10 ? "text-destructive" : "text-orange-400"} sub="Peak-to-trough" />
                      <StatCard icon={DollarSign} label="Avg Win vs Loss" value={`$${metrics?.avgWin}`} sub={`Avg loss: $${metrics?.avgLoss}`} color="text-primary" />
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                      <StatCard icon={Activity}
                        label="Current Streak"
                        value={metrics?.currentStreak === 0 ? "—" : `${Math.abs(metrics?.currentStreak ?? 0)}x ${(metrics?.currentStreak ?? 0) > 0 ? "W" : "L"}`}
                        color={(metrics?.currentStreak ?? 0) > 0 ? "text-green-500" : (metrics?.currentStreak ?? 0) < 0 ? "text-destructive" : "text-foreground"}
                        sub={(metrics?.currentStreak ?? 0) > 0 ? "Keep it going!" : (metrics?.currentStreak ?? 0) < 0 ? "Break the losing run" : "No active streak"}
                      />
                      <StatCard icon={Trophy}
                        label="Best Win Streak"
                        value={`${metrics?.bestWinStreak ?? 0} trades`}
                        color="text-green-500"
                        sub="Consecutive wins"
                      />
                      <StatCard icon={TrendingDown}
                        label="Max Loss Streak"
                        value={`${metrics?.worstLossStreak ?? 0} trades`}
                        color="text-destructive"
                        sub="Consecutive losses"
                      />
                      <StatCard icon={DollarSign}
                        label="Best / Worst Trade"
                        value={`+$${(metrics?.bestTrade ?? 0).toFixed(0)}`}
                        color="text-green-500"
                        sub={`Worst: -$${Math.abs(metrics?.worstTrade ?? 0).toFixed(0)}`}
                      />
                    </div>

                    <DailyPLBar history={history} />

                    <TradeStreaks history={history} />

                    <div className="bg-card/40 border border-border rounded-xl p-4 md:p-5">
                      <p className="text-sm font-bold mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-primary" /> Equity Curve
                      </p>
                      <div className="h-48 md:h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={equityCurve}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                            <XAxis dataKey="trade" tick={{ fontSize: 9, fill: "#666" }} label={{ value: "Trade #", position: "insideBottom", offset: -5, fontSize: 9, fill: "#666" }} />
                            <YAxis tick={{ fontSize: 9, fill: "#666" }} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
                            <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Balance"]} contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }} />
                            <ReferenceLine y={startingBalance} stroke="#444" strokeDasharray="4 4" />
                            <Line type="monotone" dataKey="balance" stroke="#7c3aed" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 md:gap-6">
                      <div className="bg-card/40 border border-border rounded-xl p-4 md:p-5">
                        <p className="text-sm font-bold mb-4 flex items-center gap-2">
                          <BarChart2 className="w-4 h-4 text-accent" /> P&L by Symbol
                        </p>
                        <div className="h-44">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={bySymbol}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                              <XAxis dataKey="symbol" tick={{ fontSize: 9, fill: "#666" }} />
                              <YAxis tick={{ fontSize: 9, fill: "#666" }} tickFormatter={v => `$${v}`} />
                              <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "P&L"]} contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }} />
                              <Bar dataKey="pl" radius={[4, 4, 0, 0]}>
                                {bySymbol.map((entry, i) => (
                                  <Cell key={i} fill={entry.pl >= 0 ? "#22c55e" : "#ef4444"} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="bg-card/40 border border-border rounded-xl p-4 md:p-5">
                        <p className="text-sm font-bold mb-4 flex items-center gap-2">
                          <Award className="w-4 h-4 text-yellow-400" /> Win Rate by Symbol
                        </p>
                        <div className="space-y-2">
                          {bySymbol.map(s => (
                            <div key={s.symbol} className="flex items-center gap-3">
                              <span className="font-mono text-xs w-16 shrink-0">{s.symbol}</span>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${s.winRate}%` }} />
                              </div>
                              <span className="font-mono text-xs w-10 text-right">{s.winRate}%</span>
                              <span className={`font-mono text-xs w-16 text-right ${s.pl >= 0 ? "text-green-500" : "text-destructive"}`}>
                                {s.pl >= 0 ? "+" : ""}${s.pl}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-card/40 border border-border rounded-xl overflow-hidden">
                      <div className="bg-card/60 px-5 py-4 border-b border-border flex items-center gap-2">
                        <Target className="w-4 h-4 text-primary" />
                        <h3 className="font-bold">Recent Trades</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[500px]">
                          <thead>
                            <tr className="border-b border-border/50 text-muted-foreground font-mono uppercase tracking-wider text-[10px]">
                              {["Symbol", "Type", "Entry", "Close", "P&L", "Closed"].map(h => (
                                <th key={h} className="px-4 py-2.5 text-left">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...history].sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime()).slice(0, 20).map((p) => (
                              <tr key={p.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2.5 font-mono font-bold">{p.symbol}</td>
                                <td className={`px-4 py-2.5 font-bold ${p.type === "BUY" ? "text-green-500" : "text-red-400"}`}>{p.type}</td>
                                <td className="px-4 py-2.5 font-mono">{p.entryPrice.toFixed(5)}</td>
                                <td className="px-4 py-2.5 font-mono">{(p.currentPrice || p.entryPrice).toFixed(5)}</td>
                                <td className={`px-4 py-2.5 font-mono font-bold ${(p.profit || 0) >= 0 ? "text-green-500" : "text-destructive"}`}>
                                  {(p.profit || 0) >= 0 ? "+" : ""}${(p.profit || 0).toFixed(2)}
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground">{p.closedAt ? format(new Date(p.closedAt), "MMM d, HH:mm") : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {activeTab === "backtest" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <HistoricalBacktestPanel strategy={strategy} />
                <BacktestPanel strategy={strategy} />
              </motion.div>
            )}

            {activeTab === "correlation" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <LiveCorrelationMatrix />
              </motion.div>
            )}

            {activeTab === "sessions" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 md:space-y-6">
                <MarketSessionClock />
                <SessionWinRate history={history} />
                <SessionHeatmap history={history} />
              </motion.div>
            )}

            {activeTab === "risk" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <RiskDashboard />
              </motion.div>
            )}

            {activeTab === "leaderboard" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <LeaderboardPanel />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
