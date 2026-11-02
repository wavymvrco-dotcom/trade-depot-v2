import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { fetchLivePrices } from "./marketdata";

// ─── WebSocket Price Feed ─────────────────────────────────────────────────────
// Broadcasts live price updates to all connected clients every 3 seconds.
// Clients subscribe by sending { type: "subscribe", symbols: ["EURUSD", ...] }

interface PriceClient {
  ws: WebSocket;
  userId?: string;
  symbols: string[];
}

const clients = new Set<PriceClient>();
let priceCache: Record<string, any> = {};
let broadcastInterval: ReturnType<typeof setInterval> | null = null;

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws/prices" });

  wss.on("connection", (ws) => {
    const client: PriceClient = { ws, symbols: [] };
    clients.add(client);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "subscribe" && Array.isArray(msg.symbols)) {
          client.symbols = msg.symbols;
          client.userId = msg.userId;
          // Send current cache immediately
          if (Object.keys(priceCache).length > 0) {
            const filtered = filterPrices(priceCache, client.symbols);
            safeSend(ws, { type: "prices", data: filtered, ts: Date.now() });
          }
        }
        if (msg.type === "ping") {
          safeSend(ws, { type: "pong", ts: Date.now() });
        }
      } catch {}
    });

    ws.on("close", () => clients.delete(client));
    ws.on("error", () => clients.delete(client));
  });

  // Start broadcast loop
  if (!broadcastInterval) {
    broadcastInterval = setInterval(async () => {
      try {
        const prices = await fetchLivePrices();
        priceCache = prices;
        const priceObj = Object.fromEntries(
          Object.entries(prices).map(([sym, p]: [string, any]) => [sym, {
            bid: p.bid, ask: p.ask ?? p.bid,
            change: p.change, changePips: p.changePips,
            ts: Date.now(),
          }])
        );

        for (const client of Array.from(clients)) {
          if (client.ws.readyState !== WebSocket.OPEN) continue;
          const filtered = filterPrices(priceObj, client.symbols);
          if (Object.keys(filtered).length > 0) {
            safeSend(client.ws, { type: "prices", data: filtered, ts: Date.now() });
          }
        }
      } catch {}
    }, 3000);
  }

  console.log("[WebSocket] Price feed ready at /ws/prices");
  return wss;
}

function filterPrices(prices: Record<string, any>, symbols: string[]) {
  if (symbols.length === 0) return prices;
  return Object.fromEntries(
    Object.entries(prices).filter(([sym]) => symbols.includes(sym))
  );
}

function safeSend(ws: WebSocket, data: any) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch {}
}

export function getConnectedClientCount() {
  return clients.size;
}
