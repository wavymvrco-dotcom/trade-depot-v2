import { useState, useMemo, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Calculator } from "lucide-react";
import { motion } from "framer-motion";
import { useMarketPrices, useCreatePosition } from "@/hooks/useApi";
import { useToast } from "@/hooks/use-toast";

interface Props {
  symbol?: string;
}

const EnhancedOrderPanelContent = memo(function EnhancedOrderPanel({ symbol = "EURUSD" }: Props) {
  const [lotSize, setLotSize] = useState([0.1]);
  const [riskPercent, setRiskPercent] = useState([2]);
  const [showRiskCalc, setShowRiskCalc] = useState(false);

  const { data: prices } = useMarketPrices();
  const createPosition = useCreatePosition();
  const { toast } = useToast();

  const currentPrice = useMemo(() => {
    const p = (prices as any)?.[symbol];
    return p ? { bid: p.bid, ask: p.ask } : { bid: 1.08520, ask: 1.08522 };
  }, [prices, symbol]);

  const spread = symbol === "XAUUSD" ? 0.3 : 0.0012;
  const slPrice = (currentPrice.bid - spread).toFixed(symbol === "XAUUSD" ? 2 : 5);
  const tpPrice = (currentPrice.ask + spread * 2.5).toFixed(symbol === "XAUUSD" ? 2 : 5);

  const riskCalcs = useMemo(() => {
    const slPips = Math.abs((parseFloat(slPrice) - currentPrice.bid) * (symbol === "XAUUSD" ? 100 : 10000));
    const tpPips = Math.abs((parseFloat(tpPrice) - currentPrice.ask) * (symbol === "XAUUSD" ? 100 : 10000));
    const riskReward = slPips > 0 ? (tpPips / slPips).toFixed(2) : "—";
    const riskAmount = (10450.20 * (riskPercent[0] / 100)).toFixed(2);
    const rewardAmount = slPips > 0 ? (parseFloat(riskAmount) * (tpPips / slPips)).toFixed(2) : "0.00";
    return { slPips, tpPips, riskReward, riskAmount, rewardAmount };
  }, [slPrice, tpPrice, riskPercent, currentPrice, symbol]);

  const handleLotDecrease = useCallback(() => setLotSize([Math.max(0.01, parseFloat((lotSize[0] - 0.01).toFixed(2)))]), [lotSize]);
  const handleLotIncrease = useCallback(() => setLotSize([parseFloat((lotSize[0] + 0.01).toFixed(2))]), [lotSize]);

  const handleOrder = useCallback(async (type: "buy" | "sell") => {
    const entryPrice = type === "buy" ? currentPrice.ask : currentPrice.bid;
    try {
      await createPosition.mutateAsync({
        symbol,
        type,
        size: lotSize[0],
        entryPrice,
        currentPrice: entryPrice,
        stopLoss: parseFloat(slPrice),
        takeProfit: parseFloat(tpPrice),
        profit: 0,
        status: "open",
        aiSignal: false,
      });
      toast({
        title: `${type.toUpperCase()} Order Placed`,
        description: `${lotSize[0].toFixed(2)} lots ${symbol} @ ${entryPrice.toFixed(5)}`,
        className: type === "buy" ? "border-green-500/50" : "border-red-500/50",
      });
    } catch (e: any) {
      toast({ title: "Order Failed", description: e.message, variant: "destructive" });
    }
  }, [symbol, lotSize, currentPrice, slPrice, tpPrice, createPosition, toast]);

  return (
    <>
      <div className="h-full overflow-y-auto flex flex-col p-4 md:p-5 space-y-4 md:space-y-5 max-h-[100dvh]">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1 pb-2 border-b border-border/50">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Order Execution</h2>
            <span className="font-mono font-bold text-sm text-primary">{symbol}</span>
          </div>
          <div className="flex justify-between items-center text-xs pt-1">
            <span className="text-muted-foreground">Balance: <span className="text-foreground font-mono font-medium">$10,450.20</span></span>
            <span className="text-muted-foreground">Equity: <span className="text-foreground font-mono font-medium">$10,432.50</span></span>
          </div>
        </motion.div>

        <Tabs defaultValue="market" className="w-full">
          <TabsList className="w-full grid grid-cols-3 bg-muted/40 p-1 rounded-lg h-9">
            <TabsTrigger value="market" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">Market</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">Pending</TabsTrigger>
            <TabsTrigger value="risk" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">Risk</TabsTrigger>
          </TabsList>
          
          <TabsContent value="market" className="space-y-5 mt-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 bg-muted/20 p-3 rounded-lg border border-border/50">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Volume (Lots)</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8 hover:bg-primary/20" onClick={handleLotDecrease}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={lotSize[0].toFixed(2)}
                  className="h-8 font-mono text-center bg-background border-primary/30"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0) setLotSize([val]);
                  }}
                />
                <Button variant="outline" size="icon" className="h-8 w-8 hover:bg-primary/20" onClick={handleLotIncrease}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </div>
              <Slider value={lotSize} min={0.01} max={5.0} step={0.01} onValueChange={setLotSize} className="py-2" />
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Stop Loss (Auto)</Label>
                <div className="h-8 font-mono text-xs bg-background/50 border border-destructive/20 rounded-md px-3 flex items-center text-destructive">{slPrice}</div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Take Profit (Auto)</Label>
                <div className="h-8 font-mono text-xs bg-background/50 border border-green-500/20 rounded-md px-3 flex items-center text-green-500">{tpPrice}</div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="bg-background/40 p-2.5 rounded border border-border/50 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[10px] uppercase">Risk/Reward</span>
                <span className="font-mono font-semibold text-accent">1:{riskCalcs.riskReward}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[10px] uppercase">Live Bid/Ask</span>
                <span className="font-mono text-[11px]">
                  <span className="text-red-400">{currentPrice.bid.toFixed(symbol === "XAUUSD" ? 2 : 5)}</span>
                  {" / "}
                  <span className="text-green-400">{currentPrice.ask.toFixed(symbol === "XAUUSD" ? 2 : 5)}</span>
                </span>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="grid grid-cols-2 gap-3 pt-1">
              <Button
                className="bg-red-500/10 border border-red-500/30 hover:bg-red-500 hover:text-white text-red-500 h-14 flex flex-col items-center justify-center gap-0.5 transition-all shadow-none"
                onClick={() => handleOrder("sell")}
                disabled={createPosition.isPending}
              >
                <span className="font-bold text-sm tracking-widest">SELL</span>
                <span className="text-[10px] font-mono opacity-90">{currentPrice.bid.toFixed(symbol === "XAUUSD" ? 2 : 5)}</span>
              </Button>
              <Button
                className="bg-green-500/10 border border-green-500/30 hover:bg-green-500 hover:text-white text-green-500 h-14 flex flex-col items-center justify-center gap-0.5 transition-all shadow-none"
                onClick={() => handleOrder("buy")}
                disabled={createPosition.isPending}
              >
                <span className="font-bold text-sm tracking-widest">BUY</span>
                <span className="text-[10px] font-mono opacity-90">{currentPrice.ask.toFixed(symbol === "XAUUSD" ? 2 : 5)}</span>
              </Button>
            </motion.div>
          </TabsContent>

          <TabsContent value="pending" className="mt-4">
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground text-xs gap-2">
              <p className="font-medium">Pending Orders</p>
              <p className="text-[10px]">Limit and stop orders will appear here once the broker integration is complete.</p>
            </div>
          </TabsContent>

          <TabsContent value="risk" className="space-y-6 mt-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <Label className="text-xs uppercase text-muted-foreground">Risk % of Balance</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary">{riskPercent[0]}%</span>
                <Slider value={riskPercent} min={0.5} max={5} step={0.1} onValueChange={setRiskPercent} className="flex-1" />
              </div>
              <div className="space-y-2 mt-4 p-3 bg-accent/10 rounded border border-accent/20">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Risk Amount:</span>
                  <span className="font-mono font-bold text-accent">${riskCalcs.riskAmount}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Potential Reward:</span>
                  <span className="font-mono font-bold text-green-500">${riskCalcs.rewardAmount}</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-accent/20">
                  <span className="text-muted-foreground">Risk/Reward Ratio:</span>
                  <span className="font-mono font-bold">1:{riskCalcs.riskReward}</span>
                </div>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-auto border-t border-border pt-4 space-y-3 pb-4">
          <Button
            variant="outline"
            className="w-full h-9 text-xs gap-2 border-accent/50 hover:bg-accent/10"
            onClick={() => setShowRiskCalc(true)}
          >
            <Calculator className="w-4 h-4" />
            Risk Calculator
          </Button>
        </motion.div>
      </div>

      <Dialog open={showRiskCalc} onOpenChange={setShowRiskCalc}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border-border">
          <DialogHeader>
            <DialogTitle>Risk/Reward Calculator</DialogTitle>
            <DialogDescription>Calculate optimal position sizing for {symbol}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground mb-1">Live Ask Price</p>
                <p className="font-mono font-bold text-lg">{currentPrice.ask.toFixed(5)}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Current Risk %</p>
                <p className="font-mono font-bold text-lg text-accent">{riskPercent[0]}%</p>
              </div>
            </div>
            <div className="space-y-2 p-3 bg-accent/10 rounded border border-accent/20 text-xs">
              <div className="flex justify-between">
                <span>Position Size:</span>
                <span className="font-mono font-bold">{lotSize[0].toFixed(2)} lots</span>
              </div>
              <div className="flex justify-between">
                <span>Risk Amount:</span>
                <span className="font-mono font-bold text-destructive">${riskCalcs.riskAmount}</span>
              </div>
              <div className="flex justify-between text-green-500">
                <span>Potential Profit:</span>
                <span className="font-mono font-bold">${riskCalcs.rewardAmount}</span>
              </div>
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90" onClick={() => setShowRiskCalc(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

export function EnhancedOrderPanel({ symbol }: Props) {
  return <EnhancedOrderPanelContent symbol={symbol} />;
}
