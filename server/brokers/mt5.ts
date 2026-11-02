/**
 * MT5 Broker Bridge
 *
 * MetaTrader 5 does not expose a public cloud REST API.
 * This module connects to a user-configured MT5 REST bridge endpoint.
 *
 * Compatible bridges:
 *   - mt5-rest (Python): https://github.com/khramkov/MQL5-JSON-API
 *   - Local bridge running on the user's trading machine
 *
 * The user sets their bridge URL (e.g. http://localhost:8000) in Settings.
 * For security, the bridge should be behind a VPN or tunnel (ngrok, etc.).
 */

export interface MT5OrderResult {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  sl: number | null;
  tp: number | null;
}

export async function placeMT5Order(
  bridgeUrl: string,
  symbol: string,
  type: "BUY" | "SELL",
  lots: number,
  sl?: number | null,
  tp?: number | null
): Promise<string | null> {
  try {
    const body = {
      action: "ORDER_TYPE_" + type,
      symbol,
      volume: lots,
      sl: sl ?? 0,
      tp: tp ?? 0,
      comment: "TradeAI",
      magic: 20250001,
    };

    const res = await fetch(`${bridgeUrl}/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`MT5 bridge returned ${res.status}`);
    const data = await res.json() as any;

    const ticket = data?.ticket ?? data?.order ?? data?.result?.order;
    if (!ticket) throw new Error("No ticket in MT5 response");

    console.log(`[MT5] Order placed: ${symbol} ${type} ${lots} lots → ticket ${ticket}`);
    return String(ticket);
  } catch (err: any) {
    console.error(`[MT5] Order failed: ${err.message}`);
    return null;
  }
}

export async function closeMT5Trade(
  bridgeUrl: string,
  ticket: string
): Promise<boolean> {
  try {
    const res = await fetch(`${bridgeUrl}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: parseInt(ticket), comment: "TradeAI close" }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`MT5 bridge returned ${res.status}`);
    console.log(`[MT5] Ticket ${ticket} closed`);
    return true;
  } catch (err: any) {
    console.error(`[MT5] Close failed for ticket ${ticket}: ${err.message}`);
    return false;
  }
}

export async function getMT5AccountInfo(bridgeUrl: string): Promise<{
  login: string; balance: number; equity: number; margin: number; currency: string;
} | null> {
  try {
    const res = await fetch(`${bridgeUrl}/account`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json() as any;
    return {
      login: String(data.login ?? ""),
      balance: data.balance ?? 0,
      equity: data.equity ?? 0,
      margin: data.margin ?? 0,
      currency: data.currency ?? "USD",
    };
  } catch {
    return null;
  }
}

export async function testMT5Bridge(bridgeUrl: string): Promise<{ connected: boolean; message: string }> {
  try {
    const info = await getMT5AccountInfo(bridgeUrl);
    if (!info) return { connected: false, message: "Bridge unreachable or no account data" };
    return {
      connected: true,
      message: `Connected · Account ${info.login} · Balance $${info.balance.toFixed(2)} ${info.currency}`,
    };
  } catch (e: any) {
    return { connected: false, message: e.message };
  }
}
