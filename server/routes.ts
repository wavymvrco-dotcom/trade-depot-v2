import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { generateAiSignal, getMarketContext, callAiProviderMarkdown } from "./ai-engine";
import { priceDecimals } from "@shared/pips";
import { openTrade, closeTrade, normalizeSide } from "./execution";
import { fetchLivePrices, verifyPolygonConnection, getMarketDataStatus, isTradablePrice, type LivePrice } from "./marketdata";
import { checkCanOpenTrade } from "./trade-guard";
import { SECRET_SETTING_FIELDS, randomToken } from "./crypto";
import { calcProfit } from "./pips";
import { fetchEconomicCalendar } from "./calendar";
import { getOandaAccountId, placeOandaOrder, closeOandaTrade } from "./brokers/oanda";
import { testMT5Bridge, placeMT5Order, closeMT5Trade, getMT5AccountInfo } from "./brokers/mt5";
import { fetchCandlesForAI, fetchCandles, runBacktest } from "./backtest";
import { sendEmail, verifySmtp, tradeAlertHtml } from "./email";
import { insertStrategySchema, insertPositionSchema, insertUserSchema, insertPriceAlertSchema, insertNotificationSchema, insertTradeJournalSchema, insertMarketplaceSchema } from "@shared/schema";
import { generateTradeReview, getAllKnowledge, getTradeReviews, getTradeReviewByPosition, generateWeeklyReport } from "./ai-knowledge";
import { getRiskDashboard, getRiskLimits, updateRiskLimits, resumeTrading } from "./risk";
import { getForexNews } from "./news";
import { saveSubscription, removeSubscription, sendPushToUser } from "./push";
import { z } from "zod";
import {
  createStripeCustomer,
  createCheckoutSession,
  createPortalSession,
  getStripePublishableKey,
  getCustomerSubscriptions,
} from "./stripe";

const BCRYPT_ROUNDS = 12;

/** Settings as sent to the browser: credentials replaced with has* flags. */
function redactSettings(s: Record<string, any>) {
  const out: Record<string, any> = { ...s };
  for (const f of SECRET_SETTING_FIELDS) {
    out[`has${f[0].toUpperCase()}${f.slice(1)}`] = !!out[f];
    delete out[f];
  }
  delete out.webhookToken;
  return out;
}

/**
 * Blocks server-side requests to loopback, private and cloud-metadata
 * addresses (SSRF). Hostnames are checked as written; DNS rebinding is out of
 * scope for user-supplied SMTP/bridge hosts.
 */
export function isSafeOutboundHost(hostOrUrl: unknown): boolean {
  if (typeof hostOrUrl !== "string" || !hostOrUrl.trim()) return false;
  let host = hostOrUrl.trim();
  try { if (/^[a-z]+:\/\//i.test(host)) host = new URL(host).hostname; } catch { return false; }
  host = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "metadata.google.internal") return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;
  return true;
}

/** New session id on login/register to prevent session fixation. */
function startSession(req: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      (req.session as any).userId = userId;
      req.session.save(e => (e ? reject(e) : resolve()));
    });
  });
}

/** Authenticated user id — only valid on routes behind requireAuth. */
function uid(req: Request): string {
  return (req.session as any).userId as string;
}

// Endpoints reachable without a session. Everything else under /api requires login.
const PUBLIC_API = [
  /^\/api\/version$/,
  /^\/api\/auth\/(login|register|logout|forgot-password|reset-password|verify-email|me)$/,
  /^\/api\/webhook\/tradingview$/,
  /^\/api\/profile\/[^/]+$/,
  /^\/api\/market\/(prices|status)$/,
  /^\/api\/push\/vapid-public-key$/,
  /^\/api\/billing\/publishable-key$/,
];

// Simple fixed-window limiter for auth endpoints (per IP)
const authHits = new Map<string, { count: number; resetAt: number }>();
function authRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const hit = authHits.get(key);
  if (!hit || hit.resetAt < now) { authHits.set(key, { count: 1, resetAt: now + 15 * 60_000 }); return next(); }
  if (++hit.count > 20) return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
  next();
}

const SERVER_START_VERSION = Date.now().toString();

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", "/api/auth/reset-password"], authRateLimit);

  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    const path = req.originalUrl.split("?")[0];
    if (PUBLIC_API.some(re => re.test(path))) return next();
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(userId).catch(() => undefined);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    if (user.isBanned) return res.status(403).json({ message: `Account suspended${user.banReason ? `: ${user.banReason}` : ""}` });
    next();
  });

  // Version endpoint — clients poll this to detect new deployments
  app.get("/api/version", (_req, res) => {
    res.json({ version: SERVER_START_VERSION });
  });

  // --- Auth (simple session-based) ---
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username?.trim());
      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      // Support both bcrypt-hashed and plain-text (legacy) passwords
      let valid = false;
      if (user.password.startsWith("$2")) {
        valid = await bcrypt.compare(password, user.password);
      } else {
        valid = user.password === password;
        // Upgrade legacy plain-text to hash on successful login
        if (valid) {
          const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
          await storage.updateUserPassword(user.id, hashed);
        }
      }
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });
      if (user.isBanned) return res.status(403).json({ message: "Account suspended" });
      await startSession(req, user.id);
      res.json({ id: user.id, username: user.username });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, password, email } = req.body;
      const data = insertUserSchema.parse({ username, password });
      if (!/^[A-Za-z0-9_.-]{3,32}$/.test(data.username.trim())) {
        return res.status(400).json({ message: "Username must be 3–32 characters: letters, numbers, _ . -" });
      }
      if (data.password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
      const existing = await storage.getUserByUsername(data.username.trim());
      if (existing) return res.status(409).json({ message: "Username already taken" });
      const hashed = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
      const user = await storage.createUser({ ...data, username: data.username.trim(), password: hashed });
      // Optional email: store it and send verification
      if (email && email.trim()) {
        const cleanEmail = email.trim().toLowerCase();
        const verifyToken = require("crypto").randomBytes(32).toString("hex");
        await storage.updateUserEmail(user.id, cleanEmail);
        await storage.setEmailVerificationToken(user.id, verifyToken);
        const settings = await storage.getUserSettings(user.id);
        const appUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : process.env.APP_URL || "http://localhost:5000";
        const verifyUrl = `${appUrl}/verify-email?token=${verifyToken}`;
        const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0f;font-family:Inter,sans-serif;color:#e2e8f0">
<div style="max-width:480px;margin:32px auto;background:#111827;border:1px solid #1e293b;border-radius:12px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid #1e293b">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">TradeAI Terminal</div>
    <div style="font-size:20px;font-weight:700;color:#f1f5f9">Verify your email</div>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 20px;color:#94a3b8;line-height:1.6">Welcome, ${user.username.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}! Click the button below to verify your email address and unlock email notifications for trade alerts.</p>
    <a href="${verifyUrl}" style="display:inline-block;background:#00d4ff;color:#000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Verify Email</a>
  </div>
</div></body></html>`;
        await sendEmail(settings as any, cleanEmail, "TradeAI Terminal: Verify your email", html).catch(() => {});
      }
      // Create default free subscription + Stripe customer (fire-and-forget)
      await storage.upsertSubscription({ userId: user.id, plan: "free", status: "active" });
      createStripeCustomer(String(user.id), user.username, email?.trim() || null)
        .then(async (customerId) => {
          if (customerId) await storage.upsertSubscription({ userId: user.id, stripeCustomerId: customerId, plan: "free", status: "active" });
        })
        .catch(() => {});
      await startSession(req, user.id);
      res.json({ id: user.id, username: user.username });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  // ── Forgot Password ────────────────────────────────────────────────────────
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email required" });
      // Always return success to prevent email enumeration
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      if (user) {
        const token = require("crypto").randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await storage.setPasswordResetToken(user.id, token, expires);
        const settings = await storage.getUserSettings(user.id);
        const appUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : process.env.APP_URL || "http://localhost:5000";
        const resetUrl = `${appUrl}/reset-password?token=${token}`;
        const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0f;font-family:Inter,sans-serif;color:#e2e8f0">
<div style="max-width:480px;margin:32px auto;background:#111827;border:1px solid #1e293b;border-radius:12px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid #1e293b">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">TradeAI Terminal</div>
    <div style="font-size:20px;font-weight:700;color:#f1f5f9">Reset your password</div>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 20px;color:#94a3b8;line-height:1.6">Hi ${user.username.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}, we received a request to reset your TradeAI Terminal password. Click the button below to set a new password. This link expires in 1 hour.</p>
    <a href="${resetUrl}" style="display:inline-block;background:#00d4ff;color:#000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Reset Password</a>
    <p style="margin:20px 0 0;font-size:11px;color:#475569;">If you didn't request a password reset, you can safely ignore this email. Your account remains secure.</p>
  </div>
</div></body></html>`;
        await sendEmail(settings as any, email.trim(), "TradeAI Terminal: Password Reset", html);
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Reset Password ─────────────────────────────────────────────────────────
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ message: "Token and password required" });
      if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
      const user = await storage.getUserByPasswordResetToken(token);
      if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
        return res.status(400).json({ message: "Reset link is invalid or has expired" });
      }
      const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await storage.updateUserPassword(user.id, hashed);
      await storage.clearPasswordResetToken(user.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Verify Email ───────────────────────────────────────────────────────────
  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "Token required" });
      const user = await storage.getUserByVerificationToken(token);
      if (!user) return res.status(400).json({ message: "Invalid or expired verification link" });
      await storage.markEmailVerified(user.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    const user = userId ? await storage.getUser(userId) : undefined;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified ?? false,
      isAdmin: (user as any).isAdmin ?? false,
      isBanned: (user as any).isBanned ?? false,
    });
  });

  // ── Billing / Subscription ─────────────────────────────────────────────────
  app.get("/api/billing/subscription", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const sub = await storage.getSubscription(userId);
      res.json(sub || { userId, plan: "free", status: "active" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Stripe: Publishable Key ────────────────────────────────────────────────
  app.get("/api/billing/publishable-key", async (req: Request, res: Response) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Stripe: Checkout Session ────────────────────────────────────────────────
  app.post("/api/billing/checkout", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      let sub = await storage.getSubscription(userId);
      if (!sub?.stripeCustomerId) {
        const user = await storage.getUser(userId);
        if (!user) return res.status(404).json({ message: "User not found" });
        const customerId = await createStripeCustomer(String(user.id), user.username, user.email || null);
        if (!customerId) return res.status(500).json({ message: "Failed to create Stripe customer" });
        await storage.upsertSubscription({ userId: user.id, stripeCustomerId: customerId, plan: sub?.plan || "free", status: "active" });
        sub = await storage.getSubscription(userId);
      }
      const origin = req.headers.origin || `https://${process.env.REPLIT_DEV_DOMAIN}` || "http://localhost:5000";
      const session = await createCheckoutSession(
        sub!.stripeCustomerId!,
        `${origin}/pricing?upgraded=1`,
        `${origin}/pricing?cancelled=1`
      );
      res.json({ url: session.url });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Stripe: Billing Portal ─────────────────────────────────────────────────
  app.post("/api/billing/portal", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const sub = await storage.getSubscription(userId);
      if (!sub?.stripeCustomerId) return res.status(400).json({ message: "No billing account found" });
      const origin = req.headers.origin || `https://${process.env.REPLIT_DEV_DOMAIN}` || "http://localhost:5000";
      const portal = await createPortalSession(sub.stripeCustomerId, `${origin}/pricing`);
      res.json({ url: portal.url });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Stripe: Sync subscription from Stripe ─────────────────────────────────
  app.post("/api/billing/sync", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const sub = await storage.getSubscription(userId);
      if (!sub?.stripeCustomerId) return res.json({ ok: true, plan: "free" });
      const stripeSubs = await getCustomerSubscriptions(sub.stripeCustomerId);
      const activeSub = stripeSubs.find(s => s.status === "active" || s.status === "trialing");
      if (activeSub) {
        const item = activeSub.items.data[0];
        const plan = item?.price?.unit_amount && item.price.unit_amount > 0 ? "pro" : "free";
        await storage.upsertSubscription({
          userId,
          stripeCustomerId: sub.stripeCustomerId,
          stripeSubscriptionId: activeSub.id,
          plan,
          status: activeSub.status,
          currentPeriodEnd: activeSub.items.data[0]?.current_period_end ? new Date(activeSub.items.data[0].current_period_end * 1000) : undefined,
        });
        return res.json({ ok: true, plan });
      }
      res.json({ ok: true, plan: "free" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Admin middleware ────────────────────────────────────────────────────────
  async function requireAdmin(req: Request, res: Response, next: () => void) {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(userId);
    if (!user || !(user as any).isAdmin) return res.status(403).json({ message: "Admin access required" });
    (req as any).adminUser = user;
    next();
  }

  // ─── Admin: Platform Stats ───────────────────────────────────────────────────
  app.get("/api/admin/stats", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getPlatformStats();
      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter((u: any) => u.isAdmin).length;
      const banned = allUsers.filter((u: any) => u.isBanned).length;
      const recentUsers = allUsers.filter((u: any) => u.createdAt && new Date(u.createdAt) > new Date(Date.now() - 7 * 86400000)).length;
      res.json({ ...stats, admins, banned, recentUsers });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Admin: User Management ──────────────────────────────────────────────────
  app.get("/api/admin/users", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      const enriched = await Promise.all(allUsers.map(async (u: any) => {
        const [open, closed, signals] = await Promise.all([
          storage.getOpenPositions(u.id),
          storage.getClosedPositions(u.id),
          storage.getRecentSignals(u.id, 10),
        ]);
        const totalPL = closed.reduce((s: number, p: any) => s + (p.profit ?? 0), 0);
        return {
          id: u.id, username: u.username, isAdmin: u.isAdmin ?? false,
          isBanned: u.isBanned ?? false, banReason: u.banReason ?? null,
          createdAt: u.createdAt,
          openPositions: open.length, closedTrades: closed.length,
          totalPL: Math.round(totalPL * 100) / 100,
          signalCount: signals.length,
        };
      }));
      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/admin/users/:id/ban", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      await storage.setUserBanned(req.params.id, true, reason ?? "Banned by admin");
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/admin/users/:id/unban", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      await storage.setUserBanned(req.params.id, false);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/admin/users/:id/make-admin", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      await storage.setUserAdmin(req.params.id, true);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/admin/users/:id/revoke-admin", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      if (req.params.id === adminUser.id) return res.status(400).json({ message: "Cannot revoke your own admin" });
      await storage.setUserAdmin(req.params.id, false);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/admin/users/:id/reset-password", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
      const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await storage.updateUserPassword(req.params.id, hashed);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/admin/users/:id", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      if (req.params.id === adminUser.id) return res.status(400).json({ message: "Cannot delete your own account" });
      await storage.deleteUser(req.params.id);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Admin: All Positions ────────────────────────────────────────────────────
  app.get("/api/admin/positions", requireAdmin as any, async (_req: Request, res: Response) => {
    try {
      const all = await storage.getAllPositionsAdmin();
      const allUsers = await storage.getAllUsers();
      const userMap = Object.fromEntries(allUsers.map((u: any) => [u.id, u.username]));
      res.json(all.map((p: any) => ({ ...p, username: userMap[p.userId] ?? p.userId })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Admin: All Signals ──────────────────────────────────────────────────────
  app.get("/api/admin/signals", requireAdmin as any, async (_req: Request, res: Response) => {
    try {
      const all = await storage.getAllSignalsAdmin(100);
      const allUsers = await storage.getAllUsers();
      const userMap = Object.fromEntries(allUsers.map((u: any) => [u.id, u.username]));
      res.json(all.map((s: any) => ({ ...s, username: userMap[s.userId] ?? s.userId })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Admin: All Marketplace ──────────────────────────────────────────────────
  app.get("/api/admin/marketplace", requireAdmin as any, async (_req: Request, res: Response) => {
    try {
      const all = await storage.getMarketplaceListings(200);
      res.json(all);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/admin/marketplace/:id", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      await (storage as any).deleteMarketplaceListingAdmin(req.params.id);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Admin: Broadcast Notification ──────────────────────────────────────────
  app.post("/api/admin/broadcast", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      const { title, message, type = "info" } = req.body;
      if (!title || !message) return res.status(400).json({ message: "Title and message are required" });
      const allUsers = await storage.getAllUsers();
      await Promise.all(allUsers.map((u: any) =>
        storage.createNotification({ userId: u.id, type, title, message, read: false })
      ));
      res.json({ ok: true, sent: allUsers.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Admin: One-time setup (promote a user to admin if no admin exists) ──────
  app.post("/api/admin/setup", async (req: Request, res: Response) => {
    try {
      const { username, setupKey } = req.body;
      const envKey = process.env.ADMIN_SETUP_KEY;
      if (!envKey || setupKey !== envKey) return res.status(403).json({ message: "Invalid setup key" });
      const allUsers = await storage.getAllUsers();
      const alreadyHasAdmin = allUsers.some((u: any) => u.isAdmin);
      if (alreadyHasAdmin) return res.status(409).json({ message: "Admin already exists. Use the admin panel to manage admins." });
      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(404).json({ message: "User not found" });
      await storage.setUserAdmin(user.id, true);
      res.json({ ok: true, message: `${username} is now an admin` });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // --- Market Prices (Twelve Data live feed, falls back to simulation) ---
  app.get("/api/market/prices", async (_req: Request, res: Response) => {
    try {
      const prices = await fetchLivePrices();
      const status = getMarketDataStatus();
      res.json({ prices, meta: { source: status.status, provider: status.provider, hasApiKey: status.hasApiKey, cacheAge: status.cacheAge } });
    } catch {
      res.json({ prices: {}, meta: { source: "failed", provider: "Yahoo Finance", hasApiKey: false } });
    }
  });

  // --- Verify Twelve Data connection ---
  app.post("/api/market/verify", async (_req: Request, res: Response) => {
    const result = await verifyPolygonConnection();
    res.json({ ...result, provider: "Yahoo Finance" });
  });

  // --- Market data status ---
  app.get("/api/market/status", (_req: Request, res: Response) => {
    res.json(getMarketDataStatus());
  });

  // Real correlation: Pearson on 60 daily log returns, cached 6h
  let corrCache: { at: number; data: any } | null = null;
  app.get("/api/market/correlation", async (_req: Request, res: Response) => {
    try {
      if (corrCache && Date.now() - corrCache.at < 6 * 3600_000) return res.json(corrCache.data);
      const key = process.env.TWELVE_DATA_API_KEY;
      if (!key) return res.json({ pairs: [], matrix: [], live: false, message: "Market data not configured" });
      const pairs = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "USDCHF", "GBPJPY"];
      const series = await Promise.all(pairs.map(p => fetchCandles(p, "1day", 61, key).catch(() => [] as any[])));
      const returns = series.map(c => {
        const byDate = new Map<string, number>();
        for (let i = 1; i < c.length; i++) byDate.set(c[i].time.slice(0, 10), Math.log(c[i].close / c[i - 1].close));
        return byDate;
      });
      const pearson = (a: Map<string, number>, b: Map<string, number>) => {
        const dates = Array.from(a.keys()).filter(d => b.has(d));
        if (dates.length < 20) return null;
        const x = dates.map(d => a.get(d)!), y = dates.map(d => b.get(d)!);
        const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
        let num = 0, dx = 0, dy = 0;
        for (let i = 0; i < x.length; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
        return dx && dy ? parseFloat((num / Math.sqrt(dx * dy)).toFixed(2)) : null;
      };
      const matrix = returns.map((a, i) => returns.map((b, j) => (i === j ? 1 : pearson(a, b))));
      const data = { pairs, matrix, live: true, window: "60 daily returns", asOf: new Date().toISOString() };
      corrCache = { at: Date.now(), data };
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // --- AI Signals ---
  app.get("/api/signals", async (req: Request, res: Response) => {
    const userId = uid(req);
    const signals = await storage.getRecentSignals(userId, 20);
    res.json(signals);
  });

  app.get("/api/signals/pending", async (req: Request, res: Response) => {
    const userId = uid(req);
    const signal = await storage.getPendingSignal(userId);
    res.json(signal || null);
  });

  app.post("/api/signals/generate", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const { symbol } = req.body;
      const signal = await generateAiSignal(userId, symbol);
      // "No trade" is a normal answer, not an error
      res.json(signal ?? { noTrade: true, message: `No clear setup on ${String(symbol || "this pair").toUpperCase()} right now.` });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Signal generation failed" });
    }
  });

  // ── Strategy momentum forecast ──────────────────────────────────────────────
  app.post("/api/strategy/forecast", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const { style = "swing", goal = "balanced", symbols = ["EURUSD", "GBPUSD", "XAUUSD"] } = req.body;

      const prices = await fetchLivePrices().catch(() => ({})) as Record<string, { bid: number; change: number }>;
      const userSettings = await storage.getUserSettings(userId).catch(() => null);

      const timeframeMeta: Record<string, { label: string; horizon: string; bars: string }> = {
        scalp:    { label: "Scalping",       horizon: "next 15–60 min",  bars: "1m–5m charts"   },
        day:      { label: "Day Trading",    horizon: "today's session", bars: "15m–1H charts"  },
        swing:    { label: "Swing Trading",  horizon: "next 3–7 days",   bars: "4H–Daily charts"},
        position: { label: "Position/Weekly",horizon: "next 2–4 weeks",  bars: "Daily–Weekly"   },
      };
      const tf = timeframeMeta[style] || timeframeMeta.swing;

      const provider = userSettings?.selectedAiProvider;
      const hasProvider = provider && provider !== "none" && userSettings;

      let forecasts: Array<{ symbol: string; bias: string; confidence: number; summary: string; keyLevel: number; change: number }> = [];

      if (hasProvider) {
        // Real AI forecast
        const { callAiProviderForForecast } = await import("./ai-engine");
        const priceLines = Object.entries(prices)
          .map(([s, p]) => `${s}: ${p.bid} (${p.change >= 0 ? "+" : ""}${p.change}% today)`)
          .join("\n");

        const prompt = `You are a professional market analyst. Provide a ${tf.label} momentum forecast for these markets.

Current live prices:
${priceLines}

Timeframe: ${tf.label} — outlook for ${tf.horizon} using ${tf.bars}.
Goal context: ${goal} trading approach.

Analyze EURUSD, GBPUSD, and XAUUSD. For each provide:
- Directional bias (BULLISH or BEARISH)
- Confidence 60-90
- 2-sentence summary specific to this timeframe and current price action
- One key price level to watch

Respond ONLY with this JSON:
{
  "forecasts": [
    { "symbol": "EURUSD", "bias": "BULLISH", "confidence": 78, "summary": "...", "keyLevel": 1.1550 },
    { "symbol": "GBPUSD", "bias": "BEARISH", "confidence": 71, "summary": "...", "keyLevel": 1.3380 },
    { "symbol": "XAUUSD", "bias": "BULLISH", "confidence": 82, "summary": "...", "keyLevel": 2320 }
  ]
}`;

        try {
          const result = await callAiProviderForForecast(provider, userSettings as any, prompt);
          if (result?.forecasts && Array.isArray(result.forecasts)) {
            forecasts = result.forecasts.map((f: any) => ({
              ...f,
              change: prices[f.symbol]?.change || 0,
            }));
          }
        } catch (e: any) {
          console.warn("[Forecast] AI call failed:", e.message);
        }
      }

      // Without an AI provider (or for symbols it skipped), report today's move
      // factually — this is not a forecast, and it says so.
      const covered = new Set(forecasts.map(f => f.symbol));
      for (const sym of ["EURUSD", "GBPUSD", "XAUUSD"]) {
        if (covered.has(sym)) continue;
        const q = prices[sym];
        const change = q?.change || 0;
        const bias = change > 0.15 ? "BULLISH" : change < -0.15 ? "BEARISH" : "NEUTRAL";
        forecasts.push({
          symbol: sym,
          bias,
          confidence: 0,
          summary: `${sym} is ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)}% today. This is today's move, not a forecast — connect an AI provider for a ${tf.label.toLowerCase()} outlook.`,
          keyLevel: q?.bid ?? 0,
          change,
        });
      }

      res.json({
        style,
        goal,
        timeframe: tf,
        forecasts,
        generatedBy: hasProvider ? provider : "heuristic",
        timestamp: Date.now(),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Strategy AI Analysis (section-by-section scorecard) ────────────────────
  app.post("/api/strategy/analyze", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const { style, goal, riskPercent, maxPositions, rrRatio, accountSize, description } = req.body;

      const userSettings = await storage.getUserSettings(userId).catch(() => null);
      const provider = userSettings?.selectedAiProvider;
      const hasProvider = provider && provider !== "none" && userSettings;

      type Grade = "A" | "B" | "C" | "D" | "F";
      type Status = "excellent" | "good" | "fair" | "poor" | "critical";
      type Section = { key: string; name: string; score: number; grade: Grade; status: Status; summary: string; improvements: string[] };

      const toGrade = (score: number): Grade => {
        if (score >= 88) return "A";
        if (score >= 74) return "B";
        if (score >= 58) return "C";
        if (score >= 40) return "D";
        return "F";
      };
      const toStatus = (score: number): Status => {
        if (score >= 88) return "excellent";
        if (score >= 74) return "good";
        if (score >= 58) return "fair";
        if (score >= 40) return "poor";
        return "critical";
      };

      const STYLE_MIN_ACCOUNT: Record<string, number> = { scalp: 1000, day: 2000, swing: 500, position: 5000 };
      const STYLE_EXPECTED_RR: Record<string, number>  = { scalp: 1.5, day: 2.0, swing: 2.5, position: 3.0 };
      const minAccount = STYLE_MIN_ACCOUNT[style] || 500;
      const expectedRR = STYLE_EXPECTED_RR[style] || 2.0;
      const concurrentRisk = (riskPercent || 2) * (maxPositions || 3);

      // ── Section 1: Capital Adequacy ─────────────────────────────────────────
      const capitalRatio = Math.min(accountSize / minAccount, 2);
      const capitalScore = Math.round(Math.min(100, capitalRatio * 60 + (accountSize >= minAccount * 1.5 ? 30 : 0) + (accountSize >= minAccount ? 10 : 0)));
      const capitalSection: Section = {
        key: "capital",
        name: "Capital Adequacy",
        score: capitalScore,
        grade: toGrade(capitalScore),
        status: toStatus(capitalScore),
        summary: accountSize >= minAccount
          ? `$${accountSize.toLocaleString()} is ${accountSize >= minAccount * 2 ? "well-funded" : "adequately funded"} for ${style === "scalp" ? "Scalping" : style === "day" ? "Day Trading" : style === "swing" ? "Swing Trading" : "Position Trading"}.`
          : `$${accountSize.toLocaleString()} is below the $${minAccount.toLocaleString()} minimum needed for ${style === "scalp" ? "Scalping" : style === "day" ? "Day Trading" : style === "swing" ? "Swing Trading" : "Position Trading"}.`,
        improvements: accountSize >= minAccount * 2 ? [
          "Capital is strong — consider diversifying across 2–3 uncorrelated asset classes (FX, Gold, Indices).",
          "At this level, a monthly withdrawal plan (e.g. 20% of profits) protects gains and reduces overtrading.",
          "Consider separating 10–15% as a 'risk reserve' that is never traded — buffer for black swan events.",
        ] : accountSize >= minAccount ? [
          `Add $${(minAccount * 1.5 - accountSize).toLocaleString()} more capital to reach the 1.5× funded threshold and reduce margin pressure.`,
          "Avoid over-trading to 'grow faster' — at this level, one bad week can set you back months.",
          `If you cannot add more capital, ${style === "scalp" ? "switch to Swing" : "switch to a lower-cost style"} to reduce per-trade spread costs.`,
        ] : [
          `Increase account to at least $${minAccount.toLocaleString()} before trading ${style} style — spreads and swaps will eat returns at current size.`,
          "Consider paper trading this strategy until you have adequate capital — real-money losses with insufficient capital damage psychology.",
          `The minimum viable account for profitability after all costs is $${Math.round(minAccount * 1.2).toLocaleString()} for this style.`,
        ],
      };

      // ── Section 2: Risk Per Trade ───────────────────────────────────────────
      const riskScore =
        riskPercent <= 1   ? 100 :
        riskPercent <= 1.5 ? 94 :
        riskPercent <= 2   ? 83 :
        riskPercent <= 2.5 ? 68 :
        riskPercent <= 3   ? 52 :
        riskPercent <= 4   ? 32 : 12;
      const riskSection: Section = {
        key: "riskPerTrade",
        name: "Risk Per Trade",
        score: riskScore,
        grade: toGrade(riskScore),
        status: toStatus(riskScore),
        summary: riskPercent <= 2
          ? `${riskPercent}% risk per trade aligns with institutional risk management standards (1–2% per trade).`
          : `${riskPercent}% risk per trade exceeds the institutional standard — ${Math.ceil(100 / riskPercent)} losing trades in a row would eliminate your account.`,
        improvements: riskPercent <= 1.5 ? [
          "Excellent discipline. At 1–1.5% risk, you can absorb 50+ consecutive losses before account failure.",
          "Focus on improving win rate through better entry timing rather than increasing risk size.",
          "Consider 'pyramiding' into winning trades (adding to positions as they move in your favor) as an alternative to higher risk.",
        ] : riskPercent <= 2 ? [
          "Consider targeting 1–1.5% risk as you refine your system — lower risk compounding still outperforms higher risk with losses.",
          "Use a 5-trade drawdown rule: if you lose 5 in a row, reduce risk to 0.5% until you win 3 consecutively.",
          "Track expected value: (win rate × avg win $) − (loss rate × avg loss $). Risk sizing should be driven by this number.",
        ] : riskPercent <= 3 ? [
          `Reduce to 2% risk per trade immediately. At ${riskPercent}%, a normal 3-trade losing streak costs ${(riskPercent * 3).toFixed(1)}% of capital.`,
          "Oversizing is one of the most common ways traders break prop-firm drawdown rules — size to the rule, not the setup.",
          "Use a position-size calculator and stick to it — emotional sizing after wins is the #1 account killer.",
        ] : [
          `CRITICAL: ${riskPercent}% per trade is account-threatening. Reduce to 1–2% before placing another trade.`,
          `At ${riskPercent}% risk, a 6-trade losing streak (common in any system) destroys ${(1 - Math.pow(1 - riskPercent / 100, 6)) * 100 < 100 ? ((1 - Math.pow(1 - riskPercent / 100, 6)) * 100).toFixed(1) : "99+"}% of your capital.`,
          "Many traders believe high risk = faster growth. In reality, it just means faster failure — the math is unforgiving.",
        ],
      };

      // ── Section 3: Portfolio Exposure ───────────────────────────────────────
      const exposureScore =
        concurrentRisk <= 4  ? 100 :
        concurrentRisk <= 6  ? 93 :
        concurrentRisk <= 8  ? 82 :
        concurrentRisk <= 10 ? 68 :
        concurrentRisk <= 15 ? 42 : 15;
      const exposureSection: Section = {
        key: "portfolioExposure",
        name: "Portfolio Exposure",
        score: exposureScore,
        grade: toGrade(exposureScore),
        status: toStatus(exposureScore),
        summary: concurrentRisk <= 8
          ? `Max concurrent exposure of ${concurrentRisk.toFixed(1)}% is within acceptable bounds for diversified risk.`
          : `Max concurrent exposure of ${concurrentRisk.toFixed(1)}% across ${maxPositions} positions is dangerously high — correlated market moves can trigger all stops simultaneously.`,
        improvements: concurrentRisk <= 6 ? [
          "Portfolio exposure is well-controlled. Add correlation checks before opening new positions (EURUSD and GBPUSD are 85% correlated — don't count as separate risks).",
          "Consider a 'heat map' approach: track open risk as a % of account daily and log it — pattern recognition reveals overtrading cycles.",
          "The 2% daily loss rule (close all trades if down 2% on the day) is used by all major prop firms — adopt it.",
        ] : concurrentRisk <= 10 ? [
          `Your ${maxPositions} max positions at ${riskPercent}% each = ${concurrentRisk}% total risk. Aim for under 8% maximum portfolio heat.`,
          "FX pairs are highly correlated during news events — a USD data release can hit EURUSD, GBPUSD, AUDUSD, and XAUUSD simultaneously.",
          `Consider reducing to ${Math.max(1, Math.floor(8 / riskPercent))} max positions at your current ${riskPercent}% risk level to stay under the 8% threshold.`,
        ] : [
          `Reduce max positions to ${Math.max(1, Math.floor(8 / riskPercent))} OR reduce risk per trade to ${(8 / maxPositions).toFixed(1)}% to bring total exposure under 8%.`,
          "Never have more than 3 correlated positions open at once (e.g., EURUSD + GBPUSD + AUDUSD are all USD-risk — treat as one position).",
          "Consider a hard stop: if you reach 10% total drawdown on the day, stop trading for 24 hours. This rule saves accounts.",
        ],
      };

      // ── Section 4: Reward:Risk Ratio ────────────────────────────────────────
      const rrScore =
        rrRatio >= expectedRR * 1.3 ? 100 :
        rrRatio >= expectedRR       ? 88 :
        rrRatio >= expectedRR * 0.8 ? 68 :
        rrRatio >= 1.5              ? 48 :
        rrRatio >= 1.2              ? 28 : 10;
      const breakEvenWinRate = Math.round((1 / (1 + rrRatio)) * 100);
      const rrSection: Section = {
        key: "rewardRisk",
        name: "Reward:Risk Ratio",
        score: rrScore,
        grade: toGrade(rrScore),
        status: toStatus(rrScore),
        summary: rrRatio >= expectedRR
          ? `1:${rrRatio} R:R exceeds the ${style} minimum (1:${expectedRR}). You need a ${breakEvenWinRate}% win rate to break even — very achievable.`
          : `1:${rrRatio} R:R is below the ${style} minimum of 1:${expectedRR}. You need a ${breakEvenWinRate}%+ win rate to break even — statistically difficult to sustain.`,
        improvements: rrRatio >= expectedRR ? [
          `Solid R:R discipline. At 1:${rrRatio}, a 45% win rate is still profitable — gives you room to be selective.`,
          "Never move your take profit closer — only move your stop to break-even once price moves 50% of the way to TP.",
          `Consider scaling out: take 50% profit at 1:${Math.max(1.5, rrRatio * 0.6).toFixed(1)} and trail the rest — reduces risk of giving back gains while capturing runners.`,
        ] : rrRatio >= 1.5 ? [
          `Raise minimum R:R to 1:${expectedRR} for ${style} trading. This is the institutional standard for this style.`,
          "If you can't find setups with 1:${expectedRR} R:R, it means entry timing is off — wait for price to be closer to the key level.",
          "A 1:2 R:R means you can be wrong 66% of the time and still break even — below this, even a 60% win rate loses money to spreads.",
        ] : [
          `1:${rrRatio} R:R requires a ${breakEvenWinRate}%+ win rate to be profitable — almost no trader achieves this consistently after costs.`,
          `Immediately raise your TP target so the distance is at least 1.5× your SL distance. This is non-negotiable for profitability.`,
          "If your TP keeps getting hit then reversing, you're placing TPs at obvious levels — aim just below key resistance (for longs) instead of at it.",
        ],
      };

      // ── Section 5: Style & Goal Alignment ──────────────────────────────────
      const IDEAL_COMBOS: Record<string, string[]> = {
        scalp: ["aggressive"],
        day: ["income", "aggressive"],
        swing: ["balanced", "aggressive", "conservative"],
        position: ["balanced", "conservative", "aggressive"],
      };
      const isIdealCombo = (IDEAL_COMBOS[style] || []).includes(goal);
      const hasStyleMismatch = style === "scalp" && (goal === "conservative" || goal === "income")
        || style === "position" && accountSize < 5000;
      const alignmentScore = isIdealCombo && !hasStyleMismatch ? 92 : hasStyleMismatch ? 38 : 65;
      const alignmentSection: Section = {
        key: "alignment",
        name: "Style & Goal Alignment",
        score: alignmentScore,
        grade: toGrade(alignmentScore),
        status: toStatus(alignmentScore),
        summary: isIdealCombo && !hasStyleMismatch
          ? `${style === "scalp" ? "Scalping" : style === "day" ? "Day Trading" : style === "swing" ? "Swing Trading" : "Position Trading"} with a ${goal} goal is a well-aligned combination used by professional traders.`
          : `${style === "scalp" ? "Scalping" : style === "day" ? "Day Trading" : style === "swing" ? "Swing Trading" : "Position Trading"} and ${goal} goals create internal conflict — the mechanics of this style work against the stated objective.`,
        improvements: isIdealCombo && !hasStyleMismatch ? [
          "Great alignment. Ensure your AI trading instructions explicitly mention session timing (London/NY) appropriate for your style.",
          `For ${goal} goal with ${style} style: track not just P&L but also trade frequency — overtrading is the silent killer for this combination.`,
          `Set monthly review checkpoints: compare actual performance vs. your ${goal} goal target. Adjust style if needed.`,
        ] : hasStyleMismatch ? [
          style === "scalp"
            ? `Scalping conflicts with ${goal} because spread costs erode income over many trades — switch to Swing Trading for this goal.`
            : `Position trading requires $5,000+ capital to weather multi-week drawdowns without margin calls. Fund up or switch to Swing.`,
          "The best style-goal combinations: Scalp/Aggressive, Day/Income, Swing/Balanced or Conservative, Position/Aggressive.",
          "A goal mismatch means even a profitable strategy will feel wrong — leading to premature exits and emotional trading.",
        ] : [
          `${style} trading is compatible with ${goal} goal but not ideal. Consider switching goal to '${IDEAL_COMBOS[style]?.[0] || "balanced"}' for better alignment.`,
          "Misaligned goals cause psychological conflict — you'll second-guess entries that don't match your mental picture of success.",
          "Set concrete quarterly targets aligned to your goal: e.g. 'conservative' = max 5% drawdown, min 8% annual return.",
        ],
      };

      // ── Section 6: Trading Instructions Quality ─────────────────────────────
      const descLen = (description || "").trim().length;
      const hasSpecificPairs = /EURUSD|GBPUSD|XAUUSD|USDJPY|AUDUSD|USDCAD/i.test(description || "");
      const hasSessionInfo = /london|new york|tokyo|asian|session|UTC|GMT|AM|PM/i.test(description || "");
      const hasNewsRule = /news|NFP|FOMC|CPI|GDP|central bank|avoid|economic/i.test(description || "");
      const hasEntryRule = /breakout|pullback|OTE|ICT|SMC|support|resistance|momentum|order block|FVG/i.test(description || "");
      const instrScore = Math.min(100, Math.max(5,
        (descLen > 20 ? 25 : descLen > 5 ? 10 : 0) +
        (hasSpecificPairs ? 20 : 0) +
        (hasSessionInfo ? 20 : 0) +
        (hasNewsRule ? 20 : 0) +
        (hasEntryRule ? 20 : 0) - (descLen === 0 ? 5 : 0)
      ));
      const instrSection: Section = {
        key: "instructions",
        name: "AI Trading Instructions",
        score: instrScore,
        grade: toGrade(instrScore),
        status: toStatus(instrScore),
        summary: instrScore >= 80
          ? "Your AI instructions are detailed and specific — the AI engine has clear guidance on pairs, sessions, news rules, and entry logic."
          : instrScore >= 50
          ? "Instructions provide some guidance but lack key specifics — the AI may generate suboptimal signals without clearer direction."
          : descLen === 0
          ? "No AI instructions provided — the AI engine is operating without a strategy framework, generating generic signals."
          : "Instructions are too vague — specificity is what separates AI signal quality from generic outputs.",
        improvements: instrScore >= 80 ? [
          "Excellent instructions. Consider adding a drawdown rule: 'Pause AI signals if daily loss exceeds 2%.'",
          "Add a session filter: specify exact UTC hours when signals are valid (e.g. 'only take signals 07:00–17:00 UTC').",
          "Consider adding an HTF bias rule: 'Only take longs if Daily chart is bullish, only shorts if Daily is bearish.'",
        ] : [
          !hasSpecificPairs ? "Add specific currency pairs: e.g. 'Focus on EURUSD and XAUUSD only.'" : "Good: specific pairs included.",
          !hasSessionInfo ? "Add session filters: e.g. 'Only trade during London session (07:00–13:00 UTC).'" : "Good: session info included.",
          !hasNewsRule ? "Add news avoidance: e.g. 'Avoid trades 30 minutes before high-impact news events.'" : "Good: news rules included.",
          !hasEntryRule ? "Add entry logic: e.g. 'Look for OTE pullbacks on 4H chart after a BOS on Daily.'" : "Good: entry rules included.",
        ].filter((s, i, arr) => !s.startsWith("Good") || arr.filter(x => !x.startsWith("Good")).length === 0).slice(0, 3),
      };

      // ── Aggregate ────────────────────────────────────────────────────────────
      const sections: Section[] = [capitalSection, riskSection, exposureSection, rrSection, alignmentSection, instrSection];
      const weights = [0.20, 0.25, 0.20, 0.20, 0.10, 0.05];
      const overallScore = Math.round(sections.reduce((sum, s, i) => sum + s.score * weights[i], 0));
      const overallGrade = toGrade(overallScore);

      // ── Legacy issues list (for compatibility) ────────────────────────────────
      type Issue = { severity: "critical" | "warning" | "info"; field: string; message: string; fix: string };
      const issues: Issue[] = sections
        .filter(s => s.status === "critical" || s.status === "poor")
        .map(s => ({
          severity: s.status === "critical" ? "critical" as const : "warning" as const,
          field: s.key,
          message: s.summary,
          fix: s.improvements[0] || "",
        }));

      const criticalCount = sections.filter(s => s.status === "critical").length;
      const poorCount = sections.filter(s => s.status === "poor").length;
      const verdict: "strong" | "adequate" | "risky" | "flawed" =
        criticalCount >= 2 ? "flawed" :
        criticalCount === 1 ? "risky" :
        poorCount >= 2 ? "adequate" : "strong";

      // ── Best-practice alternative suggestions ────────────────────────────────
      type Alternative = {
        name: string;
        style: string;
        goal: string;
        riskPercent: number;
        maxPositions: number;
        rrRatio: number;
        description: string;
        rationale: string;
        historicalEdge: string;
      };
      const alternatives: Alternative[] = [];

      if (verdict !== "strong") {
        if (accountSize < 5000) {
          alternatives.push({
            name: "Conservative Swing Compounder",
            style: "swing",
            goal: "conservative",
            riskPercent: 1,
            maxPositions: 2,
            rrRatio: 2.5,
            description: "Focus on EURUSD and XAUUSD swing setups using London Open Breakout and 4H OTE entries. Avoid NFP and FOMC weeks.",
            rationale: "Optimized for smaller accounts — low drawdown, high edge per trade, and compounding potential without excessive leverage.",
            historicalEdge: "Not backtested here — run it in Analytics → Backtest on your pairs before trading it live.",
          });
        }
        if (style !== "swing" || riskPercent > 2) {
          alternatives.push({
            name: "Institutional Swing (Balanced)",
            style: "swing",
            goal: "balanced",
            riskPercent: 1.5,
            maxPositions: 3,
            rrRatio: 2.5,
            description: "Swing trade EURUSD, GBPUSD, and XAUUSD on 4H/Daily charts using ICT OTE zones and momentum confluence. Avoid 30min before high-impact news.",
            rationale: "The most statistically reliable approach for retail traders. Mimics what CTA funds do at smaller scale — patient, high R:R setups with disciplined risk.",
            historicalEdge: "Not backtested here — run it in Analytics → Backtest on your pairs before trading it live.",
          });
        }
        if (goal === "income" || style === "day") {
          alternatives.push({
            name: "London Session Day Trader",
            style: "day",
            goal: "income",
            riskPercent: 1,
            maxPositions: 2,
            rrRatio: 2.0,
            description: "Day trade EURUSD and GBPUSD exclusively during the London session (07:00–13:00 UTC) using Asian range breakouts and NY continuation setups. No overnight holds.",
            rationale: "London session provides the highest liquidity and tightest spreads — the only session where day trading edge is statistically proven for retail traders.",
            historicalEdge: "Not backtested here — run it in Analytics → Backtest on your pairs before trading it live.",
          });
        }
        if (accountSize >= 5000 && style !== "position") {
          alternatives.push({
            name: "Macro Position Compounder",
            style: "position",
            goal: "aggressive",
            riskPercent: 1.5,
            maxPositions: 3,
            rrRatio: 3.5,
            description: "Position trade using weekly macro bias (DXY, yields, risk sentiment). Hold for 2–4 weeks targeting major structural levels. XAUUSD and USDCAD focus.",
            rationale: "Position trading with macro alignment produces the highest per-trade R:R. Institutional desks use this approach — fewer decisions, larger moves captured.",
            historicalEdge: "Not backtested here — run it in Analytics → Backtest on your pairs before trading it live.",
          });
        }
      }

      // ── AI enhancement ───────────────────────────────────────────────────────
      let aiAnalysis: { summary: string; deepInsight: string; hybridSuggestion: string } | null = null;
      if (hasProvider) {
        const { callAiProviderForForecast } = await import("./ai-engine");
        const prompt = `You are a professional trading strategy consultant and quantitative analyst. A trader has submitted their strategy configuration for review.

STRATEGY SUBMITTED:
- Trading Style: ${style} (${style === "scalp" ? "seconds–minutes hold" : style === "day" ? "intraday, close same day" : style === "swing" ? "3–7 day holds" : "2–4 week holds"})
- Primary Goal: ${goal}
- Risk Per Trade: ${riskPercent}%
- Max Open Positions: ${maxPositions}
- Min Reward:Risk: 1:${rrRatio}
- Account Size: $${accountSize?.toLocaleString()}
- AI Instructions: "${description || "None provided"}"

SYSTEM-IDENTIFIED ISSUES (${issues.length} found — severity: ${verdict}):
${issues.map(i => `• [${i.severity.toUpperCase()}] ${i.field}: ${i.message}`).join("\n") || "None — basic parameters look reasonable."}

Your task: Provide a brutally honest, data-backed expert review. Be direct. If the strategy has flaws, say so clearly. If there are specific reasons this approach fails in live markets, cite them. Also suggest a concrete hybrid approach that preserves what works while fixing the flaws.

Respond ONLY with this JSON:
{
  "summary": "2–3 sentence honest verdict of this strategy's live-market viability",
  "deepInsight": "3–4 sentence analysis citing specific market realities, statistical edge, or known failure patterns for this combination of settings",
  "hybridSuggestion": "2–3 sentence concrete hybrid strategy recommendation that combines the best elements of the submitted strategy with proven institutional approaches"
}`;

        try {
          const result = await callAiProviderForForecast(provider, userSettings as any, prompt);
          if (result?.summary) aiAnalysis = result;
        } catch (e: any) {
          console.warn("[StrategyAnalyze] AI call failed:", e.message);
        }
      }

      res.json({ verdict, overallScore, overallGrade, sections, issues, alternatives, aiAnalysis, analyzedAt: Date.now() });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/signals/:id/execute", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = uid(req);
      const signal = await storage.getSignalForUser(id, userId);
      if (!signal) return res.status(404).json({ message: "Signal not found" });
      if (signal.status !== "pending") return res.status(409).json({ message: `Signal already ${signal.status}` });

      const result = await openTrade({
        userId, symbol: signal.symbol, side: normalizeSide(signal.action), lots: signal.size ?? 0.1,
        stopLoss: signal.stopLoss, takeProfit: signal.takeProfit, aiSignal: true, signalId: signal.id,
      });
      if (!result.ok) return res.status(403).json({ message: result.reason });

      const executed = await storage.updateSignalStatus(id, "executed");
      res.json({ signal: executed, position: result.position, brokerNote: result.brokerNote });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/signals/:id/dismiss", async (req: Request, res: Response) => {
    const signal = await storage.getSignalForUser(req.params.id, uid(req));
    if (!signal) return res.status(404).json({ message: "Signal not found" });
    res.json(await storage.updateSignalStatus(signal.id, "dismissed"));
  });

  // Signal accuracy stats (win rate per provider)
  app.get("/api/signals/stats", async (req: Request, res: Response) => {
    const userId = uid(req);
    const stats = await storage.getSignalStats(userId);
    res.json(stats);
  });

  // --- Positions ---
  app.get("/api/positions", async (req: Request, res: Response) => {
    const userId = uid(req);
    const open = await storage.getOpenPositions(userId);
    res.json(open);
  });

  app.get("/api/positions/history", async (req: Request, res: Response) => {
    const userId = uid(req);
    const closed = await storage.getClosedPositions(userId);
    res.json(closed);
  });

  // Correlation exposure: detect open positions in correlated pairs
  app.get("/api/positions/exposure", async (req: Request, res: Response) => {
    const userId = uid(req);
    const open = await storage.getOpenPositions(userId);
    if (open.length < 2) return res.json({ warnings: [], totalUsdExposure: 0 });

    // Correlation groups (pairs that move together vs USD)
    const CORR_GROUPS: { label: string; pairs: string[]; threshold: number }[] = [
      { label: "EUR/GBP/AUD USD-short block", pairs: ["EURUSD","GBPUSD","AUDUSD","NZDUSD"], threshold: 0.70 },
      { label: "USD-long pairs (JPY/CAD/CHF)", pairs: ["USDJPY","USDCAD","USDCHF"], threshold: 0.65 },
      { label: "Gold & EUR anti-USD", pairs: ["XAUUSD","EURUSD"], threshold: 0.70 },
      { label: "GBP/JPY cross exposure", pairs: ["GBPJPY","GBPUSD","USDJPY"], threshold: 0.60 },
    ];

    const warnings: { group: string; positions: string[]; direction: string; risk: string }[] = [];
    for (const group of CORR_GROUPS) {
      const inGroup = open.filter(p => group.pairs.includes(p.symbol));
      if (inGroup.length < 2) continue;

      // Check if they're all in same USD direction
      const longCount  = inGroup.filter(p => p.type === "BUY").length;
      const shortCount = inGroup.filter(p => p.type === "SELL").length;
      if (longCount >= 2 || shortCount >= 2) {
        const dir = longCount >= 2 ? "LONG" : "SHORT";
        const symbols = inGroup.map(p => p.symbol).join(", ");
        warnings.push({
          group: group.label,
          positions: inGroup.map(p => p.symbol),
          direction: dir,
          risk: `${dir} ${symbols} — correlated exposure. USD move will impact ALL simultaneously.`,
        });
      }
    }

    // Total USD exposure (notional)
    const totalLots = open.reduce((s, p) => s + (p.size || 0), 0);
    res.json({ warnings, totalUsdExposure: parseFloat(totalLots.toFixed(2)), openCount: open.length });
  });

  // Close all open positions at market (also used by the emergency "flatten" button)
  async function closeAllFor(userId: string) {
    const open = await storage.getOpenPositions(userId);
    const closed: string[] = [];
    const failed: { symbol: string; reason: string }[] = [];
    for (const pos of open) {
      try {
        const r = await closeTrade(pos, { reason: "close_all" });
        if (r) closed.push(pos.symbol);
        else failed.push({ symbol: pos.symbol, reason: "No live price available" });
      } catch (e: any) {
        failed.push({ symbol: pos.symbol, reason: e.message });
      }
    }
    return { closed: closed.length, failed };
  }

  app.post("/api/positions/close-all", async (req: Request, res: Response) => {
    res.json(await closeAllFor(uid(req)));
  });

  const manualOrderSchema = z.object({
    symbol: z.string().regex(/^[A-Z0-9]{3,10}$/),
    type: z.string(),
    size: z.number().positive().max(50),
    stopLoss: z.number().positive().nullable().optional(),
    takeProfit: z.number().positive().nullable().optional(),
  });

  app.post("/api/positions", async (req: Request, res: Response) => {
    try {
      const order = manualOrderSchema.parse({ ...req.body, symbol: String(req.body?.symbol ?? "").toUpperCase() });
      const result = await openTrade({
        userId: uid(req), symbol: order.symbol, side: normalizeSide(order.type), lots: order.size,
        stopLoss: order.stopLoss ?? null, takeProfit: order.takeProfit ?? null, aiSignal: false,
      });
      if (!result.ok) return res.status(403).json({ message: result.reason });
      res.json(result.position);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/positions/:id/close", async (req: Request, res: Response) => {
    try {
      // Only the owner can close, and only an open position. Price and P&L are
      // computed server-side; anything the client sends is ignored.
      const openPos = (await storage.getOpenPositions(uid(req))).find(p => p.id === req.params.id);
      if (!openPos) return res.status(404).json({ message: "Position not found" });
      const position = await closeTrade(openPos, { reason: "manual" });
      if (!position) return res.status(503).json({ message: "No live price right now — try again in a moment." });
      res.json(position);
    } catch (e: any) {
      res.status(502).json({ message: e.message });
    }
  });

  // --- Strategies ---
  app.get("/api/strategies", async (req: Request, res: Response) => {
    const userId = uid(req);
    const strats = await storage.getStrategiesByUser(userId);
    res.json(strats);
  });

  app.get("/api/strategies/active", async (req: Request, res: Response) => {
    const userId = uid(req);
    const strategy = await storage.getActiveStrategy(userId);
    res.json(strategy || null);
  });

  app.post("/api/strategies", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      await storage.deactivateAllStrategies(userId);
      const data = insertStrategySchema.parse({ ...req.body, userId, isActive: true });
      const strategy = await storage.createStrategy(data);
      res.json(strategy);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/strategies/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const owned = (await storage.getStrategiesByUser(uid(req))).some(s => s.id === id);
      if (!owned) return res.status(404).json({ message: "Strategy not found" });
      const { userId: _ignore, id: _id, ...updates } = req.body ?? {};
      if (updates.riskPercent != null) updates.riskPercent = Math.min(10, Math.max(0.01, Number(updates.riskPercent) || 1));
      const strategy = await storage.updateStrategy(id, insertStrategySchema.partial().parse(updates));
      if (!strategy) return res.status(404).json({ message: "Strategy not found" });
      res.json(strategy);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ─── App Health Score ───────────────────────────────────────────────────────
  app.get("/api/app/health-score", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);

      const [settings, strategy, openPositions, closedPositions, signals, alerts, journal, watchlist] = await Promise.all([
        storage.getUserSettings(userId),
        storage.getActiveStrategy(userId),
        storage.getOpenPositions(userId),
        storage.getClosedPositions(userId),
        storage.getRecentSignals(userId, 50),
        storage.getAlerts(userId),
        storage.getTradeJournal(userId),
        storage.getWatchlist(userId),
      ]);

      type ScoreSection = {
        key: string;
        label: string;
        icon: string;
        score: number;
        grade: "A" | "B" | "C" | "D" | "F";
        status: "excellent" | "good" | "fair" | "poor" | "critical";
        summary: string;
        improvements: string[];
        stats: Record<string, string | number>;
      };

      const gradeFromScore = (s: number): "A" | "B" | "C" | "D" | "F" =>
        s >= 88 ? "A" : s >= 74 ? "B" : s >= 58 ? "C" : s >= 40 ? "D" : "F";
      const statusFromScore = (s: number): ScoreSection["status"] =>
        s >= 88 ? "excellent" : s >= 74 ? "good" : s >= 58 ? "fair" : s >= 40 ? "poor" : "critical";

      // ── 1. Trading Performance ──────────────────────────────────────────────
      const closed = closedPositions as any[];
      const wins = closed.filter(p => (p.profit ?? 0) > 0).length;
      const totalTrades = closed.length;
      const winRate = totalTrades > 0 ? wins / totalTrades : 0;
      const totalPL = closed.reduce((s, p) => s + (p.profit ?? 0), 0);
      const avgPL = totalTrades > 0 ? totalPL / totalTrades : 0;
      const profitableTrades = closed.filter(p => (p.profit ?? 0) > 0);
      const losingTrades = closed.filter(p => (p.profit ?? 0) < 0);
      const avgWin = profitableTrades.length > 0 ? profitableTrades.reduce((s, p) => s + p.profit, 0) / profitableTrades.length : 0;
      const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, p) => s + p.profit, 0) / losingTrades.length) : 1;
      const actualRR = avgLoss > 0 ? avgWin / avgLoss : 0;
      let perfScore = 50;
      if (totalTrades === 0) perfScore = 30;
      else {
        if (winRate >= 0.6) perfScore += 20; else if (winRate >= 0.5) perfScore += 10; else if (winRate < 0.4) perfScore -= 15;
        if (actualRR >= 2) perfScore += 20; else if (actualRR >= 1.5) perfScore += 10; else if (actualRR < 1) perfScore -= 15;
        if (totalTrades >= 20) perfScore += 10; else if (totalTrades >= 10) perfScore += 5;
        if (totalPL > 0) perfScore += 10; else perfScore -= 10;
      }
      perfScore = Math.max(5, Math.min(100, perfScore));

      const perfSection: ScoreSection = {
        key: "performance", label: "Trading Performance", icon: "TrendingUp",
        score: perfScore, grade: gradeFromScore(perfScore), status: statusFromScore(perfScore),
        summary: totalTrades === 0
          ? "No closed trades yet — start trading to generate a performance score."
          : `${Math.round(winRate * 100)}% win rate across ${totalTrades} trade${totalTrades !== 1 ? "s" : ""} with ${actualRR.toFixed(2)}:1 realized R:R.`,
        improvements: [
          totalTrades === 0 ? "Execute your first trade to begin tracking performance." : null,
          winRate < 0.5 && totalTrades > 0 ? "Win rate below 50% — review your entry criteria and only take A+ setups." : null,
          actualRR < 1.5 && totalTrades > 0 ? "Your average winner is smaller than your average loser — trail stops and let winners run." : null,
          totalTrades < 10 ? "More trade history needed for reliable statistics. Aim for 20+ trades." : null,
          totalPL < 0 ? "Account is net negative — pause, review losing trades in your journal, and identify the pattern." : null,
          winRate >= 0.6 && actualRR >= 2 ? "Excellent metrics — maintain discipline and focus on consistency." : null,
        ].filter(Boolean) as string[],
        stats: {
          "Win Rate": `${Math.round(winRate * 100)}%`,
          "Total Trades": totalTrades,
          "Net P&L": `$${totalPL.toFixed(2)}`,
          "Avg R:R": actualRR > 0 ? `${actualRR.toFixed(2)}:1` : "N/A",
        },
      };

      // ── 2. Strategy Configuration ───────────────────────────────────────────
      const strat = strategy as any;
      let stratScore = 20;
      const hasStrategy = !!strat;
      if (hasStrategy) {
        stratScore = 50;
        const rp = strat.riskPercent ?? 0;
        const rr = strat.rrRatio ?? 0;
        const acc = strat.accountSize ?? 0;
        const mp = strat.maxPositions ?? 0;
        if (rp >= 0.5 && rp <= 2) stratScore += 20; else if (rp <= 3) stratScore += 8;
        if (rr >= 2) stratScore += 15; else if (rr >= 1.5) stratScore += 7;
        if (acc >= 1000) stratScore += 10; else if (acc >= 500) stratScore += 5;
        if (mp >= 1 && mp <= 3) stratScore += 5;
        if (strat.description && strat.description.length > 30) stratScore += 10;
      }
      stratScore = Math.max(5, Math.min(100, stratScore));

      const stratSection: ScoreSection = {
        key: "strategy", label: "Strategy Configuration", icon: "Target",
        score: stratScore, grade: gradeFromScore(stratScore), status: statusFromScore(stratScore),
        summary: !hasStrategy
          ? "No active strategy set. Configure your trading strategy to unlock AI analysis and signals."
          : `${strat.style ?? "Unknown"} strategy targeting ${strat.goal ?? "N/A"} goal with ${strat.riskPercent ?? 0}% risk per trade.`,
        improvements: [
          !hasStrategy ? "Go to Strategy Builder and set up your active trading strategy." : null,
          hasStrategy && (strat.riskPercent ?? 0) > 2 ? "Risk per trade exceeds 2% — reduce to 1–1.5% for sustainable trading." : null,
          hasStrategy && (strat.rrRatio ?? 0) < 2 ? "Set a minimum R:R of 2:1 to ensure profitability even at 40% win rate." : null,
          hasStrategy && (!strat.description || strat.description.length < 30) ? "Add detailed AI instructions to your strategy for smarter, context-aware signals." : null,
          hasStrategy && (strat.accountSize ?? 0) < 500 ? "Set your account size accurately — this drives position sizing and risk calculations." : null,
        ].filter(Boolean) as string[],
        stats: {
          "Style": strat?.style ?? "Not set",
          "Risk/Trade": strat ? `${strat.riskPercent}%` : "N/A",
          "Min R:R": strat ? `1:${strat.rrRatio}` : "N/A",
          "Account Size": strat ? `$${(strat.accountSize ?? 0).toLocaleString()}` : "N/A",
        },
      };

      // ── 3. Risk Management ──────────────────────────────────────────────────
      const open = openPositions as any[];
      const openCount = open.length;
      const riskPct = strat?.riskPercent ?? 0;
      const maxPos = strat?.maxPositions ?? 0;
      const rrTarget = strat?.rrRatio ?? 0;
      const concurrentRisk = riskPct * openCount;
      let riskScore = 50;
      if (!hasStrategy) riskScore = 25;
      else {
        if (riskPct >= 0.5 && riskPct <= 1.5) riskScore += 25;
        else if (riskPct <= 2) riskScore += 15;
        else if (riskPct > 3) riskScore -= 20;
        if (rrTarget >= 2) riskScore += 20;
        else if (rrTarget >= 1.5) riskScore += 10;
        else if (rrTarget < 1.2) riskScore -= 15;
        if (maxPos >= 1 && maxPos <= 3) riskScore += 10;
        else if (maxPos > 5) riskScore -= 10;
        if (concurrentRisk > 15) riskScore -= 15;
        else if (concurrentRisk <= 6) riskScore += 5;
      }
      riskScore = Math.max(5, Math.min(100, riskScore));

      const riskSection: ScoreSection = {
        key: "risk", label: "Risk Management", icon: "ShieldCheck",
        score: riskScore, grade: gradeFromScore(riskScore), status: statusFromScore(riskScore),
        summary: !hasStrategy
          ? "Configure your strategy to enable risk scoring."
          : `${riskPct}% risk/trade · ${maxPos} max positions · ${concurrentRisk.toFixed(1)}% max concurrent exposure.`,
        improvements: [
          riskPct > 2 ? "Reduce risk per trade to 1–2%. Prop firms cap traders at 1% — your capital depends on it." : null,
          riskPct > 0 && riskPct <= 2 && rrTarget < 2 ? "Increase your minimum R:R to 2:1 — at 1.5% risk you need trades to earn at least 3% to stay ahead." : null,
          concurrentRisk > 10 ? `Total exposure of ${concurrentRisk.toFixed(1)}% across open positions is dangerous in correlated FX pairs.` : null,
          maxPos > 4 ? "Reduce max positions — holding too many trades simultaneously dilutes your edge and increases correlated losses." : null,
          !hasStrategy ? "Set up your strategy to unlock risk scoring and AI guidance." : null,
          riskScore >= 80 ? "Your risk parameters are well-calibrated. Stay consistent and don't revenge trade." : null,
        ].filter(Boolean) as string[],
        stats: {
          "Risk/Trade": hasStrategy ? `${riskPct}%` : "N/A",
          "Max Positions": hasStrategy ? maxPos : "N/A",
          "Open Trades": openCount,
          "Total Exposure": hasStrategy ? `${concurrentRisk.toFixed(1)}%` : "N/A",
        },
      };

      // ── 4. AI Integration ───────────────────────────────────────────────────
      const aiConnected = !!(settings?.openaiConnected || settings?.anthropicConnected || settings?.geminiConnected || settings?.groqConnected || settings?.xaiConnected || settings?.perplexityConnected);
      const hasApiKey = !!(settings?.openaiApiKey || settings?.anthropicApiKey || settings?.geminiApiKey || settings?.groqApiKey || settings?.xaiApiKey || settings?.perplexityApiKey);
      const signalList = signals as any[];
      const executedSignals = signalList.filter(s => s.status === "executed").length;
      const totalSignals = signalList.length;
      const executionRate = totalSignals > 0 ? executedSignals / totalSignals : 0;
      let aiScore = 20;
      if (aiConnected) aiScore += 35;
      else if (hasApiKey) aiScore += 15;
      if (totalSignals >= 10) aiScore += 20; else if (totalSignals >= 3) aiScore += 10;
      if (executionRate >= 0.5 && totalSignals >= 3) aiScore += 15; else if (executionRate >= 0.3) aiScore += 7;
      if (settings?.autoTrade) aiScore += 10;
      aiScore = Math.max(5, Math.min(100, aiScore));

      const aiSection: ScoreSection = {
        key: "ai", label: "AI Integration", icon: "Bot",
        score: aiScore, grade: gradeFromScore(aiScore), status: statusFromScore(aiScore),
        summary: !aiConnected
          ? "No AI provider connected. Add an API key in Settings to unlock AI-powered signals and analysis."
          : `AI connected · ${totalSignals} signals generated · ${Math.round(executionRate * 100)}% execution rate.`,
        improvements: [
          !aiConnected ? "Connect an AI provider (OpenAI, Anthropic, Gemini, or Groq) in Settings → AI Configuration." : null,
          aiConnected && totalSignals === 0 ? "Generate your first AI signal from the Trading Terminal dashboard." : null,
          aiConnected && totalSignals > 0 && executionRate < 0.3 ? "Low signal execution rate — review generated signals and act on high-confidence ones." : null,
          aiConnected && !settings?.autoTrade ? "Enable Auto-Trade mode to let AI execute high-confidence signals automatically." : null,
          aiConnected && executionRate >= 0.5 ? "Good AI engagement — try the AI Advisor for broader market commentary and coaching." : null,
        ].filter(Boolean) as string[],
        stats: {
          "Provider": aiConnected ? (settings?.selectedAiProvider ?? "connected") : "None",
          "Signals Generated": totalSignals,
          "Executed": executedSignals,
          "Auto-Trade": settings?.autoTrade ? "On" : "Off",
        },
      };

      // ── 5. Market Monitoring ────────────────────────────────────────────────
      const alertList = alerts as any[];
      const activeAlerts = alertList.filter((a: any) => !a.triggered).length;
      const watchlistItems = (watchlist as any[]).length;
      let monitorScore = 30;
      if (activeAlerts >= 5) monitorScore += 30; else if (activeAlerts >= 2) monitorScore += 20; else if (activeAlerts >= 1) monitorScore += 10;
      if (watchlistItems >= 5) monitorScore += 25; else if (watchlistItems >= 3) monitorScore += 15; else if (watchlistItems >= 1) monitorScore += 8;
      if (settings?.notifications) monitorScore += 15;
      monitorScore = Math.max(5, Math.min(100, monitorScore));

      const monitorSection: ScoreSection = {
        key: "monitoring", label: "Market Monitoring", icon: "Bell",
        score: monitorScore, grade: gradeFromScore(monitorScore), status: statusFromScore(monitorScore),
        summary: `${activeAlerts} active alert${activeAlerts !== 1 ? "s" : ""} · ${watchlistItems} watchlist item${watchlistItems !== 1 ? "s" : ""} · Notifications ${settings?.notifications ? "on" : "off"}.`,
        improvements: [
          activeAlerts === 0 ? "Set at least 2–3 price alerts on key levels for your trading pairs." : null,
          activeAlerts < 3 ? "Add more alerts at support/resistance and VWAP levels to catch breakouts." : null,
          watchlistItems < 3 ? "Add 3–5 pairs to your watchlist for quick market scanning." : null,
          !settings?.notifications ? "Enable push notifications in Settings to get real-time alerts on your device." : null,
          activeAlerts >= 5 && watchlistItems >= 5 ? "Great monitoring setup — check the Economic Calendar weekly for high-impact events." : null,
        ].filter(Boolean) as string[],
        stats: {
          "Active Alerts": activeAlerts,
          "Total Alerts": alertList.length,
          "Watchlist": watchlistItems,
          "Notifications": settings?.notifications ? "On" : "Off",
        },
      };

      // ── 6. Journal & Review ─────────────────────────────────────────────────
      const journalEntries = journal as any[];
      const journalCount = journalEntries.length;
      const entriesWithNotes = journalEntries.filter((e: any) => e.notes && e.notes.length > 20).length;
      const notesRate = journalCount > 0 ? entriesWithNotes / journalCount : 0;
      let journalScore = 20;
      if (journalCount >= 10) journalScore += 35; else if (journalCount >= 5) journalScore += 25; else if (journalCount >= 1) journalScore += 15;
      if (notesRate >= 0.7) journalScore += 30; else if (notesRate >= 0.4) journalScore += 15; else if (notesRate >= 0.2) journalScore += 8;
      journalScore = Math.max(5, Math.min(100, journalScore));

      const journalSection: ScoreSection = {
        key: "journal", label: "Journal & Review", icon: "BookOpen",
        score: journalScore, grade: gradeFromScore(journalScore), status: statusFromScore(journalScore),
        summary: journalCount === 0
          ? "No journal entries yet. Journaling is the fastest path to consistent profitability."
          : `${journalCount} journal entr${journalCount !== 1 ? "ies" : "y"} · ${Math.round(notesRate * 100)}% with detailed notes.`,
        improvements: [
          journalCount === 0 ? "Open the Journal tab and log your first trade — include your reasoning and emotional state." : null,
          journalCount > 0 && notesRate < 0.5 ? "Add detailed notes to every trade entry — what was your thesis? What happened? What will you do differently?" : null,
          journalCount > 0 && journalCount < 10 ? "Log every trade, even small ones. Patterns in your mistakes only become visible with 10+ entries." : null,
          journalCount >= 10 && notesRate >= 0.7 ? "Excellent journaling habit — review weekly and tag your best/worst setups by pattern type." : null,
          journalCount > 5 ? "Use journal reviews to identify your highest-probability setups and double down on them." : null,
        ].filter(Boolean) as string[],
        stats: {
          "Total Entries": journalCount,
          "Detailed Notes": `${Math.round(notesRate * 100)}%`,
          "This Month": journalEntries.filter((e: any) => e.createdAt && new Date(e.createdAt) > new Date(Date.now() - 30 * 86400000)).length,
        },
      };

      // ── 7. Account Health ───────────────────────────────────────────────────
      const brokerConnected = settings?.brokerConnected ?? false;
      const accountSize = strat?.accountSize ?? 0;
      const onboardingDone = settings?.onboardingCompleted ?? false;
      let accountScore = 30;
      if (brokerConnected) accountScore += 30;
      if (accountSize >= 5000) accountScore += 25; else if (accountSize >= 1000) accountScore += 15; else if (accountSize >= 500) accountScore += 8;
      if (settings?.brokerType !== "demo") accountScore += 10;
      if (onboardingDone) accountScore += 5;
      accountScore = Math.max(5, Math.min(100, accountScore));

      const accountSection: ScoreSection = {
        key: "account", label: "Account Health", icon: "Wallet",
        score: accountScore, grade: gradeFromScore(accountScore), status: statusFromScore(accountScore),
        summary: brokerConnected
          ? `${settings?.brokerType?.toUpperCase() ?? "Demo"} broker connected · $${accountSize.toLocaleString()} account size configured.`
          : "No broker connected. Connect your broker to enable live trading and accurate position sizing.",
        improvements: [
          !brokerConnected ? "Connect your broker (MetaTrader or demo) in Settings → Broker Configuration." : null,
          accountSize < 500 ? "Set your account size accurately in your Strategy — this drives all risk calculations." : null,
          accountSize > 0 && accountSize < 1000 ? "With under $1,000, stick to micro-lots and max 1% risk per trade to protect your capital." : null,
          settings?.brokerType === "demo" && brokerConnected ? "You're on a demo account — great for practice, but consider live trading when consistently profitable." : null,
          brokerConnected && accountSize >= 5000 ? "Well-funded account — ensure you are using proper position sizing for each pair." : null,
        ].filter(Boolean) as string[],
        stats: {
          "Broker": settings?.brokerType ?? "Not connected",
          "Status": brokerConnected ? "Connected" : "Disconnected",
          "Account Size": accountSize > 0 ? `$${accountSize.toLocaleString()}` : "Not set",
        },
      };

      // ── 8. Platform Mastery ─────────────────────────────────────────────────
      let features = 0;
      if (aiConnected) features++;
      if (brokerConnected) features++;
      if (hasStrategy) features++;
      if (journalCount > 0) features++;
      if (activeAlerts > 0) features++;
      if (totalSignals > 0) features++;
      if (watchlistItems > 0) features++;
      if (totalTrades > 0) features++;
      const masteryScore = Math.min(100, 15 + features * 12);

      const masterySection: ScoreSection = {
        key: "mastery", label: "Platform Mastery", icon: "GraduationCap",
        score: masteryScore, grade: gradeFromScore(masteryScore), status: statusFromScore(masteryScore),
        summary: `Using ${features} of 8 key platform features. ${features >= 7 ? "Power user — you're getting the most out of TradeAI." : features >= 4 ? "Good adoption — a few more features to unlock." : "Just getting started — explore more features to level up."}`,
        improvements: [
          !aiConnected ? "Connect an AI provider to unlock AI signals, forecasts, and strategy critique." : null,
          !brokerConnected ? "Connect your broker to see real P&L and enable live trading." : null,
          !hasStrategy ? "Set up a trading strategy to get personalized AI guidance." : null,
          journalCount === 0 ? "Start journaling — it's one of the most impactful habits for improvement." : null,
          activeAlerts === 0 ? "Create price alerts on key levels to never miss a move." : null,
          totalSignals === 0 ? "Generate your first AI signal from the Trading Terminal." : null,
          features >= 7 ? "Explore the AI Advisor tab for daily market briefings and custom coaching." : null,
          features >= 6 ? "Check the Marketplace to share or discover community trading strategies." : null,
        ].filter(Boolean) as string[],
        stats: {
          "Features Active": `${features}/8`,
          "AI": aiConnected ? "Connected" : "Not connected",
          "Broker": brokerConnected ? "Connected" : "Not connected",
          "Signals Used": totalSignals > 0 ? "Yes" : "No",
        },
      };

      // ── Overall ─────────────────────────────────────────────────────────────
      const sections = [perfSection, stratSection, riskSection, aiSection, monitorSection, journalSection, accountSection, masterySection];
      const weights = [0.20, 0.15, 0.20, 0.15, 0.10, 0.10, 0.05, 0.05];
      const overallScore = Math.round(sections.reduce((sum, s, i) => sum + s.score * weights[i], 0));
      const overallGrade = gradeFromScore(overallScore);

      res.json({ overallScore, overallGrade, sections, scoredAt: Date.now() });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/settings", async (req: Request, res: Response) => {
    const userId = uid(req);
    const settings = await storage.getUserSettings(userId);
    res.json(settings ? redactSettings(settings) : { userId, autoTrade: false, notifications: true, riskMode: "moderate", brokerType: "demo" });
  });

  // Only preference fields can be written here. Credentials go through the
  // test-* endpoints, which verify them before saving.
  const WRITABLE_SETTINGS = [
    "notifications", "autoTrade", "riskMode", "theme", "tradingInstruments", "tradingTimezone",
    "activeSessions", "offHoursBehavior", "offHoursRiskReduction", "selectedAiProvider",
    "emailAddress", "emailNotifications", "smtpHost", "smtpPort", "smtpUser", "smtpPass",
  ] as const;

  app.post("/api/settings", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const patch: Record<string, any> = { userId };
      for (const f of WRITABLE_SETTINGS) {
        if (!(f in req.body)) continue;
        // Blank secret means "keep the saved one" — the UI never receives it back
        if (f === "smtpPass" && !req.body[f]) continue;
        patch[f] = req.body[f];
      }
      if (patch.offHoursRiskReduction != null) {
        patch.offHoursRiskReduction = Math.min(100, Math.max(0, parseInt(patch.offHoursRiskReduction) || 0));
      }
      const settings = await storage.upsertUserSettings(patch as any);
      res.json(redactSettings(settings));
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // TradingView webhook secret — shown only to its owner, rotatable
  app.get("/api/settings/webhook", async (req: Request, res: Response) => {
    const userId = uid(req);
    let s = await storage.getUserSettings(userId);
    if (!s?.webhookToken) s = await storage.upsertUserSettings({ userId, webhookToken: randomToken() } as any);
    res.json({ token: s.webhookToken, url: "/api/webhook/tradingview" });
  });

  app.post("/api/settings/webhook/rotate", async (req: Request, res: Response) => {
    const s = await storage.upsertUserSettings({ userId: uid(req), webhookToken: randomToken() } as any);
    res.json({ token: s.webhookToken, url: "/api/webhook/tradingview" });
  });

  // --- Integration Status (all integrations at once) ---
  app.get("/api/settings/status", async (req: Request, res: Response) => {
    const userId = uid(req);
    const s = await storage.getUserSettings(userId);
    res.json({
      broker: {
        connected: s?.brokerConnected ?? false,
        connectedAt: s?.brokerConnectedAt ?? null,
        brokerType: s?.brokerType ?? "demo",
        account: s?.mql5Account ?? null,
      },
      tradingview: {
        connected: s?.tradingviewConnected ?? false,
        connectedAt: s?.tradingviewConnectedAt ?? null,
        username: s?.tradingViewUser ?? null,
      },
      ai: {
        selectedProvider: s?.selectedAiProvider ?? "none",
        openai: { connected: s?.openaiConnected ?? false, connectedAt: s?.openaiConnectedAt ?? null, hasKey: !!(s?.openaiApiKey) },
        anthropic: { connected: s?.anthropicConnected ?? false, connectedAt: s?.anthropicConnectedAt ?? null, hasKey: !!(s?.anthropicApiKey) },
        gemini: { connected: s?.geminiConnected ?? false, connectedAt: s?.geminiConnectedAt ?? null, hasKey: !!(s?.geminiApiKey) },
        groq: { connected: s?.groqConnected ?? false, connectedAt: s?.groqConnectedAt ?? null, hasKey: !!(s?.groqApiKey) },
        xai: { connected: s?.xaiConnected ?? false, connectedAt: s?.xaiConnectedAt ?? null, hasKey: !!(s?.xaiApiKey) },
        perplexity: { connected: s?.perplexityConnected ?? false, connectedAt: s?.perplexityConnectedAt ?? null, hasKey: !!(s?.perplexityApiKey) },
      },
    });
  });

  // --- Onboarding Status (server-side gate) ---
  app.get("/api/settings/onboarding-status", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.json({ completed: false });
    const s = await storage.getUserSettings(userId);
    // Auto-complete for users who already have a broker or AI connected
    const alreadySetup = s?.brokerConnected || s?.openaiConnected || s?.anthropicConnected ||
      s?.geminiConnected || s?.groqConnected || s?.xaiConnected || s?.perplexityConnected;
    if (alreadySetup && !s?.onboardingCompleted) {
      await storage.upsertUserSettings({ userId, onboardingCompleted: true } as any);
      return res.json({ completed: true });
    }
    res.json({ completed: s?.onboardingCompleted ?? false });
  });

  app.post("/api/settings/complete-onboarding", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    await storage.upsertUserSettings({ userId, onboardingCompleted: true } as any);
    res.json({ ok: true });
  });

  // --- Test TradingView Username ---
  app.post("/api/settings/test-tradingview", async (req: Request, res: Response) => {
    const userId = uid(req);
    const { username } = req.body;
    const uname = username || (await storage.getUserSettings(userId))?.tradingViewUser;

    if (!uname || uname.trim().length < 2) {
      return res.json({ connected: false, message: "Please enter a TradingView username." });
    }

    try {
      const r = await fetch(`https://www.tradingview.com/u/${encodeURIComponent(uname.trim())}/`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      if (r.ok && r.url.includes(`/u/${uname.trim()}`)) {
        await storage.upsertUserSettings({
          userId,
          tradingViewUser: uname.trim(),
          tradingviewConnected: true,
          tradingviewConnectedAt: new Date(),
        } as any);
        return res.json({ connected: true, message: `TradingView profile found for @${uname.trim()}.`, username: uname.trim() });
      } else if (r.status === 404) {
        return res.json({ connected: false, message: `No TradingView account found for "${uname}". Check the spelling.` });
      } else {
        await storage.upsertUserSettings({
          userId,
          tradingViewUser: uname.trim(),
          tradingviewConnected: true,
          tradingviewConnectedAt: new Date(),
        } as any);
        return res.json({ connected: true, message: `TradingView username @${uname.trim()} saved and linked.`, username: uname.trim() });
      }
    } catch {
      return res.json({ connected: false, message: "Could not reach TradingView. Check your connection." });
    }
  });

  // --- Test AI Provider (unified — real HTTPS calls to each provider) ---
  app.post("/api/settings/test-ai", async (req: Request, res: Response) => {
    const userId = uid(req);
    const { provider, apiKey } = req.body;

    if (!provider || !apiKey?.trim()) {
      return res.json({ connected: false, message: "Provider and API key are required." });
    }

    const key = apiKey.trim();

    try {
      let connected = false;
      let message = "";
      let model = "";
      const settingsPatch: any = { userId, selectedAiProvider: provider };

      if (provider === "openai") {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { "Authorization": `Bearer ${key}` },
        });
        if (r.ok) {
          const data: any = await r.json();
          const models = data?.data?.map((m: any) => m.id).filter((id: string) => id.includes("gpt")) ?? [];
          model = models.find((m: string) => m.includes("gpt-4o")) || models[0] || "gpt-3.5-turbo";
          connected = true; message = `OpenAI connected. ${models.length} GPT models available. Using ${model}.`;
          settingsPatch.openaiApiKey = key; settingsPatch.openaiConnected = true; settingsPatch.openaiConnectedAt = new Date();
        } else {
          const err: any = await r.json().catch(() => ({}));
          message = err?.error?.message || "Invalid OpenAI API key.";
        }

      } else if (provider === "anthropic") {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-3-haiku-20240307", max_tokens: 5, messages: [{ role: "user", content: "ping" }] }),
        });
        if (r.ok) {
          model = "claude-3-haiku-20240307";
          connected = true; message = `Anthropic Claude connected. Using ${model}.`;
          settingsPatch.anthropicApiKey = key; settingsPatch.anthropicConnected = true; settingsPatch.anthropicConnectedAt = new Date();
        } else {
          const err: any = await r.json().catch(() => ({}));
          message = err?.error?.message || "Invalid Anthropic API key.";
        }

      } else if (provider === "gemini") {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
        if (r.ok) {
          const data: any = await r.json();
          const models = data?.models?.map((m: any) => m.name) ?? [];
          model = models.find((m: string) => m.includes("gemini-1.5")) || models[0] || "gemini-1.5-flash";
          connected = true; message = `Google Gemini connected. ${models.length} models available. Using ${model.replace("models/", "")}.`;
          settingsPatch.geminiApiKey = key; settingsPatch.geminiConnected = true; settingsPatch.geminiConnectedAt = new Date();
        } else {
          const err: any = await r.json().catch(() => ({}));
          message = err?.error?.message || "Invalid Google Gemini API key.";
        }

      } else if (provider === "groq") {
        const r = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { "Authorization": `Bearer ${key}` },
        });
        if (r.ok) {
          const data: any = await r.json();
          const models = data?.data?.map((m: any) => m.id) ?? [];
          model = models.find((m: string) => m.includes("llama")) || models[0] || "llama-3.1-70b";
          connected = true; message = `Groq connected. ${models.length} models available. Using ${model}.`;
          settingsPatch.groqApiKey = key; settingsPatch.groqConnected = true; settingsPatch.groqConnectedAt = new Date();
        } else {
          const err: any = await r.json().catch(() => ({}));
          message = err?.error?.message || "Invalid Groq API key.";
        }

      } else if (provider === "xai") {
        const r = await fetch("https://api.x.ai/v1/models", {
          headers: { "Authorization": `Bearer ${key}` },
        });
        if (r.ok) {
          const data: any = await r.json();
          const models = data?.data?.map((m: any) => m.id) ?? [];
          model = models.find((m: string) => m.includes("grok-2")) || models[0] || "grok-2-latest";
          connected = true; message = `Grok by xAI connected. ${models.length} models available. Using ${model}.`;
          settingsPatch.xaiApiKey = key; settingsPatch.xaiConnected = true; settingsPatch.xaiConnectedAt = new Date();
        } else {
          const err: any = await r.json().catch(() => ({}));
          message = err?.error?.message || "Invalid xAI API key.";
        }

      } else if (provider === "perplexity") {
        const r = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "llama-3.1-sonar-small-128k-online", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
        });
        if (r.ok) {
          model = "llama-3.1-sonar-small-128k-online";
          connected = true; message = `Perplexity AI connected. Using ${model}.`;
          settingsPatch.perplexityApiKey = key; settingsPatch.perplexityConnected = true; settingsPatch.perplexityConnectedAt = new Date();
        } else {
          const err: any = await r.json().catch(() => ({}));
          message = err?.error?.message || "Invalid Perplexity API key.";
        }

      } else {
        return res.json({ connected: false, message: "Unknown provider." });
      }

      if (connected) {
        await storage.upsertUserSettings(settingsPatch);
      }

      return res.json({ connected, message, model, provider });
    } catch (e: any) {
      return res.json({ connected: false, message: `Connection error: ${e.message || "Network unreachable"}` });
    }
  });

  // Keep legacy endpoint for backward compat
  app.post("/api/settings/test-perplexity", async (req: Request, res: Response) => {
    req.body.provider = "perplexity";
    req.body.apiKey = req.body.apiKey || req.body.key;
    return res.redirect(307, "/api/settings/test-ai");
  });

  // --- Update Account Balance Only ---
  app.post("/api/settings/balance", async (req: Request, res: Response) => {
    const userId = uid(req);
    const { brokerBalance } = req.body;
    const parsed = brokerBalance ? parseFloat(brokerBalance) : null;
    if (!parsed || parsed <= 0) return res.status(400).json({ message: "Enter a valid balance greater than 0." });
    await storage.upsertUserSettings({ userId, brokerBalance: parsed } as any);
    return res.json({ success: true, brokerBalance: parsed });
  });

  // --- Test Broker Connection ---
  app.post("/api/settings/test-broker", async (req: Request, res: Response) => {
    const userId = uid(req);
    const { brokerType, mql5Account, mql5Password, brokerServer, brokerApiKey, brokerBalance } = req.body;
    const parsedBalance = brokerBalance ? parseFloat(brokerBalance) : null;

    if (brokerType === "demo") {
      await storage.upsertUserSettings({
        userId,
        brokerType: "demo",
        brokerConnected: true,
        brokerConnectedAt: new Date(),
        brokerBalance: String(parsedBalance && parsedBalance > 0 ? parsedBalance : 10000),
      } as any);
      const bal = parsedBalance && parsedBalance > 0 ? parsedBalance.toLocaleString() : "10,000";
      return res.json({ connected: true, message: `Demo account active. $${bal} virtual balance ready.`, mode: "demo" });
    }

    const existing = await storage.getUserSettings(userId);

    // MT5 trades go through a user-run REST bridge; "connected" only if it answers
    if (brokerType === "mql5") {
      const bridgeUrl = String(brokerServer || existing?.brokerServer || "").trim();
      if (!/^https?:\/\//i.test(bridgeUrl) || !isSafeOutboundHost(bridgeUrl)) {
        return res.json({ connected: false, message: "Enter your MT5 bridge URL (e.g. https://your-bridge.example.com). MT5 has no direct cloud API — orders go through a bridge running next to your terminal." });
      }
      const test = await testMT5Bridge(bridgeUrl);
      if (!test.connected) return res.json({ connected: false, message: `MT5 bridge did not respond: ${test.message}` });
      const info = await getMT5AccountInfo(bridgeUrl);
      await storage.upsertUserSettings({
        userId, brokerType, mql5Account: mql5Account || info?.login || null,
        ...(mql5Password ? { mql5Password } : {}),
        brokerServer: bridgeUrl, brokerConnected: true, brokerConnectedAt: new Date(),
        brokerBalance: info?.balance || (parsedBalance && parsedBalance > 0 ? parsedBalance : existing?.brokerBalance ?? 10000),
      } as any);
      return res.json({ connected: true, message: test.message, mode: "live" });
    }

    if (brokerType === "oanda") {
      const key = brokerApiKey || existing?.brokerApiKey;
      if (!key) return res.json({ connected: false, message: "Please enter your OANDA API key." });
      const acct = await getOandaAccountId(key);
      if (!acct) return res.json({ connected: false, message: "OANDA authentication failed. Check your API key." });
      await storage.upsertUserSettings({
        userId, brokerType, brokerApiKey: key, brokerAccountId: acct.accountId,
        brokerServer: acct.environment, brokerConnected: true, brokerConnectedAt: new Date(),
        ...(acct.balance ? { brokerBalance: acct.balance } : {}),
      } as any);
      const modeLabel = acct.environment === "live" ? "LIVE (real money)" : "practice (paper money)";
      return res.json({ connected: true, message: `OANDA ${modeLabel} account ${acct.accountId} connected.`, mode: acct.environment, accountId: acct.accountId });
    }

    return res.json({ connected: false, message: "Unsupported broker type. Supported: demo, OANDA, MT5 bridge." });
  });

  // ── Price Alerts ────────────────────────────────────────────────────────────
  app.get("/api/alerts", async (req: Request, res: Response) => {
    const userId = uid(req);
    const alerts = await storage.getAlerts(userId);
    res.json(alerts);
  });

  app.post("/api/alerts", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const data = insertPriceAlertSchema.parse({ ...req.body, userId });
      const alert = await storage.createAlert(data);
      res.json(alert);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/alerts/:id", async (req: Request, res: Response) => {
    const userId = uid(req);
    await storage.deleteAlert(req.params.id, userId);
    res.json({ ok: true });
  });

  // ── Notifications ───────────────────────────────────────────────────────────
  app.get("/api/notifications", async (req: Request, res: Response) => {
    const userId = uid(req);
    const notifs = await storage.getNotifications(userId, 30);
    const unread = await storage.getUnreadCount(userId);
    res.json({ notifications: notifs, unread });
  });

  app.post("/api/notifications/:id/read", async (req: Request, res: Response) => {
    const userId = uid(req);
    await storage.markNotificationRead(req.params.id, userId);
    res.json({ ok: true });
  });

  app.post("/api/notifications/read-all", async (req: Request, res: Response) => {
    const userId = uid(req);
    await storage.markAllNotificationsRead(userId);
    res.json({ ok: true });
  });

  // ── Web Push Notifications ──────────────────────────────────────────────────
  app.get("/api/push/vapid-public-key", (_req: Request, res: Response) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
  });

  app.post("/api/push/subscribe", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription object" });
      }
      await saveSubscription(userId, { endpoint, keys });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/push/unsubscribe", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const { endpoint } = req.body;
      if (endpoint) await removeSubscription(userId, endpoint);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/push/test", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const sent = await sendPushToUser(userId, {
        title: "📊 TradeAI Connected",
        body: "Push notifications are working! You'll receive trade alerts and signals here.",
        tag: "test",
        data: { url: "/" },
      });
      res.json({ ok: true, sent: sent ?? 0 });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Economic Calendar ───────────────────────────────────────────────────────
  app.get("/api/calendar", async (_req: Request, res: Response) => {
    try {
      const events = await fetchEconomicCalendar();
      res.json(events);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Portfolio Risk ──────────────────────────────────────────────────────────
  app.get("/api/portfolio/risk", async (req: Request, res: Response) => {
    const userId = uid(req);
    const [openPositions, closedPositions, strategy, settings] = await Promise.all([
      storage.getOpenPositions(userId), storage.getClosedPositions(userId),
      storage.getActiveStrategy(userId), storage.getUserSettings(userId),
    ]);
    const prices = await fetchLivePrices().catch(() => ({} as Record<string, LivePrice>));

    const startingBalance = settings?.brokerBalance ? Number(settings.brokerBalance) : 10000;
    const accountBalance = startingBalance + closedPositions.reduce((s, p) => s + (p.profit || 0), 0);

    const exposure = openPositions.map(p => {
      const side = normalizeSide(p.type);
      const quote = prices[p.symbol];
      const currentPrice = isTradablePrice(quote) ? (side === "BUY" ? quote.bid : quote.ask) : (p.currentPrice ?? p.entryPrice);
      const unrealized = calcProfit(side, p.entryPrice, currentPrice, p.symbol, p.size);
      // Loss if the stop is hit (0 when no stop — reported separately as unbounded)
      const maxLoss = p.stopLoss != null ? Math.max(0, -calcProfit(side, p.entryPrice, p.stopLoss, p.symbol, p.size)) : 0;
      return { id: p.id, symbol: p.symbol, type: side, size: p.size, entryPrice: p.entryPrice, currentPrice, unrealized, maxLoss, hasStop: p.stopLoss != null };
    });

    const totalUnrealized = exposure.reduce((s, e) => s + e.unrealized, 0);
    const totalMaxLoss = exposure.reduce((s, e) => s + e.maxLoss, 0);

    res.json({
      accountBalance: parseFloat(accountBalance.toFixed(2)),
      equity: parseFloat((accountBalance + totalUnrealized).toFixed(2)),
      totalUnrealized: parseFloat(totalUnrealized.toFixed(2)),
      totalMaxLoss: parseFloat(totalMaxLoss.toFixed(2)),
      exposurePct: accountBalance > 0 ? parseFloat(((totalMaxLoss / accountBalance) * 100).toFixed(2)) : 0,
      unprotectedPositions: exposure.filter(e => !e.hasStop).length,
      openCount: openPositions.length,
      maxPositions: strategy?.maxPositions || 3,
      positions: exposure,
    });
  });

  // ── Flatten all positions (emergency) ───────────────────────────────────────
  app.post("/api/portfolio/flatten", async (req: Request, res: Response) => {
    const userId = uid(req);
    const result = await closeAllFor(userId);
    await storage.createNotification({
      userId, type: "trade", title: "Emergency flatten",
      message: `${result.closed} position(s) closed.${result.failed.length ? ` ${result.failed.length} could not be closed: ${result.failed.map(f => f.symbol).join(", ")}.` : ""}`,
      read: false,
    });
    res.json(result);
  });

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  app.get("/api/leaderboard", async (_req: Request, res: Response) => {
    try {
      const board = await storage.getLeaderboard();
      res.json(board);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // A trader's public strategy settings (for copy trading). Account size is private.
  app.get("/api/leaderboard/:userId/strategy", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const strategy = await storage.getActiveStrategy(userId);
      if (!strategy) return res.status(404).json({ message: "No active strategy found for this trader." });
      const user = await storage.getUser(userId);
      const { accountSize: _private, ...shareable } = strategy;
      res.json({ ...shareable, username: user?.username });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Copy another trader's strategy
  app.post("/api/strategy/copy", async (req: Request, res: Response) => {
    const myUserId = uid(req);
    const { fromUserId } = req.body;
    if (!fromUserId) return res.status(400).json({ message: "fromUserId required" });
    try {
      const sourceStrategy = await storage.getActiveStrategy(fromUserId);
      if (!sourceStrategy) return res.status(404).json({ message: "No active strategy to copy." });
      const sourceUser = await storage.getUser(fromUserId);
      const myAccountSize = (await storage.getActiveStrategy(myUserId))?.accountSize ?? 10000;
      await storage.deactivateAllStrategies(myUserId);
      const copied = await storage.createStrategy({
        userId: myUserId,
        name: `${sourceUser?.username ?? "Trader"}'s Strategy (Copied)`,
        goal: sourceStrategy.goal,
        style: sourceStrategy.style,
        description: `Copied from ${sourceUser?.username ?? "another trader"}. Original: ${sourceStrategy.description || ""}`,
        riskPercent: sourceStrategy.riskPercent,
        maxPositions: sourceStrategy.maxPositions,
        rrRatio: sourceStrategy.rrRatio,
        accountSize: myAccountSize, // sizing follows your account, not theirs
        isActive: true,
      });
      res.json({ success: true, strategy: copied });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Historical backtest on real candles ────────────────────────────────────
  const historicalSchema = z.object({
    symbol: z.string().regex(/^[A-Z]{6}$/),
    timeframe: z.enum(["15min", "1h", "4h", "1day"]),
    periods: z.number().int().min(200).max(4900).default(2000),
    strategy: z.enum(["trend_follow", "mean_revert", "breakout"]),
    riskPercent: z.number().min(0.1).max(5),
    rrRatio: z.number().min(0.5).max(10),
  });
  app.post("/api/backtest/historical", async (req: Request, res: Response) => {
    try {
      const key = process.env.TWELVE_DATA_API_KEY;
      if (!key) return res.status(503).json({ message: "Market data is not configured (TWELVE_DATA_API_KEY)." });
      const p = historicalSchema.parse(req.body);
      const settings = await storage.getUserSettings(uid(req));
      const result = await runBacktest({ ...p, accountSize: Number(settings?.brokerBalance) || 10000, apiKey: key });
      res.json({ ...result, trades: result.trades.slice(-200) });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Risk-of-ruin simulator (Monte Carlo on an assumed win rate) ─────────────
  app.post("/api/backtest", async (req: Request, res: Response) => {
    const { winRate = 55, riskPercent = 2, rrRatio = 2.5 } = req.body;

    const wr = Math.min(99, Math.max(1, Number(winRate) || 55)) / 100;
    const risk = Math.min(10, Math.max(0.1, Number(riskPercent) || 2)) / 100;
    const rr = Math.min(10, Math.max(0.1, Number(rrRatio) || 2.5));
    // Bounded so one request can't tie up the server
    const numTrades = Math.min(1000, Math.max(10, Math.floor(Number(req.body.numTrades) || 100)));
    const numPaths = Math.min(1000, Math.max(10, Math.floor(Number(req.body.numPaths) || 200)));
    const startBalance = Math.min(1e9, Math.max(100, Number(req.body.startBalance) || 10000));

    const paths: number[][] = [];
    const finalBalances: number[] = [];

    for (let path = 0; path < numPaths; path++) {
      let balance = startBalance;
      const equity = [balance];
      for (let trade = 0; trade < numTrades; trade++) {
        const win = Math.random() < wr;
        const riskAmount = balance * risk;
        balance += win ? riskAmount * rr : -riskAmount;
        if (balance < 0) { balance = 0; break; }
        equity.push(parseFloat(balance.toFixed(2)));
      }
      paths.push(equity);
      finalBalances.push(balance);
    }

    finalBalances.sort((a, b) => a - b);
    const profitablePaths = finalBalances.filter(b => b > startBalance).length;
    const medianFinal = finalBalances[Math.floor(numPaths / 2)];
    const p10 = finalBalances[Math.floor(numPaths * 0.1)];
    const p90 = finalBalances[Math.floor(numPaths * 0.9)];

    const expectancy = (wr * rr) - (1 - wr);
    const profitFactor = (wr * rr) / (1 - wr);

    // ── Risk of Ruin at 30%, 50%, 80% drawdown thresholds ──────────────────────
    const ruinAt30 = finalBalances.filter(b => b <= startBalance * 0.70).length;
    const ruinAt50 = finalBalances.filter(b => b <= startBalance * 0.50).length;
    const ruinAt80 = finalBalances.filter(b => b <= startBalance * 0.20).length;

    // Max drawdown across all paths
    let worstDrawdownPct = 0;
    for (const path of paths) {
      let peak = path[0];
      for (const pt of path) {
        if (pt > peak) peak = pt;
        const dd = peak > 0 ? ((peak - pt) / peak) * 100 : 0;
        if (dd > worstDrawdownPct) worstDrawdownPct = dd;
      }
    }

    res.json({
      paths: paths.slice(0, 20),
      stats: {
        expectancy: parseFloat(expectancy.toFixed(3)),
        profitFactor: parseFloat(profitFactor.toFixed(2)),
        winProbability: Math.round((profitablePaths / numPaths) * 100),
        medianFinal: parseFloat(medianFinal.toFixed(2)),
        worstCase: parseFloat(p10.toFixed(2)),
        bestCase: parseFloat(p90.toFixed(2)),
        medianReturn: parseFloat(((medianFinal - startBalance) / startBalance * 100).toFixed(1)),
        ruin: {
          at30pct: Math.round((ruinAt30 / numPaths) * 100),
          at50pct: Math.round((ruinAt50 / numPaths) * 100),
          at80pct: Math.round((ruinAt80 / numPaths) * 100),
          worstDrawdownPct: parseFloat(worstDrawdownPct.toFixed(1)),
        },
      },
    });
  });

  // --- Watchlist ---
  app.get("/api/watchlist", async (req: Request, res: Response) => {
    const userId = uid(req);
    const items = await storage.getWatchlist(userId);
    res.json(items.map(i => i.symbol));
  });

  app.post("/api/watchlist", async (req: Request, res: Response) => {
    const userId = uid(req);
    const { symbols } = req.body;
    if (!Array.isArray(symbols)) return res.status(400).json({ message: "symbols must be an array" });
    await storage.setWatchlist(userId, symbols);
    res.json({ ok: true });
  });

  app.post("/api/watchlist/add", async (req: Request, res: Response) => {
    const userId = uid(req);
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ message: "symbol required" });
    const item = await storage.addToWatchlist({ userId, symbol: symbol.toUpperCase() });
    res.json(item);
  });

  app.delete("/api/watchlist/:symbol", async (req: Request, res: Response) => {
    const userId = uid(req);
    await storage.removeFromWatchlist(userId, req.params.symbol.toUpperCase());
    res.json({ ok: true });
  });

  // --- Trade Journal ---
  app.get("/api/journal", async (req: Request, res: Response) => {
    const userId = uid(req);
    const entries = await storage.getTradeJournal(userId);
    res.json(entries);
  });

  app.post("/api/journal", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const data = insertTradeJournalSchema.parse({ ...req.body, userId });
      const entry = await storage.createTradeJournalEntry(data);
      res.json(entry);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/journal/:id", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const entry = await storage.updateTradeJournalEntry(req.params.id, userId, req.body);
      if (!entry) return res.status(404).json({ message: "Not found" });
      res.json(entry);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/journal/:id", async (req: Request, res: Response) => {
    const userId = uid(req);
    await storage.deleteTradeJournalEntry(req.params.id, userId);
    res.json({ ok: true });
  });

  // ── CSV Export ─────────────────────────────────────────────────────────────

  app.get("/api/export/journal", async (req: Request, res: Response) => {
    const userId = uid(req);
    const entries = await storage.getTradeJournal(userId);
    const header = "Date,Symbol,Direction,Entry,Exit,Lots,SL,TP,Pips,P&L,Emotion,Notes,Mode,Outcome";
    const rows = entries.map(e => [
      e.openedAt ? new Date(e.openedAt).toISOString().split("T")[0] : "",
      e.symbol, e.direction, e.entryPrice, e.exitPrice ?? "",
      e.lots, e.stopLoss ?? "", e.takeProfit ?? "",
      e.pips ?? "", e.profitLoss ?? "",
      e.emotion ?? "", `"${(e.notes ?? "").replace(/"/g, "'")}"`,
      e.mode, e.outcome ?? "",
    ].join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=trade_journal.csv");
    res.send(header + "\n" + rows);
  });

  app.get("/api/export/analytics", async (req: Request, res: Response) => {
    const userId = uid(req);
    const history = await storage.getClosedPositions(userId);
    const header = "Date,Symbol,Type,Size,EntryPrice,ExitPrice,P&L,AISignal";
    const rows = history.map(p => [
      p.closedAt ? new Date(p.closedAt).toISOString().split("T")[0] : "",
      p.symbol, p.type, p.size, p.entryPrice,
      p.currentPrice ?? "", p.profit ?? "", p.aiSignal ? "yes" : "no",
    ].join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=trade_history.csv");
    res.send(header + "\n" + rows);
  });


  // ── Multi-timeframe candles ────────────────────────────────────────────────

  app.get("/api/candles/:symbol", async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.TWELVE_DATA_API_KEY || "";
      if (!apiKey) return res.json({ h1: [], h4: [], d1: [], error: "No API key" });
      const candles = await fetchCandlesForAI(req.params.symbol, apiKey);
      res.json(candles);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── TradingView Webhook ────────────────────────────────────────────────────

  app.post("/api/webhook/tradingview", async (req: Request, res: Response) => {
    try {
      const { token, action, symbol, price, sl, tp, message } = req.body ?? {};
      if (typeof token !== "string" || token.length < 32 || !action || !symbol) {
        return res.status(400).json({ message: "token, action, symbol required" });
      }
      // Token is a random per-user secret from Settings → TradingView (indexed lookup)
      const owner = await storage.getUserSettingsByWebhookToken(token);
      if (!owner) return res.status(401).json({ message: "Invalid webhook token" });
      const act = String(action).toUpperCase();
      if (!["BUY", "SELL", "STRONG BUY", "STRONG SELL"].includes(act)) {
        return res.status(400).json({ message: "action must be BUY or SELL" });
      }
      const sym = String(symbol).toUpperCase().replace("/", "");
      if (!/^[A-Z0-9]{3,10}$/.test(sym)) return res.status(400).json({ message: "Invalid symbol" });
      const signal = await storage.createSignal({
        userId: owner.userId,
        symbol: sym,
        action: act,
        confidence: 0, // external alert — no model confidence
        reasoning: String(message || `TradingView alert: ${act} ${sym}${price ? ` at ${price}` : ""}`).slice(0, 500),
        entryPrice: parseFloat(price) || null,
        stopLoss: sl ? parseFloat(sl) : null,
        takeProfit: tp ? parseFloat(tp) : null,
        size: 0.1,
        status: "pending",
        source: "tradingview",
      });
      res.json({ ok: true, signalId: signal.id });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Strategy Marketplace ──────────────────────────────────────────────────

  app.get("/api/marketplace", async (req: Request, res: Response) => {
    const listings = await storage.getMarketplaceListings();
    res.json(listings);
  });

  app.get("/api/marketplace/:id", async (req: Request, res: Response) => {
    const listing = await storage.getMarketplaceListing(req.params.id);
    if (!listing) return res.status(404).json({ message: "Not found" });
    res.json(listing);
  });

  app.post("/api/marketplace", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Login required" });
      const user = await storage.getUser(userId);
      const data = insertMarketplaceSchema.parse({ ...req.body, authorId: userId, authorName: user?.username || "Anonymous" });
      const listing = await storage.createMarketplaceListing(data);
      res.json(listing);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/marketplace/:id/vote", async (req: Request, res: Response) => {
    const userId = uid(req);
    await storage.voteMarketplace(req.params.id, userId);
    const listing = await storage.getMarketplaceListing(req.params.id);
    res.json({ upvotes: listing?.upvotes ?? 0 });
  });

  app.post("/api/marketplace/:id/copy", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const listing = await storage.getMarketplaceListing(req.params.id);
      if (!listing) return res.status(404).json({ message: "Not found" });
      await storage.deactivateAllStrategies(userId);
      const strategyData = listing.strategyData ? JSON.parse(listing.strategyData) : {};
      await storage.createStrategy({
        userId,
        name: `${listing.title} (Copy)`,
        goal: strategyData.goal || "profit",
        style: listing.style,
        description: listing.description,
        riskPercent: listing.riskPercent,
        maxPositions: strategyData.maxPositions || 3,
        rrRatio: strategyData.rrRatio || 2,
        accountSize: strategyData.accountSize || 10000,
        isActive: true,
      });
      await storage.incrementCopyCount(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/marketplace/:id", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Login required" });
    await storage.deleteMarketplaceListing(req.params.id, userId);
    res.json({ ok: true });
  });

  // ── Public Profile / Shareable Card ───────────────────────────────────────

  app.get("/api/profile/:username", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername(req.params.username);
      if (!user) return res.status(404).json({ message: "User not found" });
      const closed = await storage.getClosedPositions(user.id);
      const open = await storage.getOpenPositions(user.id);
      const wins = closed.filter(p => p.profit > 0);
      const losses = closed.filter(p => p.profit <= 0);
      const totalPL = parseFloat(closed.reduce((s, p) => s + (p.profit || 0), 0).toFixed(2));
      const winRate = closed.length ? parseFloat(((wins.length / closed.length) * 100).toFixed(1)) : 0;
      const totalWin = wins.reduce((s, p) => s + p.profit, 0);
      const totalLoss = Math.abs(losses.reduce((s, p) => s + p.profit, 0));
      const profitFactor = totalLoss > 0 ? parseFloat((totalWin / totalLoss).toFixed(2)) : 0;
      const avgWin = wins.length ? parseFloat((totalWin / wins.length).toFixed(2)) : 0;
      const avgLoss = losses.length ? parseFloat((totalLoss / losses.length).toFixed(2)) : 0;
      const bySymbol: Record<string, { pl: number; trades: number }> = {};
      for (const p of closed) {
        if (!bySymbol[p.symbol]) bySymbol[p.symbol] = { pl: 0, trades: 0 };
        bySymbol[p.symbol].pl += p.profit || 0;
        bySymbol[p.symbol].trades++;
      }
      const recent = closed.slice(0, 10).map(p => ({
        symbol: p.symbol, type: p.type, profit: p.profit, closedAt: p.closedAt,
      }));
      res.json({
        username: user.username,
        stats: { totalPL, winRate, profitFactor, totalTrades: closed.length, wins: wins.length, losses: losses.length, avgWin, avgLoss },
        openPositions: open.length,
        bySymbol: Object.entries(bySymbol).map(([symbol, d]) => ({ symbol, ...d, pl: parseFloat(d.pl.toFixed(2)) })).sort((a, b) => b.pl - a.pl),
        recentTrades: recent,
        joinedAt: user.createdAt,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Email notifications ────────────────────────────────────────────────────

  app.post("/api/email/test", async (req: Request, res: Response) => {
    const userId = uid(req);
    const settings = await storage.getUserSettings(userId);
    const to = req.body.email || settings?.emailAddress;
    if (!to) return res.status(400).json({ message: "No email address provided" });
    const result = await sendEmail(settings as any, to, "TradeAI: Email test", tradeAlertHtml("Test Email", "Your email notifications are working correctly!", undefined));
    res.json({ ok: result.sent, message: result.error || (result.sent ? "Test email sent successfully!" : "Send failed"), ...result });
  });

  app.post("/api/email/verify-smtp", async (req: Request, res: Response) => {
    if (!isSafeOutboundHost(req.body?.smtpHost)) return res.json({ ok: false, message: "That SMTP host is not allowed." });
    const result = await verifySmtp(req.body);
    res.json(result);
  });

  // ── MT5 Bridge ─────────────────────────────────────────────────────────────

  app.post("/api/broker/mt5/test", async (req: Request, res: Response) => {
    const { bridgeUrl } = req.body;
    if (!bridgeUrl || !/^https?:\/\//i.test(bridgeUrl) || !isSafeOutboundHost(bridgeUrl)) return res.status(400).json({ message: "bridgeUrl must be a public http(s) URL" });
    const result = await testMT5Bridge(bridgeUrl);
    res.json(result);
  });

  // ── AI Knowledge Base ───────────────────────────────────────────────────────

  app.get("/api/ai/knowledge", async (req: Request, res: Response) => {
    try {
      res.json(await getAllKnowledge(uid(req)));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ai/reviews", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
      res.json(await getTradeReviews(uid(req), limit));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ai/reviews/:positionId", async (req: Request, res: Response) => {
    try {
      const review = await getTradeReviewByPosition(req.params.positionId);
      if (!review || review.userId !== uid(req)) return res.status(404).json({ message: "No review yet" });
      res.json(review);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/ai/reviews/:positionId/generate", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const position = await storage.getPositionById(req.params.positionId);
      if (!position || position.userId !== userId) return res.status(404).json({ message: "Position not found" });
      if (position.status !== "closed") return res.status(400).json({ message: "Position must be closed" });
      const side = normalizeSide(position.type);
      generateTradeReview({
        userId,
        positionId: position.id,
        symbol: position.symbol,
        direction: side === "BUY" ? "long" : "short",
        entryPrice: position.entryPrice,
        exitPrice: position.currentPrice ?? position.entryPrice,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        profit: position.profit,
        lots: position.size,
        openedAt: position.openedAt ? new Date(position.openedAt) : new Date(),
        closedAt: position.closedAt ? new Date(position.closedAt) : new Date(),
        aiSignal: position.aiSignal,
        exitReason: "manual",
      }).catch(() => {});
      res.json({ message: "Review generation started" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ai/weekly-report", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const report = await generateWeeklyReport(userId);
      res.json({ report: report ?? "No trades this week to analyze." });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Risk Dashboard ──────────────────────────────────────────────────────────

  app.get("/api/risk/dashboard", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const dashboard = await getRiskDashboard(userId);
      res.json(dashboard);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/risk/limits", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const num = (v: any, min: number, max: number) => v == null || v === "" ? undefined : Math.min(max, Math.max(min, Number(v)));
      const b = req.body ?? {};
      // Pausing/resuming goes through /api/risk/resume; only limits are editable here
      const updated = await updateRiskLimits(userId, {
        dailyLossLimit: num(b.dailyLossLimit, 1, 1e9),
        maxDrawdownLimit: num(b.maxDrawdownLimit, 1, 1e9),
        maxOpenPositions: num(b.maxOpenPositions, 1, 50),
        maxPositionSize: num(b.maxPositionSize, 0.01, 50),
        trailingStopEnabled: typeof b.trailingStopEnabled === "boolean" ? b.trailingStopEnabled : undefined,
        trailingStopPips: num(b.trailingStopPips, 1, 5000),
        weeklyReportEnabled: typeof b.weeklyReportEnabled === "boolean" ? b.weeklyReportEnabled : undefined,
      });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/risk/resume", async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      await resumeTrading(userId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Forex News ────────────────────────────────────────────────────────────
  app.get("/api/news/forex", async (req: Request, res: Response) => {
    try {
      const instrumentsParam = req.query.instruments as string | undefined;
      const instruments = instrumentsParam ? instrumentsParam.split(",").map(s => s.trim()).filter(Boolean) : undefined;
      const articles = await getForexNews(instruments);
      res.json(articles);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/news/sentiment", async (req: Request, res: Response) => {
    try {
      const { title, summary, currencies } = req.body;
      if (!title) return res.status(400).json({ message: "title required" });
      const userId = uid(req);
      const userSettings = await storage.getUserSettings(userId).catch(() => null);
      const provider = userSettings?.selectedAiProvider || "none";
      const apiKey = provider === "openai" ? userSettings?.openaiApiKey
        : provider === "anthropic" ? userSettings?.anthropicApiKey
        : provider === "gemini" ? userSettings?.geminiApiKey
        : provider === "groq" ? userSettings?.groqApiKey
        : provider === "xai" ? userSettings?.xaiApiKey
        : provider === "perplexity" ? userSettings?.perplexityApiKey
        : null;

      if (!apiKey) return res.json({ sentiment: "neutral", score: 0, impact: "Watch closely.", pairs: [] });

      const { callAiProvider } = await import("./ai-engine");
      const prompt = `You are a professional forex market analyst. Analyze this news headline and summary for its forex market impact.

Title: "${title}"
Summary: "${summary}"
Currencies mentioned: ${(currencies || []).join(", ")}

Respond in JSON only (no markdown):
{
  "sentiment": "bullish" | "bearish" | "neutral",
  "score": <number from -100 to +100, negative=bearish, positive=bullish>,
  "impact": "<1–2 sentence explanation of market impact>",
  "pairs": ["<most affected pair like EURUSD>", "<second pair if relevant>"],
  "urgency": "high" | "medium" | "low"
}`;

      // callAiProvider already returns parsed JSON (or null)
      const raw = await callAiProvider(provider, userSettings || {}, prompt);
      const ok = raw && ["bullish", "bearish", "neutral"].includes(String(raw.sentiment).toLowerCase());
      res.json(ok
        ? { ...raw, sentiment: String(raw.sentiment).toLowerCase(), score: Math.max(-100, Math.min(100, Number(raw.score) || 0)) }
        : { sentiment: "neutral", score: 0, impact: "The AI did not return a usable reading for this headline.", pairs: [], urgency: "low" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── AI Chart / Market Analysis ─────────────────────────────────────────────
  app.post("/api/analysis/ai-read", async (req: Request, res: Response) => {
    try {
      const symbol = String(req.body?.symbol ?? "").toUpperCase();
      const timeframe = String(req.body?.timeframe ?? "H1");
      if (!/^[A-Z0-9]{3,10}$/.test(symbol)) return res.status(400).json({ message: "symbol required" });
      const userId = uid(req);
      const userSettings = await storage.getUserSettings(userId).catch(() => undefined);
      const provider = userSettings?.selectedAiProvider || "none";
      if (provider === "none") return res.status(400).json({ message: "No AI provider configured. Connect one in Settings." });

      // Real data only: live quote + computed H1/H4/D1 indicators from candles
      const quote = (await fetchLivePrices().catch(() => ({} as Record<string, LivePrice>)))[symbol];
      if (!isTradablePrice(quote)) return res.status(503).json({ message: `No live price for ${symbol} right now.` });
      const tfs = await getMarketContext(symbol);
      const dp = priceDecimals(symbol);
      const f = (n: number) => n.toFixed(dp);
      const data = tfs.map(t =>
        `${t.label}: close ${f(t.close)}, EMA20 ${f(t.ema20)}, EMA50 ${f(t.ema50)}, RSI14 ${t.rsi14.toFixed(1)}, ATR14 ${f(t.atr14)}, trend ${t.trend}, ` +
        `20-bar range ${f(t.rangeLow)}–${f(t.rangeHigh)}, swing highs ${t.swingHighs.map(f).join(", ") || "—"}, swing lows ${t.swingLows.map(f).join(", ") || "—"}`
      ).join("\n");

      const strategy = await storage.getActiveStrategy(userId).catch(() => undefined);
      const strategyContext = strategy ? `\nTrader profile: ${strategy.style ?? "unset"} style, risk ${strategy.riskPercent ?? 1}% per trade.` : "";

      const prompt = `Analyse ${symbol} for a trader focused on the ${timeframe} timeframe.

DATA (the only information you have)
Live bid/ask: ${f(quote.bid)} / ${f(quote.ask)}
${data}${strategyContext}

Sections:
## Market Bias — Bullish / Bearish / Neutral, citing the numbers above
## Key Levels — use the listed swing points and ranges; do not invent others
## Structure — what the EMAs, RSI and ranges show across timeframes, and where they disagree
## Trade Setup — entry zone, stop (beyond a listed level or ≥0.5× H1 ATR), target, R:R; or what to wait for
## What This Doesn't Know — news, events and order flow are not in the data; name the risks the trader should check
## Confidence — High / Medium / Low and why

Under 500 words.`;

      const analysis = await callAiProviderMarkdown(provider, userSettings as any, prompt);
      res.json({ symbol, timeframe, analysis, currentPrice: quote.bid, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  return httpServer;
}
