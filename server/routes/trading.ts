// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { generateAiSignal } from "../ai-engine";
import { openTrade, closeTrade, normalizeSide } from "../execution";
import { fetchLivePrices, isTradablePrice, type LivePrice } from "../marketdata";
import { calcProfit } from "../pips";
import { insertStrategySchema } from "@shared/schema";
import { getRiskDashboard, updateRiskLimits, resumeTrading } from "../risk";
import { z } from "zod";
import { uid } from "./_shared";

export function register(app: Express) {
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
        const { callAiProviderForForecast } = await import("../ai-engine");
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
        const { callAiProviderForForecast } = await import("../ai-engine");
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

}
