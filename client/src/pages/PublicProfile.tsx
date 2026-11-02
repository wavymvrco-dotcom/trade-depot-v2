import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Share2, TrendingUp, TrendingDown, Trophy, Target, Percent, BarChart2, User } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

function StatCard({ label, value, sub, color = "" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-card/50 border border-border rounded-xl p-4 text-center">
      <div className={cn("text-2xl font-bold font-mono", color)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const { toast } = useToast();

  const { data: profile, isLoading, error } = useQuery<any>({
    queryKey: [`/api/profile/${username}`],
    retry: false,
  });

  const shareCard = () => {
    const url = `${window.location.origin}/profile/${username}`;
    if (navigator.share) {
      navigator.share({ title: `${username}'s TradeAI Profile`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast({ title: "Profile link copied!" });
    }
  };

  if (isLoading) return (
    <AppLayout>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  if (error || !profile) return (
    <AppLayout>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <User className="w-12 h-12 opacity-30" />
        <p className="text-sm">Trader not found</p>
      </div>
    </AppLayout>
  );

  const { stats, bySymbol, recentTrades, openPositions, joinedAt } = profile;

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
        {/* Header Card */}
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary/10 to-accent/5 border border-primary/20 rounded-2xl p-6 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <div className="flex items-start justify-between relative">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-primary/25">
                {username?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold">{username}</h1>
                <p className="text-xs text-muted-foreground">
                  Joined {joinedAt ? format(new Date(joinedAt), "MMMM yyyy") : "—"}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", stats.totalPL >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
                    {stats.totalPL >= 0 ? "+" : ""}{stats.totalPL?.toLocaleString("en-US", { minimumFractionDigits: 2 })} P&L
                  </span>
                  {openPositions > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-semibold">
                      {openPositions} open
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={shareCard} data-testid="button-share-profile">
              <Share2 className="w-4 h-4 mr-1.5" /> Share
            </Button>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Trades" value={String(stats.totalTrades)} />
          <StatCard
            label="Win Rate" value={`${stats.winRate}%`}
            color={stats.winRate >= 50 ? "text-green-400" : "text-red-400"}
          />
          <StatCard
            label="Profit Factor" value={stats.profitFactor ? String(stats.profitFactor) : "—"}
            color={stats.profitFactor >= 1 ? "text-green-400" : "text-red-400"}
          />
          <StatCard
            label="Net P&L" value={`$${stats.totalPL?.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            color={stats.totalPL >= 0 ? "text-green-400" : "text-red-400"}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Performance by Symbol */}
          {bySymbol?.length > 0 && (
            <div className="bg-card/50 border border-border rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" /> Performance by Pair</h3>
              <div className="space-y-2">
                {bySymbol.slice(0, 8).map((s: any) => {
                  const max = Math.max(...bySymbol.slice(0, 8).map((x: any) => Math.abs(x.pl)));
                  const pct = max > 0 ? (Math.abs(s.pl) / max) * 100 : 0;
                  return (
                    <div key={s.symbol} className="flex items-center gap-3">
                      <span className="text-xs font-mono w-16 shrink-0">{s.symbol}</span>
                      <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                        <div
                          className={cn("h-full rounded transition-all", s.pl >= 0 ? "bg-green-500/60" : "bg-red-500/60")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={cn("text-xs font-mono w-16 text-right shrink-0", s.pl >= 0 ? "text-green-400" : "text-red-400")}>
                        {s.pl >= 0 ? "+" : ""}{s.pl.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-muted-foreground w-8 shrink-0">{s.trades}t</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent trades */}
          {recentTrades?.length > 0 && (
            <div className="bg-card/50 border border-border rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> Recent Trades</h3>
              <div className="space-y-2">
                {recentTrades.map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-mono w-16 shrink-0">{t.symbol}</span>
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", t.type === "BUY" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400")}>
                      {t.type}
                    </span>
                    <span className={cn("font-mono ml-auto", t.profit >= 0 ? "text-green-400" : "text-red-400")}>
                      {t.profit >= 0 ? "+" : ""}{t.profit?.toFixed(2)}
                    </span>
                    {t.closedAt && <span className="text-muted-foreground ml-2 hidden sm:block">{format(new Date(t.closedAt), "MMM d")}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Avg Win/Loss */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Avg Win" value={`$${stats.avgWin?.toFixed(2)}`}
            sub={`${stats.wins} winning trades`} color="text-green-400"
          />
          <StatCard
            label="Avg Loss" value={`$${stats.avgLoss?.toFixed(2)}`}
            sub={`${stats.losses} losing trades`} color="text-red-400"
          />
        </div>
      </div>
    </AppLayout>
  );
}
