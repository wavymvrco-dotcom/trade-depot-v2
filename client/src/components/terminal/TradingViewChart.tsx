import { useEffect, useRef, memo } from 'react';

export const TradingViewChart = memo(function TradingViewChart({ symbol = "EURUSD" }: { symbol?: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';

    const html = `
      <div class="tradingview-widget-container" style="height:100%;width:100%">
        <div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div>
        <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js" async>
          ${JSON.stringify({
            symbols: [[`FX:${symbol}`, `FX:${symbol}|1D`]],
            chartOnly: false,
            width: "100%",
            height: "100%",
            locale: "en",
            colorTheme: "dark",
            autosize: true,
            showVolume: false,
            showMA: false,
            hideDateRanges: false,
            hideMarketStatus: false,
            hideSymbolLogo: false,
            scalePosition: "right",
            scaleMode: "Normal",
            fontFamily: "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
            fontSize: "10",
            noTimeScale: false,
            valuesTracking: "1",
            changeMode: "price-and-percent",
            chartType: "area",
            lineWidth: 2,
            lineType: 0,
            isTransparent: true,
            dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W", "all|1M"],
          })}
        <\/script>
      </div>
    `;
    const fragment = document.createRange().createContextualFragment(html);
    container.current.appendChild(fragment);

    return () => { if (container.current) container.current.innerHTML = ''; };
  }, [symbol]);

  return <div ref={container} className="h-full w-full" />;
});
