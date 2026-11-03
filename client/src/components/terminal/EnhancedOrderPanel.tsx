import { useState, useMemo, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ChevronDown, ChevronUp, Calculator } from "lucide-react";
import { motion } from "framer-motion";
import { useMarketPrices, useCreatePosition, useSettings, usePositions, usePositionHistory } from "@/hooks/useApi";
import { useToast } from "@/hooks/use-toast";
import { calcProfit, getSymbolConfig, priceDecimals } from "@shared/pips";
import type { Position } from "@shared/schema";

interface Props {
  symbol?: string;
}

const EnhancedOrderPanelContent = memo(function EnhancedOrderPanel({ symbol = "EURUSD" }: Props) {
  const cfg = getSymbolConfig(symbol);
  const dp = priceDecimals(symbol);
  const [lots, setLots] = useState(0.1);
  const [stopPips, setStopPips] = useState(cfg.minSL * 2);
  const [rr, setRr] = useState(2);
  const [riskPercent, setRiskPercent] = useState([1]);

  const { data: prices } = useMarketPrices();
  const { data: settingsRaw } = useSettings();
  const { data: openRaw = [] } = usePositions();
  const { data: historyRaw = [] } = usePositionHistory();
  const createPosition = useCreatePosition();
  const { toast } = useToast();

  const settings = settingsRaw as any;
  const startBalance = Number(settings?.brokerBalance ?? 10000);
  const balance = startBalance + (historyRaw as Position[]).reduce((s, p) => s + (p.profit ?? 0), 0);
  const equity = balance + (openRaw as Position[]).reduce((s, p) => s + (p.profit ?? 0), 0);

  // /api/market/prices returns { prices: { SYMBOL: quote }, meta }
  const quote = (prices as any)?.prices?.[symbol] as { bid: number; ask: number; source?: string } | undefined;
  const live = !!quote && quote.source !== "simulated";

  const levels = useMemo(() => {
    if (!quote) return null;
    const dist = stopPips * cfg.pipSize;
    return {
      buy:  { entry: quote.ask, sl: quote.ask - dist, tp: quote.ask + dist * rr },
      sell: { entry: quote.bid, sl: quote.bid + dist, tp: quote.bid - dist * rr },
    };
  }, [quote, stopPips, rr, cfg.pipSize]);

  // Dollar risk if the stop is hit, using the same math the server books with
  const riskUSD = levels ? Math.abs(calcProfit("BUY", levels.buy.entry, levels.buy.sl, symbol, lots)) : 0;
  const rewardUSD = riskUSD * rr;

  const sizeFromRisk = useCallback(() => {
    if (!levels) return;
    const lossPerLot = Math.abs(calcProfit("BUY", levels.buy.entry, levels.buy.sl, symbol, 1));
    if (lossPerLot <= 0) return;
    const target = (balance * riskPercent[0]) / 100;
    setLots(Math.max(0.01, Math.min(50, Math.floor((target / lossPerLot) * 100) / 100)));
  }, [levels, balance, riskPercent, symbol]);

  const handleOrder = useCallback(async (side: "BUY" | "SELL") => {
    if (!levels) return;
    const l = side === "BUY" ? levels.buy : levels.sell;
    try {
      const pos: Position = await createPosition.mutateAsync({
        symbol, type: side, size: lots,
        stopLoss: parseFloat(l.sl.toFixed(dp)),
        takeProfit: parseFloat(l.tp.toFixed(dp)),
      });
      toast({
        title: `${side} filled`,
        description: `${pos.size.toFixed(2)} lots ${symbol} @ ${pos.entryPrice.toFixed(dp)}`,
        className: side === "BUY" ? "border-green-500/50" : "border-red-500/50",
      });
    } catch (e: any) {
      toast({ title: "Order rejected", description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" });
    }
  }, [levels, symbol, lots, dp, createPosition, toast]);

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="h-full overflow-y-auto flex flex-col p-4 md:p-5 space-y-4 max-h-[100dvh]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1 pb-2 border-b border-border/50">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Order Execution</h2>
          <span className="font-mono font-bold text-sm text-primary">{symbol}</span>
        </div>
        <div className="flex justify-between items-center text-xs pt-1">
          <span className="text-muted-foreground">Balance: <span className="text-foreground font-mono font-medium">${fmt(balance)}</span></span>
          <span className="text-muted-foreground">Equity: <span className="text-foreground font-mono font-medium">${fmt(equity)}</span></span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {settings?.brokerType && settings.brokerType !== "demo" ? `Orders go to ${String(settings.brokerType).toUpperCase()}` : "Demo account — paper trades only"}
        </p>
      </motion.div>

      <div className="space-y-3 bg-muted/20 p-3 rounded-lg border border-border/50">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Volume (lots)</Label>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setLots(v => Math.max(0.01, +(v - 0.01).toFixed(2)))}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Input
            type="number" step="0.01" min="0.01" value={lots}
            className="h-8 font-mono text-center bg-background"
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setLots(Math.min(50, v)); }}
          />
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setLots(v => Math.min(50, +(v + 0.01).toFixed(2)))}>
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[10px] text-muted-foreground w-14">Risk {riskPercent[0]}%</span>
          <Slider value={riskPercent} min={0.25} max={3} step={0.25} onValueChange={setRiskPercent} className="flex-1" />
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={sizeFromRisk} disabled={!levels}>
            <Calculator className="w-3 h-3" /> Size
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Stop (pips)</Label>
          <Input type="number" min={cfg.minSL} max={cfg.maxSL} value={stopPips} className="h-8 font-mono text-xs"
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setStopPips(Math.min(cfg.maxSL, Math.max(1, v))); }} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Reward : Risk</Label>
          <Input type="number" min={0.5} max={10} step={0.5} value={rr} className="h-8 font-mono text-xs"
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setRr(Math.min(10, Math.max(0.5, v))); }} />
        </div>
      </div>

      <div className="bg-background/40 p-2.5 rounded border border-border/50 text-xs space-y-1.5 font-mono">
        <div className="flex justify-between"><span className="text-muted-foreground text-[10px] uppercase font-sans">Risk if stopped</span><span className="text-red-400">-${fmt(riskUSD)} ({balance > 0 ? ((riskUSD / balance) * 100).toFixed(2) : "0"}%)</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground text-[10px] uppercase font-sans">Reward at target</span><span className="text-green-500">+${fmt(rewardUSD)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground text-[10px] uppercase font-sans">Bid / Ask</span>
          <span>{quote ? <><span className="text-red-400">{quote.bid.toFixed(dp)}</span> / <span className="text-green-400">{quote.ask.toFixed(dp)}</span></> : "—"}</span>
        </div>
        {!live && <p className="text-amber-500 text-[10px] font-sans">No live price — orders are disabled until data returns.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button
          className="bg-red-500/10 border border-red-500/30 hover:bg-red-500 hover:text-white text-red-500 h-14 flex flex-col items-center justify-center gap-0.5 shadow-none"
          onClick={() => handleOrder("SELL")} disabled={!live || createPosition.isPending}
        >
          <span className="font-bold text-sm tracking-widest">SELL</span>
          <span className="text-[10px] font-mono opacity-90">{levels ? `SL ${levels.sell.sl.toFixed(dp)}` : "—"}</span>
        </Button>
        <Button
          className="bg-green-500/10 border border-green-500/30 hover:bg-green-500 hover:text-white text-green-500 h-14 flex flex-col items-center justify-center gap-0.5 shadow-none"
          onClick={() => handleOrder("BUY")} disabled={!live || createPosition.isPending}
        >
          <span className="font-bold text-sm tracking-widest">BUY</span>
          <span className="text-[10px] font-mono opacity-90">{levels ? `SL ${levels.buy.sl.toFixed(dp)}` : "—"}</span>
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">Market orders fill at the server's live quote. Risk limits are checked before every order.</p>
    </div>
  );
});

export function EnhancedOrderPanel({ symbol }: Props) {
  return <EnhancedOrderPanelContent key={symbol} symbol={symbol} />;
}
