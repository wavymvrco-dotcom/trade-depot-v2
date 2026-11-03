/**
 * Yahoo Finance market data — completely free, no API key, no account needed.
 * Uses Yahoo's unofficial chart API that has been stable for 10+ years.
 * All users get real-time forex prices automatically.
 *
 * Cache 30s so parallel user requests share a single upstream fetch.
 */

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

// Internal symbol → Yahoo Finance ticker
const SYMBOL_MAP: Record<string, string> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  AUDUSD: "AUDUSD=X",
  USDCAD: "USDCAD=X",
  XAUUSD: "GC=F",      // Gold futures — most liquid gold price
  GBPJPY: "GBPJPY=X",
};

export interface LivePrice {
  bid: number;
  ask: number;
  change: number;      // % vs previous close
  changePips: number;
  source: "live" | "cached" | "simulated";
  timestamp: number;
}

interface Cache {
  prices: Record<string, LivePrice>;
  fetchedAt: number;
}

let cache: Cache | null = null;
const CACHE_TTL = 30_000; // 30 seconds

let connectionStatus: "connected" | "failed" | "unchecked" = "unchecked";
let lastVerifiedAt: number | null = null;
let lastError: string | null = null;

const FALLBACK: Record<string, number> = {
  EURUSD: 1.0852, GBPUSD: 1.2634, USDJPY: 149.45,
  AUDUSD: 0.6521, USDCAD: 1.3612, XAUUSD: 2345.50, GBPJPY: 188.74,
};

const MAX_PRICE_AGE_MS = 120_000;

/** True only for a real quote fetched within the last 2 minutes — never a hardcoded fallback. */
export function isTradablePrice(p: LivePrice | undefined | null): p is LivePrice {
  return !!p && p.source !== "simulated" && Date.now() - p.timestamp < MAX_PRICE_AGE_MS;
}

function spread(sym: string) {
  if (sym === "XAUUSD") return 0.30;
  if (sym === "USDJPY" || sym === "GBPJPY") return 0.02;
  return 0.00015;
}
function dec(sym: string) {
  if (sym === "XAUUSD") return 2;
  if (sym === "USDJPY" || sym === "GBPJPY") return 3;
  return 5;
}
function pipFactor(sym: string) {
  if (sym === "XAUUSD") return 1;
  if (sym === "USDJPY" || sym === "GBPJPY") return 100;
  return 10000;
}

function makeFallback(sym: string): LivePrice {
  const base = FALLBACK[sym];
  return {
    bid: base,
    ask: parseFloat((base + spread(sym)).toFixed(dec(sym))),
    change: 0, changePips: 0, source: "simulated", timestamp: Date.now(),
  };
}

async function fetchOneSymbol(intSym: string, yfTicker: string): Promise<LivePrice> {
  try {
    const res = await fetch(
      `${YF_BASE}/${encodeURIComponent(yfTicker)}?interval=1m&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TradeAI/1.0)" },
        signal: AbortSignal.timeout(8_000),
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json() as any;
    const meta = json?.chart?.result?.[0]?.meta;

    if (!meta) throw new Error("No data in response");

    const price = meta.regularMarketPrice as number;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;

    if (!price || isNaN(price)) throw new Error("Invalid price");

    const bid = parseFloat(price.toFixed(dec(intSym)));
    const ask = parseFloat((bid + spread(intSym)).toFixed(dec(intSym)));
    const change = prevClose > 0
      ? parseFloat((((bid - prevClose) / prevClose) * 100).toFixed(3))
      : 0;
    const changePips = parseFloat(((bid - prevClose) * pipFactor(intSym)).toFixed(1));

    return { bid, ask, change, changePips, source: "live", timestamp: Date.now() };
  } catch (err: any) {
    return makeFallback(intSym);
  }
}

export async function fetchLivePrices(): Promise<Record<string, LivePrice>> {
  // Serve from cache if still fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return Object.fromEntries(
      Object.entries(cache.prices).map(([k, v]) => [k, { ...v, source: "cached" as const }])
    );
  }

  // Fetch all symbols in parallel — no rate limits with Yahoo Finance
  const entries = Object.entries(SYMBOL_MAP);
  const results = await Promise.all(
    entries.map(([intSym, yfTicker]) => fetchOneSymbol(intSym, yfTicker))
  );

  const prices: Record<string, LivePrice> = {};
  entries.forEach(([intSym], i) => { prices[intSym] = results[i]; });

  // Check if at least some prices came back live
  const liveCount = results.filter(r => r.source === "live").length;

  if (liveCount > 0) {
    cache = { prices, fetchedAt: Date.now() };
    connectionStatus = "connected";
    lastVerifiedAt = Date.now();
    lastError = null;
  } else {
    connectionStatus = "failed";
    lastError = "All symbols returned fallback prices";
    if (cache) {
      return Object.fromEntries(
        Object.entries(cache.prices).map(([k, v]) => [k, { ...v, source: "cached" as const }])
      );
    }
  }

  return prices;
}

/** Quick single-symbol verify — no key needed */
export async function verifyPolygonConnection(): Promise<{
  connected: boolean; message: string; latencyMs?: number;
}> {
  const t0 = Date.now();
  try {
    const price = await fetchOneSymbol("EURUSD", "EURUSD=X");
    const latencyMs = Date.now() - t0;

    if (price.source === "simulated") {
      connectionStatus = "failed";
      lastError = "Yahoo Finance returned no data";
      return { connected: false, message: "Could not reach Yahoo Finance. Check server connectivity." };
    }

    connectionStatus = "connected";
    lastVerifiedAt = Date.now();
    lastError = null;
    cache = null; // force fresh fetch on next prices call

    return {
      connected: true,
      message: `Yahoo Finance live. EUR/USD = ${price.bid.toFixed(5)} · Latency: ${latencyMs}ms · No API key required.`,
      latencyMs,
    };
  } catch (err: any) {
    connectionStatus = "failed";
    lastError = err?.message;
    return { connected: false, message: `Connection error: ${err?.message || "timeout"}` };
  }
}

export function getMarketDataStatus() {
  return {
    provider: "Yahoo Finance",
    status: connectionStatus,
    lastVerifiedAt,
    lastError,
    cacheAge: cache ? Date.now() - cache.fetchedAt : null,
    hasApiKey: true, // no key needed — always "available"
  };
}
