import { useEffect, useRef, useState, memo } from 'react';

type ChartState = "loading" | "ready" | "failed";

export const TradingViewAdvancedChart = memo(function TradingViewAdvancedChart({ symbol = "EURUSD" }: { symbol?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const containerId = useRef(`tv_chart_${Math.random().toString(36).substring(7)}`);
  const [state, setState] = useState<ChartState>("loading");

  useEffect(() => {
    if (!container.current) return;
    const el = container.current;
    el.innerHTML = '';
    setState("loading");
    let done = false;
    const finish = (s: ChartState) => { if (!done) { done = true; setState(s); } };

    // TradingView draws inside an iframe; "ready" once that iframe has loaded
    const observer = new MutationObserver(() => {
      const frame = el.querySelector("iframe");
      if (frame) {
        observer.disconnect();
        frame.addEventListener("load", () => finish("ready"), { once: true });
      }
    });
    observer.observe(el, { childList: true, subtree: true });
    // Ad blockers and some privacy browsers block TradingView entirely
    const timeout = setTimeout(() => finish("failed"), 15_000);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.type = "text/javascript";
    script.async = true;
    script.onerror = () => finish("failed");
    script.onload = () => {
      if (typeof window !== 'undefined' && (window as any).TradingView) {
        new (window as any).TradingView.widget({
          "autosize": true,
          "symbol": `FX:${symbol}`,
          "interval": "15",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "enable_publishing": false,
          "backgroundColor": "rgba(0, 0, 0, 0)",
          "gridColor": "rgba(255, 255, 255, 0.06)",
          "hide_top_toolbar": false,
          "hide_legend": false,
          "save_image": false,
          "container_id": containerId.current,
          "allow_symbol_change": true,
          "calendar": false,
          "support_host": "https://www.tradingview.com"
        });
      } else {
        finish("failed");
      }
    };

    el.appendChild(script);

    return () => {
      done = true;
      observer.disconnect();
      clearTimeout(timeout);
      el.innerHTML = '';
    };
  }, [symbol]);

  return (
    <div className="relative h-full w-full">
      <div className="h-full w-full" id={containerId.current} ref={container} />
      {state !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {state === "loading" ? (
            <p className="text-xs text-muted-foreground animate-pulse">Loading {symbol} chart…</p>
          ) : (
            <div className="text-center px-6 max-w-sm">
              <p className="text-sm font-semibold text-foreground">Chart couldn't load</p>
              <p className="text-xs text-muted-foreground mt-1">
                Charts come from TradingView. An ad blocker, privacy browser (e.g. Brave shields) or network filter is probably blocking it —
                allow <span className="font-mono">tradingview.com</span> for this site and refresh.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
