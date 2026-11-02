import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { EnhancedOrderPanel } from "@/components/terminal/EnhancedOrderPanel";
import { ShoppingCart, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const PAIRS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
  "USDCHF", "NZDUSD", "GBPJPY", "EURJPY", "EURGBP", "XAUUSD",
];

export default function Trade() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [pairOpen, setPairOpen] = useState(false);

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-border bg-card/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <h1 className="font-semibold text-sm">Place Trade</h1>
          </div>

          {/* Symbol selector */}
          <div className="relative">
            <button
              onClick={() => setPairOpen(o => !o)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-muted border border-border text-sm font-mono font-semibold hover:border-primary/50 transition-colors"
              data-testid="trade-pair-selector"
            >
              {symbol}
              <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", pairOpen && "rotate-180")} />
            </button>
            {pairOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 bg-card border border-border rounded-xl shadow-xl p-2 grid grid-cols-2 gap-0.5 min-w-[160px]">
                {PAIRS.map(p => (
                  <button
                    key={p}
                    onClick={() => { setSymbol(p); setPairOpen(false); }}
                    className={cn(
                      "text-xs font-mono px-3 py-1.5 rounded-lg text-left hover:bg-primary/10 hover:text-primary transition-colors",
                      symbol === p && "bg-primary/15 text-primary font-semibold"
                    )}
                    data-testid={`trade-pair-${p}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Order Panel */}
        <div className="flex-1 overflow-auto">
          <EnhancedOrderPanel symbol={symbol} />
        </div>
      </div>
    </AppLayout>
  );
}
