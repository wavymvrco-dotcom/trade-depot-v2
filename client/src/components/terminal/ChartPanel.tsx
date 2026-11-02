import { memo } from "react";
import { TradingViewAdvancedChart } from "./TradingViewAdvancedChart";

export const ChartPanel = memo(function ChartPanel({ symbol = "EURUSD" }: { symbol?: string }) {
  return (
    <div className="h-full w-full flex flex-col min-h-0 bg-[#131722]">
      <div className="flex-1 w-full h-full min-h-0">
        <TradingViewAdvancedChart symbol={symbol} />
      </div>
    </div>
  );
});
