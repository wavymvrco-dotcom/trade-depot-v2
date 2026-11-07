// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { storage } from "../storage";
import { db } from "../db";
import { userSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { BCRYPT_ROUNDS } from "../password";
import { uid } from "./_shared";
import { dailyUsage, sessionUsage } from "../lab/service/data";

export function register(app: Express) {
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

  // ─── Admin: Market-data usage (Twelve Data requests and candle-cache hit rate)
  app.get("/api/admin/data-usage", requireAdmin as any, async (_req: Request, res: Response) => {
    try {
      res.json({ days: await dailyUsage(14), sinceRestart: sessionUsage() });
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

  // ─── Admin: Strategy Lab plan (until billing sets it) ──────────────────────────
  app.patch("/api/admin/users/:id/lab-tier", requireAdmin as any, async (req: Request, res: Response) => {
    try {
      const tier = req.body?.tier === "pro" ? "pro" : req.body?.tier === "free" ? "free" : null;
      if (!tier) return res.status(400).json({ message: "tier must be free or pro" });
      await storage.getUserSettings(req.params.id); // creates the settings row if missing
      await db.update(userSettings).set({ labTier: tier }).where(eq(userSettings.userId, req.params.id));
      res.json({ ok: true, tier });
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

}
