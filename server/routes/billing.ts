// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { createStripeCustomer, createCheckoutSession, createPortalSession, getStripePublishableKey, getCustomerSubscriptions } from "../stripe";

export function register(app: Express) {
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

}
