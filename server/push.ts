import webpush from "web-push";
import { db } from "./db";
import { pushSubscriptions, positions, userSettings } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || "mailto:admin@tradeai.app",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
}

export async function saveSubscription(userId: string, sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  await db.insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function getUserSubscriptions(userId: string) {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

async function deliverToEndpoint(sub: { endpoint: string; p256dh: string; auth: string }, notification: string) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      notification,
      { TTL: 60 * 60 }
    );
    return true;
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
    }
    return false;
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const subs = await getUserSubscriptions(userId);
  if (subs.length === 0) return 0;

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/favicon.png",
    badge: payload.badge || "/favicon.png",
    tag: payload.tag || "tradeai",
    data: payload.data || {},
  });

  const results = await Promise.allSettled(subs.map(sub => deliverToEndpoint(sub, notification)));
  const sent = results.filter(r => r.status === "fulfilled" && (r as any).value === true).length;
  if (sent > 0) console.log(`[Push] Sent "${payload.title}" → ${sent}/${subs.length} device(s) for user ${userId}`);
  return sent;
}

// ─── 10-minute digest scheduler ───────────────────────────────────────────────

async function runDigest() {
  try {
    const allSubs = await db.select().from(pushSubscriptions);
    if (allSubs.length === 0) return;

    const uniqueUsers = Array.from(new Set(allSubs.map(s => s.userId)));
    const windowStart = new Date(Date.now() - 10 * 60 * 1000);

    for (const userId of uniqueUsers) {
      // Open positions (unrealized P&L)
      const openPos = await db.select({
        profit: positions.profit,
        symbol: positions.symbol,
        type: positions.type,
        entryPrice: positions.entryPrice,
        takeProfit: positions.takeProfit,
        stopLoss: positions.stopLoss,
        size: positions.size,
      }).from(positions).where(and(eq(positions.userId, userId), eq(positions.status, "open")));

      // Positions closed in the last 10 min
      const recentClosed = await db.select({
        profit: positions.profit,
        symbol: positions.symbol,
        type: positions.type,
      }).from(positions).where(and(
        eq(positions.userId, userId),
        eq(positions.status, "closed"),
        gte(positions.closedAt, windowStart)
      ));

      // Skip entirely only if no activity whatsoever
      if (openPos.length === 0 && recentClosed.length === 0) continue;

      // Account balance
      const [settings] = await db.select({ balance: userSettings.brokerBalance })
        .from(userSettings).where(eq(userSettings.userId, userId)).limit(1).catch(() => []);
      const balance = settings?.balance ?? 10000;

      const unrealizedPL = openPos.reduce((s, p) => s + (p.profit ?? 0), 0);
      const realizedPL   = recentClosed.reduce((s, p) => s + (p.profit ?? 0), 0);
      const equity       = balance + unrealizedPL;

      const plSign   = unrealizedPL >= 0 ? "+" : "";
      const netEmoji = unrealizedPL >= 0 ? "📈" : "📉";
      const symbols  = Array.from(new Set(openPos.map(p => p.symbol))).slice(0, 4).join(" · ");

      // Simple projection: at this trajectory for 24h
      const projectedDaily = unrealizedPL * (24 * 6); // every 10 min
      const projSign = projectedDaily >= 0 ? "+" : "";

      // Closed in window
      const closedLine = recentClosed.length > 0
        ? ` | Closed ${recentClosed.length} trade${recentClosed.length > 1 ? "s" : ""} (${realizedPL >= 0 ? "+" : ""}$${Math.abs(realizedPL).toFixed(0)})`
        : "";

      const body = openPos.length > 0
        ? `${openPos.length} open: ${symbols} | Unrealized ${plSign}$${Math.abs(unrealizedPL).toFixed(2)} | Equity $${equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}${closedLine}`
        : `${recentClosed.length} trade${recentClosed.length > 1 ? "s" : ""} closed | Net $${realizedPL >= 0 ? "+" : ""}${realizedPL.toFixed(2)} | Balance $${balance.toLocaleString()}`;

      await sendPushToUser(userId, {
        title: `${netEmoji} TradeAI 10-min Update`,
        body,
        tag: "digest",
        data: { url: "/" },
      });
    }
  } catch (e: any) {
    console.error("[Push] Digest error:", e.message);
  }
}

export function startPushDigest() {
  const INTERVAL_MS = 10 * 60 * 1000;
  console.log("[Push] 10-minute trade digest scheduler started");
  // Fire once shortly after startup so user sees it quickly
  setTimeout(runDigest, 30_000);
  setInterval(runDigest, INTERVAL_MS);
}
