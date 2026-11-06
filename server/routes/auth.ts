// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { storage } from "../storage";
import { sendEmail } from "../email";
import { insertUserSchema } from "@shared/schema";
import { createStripeCustomer } from "../stripe";
import { BCRYPT_ROUNDS, verifyPassword } from "../password";
import { startSession } from "./_shared";

export function register(app: Express) {
  // --- Auth (simple session-based) ---
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username?.trim());
      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      // bcrypt hashes only — a non-hash stored value never matches
      const valid = await verifyPassword(password, user.password);
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
          : process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5000";
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
          : process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5000";
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

}
