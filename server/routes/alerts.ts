// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { insertPriceAlertSchema } from "@shared/schema";
import { saveSubscription, removeSubscription, sendPushToUser } from "../push";
import { uid } from "./_shared";

export function register(app: Express) {
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

}
