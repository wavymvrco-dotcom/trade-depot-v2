// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { insertTradeJournalSchema } from "@shared/schema";
import { uid } from "./_shared";

export function register(app: Express) {
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

}
