import { storage } from "./storage";
import { generateAiSignal } from "./ai-engine";
import { fetchLivePrices } from "./marketdata";
import { placeOandaOrder, closeOandaTrade } from "./brokers/oanda";
import { sendPushToUser } from "./push";
import { calcProfit as sharedCalcProfit, getSymbolConfig } from "./pips";

let running = false;

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
  const utcHour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  return sessions.some(s => {
    const hours = SESSION_UTC_HOURS[s.toLowerCase()];
    return hours ? isSessionOpen(hours[0], hours[1], utcHour) : false;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcProfit(type: string, entryPrice: number, exitPrice: number, symbol: string, lots: number) {
  return sharedCalcProfit(type, entryPrice, exitPrice, symbol, lots);
}

// ─── Smart Trailing Stop ──────────────────────────────────────────────────────
// Once price moves TRAIL_TRIGGER_PCT of the TP distance in our favour,
// ratchet the SL to lock in at least TRAIL_LOCK_PCT of that distance.

const TRAIL_TRIGGER_PCT = 0.40;
const TRAIL_LOCK_PCT    = 0.15;

async function applyTrailingStop(
  position: { id: string; type: string; symbol: string; entryPrice: number; stopLoss: number | null; takeProfit: number | null },
  currentPrice: number
) {
  const { type, entryPrice, stopLoss, takeProfit } = position;
  if (!takeProfit) return null;

  const tpDistance = Math.abs(takeProfit - entryPrice);
  if (tpDistance === 0) return null;

  const currentProfit = type === "BUY"
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;

  if (currentProfit < tpDistance * TRAIL_TRIGGER_PCT) return null;

  const lockDistance = tpDistance * TRAIL_LOCK_PCT;
  const newSL = type === "BUY"
    ? entryPrice + lockDistance
    : entryPrice - lockDistance;

  const trailedSL = type === "BUY"
    ? currentPrice - lockDistance
    : currentPrice + lockDistance;

  const bestNewSL = type === "BUY"
    ? Math.max(newSL, trailedSL)
    : Math.min(newSL, trailedSL);

  const shouldUpdate = stopLoss == null
    || (type === "BUY"  && bestNewSL > stopLoss)
    || (type === "SELL" && bestNewSL < stopLoss);

  if (!shouldUpdate) return null;
  return parseFloat(bestNewSL.toFixed(5));
}

// ─── Check open positions: trail SL, then close on TP/SL hit ─────────────────

async function checkOpenPositions(prices: Record<string, { bid: number; ask: number }>) {
  const allUsers = await storage.getAllUsers();

  for (const user of allUsers) {
    const openPositions = await storage.getOpenPositions(user.id);
    if (openPositions.length === 0) continue;

    const settings = await storage.getUserSettings(user.id);

    for (const pos of openPositions) {
      const price = prices[pos.symbol];
      if (!price) continue;

      const currentPrice = pos.type === "BUY" ? price.bid : price.ask;
      const lots = pos.size || 0.1;

      // ── 1. Apply trailing stop ─────────────────────────────────────────────
      const newSL = await applyTrailingStop(
        { id: pos.id, type: pos.type, symbol: pos.symbol, entryPrice: pos.entryPrice, stopLoss: pos.stopLoss ?? null, takeProfit: pos.takeProfit ?? null },
        currentPrice
      );
      const floatingProfit = calcProfit(pos.type, pos.entryPrice, currentPrice, pos.symbol, lots);
      if (newSL !== null) {
        await storage.updatePosition(pos.id, { stopLoss: newSL, currentPrice, profit: floatingProfit });
        console.log(`[AutoTrade] Trailing SL → ${newSL} for ${pos.symbol} (${pos.type})`);
      } else {
        await storage.updatePosition(pos.id, { currentPrice, profit: floatingProfit });
      }

      const sl = newSL ?? pos.stopLoss;
      const tp = pos.takeProfit;

      // ── 2. Check TP/SL ────────────────────────────────────────────────────
      const tpHit = tp != null && (
        (pos.type === "BUY"  && currentPrice >= tp) ||
        (pos.type === "SELL" && currentPrice <= tp)
      );
      const slHit = sl != null && (
        (pos.type === "BUY"  && currentPrice <= sl) ||
        (pos.type === "SELL" && currentPrice >= sl)
      );

      if (tpHit || slHit) {
        const profit = calcProfit(pos.type, pos.entryPrice, currentPrice, pos.symbol, lots);

        // ── Close on real broker if applicable ────────────────────────────
        if (settings?.brokerType === "oanda" && settings.brokerApiKey && settings.brokerAccountId && (pos as any).brokerTradeId) {
          closeOandaTrade(settings.brokerApiKey, settings.brokerAccountId, (pos as any).brokerTradeId)
            .catch(e => console.warn(`[OANDA] Failed to close trade on broker: ${e.message}`));
        }

        await storage.closePosition(pos.id, currentPrice, profit);

        const reason = tpHit ? "Take Profit" : "Stop Loss";
        const emoji  = tpHit ? "✅" : (newSL !== null ? "🔒" : "🛑");

        await storage.createNotification({
          userId: user.id,
          type: "trade",
          title: `${emoji} Position Closed — ${reason}`,
          message: `${pos.symbol} ${pos.type} closed at ${currentPrice.toFixed(5)}. P&L: ${profit >= 0 ? "+" : ""}$${profit}`,
          read: false,
        });

        await sendPushToUser(user.id, {
          title: `${emoji} ${pos.symbol} Closed — ${reason}`,
          body: `${pos.type} closed @ ${currentPrice.toFixed(5)} · P&L: ${profit >= 0 ? "+" : ""}$${profit.toFixed(2)}`,
        }).catch(() => {});

        console.log(`[AutoTrade] ${reason} → closed ${pos.symbol} ${pos.type} @ ${currentPrice} | P&L: $${profit} | user#${user.id}`);
      }
    }
  }
}

// ─── Main auto-trade pass: generate & execute signals ─────────────────────────

async function pushSignalNotification(userId: string) {
  try {
    const sig = await storage.getPendingSignal(userId);
    if (!sig) return;
    const dir     = sig.action.includes("BUY") ? "📈 BUY" : "📉 SELL";
    const conf    = sig.confidence ? ` · ${sig.confidence}% confidence` : "";
    const sl      = sig.stopLoss   ? ` | SL ${Number(sig.stopLoss).toFixed(5)}` : "";
    const tp      = sig.takeProfit ? ` | TP ${Number(sig.takeProfit).toFixed(5)}` : "";
    const snippet = sig.reasoning  ? `\n${sig.reasoning.substring(0, 90)}…` : "";
    await sendPushToUser(userId, {
      title: `${dir} Signal — ${sig.symbol}${conf}`,
      body:  `Entry ${Number(sig.entryPrice).toFixed(5)}${sl}${tp}${snippet}\nTap to review in TradeAI.`,
    });
  } catch (e: any) {
    console.warn("[Signal Push] Failed:", e.message);
  }
}

async function runAutoTradePass() {
  if (running) return;
  running = true;
  try {
    const prices = await fetchLivePrices().catch(() => ({})) as Record<string, { bid: number; ask: number }>;

    await checkOpenPositions(prices);

    const allUsers = await storage.getAllUsers();
    for (const user of allUsers) {
      try {
        const settings = await storage.getUserSettings(user.id);
        if (!settings?.autoTrade) continue;

        // ── Session / off-hours check ───────────────────────────────────────
        const activeSessions = (settings as any).activeSessions as string[] | null;
        const offHoursBehavior = (settings as any).offHoursBehavior as string || "pause";
        const offHoursRiskReduction = (settings as any).offHoursRiskReduction as number ?? 50;
        const inSession = isInActiveSessions(activeSessions);

        if (!inSession) {
          if (offHoursBehavior === "pause") {
            console.log(`[AutoTrade] Off-hours — paused for user#${user.id}`);
            continue;
          }
          if (offHoursBehavior === "alert_only") {
            await generateAiSignal(user.id).catch(() => {});
            console.log(`[AutoTrade] Off-hours alert-only signal generated for user#${user.id}`);
            await pushSignalNotification(user.id);
            continue;
          }
          // ai_autonomous: proceed but reduce risk below
        }

        const strategy = await storage.getActiveStrategy(user.id);
        if (!strategy) continue;

        const openPositions = await storage.getOpenPositions(user.id);
        if (openPositions.length >= (strategy.maxPositions || 3)) continue;

        const pending = await storage.getPendingSignal(user.id);
        if (pending) {
          await storage.updateSignalStatus(pending.id, "executed");
          const entryPrice = pending.entryPrice || prices[pending.symbol]?.bid || 1;
          const accountSize = (strategy as any).accountSize || 10000;
          let riskPct = parseFloat(String(strategy.riskPercent || "2")) || 2;
          // Apply off-hours risk reduction for AI Autonomous mode
          if (!inSession && offHoursBehavior === "ai_autonomous") {
            riskPct = riskPct * (1 - offHoursRiskReduction / 100);
            riskPct = Math.max(0.01, riskPct);
          }
          const slPips = pending.stopLoss
            ? Math.round(Math.abs(entryPrice - pending.stopLoss) / getSymbolConfig(pending.symbol).pipSize)
            : getSymbolConfig(pending.symbol).minSL * 2;
          const riskUSD = accountSize * (riskPct / 100);
          const lots = parseFloat(Math.max(0.01, Math.min(10, riskUSD / Math.max(1, slPips * getSymbolConfig(pending.symbol).pipValue))).toFixed(2));
          const tradeType = pending.action.includes("BUY") ? "BUY" : "SELL";

          // ── Execute on real broker if OANDA ────────────────────────────────
          let brokerTradeId: string | null = null;
          if (settings?.brokerType === "oanda" && settings.brokerApiKey && settings.brokerAccountId) {
            brokerTradeId = await placeOandaOrder(
              settings.brokerApiKey,
              settings.brokerAccountId,
              pending.symbol,
              tradeType,
              lots,
              pending.stopLoss,
              pending.takeProfit
            ).catch(e => { console.warn(`[OANDA] Order failed: ${e.message}`); return null; });
          }

          await storage.createPosition({
            userId: user.id,
            symbol: pending.symbol,
            type: tradeType,
            size: lots,
            entryPrice,
            currentPrice: entryPrice,
            stopLoss: pending.stopLoss || null,
            takeProfit: pending.takeProfit || null,
            profit: 0,
            status: "open",
            aiSignal: true,
            brokerTradeId,
          } as any);

          const brokerNote = brokerTradeId
            ? ` Sent to OANDA (Trade #${brokerTradeId}).`
            : settings?.brokerType === "oanda" ? " (OANDA order failed — DB only)." : "";

          await storage.createNotification({
            userId: user.id,
            type: "trade",
            title: `⚡ Auto-Trade: ${pending.action} ${pending.symbol}`,
            message: `Entered at ${entryPrice}. SL: ${pending.stopLoss ?? "none"} | TP: ${pending.takeProfit ?? "none"}.${brokerNote} ${pending.reasoning.substring(0, 60)}…`,
            read: false,
          });

          // ── Live push notification with full trade detail ──────────────────
          const dir       = pending.action.includes("BUY") ? "📈" : "📉";
          const confLabel = pending.confidence ? ` · ${pending.confidence}% confidence` : "";
          const slLabel   = pending.stopLoss   ? ` | SL ${Number(pending.stopLoss).toFixed(5)}` : "";
          const tpLabel   = pending.takeProfit ? ` | TP ${Number(pending.takeProfit).toFixed(5)}` : "";
          const brokerTag = brokerTradeId ? " ✓ OANDA" : settings?.brokerType === "paper" ? " (Paper)" : "";
          const snippet   = pending.reasoning ? `\n${pending.reasoning.substring(0, 90)}…` : "";
          await sendPushToUser(user.id, {
            title: `${dir} EXECUTED — ${pending.action} ${pending.symbol}${confLabel}`,
            body:  `Entry ${Number(entryPrice).toFixed(5)}${slLabel}${tpLabel} · ${lots} lot${lots !== 1 ? "s" : ""}${brokerTag}${snippet}`,
          }).catch(() => {});

          console.log(`[AutoTrade] Opened ${pending.action} ${pending.symbol} @ ${entryPrice} for user#${user.id}${brokerTradeId ? " [OANDA confirmed]" : ""}`);
        } else {
          await generateAiSignal(user.id);
          console.log(`[AutoTrade] New signal generated for user#${user.id}`);
          await pushSignalNotification(user.id);
        }
      } catch (e: any) {
        console.warn(`[AutoTrade] Error for user ${user.id}: ${e.message}`);
      }
    }
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

    const prices = await fetchLivePrices().catch(() => ({})) as Record<string, { bid: number }>;

    for (const alert of alerts) {
      const currentPrice = prices[alert.symbol]?.bid;
      if (!currentPrice) continue;

      const triggered =
        (alert.direction === "above" && currentPrice >= alert.targetPrice) ||
        (alert.direction === "below" && currentPrice <= alert.targetPrice);

      if (triggered) {
        await storage.triggerAlert(alert.id);
        await storage.createNotification({
          userId: alert.userId,
          type: "alert",
          title: `🔔 Price Alert: ${alert.symbol}`,
          message: `${alert.symbol} hit ${currentPrice.toFixed(5)} — your alert of ${alert.targetPrice} (${alert.direction}) was reached. ${alert.label || ""}`,
          read: false,
        });
        console.log(`[Alert] ${alert.symbol} triggered @ ${currentPrice} for user ${alert.userId}`);
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
// Monitors active AI signals. Marks TP_HIT / SL_HIT / EXPIRED when resolved.
// Feeds outcomes back into the AI learning system.

async function checkSignalOutcomes() {
  try {
    const activeSignals = await storage.getActiveSignalsAllUsers();
    if (activeSignals.length === 0) return;

    const prices = await fetchLivePrices().catch(() => ({})) as Record<string, { bid: number; ask: number }>;
    const now = Date.now();

    for (const sig of activeSignals) {
      const price = prices[sig.symbol];
      if (!price || !sig.entryPrice || !sig.stopLoss || !sig.takeProfit) continue;

      const isLong = sig.action === "BUY" || sig.action === "STRONG BUY";
      const currentPrice = isLong ? price.bid : price.ask;

      // Determine outcome
      let outcome: string | null = null;
      let outcomePrice = currentPrice;

      if (isLong) {
        if (currentPrice >= sig.takeProfit) { outcome = "TP_HIT"; outcomePrice = sig.takeProfit; }
        else if (currentPrice <= sig.stopLoss) { outcome = "SL_HIT"; outcomePrice = sig.stopLoss; }
      } else {
        if (currentPrice <= sig.takeProfit) { outcome = "TP_HIT"; outcomePrice = sig.takeProfit; }
        else if (currentPrice >= sig.stopLoss) { outcome = "SL_HIT"; outcomePrice = sig.stopLoss; }
      }

      // Expire signals older than 48h with no resolution
      const ageHours = (now - new Date(sig.createdAt!).getTime()) / 3_600_000;
      if (!outcome && ageHours > 48) outcome = "EXPIRED";

      if (outcome) {
        await storage.resolveSignalOutcome(sig.id, outcome, outcomePrice);

        // Notify the user
        await storage.createNotification({
          userId: sig.userId,
          type: "signal_outcome",
          title: `${outcome === "TP_HIT" ? "✅" : outcome === "SL_HIT" ? "❌" : "⏰"} Signal ${outcome.replace("_", " ")}: ${sig.symbol}`,
          message: `${sig.action} ${sig.symbol} signal (${sig.confidence}% confidence) ${outcome === "TP_HIT" ? "hit take profit" : outcome === "SL_HIT" ? "hit stop loss" : "expired"} at ${outcomePrice}.`,
          read: false,
        });

        // Feed outcome into AI knowledge for self-improvement
        if (outcome !== "EXPIRED") {
          try {
            const { db: kdb } = await import("./db");
            const { aiKnowledge } = await import("@shared/schema");
            const { eq } = await import("drizzle-orm");
            const isWin = outcome === "TP_HIT";

            // Reinforce: update confidence of existing relevant knowledge
            const lessons = await kdb.select().from(aiKnowledge)
              .where(eq(aiKnowledge.isActive, true));
            for (const lesson of lessons) {
              if (!lesson.pairs || lesson.pairs.length === 0 || lesson.pairs.includes(sig.symbol)) {
                const newSuccess = lesson.successCount + (isWin ? 1 : 0);
                const newFailure = lesson.failureCount + (isWin ? 0 : 1);
                const total = newSuccess + newFailure;
                const newConf = Math.round(Math.max(40, Math.min(96, (newSuccess / total) * 100)));
                await kdb.update(aiKnowledge).set({
                  successCount: newSuccess,
                  failureCount: newFailure,
                  confidence: newConf,
                  updatedAt: new Date(),
                }).where(eq(aiKnowledge.id, lesson.id));
              }
            }
          } catch (e: any) {
            console.warn("[SignalWatcher] Knowledge update failed:", e.message);
          }
        }

        const resultEmoji = outcome === "TP_HIT" ? "✅" : outcome === "SL_HIT" ? "❌" : "⏰";
        console.log(`[SignalWatcher] ${resultEmoji} ${sig.symbol} ${sig.action} → ${outcome} @ ${outcomePrice}`);
      }
    }
  } catch (e: any) {
    console.warn("[SignalWatcher] Check failed:", e.message);
  }
}

export function startSignalOutcomeWatcher() {
  console.log("[SignalWatcher] Signal outcome tracker started — checking every 5 min");
  setInterval(checkSignalOutcomes, 5 * 60_000);
}
