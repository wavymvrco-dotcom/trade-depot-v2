import { db } from "./db";
import { positions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getRiskDashboard } from "./risk";
import { fetchLivePrices, isTradablePrice, type LivePrice } from "./marketdata";
import { highImpactEventNear } from "./calendar";

// ─── Pre-trade guard ──────────────────────────────────────────────────────────
// Every path that opens a position (auto-trade, signal execute, manual order)
// must pass through here. Blocks when risk limits are breached, trading is
// paused, the position limit or lot cap is hit, or the price is not live.

export type TradeCheck =
  | { ok: true; price: LivePrice }
  | { ok: false; reason: string };

export async function checkCanOpenTrade(userId: string, symbol: string, lots: number): Promise<TradeCheck> {
  // Recomputes daily P&L / drawdown and sets the pause flag if a limit is breached
  const risk = await getRiskDashboard(userId);

  if (risk.tradingPaused) {
    return { ok: false, reason: `Trading paused: ${risk.pauseReason || "risk limit breached"}. Resume from the Risk dashboard.` };
  }

  const openRows = await db.select({ id: positions.id }).from(positions)
    .where(and(eq(positions.userId, userId), eq(positions.status, "open")));
  if (risk.limits.maxOpenPositions != null && openRows.length >= risk.limits.maxOpenPositions) {
    return { ok: false, reason: `Max open positions (${risk.limits.maxOpenPositions}) reached.` };
  }

  if (risk.limits.maxPositionSize != null && lots > risk.limits.maxPositionSize) {
    return { ok: false, reason: `Size ${lots} lots exceeds your max position size of ${risk.limits.maxPositionSize} lots.` };
  }

  // Spreads blow out around high-impact releases — don't open into them
  const event = await highImpactEventNear(symbol, 15);
  if (event) return { ok: false, reason: `High-impact news (${event}) within 15 minutes — new ${symbol} trades are paused.` };

  const prices = await fetchLivePrices().catch(() => ({} as Record<string, LivePrice>));
  const price = prices[symbol];
  if (!isTradablePrice(price)) {
    return { ok: false, reason: `No live price for ${symbol} — refusing to trade on simulated or stale data.` };
  }

  return { ok: true, price };
}
