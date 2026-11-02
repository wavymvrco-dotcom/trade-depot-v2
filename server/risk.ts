import { db } from "./db";
import { riskLimits, positions, userSettings } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";

async function getUserStartingBalance(userId: string): Promise<number> {
  const [settings] = await db.select({ brokerBalance: userSettings.brokerBalance })
    .from(userSettings).where(eq(userSettings.userId, userId));
  return settings?.brokerBalance ? parseFloat(String(settings.brokerBalance)) : 10000;
}

// ─── Get or create risk limits for user ───────────────────────────────────────
export async function getRiskLimits(userId: string) {
  let [limits] = await db.select().from(riskLimits).where(eq(riskLimits.userId, userId));
  if (!limits) {
    [limits] = await db.insert(riskLimits).values({ userId }).returning();
  }
  return limits;
}

export async function updateRiskLimits(userId: string, updates: Partial<typeof riskLimits.$inferInsert>) {
  const existing = await getRiskLimits(userId);
  const [updated] = await db.update(riskLimits)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(riskLimits.userId, userId))
    .returning();
  return updated ?? existing;
}

// ─── Compute real-time risk dashboard data ────────────────────────────────────
export async function getRiskDashboard(userId: string) {
  const limits = await getRiskLimits(userId);
  const STARTING_BALANCE = await getUserStartingBalance(userId);

  // Today's P&L from closed positions
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const closedToday = await db.select({
    profit: positions.profit,
  }).from(positions).where(
    and(
      eq(positions.userId, userId),
      eq(positions.status, "closed"),
      gte(positions.closedAt, todayStart),
    )
  );

  const dailyPL = closedToday.reduce((s, p) => s + (p.profit || 0), 0);

  // All-time closed P&L for drawdown
  const allClosed = await db.select({ profit: positions.profit })
    .from(positions)
    .where(and(eq(positions.userId, userId), eq(positions.status, "closed")));

  let balance = STARTING_BALANCE;
  let peak = STARTING_BALANCE;
  let maxDDValue = 0;
  for (const p of allClosed) {
    balance += p.profit || 0;
    if (balance > peak) peak = balance;
    const dd = peak - balance;
    if (dd > maxDDValue) maxDDValue = dd;
  }
  const currentDrawdown = peak - balance;

  // Open positions count & exposure
  const openPos = await db.select({
    size: positions.size,
    symbol: positions.symbol,
  }).from(positions).where(
    and(eq(positions.userId, userId), eq(positions.status, "open"))
  );

  const openCount = openPos.length;
  const totalExposure = openPos.reduce((s, p) => s + (p.size || 0), 0);

  // Risk status
  const dailyLossBreached = limits.dailyLossLimit != null && dailyPL < -(limits.dailyLossLimit);
  const drawdownBreached = limits.maxDrawdownLimit != null && currentDrawdown > limits.maxDrawdownLimit;
  const positionsBreached = limits.maxOpenPositions != null && openCount >= limits.maxOpenPositions;

  const shouldPause = dailyLossBreached || drawdownBreached;

  // Auto-pause if limits breached
  if (shouldPause && !limits.tradingPaused) {
    const reason = dailyLossBreached
      ? `Daily loss limit of $${limits.dailyLossLimit} reached`
      : `Max drawdown limit of $${limits.maxDrawdownLimit} reached`;
    await db.update(riskLimits)
      .set({ tradingPaused: true, pauseReason: reason, updatedAt: new Date() })
      .where(eq(riskLimits.userId, userId));
  }

  return {
    limits,
    startingBalance: STARTING_BALANCE,
    daily: {
      pl: parseFloat(dailyPL.toFixed(2)),
      limit: limits.dailyLossLimit,
      breached: dailyLossBreached,
      percentUsed: limits.dailyLossLimit
        ? Math.min(100, Math.round((Math.abs(Math.min(dailyPL, 0)) / limits.dailyLossLimit) * 100))
        : 0,
    },
    drawdown: {
      current: parseFloat(currentDrawdown.toFixed(2)),
      max: parseFloat(maxDDValue.toFixed(2)),
      limit: limits.maxDrawdownLimit,
      breached: drawdownBreached,
      percentUsed: limits.maxDrawdownLimit
        ? Math.min(100, Math.round((currentDrawdown / limits.maxDrawdownLimit) * 100))
        : 0,
    },
    positions: {
      open: openCount,
      limit: limits.maxOpenPositions,
      breached: positionsBreached,
      totalLots: parseFloat(totalExposure.toFixed(2)),
    },
    balance: parseFloat(balance.toFixed(2)),
    equity: parseFloat(balance.toFixed(2)),
    tradingPaused: limits.tradingPaused || shouldPause,
    pauseReason: limits.pauseReason,
  };
}

// ─── Resume trading ───────────────────────────────────────────────────────────
export async function resumeTrading(userId: string) {
  await db.update(riskLimits)
    .set({ tradingPaused: false, pauseReason: null, updatedAt: new Date() })
    .where(eq(riskLimits.userId, userId));
}
