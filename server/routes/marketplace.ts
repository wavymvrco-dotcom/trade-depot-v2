// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { insertMarketplaceSchema } from "@shared/schema";
import { uid } from "./_shared";

export function register(app: Express) {
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

}
