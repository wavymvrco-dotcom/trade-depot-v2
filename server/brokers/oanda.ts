const LIVE_API = "https://api-fxtrade.oanda.com/v3";
const PRACTICE_API = "https://api-fxpractice.oanda.com/v3";

function base(practice = false) {
  return practice ? PRACTICE_API : LIVE_API;
}

function toOandaInstrument(symbol: string) {
  return symbol.replace(/^([A-Z]{3})([A-Z]{3})$/, "$1_$2");
}

export async function getOandaAccountId(apiKey: string): Promise<string | null> {
  try {
    const r = await fetch(`${LIVE_API}/accounts`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) {
      // Try practice
      const r2 = await fetch(`${PRACTICE_API}/accounts`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r2.ok) return null;
      const d2: any = await r2.json();
      return d2?.accounts?.[0]?.id ?? null;
    }
    const d: any = await r.json();
    return d?.accounts?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function placeOandaOrder(
  apiKey: string,
  accountId: string,
  symbol: string,
  type: "BUY" | "SELL",
  units: number,
  stopLoss?: number | null,
  takeProfit?: number | null
): Promise<string | null> {
  const instrument = toOandaInstrument(symbol);
  const signedUnits = type === "BUY" ? Math.round(units * 100000) : -Math.round(units * 100000);

  const body: any = {
    order: {
      type: "MARKET",
      instrument,
      units: String(signedUnits),
      timeInForce: "FOK",
      positionFill: "DEFAULT",
    },
  };

  if (stopLoss) body.order.stopLossOnFill = { price: stopLoss.toFixed(5) };
  if (takeProfit) body.order.takeProfitOnFill = { price: takeProfit.toFixed(5) };

  for (const apiBase of [LIVE_API, PRACTICE_API]) {
    try {
      const r = await fetch(`${apiBase}/accounts/${accountId}/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) continue;
      const data: any = await r.json();
      const tradeId =
        data?.orderFillTransaction?.tradeOpened?.tradeID ||
        data?.relatedTransactionIDs?.[0] ||
        null;
      console.log(`[OANDA] Placed ${type} ${instrument} × ${units} lots — trade ID: ${tradeId}`);
      return tradeId;
    } catch {
      continue;
    }
  }
  return null;
}

export async function closeOandaTrade(
  apiKey: string,
  accountId: string,
  tradeId: string
): Promise<boolean> {
  for (const apiBase of [LIVE_API, PRACTICE_API]) {
    try {
      const r = await fetch(`${apiBase}/accounts/${accountId}/trades/${tradeId}/close`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ units: "ALL" }),
      });
      if (r.ok) {
        console.log(`[OANDA] Closed trade ${tradeId}`);
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}
