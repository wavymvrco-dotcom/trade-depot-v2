import { memo } from "react";
import { TrendingUp, TrendingDown, Radio, AlertCircle, Clock } from "lucide-react";
import { useMarketPrices } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

interface LivePrice {
  bid: number;
  ask: number;
  change: number;
  changePips?: number;
  source?: "live" | "cached" | "simulated";
  timestamp?: number;
}

interface MarketData {
  prices: Record<string, LivePrice>;
  meta?: {
    source: "connected" | "failed" | "unchecked";
    provider: string;
    hasApiKey: boolean;
    cacheAge: number | null;
  };
}

export const MarketTicker = memo(function MarketTicker() {
  const { data: raw } = useMarketPrices();

  if (!raw) return null;

  // Handle both old format (flat prices object) and new format ({prices, meta})
  const data = raw as MarketData | Record<string, LivePrice>;
  const hasMeta = "prices" in data && "meta" in data;
  const prices: Record<string, LivePrice> = hasMeta ? (data as MarketData).prices : (data as Record<string, LivePrice>);
  const meta = hasMeta ? (data as MarketData).meta : null;

  const pairs = Object.entries(prices);
  if (pairs.length === 0) return null;

  const isLive = meta?.source === "connected";
  const isCached = meta?.source === "unchecked" || pairs.some(([, v]) => v.source === "cached");
  const isSimulated = !meta?.hasApiKey || pairs.every(([, v]) => v.source === "simulated");

  return (
    <div className="flex items-center gap-0 overflow-hidden shrink-0 border-b border-border/50 bg-background/80 h-8">
      {/* Source badge */}
      <div className={cn(
        "flex items-center gap-1 px-2 h-full border-r border-border/50 shrink-0 text-[10px] font-semibold",
        isSimulated ? "text-warn" : isLive ? "text-pos" : "text-info"
      )}>
        {isSimulated
          ? <><AlertCircle className="w-3 h-3" /> SIM</>
          : isLive
          ? <><Radio className="w-3 h-3 animate-pulse" /> LIVE</>
          : <><Clock className="w-3 h-3" /> CACHED</>
        }
      </div>

      {/* Price pairs */}
      <div className="flex items-center gap-6 px-3 flex-nowrap overflow-x-auto scrollbar-hide">
        {pairs.map(([symbol, q]) => {
          const dec = symbol === "XAUUSD" ? 2 : symbol === "USDJPY" || symbol === "GBPJPY" ? 3 : 5;
          const up = (q.change ?? 0) >= 0;
          return (
            <div key={symbol} className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono">
              <span className="text-muted-foreground font-semibold">{symbol}</span>
              <span className="font-bold tabular-nums">{q.bid.toFixed(dec)}</span>
              <span className={cn("flex items-center gap-0.5 text-[10px]", up ? "text-pos" : "text-neg")}>
                {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {up ? "+" : ""}{(q.change ?? 0).toFixed(2)}%
              </span>
              {q.changePips !== undefined && q.changePips !== 0 && (
                <span className={cn("text-[9px] tabular-nums", up ? "text-pos/70" : "text-neg/70")}>
                  {up ? "+" : ""}{q.changePips}p
                </span>
              )}
            </div>
          );
        })}
      </div>

      {meta?.provider && (
        <div className="ml-auto pr-3 text-[10px] text-muted-foreground/50 shrink-0 hidden lg:block">
          {meta.provider}
        </div>
      )}
    </div>
  );
});
