import { useEffect, useRef, memo } from 'react';

export const TradingViewCalendar = memo(function TradingViewCalendar() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';

    const html = `
      <div class="tradingview-widget-container" style="height:100%;width:100%">
        <div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div>
        <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-events.js" async>
          ${JSON.stringify({
            colorTheme: "dark",
            isTransparent: true,
            width: "100%",
            height: "100%",
            locale: "en",
            importanceFilter: "-1,0,1",
            countryFilter: "us,eu,gb,jp,au,ca,ch",
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
