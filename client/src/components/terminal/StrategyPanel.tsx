import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, Send, Copy, X, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface Strategy {
  name: string;
  description: string;
  timeframe: string;
  rules: string;
  id: string;
}

interface StrategyAdvice {
  approved: boolean;
  confidence: number;
  reasoning: string[];
  suggestion?: string;
}

export function StrategyPanel({
  symbol,
  currentStrategy,
  onStrategySet,
  onStrategyAdvice,
  canCopyFrom,
}: {
  symbol: string;
  currentStrategy: Strategy | null;
  onStrategySet: (strategy: Strategy) => void;
  onStrategyAdvice: (advice: StrategyAdvice) => void;
  canCopyFrom: Strategy | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timeframe, setTimeframe] = useState("M15");
  const [rules, setRules] = useState("");

  const handleSubmit = () => {
    if (!name || !description || !rules) {
      alert("Please fill in all fields");
      return;
    }

    const strategy: Strategy = {
      name,
      description,
      timeframe,
      rules,
      id: `${symbol}-${Date.now()}`,
    };

    // Simulate AI reasoning
    const advice: StrategyAdvice = {
      approved: Math.random() > 0.3,
      confidence: Math.floor(Math.random() * 30 + 70),
      reasoning: [
        "Checked strategy syntax and risk parameters",
        "Verified compatibility with current market conditions",
        "Analyzed historical backtest data",
      ],
      suggestion: canCopyFrom ? `Consider copying from ${canCopyFrom.name}?` : undefined,
    };

    onStrategyAdvice(advice);
    onStrategySet(strategy);

    // Reset form
    setName("");
    setDescription("");
    setRules("");
    setIsOpen(false);
  };

  const handleCopyStrategy = () => {
    if (!canCopyFrom) return;

    const copiedStrategy: Strategy = {
      ...canCopyFrom,
      id: `${symbol}-${Date.now()}`,
      name: `${canCopyFrom.name} (Copied)`,
    };

    // Simulate quick approval for copied strategy
    const advice: StrategyAdvice = {
      approved: true,
      confidence: 92,
      reasoning: [
        "Strategy already proven on similar chart",
        "Market conditions align with previous setup",
        "Risk parameters compatible",
      ],
    };

    onStrategyAdvice(advice);
    onStrategySet(copiedStrategy);
  };

  return (
    <>
      {/* Current Strategy Badge */}
      <div className="px-6 py-4 bg-card/50 border-b border-border space-y-3">
        {currentStrategy ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase text-muted-foreground font-semibold">Active Strategy</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setIsOpen(true)}
              >
                Edit
              </Button>
            </div>
            <div className="bg-background/50 rounded p-2 border border-primary/30">
              <p className="font-semibold text-sm text-primary">{currentStrategy.name}</p>
              <p className="text-xs text-muted-foreground line-clamp-1">{currentStrategy.description}</p>
            </div>
          </div>
        ) : (
          <Button
            className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => setIsOpen(true)}
          >
            <Zap className="w-4 h-4 mr-2" />
            Set Strategy
          </Button>
        )}
      </div>

      {/* Copy Suggestion */}
      {canCopyFrom && currentStrategy && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-6 py-4 bg-accent/10 border-b border-accent/30 flex items-start gap-4"
        >
          <AlertCircle className="w-4 h-4 text-accent mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-accent mb-1">Copy Strategy?</p>
            <p className="text-xs text-muted-foreground mb-2">
              {canCopyFrom.name} is working well. Apply to {symbol}?
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-6 px-2 text-xs bg-accent hover:bg-accent/90"
                onClick={handleCopyStrategy}
              >
                <Copy className="w-3 h-3 mr-1" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setIsOpen(true)}
              >
                Custom
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg bg-card/95 backdrop-blur-xl border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Strategy Configuration - {symbol}
            </DialogTitle>
            <DialogDescription>
              Define your trading strategy. AI will analyze and provide recommendations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-xs">
                Strategy Name
              </Label>
              <Input
                id="name"
                placeholder="e.g., RSI Divergence Scalp"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 bg-background text-foreground border-border"
              />
            </div>

            <div>
              <Label htmlFor="desc" className="text-xs">
                Description
              </Label>
              <Input
                id="desc"
                placeholder="Brief overview of the strategy"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 bg-background text-foreground border-border"
              />
            </div>

            <div>
              <Label htmlFor="tf" className="text-xs">
                Timeframe
              </Label>
              <select
                id="tf"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-background text-foreground border border-border rounded-md text-sm"
              >
                <option>M1</option>
                <option>M5</option>
                <option>M15</option>
                <option>M30</option>
                <option>H1</option>
                <option>H4</option>
                <option>D1</option>
              </select>
            </div>

            <div>
              <Label htmlFor="rules" className="text-xs">
                Entry/Exit Rules
              </Label>
              <Textarea
                id="rules"
                placeholder="e.g., Enter on RSI divergence below 30, Exit on MA crossover..."
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                className="mt-1 bg-background text-foreground border-border min-h-24 font-mono text-xs"
              />
            </div>

            <div className="flex gap-3">
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={handleSubmit}
              >
                <Send className="w-4 h-4 mr-2" />
                Analyze & Set
              </Button>
              <Button
                variant="outline"
                className="px-4"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}