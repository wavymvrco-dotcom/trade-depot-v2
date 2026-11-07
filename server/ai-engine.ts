import { storage } from "./storage";
import { fetchLivePrices, isTradablePrice, type LivePrice } from "./marketdata";
import { getSymbolConfig, priceDecimals } from "@shared/pips";
import { fetchCandlesForAI } from "./backtest";
import { ema, rsi, atr, swingPoints, last, type Candle } from "./indicators";
import { getRelevantKnowledge } from "./ai-knowledge";
import { getLiveTdci, styleFor, TDCI_SYMBOLS, type LiveTdci } from "./tdci-service";
import { PROFILES } from "./tdci";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "GBPJPY"];

// ─── Providers ────────────────────────────────────────────────────────────────
// Users bring their own key for one of these providers. Model IDs are
// overridable per deployment because providers retire models regularly.

type Provider = "openai" | "anthropic" | "gemini" | "groq" | "xai" | "perplexity";

const MODELS: Record<Provider, string> = {
  anthropic:  process.env.ANTHROPIC_MODEL  || "claude-opus-5-5",
  openai:     process.env.OPENAI_MODEL     || "gpt-4o",
  gemini:     process.env.GEMINI_MODEL     || "gemini-2.5-flash",
  groq:       process.env.GROQ_MODEL       || "llama-3.3-70b-versatile",
  xai:        process.env.XAI_MODEL        || "grok-3",
  perplexity: process.env.PERPLEXITY_MODEL || "sonar",
};

const KEY_FIELD: Record<Provider, string> = {
  openai: "openaiApiKey", anthropic: "anthropicApiKey", gemini: "geminiApiKey",
  groq: "groqApiKey", xai: "xaiApiKey", perplexity: "perplexityApiKey",
};

const OPENAI_COMPATIBLE: Partial<Record<Provider, string>> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  xai: "https://api.x.ai/v1/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
};

export function modelFor(provider: string): string {
  return MODELS[provider as Provider] ?? provider;
}

/** One call to the user's chosen provider. Returns the model's text output. */
async function callProviderText(
  provider: string,
  settings: Record<string, any>,
  system: string,
  prompt: string,
  opts: { json?: boolean; maxTokens?: number } = {}
): Promise<string> {
  if (!(provider in KEY_FIELD)) throw new Error("No AI provider connected");
  const p = provider as Provider;
  const apiKey = settings[KEY_FIELD[p]];
  if (!apiKey) throw new Error(`No API key saved for ${provider}`);
  const model = MODELS[p];
  const maxTokens = opts.maxTokens ?? 1200;

  if (p === "anthropic") {
    // Thinking is always on for this model family, so leave room beyond the answer.
    // temperature is not sent (rejected by the API); effort controls depth.
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system,
        output_config: { effort: "low" },
        fallbacks: "default",
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json() as any;
    if (data.stop_reason === "refusal") throw new Error("The model declined this request");
    return (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
  }

  if (p === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: system }] },
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: maxTokens,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json() as any;
    return (data.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? "").join("").trim();
  }

  const url = OPENAI_COMPATIBLE[p]!;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
      ...(opts.json && p === "openai" ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}`);
  const data = await res.json() as any;
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

function extractJson(text: string): any {
  try { return JSON.parse(text.trim()); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

const JSON_SYSTEM = "You are a careful FX market analyst. Use only the data you are given — never invent indicator values, news, statistics or price levels. Respond with a single valid JSON object and nothing else.";
const TEXT_SYSTEM = "You are a careful FX market analyst. Base every claim on the data provided; when something is not in the data, say it is unknown rather than guessing. Write clear markdown with ## headings.";

/** JSON-mode call. Returns the parsed object, or null if the model didn't return JSON. */
export async function callAiProvider(provider: string, settings: Record<string, any>, prompt: string): Promise<any> {
  return extractJson(await callProviderText(provider, settings, JSON_SYSTEM, prompt, { json: true }));
}

export const callAiProviderForForecast = callAiProvider;

/** JSON-mode call with a caller-supplied system prompt (Blueprint AI). Returns the parsed object or null. */
export async function callAiProviderJson(provider: string, settings: Record<string, any>, system: string, prompt: string, maxTokens = 2000): Promise<any> {
  return extractJson(await callProviderText(provider, settings, system, prompt, { json: true, maxTokens }));
}

/** Free-text (markdown) call. */
export async function callAiProviderMarkdown(provider: string, settings: Record<string, any>, prompt: string, system = TEXT_SYSTEM): Promise<string> {
  const text = await callProviderText(provider, settings, system, prompt, { maxTokens: 1500 });
  if (!text || text.length < 20) throw new Error("Empty response from AI provider");
  return text;
}

// ─── Market context from real candles ─────────────────────────────────────────

export interface TimeframeRead {
  label: string;
  close: number;
  ema20: number;
  ema50: number;
  rsi14: number;
  atr14: number;
  trend: "up" | "down" | "flat";
  swingHighs: number[];
  swingLows: number[];
  rangeHigh: number;
  rangeLow: number;
}

function readTimeframe(label: string, candles: Candle[]): TimeframeRead | null {
  if (candles.length < 60) return null;
  const closes = candles.map(c => c.close);
  const e20 = last(ema(closes, 20))!, e50 = last(ema(closes, 50))!;
  const r = last(rsi(closes, 14))!, a = last(atr(candles, 14))!;
  if (![e20, e50, r, a].every(Number.isFinite)) return null;
  const recent = candles.slice(-20);
  const { highs, lows } = swingPoints(candles, 2, 3);
  const close = last(closes)!;
  const trend = e20 > e50 && close > e20 ? "up" : e20 < e50 && close < e20 ? "down" : "flat";
  return {
    label, close, ema20: e20, ema50: e50, rsi14: r, atr14: a, trend,
    swingHighs: highs, swingLows: lows,
    rangeHigh: Math.max(...recent.map(c => c.high)),
    rangeLow: Math.min(...recent.map(c => c.low)),
  };
}

export async function getMarketContext(symbol: string) {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("Market data is not configured (TWELVE_DATA_API_KEY). AI signals need real candles.");
  const { h1, h4, d1 } = await fetchCandlesForAI(symbol, key);
  const tfs = [readTimeframe("H1", h1), readTimeframe("H4", h4), readTimeframe("D1", d1)].filter(Boolean) as TimeframeRead[];
  if (tfs.length < 2) throw new Error(`Not enough candle history for ${symbol} right now.`);
  return tfs;
}

function formatContext(symbol: string, tfs: TimeframeRead[], quote: LivePrice) {
  const dp = priceDecimals(symbol);
  const f = (n: number) => n.toFixed(dp);
  const lines = tfs.map(t =>
    `${t.label}: close ${f(t.close)} | EMA20 ${f(t.ema20)} | EMA50 ${f(t.ema50)} | RSI14 ${t.rsi14.toFixed(1)} | ATR14 ${f(t.atr14)} | trend ${t.trend} | ` +
    `20-bar range ${f(t.rangeLow)}–${f(t.rangeHigh)} | recent swing highs ${t.swingHighs.map(f).join(", ") || "—"} | swing lows ${t.swingLows.map(f).join(", ") || "—"}`
  );
  return `Instrument: ${symbol}\nLive bid/ask: ${f(quote.bid)} / ${f(quote.ask)} (day change ${quote.change}%)\nTime (UTC): ${new Date().toISOString()}\n\n${lines.join("\n")}`;
}

// ─── Signal validation ────────────────────────────────────────────────────────

interface ValidSignal {
  action: string; confidence: number; reasoning: string;
  entryPrice: number; stopLoss: number; takeProfit: number;
}

/** Rejects (rather than repairs) signals whose stop/target don't make sense. */
function validateSignal(parsed: any, symbol: string, quote: LivePrice, tfs: TimeframeRead[]): ValidSignal | null {
  if (!parsed || typeof parsed !== "object") return null;
  const action = String(parsed.action || "").toUpperCase();
  if (!["BUY", "SELL", "STRONG BUY", "STRONG SELL"].includes(action)) return null;
  const reasoning = typeof parsed.reasoning === "string" && parsed.reasoning.length > 20 ? parsed.reasoning.slice(0, 1200) : null;
  if (!reasoning) return null;

  const isBuy = action.includes("BUY");
  const entry = isBuy ? quote.ask : quote.bid; // market order fills at the live quote
  const sl = parseFloat(parsed.stopLoss), tp = parseFloat(parsed.takeProfit);
  if (!Number.isFinite(sl) || !Number.isFinite(tp)) return null;
  if (isBuy ? !(sl < entry && tp > entry) : !(sl > entry && tp < entry)) return null;

  const cfg = getSymbolConfig(symbol);
  const slDist = Math.abs(entry - sl);
  const h1Atr = tfs.find(t => t.label === "H1")?.atr14 ?? tfs[0].atr14;
  // Stop must clear normal noise but stay within the configured maximum
  if (slDist < Math.max(cfg.minSL * cfg.pipSize, 0.5 * h1Atr) || slDist > cfg.maxSL * cfg.pipSize) return null;
  if (Math.abs(tp - entry) < slDist * 1.5) return null;

  const confidence = Math.min(90, Math.max(1, Math.round(Number(parsed.confidence) || 0)));
  const dp = priceDecimals(symbol);
  return {
    action, confidence, reasoning,
    entryPrice: parseFloat(entry.toFixed(dp)),
    stopLoss: parseFloat(sl.toFixed(dp)),
    takeProfit: parseFloat(tp.toFixed(dp)),
  };
}

// ─── TDCI-based signal (no AI key) ────────────────────────────────────────────
// Uses the exact trade model the TDCI calibration measures (stop 1.5× ATR,
// target 2R), so this signal's track record IS the calibration table.
// Returns null when the TDCI is weak — no trade is a valid answer.

const TDCI_SIGNAL_MIN = 50;

function tdciSignal(symbol: string, tdci: LiveTdci, quote: LivePrice): ValidSignal | null {
  if (tdci.direction === "NEUTRAL" || tdci.score < TDCI_SIGNAL_MIN) return null;
  const action = tdci.direction === "LONG" ? "BUY" : "SELL";
  const entry = action === "BUY" ? quote.ask : quote.bid;
  // Same trade model the calibration measured for this style
  const { stopAtr, rr } = PROFILES[tdci.style].model;
  const slDist = stopAtr * tdci.atr;
  const dp = priceDecimals(symbol);
  const top = [...tdci.layers].filter(l => l.key !== "regime").sort((a, b) => Math.abs(b.value * b.weight) - Math.abs(a.value * a.weight)).slice(0, 2);
  const hist = tdci.historical && tdci.historical.trades >= 20
    ? ` Historically, out-of-sample trades at this score: ${tdci.historical.trades} trades, ${tdci.historical.winRate}% win, avg ${tdci.historical.avgR}R after costs.`
    : " This score range has no reliable calibration history yet.";
  return {
    action,
    confidence: 0, // the TDCI score is reported separately; it is not a win probability
    reasoning: `TDCI ${tdci.score}/100 ${tdci.direction} (${PROFILES[tdci.style].label}, ${tdci.interval}). Strongest layers: ${top.map(l => `${l.label} — ${l.detail}`).join(" ")}${hist} Stop ${stopAtr}× ATR, target ${rr}R.`,
    entryPrice: parseFloat(entry.toFixed(dp)),
    stopLoss: parseFloat((action === "BUY" ? entry - slDist : entry + slDist).toFixed(dp)),
    takeProfit: parseFloat((action === "BUY" ? entry + rr * slDist : entry - rr * slDist).toFixed(dp)),
  };
}

function formatTdci(t: LiveTdci | null) {
  if (!t) return "";
  const layers = t.layers.map(l => `  ${l.label}: ${l.value >= 0 ? "+" : ""}${l.value}${l.key === "regime" ? " (quality 0–1)" : ""} — ${l.detail}`).join("\n");
  const cal = t.weightsSource === "calibrated"
    ? `Calibrated ${t.calibratedAt?.slice(0, 10)}; recommended minimum score: ${t.recommendedMin ?? "none (no proven edge on this market)"}.`
    : "Not yet calibrated on this market.";
  return `\n\nTRADE DEPOT CONFLUENCE INDEX (rule-based, backtested)\nScore ${t.score}/100, direction ${t.direction}, layer agreement ${Math.round(t.agreement * 100)}%. ${cal}\n${layers}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

function buildSignalPrompt(context: string, knowledge: string, strategy: any) {
  const strat = strategy
    ? `\nTrader profile: ${strategy.style || "swing"} style, ${strategy.goal || "balanced"} goal, risk ${strategy.riskPercent}% per trade.${strategy.description ? ` Their rules: "${String(strategy.description).slice(0, 500)}"` : ""}`
    : "";
  const kb = knowledge ? `\n\nPrinciples and this trader's past lessons (apply only where the data supports them):\n${knowledge}` : "";
  return `Decide whether there is a trade in this instrument right now.

MARKET DATA
${context}${strat}${kb}

Rules:
- Use only the numbers above. Do not cite patterns, levels, news or statistics that aren't in the data.
- "NO_TRADE" is the correct answer whenever the timeframes conflict, the TDCI disagrees, or the setup is unclear.
- Stop loss goes beyond a listed swing point or at least 0.5× H1 ATR from price. Take profit at least 1.5× the stop distance.
- confidence = your honest probability (1–90) that take profit is hit before stop loss.

Return JSON:
{"action":"BUY"|"SELL"|"NO_TRADE","confidence":<int>,"reasoning":"<3-4 sentences citing the specific numbers above>","stopLoss":<price or null>,"takeProfit":<price or null>}`;
}

/**
 * Generate a signal for the user. Returns null when there is no trade —
 * the caller should treat that as a normal outcome, not an error.
 */
export async function generateAiSignal(userId: string, symbol?: string) {
  const settings = await storage.getUserSettings(userId).catch(() => undefined);
  const watch = settings?.tradingInstruments?.length ? settings.tradingInstruments.filter(s => SYMBOLS.includes(s)) : SYMBOLS;
  const targetSymbol = (symbol || watch[Math.floor(Math.random() * watch.length)] || "EURUSD").toUpperCase();

  const quote = (await fetchLivePrices().catch(() => ({} as Record<string, LivePrice>)))[targetSymbol];
  if (!isTradablePrice(quote)) throw new Error(`No live price for ${targetSymbol} — signals are paused until data returns.`);

  // The TDCI read uses the layers curated for the trader's own style
  const strategy = await storage.getActiveStrategy(userId).catch(() => undefined);
  const style = styleFor(strategy?.style);
  const [tfs, tdci] = await Promise.all([
    getMarketContext(targetSymbol),
    TDCI_SYMBOLS.includes(targetSymbol) ? getLiveTdci(targetSymbol, style).catch(e => { console.warn(`[TDCI] ${targetSymbol}: ${e.message}`); return null; }) : Promise.resolve(null),
  ]);
  const provider = settings?.selectedAiProvider;
  const hasProvider = !!provider && provider !== "none";

  let signal: ValidSignal | null = null;
  let source: "ai" | "rules" = "rules";
  let knowledgeIds: string[] = [];

  if (hasProvider) {
    const kb = await getRelevantKnowledge(userId, targetSymbol);
    knowledgeIds = kb.ids;
    const prompt = buildSignalPrompt(formatContext(targetSymbol, tfs, quote) + formatTdci(tdci), kb.text, strategy);
    const raw = await callAiProvider(provider!, settings as any, prompt);
    if (raw && String(raw.action).toUpperCase() === "NO_TRADE") return null;
    signal = validateSignal(raw, targetSymbol, quote, tfs);
    if (!signal) {
      console.log(`[AI Signal] ${provider} returned an invalid setup for ${targetSymbol} — discarded`);
      return null;
    }
    source = "ai";
  } else {
    if (!tdci) return null;
    signal = tdciSignal(targetSymbol, tdci, quote);
    if (!signal) return null;
  }

  // Size for the user's risk on their real balance where known
  const cfg = getSymbolConfig(targetSymbol);
  const riskPct = Number(strategy?.riskPercent) || 1;
  const accountSize = Number(settings?.brokerBalance) || strategy?.accountSize || 10000;
  const slPips = Math.max(1, Math.abs(signal.entryPrice - signal.stopLoss) / cfg.pipSize);
  const sizeLots = Math.max(0.01, Math.min(50, Math.round(((accountSize * riskPct / 100) / (slPips * cfg.pipValue)) * 100) / 100));

  const h4 = tfs.find(t => t.label === "H4");
  return storage.createSignal({
    symbol: targetSymbol,
    action: signal.action,
    confidence: signal.confidence,
    reasoning: signal.reasoning,
    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    size: sizeLots,
    userId,
    status: "pending",
    aiProvider: source === "ai" ? provider! : "tdci",
    source,
    htfBias: h4 ? (h4.trend === "up" ? "bullish" : h4.trend === "down" ? "bearish" : "neutral") : null,
    knowledgeIds: knowledgeIds.length ? knowledgeIds : null,
    tdciScore: tdci?.score ?? null,
    tdciDirection: tdci?.direction ?? null,
    tdciLayers: tdci ? { style: tdci.style, interval: tdci.interval, weightsSource: tdci.weightsSource, recommendedMin: tdci.recommendedMin, layers: tdci.layers } : null,
  });
}
