import { useEffect, useRef, useState } from "react";

export interface LivePrice {
  bid: number;
  ask: number;
  change: number;
  changePips?: number;
  ts: number;
}

export type LivePrices = Record<string, LivePrice>;

const DEFAULT_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "GBPJPY"];

export function useLivePrices(symbols: string[] = DEFAULT_SYMBOLS) {
  const [prices, setPrices] = useState<LivePrices>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const key = symbols.join(",");

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/prices`);
      wsRef.current = ws;

      // Events from a socket that has since been replaced (symbols changed,
      // reconnect, unmount) must not touch state — otherwise a late "close"
      // from the old socket flips the indicator red while the new one is live.
      const current = () => !disposed && wsRef.current === ws;

      ws.onopen = () => {
        if (!current()) return;
        attempt = 0;
        setConnected(true);
        ws.send(JSON.stringify({ type: "subscribe", symbols: key.split(",") }));
      };
      ws.onmessage = (e) => {
        if (!current()) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "prices" && msg.data) setPrices(prev => ({ ...prev, ...msg.data }));
        } catch {}
      };
      ws.onclose = () => {
        if (!current()) return;
        setConnected(false);
        // Back off 2s, 4s, 8s … up to 30s (e.g. while a sleeping server wakes)
        const delay = Math.min(30_000, 2000 * 2 ** attempt++);
        retry = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [key]);

  const sendPing = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "ping" }));
  };

  return { prices, connected, sendPing };
}
