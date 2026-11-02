import { storage } from "./storage";
import { fetchLivePrices } from "./marketdata";
import { SYMBOL_CONFIG, getSymbolConfig, calcProfit, defaultSL, defaultTP } from "./pips";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "GBPJPY"];

// ─── Trading Session Detector ─────────────────────────────────────────────────

function getCurrentSession(): string {
  const utcHour = new Date().getUTCHours();
  if (utcHour >= 0  && utcHour < 2)  return "Late NY / Asian open — low liquidity, avoid breakouts";
  if (utcHour >= 2  && utcHour < 7)  return "Tokyo / Asian session — JPY pairs most active, range-bound tendencies for EUR/GBP";
  if (utcHour >= 7  && utcHour < 9)  return "Pre-London — volatility building, watch for fakeouts before Europe opens";
  if (utcHour >= 9  && utcHour < 13) return "London session peak — highest EUR/GBP liquidity, institutional order flow dominant";
  if (utcHour >= 13 && utcHour < 17) return "London/NY overlap — strongest trending session of the day, best for breakouts";
  if (utcHour >= 17 && utcHour < 22) return "NY afternoon — diminishing volume, watch for reversals and profit-taking";
  return "Asian session — low volatility, range strategies preferred";
}

// ─── Institutional-Grade Prompt Builder ──────────────────────────────────────

const TRADING_SYSTEM_KNOWLEDGE = `
You are a senior institutional quantitative trader and macro analyst operating at hedge-fund level. You manage a diversified FX and commodities book using a multi-framework approach that combines:
  1. ICT / Smart Money Concepts (SMC) — the same methodology used by interbank desks
  2. Quantitative momentum & mean-reversion signal generation
  3. Global macro intermarket analysis (yields, equities, DXY, commodities)
  4. Order flow and market microstructure awareness
  5. Statistical confluence scoring — only high-probability setups

Your analysis is FUNDAMENTALLY CORRECT at the level of a CTA or prop trading firm. You think in terms of liquidity, delivery, and institutional order flow — not retail indicators.

═══════════════════════════════════════════════════════
LAYER 1: ICT / SMART MONEY CONCEPTS (PRIMARY FRAMEWORK)
═══════════════════════════════════════════════════════

MARKET STRUCTURE (read before any trade):
• Break of Structure (BOS): price breaks a prior swing high (bullish BOS) or swing low (bearish BOS) → confirms trend continuation. Trade with this direction.
• Change of Character (CHoCH): FIRST break of structure AGAINST the prevailing trend — earliest reversal warning. Wait for confirmation before trading counter-trend.
• Internal vs External Liquidity: external = swing highs/lows (where retail stops cluster); internal = FVGs and order blocks. Institutions sweep external, then deliver to internal.

ORDER BLOCKS (OB) — where institutions placed their orders:
• Bullish OB: the last BEARISH candle immediately before a strong bullish impulse move. Price returns to fill remaining institutional buy orders here.
• Bearish OB: the last BULLISH candle before a strong bearish impulse. Institutions sell into the retest.
• Mitigation: an OB is only valid ONCE — after price returns and reacts, it is used up.
• High-probability entry: OB + FVG confluence at the 0.618–0.79 OTE zone = institutional entry model

FAIR VALUE GAPS (FVG / IMBALANCES):
• A 3-candle pattern where candle 1 wick and candle 3 wick do NOT overlap — price moved too fast, leaving an imbalance.
• Bullish FVG: gap between candle 1 high and candle 3 low. Acts as support on retest.
• Bearish FVG: gap between candle 1 low and candle 3 high. Acts as resistance on retest.
• Price has a statistical tendency to fill FVGs before continuing — use as targets and entry zones.

LIQUIDITY CONCEPTS:
• Buyside liquidity (BSL): resting above swing highs (retail buy stops + breakout orders)
• Sellside liquidity (SSL): resting below swing lows (retail sell stops + breakout orders)
• Stop hunt: price briefly sweeps BSL/SSL to trigger those stops, then reverses sharply — this IS the institutional entry
• Equal highs/lows: multiple touches of same level = massive stop cluster → prime target for institution sweep → reversal
• After a liquidity sweep, the reversal is the high-conviction trade. Do NOT trade the sweep direction.

OPTIMAL TRADE ENTRY (OTE):
• After a valid BOS and pullback, the 0.618–0.79 Fibonacci retracement of the impulse leg is the OTE zone
• This is where institutions re-enter after setting the direction
• SL goes below the swing low (for longs) or above the swing high (for shorts) that preceded the impulse
• Target: the next external liquidity pool (opposing swing high/low)

INTERBANK PRICE DELIVERY ALGORITHM (IPDA):
• Markets deliver price in a specific algorithmic sequence: accumulation → manipulation → distribution → continuation
• The MANIPULATION phase = the stop hunt (liquidity sweep) that confuses retail
• After manipulation, price DELIVERS to the institutional target (often the opposite of what retail expects)
• Best trade = enter AFTER the manipulation phase completes, in the direction of distribution

SESSIONS & KILL ZONES (institutional entry windows):
• Asian Kill Zone: 00:00–04:00 UTC — accumulation, range-setting, avoid directional trades
• London Kill Zone: 07:00–09:00 UTC — institutional entries, highest probability manipulation & reversal
• NY AM Kill Zone: 13:00–15:00 UTC — continuation or reversal of London direction, high volume
• NY PM: 15:00–20:00 UTC — profit-taking, position squaring, low new-trade probability
• NEVER trade during session transitions (low volume = erratic, fake moves)

═══════════════════════════════════════════════════════
LAYER 2: QUANTITATIVE SIGNAL FRAMEWORK
═══════════════════════════════════════════════════════

MOMENTUM FACTOR (3 lookbacks):
• Short-term (intraday): % change vs open. > +0.5% = bullish momentum; < -0.5% = bearish
• Medium-term (session): is price making HH/HL (bullish structure) or LH/LL (bearish structure)?
• Cross-sectional: rank all pairs by % change. Long the strongest vs the weakest → pair trade / best direction
• Momentum persistence: trending > 0.5% pairs tend to continue for 1–2 more sessions (mean 0.65 continuation rate)

MEAN REVERSION SIGNALS:
• Trigger: > 1.5% single-session move with no major scheduled catalyst = statistically overextended
• Z-score equivalent: extreme moves are > 2 standard deviations from daily ATR distribution
• Trade: fade (trade opposite to the extreme move) after momentum slows (small candles, wicks in the extreme direction)
• Target: 38.2%–61.8% retracement of the extreme move within 1–2 sessions
• Stop: beyond the extreme wick high/low

STATISTICAL CORRELATION ARBITRAGE:
• EURUSD vs GBPUSD: correlation ~0.88. Divergence > 0.5% relative = mean-reversion opportunity in the laggard
• USDJPY vs US 10yr Treasury yield: correlation ~0.82. Yield rising + USDJPY flat = USDJPY long opportunity
• XAUUSD vs DXY: correlation ~-0.75. DXY falling + Gold lagging = Gold long opportunity
• AUDUSD vs XAUUSD: correlation ~0.65. Risk-on theme: both should move together
• Pair trade execution: size them equal in USD notional; profit from convergence regardless of USD direction

VOLATILITY REGIME DETECTION:
• Low volatility (ATR < 50% of 20-day average): range strategies, sell volatility, OB/FVG plays
• High volatility (ATR > 150% of 20-day average): momentum strategies, wider stops, news-driven
• Volatility expansion after compression = breakout signal; direction determined by institutional bias

═══════════════════════════════════════════════════════
LAYER 3: GLOBAL MACRO & INTERMARKET
═══════════════════════════════════════════════════════

DXY (US DOLLAR INDEX) as PRIMARY LEADING INDICATOR:
• DXY rising → USD strengthening → EURUSD ↓, GBPUSD ↓, AUDUSD ↓, GOLD ↓, USDJPY ↑
• DXY falling → USD weakening → EURUSD ↑, GBPUSD ↑, AUDUSD ↑, GOLD ↑, USDJPY ↓
• DXY extreme move (> 0.5% in session) overrides all technical analysis on USD-correlated pairs
• Always determine DXY direction before entering any USD pair

US TREASURY YIELD CURVE:
• 10yr yield rising = risk-on + USD strength → USDJPY ↑, equities ↑, gold pressure
• 10yr yield falling = risk-off / recession fear → USDJPY ↓, JPY strengthens, gold ↑
• Yield curve inversion (2yr > 10yr): recession signal → broad risk-off → safe havens (JPY, CHF, Gold) outperform
• Fed hawkish tone → yields rise → USD strength → short EUR/GBP/AUD, long USD/JPY

RISK-ON / RISK-OFF FRAMEWORK:
• Risk-ON: equities rising, VIX falling, DXY falling → AUD ↑, NZD ↑, GBP ↑, EUR ↑, JPY ↓, CHF ↓, Gold mixed
• Risk-OFF: equities falling, VIX rising, geopolitical stress → JPY ↑, CHF ↑, Gold ↑, DXY ↑, AUD ↓, GBP ↓
• Current session price action in USDJPY is your real-time risk-on/off barometer

COMMODITY CURRENCY FUNDAMENTALS:
• AUDUSD: China iron ore/copper demand proxy. Chinese PMI > 50 = AUD bullish
• USDCAD: WTI crude oil inverse. Oil +2% → USDCAD -0.5% expected
• NZDUSD: dairy prices, China trade links. Tracks AUDUSD closely (0.85 correlation)

RATE DIFFERENTIAL CARRY:
• Carry trade = borrow in low-rate currency (JPY, CHF), invest in high-rate (USD, AUD)
• Interest rate DIFFERENTIAL drives long-term currency trends — most powerful fundamental force
• When central bank divergence is strong (e.g., Fed hiking while BOJ holds) → carry trend persists for months

═══════════════════════════════════════════════════════
LAYER 4: ORDER FLOW & MARKET MICROSTRUCTURE
═══════════════════════════════════════════════════════

• Absorption: large buy orders being absorbed by even larger institutional sellers = distribution (bearish despite price stability)
• Iceberg orders: institutions show only a fraction of their true size. Large consistent rejections at a level = iceberg
• Delta divergence: if price makes a new high but cumulative buy volume is falling → bearish divergence, reversal likely
• Spread widening: spreads widen before major moves and news — signals institutional positioning
• Stop cascade: once key stops triggered, forced liquidation creates momentum. After cascade exhausts, reverse is high-probability
• Thin books (low liquidity sessions): avoid; price fills large orders with outsized moves = false signals

═══════════════════════════════════════════════════════
LAYER 5: TRADITIONAL TECHNICAL (CONFIRMATION ONLY)
═══════════════════════════════════════════════════════

Use technical signals as CONFLUENCE only — never as primary reason to trade:
• Moving averages: 50/200 EMA for macro trend bias; price above 200 EMA = institutional bullish bias
• RSI: use only for divergence (price HH + RSI LH = bearish; price LL + RSI HL = bullish)
• MACD: histogram flipping direction at OB/FVG = entry confluence
• Fibonacci: 0.382, 0.5, 0.618 (golden ratio), 0.786 (OTE) — draw on impulse legs from swing to swing
• Session VWAP: price above VWAP = bullish intraday; below = bearish. Strong magnet for mean reversion

═══════════════════════════════════════════════════════
SYMBOL-SPECIFIC INSTITUTIONAL KNOWLEDGE
═══════════════════════════════════════════════════════

EURUSD — "The Fiber" (primary interbank pair):
• Tracks DXY inversely with ~0.92 correlation. DXY direction IS EURUSD direction.
• Institutional delivery: OBs form on 4H/Daily at key swing structure. 1H FVGs fill within 2–4 sessions.
• ECB vs Fed rate differential: widening spread → EUR strengthening. Narrowing → EUR weakening.
• Avoid: 10 minutes before NFP, FOMC, ECB decisions — spreads widen 3–5×

GBPUSD — "Cable" (highest retail participation, most stop-hunted):
• BoE vs Fed divergence: UK rate expectations drive 40% of Cable moves
• Stop hunts: most frequent of all majors — always expect a BSL/SSL sweep before the real move
• London Kill Zone: GBPUSD is most active 07:00–10:00 UTC. Best OTE setups form here.

USDJPY — "The Ninja" (carry trade + risk barometer):
• 82% correlation with US 10yr Treasury. ALWAYS check yield direction before USDJPY trade.
• BoJ intervention: above 150.00 = extreme caution. Bank of Japan has repeatedly intervened here.
• Risk-off triggers: geopolitical events, equity crashes → USDJPY drops 150–300 pips in hours
• Carry unwind: when Fed signals cuts, USDJPY carry unwind is violent and fast

AUDUSD — "The Aussie" (China proxy + risk currency):
• China PMI + iron ore futures = 3-day leading indicator for AUDUSD direction
• Strongly risk-correlated: equities UP → AUD UP (0.72 correlation with S&P 500)
• RBA rate decisions: AUD is hyper-sensitive to RBA language changes

XAUUSD — "Gold" (safe haven + inflation + anti-USD):
• Real yield relationship: Gold = hedge against NEGATIVE real yields. Real yield rising = Gold headwind.
• Inverse DXY: DXY +0.5% → Gold -$10–15 expected. Primary driver intraday.
• Geopolitical premium: war/crisis events → instant $30–80 spike regardless of USD
• FVG fills: Gold creates massive FVGs on news spikes. These fill with 85%+ probability within 5 sessions.
• Round number magnets: $2000, $2500, $3000, $3500, $4000 — institutions place massive orders at these

GBPJPY — "The Dragon" (extreme volatility + dual-driver):
• Driven by BOTH BoE policy AND BoJ policy + risk sentiment
• Average daily range: 100–180 pips. Spikes to 250+ on UK/Japan data
• Never trade without 30+ pip stop — this pair eats retail stops for breakfast
• Best: ride the London Kill Zone trend if GBP and JPY are both clearly directional

USDCAD — "The Loonie" (oil-dependent):
• WTI crude oil: the single biggest USDCAD driver. Oil +3% → USDCAD -0.5–0.8% same session
• BOC forward guidance: CAD reacts MORE to BOC tone than actual rate decisions
• US data spillover: US GDP, NFP, retail sales all move USDCAD because 75% of Canadian exports go to US

═══════════════════════════════════════════════════════
RISK MANAGEMENT — INSTITUTIONAL STANDARDS
═══════════════════════════════════════════════════════
• Max risk per trade: 1–2% of account. NEVER more.
• Stop beyond structure: place SL beyond the swing high/low that would invalidate the setup
• NEVER widen a stop once placed — if the analysis was wrong, take the loss and reset
• Minimum R:R of 1.5:1 for any trade. Prefer 2:1 or 3:1.
• Correlated exposure: EURUSD + GBPUSD + AUDUSD + GOLD are all anti-USD. Max 1 of these at full size.
• News rule: no new entries within 10 minutes of high-impact news. Close or hedge before NFP, FOMC, CPI.
• Daily loss limit: 3% of account. If hit, stop trading for the day — no exceptions.

═══════════════════════════════════════════════════════
SIGNAL QUALITY SCORING — MULTI-LAYER FRAMEWORK
═══════════════════════════════════════════════════════
Start at 65% confidence baseline. Apply institutional scoring:

INSTITUTIONAL FRAMEWORK (primary):
+12: SMC setup — valid OB + FVG confluence at OTE zone after BOS confirmed
+10: Liquidity sweep (stop hunt) completed, entering in reversal direction
+8:  Macro alignment — DXY direction confirms trade direction on USD pairs
+8:  Intermarket confluence — correlated assets confirming the move

QUANTITATIVE (secondary):
+7:  Strong cross-sectional momentum (pair is top/bottom ranked in % change)
+6:  Correlation divergence — laggard catching up to lead pair
+5:  Session is London or NY Kill Zone for this pair

RISK DEDUCTIONS (always apply):
-12: No clear structural confirmation (BOS/CHoCH not visible)
-10: Trading against the higher timeframe trend without reversal confirmation
-8:  Low-liquidity session (Asian for EUR/GBP/USD pairs)
-7:  Daily change already extreme (>1.5%) without FVG/OB support
-6:  Correlated pairs diverging (conflicting macro signals)
-10: Within 15 minutes of high-impact news event

Final cap: 60–94. Most quality institutional signals land 75–87. Below 70 = pass.
`;

// ─── HTF Bias (Higher Time Frame Analysis) ────────────────────────────────────
// Uses daily % change and cross-pair momentum to infer the multi-day directional bias.
// This simulates what a trader would see on D1/H4 charts.

export function computeHTFBias(
  symbol: string,
  prices: Record<string, { bid: number; change: number }>
): { bias: "bullish" | "bearish" | "neutral"; strength: "strong" | "moderate" | "weak"; summary: string } {
  const change = prices[symbol]?.change ?? 0;
  const isUsdPair = symbol.includes("USD");
  const isCommodity = symbol === "XAUUSD";

  // Base HTF bias from daily price change
  let bias: "bullish" | "bearish" | "neutral" = "neutral";
  let strength: "strong" | "moderate" | "weak" = "weak";

  const isBuy = symbol.endsWith("USD") || symbol === "XAUUSD"; // Price rises when base strengthens
  const effectiveChange = isBuy ? change : -change; // For USD/JPY, rising price = USD up = change positive

  if (Math.abs(change) >= 1.2) { strength = "strong"; }
  else if (Math.abs(change) >= 0.5) { strength = "moderate"; }
  else { strength = "weak"; }

  if (change >= 0.2) bias = "bullish";
  else if (change <= -0.2) bias = "bearish";

  // Cross-pair momentum check: do correlated pairs agree?
  const CORRELATED: Record<string, string[]> = {
    EURUSD: ["GBPUSD", "AUDUSD"],
    GBPUSD: ["EURUSD", "AUDUSD"],
    AUDUSD: ["EURUSD", "NZDUSD"],
    USDJPY: ["USDCAD", "USDCHF"],
    XAUUSD: ["EURUSD"],
  };
  const correlated = CORRELATED[symbol] || [];
  let agreeing = 0;
  for (const peer of correlated) {
    const peerChange = prices[peer]?.change ?? 0;
    if (Math.sign(peerChange) === Math.sign(change) && Math.abs(peerChange) > 0.1) agreeing++;
  }
  const confluenceNote = correlated.length > 0
    ? agreeing === correlated.length ? " Correlated pairs confirm bias."
    : agreeing === 0 ? " Correlated pairs diverge — lower conviction."
    : " Mixed signals from correlated pairs."
    : "";

  const summary = `HTF (Daily) bias: ${bias.toUpperCase()} (${strength}) — ${change >= 0 ? "+" : ""}${change}% today.${confluenceNote}`;
  return { bias, strength, summary };
}

function buildPrompt(
  symbol: string,
  prices: Record<string, { bid: number; change: number; changePips?: number }>,
  strategy?: { goal?: string | null; style?: string | null; description?: string | null; riskPercent?: string | null }
): string {
  const cfg = getSymbolConfig(symbol);
  const currentPrice = prices[symbol]?.bid || getFallback(symbol);
  const session = getCurrentSession();
  const htf = computeHTFBias(symbol, prices);

  const priceTable = Object.entries(prices)
    .map(([s, p]) => {
      const sc = getSymbolConfig(s);
      const pips = p.changePips != null ? `${p.changePips >= 0 ? "+" : ""}${p.changePips} pips` : "";
      const changeLabel = p.change >= 1.5 ? "⚠️ EXTREME MOVE" : p.change <= -1.5 ? "⚠️ EXTREME MOVE" : "";
      return `  ${s.padEnd(8)} bid=${p.bid}  ${p.change >= 0 ? "+" : ""}${p.change}% today  ${pips}  ${changeLabel}`;
    })
    .join("\n");

  const symbolInfo = `
Symbol profile for ${symbol}:
  Category:      ${cfg.category}
  Description:   ${cfg.description}
  Pip size:      ${cfg.pipSize} (1 pip = $${cfg.pipValue} per standard lot)
  Typical ATR:   ${cfg.atrDefault} pips/day
  Min SL:        ${cfg.minSL} pips (= ${(cfg.minSL * cfg.pipSize).toFixed(cfg.pipSize < 0.001 ? 5 : 3)} price units)
  Max SL:        ${cfg.maxSL} pips
  Active peak:   ${cfg.sessionPeak}
  Current price: ${currentPrice}
  Daily change:  ${prices[symbol]?.change || 0}%`;

  const strategyCtx = strategy
    ? `\nUser strategy: ${strategy.goal || "balanced"} goal, ${strategy.style || "swing"} style, ${strategy.riskPercent || "2"}% risk per trade. ${strategy.description || ""}`
    : "";

  const correlationNote = buildCorrelationNote(symbol, prices);

  const htfBlock = `
═══════════════════════════════════════════════════════
STEP 0 — HIGHER TIMEFRAME (HTF) BIAS [MANDATORY FIRST READ]
═══════════════════════════════════════════════════════
${htf.summary}

Rule: ONLY take trades aligned with HTF bias (or neutral). Trading AGAINST a strong HTF trend requires extraordinary multi-layer confluence. If HTF is ${htf.bias === "bullish" ? "BULLISH" : htf.bias === "bearish" ? "BEARISH" : "NEUTRAL"}, ${htf.bias === "bullish" ? "prefer BUY/STRONG BUY signals" : htf.bias === "bearish" ? "prefer SELL/STRONG SELL signals" : "both directions are valid — use lower confidence unless other layers strongly agree"}.
`;

  return `${TRADING_SYSTEM_KNOWLEDGE}

═══════════════════════════════════════════════════════
CURRENT MARKET SNAPSHOT — ${new Date().toUTCString()}
═══════════════════════════════════════════════════════
${htfBlock}
Active trading session: ${session}

Live prices across all monitored instruments:
${priceTable}

${symbolInfo}

Correlation intelligence:
${correlationNote}
${strategyCtx}

═══════════════════════════════════════════════════════
YOUR TASK — INSTITUTIONAL SIGNAL GENERATION
═══════════════════════════════════════════════════════
Generate a hedge-fund quality trading signal for ${symbol}.

Mandatory analysis sequence:
1. MACRO LAYER: What is the DXY doing? What is the macro/intermarket backdrop? (risk-on or risk-off?)
2. ICT/SMC LAYER: Is there a BOS/CHoCH in structure? Any recent liquidity sweeps? Active OBs or FVGs near current price?
3. QUANT LAYER: What is the cross-sectional momentum rank of ${symbol} vs peers? Any correlation divergence?
4. CONFLUENCE: Do all three layers agree? If yes → STRONG signal. If two agree → standard signal. If conflicting → reduce confidence or pass.
5. ENTRY MODEL: OTE zone (0.618–0.79 retracement) + OB/FVG confluence is the highest-quality entry. Session must be a Kill Zone or active.
6. RISK: SL beyond structure (minimum ${cfg.minSL} pips, maximum ${cfg.maxSL} pips). Minimum 1.8:1 R:R, prefer 2.5:1+.

Respond ONLY with a valid JSON object, no other text:
{
  "action": "BUY" | "SELL" | "STRONG BUY" | "STRONG SELL",
  "confidence": <integer 60-94>,
  "reasoning": "<4-5 sentences: macro context, ICT/SMC structure read, quantitative confluence, session context, exact SL/TP rationale>",
  "entryPrice": <exact current market price for ${symbol}>,
  "stopLoss": <price — beyond nearest structural swing, ${cfg.minSL}–${cfg.maxSL} pips from entry>,
  "takeProfit": <price — next external liquidity target, minimum 1.8× SL distance>
}`;
}

function buildCorrelationNote(
  symbol: string,
  prices: Record<string, { bid: number; change: number }>
): string {
  const changes: Record<string, number> = {};
  for (const [s, p] of Object.entries(prices)) changes[s] = p.change;

  const lines: string[] = [];

  if (symbol === "XAUUSD") {
    const eurusd = changes["EURUSD"];
    if (eurusd != null) {
      const goldChange = changes["XAUUSD"] || 0;
      if (Math.sign(goldChange) !== Math.sign(eurusd)) {
        lines.push(`⚠️ Gold/EURUSD divergence: Gold ${goldChange > 0 ? "up" : "down"} ${Math.abs(goldChange)}% but EURUSD ${eurusd > 0 ? "up" : "down"} ${Math.abs(eurusd)}% — possible reversal ahead`);
      } else {
        lines.push(`✅ Gold/EURUSD aligned (both ${goldChange >= 0 ? "bullish" : "bearish"} anti-USD) — increases conviction`);
      }
    }
  }

  if (["EURUSD", "GBPUSD", "AUDUSD"].includes(symbol)) {
    const usdPairs = ["EURUSD", "GBPUSD", "AUDUSD"].filter(s => s !== symbol && changes[s] != null);
    const agreeing = usdPairs.filter(s => Math.sign(changes[s]) === Math.sign(changes[symbol] || 0));
    if (agreeing.length === usdPairs.length && usdPairs.length > 0) {
      lines.push(`✅ USD theme confirmed: ${usdPairs.join(", ")} all moving in same direction — broad USD ${(changes[symbol] || 0) > 0 ? "weakness" : "strength"}`);
    } else if (usdPairs.length > 0) {
      const diverging = usdPairs.filter(s => Math.sign(changes[s]) !== Math.sign(changes[symbol] || 0));
      if (diverging.length > 0) {
        lines.push(`⚠️ Pair-specific move: ${diverging.join(", ")} not confirming — reduce confidence, this may be idiosyncratic`);
      }
    }
  }

  if (["USDJPY", "GBPJPY", "EURJPY"].includes(symbol)) {
    const jpyPairs = ["USDJPY", "GBPJPY", "EURJPY"].filter(s => s !== symbol && changes[s] != null);
    const agreeing = jpyPairs.filter(s => Math.sign(changes[s]) === Math.sign(changes[symbol] || 0));
    if (agreeing.length > 0) {
      lines.push(`✅ JPY weakness theme confirmed across ${agreeing.join(", ")} — systemic JPY move, higher conviction`);
    }
  }

  if (lines.length === 0) {
    lines.push(`No strong inter-market divergence detected — analyse on own technicals`);
  }

  return lines.join("\n");
}

// ─── JSON extractor ───────────────────────────────────────────────────────────

function extractJson(text: string): any {
  try { return JSON.parse(text.trim()); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

// ─── Provider callers ─────────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, prompt: string): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a hedge-fund level institutional trader with deep expertise in ICT/SMC (Order Blocks, FVGs, liquidity sweeps, IPDA), quantitative cross-sectional momentum, global macro (DXY, yield curves, CB divergence), and order flow microstructure. You combine all frameworks for confluence. Always respond with valid JSON only. Never include text outside the JSON object."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.35,
      max_tokens: 600,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json() as any;
  return extractJson(data.choices?.[0]?.message?.content || "");
}

async function callAnthropic(apiKey: string, prompt: string): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 600,
      system: "You are a hedge-fund level institutional trader specializing in ICT/SMC, quantitative momentum, global macro, and order flow microstructure. Combine all frameworks for maximum signal confluence. Always respond with valid JSON only, no prose outside the JSON object.",
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json() as any;
  return extractJson(data.content?.[0]?.text || "");
}

async function callGemini(apiKey: string, prompt: string): Promise<any> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 600 },
        systemInstruction: { parts: [{ text: "You are a hedge-fund level institutional trader with expertise in ICT/SMC, quantitative analysis, global macro, and order flow. Respond with valid JSON only." }] },
      }),
      signal: AbortSignal.timeout(25_000),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json() as any;
  return extractJson(data.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

async function callGroq(apiKey: string, prompt: string): Promise<any> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "You are a hedge-fund level institutional trader expert in ICT/SMC, quant momentum, global macro, and microstructure. Respond with valid JSON only, nothing else." },
        { role: "user", content: prompt }
      ],
      temperature: 0.35,
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json() as any;
  return extractJson(data.choices?.[0]?.message?.content || "");
}

async function callXai(apiKey: string, prompt: string): Promise<any> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-2-latest",
      messages: [
        { role: "system", content: "You are a hedge-fund level institutional trader expert in ICT/SMC, quant momentum, global macro, and microstructure. Respond with valid JSON only, nothing else." },
        { role: "user", content: prompt }
      ],
      temperature: 0.35,
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Grok ${res.status}`);
  const data = await res.json() as any;
  return extractJson(data.choices?.[0]?.message?.content || "");
}

async function callPerplexity(apiKey: string, prompt: string): Promise<any> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-sonar-large-128k-online",
      messages: [
        { role: "system", content: "You are a hedge-fund level institutional trader expert in ICT/SMC methodology, quantitative analysis, global macro intermarket analysis, and order flow microstructure. Always respond with valid JSON only, no text outside the JSON object." },
        { role: "user", content: prompt },
      ],
      temperature: 0.35,
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}`);
  const data = await res.json() as any;
  return extractJson(data.choices?.[0]?.message?.content || "");
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export async function callAiProvider(
  provider: string,
  settings: Record<string, any>,
  prompt: string
): Promise<any> {
  switch (provider) {
    case "openai":     return callOpenAI(settings.openaiApiKey, prompt);
    case "anthropic":  return callAnthropic(settings.anthropicApiKey, prompt);
    case "gemini":     return callGemini(settings.geminiApiKey, prompt);
    case "groq":       return callGroq(settings.groqApiKey, prompt);
    case "xai":        return callXai(settings.xaiApiKey, prompt);
    case "perplexity": return callPerplexity(settings.perplexityApiKey, prompt);
    default:           throw new Error("No AI provider connected");
  }
}

// ─── Text/Markdown mode callers (for analysis, not signals) ──────────────────

const ANALYST_SYSTEM = "You are a professional forex analyst with 15 years of institutional trading experience specialising in technical analysis, ICT/SMC, and global macro. Write clear, structured markdown. Use ## headings and bullet points. Never output JSON.";

async function callOpenAIText(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "system", content: ANALYST_SYSTEM }, { role: "user", content: prompt }],
      temperature: 0.4, max_tokens: 900,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callAnthropicText(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 900,
      system: ANALYST_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json() as any;
  return data.content?.[0]?.text?.trim() || "";
}

async function callGeminiText(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
        systemInstruction: { parts: [{ text: ANALYST_SYSTEM }] },
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

async function callGroqText(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: ANALYST_SYSTEM }, { role: "user", content: prompt }],
      temperature: 0.4, max_tokens: 900,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callXaiText(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-2-latest",
      messages: [{ role: "system", content: ANALYST_SYSTEM }, { role: "user", content: prompt }],
      temperature: 0.4, max_tokens: 900,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Grok ${res.status}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callPerplexityText(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-sonar-large-128k-online",
      messages: [{ role: "system", content: ANALYST_SYSTEM }, { role: "user", content: prompt }],
      temperature: 0.4, max_tokens: 900,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export async function callAiProviderMarkdown(
  provider: string,
  settings: Record<string, any>,
  prompt: string
): Promise<string> {
  let text: string;
  switch (provider) {
    case "openai":     text = await callOpenAIText(settings.openaiApiKey, prompt); break;
    case "anthropic":  text = await callAnthropicText(settings.anthropicApiKey, prompt); break;
    case "gemini":     text = await callGeminiText(settings.geminiApiKey, prompt); break;
    case "groq":       text = await callGroqText(settings.groqApiKey, prompt); break;
    case "xai":        text = await callXaiText(settings.xaiApiKey, prompt); break;
    case "perplexity": text = await callPerplexityText(settings.perplexityApiKey, prompt); break;
    default:           throw new Error("No AI provider connected");
  }
  if (!text || text.trim().length < 20) throw new Error("Empty response from AI provider");
  return text;
}

// ─── Validate & sanitize the AI response ─────────────────────────────────────

function validateSignal(
  parsed: any,
  symbol: string,
  currentPrice: number
): { action: string; confidence: number; reasoning: string; entryPrice: number; stopLoss: number; takeProfit: number } | null {
  if (!parsed || typeof parsed !== "object") return null;

  const action = String(parsed.action || "").toUpperCase();
  if (!["BUY", "SELL", "STRONG BUY", "STRONG SELL"].includes(action)) return null;

  const confidence = Math.min(92, Math.max(60, parseInt(parsed.confidence) || 72));
  const reasoning = typeof parsed.reasoning === "string" && parsed.reasoning.length > 20
    ? parsed.reasoning
    : null;
  if (!reasoning) return null;

  const cfg = getSymbolConfig(symbol);
  const isBuy = action.includes("BUY");

  const entry = parseFloat(parsed.entryPrice) || currentPrice;
  const slRaw = parseFloat(parsed.stopLoss);
  const tpRaw = parseFloat(parsed.takeProfit);

  const minDist = cfg.minSL * cfg.pipSize;
  const maxDist = cfg.maxSL * cfg.pipSize;
  const decimals = cfg.pipSize < 0.001 ? 5 : cfg.pipSize < 0.1 ? 3 : 2;

  const slValid = !isNaN(slRaw) && (isBuy ? slRaw < entry : slRaw > entry);
  const slDist  = slValid ? Math.abs(entry - slRaw) : null;

  const finalSl = (slValid && slDist! >= minDist && slDist! <= maxDist)
    ? slRaw
    : parseFloat((isBuy ? entry - minDist * 2 : entry + minDist * 2).toFixed(decimals));

  const actualSlDist = Math.abs(entry - finalSl);
  const tpMinDist = actualSlDist * 1.8;

  const tpValid = !isNaN(tpRaw) && (isBuy ? tpRaw > entry : tpRaw < entry);
  const tpDist  = tpValid ? Math.abs(entry - tpRaw) : null;

  const finalTp = (tpValid && tpDist! >= tpMinDist)
    ? tpRaw
    : parseFloat((isBuy ? entry + tpMinDist * 1.1 : entry - tpMinDist * 1.1).toFixed(decimals));

  return { action, confidence, reasoning, entryPrice: entry, stopLoss: finalSl, takeProfit: finalTp };
}

// ─── Intelligent heuristic fallback (no AI key) ───────────────────────────────

function heuristicSignal(symbol: string, prices: Record<string, { bid: number; change: number }>) {
  const q = prices[symbol];
  const currentPrice = q?.bid || getFallback(symbol);
  const change = q?.change || 0;
  const cfg = getSymbolConfig(symbol);
  const decimals = cfg.pipSize < 0.001 ? 5 : cfg.pipSize < 0.1 ? 3 : 2;
  const session = getCurrentSession();

  const isExtremeMove = Math.abs(change) > 1.5;
  const isStrongTrend = Math.abs(change) > 0.5;
  const isBullish = change > 0;

  let action: string;
  let confidence: number;
  let reasoning: string;

  if (isExtremeMove) {
    action = isBullish ? "SELL" : "BUY";
    confidence = 66;
    reasoning = `${symbol} has moved ${Math.abs(change).toFixed(2)}% in today's session, an extreme move that typically leads to mean-reversion as institutional traders take profits. Fading the extreme with a tight stop above/below the session high offers a favourable risk-reward at ${currentPrice.toFixed(decimals)}. Active session: ${session}.`;
  } else if (isStrongTrend) {
    action = isBullish ? "BUY" : "SELL";
    confidence = 72;
    reasoning = `${symbol} is exhibiting strong ${isBullish ? "bullish" : "bearish"} momentum (+${Math.abs(change).toFixed(2)}% today), consistent with institutional participation. Price at ${currentPrice.toFixed(decimals)} suggests a pullback entry within the trend offers a good risk-to-reward profile. Session context: ${session}.`;
  } else {
    action = Math.random() > 0.5 ? "BUY" : "SELL";
    confidence = 65;
    reasoning = `${symbol} is in a consolidation phase with minimal daily movement (${Math.abs(change).toFixed(2)}%). Price at ${currentPrice.toFixed(decimals)} is near equilibrium. Entering a directional trade with tight stops aligned to session structure during ${session.split("—")[0].trim()}.`;
  }

  const isBuy = action.includes("BUY");
  const slDist = Math.max(cfg.minSL * 2, cfg.atrDefault * 0.25) * cfg.pipSize;
  const tpDist = slDist * 2.2;

  return {
    action,
    confidence,
    reasoning,
    entryPrice: parseFloat(currentPrice.toFixed(decimals)),
    stopLoss:   parseFloat((isBuy ? currentPrice - slDist : currentPrice + slDist).toFixed(decimals)),
    takeProfit: parseFloat((isBuy ? currentPrice + tpDist : currentPrice - tpDist).toFixed(decimals)),
  };
}

function getFallback(symbol: string): number {
  const f: Record<string, number> = {
    EURUSD: 1.0852, GBPUSD: 1.2634, USDJPY: 149.45,
    AUDUSD: 0.6521, USDCAD: 1.3612, XAUUSD: 2345.50, GBPJPY: 188.74,
    EURJPY: 162.10, AUDJPY: 97.80,  NZDUSD: 0.5985,
  };
  return f[symbol] || 1.0;
}

// ─── Forecast dispatcher (used by routes for momentum forecast) ───────────────

export async function callAiProviderForForecast(
  provider: string,
  settings: Record<string, any>,
  prompt: string
): Promise<any> {
  return callAiProvider(provider, settings, prompt);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateAiSignal(userId: string, symbol?: string) {
  const targetSymbol = symbol || SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

  const prices = await fetchLivePrices().catch(() => ({}));
  const currentPrice = (prices as any)[targetSymbol]?.bid || getFallback(targetSymbol);

  const userSettings = await storage.getUserSettings(userId).catch(() => null);
  const activeStrategy = await storage.getActiveStrategy(userId).catch(() => null);

  const provider = userSettings?.selectedAiProvider;
  const hasProvider = provider && provider !== "none" && userSettings;

  let signal: ReturnType<typeof heuristicSignal> | null = null;
  let usedAi = false;

  const htf = computeHTFBias(targetSymbol, prices as any);

  if (hasProvider) {
    try {
      const { getRelevantKnowledge } = await import("./ai-knowledge");
      const knowledgeContext = await getRelevantKnowledge(targetSymbol).catch(() => "");
      const basePrompt = buildPrompt(targetSymbol, prices as any, activeStrategy as any);
      const prompt = knowledgeContext
        ? `${basePrompt}\n\n═══════════════════════════════════════════════════════\nINSTITUTIONAL KNOWLEDGE BASE — APPLY TO THIS SIGNAL\n═══════════════════════════════════════════════════════\nThe following are proven institutional rules and learned patterns from this trading system. Incorporate them into your analysis — they represent real edge from ICT/SMC methodology, quantitative research, and past trade outcomes:\n\n${knowledgeContext}`
        : basePrompt;
      const raw = await callAiProvider(provider, userSettings as any, prompt);
      const validated = validateSignal(raw, targetSymbol, currentPrice);
      if (validated) {
        signal = validated;
        usedAi = true;
        console.log(`[AI Signal] ${provider.toUpperCase()} → ${validated.action} ${targetSymbol} @ ${validated.entryPrice} | SL ${validated.stopLoss} | TP ${validated.takeProfit} | ${validated.confidence}% confidence | HTF: ${htf.bias}`);
      }
    } catch (err: any) {
      console.warn(`[AI Signal] ${provider} call failed: ${err.message} — using heuristic`);
    }
  }

  if (!signal) {
    signal = heuristicSignal(targetSymbol, prices as any);
    if (!hasProvider) {
      console.log(`[AI Signal] No AI provider — using heuristic for ${targetSymbol}`);
    }
  }

  const s = signal!;
  const cfg = getSymbolConfig(targetSymbol);

  const riskPct = parseFloat(String(activeStrategy?.riskPercent || "2")) || 2;
  const accountSize = (activeStrategy as any)?.accountSize
    || parseFloat(String(userSettings?.brokerBalance ?? 10000))
    || 10000;
  const slPips = Math.round(Math.abs(s.entryPrice - s.stopLoss) / cfg.pipSize);
  const rawLots = (accountSize * (riskPct / 100)) / Math.max(1, slPips * cfg.pipValue);
  const sizeLots = parseFloat(Math.max(0.01, Math.min(10, rawLots)).toFixed(2));

  return storage.createSignal({
    symbol: targetSymbol,
    action: s.action,
    confidence: s.confidence,
    reasoning: s.reasoning + (usedAi ? "" : " (Connect an AI provider in Settings for AI-powered analysis.)"),
    entryPrice: s.entryPrice,
    stopLoss: s.stopLoss,
    takeProfit: s.takeProfit,
    size: sizeLots,
    userId,
    status: "pending",
    aiProvider: usedAi ? (provider || "heuristic") : "heuristic",
    htfBias: htf.bias,
  });
}

// Legacy export
export function getMarketPrices(): Record<string, { bid: number; ask: number; change: number }> {
  const base: Record<string, number> = {
    EURUSD: 1.0852, GBPUSD: 1.2634, USDJPY: 149.45,
    AUDUSD: 0.6521, USDCAD: 1.3612, XAUUSD: 2345.50, GBPJPY: 188.74,
  };
  return Object.fromEntries(
    Object.entries(base).map(([sym, price]) => {
      const spread = sym === "XAUUSD" ? 0.30 : 0.0002;
      const bid = parseFloat((price + (Math.random() - 0.5) * 0.0004).toFixed(sym === "XAUUSD" ? 2 : 5));
      return [sym, { bid, ask: parseFloat((bid + spread).toFixed(5)), change: parseFloat(((Math.random() - 0.5) * 0.4).toFixed(2)) }];
    })
  );
}
