import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, ChevronRight } from "lucide-react";

interface StrategyAdvice {
  approved: boolean;
  confidence: number;
  reasoning: string[];
  suggestion?: string;
}

export function StrategyAdvisor({
  advice,
  onDismiss,
}: {
  advice: StrategyAdvice | null;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {advice && (
        <Dialog open={!!advice} onOpenChange={onDismiss}>
          <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-border/50 p-0 overflow-hidden gap-0">
            {/* Header Bar */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 2 }}
              className={`h-1 ${advice.approved ? "bg-pos" : "bg-destructive"} origin-left`}
            />

            <div className="p-6 space-y-4">
              {/* Title */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3"
              >
                {advice.approved ? (
                  <div className="w-12 h-12 rounded-full bg-pos/20 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-pos" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-destructive" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg">
                    {advice.confidence > 0 ? (advice.approved ? "Strategy Approved" : "Strategy Review") : "Strategy Saved"}
                  </h3>
                  {advice.confidence > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Confidence: <span className="font-mono font-bold">{advice.confidence}%</span>
                    </p>
                  )}
                </div>
              </motion.div>

              {/* Reasoning */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="space-y-2"
              >
                <h4 className="text-xs uppercase font-semibold text-muted-foreground">Analysis</h4>
                <ul className="space-y-1.5">
                  {advice.reasoning.map((reason, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="flex gap-2 text-sm"
                    >
                      <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{reason}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>

              {/* Suggestion */}
              {advice.suggestion && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="bg-accent/10 border border-accent/30 rounded-lg p-3"
                >
                  <p className="text-xs text-accent font-semibold mb-1">Suggestion</p>
                  <p className="text-xs text-muted-foreground">{advice.suggestion}</p>
                </motion.div>
              )}

              {/* Status Message */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className={`text-xs font-semibold p-2 rounded text-center ${
                  advice.approved
                    ? "bg-pos/20 text-pos"
                    : "bg-warn/20 text-warn"
                }`}
              >
                {advice.approved
                  ? "✓ Strategy is ready to execute. Monitor carefully."
                  : "Review strategy parameters before deployment."}
              </motion.div>

              {/* Action */}
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={onDismiss}
              >
                Understood
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}