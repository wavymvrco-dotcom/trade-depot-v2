import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePendingSignal, useExecuteSignal, useDismissSignal } from "@/hooks/useApi";
import type { AiSignal } from "@shared/schema";

export function AINotification({ onExecute, onCancel }: {
  onExecute: () => void;
  onCancel: () => void;
}) {
  const [countdown, setCountdown] = useState(10);
  const [visible, setVisible] = useState(false);

  const { data: rawSignal } = usePendingSignal();
  const signal = rawSignal as AiSignal | null | undefined;
  const executeSignal = useExecuteSignal();
  const dismissSignal = useDismissSignal();

  useEffect(() => {
    if (signal?.id) {
      setVisible(true);
      setCountdown(10);
    } else {
      setVisible(false);
    }
  }, [signal?.id]);

  useEffect(() => {
    if (!visible || !signal) return;
    if (countdown <= 0) {
      handleDismiss();
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, visible, signal]);

  const handleExecute = useCallback(async () => {
    if (!signal) return;
    await executeSignal.mutateAsync(signal.id);
    onExecute();
    setVisible(false);
  }, [signal, executeSignal, onExecute]);

  const handleDismiss = useCallback(async () => {
    if (!signal) return;
    await dismissSignal.mutateAsync(signal.id);
    onCancel();
    setVisible(false);
  }, [signal, dismissSignal, onCancel]);

  const isBuy = signal?.action?.includes("BUY");
  const signalColor = isBuy ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5";
  const actionColor = isBuy ? "text-green-400" : "text-red-400";

  return (
    <AnimatePresence>
      {visible && signal && (
        <motion.div
          initial={{ opacity: 0, y: 80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 80, scale: 0.95 }}
          transition={{ type: "spring", damping: 20 }}
          className={`fixed bottom-6 right-6 z-50 w-80 rounded-xl border ${signalColor} backdrop-blur-lg shadow-2xl overflow-hidden`}
        >
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                <Bot className="w-5 h-5 text-primary animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary uppercase tracking-widest mb-0.5">AI Signal Detected</p>
                <p className="font-bold text-base">
                  <span className={actionColor}>{signal.action}</span>{" "}
                  <span className="font-mono">{signal.symbol}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{signal.reasoning}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono bg-background/40 rounded-lg p-2">
              <div className="text-center">
                <p className="text-muted-foreground mb-0.5">ENTRY</p>
                <p className="font-bold">{signal.entryPrice?.toFixed(5)}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground mb-0.5">SL</p>
                <p className="font-bold text-red-400">{signal.stopLoss?.toFixed(5)}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground mb-0.5">TP</p>
                <p className="font-bold text-green-400">{signal.takeProfit?.toFixed(5)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted/30 rounded-full h-1.5">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-1000"
                  style={{ width: `${(countdown / 10) * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono text-muted-foreground w-6 text-right">{countdown}s</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                className={`h-9 text-sm font-bold ${isBuy ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"} text-white`}
                onClick={handleExecute}
                disabled={executeSignal.isPending}
              >
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                Execute
              </Button>
              <Button variant="outline" className="h-9 text-sm" onClick={handleDismiss}>
                <X className="w-3.5 h-3.5 mr-1.5" />
                Dismiss
              </Button>
            </div>

            <div className="flex justify-center">
              <span className="text-[10px] text-muted-foreground font-mono">
                Confidence: <span className="text-primary font-bold">{signal.confidence}%</span>
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
