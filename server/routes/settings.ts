// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { randomToken } from "../crypto";
import { getOandaAccountId } from "../brokers/oanda";
import { testMT5Bridge, getMT5AccountInfo } from "../brokers/mt5";
import { sendEmail, verifySmtp, tradeAlertHtml } from "../email";
import { redactSettings, isSafeOutboundHost, uid } from "./_shared";

export function register(app: Express) {
  app.get("/api/settings", async (req: Request, res: Response) => {
    const userId = uid(req);
    const settings = await storage.getUserSettings(userId);
    res.json(settings ? redactSettings(settings) : { userId, autoTrade: false, notifications: true, riskMode: "moderate", brokerType: "demo" });
  });

  // Only preference fields can be written here. Credentials go through the
  // test-* endpoints, which verify them before saving.
  const WRITABLE_SETTINGS = [
    "notifications", "autoTrade", "riskMode", "theme", "tradingInstruments", "tradingTimezone",
    "activeSessions", "offHoursBehavior", "offHoursRiskReduction", "selectedAiProvider", "tdciMinScore",
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
      if (patch.tdciMinScore != null) {
        patch.tdciMinScore = Math.min(100, Math.max(0, parseInt(patch.tdciMinScore) || 0));
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

}
