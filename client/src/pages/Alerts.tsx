import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Plus, Trash2, TrendingUp, TrendingDown, CheckCircle2, Clock, RefreshCw, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useMarketPrices } from "@/hooks/useApi";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "GBPJPY"];

function useAlerts() {
  return useQuery<any[]>({
    queryKey: ["/api/alerts"],
    queryFn: () => apiRequest("GET", "/api/alerts").then(r => r.json()),
    refetchInterval: 15000,
  });
}

function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/alerts", data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });
}

function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/alerts/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });
}

export default function Alerts() {
  const { toast } = useToast();
  const { data: alerts = [], isLoading } = useAlerts();
  const { data: pricesData } = useMarketPrices();
  const prices = (pricesData as any)?.prices || {};
  const createAlert = useCreateAlert();
  const deleteAlert = useDeleteAlert();

  const [form, setForm] = useState({
    symbol: "EURUSD",
    direction: "above",
    targetPrice: "",
    label: "",
  });

  const currentPrice = prices[form.symbol]?.bid;

  const handleCreate = async () => {
    if (!form.targetPrice || isNaN(parseFloat(form.targetPrice))) {
      toast({ title: "Enter a valid price", variant: "destructive" });
      return;
    }
    try {
      await createAlert.mutateAsync({
        ...form,
        targetPrice: parseFloat(form.targetPrice),
      });
      setForm({ ...form, targetPrice: "", label: "" });
      toast({ title: "Alert Created", description: `Alert set for ${form.symbol} ${form.direction} ${form.targetPrice}`, className: "border-green-500/50" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const active = (alerts as any[]).filter(a => !a.triggered);
  const triggered = (alerts as any[]).filter(a => a.triggered);

  return (
    <AppLayout>
      <div className="flex-1 overflow-hidden flex flex-col h-full bg-background">
        <div className="h-16 border-b border-border px-6 py-4 bg-card/40 shrink-0 flex items-center justify-between">
          <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="text-xl md:text-2xl font-bold flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary" />
            Price Alerts
          </motion.h1>
          <div className="text-sm text-muted-foreground font-mono">
            {active.length} active · {triggered.length} triggered
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-2xl mx-auto space-y-6 pb-20">

            {/* Create alert */}
            <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
              <div className="bg-card/70 px-5 py-4 border-b border-border flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" />
                <h3 className="font-bold">New Price Alert</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Symbol</label>
                    <select
                      data-testid="select-alert-symbol"
                      value={form.symbol}
                      onChange={e => setForm({ ...form, symbol: e.target.value })}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none"
                    >
                      {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Direction</label>
                    <select
                      data-testid="select-alert-direction"
                      value={form.direction}
                      onChange={e => setForm({ ...form, direction: e.target.value })}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none"
                    >
                      <option value="above">Price rises above ↑</option>
                      <option value="below">Price falls below ↓</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex justify-between">
                    <span>Target Price</span>
                    {currentPrice && (
                      <button onClick={() => setForm({ ...form, targetPrice: currentPrice.toFixed(form.symbol === "XAUUSD" ? 2 : 5) })}
                        className="text-primary hover:underline">
                        Current: {currentPrice.toFixed(form.symbol === "XAUUSD" ? 2 : 5)}
                      </button>
                    )}
                  </label>
                  <input
                    data-testid="input-alert-price"
                    type="number" step="0.00001"
                    value={form.targetPrice}
                    onChange={e => setForm({ ...form, targetPrice: e.target.value })}
                    placeholder={currentPrice ? currentPrice.toFixed(form.symbol === "XAUUSD" ? 2 : 5) : "e.g. 1.09500"}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Label (optional)</label>
                  <input
                    data-testid="input-alert-label"
                    type="text"
                    value={form.label}
                    onChange={e => setForm({ ...form, label: e.target.value })}
                    placeholder="e.g. Key resistance level"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary outline-none"
                  />
                </div>

                <Button onClick={handleCreate} disabled={createAlert.isPending} className="w-full gap-2" data-testid="button-create-alert">
                  {createAlert.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating…</> : <><Plus className="w-4 h-4" /> Create Alert</>}
                </Button>
              </div>
            </div>

            {/* Active alerts */}
            {isLoading && (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading alerts…
              </div>
            )}

            {active.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Active Alerts ({active.length})
                </h3>
                <AnimatePresence>
                  {active.map((alert: any) => {
                    const current = prices[alert.symbol]?.bid;
                    const pct = current ? ((current - alert.targetPrice) / alert.targetPrice * 100) : null;
                    const isBuy = alert.direction === "above";
                    return (
                      <motion.div key={alert.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="bg-card/40 border border-border rounded-lg p-4 flex items-center gap-4" data-testid={`alert-card-${alert.id}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isBuy ? "bg-green-500/15" : "bg-red-500/15"}`}>
                          {isBuy ? <TrendingUp className="w-5 h-5 text-green-500" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold font-mono">{alert.symbol}</span>
                            <span className="text-xs text-muted-foreground">{alert.direction}</span>
                            <span className="font-mono font-bold text-sm text-primary">{alert.targetPrice}</span>
                          </div>
                          {alert.label && <p className="text-xs text-muted-foreground">{alert.label}</p>}
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                            {current && <span>Current: <span className="font-mono font-bold text-foreground">{current.toFixed(alert.symbol === "XAUUSD" ? 2 : 5)}</span></span>}
                            {pct !== null && <span className={Math.abs(pct) < 0.2 ? "text-orange-400 font-bold" : ""}>{Math.abs(pct).toFixed(2)}% away</span>}
                            <span>Set {alert.createdAt ? formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true }) : ""}</span>
                          </div>
                        </div>
                        <button onClick={() => deleteAlert.mutate(alert.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0" data-testid={`button-delete-alert-${alert.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* Triggered alerts */}
            {triggered.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" /> Triggered ({triggered.length})
                </h3>
                {triggered.map((alert: any) => (
                  <div key={alert.id} className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 flex items-center gap-4 opacity-70" data-testid={`alert-triggered-${alert.id}`}>
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono">{alert.symbol}</span>
                        <span className="text-xs text-muted-foreground">{alert.direction}</span>
                        <span className="font-mono font-bold text-sm">{alert.targetPrice}</span>
                      </div>
                      {alert.label && <p className="text-xs text-muted-foreground">{alert.label}</p>}
                      <p className="text-[11px] text-green-400 mt-0.5">Triggered {alert.triggeredAt ? formatDistanceToNow(new Date(alert.triggeredAt), { addSuffix: true }) : ""}</p>
                    </div>
                    <button onClick={() => deleteAlert.mutate(alert.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && alerts.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">No alerts yet</p>
                <p className="text-sm mt-1">Create your first price alert above to get notified when a level is hit.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
