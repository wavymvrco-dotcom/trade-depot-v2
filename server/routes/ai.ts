// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { getMarketContext, callAiProviderMarkdown } from "../ai-engine";
import { priceDecimals } from "@shared/pips";
import { normalizeSide } from "../execution";
import { fetchLivePrices, isTradablePrice, type LivePrice } from "../marketdata";
import { generateTradeReview, getAllKnowledge, getTradeReviews, getTradeReviewByPosition, generateWeeklyReport } from "../ai-knowledge";
import { uid } from "./_shared";

export function register(app: Express) {
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

}
