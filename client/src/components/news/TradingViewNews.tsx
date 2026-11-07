import { useEffect, useRef, memo } from 'react';
import { tvTheme, tvGridColor, tvBackground } from "@/lib/theme";

export const TradingViewNews = memo(function TradingViewNews() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';

    const html = `
      <div class="tradingview-widget-container" style="height:100%;width:100%">
        <div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div>
        <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-timeline.js" async>
          ${JSON.stringify({
            feedMode: "all_symbols",
            isTransparent: true,
            displayMode: "regular",
            width: "100%",
            height: "100%",
            colorTheme: tvTheme(),
            locale: "en",
          })}
        <\/script>
      </div>
    `;
    const fragment = document.createRange().createContextualFragment(html);
    container.current.appendChild(fragment);

    return () => { if (container.current) container.current.innerHTML = ''; };
  }, []);

  return <div ref={container} className="h-full w-full" />;
});
