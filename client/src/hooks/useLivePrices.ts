import { useEffect, useRef, useState, useCallback } from "react";

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
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/prices`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", symbols }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "prices" && msg.data) {
          setPrices(prev => ({ ...prev, ...msg.data }));
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 4 seconds
      reconnectRef.current = setTimeout(connect, 4000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [symbols.join(",")]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendPing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "ping" }));
    }
  }, []);

  return { prices, connected, sendPing };
}
