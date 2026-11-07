// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { fetchLivePrices, verifyPolygonConnection, getMarketDataStatus } from "../marketdata";
import { fetchEconomicCalendar } from "../calendar";
import { fetchCandlesForAI, fetchCandles, runBacktest } from "../backtest";
import { getForexNews } from "../news";
import { z } from "zod";
import { uid } from "./_shared";

export function register(app: Express) {
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


  // ── Economic Calendar ───────────────────────────────────────────────────────
  app.get("/api/calendar", async (_req: Request, res: Response) => {
    try {
      const events = await fetchEconomicCalendar();
      res.json(events);
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

      const { callAiProvider } = await import("../ai-engine");
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

}
