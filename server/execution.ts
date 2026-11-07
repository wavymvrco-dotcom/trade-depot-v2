import { storage } from "./storage";
import { checkCanOpenTrade } from "./trade-guard";
import { fetchLivePrices, isTradablePrice, type LivePrice } from "./marketdata";
import { placeOandaOrder, closeOandaTrade } from "./brokers/oanda";
import { placeMT5Order, closeMT5Trade } from "./brokers/mt5";
import { calcProfit, getSymbolConfig } from "@shared/pips";
import { generateTradeReview } from "./ai-knowledge";
import type { Position } from "@shared/schema";

// ─── Single execution path ────────────────────────────────────────────────────
// Auto-trade, signal execution and manual orders all open and close through
// here, so risk checks, broker routing, fill prices and P&L are computed once.

export type Side = "BUY" | "SELL";

export function normalizeSide(type: string): Side {
  return type.toUpperCase().includes("BUY") ? "BUY" : "SELL";
}

/** Round a lot size to the broker step (0.01) within sane bounds. */
export function roundLots(lots: number): number {
  return Math.max(0.01, Math.min(50, Math.round(lots * 100) / 100));
}

/** Position size in lots for a given account, risk %, and stop distance in price units. */
export function sizeForRisk(symbol: string, accountSize: number, riskPct: number, stopDistance: number): number {
  const cfg = getSymbolConfig(symbol);
  const stopPips = Math.max(1, stopDistance / cfg.pipSize);
  return roundLots((accountSize * riskPct / 100) / (stopPips * cfg.pipValue));
}

export type OpenResult =
  | { ok: true; position: Position; brokerNote: string }
  | { ok: false; reason: string };

export async function openTrade(params: {
  userId: string;
  symbol: string;
  side: Side;
  lots: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  aiSignal?: boolean;
  signalId?: string | null;
  /** Strategy Lab license that placed this order (live trades are traceable to it). */
  licenseId?: string | null;
}): Promise<OpenResult> {
  const { userId, symbol, side } = params;
  const lots = roundLots(params.lots);

  const check = await checkCanOpenTrade(userId, symbol, lots);
  if (!check.ok) return { ok: false, reason: check.reason };

  let fillPrice = side === "BUY" ? check.price.ask : check.price.bid;
  const sl = params.stopLoss ?? null;
  const tp = params.takeProfit ?? null;

  // Stops must be on the losing side of the fill, targets on the winning side
  if (sl != null && (side === "BUY" ? sl >= fillPrice : sl <= fillPrice)) {
    return { ok: false, reason: `Stop loss ${sl} is on the wrong side of the ${side} price ${fillPrice}.` };
  }
  if (tp != null && (side === "BUY" ? tp <= fillPrice : tp >= fillPrice)) {
    return { ok: false, reason: `Take profit ${tp} is on the wrong side of the ${side} price ${fillPrice}.` };
  }

  const settings = await storage.getUserSettings(userId);
  const brokerType = settings?.brokerType ?? "demo";
  let brokerTradeId: string | null = null;
  let brokerNote = "demo";

  if (brokerType === "oanda") {
    if (!settings?.brokerApiKey || !settings.brokerAccountId) return { ok: false, reason: "OANDA is selected but not connected." };
    const fill = await placeOandaOrder(settings.brokerApiKey, settings.brokerAccountId, settings.brokerServer, symbol, side, lots, sl, tp);
    // A rejected broker order is not a position — never record a phantom trade
    if (!fill) return { ok: false, reason: "OANDA rejected the order. Nothing was opened." };
    brokerTradeId = `oanda:${fill.tradeId}`;
    if (fill.price) fillPrice = fill.price;
    brokerNote = `oanda:${settings.brokerServer === "live" ? "live" : "practice"}`;
  } else if (brokerType === "mql5") {
    if (!settings?.brokerServer) return { ok: false, reason: "MT5 bridge is selected but not connected." };
    const ticket = await placeMT5Order(settings.brokerServer, symbol, side, lots, sl, tp);
    if (!ticket) return { ok: false, reason: "MT5 bridge rejected the order. Nothing was opened." };
    brokerTradeId = `mt5:${ticket}`;
    brokerNote = "mt5";
  }

  const position = await storage.createPosition({
    userId, symbol, type: side, size: lots,
    entryPrice: fillPrice, currentPrice: fillPrice,
    stopLoss: sl, takeProfit: tp, profit: 0, status: "open",
    aiSignal: !!params.aiSignal, brokerTradeId, signalId: params.signalId ?? null,
    licenseId: params.licenseId ?? null,
    // Money at risk at the stop, so results can be measured in R
    riskAmount: sl != null ? Math.abs(calcProfit(side, fillPrice, sl, symbol, lots)) : null,
  });
  return { ok: true, position, brokerNote };
}

/**
 * Close a position at the live quote (or a broker fill price). Returns null if
 * no trustworthy price exists and the position has no broker leg to close.
 */
export async function closeTrade(position: Position, opts: { price?: number; reason?: string } = {}): Promise<Position | null> {
  const side = normalizeSide(position.type);
  let closePrice = opts.price ?? null;

  if (closePrice == null) {
    const quote = (await fetchLivePrices().catch(() => ({} as Record<string, LivePrice>)))[position.symbol];
    if (isTradablePrice(quote)) closePrice = side === "BUY" ? quote.bid : quote.ask;
  }

  if (position.brokerTradeId) {
    const settings = await storage.getUserSettings(position.userId);
    if (position.brokerTradeId.startsWith("oanda:") && settings?.brokerApiKey && settings.brokerAccountId) {
      const r = await closeOandaTrade(settings.brokerApiKey, settings.brokerAccountId, settings.brokerServer, position.brokerTradeId);
      if (!r.closed) throw new Error("OANDA did not confirm the close. The position is still open at the broker.");
      if (r.price) closePrice = r.price;
    } else if (position.brokerTradeId.startsWith("mt5:") && settings?.brokerServer) {
      const ok = await closeMT5Trade(settings.brokerServer, position.brokerTradeId.replace(/^mt5:/, ""));
      if (!ok) throw new Error("MT5 bridge did not confirm the close. The position is still open at the broker.");
    }
  }

  if (closePrice == null) return null;

  const profit = calcProfit(side, position.entryPrice, closePrice, position.symbol, position.size);
  const closed = await storage.closePosition(position.id, closePrice, profit);
  if (closed) {
    generateTradeReview({
      userId: closed.userId,
      positionId: closed.id,
      symbol: closed.symbol,
      direction: side === "BUY" ? "long" : "short",
      entryPrice: closed.entryPrice,
      exitPrice: closePrice,
      stopLoss: closed.stopLoss,
      takeProfit: closed.takeProfit,
      profit,
      lots: closed.size,
      openedAt: closed.openedAt ? new Date(closed.openedAt) : new Date(),
      closedAt: new Date(),
      aiSignal: closed.aiSignal,
      exitReason: opts.reason ?? "manual",
    }).catch(() => {});
  }
  return closed ?? null;
}
