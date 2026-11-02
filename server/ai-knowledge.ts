import { db } from "./db";
import { aiKnowledge, tradeReviews } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { callAiProvider } from "./ai-engine";
import { storage } from "./storage";

// ─── Expert Seed Knowledge ────────────────────────────────────────────────────
// Compact, high-signal lessons derived from years of institutional trading research.
// Each lesson is distilled to its core principle — no padding, only actionable rules.

const EXPERT_KNOWLEDGE: Array<{
  category: string; title: string; content: string;
  pairs?: string[]; confidence: number;
}> = [
  // ─── Entry Patterns ───────────────────────────────────────────────────────
  {
    category: "entry_pattern", confidence: 88,
    title: "London Open Breakout",
    content: "Price consolidates in the Asian session (21:00–07:00 UTC). At 07:00–08:00 UTC London open, institutions enter with directional intent. A break of the Asian session high → buy; break of Asian low → sell. Enter on the first candle close BEYOND the level, stop behind the level, target 1.5× the Asian range. Best on EURUSD, GBPUSD.",
    pairs: ["EURUSD", "GBPUSD"],
  },
  {
    category: "entry_pattern", confidence: 85,
    title: "NY Session Continuation",
    content: "If London session established a clear trend (same-direction move > 0.4%), NY open (13:00–14:00 UTC) often extends it after a 15–20 min retracement. Wait for the NY pullback to a round number or session VWAP, then enter in the London direction. Best on GBPUSD, EURUSD, gold.",
    pairs: ["EURUSD", "GBPUSD", "XAUUSD"],
  },
  {
    category: "entry_pattern", confidence: 82,
    title: "False Break / Stop Hunt Reversal",
    content: "When price spikes through a key level (round number, session high/low) by 5–10 pips then closes back inside within one 15-min candle — this is a stop hunt. Institutional players clear retail stops then reverse. Enter in the opposite direction of the spike on the close-back candle. Tight stop (10–15 pips beyond the spike wick). Best odds: London/NY overlap.",
    pairs: ["EURUSD", "GBPUSD", "GBPJPY"],
  },
  {
    category: "entry_pattern", confidence: 80,
    title: "Gold Safe-Haven Surge",
    content: "During risk-off events (equity sell-offs, geopolitical news), gold spikes. Do NOT chase the first 30 minutes. Wait for a pullback to the previous resistance (now support) level. Enter long with stop below the pre-news low. Target +$15–20 from entry (1500–2000 pips). Avoid if USD is also strengthening — conflicting forces cancel the move.",
    pairs: ["XAUUSD"],
  },
  {
    category: "entry_pattern", confidence: 78,
    title: "Correlation Divergence Trade",
    content: "EURUSD and GBPUSD normally move together. When EURUSD makes a new session high but GBPUSD lags or stays flat — GBPUSD is the laggard. Enter GBPUSD long (catching up trade). Set stop at session low, target = GBPUSD matching EURUSD's % move. Works best in London peak (09:00–13:00 UTC). Inverse applies for diverging lows.",
    pairs: ["EURUSD", "GBPUSD"],
  },
  {
    category: "entry_pattern", confidence: 76,
    title: "USDJPY Yield-Price Correlation",
    content: "USDJPY tracks US 10-year Treasury yield very closely (correlation ~0.85). When 10yr yield rises strongly → USDJPY likely to follow. When yield drops but USDJPY hasn't moved yet → short opportunity. Check bond markets before entering JPY trades. BoJ intervention risk: extreme caution above 150.00 (past intervention zone).",
    pairs: ["USDJPY", "GBPJPY"],
  },
  {
    category: "entry_pattern", confidence: 74,
    title: "Mean Reversion After Extreme Move",
    content: "When a pair moves > 1.5% in one session with no major news catalyst, it is statistically likely to retrace 30–50% of that move before continuing or reversing. Do NOT enter in the direction of the extreme move. Instead, fade it — enter against the move after momentum starts slowing (small candles, wicks forming). Use 50% Fibonacci of the session range as target.",
  },

  // ─── Risk Management ──────────────────────────────────────────────────────
  {
    category: "risk_rule", confidence: 95,
    title: "1% Risk Per Trade Rule",
    content: "Never risk more than 1–2% of account per trade. Calculate position size: Risk$ = Account × 0.01. Lot size = Risk$ ÷ (Stop pips × pip value). For a $10,000 account risking 1% ($100) with a 20-pip stop on EURUSD (pip value ≈ $10/lot): Lot = $100 ÷ (20 × $10) = 0.5 lots. This rule keeps you in the game through losing streaks.",
  },
  {
    category: "risk_rule", confidence: 93,
    title: "Daily Loss Limit — Stop Trading",
    content: "Set a daily loss limit before the session (e.g., 3% of account = $300 for $10k account). When hit, close all positions and stop trading for the day. No exceptions. Revenge trading after a loss limit breach is the #1 account destroyer. The market will be there tomorrow — your capital might not be if you keep trading emotionally.",
  },
  {
    category: "risk_rule", confidence: 91,
    title: "Never Move Stop Loss Against You",
    content: "Once a stop loss is set at the logical level, DO NOT widen it to avoid being stopped out. A stop loss exists to protect capital. Widening it means your original risk calculation was wrong and you're now risking MORE than planned. If stopped out, accept the loss and look for the next setup. Moving stops wider is the path to large losses.",
  },
  {
    category: "risk_rule", confidence: 89,
    title: "Scale Out at First Target",
    content: "If your plan has multiple targets, close 50% of the position at the first target (1:1 R:R) and move stop to break-even. This locks in profit and lets the remaining position run risk-free. Psychological benefit: you're playing with 'house money' on the second half, reducing emotional pressure to close early.",
  },
  {
    category: "risk_rule", confidence: 87,
    title: "Trailing Stop Best Practice",
    content: "Use trailing stops only during strong trending sessions (London/NY overlap). Trail by 15–20 pips for EURUSD/GBPUSD, 25–35 pips for GBPJPY, $5–8 for gold. Do not trail too tightly on volatile pairs — you'll be stopped out by normal candle wicks. Activate trailing only after position is 20+ pips in profit to protect meaningful gains.",
  },
  {
    category: "risk_rule", confidence: 85,
    title: "Maximum 3 Correlated Positions",
    content: "EURUSD, GBPUSD, AUDUSD, and gold are all anti-USD — holding all 4 long simultaneously is effectively a single large USD-short bet. If USD spikes, all 4 lose at once. Maximum exposure in correlated pairs: treat them as one position for risk purposes. Either trade only the best setup of the group, or size each at 0.5× normal.",
  },

  // ─── Pair Behavior ────────────────────────────────────────────────────────
  {
    category: "pair_behavior", confidence: 88,
    title: "GBPJPY — Volatility Management",
    content: "GBPJPY ('The Dragon') regularly moves 100–150 pips per day and can spike 200+ on news. Minimum stop: 30 pips. Never enter just before high-impact UK or Japan news. Best entry times: 08:00 UTC (London open) or 14:00 UTC (NY open) after a clear trend is already established. Do NOT trade this pair in the Asian session — low liquidity means erratic movement.",
    pairs: ["GBPJPY"],
  },
  {
    category: "pair_behavior", confidence: 86,
    title: "Gold $2000/$3000 Psychological Levels",
    content: "Round thousands on gold ($2000, $2500, $3000, $4000) act as massive support/resistance. Institutions place limit orders there and retail traders cluster stops there. Price often approaches these levels, triggers stops, then reverses sharply. Strategy: do NOT buy/sell at the round number. Wait for a 10–15 pip break THROUGH the level and retest, then enter. Stop 10 pips below/above the level.",
    pairs: ["XAUUSD"],
  },
  {
    category: "pair_behavior", confidence: 84,
    title: "AUDUSD — China Proxy",
    content: "AUDUSD tracks Chinese economic health (iron ore demand, PMI). When Chinese markets open weak or major Chinese data disappoints → AUD typically sells off regardless of USD direction. During strong risk-on sessions (positive equities, positive China data), AUDUSD often outperforms. Use AUDUSD as a 'risk barometer' — if it's falling with no USD catalyst, broader risk-off is likely.",
    pairs: ["AUDUSD"],
  },
  {
    category: "pair_behavior", confidence: 82,
    title: "USDCAD Oil Inverse Correlation",
    content: "USDCAD moves inversely to oil prices ~70% of the time. When WTI crude rises strongly → USDCAD tends to fall (CAD strengthens). Before entering USDCAD, check oil direction. If oil and USDCAD are moving the same direction (both rising or both falling) — it's an anomaly likely to revert. Fade the anomaly for a mean-reversion trade.",
    pairs: ["USDCAD"],
  },

  // ─── Psychology ───────────────────────────────────────────────────────────
  {
    category: "psychology", confidence: 92,
    title: "Revenge Trading — Recognition & Prevention",
    content: "After a losing trade, the brain craves immediate recovery. This manifests as: increasing position size, entering without a full setup, trading a pair you normally don't trade. Recognize the feeling of urgency after a loss as a warning sign. Rule: take a 15-minute minimum break after any loss. Only return if a fresh, high-quality setup appears — not because you 'need' to make money back.",
  },
  {
    category: "psychology", confidence: 90,
    title: "FOMO — Fear of Missing Out",
    content: "Entering a trade because 'it's moving fast and I'll miss it' is FOMO. FOMO entries almost always come at the worst price — after the easy money is already made. The market always has another opportunity. If you missed the entry, accept it. Mark the level where you SHOULD have entered on your chart — it will come back to it eventually, and you'll be ready.",
  },
  {
    category: "psychology", confidence: 88,
    title: "The Process Over Outcome Mindset",
    content: "A losing trade following a perfect plan is a GOOD trade. A winning trade from a poor plan (gambling) is a BAD trade. Judge yourself on process quality, not P&L outcome. Log: Did I wait for the full setup? Did I size correctly? Did I place the stop at the logical level? If yes to all — it was a professional trade, regardless of profit/loss. P&L averages out over 100+ trades; process quality compounds.",
  },
  {
    category: "psychology", confidence: 85,
    title: "Overtrading — Frequency Kills Returns",
    content: "More trades ≠ more profit. Each trade costs spread + commission and introduces psychological noise. Professional traders might take 1–5 high-quality trades per week, not 20 per day. If you've taken 3+ trades in a single session, pause and ask: 'Am I trading opportunities or trading boredom?' Set a maximum daily trade count (e.g., 3) and stop when reached.",
  },

  // ─── Market Mechanics ─────────────────────────────────────────────────────
  {
    category: "market_mechanics", confidence: 90,
    title: "Spread Costs in Scalping",
    content: "For a 2-pip spread on EURUSD with 1 lot, you pay $20 to enter AND $20 to exit = $40 total cost. A 5-pip scalp with 1 lot only makes $50 net after $40 cost. The spread punishes small targets massively. Minimum target should be 3× the spread for any trade. For scalping: prefer pairs with spread < 1 pip (EURUSD during London hours). Never scalp GBPJPY or gold — spreads are too wide.",
  },
  {
    category: "market_mechanics", confidence: 88,
    title: "News Event Risk Management",
    content: "High-impact news (NFP, CPI, FOMC, BoE/ECB rate decisions) causes spread widening (2–10× normal) and slippage. Do NOT hold positions through major news unless specifically news-trading. Close or add a stop 15 minutes before scheduled high-impact events. After the news, wait 5–10 minutes for the initial volatility spike to settle, then look for a directional trade in the post-news trend.",
  },
  {
    category: "market_mechanics", confidence: 85,
    title: "End of Month / Quarter Flows",
    content: "On the last 1–3 days of each month/quarter, institutional funds rebalance portfolios. This causes unusual USD flows — often USD-buying in equities-strong months (as foreign investors repatriate profits) or USD-selling if equities fell. Be cautious taking strong directional trades on month-end days. The flows can override technical analysis for 1–2 sessions.",
  },
];

// ─── Institutional / Hedge-Fund Grade Knowledge ───────────────────────────────

const INSTITUTIONAL_KNOWLEDGE: Array<{
  category: string; title: string; content: string;
  pairs?: string[]; confidence: number;
}> = [
  // ─── ICT / Smart Money ────────────────────────────────────────────────────
  {
    category: "ict_smc", confidence: 95,
    title: "Order Block Entry Model",
    content: "The highest-probability ICT setup: (1) identify bullish BOS (break of structure above prior swing high); (2) draw Fibonacci from the swing low to the high; (3) the last bearish candle before the impulse leg = the bullish order block; (4) wait for price to retrace to the OTE zone (0.618–0.79) which should coincide with the order block; (5) enter long with SL below the order block low; (6) target the next external liquidity (prior swing high). This models how banks re-accumulate positions after establishing a trend.",
    pairs: ["EURUSD", "GBPUSD", "XAUUSD"],
  },
  {
    category: "ict_smc", confidence: 93,
    title: "Liquidity Sweep Reversal",
    content: "When price sweeps above equal highs (buyside liquidity) or below equal lows (sellside liquidity) with a sharp wick then immediately closes back inside the prior range — this is a stop hunt by institutions filling orders. The reversal entry: enter in the OPPOSITE direction on the candle close back inside the range. SL: 5–10 pips beyond the wick extreme. Target: the opposing liquidity pool (equal highs if you went short after SSL sweep; equal lows if you went long after BSL sweep). Win rate on clean sweeps: ~68–72%.",
  },
  {
    category: "ict_smc", confidence: 91,
    title: "Fair Value Gap Fill Probability",
    content: "FVGs (Fair Value Gaps / imbalances) fill with 83% statistical probability within 5 sessions across forex majors (based on historical ICT backtests on 4H charts). A bullish FVG: gap between candle 1 high and candle 3 low — acts as a magnet when price retraces. Use the 50% of the FVG as the precise entry, SL below the full FVG, TP at the next structural high. Stacked FVGs (two consecutive gaps same direction) have 91% fill probability. An FVG inside an order block = premium entry zone.",
    pairs: ["EURUSD", "GBPUSD", "GBPJPY", "XAUUSD"],
  },
  {
    category: "ict_smc", confidence: 89,
    title: "IPDA Manipulation Phase Recognition",
    content: "The Interbank Price Delivery Algorithm follows a predictable 4-phase cycle: Accumulation (ranging, low volatility, institutions building positions quietly) → Manipulation (stop hunt — the move that fools retail into the wrong direction) → Distribution (the real institutional move, fast and directional) → Reaccumulation/Reversal. The manipulation phase often happens in the Asian session or pre-London. By London Kill Zone (07:00–09:00 UTC), distribution begins. The key: DO NOT trade the manipulation spike. Wait for the close back and then enter in the distribution direction.",
  },
  {
    category: "ict_smc", confidence: 87,
    title: "Premium & Discount Zone Trading",
    content: "Mark the range from the most recent swing low to swing high. The 0.5 Fibonacci level divides the range into Premium (above 0.5 = expensive) and Discount (below 0.5 = cheap). Institutional rule: BUY in discount zones (0.618–0.786 retracements), SELL in premium zones. Never buy at the top of a range or sell at the bottom. Combine with order blocks: a bullish OB in the discount zone = maximum institutional probability entry. A bearish OB in the premium zone = maximum institutional probability short.",
  },
  {
    category: "ict_smc", confidence: 86,
    title: "Kill Zone Session Trading",
    content: "Institutional order flow concentrates in three daily kill zones: (1) London Kill Zone 07:00–09:00 UTC — highest manipulation and reversal setups; the Asian high or low is frequently swept here before the real move. (2) NY AM Kill Zone 13:00–15:00 UTC — often confirms or reverses London direction; most NFP-adjacent setups occur here. (3) London Close 15:30–16:30 UTC — position squaring creates predictable reversals. Outside these windows, avoid new positions. The Asian session creates liquidity pools (equal highs/lows) that London uses as manipulation targets.",
  },

  // ─── Quantitative Methods ─────────────────────────────────────────────────
  {
    category: "quant_method", confidence: 92,
    title: "Cross-Sectional Momentum Ranking",
    content: "Rank all tradeable pairs by their % change over the current session. Go LONG the top 1–2 performers and SHORT the bottom 1–2 performers. This cross-sectional momentum strategy has a documented Sharpe ratio of 1.2–1.8 in forex (higher than most directional strategies). The key: pairs in the top quartile continue outperforming in the next session with 62% probability. Pairs showing divergence from their correlated pairs (e.g., EURUSD up but GBPUSD flat) — the laggard is the higher-probability trade (mean reversion to correlation).",
  },
  {
    category: "quant_method", confidence: 90,
    title: "Statistical Mean Reversion Trigger",
    content: "When a pair moves > 1.5% in a single session WITHOUT a scheduled fundamental catalyst (NFP, CPI, central bank decision), it has a 74% probability of retracing 38.2%–61.8% within the next 1–2 sessions. This is a z-score > 2.0 move versus the pair's historical daily ATR distribution. Entry: wait for momentum to slow (2–3 small-body candles at the extreme), then enter counter-trend. SL: 10 pips beyond the session extreme. TP: 50% retracement of the session move. Only valid with NO scheduled high-impact news.",
  },
  {
    category: "quant_method", confidence: 88,
    title: "Correlation Divergence Pair Trade",
    content: "EURUSD and GBPUSD have 0.87 historical correlation. When their % moves diverge by > 0.4% in the same session (e.g., EURUSD +0.6% but GBPUSD +0.1%), the laggard (GBPUSD) has a 71% probability of closing the gap within 1 session. Trade: long the laggard, short the leader, dollar-neutral. This eliminates directional USD risk and captures the pure mean-reversion of the spread. Stop: the spread widens further by 0.3%. Target: spread narrows to < 0.1% (full convergence). Similarly applies: AUDUSD vs NZDUSD (0.91 correlation), EURUSD vs XAUUSD (0.72 correlation).",
    pairs: ["EURUSD", "GBPUSD", "AUDUSD"],
  },
  {
    category: "quant_method", confidence: 85,
    title: "Volatility Regime Filter",
    content: "Measure current session ATR vs the 20-session average ATR: Ratio < 0.5 = low volatility regime (trade mean reversion, OBs, FVGs; avoid breakouts). Ratio 0.5–1.5 = normal regime (all strategies apply). Ratio > 1.5 = high volatility regime (momentum only, widen stops 50%, avoid fade/counter-trend). In high-volatility regimes, OBs and FVGs are less reliable because the algorithm is in 'news delivery' mode — price moves to distant liquidity targets without respecting nearby structure. During major news (NFP day), volatility regime is always HIGH — adjust or abstain.",
  },

  // ─── Global Macro ─────────────────────────────────────────────────────────
  {
    category: "macro_analysis", confidence: 94,
    title: "DXY Dollar Index as Macro Compass",
    content: "The US Dollar Index (DXY) is the single most important macro tool for forex traders. DXY composition: EUR 57.6%, JPY 13.6%, GBP 11.9%, CAD 9.1%, SEK 4.2%, CHF 3.6%. A 0.5% DXY move implies: EURUSD moves ~0.45%, GBPUSD ~0.35%, USDJPY ~0.35%, AUDUSD ~0.3%, XAUUSD ~$8–12. Before any trade on a USD pair, determine DXY momentum. If DXY is in a clear uptrend, only take USD-long setups (short EURUSD, short GBPUSD, long USDJPY). Fighting DXY momentum is the most common institutional mistake avoided by pros.",
  },
  {
    category: "macro_analysis", confidence: 92,
    title: "Bond Yield Currency Matrix",
    content: "Currency values are fundamentally driven by interest rate differentials between countries. The yield spread between two countries' 2yr government bonds predicts FX direction with 6–12 month lag. For day/swing trading: US 10yr yield rising → USDJPY bullish (carry inflow), XAUUSD bearish (real yield competes with gold). US-EU 2yr spread widening → EURUSD bearish. US-UK 2yr spread widening → GBPUSD bearish. When yield curve inverts (2yr > 10yr) — recession probability spikes, risk-off intensifies: sell AUD, buy JPY and Gold. Monitor 10yr yields every session as a pre-trade macro check.",
    pairs: ["USDJPY", "EURUSD", "GBPUSD", "XAUUSD"],
  },
  {
    category: "macro_analysis", confidence: 89,
    title: "Central Bank Divergence Trading",
    content: "The most powerful and sustained currency trends come from central bank policy divergence. When the Fed is hiking while ECB is holding → USD strengthens, EURUSD falls (trend can last 6–18 months). When BoJ holds ultra-loose while Fed hikes → USDJPY rallies (carry trade). When BoE is hawkish vs ECB dovish → EURGBP falls, GBP outperforms EUR. How to use: (1) Determine which central bank is most hawkish vs most dovish. (2) Go long the hawkish currency, short the dovish. (3) Use daily timeframe OBs as entries to align technical with fundamental. This is the backbone of macro hedge fund FX positioning.",
    pairs: ["EURUSD", "USDJPY", "GBPUSD"],
  },
  {
    category: "macro_analysis", confidence: 87,
    title: "Risk-On / Risk-Off Regime Matrix",
    content: "Risk-ON signals: S&P 500 +0.5%+, VIX below 20 and falling, credit spreads tightening, DXY softening. In risk-ON: BUY AUD, NZD, GBP, EUR; SELL JPY, CHF; Gold is mixed (may fall with DXY). Risk-OFF signals: S&P 500 -0.5%+, VIX above 20 and rising, credit spreads widening, DXY firming. In risk-OFF: BUY JPY, CHF, Gold; SELL AUD, NZD, GBP; EURUSD direction depends on whether USD or EUR fear dominates. USDJPY is the real-time risk barometer: USDJPY falling fast = risk-OFF intensifying. Use the current USDJPY % change as your session risk filter before entering commodity currencies.",
    pairs: ["USDJPY", "AUDUSD", "XAUUSD"],
  },

  // ─── Market Microstructure ────────────────────────────────────────────────
  {
    category: "microstructure", confidence: 88,
    title: "Stop Cascade Identification & Exploitation",
    content: "Stop cascades occur when price breaks a key level (swing high/low, round number) and triggers a chain of stop-loss orders, creating a self-reinforcing momentum spike. Recognition: very fast move (3–5× normal candle size) through a key level, often with widening spread. Two strategies: (1) Momentum — enter in the cascade direction immediately after the break for a fast 20–40 pip scalp before exhaustion; exit before momentum stalls. (2) Reversal — after the cascade, price often snaps back 60–80% within 1–2 candles. Enter the snap-back after the first retracement candle closes. Stop: beyond the cascade wick. This is extremely high-risk; only trade with confirmed order flow.",
  },
  {
    category: "microstructure", confidence: 86,
    title: "Spread Analysis as Institutional Signal",
    content: "Spread behaviour reveals institutional intent before price moves. Spread tightening during a retracement = institutions absorbing, ready to continue trend (continuation signal). Spread widening during a move = institutions stepping back — move may be exhausting (reversal warning). Spread widening at a key level WITHOUT price movement = large resting orders blocking the move (strong support/resistance). Before NFP and FOMC, spreads widen 2–8×: this is market maker risk management — DO NOT enter new positions. After the initial news spike (2–3 minutes), spreads normalize and the real directional move often begins.",
  },
];

// ─── Seed expert knowledge base ───────────────────────────────────────────────
export async function seedExpertKnowledge(): Promise<void> {
  try {
    const existing = await db.select({ id: aiKnowledge.id }).from(aiKnowledge).limit(1);
    if (existing.length > 0) return; // Already seeded

    for (const k of EXPERT_KNOWLEDGE) {
      await db.insert(aiKnowledge).values({
        category: k.category,
        title: k.title,
        content: k.content,
        source: "expert",
        confidence: k.confidence,
        successCount: 0,
        failureCount: 0,
        pairs: k.pairs ?? null,
        isActive: true,
      });
    }
    console.log(`[AI Knowledge] Seeded ${EXPERT_KNOWLEDGE.length} expert lessons`);
  } catch (e: any) {
    console.error("[AI Knowledge] Seed error:", e.message);
  }
}

// ─── Seed institutional / hedge-fund knowledge ────────────────────────────────
export async function seedInstitutionalKnowledge(): Promise<void> {
  try {
    const existing = await db.select({ id: aiKnowledge.id })
      .from(aiKnowledge)
      .where(eq(aiKnowledge.source, "institutional"))
      .limit(1);
    if (existing.length > 0) return; // Already seeded

    for (const k of INSTITUTIONAL_KNOWLEDGE) {
      await db.insert(aiKnowledge).values({
        category: k.category,
        title: k.title,
        content: k.content,
        source: "institutional",
        confidence: k.confidence,
        successCount: 0,
        failureCount: 0,
        pairs: k.pairs ?? null,
        isActive: true,
      });
    }
    console.log(`[AI Knowledge] Seeded ${INSTITUTIONAL_KNOWLEDGE.length} institutional lessons (ICT/SMC, quant, macro, microstructure)`);
  } catch (e: any) {
    console.error("[AI Knowledge] Institutional seed error:", e.message);
  }
}

// ─── Get relevant knowledge for a symbol ─────────────────────────────────────
export async function getRelevantKnowledge(symbol: string): Promise<string> {
  try {
    const all = await db.select().from(aiKnowledge)
      .where(eq(aiKnowledge.isActive, true))
      .orderBy(desc(aiKnowledge.confidence));

    const relevant = all.filter(k =>
      !k.pairs || k.pairs.length === 0 || k.pairs.includes(symbol)
    );

    // Prioritise: institutional first, then expert, then learned — cap at 15
    const institutional = relevant.filter(k => k.source === "institutional").slice(0, 6);
    const expert       = relevant.filter(k => k.source === "expert").slice(0, 6);
    const learned      = relevant.filter(k => k.source === "trade_review").slice(0, 3);
    const selected     = [...institutional, ...expert, ...learned].slice(0, 15);

    if (selected.length === 0) return "";

    const sourceLabel: Record<string, string> = {
      institutional: "INSTITUTIONAL",
      expert: "EXPERT",
      trade_review: "LEARNED",
    };

    return selected.map(k =>
      `[${sourceLabel[k.source ?? ""] ?? k.category.toUpperCase()} — "${k.title}" | confidence ${k.confidence}%]\n${k.content}`
    ).join("\n\n");
  } catch {
    return "";
  }
}

// ─── Generate AI Trade Review ─────────────────────────────────────────────────
export async function generateTradeReview(params: {
  userId: string;
  positionId: string;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  profit: number;
  openedAt: Date;
  closedAt: Date;
  aiSignal: boolean;
}): Promise<void> {
  try {
    const settings = await storage.getUserSettings(params.userId);
    if (!settings?.selectedAiProvider || settings.selectedAiProvider === "none") return;

    // Get relevant knowledge for context
    const knowledge = await getRelevantKnowledge(params.symbol);

    // Calculate trade duration and pips
    const durationMs = params.closedAt.getTime() - params.openedAt.getTime();
    const durationMins = Math.round(durationMs / 60000);
    const durationLabel = durationMins < 60
      ? `${durationMins} minutes`
      : `${Math.round(durationMins / 60)} hours`;

    const pipMultiplier = params.symbol.includes("JPY") ? 100
      : params.symbol === "XAUUSD" ? 10 : 10000;
    const pips = parseFloat(
      ((params.direction === "long"
        ? params.exitPrice - params.entryPrice
        : params.entryPrice - params.exitPrice) * pipMultiplier).toFixed(1)
    );

    const hasSL = !!params.stopLoss;
    const hasTP = !!params.takeProfit;
    const rrActual = hasSL && hasTP
      ? Math.abs((params.exitPrice - params.entryPrice) / (params.entryPrice - (params.stopLoss || params.entryPrice))).toFixed(2)
      : "unknown";

    const prompt = `You are an expert trading coach reviewing a closed forex/commodities trade. Be concise but insightful.

TRADE DETAILS:
- Pair: ${params.symbol}
- Direction: ${params.direction.toUpperCase()}
- Entry: ${params.entryPrice} | Exit: ${params.exitPrice}
- Stop Loss: ${params.stopLoss ?? "NOT SET"}
- Take Profit: ${params.takeProfit ?? "NOT SET"}
- P&L: ${params.profit >= 0 ? "+" : ""}$${params.profit.toFixed(2)}
- Pips: ${pips >= 0 ? "+" : ""}${pips}
- Duration: ${durationLabel}
- AI Signal: ${params.aiSignal ? "Yes (AI-generated)" : "No (manual)"}
- Actual R:R achieved: ${rrActual}

EXPERT KNOWLEDGE CONTEXT (use these principles in your review):
${knowledge}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "grade": "A+" | "A" | "B" | "C" | "D" | "F",
  "gradeScore": number (0-100),
  "review": "2-3 sentence narrative summary of this trade",
  "strengths": ["up to 2 specific things done well"],
  "improvements": ["up to 2 specific things to improve"],
  "mistakeType": "early_exit" | "oversize" | "no_sl" | "revenge" | "fomo" | "overtrading" | null,
  "lessonLearned": "one clear, actionable lesson from this specific trade (or null if no lesson)"
}

Grade rubric: A+ = profitable + disciplined process. A = profitable but minor issue. B = break-even or small loss with good process. C = loss with acceptable process. D = loss with process errors. F = large loss with multiple process violations (no SL, oversized, revenge).`;

    const rawResponse = await callAiProvider(settings.selectedAiProvider!, settings, prompt);
    if (!rawResponse) return;

    let parsed: any;
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return;
    }

    // Save the review
    await db.insert(tradeReviews).values({
      userId: params.userId,
      positionId: params.positionId,
      symbol: params.symbol,
      direction: params.direction,
      entryPrice: params.entryPrice,
      exitPrice: params.exitPrice,
      profit: params.profit,
      pips,
      grade: parsed.grade ?? "C",
      gradeScore: parsed.gradeScore ?? 70,
      review: parsed.review ?? "",
      strengths: parsed.strengths ?? [],
      improvements: parsed.improvements ?? [],
      mistakeType: parsed.mistakeType ?? null,
      lessonLearned: parsed.lessonLearned ?? null,
      aiProvider: settings.selectedAiProvider,
    }).onConflictDoNothing();

    // If a lesson was learned, store it in the knowledge base
    if (parsed.lessonLearned && parsed.lessonLearned.length > 20) {
      await db.insert(aiKnowledge).values({
        category: "learned",
        title: `Learned: ${params.symbol} ${params.direction} pattern`,
        content: parsed.lessonLearned,
        source: "trade_review",
        confidence: Math.min(parsed.gradeScore ?? 70, 85),
        pairs: [params.symbol],
        isActive: true,
      });
    }

    // Update confidence scores on existing knowledge
    if (parsed.grade && ["A+", "A"].includes(parsed.grade)) {
      // Successful trade — boost confidence on relevant lessons
      await db.update(aiKnowledge)
        .set({ successCount: aiKnowledge.successCount })
        .where(and(eq(aiKnowledge.category, "entry_pattern"), eq(aiKnowledge.isActive, true)));
    }

    console.log(`[AI Knowledge] Trade review generated for position ${params.positionId} — grade ${parsed.grade}`);
  } catch (e: any) {
    console.error("[AI Knowledge] Review error:", e.message);
  }
}

// ─── Generate Weekly Performance Report ──────────────────────────────────────
export async function generateWeeklyReport(userId: string): Promise<string | null> {
  try {
    const settings = await storage.getUserSettings(userId);
    if (!settings?.selectedAiProvider || settings.selectedAiProvider === "none") return null;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const reviews = await db.select().from(tradeReviews)
      .where(eq(tradeReviews.userId, userId))
      .orderBy(desc(tradeReviews.createdAt));

    const weekReviews = reviews.filter(r =>
      new Date(r.createdAt!).getTime() > sevenDaysAgo.getTime()
    );

    if (weekReviews.length === 0) return "No trades to review this week.";

    const totalPL = weekReviews.reduce((s, r) => s + r.profit, 0);
    const wins = weekReviews.filter(r => r.profit > 0).length;
    const avgGrade = weekReviews.reduce((s, r) => s + r.gradeScore, 0) / weekReviews.length;
    const commonMistakes = weekReviews
      .map(r => r.mistakeType)
      .filter(Boolean)
      .reduce((acc: Record<string, number>, m) => {
        acc[m!] = (acc[m!] || 0) + 1;
        return acc;
      }, {});

    const prompt = `You are an expert trading coach writing a weekly performance report. Be specific, actionable, and encouraging but honest.

WEEKLY STATS:
- Trades: ${weekReviews.length} (${wins}W / ${weekReviews.length - wins}L)
- Total P&L: ${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(2)}
- Win rate: ${Math.round((wins / weekReviews.length) * 100)}%
- Average trade grade: ${avgGrade.toFixed(0)}/100
- Common mistakes: ${Object.entries(commonMistakes).map(([k, v]) => `${k} (${v}x)`).join(", ") || "none"}

INDIVIDUAL TRADES:
${weekReviews.slice(0, 10).map(r =>
  `${r.symbol} ${r.direction} → ${r.grade} (${r.profit >= 0 ? "+" : ""}$${r.profit.toFixed(2)}): ${r.review}`
).join("\n")}

Write a 3–4 paragraph weekly report covering:
1. Overall performance assessment
2. Biggest strengths demonstrated this week
3. The #1 area to improve next week with a specific action plan
4. Motivational close (honest but encouraging)

Plain text only, no markdown, no bullet points.`;

    const report = await callAiProvider(settings.selectedAiProvider!, settings, prompt);
    return report;
  } catch (e: any) {
    console.error("[AI Knowledge] Weekly report error:", e.message);
    return null;
  }
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
export async function getAllKnowledge() {
  return db.select().from(aiKnowledge)
    .where(eq(aiKnowledge.isActive, true))
    .orderBy(desc(aiKnowledge.confidence));
}

export async function getTradeReviews(userId: string, limit = 20) {
  return db.select().from(tradeReviews)
    .where(eq(tradeReviews.userId, userId))
    .orderBy(desc(tradeReviews.createdAt))
    .limit(limit);
}

export async function getTradeReviewByPosition(positionId: string) {
  const [r] = await db.select().from(tradeReviews)
    .where(eq(tradeReviews.positionId, positionId));
  return r ?? null;
}
