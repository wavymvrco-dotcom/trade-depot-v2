import { storage } from "./storage";
import { generateAiSignal } from "./ai-engine";
import { fetchLivePrices, isTradablePrice, type LivePrice } from "./marketdata";
import { getOandaTradeState } from "./brokers/oanda";
import { sendPushToUser } from "./push";
import { calcProfit, getSymbolConfig, priceDecimals } from "@shared/pips";
import { getRiskLimits } from "./risk";
import { openTrade, closeTrade, normalizeSide, sizeForRisk } from "./execution";
import { recordLessonOutcome } from "./ai-knowledge";
import type { Position, AiSignal } from "@shared/schema";
import { latestCalibration, styleFor, type CalibrationResult } from "./tdci-service";

let running = false;
const SIGNAL_INTERVAL_MS = 15 * 60_000;

/** Reason a generated signal may not be auto-executed, or null if it may. */
async function tdciGate(signal: AiSignal, userMin: number): Promise<string | null> {
  // Judge against the calibration for the style this signal was scored with
  const style = styleFor((signal.tdciLayers as any)?.style);
  const cal = await latestCalibration(signal.symbol, style).catch(() => null);
  const recommended = (cal?.result as CalibrationResult | undefined)?.recommendedMin ?? null;
  if (!cal) return `TDCI not calibrated for ${signal.symbol} ${style}`;
  if (recommended == null) return `no proven TDCI edge on ${signal.symbol} ${style}`;
  if (signal.tdciScore == null || !signal.tdciDirection) return "signal has no TDCI reading";
  const wantDir = signal.action.includes("BUY") ? "LONG" : "SHORT";
  if (signal.tdciDirection !== wantDir) return `TDCI points ${signal.tdciDirection}, signal is ${signal.action}`;
  const min = Math.max(userMin, recommended);
  if (signal.tdciScore < min) return `TDCI ${signal.tdciScore} below required ${min}`;
  return null;
}

// ─── Trading Session Helpers ──────────────────────────────────────────────────

const SESSION_UTC_HOURS: Record<string, [number, number]> = {
  sydney:            [21, 6],
  tokyo:             [23, 8],
  london:            [7, 16],
  new_york:          [12, 21],
  us_london_overlap: [12, 16],
};

function isSessionOpen(open: number, close: number, utcHour: number): boolean {
  if (open < close) return utcHour >= open && utcHour < close;
  return utcHour >= open || utcHour < close; // crosses midnight
}

function isInActiveSessions(sessions: string[] | null | undefined): boolean {
  if (!sessions || sessions.length === 0) return true; // no restriction = always trade
  const now = new Date();
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  return sessions.some(s => {
    const hours = SESSION_UTC_HOURS[s.toLowerCase()];
    return hours ? isSessionOpen(hours[0], hours[1], utcHour) : false;
  });
}

/** FX is closed from Friday 21:00 UTC to Sunday 21:00 UTC. */
export function isFxMarketOpen(d = new Date()): boolean {
  const day = d.getUTCDay(), h = d.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && h >= 21) return false;
  if (day === 0 && h < 21) return false;
  return true;
}

// ─── Trailing Stop ────────────────────────────────────────────────────────────
// Once price has moved TRAIL_TRIGGER of the way to target, ratchet the stop to
// trail price by the user's configured distance — never loosening it.

const TRAIL_TRIGGER = 0.40;

function trailedStop(pos: Position, side: "BUY" | "SELL", price: number, trailPips: number): number | null {
  if (!pos.takeProfit) return null;
  const tpDistance = Math.abs(pos.takeProfit - pos.entryPrice);
  const progress = side === "BUY" ? price - pos.entryPrice : pos.entryPrice - price;
  if (tpDistance === 0 || progress < tpDistance * TRAIL_TRIGGER) return null;

  const trail = trailPips * getSymbolConfig(pos.symbol).pipSize;
  const candidate = side === "BUY" ? price - trail : price + trail;
  const improves = pos.stopLoss == null || (side === "BUY" ? candidate > pos.stopLoss : candidate < pos.stopLoss);
  return improves ? parseFloat(candidate.toFixed(priceDecimals(pos.symbol))) : null;
}

// ─── Open positions: mark to market, reconcile broker, trail, SL/TP ──────────

async function notifyClosed(pos: Position, reason: string, price: number, profit: number) {
  const emoji = reason === "Take Profit" ? "✅" : reason === "Stop Loss" ? "🛑" : "🔁";
  await storage.createNotification({
    userId: pos.userId, type: "trade",
    title: `${emoji} Position Closed — ${reason}`,
    message: `${pos.symbol} ${normalizeSide(pos.type)} closed at ${price}. P&L: ${profit >= 0 ? "+" : ""}$${profit.toFixed(2)}`,
    read: false,
  });
  await sendPushToUser(pos.userId, {
    title: `${emoji} ${pos.symbol} Closed — ${reason}`,
    body: `${normalizeSide(pos.type)} closed @ ${price} · P&L: ${profit >= 0 ? "+" : ""}$${profit.toFixed(2)}`,
  }).catch(() => {});
}

async function checkOpenPositions(prices: Record<string, LivePrice>) {
  const allUsers = await storage.getAllUsers();

  for (const user of allUsers) {
    const openPositions = await storage.getOpenPositions(user.id);
    if (openPositions.length === 0) continue;
    const settings = await storage.getUserSettings(user.id);
    const limits = await getRiskLimits(user.id);

    for (const pos of openPositions) {
      try {
        const side = normalizeSide(pos.type);

        // Broker-held trades: the broker's own SL/TP orders are authoritative.
        // If the broker already closed it, record the broker's real fill price.
        if (pos.brokerTradeId?.startsWith("oanda:") && settings?.brokerApiKey && settings.brokerAccountId) {
          const state = await getOandaTradeState(settings.brokerApiKey, settings.brokerAccountId, settings.brokerServer, pos.brokerTradeId);
          if (state?.state === "CLOSED") {
            const exit = state.closePrice ?? pos.currentPrice ?? pos.entryPrice;
            const closed = await closeTrade({ ...pos, brokerTradeId: null }, { price: exit, reason: "broker" });
            if (closed) await notifyClosed(pos, "Closed at broker", exit, closed.profit);
            continue;
          }
        }

        const quote = prices[pos.symbol];
        // Never trail or close on fallback or stale quotes
        if (!isTradablePrice(quote)) continue;
        const price = side === "BUY" ? quote.bid : quote.ask;

        let stopLoss = pos.stopLoss;
        // Trailing only for locally-managed positions; broker stops aren't modified here
        if (limits.trailingStopEnabled && !pos.brokerTradeId) {
          const newSL = trailedStop(pos, side, price, limits.trailingStopPips ?? 20);
          if (newSL != null) stopLoss = newSL;
        }
        await storage.updatePosition(pos.id, {
          stopLoss, currentPrice: price,
          profit: calcProfit(side, pos.entryPrice, price, pos.symbol, pos.size),
        });

        if (pos.brokerTradeId) continue; // broker enforces its own SL/TP

        const tpHit = pos.takeProfit != null && (side === "BUY" ? price >= pos.takeProfit : price <= pos.takeProfit);
        const slHit = stopLoss != null && (side === "BUY" ? price <= stopLoss : price >= stopLoss);
        if (tpHit || slHit) {
          const closed = await closeTrade({ ...pos, stopLoss }, { price, reason: tpHit ? "take_profit" : "stop_loss" });
          if (closed) await notifyClosed(pos, tpHit ? "Take Profit" : "Stop Loss", price, closed.profit);
        }
      } catch (e: any) {
        console.warn(`[AutoTrade] Position ${pos.id} check failed: ${e.message}`);
      }
    }
  }
}

// ─── Main auto-trade pass: generate & execute signals ─────────────────────────

async function pushSignalNotification(userId: string) {
  try {
    const sig = await storage.getPendingSignal(userId);
    if (!sig) return;
    const dir = sig.action.includes("BUY") ? "📈 BUY" : "📉 SELL";
    const conf = sig.confidence ? ` · ${sig.confidence}% model confidence` : "";
    await sendPushToUser(userId, {
      title: `${dir} Signal — ${sig.symbol}${conf}`,
      body: `Entry ~${sig.entryPrice} | SL ${sig.stopLoss ?? "—"} | TP ${sig.takeProfit ?? "—"}\nTap to review in TradeAI.`,
    });
  } catch (e: any) {
    console.warn("[Signal Push] Failed:", e.message);
  }
}

async function runAutoTradePass() {
  if (running) return;
  running = true;
  try {
    const prices = await fetchLivePrices().catch(() => ({} as Record<string, LivePrice>));

    await checkOpenPositions(prices);

    if (!isFxMarketOpen()) return;

    const allUsers = await storage.getAllUsers();
    for (const user of allUsers) {
      try {
        if (user.isBanned) continue;
        const settings = await storage.getUserSettings(user.id);
        if (!settings?.autoTrade) continue;

        // ── Session / off-hours check ───────────────────────────────────────
        const offHoursBehavior = settings.offHoursBehavior || "pause";
        const offHoursRiskReduction = settings.offHoursRiskReduction ?? 50;
        const inSession = isInActiveSessions(settings.activeSessions);

        if (!inSession) {
          if (offHoursBehavior === "pause") continue;
          if (offHoursBehavior === "alert_only") {
            if (!(await storage.getPendingSignal(user.id))) {
              await generateAiSignal(user.id).catch(() => {});
              await pushSignalNotification(user.id);
            }
            continue;
          }
          // ai_autonomous: proceed with reduced risk below
        }

        const strategy = await storage.getActiveStrategy(user.id);
        if (!strategy) continue;

        const openPositions = await storage.getOpenPositions(user.id);
        if (openPositions.length >= (strategy.maxPositions || 3)) continue;

        const pending = await storage.getPendingSignal(user.id);
        if (!pending) {
          // At most one new signal per user every 15 minutes — each one costs AI and data calls
          const [last] = await storage.getRecentSignals(user.id, 1);
          if (last?.createdAt && Date.now() - new Date(last.createdAt).getTime() < SIGNAL_INTERVAL_MS) continue;
          const created = await generateAiSignal(user.id).catch((e: any) => { console.warn(`[AutoTrade] Signal error: ${e.message}`); return null; });
          if (created) await pushSignalNotification(user.id);
          continue;
        }

        // Signals older than 15 minutes are stale — the market has moved on
        if (pending.createdAt && Date.now() - new Date(pending.createdAt).getTime() > 15 * 60_000) {
          await storage.updateSignalStatus(pending.id, "expired");
          continue;
        }

        // TDCI gate: generated signals only auto-execute where calibration has
        // shown an out-of-sample edge. TradingView alerts are the user's own system.
        if (pending.source !== "tradingview") {
          const blocked = await tdciGate(pending, settings.tdciMinScore ?? 60);
          if (blocked) {
            await storage.updateSignalStatus(pending.id, "dismissed");
            console.log(`[AutoTrade] ${pending.symbol} for user#${user.id} not auto-traded: ${blocked}`);
            continue; // left for manual review; no notification spam every pass
          }
        }

        // Size from the real account balance when the broker reports it
        const accountSize = Number(settings.brokerBalance) || strategy.accountSize || 10000;
        let riskPct = Number(strategy.riskPercent) || 1;
        if (!inSession && offHoursBehavior === "ai_autonomous") {
          riskPct = Math.max(0.01, riskPct * (1 - offHoursRiskReduction / 100));
        }
        const ref = pending.entryPrice ?? prices[pending.symbol]?.bid ?? 0;
        if (!pending.stopLoss || !ref) {
          await storage.updateSignalStatus(pending.id, "dismissed");
          continue; // never auto-trade without a stop
        }
        const lots = sizeForRisk(pending.symbol, accountSize, riskPct, Math.abs(ref - pending.stopLoss));

        const result = await openTrade({
          userId: user.id, symbol: pending.symbol, side: normalizeSide(pending.action), lots,
          stopLoss: pending.stopLoss, takeProfit: pending.takeProfit, aiSignal: true, signalId: pending.id,
        });

        if (!result.ok) {
          await storage.updateSignalStatus(pending.id, "dismissed");
          await storage.createNotification({
            userId: user.id, type: "trade",
            title: `⛔ Auto-Trade blocked: ${pending.action} ${pending.symbol}`,
            message: result.reason, read: false,
          });
          console.log(`[AutoTrade] Blocked ${pending.symbol} for user#${user.id}: ${result.reason}`);
          continue;
        }

        await storage.updateSignalStatus(pending.id, "executed");
        const p = result.position;
        await storage.createNotification({
          userId: user.id, type: "trade",
          title: `⚡ Auto-Trade: ${pending.action} ${pending.symbol}`,
          message: `Filled ${p.size} lots at ${p.entryPrice} (${result.brokerNote}). SL ${p.stopLoss ?? "none"} | TP ${p.takeProfit ?? "none"}.`,
          read: false,
        });
        await sendPushToUser(user.id, {
          title: `${pending.action.includes("BUY") ? "📈" : "📉"} EXECUTED — ${pending.action} ${pending.symbol}`,
          body: `${p.size} lots @ ${p.entryPrice} · SL ${p.stopLoss ?? "—"} · TP ${p.takeProfit ?? "—"} · ${result.brokerNote}`,
        }).catch(() => {});
      } catch (e: any) {
        console.warn(`[AutoTrade] Error for user ${user.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    // A database or network outage must skip this pass, not crash the server
    console.warn(`[AutoTrade] Pass skipped: ${e.message}`);
  } finally {
    running = false;
  }
}

export function startAutoTradeWorker() {
  console.log("[AutoTrade] Worker started — checking every 60s");
  setTimeout(runAutoTradePass, 5_000);
  setInterval(runAutoTradePass, 60_000);
}

// ─── Price Alert Watcher ───────────────────────────────────────────────────────

export async function checkPriceAlerts() {
  try {
    const alerts = await storage.getUntriggeredAlerts();
    if (alerts.length === 0) return;

    const prices = await fetchLivePrices().catch(() => ({} as Record<string, LivePrice>));

    for (const alert of alerts) {
      const quote = prices[alert.symbol];
      if (!isTradablePrice(quote)) continue;
      const currentPrice = quote.bid;

      const triggered =
        (alert.direction === "above" && currentPrice >= alert.targetPrice) ||
        (alert.direction === "below" && currentPrice <= alert.targetPrice);

      if (triggered) {
        await storage.triggerAlert(alert.id);
        await storage.createNotification({
          userId: alert.userId,
          type: "alert",
          title: `🔔 Price Alert: ${alert.symbol}`,
          message: `${alert.symbol} hit ${currentPrice} — your alert of ${alert.targetPrice} (${alert.direction}) was reached. ${alert.label || ""}`,
          read: false,
        });
        await sendPushToUser(alert.userId, { title: `🔔 ${alert.symbol} ${alert.direction} ${alert.targetPrice}`, body: `Now ${currentPrice}` }).catch(() => {});
      }
    }
  } catch (e: any) {
    console.warn("[Alert] Check failed:", e.message);
  }
}

export function startAlertWatcher() {
  console.log("[AlertWatcher] Watching price alerts every 30s");
  setInterval(checkPriceAlerts, 30_000);
}

// ─── Signal Outcome Watcher ────────────────────────────────────────────────────
// Tracks every AI signal (taken or not) against live prices so the model's real
// hit rate can be measured. Outcomes credit only the lessons that signal used.

async function checkSignalOutcomes() {
  try {
    const activeSignals = await storage.getActiveSignalsAllUsers();
    if (activeSignals.length === 0) return;

    const prices = await fetchLivePrices().catch(() => ({} as Record<string, LivePrice>));
    const now = Date.now();

    for (const sig of activeSignals) {
      const quote = prices[sig.symbol];
      if (!isTradablePrice(quote) || !sig.entryPrice || !sig.stopLoss || !sig.takeProfit) continue;

      const isLong = sig.action.includes("BUY");
      const currentPrice = isLong ? quote.bid : quote.ask;

      let outcome: string | null = null;
      let outcomePrice = currentPrice;
      if (isLong) {
        if (currentPrice >= sig.takeProfit) { outcome = "TP_HIT"; outcomePrice = sig.takeProfit; }
        else if (currentPrice <= sig.stopLoss) { outcome = "SL_HIT"; outcomePrice = sig.stopLoss; }
      } else {
        if (currentPrice <= sig.takeProfit) { outcome = "TP_HIT"; outcomePrice = sig.takeProfit; }
        else if (currentPrice >= sig.stopLoss) { outcome = "SL_HIT"; outcomePrice = sig.stopLoss; }
      }

      const ageHours = (now - new Date(sig.createdAt!).getTime()) / 3_600_000;
      if (!outcome && ageHours > 48) outcome = "EXPIRED";
      if (!outcome) continue;

      await storage.resolveSignalOutcome(sig.id, outcome, outcomePrice);

      if (outcome !== "EXPIRED" && sig.knowledgeIds?.length) {
        await recordLessonOutcome(sig.knowledgeIds, outcome === "TP_HIT").catch(e =>
          console.warn("[SignalWatcher] Lesson update failed:", e.message));
      }

      await storage.createNotification({
        userId: sig.userId,
        type: "signal_outcome",
        title: `${outcome === "TP_HIT" ? "✅" : outcome === "SL_HIT" ? "❌" : "⏰"} Signal ${outcome.replace("_", " ")}: ${sig.symbol}`,
        message: `${sig.action} ${sig.symbol} signal ${outcome === "TP_HIT" ? "would have hit take profit" : outcome === "SL_HIT" ? "would have hit stop loss" : "expired"} at ${outcomePrice}.`,
        read: false,
      });
    }
  } catch (e: any) {
    console.warn("[SignalWatcher] Check failed:", e.message);
  }
}

export function startSignalOutcomeWatcher() {
  console.log("[SignalWatcher] Signal outcome tracker started — checking every 60s");
  setInterval(checkSignalOutcomes, 60_000);
}
