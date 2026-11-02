import { useState, useCallback, useMemo, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChartPanel } from "@/components/terminal/ChartPanel";
import { ChartTabs } from "@/components/terminal/ChartTabs";
import { EconomicFeed } from "@/components/news/EconomicFeed";
import { EnhancedOrderPanel } from "@/components/terminal/EnhancedOrderPanel";
import { StrategyPanel, type Strategy as ChartStrategy } from "@/components/terminal/StrategyPanel";
import { AINotification } from "@/components/ai/AINotification";
import { StrategyAdvisor } from "@/components/ai/StrategyAdvisor";
import { MarketTicker } from "@/components/terminal/MarketTicker";
import { useToast } from "@/hooks/use-toast";
import { usePositions, usePositionHistory, useClosePosition, useGenerateSignal, useSettings } from "@/hooks/useApi";
import { useLivePrices } from "@/hooks/useLivePrices";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Position } from "@shared/schema";
import { format } from "date-fns";
import {
  BarChart2, BookOpen, ShoppingCart, TrendingUp, TrendingDown,
  Zap, DollarSign, Activity, Wifi, WifiOff, X, PlusSquare,
  ScrollText, Trophy, Target, Clock, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

const GRID_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "GBPJPY", "EURJPY", "EURGBP", "XAUUSD"];
type GridMode = "1x1" | "2x1" | "1x2" | "2x2";
import { cn } from "@/lib/utils";

interface ChartTab {
  id: string;
  symbol: string;
  label: string;
  strategy: ChartStrategy | null;
}

interface StrategyAdvice {
  approved: boolean;
  confidence: number;
  reasoning: string[];
  suggestion?: string;
}

type MobileView = "chart" | "positions" | "orders";

// Compute live floating P&L for a position using live bid/ask
function computeLivePL(position: Position, liveBid: number | undefined, liveAsk: number | undefined): number {
  if (!liveBid && !liveAsk) return position.profit ?? 0;
  const entry = position.entryPrice ?? 0;
  const dir = position.type === "buy" || position.type === "BUY" ? 1 : -1;
  // For BUY: use bid (we sell at bid to close); for SELL: use ask (we buy at ask to close)
  const closePrice = dir === 1 ? (liveBid ?? liveAsk ?? entry) : (liveAsk ?? liveBid ?? entry);
  const size = position.size ?? 0.1;
  const rawPL = (closePrice - entry) * dir * size * 100000;
  return parseFloat(rawPL.toFixed(2));
}

export default function Dashboard() {
  const { toast } = useToast();
  const [tabs, setTabs] = useState<ChartTab[]>([
    { id: "tab1", symbol: "EURUSD", label: "EURUSD", strategy: null },
  ]);
  const [activeTabId, setActiveTabId] = useState("tab1");
  const [strategyAdvice, setStrategyAdvice] = useState<StrategyAdvice | null>(null);
  const [showAddChart, setShowAddChart] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [mobileView, setMobileView] = useState<MobileView>("chart");
  const [gridMode, setGridMode] = useState<GridMode>("1x1");
  const [showGridPicker, setShowGridPicker] = useState(false);
  const [gridSymbols, setGridSymbols] = useState(["GBPUSD", "USDJPY", "AUDUSD"]);
  const [showLedger, setShowLedger] = useState(false);

  const { data: openPositions = [], isLoading: loadingPositions } = usePositions();
  const { data: closedPositions = [], isLoading: loadingHistory } = usePositionHistory();
  const { data: settingsData } = useSettings();
  const closePosition = useClosePosition();
  const generateSignal = useGenerateSignal();

  const positions = openPositions as Position[];
  const history = closedPositions as Position[];
  const settings = (settingsData as any)?.settings ?? (settingsData as any) ?? null;
  const accountBalance = settings?.accountBalance ?? null;
  const brokerConnected = settings?.brokerConnected ?? false;
  const brokerType = settings?.brokerType ?? "demo";

  // Get live prices for all open symbols
  const openSymbols = useMemo(() => {
    return Array.from(new Set(positions.map(p => p.symbol)));
  }, [positions.map(p => p.symbol).join(",")]);

  const { prices: livePrices, connected: wsConnected } = useLivePrices(
    openSymbols.length > 0 ? openSymbols : ["EURUSD"]
  );

  // Compute live P&L for each open position
  const livePLMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const pos of positions) {
      const lp = livePrices[pos.symbol];
      map[pos.id] = computeLivePL(pos, lp?.bid, lp?.ask);
    }
    return map;
  }, [positions, livePrices]);

  const totalLivePL = useMemo(() =>
    Object.values(livePLMap).reduce((sum, v) => sum + v, 0),
    [livePLMap]
  );

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);
  const otherStrategy = useMemo(() => tabs.find((t) => t.id !== activeTabId)?.strategy || null, [tabs, activeTabId]);

  const handleSetStrategy = useCallback((strategy: ChartStrategy) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, strategy } : t)));
  }, [activeTabId]);

  const handleStrategyAdvice = useCallback((advice: StrategyAdvice) => {
    setStrategyAdvice(advice);
  }, []);

  const handleAddChart = useCallback(() => {
    if (!newSymbol.trim()) return;
    const sym = newSymbol.toUpperCase();
    const newTab: ChartTab = { id: `tab-${Date.now()}`, symbol: sym, label: sym, strategy: null };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setNewSymbol("");
    setShowAddChart(false);
  }, [newSymbol]);

  const handleCloseTab = useCallback((id: string) => {
    if (tabs.length === 1) {
      toast({ title: "Cannot close", description: "At least one chart must stay open.", variant: "destructive" });
      return;
    }
    const newTabs = tabs.filter((t) => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) setActiveTabId(newTabs[0].id);
  }, [tabs.length, activeTabId, toast]);

  const handleExecuteTrade = useCallback(() => {
    toast({ title: "Trade Executed", description: "AI trade opened and recorded.", className: "border-green-500/50" });
  }, [toast]);

  const handleCancelTrade = useCallback(() => {
    toast({ title: "Signal Dismissed", description: "AI signal ignored.", variant: "destructive" });
  }, [toast]);

  const handleClosePosition = useCallback(async (position: Position) => {
    const lp = livePrices[position.symbol];
    const dir = position.type === "buy" || position.type === "BUY" ? 1 : -1;
    // Use live price if available, else fallback to simulated
    const closePrice = lp
      ? (dir === 1 ? (lp.bid ?? lp.ask) : (lp.ask ?? lp.bid))
      : (position.entryPrice || 0) + (Math.random() - 0.5) * 0.002;
    const profit = livePLMap[position.id] ?? parseFloat(
      (((closePrice - (position.entryPrice || 0)) * dir) * (position.size || 0.1) * 100000).toFixed(2)
    );
    await closePosition.mutateAsync({ id: position.id, closePrice, profit });
    toast({
      title: "Position Closed",
      description: `${position.symbol} ${position.type.toUpperCase()} closed. P/L: ${profit >= 0 ? "+" : ""}$${profit.toFixed(2)}`,
      className: profit >= 0 ? "border-green-500/50" : "border-destructive/50",
    });
  }, [closePosition, livePrices, livePLMap, toast]);

  const handleGenerateSignal = useCallback(() => {
    generateSignal.mutate(activeTab.symbol);
    toast({ title: "Analyzing market…", description: `Generating AI signal for ${activeTab.symbol}` });
  }, [generateSignal, activeTab.symbol, toast]);

  // ── Sub-component: P&L stat strip ────────────────────────────────────────
  const PLStrip = () => (
    <div className="flex items-center gap-4 text-[11px] font-mono">
      {accountBalance != null && (
        <button
          onClick={() => setShowLedger(true)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors group"
          data-testid="balance-ledger-btn"
          title="View account ledger"
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span className="text-foreground font-semibold group-hover:text-primary">${Number(accountBalance).toLocaleString()}</span>
          <span className="text-muted-foreground/60">balance</span>
          <ScrollText className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
        </button>
      )}
      <div className="flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{positions.length} open</span>
        <span className={cn("font-bold", totalLivePL >= 0 ? "text-green-500" : "text-red-500")}>
          {totalLivePL >= 0 ? "+" : ""}${totalLivePL.toFixed(2)}
        </span>
        <span className="text-muted-foreground/60">live P&L</span>
      </div>
      <div className="flex items-center gap-1" title={wsConnected ? "Live prices connected" : "Price feed disconnected"}>
        {wsConnected
          ? <Wifi className="w-3 h-3 text-green-500" />
          : <WifiOff className="w-3 h-3 text-red-400" />
        }
      </div>
      {brokerConnected && (
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] font-semibold">
          {brokerType.toUpperCase()} Live
        </div>
      )}
    </div>
  );

  // ── Sub-component: position row (live P&L) ─────────────────────────────
  const PositionRow = ({ p }: { p: Position }) => {
    const lp = livePLMap[p.id] ?? p.profit ?? 0;
    const livePrice = livePrices[p.symbol];
    const isBuy = p.type === "buy" || p.type === "BUY";
    return (
      <TableRow className="font-mono text-[11px] border-border/20 hover:bg-muted/30 transition-colors" data-testid={`position-row-${p.id}`}>
        <TableCell className="font-bold">{p.symbol}</TableCell>
        <TableCell>
          <span className={cn("px-1.5 py-0.5 rounded font-bold text-[10px]", isBuy ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10")}>
            {isBuy ? "BUY" : "SELL"}
          </span>
        </TableCell>
        <TableCell>{(p.size ?? 0).toFixed(2)}</TableCell>
        <TableCell>{(p.entryPrice ?? 0).toFixed(5)}</TableCell>
        <TableCell className="text-muted-foreground">
          {livePrice ? (isBuy ? livePrice.bid : livePrice.ask)?.toFixed(5) : "—"}
        </TableCell>
        <TableCell className={cn("font-bold", lp >= 0 ? "text-green-500" : "text-red-500")}>
          {lp >= 0 ? "+" : ""}${lp.toFixed(2)}
        </TableCell>
        <TableCell className="text-red-400">{p.stopLoss?.toFixed(5) || "—"}</TableCell>
        <TableCell className="text-green-400">{p.takeProfit?.toFixed(5) || "—"}</TableCell>
        <TableCell>
          <Button
            size="sm" variant="outline"
            className="h-6 text-[10px] px-2 border-destructive/30 text-destructive hover:bg-destructive hover:text-white"
            onClick={() => handleClosePosition(p)}
            disabled={closePosition.isPending}
            data-testid={`close-position-${p.id}`}
          >
            Close
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">

        {/* Live Market Ticker */}
        <MarketTicker />

        {/* Chart Tabs */}
        <div className="shrink-0 bg-card/40 border-b border-border/50">
          <ChartTabs
            tabs={tabs}
            activeTab={activeTabId}
            onSelectTab={setActiveTabId}
            onAddTab={() => setShowAddChart(true)}
            onCloseTab={handleCloseTab}
          />
        </div>

        {/* ── DESKTOP Layout (md+) ───────────────────────────────────────────── */}
        <div className="flex-1 hidden md:flex flex-row overflow-hidden">

          {/* Left: Chart + Bottom Panel */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-border/50">
            {/* Chart Grid */}
            {gridMode === "1x1" ? (
              <div className="flex-1 relative bg-[#131722] min-h-[280px]">
                <ChartPanel symbol={activeTab.symbol} />
                <button onClick={handleGenerateSignal} disabled={generateSignal.isPending} className={cn("absolute top-3 right-3 z-10 text-[11px] font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all shadow-lg", generateSignal.isPending ? "bg-primary/60 text-primary-foreground cursor-wait" : "bg-primary/90 hover:bg-primary text-primary-foreground")} data-testid="generate-signal-btn">
                  {generateSignal.isPending ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Analyzing…</> : <><Zap className="w-3.5 h-3.5" /> Request AI Signal</>}
                </button>
              </div>
            ) : (
              <div className={cn("flex-1 min-h-[280px]", gridMode === "2x1" && "grid grid-cols-2", gridMode === "1x2" && "flex flex-col", gridMode === "2x2" && "grid grid-cols-2")}>
                {/* Slot 1 — active tab symbol */}
                <div className="relative bg-[#131722] min-h-[140px]">
                  <ChartPanel symbol={activeTab.symbol} />
                  <button onClick={handleGenerateSignal} disabled={generateSignal.isPending} className={cn("absolute top-2 right-2 z-10 text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1 shadow-lg", generateSignal.isPending ? "bg-primary/60 text-primary-foreground cursor-wait" : "bg-primary/90 hover:bg-primary text-primary-foreground")} data-testid="generate-signal-btn">
                    {generateSignal.isPending ? <><span className="w-2.5 h-2.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Analyzing…</> : <><Zap className="w-3 h-3" /> AI Signal</>}
                  </button>
                </div>
                {/* Slot 2 */}
                <div className={cn("relative bg-[#131722] min-h-[140px]", gridMode === "1x2" ? "border-t" : "border-l", "border-border/40")}>
                  <ChartPanel symbol={gridSymbols[0]} />
                  <select value={gridSymbols[0]} onChange={e => setGridSymbols(p => [e.target.value, p[1], p[2]])} className="absolute top-2 left-2 z-10 bg-background/80 text-xs font-mono px-2 py-1 rounded border border-border/50 backdrop-blur-sm cursor-pointer">
                    {GRID_PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                {/* Slots 3 & 4 (2x2 only) */}
                {gridMode === "2x2" && (<>
                  <div className="relative bg-[#131722] min-h-[140px] border-t border-border/40">
                    <ChartPanel symbol={gridSymbols[1]} />
                    <select value={gridSymbols[1]} onChange={e => setGridSymbols(p => [p[0], e.target.value, p[2]])} className="absolute top-2 left-2 z-10 bg-background/80 text-xs font-mono px-2 py-1 rounded border border-border/50 backdrop-blur-sm cursor-pointer">
                      {GRID_PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="relative bg-[#131722] min-h-[140px] border-l border-t border-border/40">
                    <ChartPanel symbol={gridSymbols[2]} />
                    <select value={gridSymbols[2]} onChange={e => setGridSymbols(p => [p[0], p[1], e.target.value])} className="absolute top-2 left-2 z-10 bg-background/80 text-xs font-mono px-2 py-1 rounded border border-border/50 backdrop-blur-sm cursor-pointer">
                      {GRID_PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </>)}
              </div>
            )}

            {/* Add Chart / Layout Strip */}
            <div className="shrink-0 h-8 bg-card/30 border-y border-border/40 flex items-center px-3 gap-3">
              <button onClick={() => setShowGridPicker(true)} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors" data-testid="add-chart-btn">
                <PlusSquare className="w-3.5 h-3.5" />
                Add Chart
              </button>
              {gridMode !== "1x1" && (
                <button onClick={() => setGridMode("1x1")} className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 ml-auto transition-colors">
                  <X className="w-3 h-3" />
                  Reset Layout
                </button>
              )}
              {gridMode !== "1x1" && (
                <span className="text-[10px] font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
                  {gridMode}
                </span>
              )}
            </div>

            <div className="h-64 shrink-0 bg-card/20 flex flex-col">
              <Tabs defaultValue="positions" className="w-full h-full flex flex-col">
                <div className="px-4 border-b border-border/50 bg-muted/20 flex items-center justify-between gap-4">
                  <TabsList className="bg-transparent h-10 p-0 gap-6">
                    <TabsTrigger value="positions" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 h-10 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground data-[state=active]:text-foreground transition-none">
                      <span className="flex items-center gap-2">
                        Open Positions
                        {positions.length > 0 && <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px]">{positions.length}</span>}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 h-10 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground data-[state=active]:text-foreground transition-none">
                      Trade History
                    </TabsTrigger>
                    <TabsTrigger value="news" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 h-10 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground data-[state=active]:text-foreground transition-none">
                      <span className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        Economic Feed
                      </span>
                    </TabsTrigger>
                  </TabsList>
                  <PLStrip />
                </div>

                <TabsContent value="positions" className="flex-1 m-0 overflow-auto data-[state=active]:flex flex-col">
                  {loadingPositions ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Loading positions…</div>
                  ) : positions.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-xs gap-2 p-4">
                      <TrendingUp className="w-8 h-8 opacity-20" />
                      <p className="font-medium">No open positions</p>
                      <p className="text-[10px]">Click "Request AI Signal" to get a trade recommendation</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/30 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow className="hover:bg-transparent border-b-border/30">
                          {["Symbol", "Type", "Size", "Entry", "Live", "P&L", "S/L", "T/P", ""].map(h => (
                            <TableHead key={h} className="text-[10px] uppercase tracking-wider font-semibold h-8 text-muted-foreground">{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {positions.map((p: Position) => <PositionRow key={p.id} p={p} />)}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="history" className="flex-1 m-0 overflow-auto data-[state=active]:flex flex-col">
                  {history.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs p-4 text-center">
                      <div><p className="font-medium mb-1">No trade history yet</p><p className="text-[10px]">Closed positions will appear here with full P&L breakdown.</p></div>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/30 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow className="hover:bg-transparent">
                          {["Symbol", "Type", "Size", "Entry", "Closed", "P&L"].map(h => (
                            <TableHead key={h} className="text-[10px] uppercase tracking-wider font-semibold h-8 text-muted-foreground">{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.slice(0, 30).map((p: Position) => (
                          <TableRow key={p.id} className="font-mono text-[11px] border-border/20 hover:bg-muted/30">
                            <TableCell className="font-bold">{p.symbol}</TableCell>
                            <TableCell><span className={cn("font-bold", p.type === "BUY" || p.type === "buy" ? "text-green-500" : "text-red-500")}>{p.type.toUpperCase()}</span></TableCell>
                            <TableCell>{(p.size ?? 0).toFixed(2)}</TableCell>
                            <TableCell>{(p.entryPrice ?? 0).toFixed(5)}</TableCell>
                            <TableCell className="text-muted-foreground">{p.closedAt ? format(new Date(p.closedAt), "MM/dd HH:mm") : "—"}</TableCell>
                            <TableCell className={cn("font-bold", (p.profit ?? 0) >= 0 ? "text-green-500" : "text-red-500")}>
                              {(p.profit ?? 0) >= 0 ? "+" : ""}${(p.profit ?? 0).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="news" className="flex-1 m-0 overflow-hidden data-[state=active]:flex flex-col relative">
                  <div className="absolute inset-0"><EconomicFeed /></div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-[320px] lg:w-[360px] shrink-0 bg-card flex flex-col overflow-hidden">
            <div className="shrink-0 bg-background/30">
              <div className="px-5 py-2.5 border-b border-border/50 bg-muted/20">
                <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Chart Strategy</span>
              </div>
              <StrategyPanel symbol={activeTab.symbol} currentStrategy={activeTab.strategy} onStrategySet={handleSetStrategy} onStrategyAdvice={handleStrategyAdvice} canCopyFrom={otherStrategy} />
            </div>
            <div className="flex-1 overflow-hidden flex flex-col bg-card/50">
              <EnhancedOrderPanel symbol={activeTab.symbol} />
            </div>
          </div>
        </div>

        {/* ── MOBILE Layout (<md) ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col md:hidden overflow-hidden">

          {/* Chart */}
          <div className={cn("flex-1 relative bg-[#131722]", mobileView !== "chart" && "hidden")}>
            <ChartPanel symbol={activeTab.symbol} />
            <div className="absolute top-3 right-3 z-10 flex gap-2">
              <button
                onClick={handleGenerateSignal}
                disabled={generateSignal.isPending}
                className="bg-primary/90 hover:bg-primary text-primary-foreground text-[11px] font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all shadow-lg"
                data-testid="mobile-generate-signal-btn"
              >
                {generateSignal.isPending
                  ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Analyzing…</>
                  : <><Zap className="w-3.5 h-3.5" /> AI Signal</>
                }
              </button>
            </div>
            {/* Live P&L floating bar */}
            {(positions.length > 0 || accountBalance) && (
              <div className="absolute bottom-0 left-0 right-0 bg-background/85 backdrop-blur-sm border-t border-border/50 px-4 py-2 flex items-center justify-between text-xs font-mono">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  {wsConnected ? <Wifi className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3 text-red-400" />}
                  {positions.length} open
                </span>
                <div className="flex items-center gap-3">
                  {accountBalance != null && (
                    <button onClick={() => setShowLedger(true)} className="text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors" data-testid="mobile-balance-ledger-btn">
                      ${Number(accountBalance).toLocaleString()}
                      <ScrollText className="w-3 h-3" />
                    </button>
                  )}
                  <span className={cn("font-bold", totalLivePL >= 0 ? "text-green-500" : "text-red-500")}>
                    P&L: {totalLivePL >= 0 ? "+" : ""}${totalLivePL.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Positions panel */}
          {mobileView === "positions" && (
            <div className="flex-1 overflow-auto bg-card/20">
              <div className="px-4 py-2 border-b border-border/50 bg-muted/20 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Open Positions ({positions.length})
                </span>
                <span className={cn("text-xs font-mono font-bold", totalLivePL >= 0 ? "text-green-500" : "text-red-500")}>
                  {totalLivePL >= 0 ? "+" : ""}${totalLivePL.toFixed(2)}
                </span>
              </div>
              {positions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                  <TrendingUp className="w-8 h-8 opacity-20" />
                  <p>No open positions</p>
                  <button onClick={() => setMobileView("chart")} className="text-xs text-primary underline">Go to chart →</button>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {positions.map((p: Position) => {
                    const lp = livePLMap[p.id] ?? p.profit ?? 0;
                    const livePrice = livePrices[p.symbol];
                    const isBuy = p.type === "buy" || p.type === "BUY";
                    return (
                      <div key={p.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono font-bold text-sm">{p.symbol}</span>
                              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", isBuy ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10")}>
                                {isBuy ? "BUY" : "SELL"}
                              </span>
                              {p.aiSignal && <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-mono">AI</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              Entry: {(p.entryPrice ?? 0).toFixed(5)} · {(p.size ?? 0).toFixed(2)} lots
                            </div>
                            {livePrice && (
                              <div className="text-[10px] font-mono text-foreground/70">
                                Live: {(isBuy ? livePrice.bid : livePrice.ask)?.toFixed(5)}
                              </div>
                            )}
                            <div className="text-[10px] font-mono mt-0.5 flex gap-2">
                              <span className="text-red-400">SL: {p.stopLoss?.toFixed(5) || "—"}</span>
                              <span className="text-green-400">TP: {p.takeProfit?.toFixed(5) || "—"}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className={cn("font-mono font-bold text-sm", lp >= 0 ? "text-green-500" : "text-red-500")}>
                              {lp >= 0 ? "+" : ""}${lp.toFixed(2)}
                            </span>
                            <Button
                              size="sm" variant="outline"
                              className="h-7 text-[10px] px-2 border-destructive/30 text-destructive hover:bg-destructive hover:text-white"
                              onClick={() => handleClosePosition(p)}
                              disabled={closePosition.isPending}
                              data-testid={`mobile-close-${p.id}`}
                            >
                              Close
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Orders panel */}
          {mobileView === "orders" && (
            <div className="flex-1 overflow-auto flex flex-col">
              <StrategyPanel symbol={activeTab.symbol} currentStrategy={activeTab.strategy} onStrategySet={handleSetStrategy} onStrategyAdvice={handleStrategyAdvice} canCopyFrom={otherStrategy} />
              <div className="flex-1 overflow-hidden flex flex-col bg-card/50">
                <EnhancedOrderPanel symbol={activeTab.symbol} />
              </div>
            </div>
          )}

          {/* Mobile Bottom Nav */}
          <div className="shrink-0 h-16 border-t border-border bg-card flex items-center">
            {([
              { id: "chart", label: "Chart", icon: BarChart2 },
              { id: "positions", label: `Positions${positions.length > 0 ? ` (${positions.length})` : ""}`, icon: TrendingUp },
              { id: "orders", label: "Orders", icon: ShoppingCart },
            ] as { id: MobileView; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setMobileView(id)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 h-full transition-colors",
                  mobileView === id ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`mobile-nav-${id}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <AINotification onExecute={handleExecuteTrade} onCancel={handleCancelTrade} />
      <StrategyAdvisor advice={strategyAdvice} onDismiss={() => setStrategyAdvice(null)} />

      {/* Account Ledger Dialog */}
      <Dialog open={showLedger} onOpenChange={setShowLedger}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border-border max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ScrollText className="w-4 h-4 text-primary" />
              Account Ledger
            </DialogTitle>
            <DialogDescription className="text-xs">Full record of your account balance, trades, and P&L</DialogDescription>
          </DialogHeader>

          {/* Summary Stats */}
          {(() => {
            const totalRealized = history.reduce((s, p) => s + (p.profit ?? 0), 0);
            const equity = (accountBalance ?? 10000) + totalLivePL;
            const startBalance = 10000;
            const wins = history.filter(p => (p.profit ?? 0) > 0);
            const losses = history.filter(p => (p.profit ?? 0) <= 0);
            const winRate = history.length > 0 ? Math.round((wins.length / history.length) * 100) : 0;

            return (
              <>
                <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-border/50 shrink-0">
                  {[
                    { label: "Balance", value: `$${Number(accountBalance ?? 10000).toLocaleString()}`, icon: DollarSign, color: "text-foreground" },
                    { label: "Equity", value: `$${equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, icon: Activity, color: equity >= startBalance ? "text-green-400" : "text-red-400" },
                    { label: "Realized P&L", value: `${totalRealized >= 0 ? "+" : ""}$${totalRealized.toFixed(2)}`, icon: totalRealized >= 0 ? Trophy : Target, color: totalRealized >= 0 ? "text-green-400" : "text-red-400" },
                    { label: "Win Rate", value: `${winRate}%  (${wins.length}W/${losses.length}L)`, icon: Clock, color: winRate >= 50 ? "text-green-400" : "text-yellow-400" },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-muted/20 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide mb-1">
                        <Icon className="w-3 h-3" />
                        {label}
                      </div>
                      <div className={cn("text-sm font-bold font-mono", color)}>{value}</div>
                    </div>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {/* Open Positions */}
                  {positions.length > 0 && (
                    <div className="px-5 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Open Positions ({positions.length})
                      </div>
                      <div className="space-y-1.5">
                        {positions.map(pos => {
                          const livePL = livePLMap[pos.id] ?? pos.profit ?? 0;
                          const isPositive = livePL >= 0;
                          return (
                            <div key={pos.id} data-testid={`ledger-open-${pos.id}`} className="flex items-center justify-between bg-muted/15 rounded-lg px-3 py-2 text-xs font-mono">
                              <div className="flex items-center gap-2">
                                {pos.type?.toUpperCase().includes("BUY")
                                  ? <ArrowUpRight className="w-3.5 h-3.5 text-green-400" />
                                  : <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />
                                }
                                <span className="font-semibold">{pos.symbol}</span>
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold", pos.type?.toUpperCase().includes("BUY") ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400")}>
                                  {pos.type?.toUpperCase()}
                                </span>
                                <span className="text-muted-foreground">{pos.size} lot{(pos.size ?? 1) !== 1 ? "s" : ""}</span>
                              </div>
                              <div className="flex items-center gap-3 text-right">
                                <span className="text-muted-foreground">@ {pos.entryPrice}</span>
                                <span className={cn("font-bold", isPositive ? "text-green-400" : "text-red-400")}>
                                  {isPositive ? "+" : ""}${livePL.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Trade History */}
                  <div className="px-5 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      Trade History ({history.length} closed)
                    </div>
                    {history.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">No closed trades yet</div>
                    ) : (
                      <div className="space-y-1">
                        {[...history].reverse().map((pos, idx) => {
                          const pl = pos.profit ?? 0;
                          const isWin = pl > 0;
                          return (
                            <div key={pos.id ?? idx} data-testid={`ledger-closed-${pos.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/15 transition-colors text-xs font-mono border-b border-border/20 last:border-0">
                              <div className="flex items-center gap-2 min-w-0">
                                {pos.type?.toUpperCase().includes("BUY")
                                  ? <ArrowUpRight className="w-3 h-3 text-green-400 shrink-0" />
                                  : <ArrowDownRight className="w-3 h-3 text-red-400 shrink-0" />
                                }
                                <span className="font-semibold">{pos.symbol}</span>
                                <span className="text-muted-foreground text-[10px] hidden sm:inline">
                                  {pos.closedAt ? format(new Date(pos.closedAt), "MMM d, HH:mm") : "—"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-muted-foreground text-[10px]">{pos.size}L</span>
                                <span className={cn("font-bold w-20 text-right", isWin ? "text-green-400" : "text-red-400")}>
                                  {isWin ? "+" : ""}${Math.abs(pl).toFixed(2)}
                                </span>
                                <span className={cn("text-[10px] w-6 text-center font-bold", isWin ? "text-green-400" : "text-red-400")}>
                                  {isWin ? "W" : "L"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Grid Layout Picker Dialog */}
      <Dialog open={showGridPicker} onOpenChange={setShowGridPicker}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Chart Layout</DialogTitle>
            <DialogDescription>Choose how many charts to show at once.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-1">
            {([
              { mode: "1x1", label: "Single", desc: "1 chart", visual: "▣" },
              { mode: "2x1", label: "Side by Side", desc: "2 charts horizontally", visual: "▣▣" },
              { mode: "1x2", label: "Stacked", desc: "2 charts vertically", visual: "▣\n▣" },
              { mode: "2x2", label: "4 Chart Grid", desc: "2×2 grid", visual: "▣▣\n▣▣" },
            ] as { mode: GridMode; label: string; desc: string; visual: string }[]).map(({ mode, label, desc, visual }) => (
              <button
                key={mode}
                onClick={() => { setGridMode(mode); setShowGridPicker(false); }}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all text-left",
                  gridMode === mode ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-muted/30"
                )}
                data-testid={`grid-mode-${mode}`}
              >
                <div className="text-base font-mono font-bold text-primary mb-1 whitespace-pre-line leading-tight">{visual}</div>
                <div className="text-xs font-semibold mt-1">{label}</div>
                <div className="text-[10px] text-muted-foreground">{desc}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddChart} onOpenChange={setShowAddChart}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border-border">
          <DialogHeader>
            <DialogTitle>Add Chart</DialogTitle>
            <DialogDescription>Enter a forex pair or symbol to add a new chart tab.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="e.g., GBPUSD, AUDJPY, XAUUSD"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddChart(); }}
              className="bg-background"
              autoFocus
              data-testid="add-chart-input"
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setShowAddChart(false); setNewSymbol(""); }}>Cancel</Button>
              <Button className="flex-1 bg-primary" onClick={handleAddChart} disabled={!newSymbol.trim()} data-testid="add-chart-confirm">Add Chart</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
