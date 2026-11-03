const API: Record<OandaEnv, string> = {
  live: "https://api-fxtrade.oanda.com/v3",
  practice: "https://api-fxpractice.oanda.com/v3",
};

export type OandaEnv = "live" | "practice";

function toOandaInstrument(symbol: string) {
  return symbol.replace(/^([A-Z]{3})([A-Z]{3})$/, "$1_$2");
}

/** OANDA units per 1.0 standard lot. FX: 100,000 base units. Metals are quoted per ounce. */
export function unitsPerLot(symbol: string): number {
  if (symbol.startsWith("XAU")) return 100;   // 1 lot gold = 100 oz
  if (symbol.startsWith("XAG")) return 5000;  // 1 lot silver = 5,000 oz
  return 100_000;
}

/** Price precision OANDA accepts for SL/TP on this instrument. */
function pricePrecision(symbol: string): number {
  if (symbol.startsWith("XAU") || symbol.includes("JPY")) return 3;
  return 5;
}

function envFrom(value: string | null | undefined): OandaEnv {
  return value === "live" ? "live" : "practice";
}

/**
 * Find the account for this key. Practice is tried first so a key that works
 * on both never silently defaults to real money.
 */
export async function getOandaAccountId(apiKey: string): Promise<{ accountId: string; environment: OandaEnv; balance: number | null } | null> {
  for (const environment of ["practice", "live"] as OandaEnv[]) {
    try {
      const r = await fetch(`${API[environment]}/accounts`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) continue;
      const d: any = await r.json();
      const accountId = d?.accounts?.[0]?.id;
      if (!accountId) continue;
      const summary = await fetch(`${API[environment]}/accounts/${accountId}/summary`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      }).then(x => (x.ok ? x.json() : null)).catch(() => null) as any;
      const balance = summary?.account?.balance ? parseFloat(summary.account.balance) : null;
      return { accountId, environment, balance };
    } catch {
      continue;
    }
  }
  return null;
}

export interface OandaFill { tradeId: string; price: number | null }

export async function placeOandaOrder(
  apiKey: string,
  accountId: string,
  environment: string | null | undefined,
  symbol: string,
  type: "BUY" | "SELL",
  lots: number,
  stopLoss?: number | null,
  takeProfit?: number | null
): Promise<OandaFill | null> {
  const env = envFrom(environment);
  const instrument = toOandaInstrument(symbol);
  const units = Math.round(lots * unitsPerLot(symbol));
  if (units <= 0) return null;
  const dp = pricePrecision(symbol);

  const body: any = {
    order: {
      type: "MARKET",
      instrument,
      units: String(type === "BUY" ? units : -units),
      timeInForce: "FOK",
      positionFill: "DEFAULT",
    },
  };
  if (stopLoss) body.order.stopLossOnFill = { price: stopLoss.toFixed(dp) };
  if (takeProfit) body.order.takeProfitOnFill = { price: takeProfit.toFixed(dp) };

  try {
    const r = await fetch(`${API[env]}/accounts/${accountId}/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data: any = await r.json().catch(() => ({}));
    const fill = data?.orderFillTransaction;
    const tradeId = fill?.tradeOpened?.tradeID;
    if (!r.ok || !tradeId) {
      const reason = data?.orderCancelTransaction?.reason || data?.errorMessage || `HTTP ${r.status}`;
      console.warn(`[OANDA] ${type} ${instrument} ${units}u rejected: ${reason}`);
      return null;
    }
    console.log(`[OANDA:${env}] Filled ${type} ${instrument} ${units}u — trade ${tradeId}`);
    return { tradeId, price: fill?.price ? parseFloat(fill.price) : null };
  } catch (e: any) {
    console.warn(`[OANDA] Order error: ${e.message}`);
    return null;
  }
}

export async function closeOandaTrade(
  apiKey: string,
  accountId: string,
  environment: string | null | undefined,
  tradeId: string
): Promise<{ closed: boolean; price: number | null }> {
  const env = envFrom(environment);
  try {
    const r = await fetch(`${API[env]}/accounts/${accountId}/trades/${tradeId.replace(/^oanda:/, "")}/close`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ units: "ALL" }),
      signal: AbortSignal.timeout(15_000),
    });
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok) return { closed: false, price: null };
    const price = data?.orderFillTransaction?.price ? parseFloat(data.orderFillTransaction.price) : null;
    console.log(`[OANDA:${env}] Closed trade ${tradeId}`);
    return { closed: true, price };
  } catch {
    return { closed: false, price: null };
  }
}

/** Broker-side state of a trade — used to reconcile positions the broker closed (SL/TP fills). */
export async function getOandaTradeState(
  apiKey: string,
  accountId: string,
  environment: string | null | undefined,
  tradeId: string
): Promise<{ state: "OPEN" | "CLOSED"; closePrice: number | null } | null> {
  const env = envFrom(environment);
  try {
    const r = await fetch(`${API[env]}/accounts/${accountId}/trades/${tradeId.replace(/^oanda:/, "")}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const t: any = (await r.json())?.trade;
    if (!t) return null;
    return { state: t.state === "OPEN" ? "OPEN" : "CLOSED", closePrice: t.averageClosePrice ? parseFloat(t.averageClosePrice) : null };
  } catch {
    return null;
  }
}
