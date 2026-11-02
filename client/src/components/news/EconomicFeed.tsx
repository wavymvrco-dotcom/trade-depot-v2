import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { TradingViewCalendar } from "./TradingViewCalendar";

export function EconomicFeed() {
  return (
    <div className="flex flex-col h-full bg-card/30 border-t border-border">
      <div className="h-12 flex items-center px-6 border-b border-border bg-card/50 gap-2 shrink-0">
        <span className="font-semibold text-sm">Real-Time Economic Calendar</span>
        <Badge variant="outline" className="text-[10px] h-5 border-destructive text-destructive gap-1 px-1">
          <AlertCircle className="w-3 h-3" />
          Live Data
        </Badge>
      </div>
      
      <div className="flex-1 min-h-0 w-full overflow-hidden bg-[#131722]">
        <TradingViewCalendar />
      </div>
    </div>
  );
}