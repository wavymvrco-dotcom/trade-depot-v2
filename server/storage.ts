import { db } from "./db";
import { users, strategies, positions, aiSignals, userSettings, priceAlerts, notifications, watchlist, tradeJournal, strategyMarketplace, marketplaceVotes, pushSubscriptions, subscriptions } from "@shared/schema";
import type {
  User, InsertUser,
  Strategy, InsertStrategy,
  Position, InsertPosition,
  AiSignal, InsertAiSignal,
  UserSettings, InsertUserSettings,
  PriceAlert, InsertPriceAlert,
  Notification, InsertNotification,
  WatchlistItem, InsertWatchlistItem,
  TradeJournal, InsertTradeJournal,
  InsertMarketplace, MarketplaceStrategy,
  Subscription, InsertSubscription,
} from "@shared/schema";
import { eq, desc, and, asc, sql, lt, gt } from "drizzle-orm";
import { encryptSecret, decryptSecret, SECRET_SETTING_FIELDS } from "./crypto";

function encryptSettings<T extends Record<string, any>>(s: T): T {
  const out: Record<string, any> = { ...s };
  for (const f of SECRET_SETTING_FIELDS) if (f in out) out[f] = encryptSecret(out[f]);
  return out as T;
}
function decryptSettings<T extends Record<string, any>>(s: T): T {
  const out: Record<string, any> = { ...s };
  for (const f of SECRET_SETTING_FIELDS) if (f in out) out[f] = decryptSecret(out[f]);
  return out as T;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPasswordResetToken(token: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: string, hashed: string): Promise<void>;
  updateUserEmail(id: string, email: string): Promise<void>;
  setEmailVerificationToken(id: string, token: string): Promise<void>;
  markEmailVerified(id: string): Promise<void>;
  setPasswordResetToken(id: string, token: string, expires: Date): Promise<void>;
  clearPasswordResetToken(id: string): Promise<void>;
  setUserAdmin(id: string, isAdmin: boolean): Promise<void>;
  setUserBanned(id: string, isBanned: boolean, banReason?: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
  getSubscription(userId: string): Promise<Subscription | undefined>;
  upsertSubscription(sub: InsertSubscription): Promise<Subscription>;
  getAllPositionsAdmin(): Promise<Position[]>;
  getAllSignalsAdmin(limit?: number): Promise<AiSignal[]>;
  getPlatformStats(): Promise<{ totalUsers: number; totalTrades: number; totalSignals: number; totalJournalEntries: number; totalAlerts: number; totalMarketplaceListings: number }>;

  getStrategiesByUser(userId: string): Promise<Strategy[]>;
  getActiveStrategy(userId: string): Promise<Strategy | undefined>;
  createStrategy(strategy: InsertStrategy): Promise<Strategy>;
  updateStrategy(id: string, updates: Partial<InsertStrategy>): Promise<Strategy | undefined>;
  deactivateAllStrategies(userId: string): Promise<void>;

  getOpenPositions(userId: string): Promise<Position[]>;
  getClosedPositions(userId: string): Promise<Position[]>;
  createPosition(position: InsertPosition): Promise<Position>;
  updatePosition(id: string, updates: Partial<InsertPosition>): Promise<Position | undefined>;
  closePosition(id: string, closePrice: number, profit: number): Promise<Position | undefined>;
  closeAllPositions(userId: string): Promise<void>;

  getRecentSignals(userId: string, limit?: number): Promise<AiSignal[]>;
  getPendingSignal(userId: string): Promise<AiSignal | undefined>;
  getActiveSignalsAllUsers(): Promise<AiSignal[]>;
  createSignal(signal: InsertAiSignal): Promise<AiSignal>;
  updateSignalStatus(id: string, status: string): Promise<AiSignal | undefined>;
  resolveSignalOutcome(id: string, outcome: string, outcomePrice: number): Promise<void>;
  getSignalStats(userId: string): Promise<{ total: number; tpHit: number; slHit: number; expired: number; winRate: number; byProvider: Record<string, { total: number; wins: number; winRate: number }> }>;

  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  upsertUserSettings(settings: InsertUserSettings): Promise<UserSettings>;

  getAlerts(userId: string): Promise<PriceAlert[]>;
  createAlert(alert: InsertPriceAlert): Promise<PriceAlert>;
  deleteAlert(id: string, userId: string): Promise<void>;
  triggerAlert(id: string): Promise<void>;
  getUntriggeredAlerts(): Promise<PriceAlert[]>;

  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  createNotification(n: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;

  getLeaderboard(): Promise<Array<{ userId: string; username: string; totalPL: number; trades: number; winRate: number }>>;

  getWatchlist(userId: string): Promise<WatchlistItem[]>;
  addToWatchlist(item: InsertWatchlistItem): Promise<WatchlistItem>;
  removeFromWatchlist(userId: string, symbol: string): Promise<void>;
  setWatchlist(userId: string, symbols: string[]): Promise<void>;

  getTradeJournal(userId: string): Promise<TradeJournal[]>;
  createTradeJournalEntry(entry: InsertTradeJournal): Promise<TradeJournal>;
  updateTradeJournalEntry(id: string, userId: string, updates: Partial<InsertTradeJournal>): Promise<TradeJournal | undefined>;
  deleteTradeJournalEntry(id: string, userId: string): Promise<void>;

  getMarketplaceListings(limit?: number): Promise<MarketplaceStrategy[]>;
  getMarketplaceListing(id: string): Promise<MarketplaceStrategy | undefined>;
  createMarketplaceListing(listing: InsertMarketplace): Promise<MarketplaceStrategy>;
  deleteMarketplaceListing(id: string, userId: string): Promise<void>;
  voteMarketplace(marketplaceId: string, userId: string): Promise<void>;
  hasVoted(marketplaceId: string, userId: string): Promise<boolean>;
  incrementCopyCount(marketplaceId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  async getAllUsers() {
    return db.select().from(users);
  }
  async createUser(insertUser: InsertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  async getUserByPasswordResetToken(token: string) {
    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));
    return user;
  }
  async getUserByVerificationToken(token: string) {
    const [user] = await db.select().from(users).where(eq(users.emailVerificationToken, token));
    return user;
  }
  async updateUserPassword(id: string, hashed: string) {
    await db.update(users).set({ password: hashed }).where(eq(users.id, id));
  }
  async updateUserEmail(id: string, email: string) {
    await db.update(users).set({ email }).where(eq(users.id, id));
  }
  async setEmailVerificationToken(id: string, token: string) {
    await db.update(users).set({ emailVerificationToken: token, emailVerified: false }).where(eq(users.id, id));
  }
  async markEmailVerified(id: string) {
    await db.update(users).set({ emailVerified: true, emailVerificationToken: null }).where(eq(users.id, id));
  }
  async setPasswordResetToken(id: string, token: string, expires: Date) {
    await db.update(users).set({ passwordResetToken: token, passwordResetExpires: expires }).where(eq(users.id, id));
  }
  async clearPasswordResetToken(id: string) {
    await db.update(users).set({ passwordResetToken: null, passwordResetExpires: null }).where(eq(users.id, id));
  }
  async getSubscription(userId: string) {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    return sub;
  }
  async upsertSubscription(sub: InsertSubscription) {
    const [result] = await db.insert(subscriptions).values(sub)
      .onConflictDoUpdate({ target: subscriptions.userId, set: { ...sub, updatedAt: new Date() } })
      .returning();
    return result;
  }

  async getStrategiesByUser(userId: string) {
    return db.select().from(strategies).where(eq(strategies.userId, userId)).orderBy(desc(strategies.createdAt));
  }
  async getActiveStrategy(userId: string) {
    const [s] = await db.select().from(strategies).where(and(eq(strategies.userId, userId), eq(strategies.isActive, true)));
    return s;
  }
  async createStrategy(strategy: InsertStrategy) {
    const [s] = await db.insert(strategies).values(strategy).returning();
    return s;
  }
  async updateStrategy(id: string, updates: Partial<InsertStrategy>) {
    const [s] = await db.update(strategies).set({ ...updates, updatedAt: new Date() }).where(eq(strategies.id, id)).returning();
    return s;
  }
  async deactivateAllStrategies(userId: string) {
    await db.update(strategies).set({ isActive: false }).where(eq(strategies.userId, userId));
  }

  async getPositionById(id: string) {
    const [p] = await db.select().from(positions).where(eq(positions.id, id));
    return p ?? null;
  }
  async getOpenPositions(userId: string) {
    return db.select().from(positions).where(and(eq(positions.userId, userId), eq(positions.status, "open"))).orderBy(desc(positions.openedAt));
  }
  async getClosedPositions(userId: string) {
    return db.select().from(positions).where(and(eq(positions.userId, userId), eq(positions.status, "closed"))).orderBy(desc(positions.closedAt));
  }
  async createPosition(position: InsertPosition) {
    const [p] = await db.insert(positions).values(position).returning();
    return p;
  }
  async updatePosition(id: string, updates: Partial<InsertPosition>) {
    const [p] = await db.update(positions).set(updates).where(eq(positions.id, id)).returning();
    return p;
  }
  async closePosition(id: string, closePrice: number, profit: number) {
    const [p] = await db.update(positions).set({ status: "closed", currentPrice: closePrice, profit, closedAt: new Date() }).where(eq(positions.id, id)).returning();
    return p;
  }
  async closeAllPositions(userId: string) {
    await db.update(positions).set({ status: "closed", closedAt: new Date() }).where(and(eq(positions.userId, userId), eq(positions.status, "open")));
  }

  async getRecentSignals(userId: string, limit = 20) {
    return db.select().from(aiSignals).where(eq(aiSignals.userId, userId)).orderBy(desc(aiSignals.createdAt)).limit(limit);
  }
  async getPendingSignal(userId: string) {
    const [s] = await db.select().from(aiSignals).where(and(eq(aiSignals.userId, userId), eq(aiSignals.status, "pending"))).orderBy(desc(aiSignals.createdAt));
    return s;
  }
  async getSignalForUser(id: string, userId: string) {
    const [s] = await db.select().from(aiSignals).where(and(eq(aiSignals.id, id), eq(aiSignals.userId, userId)));
    return s;
  }
  async createSignal(signal: InsertAiSignal) {
    const [s] = await db.insert(aiSignals).values(signal).returning();
    return s;
  }
  async updateSignalStatus(id: string, status: string) {
    const updates: any = { status };
    if (status === "executed") updates.executedAt = new Date();
    const [s] = await db.update(aiSignals).set(updates).where(eq(aiSignals.id, id)).returning();
    return s;
  }

  async getActiveSignalsAllUsers() {
    // Signals created within last 48h with no outcome yet (still being watched)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    return db.select().from(aiSignals)
      .where(and(
        sql`${aiSignals.outcome} IS NULL`,
        sql`${aiSignals.entryPrice} IS NOT NULL`,
        sql`${aiSignals.stopLoss} IS NOT NULL`,
        sql`${aiSignals.takeProfit} IS NOT NULL`,
        sql`${aiSignals.createdAt} > ${cutoff}`
      ));
  }

  async resolveSignalOutcome(id: string, outcome: string, outcomePrice: number) {
    await db.update(aiSignals).set({
      outcome,
      outcomePrice,
      outcomeAt: new Date(),
    }).where(eq(aiSignals.id, id));
  }

  async getSignalStats(userId: string) {
    const signals = await db.select().from(aiSignals)
      .where(and(eq(aiSignals.userId, userId), sql`${aiSignals.outcome} IS NOT NULL`));

    const total = signals.length;
    const tpHit = signals.filter(s => s.outcome === "TP_HIT").length;
    const slHit = signals.filter(s => s.outcome === "SL_HIT").length;
    const expired = signals.filter(s => s.outcome === "EXPIRED").length;
    const winRate = total > 0 ? Math.round((tpHit / total) * 100) : 0;

    const byProvider: Record<string, { total: number; wins: number; winRate: number }> = {};
    for (const s of signals) {
      const p = s.aiProvider || "heuristic";
      if (!byProvider[p]) byProvider[p] = { total: 0, wins: 0, winRate: 0 };
      byProvider[p].total++;
      if (s.outcome === "TP_HIT") byProvider[p].wins++;
    }
    for (const p of Object.keys(byProvider)) {
      byProvider[p].winRate = Math.round((byProvider[p].wins / byProvider[p].total) * 100);
    }

    return { total, tpHit, slHit, expired, winRate, byProvider };
  }

  async getUserSettings(userId: string) {
    const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return s ? decryptSettings(s) : s;
  }
  async getUserSettingsByWebhookToken(token: string) {
    const [s] = await db.select().from(userSettings).where(eq(userSettings.webhookToken, token));
    return s ? decryptSettings(s) : s;
  }
  async upsertUserSettings(settings: InsertUserSettings) {
    const encrypted = encryptSettings(settings);
    const [existing] = await db.select({ id: userSettings.id }).from(userSettings).where(eq(userSettings.userId, settings.userId));
    if (existing) {
      const [s] = await db.update(userSettings).set({ ...encrypted, updatedAt: new Date() }).where(eq(userSettings.userId, settings.userId)).returning();
      return decryptSettings(s);
    }
    const [s] = await db.insert(userSettings).values(encrypted).returning();
    return decryptSettings(s);
  }

  async getAlerts(userId: string) {
    return db.select().from(priceAlerts).where(eq(priceAlerts.userId, userId)).orderBy(desc(priceAlerts.createdAt));
  }
  async createAlert(alert: InsertPriceAlert) {
    const [a] = await db.insert(priceAlerts).values(alert).returning();
    return a;
  }
  async deleteAlert(id: string, userId: string) {
    await db.delete(priceAlerts).where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)));
  }
  async triggerAlert(id: string) {
    await db.update(priceAlerts).set({ triggered: true, triggeredAt: new Date() }).where(eq(priceAlerts.id, id));
  }
  async getUntriggeredAlerts() {
    return db.select().from(priceAlerts).where(eq(priceAlerts.triggered, false));
  }

  async getNotifications(userId: string, limit = 30) {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
  }
  async createNotification(n: InsertNotification) {
    const [notif] = await db.insert(notifications).values(n).returning();
    return notif;
  }
  async markNotificationRead(id: string, userId: string) {
    await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }
  async markAllNotificationsRead(userId: string) {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  }
  async getUnreadCount(userId: string) {
    const [r] = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return Number(r?.count ?? 0);
  }

  async getLeaderboard() {
    const rows = await db.execute(sql`
      SELECT
        u.id as "userId",
        u.username,
        COALESCE(SUM(p.profit), 0)::float AS "totalPL",
        COUNT(p.id)::int AS trades,
        CASE WHEN COUNT(p.id) = 0 THEN 0
          ELSE ROUND((COUNT(CASE WHEN p.profit > 0 THEN 1 END)::numeric / NULLIF(COUNT(p.id), 0)) * 100)::int
        END AS "winRate"
      FROM users u
      LEFT JOIN positions p ON p.user_id = u.id AND p.status = 'closed'
      GROUP BY u.id, u.username
      ORDER BY "totalPL" DESC
    `);
    return (rows.rows as any[]).map(r => ({
      userId: r.userId,
      username: r.username,
      totalPL: parseFloat(parseFloat(r.totalPL).toFixed(2)),
      trades: parseInt(r.trades) || 0,
      winRate: parseInt(r.winRate) || 0,
    }));
  }

  async getWatchlist(userId: string) {
    return db.select().from(watchlist).where(eq(watchlist.userId, userId)).orderBy(asc(watchlist.addedAt));
  }
  async addToWatchlist(item: InsertWatchlistItem) {
    const existing = await db.select().from(watchlist).where(and(eq(watchlist.userId, item.userId), eq(watchlist.symbol, item.symbol)));
    if (existing.length > 0) return existing[0];
    const [w] = await db.insert(watchlist).values(item).returning();
    return w;
  }
  async removeFromWatchlist(userId: string, symbol: string) {
    await db.delete(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.symbol, symbol)));
  }
  async setWatchlist(userId: string, symbols: string[]) {
    await db.delete(watchlist).where(eq(watchlist.userId, userId));
    if (symbols.length > 0) {
      await db.insert(watchlist).values(symbols.map(s => ({ userId, symbol: s })));
    }
  }

  async getTradeJournal(userId: string) {
    return db.select().from(tradeJournal).where(eq(tradeJournal.userId, userId)).orderBy(desc(tradeJournal.openedAt));
  }
  async createTradeJournalEntry(entry: InsertTradeJournal) {
    const [t] = await db.insert(tradeJournal).values(entry).returning();
    return t;
  }
  async updateTradeJournalEntry(id: string, userId: string, updates: Partial<InsertTradeJournal>) {
    const [t] = await db.update(tradeJournal).set(updates).where(and(eq(tradeJournal.id, id), eq(tradeJournal.userId, userId))).returning();
    return t;
  }
  async deleteTradeJournalEntry(id: string, userId: string) {
    await db.delete(tradeJournal).where(and(eq(tradeJournal.id, id), eq(tradeJournal.userId, userId)));
  }

  async getMarketplaceListings(limit = 50) {
    return db.select().from(strategyMarketplace)
      .where(eq(strategyMarketplace.isPublic, true))
      .orderBy(desc(strategyMarketplace.upvotes))
      .limit(limit);
  }
  async getMarketplaceListing(id: string) {
    const [m] = await db.select().from(strategyMarketplace).where(eq(strategyMarketplace.id, id));
    return m;
  }
  async createMarketplaceListing(listing: InsertMarketplace) {
    const [m] = await db.insert(strategyMarketplace).values(listing).returning();
    return m;
  }
  async deleteMarketplaceListing(id: string, userId: string) {
    await db.delete(strategyMarketplace).where(and(eq(strategyMarketplace.id, id), eq(strategyMarketplace.authorId, userId)));
  }
  async voteMarketplace(marketplaceId: string, userId: string) {
    const already = await this.hasVoted(marketplaceId, userId);
    if (already) return;
    await db.insert(marketplaceVotes).values({ marketplaceId, userId });
    await db.update(strategyMarketplace)
      .set({ upvotes: sql`${strategyMarketplace.upvotes} + 1` })
      .where(eq(strategyMarketplace.id, marketplaceId));
  }
  async hasVoted(marketplaceId: string, userId: string) {
    const [v] = await db.select().from(marketplaceVotes)
      .where(and(eq(marketplaceVotes.marketplaceId, marketplaceId), eq(marketplaceVotes.userId, userId)));
    return !!v;
  }
  async incrementCopyCount(marketplaceId: string) {
    await db.update(strategyMarketplace)
      .set({ copyCount: sql`${strategyMarketplace.copyCount} + 1` })
      .where(eq(strategyMarketplace.id, marketplaceId));
  }

  async deleteMarketplaceListingAdmin(id: string) {
    await db.delete(strategyMarketplace).where(eq(strategyMarketplace.id, id));
  }
  async setUserAdmin(id: string, isAdmin: boolean) {
    await db.update(users).set({ isAdmin } as any).where(eq(users.id, id));
  }
  async setUserBanned(id: string, isBanned: boolean, banReason?: string) {
    await db.update(users).set({ isBanned, banReason: banReason ?? null } as any).where(eq(users.id, id));
  }
  async deleteUser(id: string) {
    await db.delete(users).where(eq(users.id, id));
  }
  async getAllPositionsAdmin() {
    return db.select().from(positions).orderBy(desc(positions.openedAt)).limit(200);
  }
  async getAllSignalsAdmin(limit = 100) {
    return db.select().from(aiSignals).orderBy(desc(aiSignals.createdAt)).limit(limit);
  }
  async getPlatformStats() {
    const [uCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [pCount] = await db.select({ count: sql<number>`count(*)::int` }).from(positions);
    const [sCount] = await db.select({ count: sql<number>`count(*)::int` }).from(aiSignals);
    const [jCount] = await db.select({ count: sql<number>`count(*)::int` }).from(tradeJournal);
    const [aCount] = await db.select({ count: sql<number>`count(*)::int` }).from(priceAlerts);
    const [mCount] = await db.select({ count: sql<number>`count(*)::int` }).from(strategyMarketplace);
    return {
      totalUsers: uCount?.count ?? 0,
      totalTrades: pCount?.count ?? 0,
      totalSignals: sCount?.count ?? 0,
      totalJournalEntries: jCount?.count ?? 0,
      totalAlerts: aCount?.count ?? 0,
      totalMarketplaceListings: mCount?.count ?? 0,
    };
  }
}

export const storage = new DatabaseStorage();
