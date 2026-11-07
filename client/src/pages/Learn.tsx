import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, ChevronRight, BookOpen, Search, CheckCircle2,
  Circle, Clock, Trophy, Zap, TrendingUp, Brain, Shield,
  BarChart2, Layers, Target, AlertTriangle, Star, Filter, HelpCircle, Calculator,
  Building2, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { AppLayout } from "@/components/layout/AppLayout";

// ─── Quiz System ───────────────────────────────────────────────────────────────

type QuizQ = { q: string; options: string[]; correct: number; explanation: string };

const QUIZZES: Record<string, QuizQ[]> = {
  "forex-intro": [
    { q: "What is the average daily trading volume in the forex market?", options: ["$750 billion","$7.5 trillion","$75 billion","$500 billion"], correct: 1, explanation: "Forex is the largest financial market with over $7.5 trillion traded daily — dwarfing all stock markets combined." },
    { q: "How does the forex market operate?", options: ["On a central exchange like the NYSE","Over-the-counter (OTC) between participants","Only through government banks","Only on weekdays 9am–5pm"], correct: 1, explanation: "Forex is an OTC market, meaning trades happen directly between participants through a global network — not on a central exchange." },
  ],
  "pips": [
    { q: "What is a pip for EUR/USD?", options: ["0.1","0.01","0.001","0.0001"], correct: 3, explanation: "For most pairs (excluding JPY), a pip is the 4th decimal place: 0.0001." },
    { q: "If you trade 1 standard lot of EUR/USD, how much is each pip worth?", options: ["$1","$10","$100","$0.10"], correct: 1, explanation: "A standard lot = 100,000 units. For EUR/USD, each pip = $10." },
  ],
  "leverage": [
    { q: "With 100:1 leverage and a $1,000 account, what position size can you control?", options: ["$1,000","$10,000","$100,000","$1,000,000"], correct: 2, explanation: "100:1 leverage means $1,000 controls $100,000 (1 standard lot). This amplifies both profits and losses." },
    { q: "What leverage is safest for beginners?", options: ["500:1","200:1","100:1","10:1–20:1"], correct: 3, explanation: "Beginners should start with 10:1 to 20:1 maximum. High leverage can wipe accounts in minutes." },
  ],
  "market-orders": [
    { q: "Which order type executes immediately at the current market price?", options: ["Limit order","Stop order","Market order","Stop-limit order"], correct: 2, explanation: "A market order fills immediately at whatever the current ask (buy) or bid (sell) price is." },
    { q: "You want to buy EUR/USD only if the price drops to 1.0950. What order do you use?", options: ["Market order","Buy limit order","Buy stop order","Stop-loss order"], correct: 1, explanation: "A buy limit is placed below the current price — it only fills if price falls to your level or better." },
  ],
  "support-resistance": [
    { q: "What happens when a resistance level is broken?", options: ["It disappears","It becomes a new support level","It becomes even stronger resistance","Price always continues higher"], correct: 1, explanation: "Role reversal: a broken resistance becomes the new support. Traders who missed the breakout buy on the pullback to that level." },
    { q: "Why do round numbers like 1.1000 act as strong S/R levels?", options: ["Banks program them","Traders psychologically anchor to them","Regulators set these levels","Random statistical chance"], correct: 1, explanation: "Thousands of traders remember and place orders at round numbers — this collective behavior creates self-fulfilling S/R zones." },
  ],
  "rsi": [
    { q: "What does RSI below 30 indicate?", options: ["Overbought — sell signal","Oversold — potential buy signal","Strong uptrend — add to position","The trend is ending"], correct: 1, explanation: "RSI below 30 = oversold. The asset may have fallen too fast. However, in a strong downtrend, RSI can stay below 30 for extended periods." },
    { q: "What is RSI divergence?", options: ["RSI and MACD give different signals","Price makes new high but RSI makes lower high","RSI crossing the 50 level","RSI staying above 70 for days"], correct: 1, explanation: "Bearish divergence = price makes new high but RSI makes lower high. This shows momentum weakening and often precedes reversals." },
  ],
  "psychology": [
    { q: "What is revenge trading?", options: ["Trading with a competitor","Taking impulsive trades to recover losses","Using high leverage","Trading without a stop loss"], correct: 1, explanation: "Revenge trading is taking impulsive trades after a loss to 'make it back quickly' — it compounds losses and is one of the top account-killers." },
    { q: "What should you NEVER do to your stop loss once placed?", options: ["Check it regularly","Move it to breakeven","Move it further away from entry","Tell your broker about it"], correct: 2, explanation: "Moving your SL further away is a fatal mistake. Your initial SL was placed based on your analysis — expanding it takes more risk and breaks your plan." },
  ],
  "backtesting": [
    { q: "What is overfitting (curve fitting) in backtesting?", options: ["Having too many trades","Optimizing parameters to fit past data so well it fails going forward","Running too many backtest simulations","Using the wrong time period"], correct: 1, explanation: "Overfitting happens when you optimize a strategy to look perfect on past data. It usually fails in live trading because it has no forward-looking edge." },
    { q: "How many trades do you need for a statistically significant backtest?", options: ["10 trades","50 trades","200+ trades","1000+ trades only"], correct: 2, explanation: "You need at least 200+ trades for statistical significance. Fewer trades means your results could easily be due to random chance." },
  ],
  "ms-delivery": [
    { q: "What does BOS (Break of Structure) signal in ICT methodology?", options: ["A failed breakout","A confirmed shift in market structure direction","A liquidity sweep only","End of trend"], correct: 1, explanation: "BOS (Break of Structure) is a confirmed break of a previous swing high (in uptrend) or swing low (in downtrend), confirming structural continuation." },
    { q: "What is a Change of Character (CHoCH)?", options: ["A candle pattern","The first sign that a trend may be reversing","When RSI crosses 50","A news-driven move"], correct: 1, explanation: "CHoCH is the FIRST break of structure against the prevailing trend. It's the earliest warning of a potential trend reversal — not confirmed yet, but a sign of weakening." },
  ],
  "ote": [
    { q: "What is the Optimal Trade Entry (OTE) zone in ICT?", options: ["0.236–0.382 Fibonacci","0.618–0.79 Fibonacci retracement","0.5 Fibonacci only","The high or low of the session"], correct: 1, explanation: "OTE is the 0.618 to 0.79 (79%) Fibonacci retracement zone. This is where smart money re-enters after an impulse move — providing the best risk-to-reward." },
  ],
  "bid-ask-depth": [
    { q: "In an order book, a large bid wall (many buy orders) at a key level typically indicates?", options: ["Strong selling pressure above","Institutional support — price unlikely to break down through it","A guaranteed reversal","Retail buying only"], correct: 1, explanation: "Large resting bids act as support. Institutions place iceberg orders (only showing part of their size) to accumulate at key levels. Price often respects these walls." },
  ],
  "cumulative-delta": [
    { q: "What does negative cumulative delta during a price rally indicate?", options: ["Strong buy pressure confirming the rally","Hidden selling — institutions absorbing the rally","Delta doesn't matter","Random noise"], correct: 1, explanation: "Bearish divergence on delta: price rises but more selling is happening at the ask than buying. Institutions are distributing into retail buying — a warning the rally may fail." },
  ],
  "stat-arb": [
    { q: "In pairs trading, when would you buy one asset and short another?", options: ["When both are rising","When the spread between correlated assets diverges beyond its historical mean","When both hit new highs","When volume is low"], correct: 1, explanation: "Pairs trading exploits mean reversion. When two historically correlated assets diverge, you buy the underperformer and short the outperformer, betting on convergence." },
  ],
  "momentum-factor": [
    { q: "Which time horizon does academic research show momentum factors work best?", options: ["1-5 minutes","1 day only","3-12 months cross-sectionally","5+ years"], correct: 2, explanation: "Cross-sectional momentum (buying recent 3-12 month winners, shorting losers) is one of the most robust documented risk premia. It persists because of investor behavioural biases and slow institutional repositioning." },
  ],
  "dxy-correlations": [
    { q: "If DXY (Dollar Index) is rising sharply, what typically happens to EUR/USD?", options: ["EUR/USD rises","EUR/USD falls","No correlation","EUR/USD becomes more volatile only"], correct: 1, explanation: "EUR/USD has ~-0.9 correlation with DXY. Since EUR is ~57% of the dollar index, a rising DXY almost always means falling EUR/USD. Monitoring DXY gives advance warning of EUR/USD direction." },
  ],
  "bond-yield-fx": [
    { q: "US 10-year Treasury yields rise sharply. What is the most likely impact on USD/JPY?", options: ["USD/JPY falls","USD/JPY rises","No impact","Yen strengthens"], correct: 1, explanation: "USD/JPY has ~0.85 historical correlation with US 10yr yields. Higher yields → more attractive US assets → capital flows into USD → USD/JPY rises. This is the core carry trade mechanic." },
  ],
};

function QuizBlock({ subtopicId, onComplete }: { subtopicId: string; onComplete: () => void }) {
  const questions = QUIZZES[subtopicId];
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!questions || questions.length === 0) return null;

  const q = questions[current];
  const isCorrect = selected === q.correct;

  const handleSelect = (idx: number) => {
    if (answered) return;
    setSelected(idx);
    setAnswered(true);
    if (idx === q.correct) setScore(s => s + 1);
  };

  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent(c => c + 1);
      setSelected(null);
      setAnswered(false);
    } else {
      setDone(true);
      if (score + (isCorrect ? 1 : 0) === questions.length) onComplete();
    }
  };

  return (
    <div className="mt-6 border border-primary/20 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 p-4 text-left hover:bg-primary/5 transition-colors">
        <HelpCircle className="w-4 h-4 text-primary shrink-0" />
        <span className="font-semibold text-sm">Quick Quiz — Test Your Knowledge</span>
        <span className="text-xs text-muted-foreground ml-auto">{questions.length} questions</span>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="p-4 pt-0 border-t border-border space-y-3">
              {done ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-2xl font-bold">{score}/{questions.length}</p>
                  <p className={cn("text-sm font-semibold", score === questions.length ? "text-pos" : score >= questions.length / 2 ? "text-warn" : "text-neg")}>
                    {score === questions.length ? "Perfect!" : score >= questions.length / 2 ? "Good effort!" : "Review the material and try again"}
                  </p>
                  <button onClick={() => { setCurrent(0); setSelected(null); setAnswered(false); setScore(0); setDone(false); }}
                    className="text-xs text-primary underline mt-1">Retry quiz</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Question {current + 1} of {questions.length}</span>
                    <span>{score} correct so far</span>
                  </div>
                  <p className="text-sm font-semibold leading-snug">{q.q}</p>
                  <div className="space-y-1.5">
                    {q.options.map((opt, i) => (
                      <button key={i} onClick={() => handleSelect(i)} disabled={answered}
                        className={cn("w-full text-left text-xs px-3 py-2.5 rounded-lg border transition-all",
                          !answered ? "border-border hover:border-primary/50 hover:bg-primary/5" :
                          i === q.correct ? "border-pos bg-pos/10 text-pos" :
                          i === selected ? "border-neg bg-neg/10 text-neg" :
                          "border-border opacity-50"
                        )}>
                        <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
                        {answered && i === q.correct && <CheckCircle2 className="w-3.5 h-3.5 inline ml-1" />}
                      </button>
                    ))}
                  </div>
                  {answered && (
                    <div className={cn("text-xs p-2.5 rounded-lg border", isCorrect ? "bg-pos/8 border-pos/20 text-pos" : "bg-neg/8 border-neg/20 text-neg")}>
                      <p className="font-semibold mb-0.5">{isCorrect ? "✓ Correct!" : "✗ Not quite"}</p>
                      <p className="text-muted-foreground">{q.explanation}</p>
                    </div>
                  )}
                  {answered && (
                    <button onClick={handleNext} className="w-full text-xs py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg font-semibold transition-colors">
                      {current < questions.length - 1 ? "Next Question →" : "Finish Quiz"}
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Content ──────────────────────────────────────────────────────────────────

type Subtopic = {
  id: string;
  title: string;
  mins: number;
  content: React.ReactNode;
  takeaways: string[];
};
type Topic = { id: string; title: string; subtopics: Subtopic[] };
type Level = { id: string; label: string; color: string; bg: string; icon: React.ElementType; topics: Topic[] };

const LEVELS: Level[] = [
  {
    id: "beginner", label: "Beginner", color: "text-pos", bg: "bg-pos/10 border-pos/25",
    icon: BookOpen,
    topics: [
      {
        id: "what-is-forex", title: "What is Forex Trading?",
        subtopics: [
          {
            id: "forex-intro", title: "The Foreign Exchange Market", mins: 4,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Forex (foreign exchange) is the global marketplace for buying and selling currencies. It's the largest and most liquid financial market in the world, with over <strong>$7.5 trillion</strong> traded every single day — dwarfing the stock market many times over.</p>
                <p>Unlike stock markets that operate on centralised exchanges like the NYSE, forex is an <strong>over-the-counter (OTC)</strong> market. This means trading happens directly between participants — banks, institutions, governments, and retail traders — through a global network of computers, 24 hours a day, 5 days a week.</p>
                <p>The market opens Sunday 5 PM New York time and closes Friday 5 PM New York time, cycling through four major sessions: Sydney, Tokyo, London, and New York.</p>
                <div className="bg-muted/30 rounded-lg p-3 border border-border">
                  <p className="font-semibold text-xs mb-2 text-primary">Why is forex so large?</p>
                  <p>International trade requires currency exchange — companies importing goods from Japan need yen, European exporters want euros. Central banks manage reserves. Investors seek returns across borders. All of this creates constant, massive demand for currency exchange.</p>
                </div>
              </div>
            ),
            takeaways: ["Forex is the world's largest market — $7.5T+ daily volume", "It operates 24/5 across four global sessions", "Trades happen OTC, not on a central exchange", "Participants range from central banks to retail traders"],
          },
          {
            id: "who-trades", title: "Who Trades Forex?", mins: 3,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>The forex market has a clear hierarchy of participants, each with different goals and impact on prices:</p>
                <div className="space-y-2">
                  {[
                    { t: "Central Banks", d: "The most powerful players. The Federal Reserve, ECB, and Bank of Japan can move markets with rate decisions, quantitative easing, and direct interventions. Their goal is currency stability and monetary policy." },
                    { t: "Commercial Banks", d: "Citibank, Deutsche Bank, JPMorgan conduct trillions in daily interbank trading — both for clients and proprietary trading. They're the primary market makers." },
                    { t: "Hedge Funds & Institutions", d: "Manage billions and trade macro strategies based on economic differentials between countries." },
                    { t: "Corporations", d: "Boeing buying aircraft parts from Germany needs EUR/USD. Apple repatriating profits needs to convert foreign currency back to USD." },
                    { t: "Retail Traders", d: "That's us. We access the market through brokers who aggregate liquidity. We're a small slice of volume but growing rapidly with platforms like MT5." },
                  ].map(x => (
                    <div key={x.t} className="flex gap-2.5 p-2.5 bg-muted/20 rounded-lg border border-border/50">
                      <span className="font-semibold text-primary text-xs w-28 shrink-0 mt-0.5">{x.t}</span>
                      <span className="text-muted-foreground text-xs leading-relaxed">{x.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["Central banks are the most powerful forex players", "Commercial banks are the primary market makers", "Retail traders represent a small but growing share", "Understanding the hierarchy helps predict market moves"],
          },
          {
            id: "how-forex-works", title: "How Does Forex Work?", mins: 4,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>In forex you always trade one currency against another. You're simultaneously <strong>buying</strong> one currency and <strong>selling</strong> another. This is the core mechanic — you profit when the currency you bought rises against the one you sold.</p>
                <p>If you think the Euro will strengthen against the US Dollar, you <em>buy EUR/USD</em>. If the EUR rises, your position is profitable. If it falls, you lose. Your profit/loss is the difference between your entry price and exit price, measured in <strong>pips</strong>.</p>
                <div className="bg-primary/8 rounded-lg p-3 border border-primary/20">
                  <p className="font-semibold text-xs mb-1.5 text-primary">Simple example</p>
                  <p className="text-xs text-foreground/80">You buy 1 lot of EUR/USD at 1.1000. The price rises to 1.1050. That's 50 pips of profit. With a standard lot, each pip = $10. Your profit = $500.</p>
                </div>
                <p>You don't need to own the underlying currency — you're speculating on price movements through a <strong>contract for difference (CFD)</strong> or spot forex contract with your broker.</p>
              </div>
            ),
            takeaways: ["Forex always involves a pair — you buy one, sell another", "Profit comes from price movement between entry and exit", "You speculate on price — you don't own physical currency", "Pips measure the price movement between currencies"],
          },
        ],
      },
      {
        id: "currency-pairs", title: "Currency Pairs Explained",
        subtopics: [
          {
            id: "major-pairs", title: "Major Currency Pairs", mins: 4,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Major pairs always include the US Dollar on one side and are the most liquid, most traded, and cheapest to trade (lowest spreads). They include:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[["EUR/USD","Euro / US Dollar","The 'Fiber' — most traded pair globally"],["GBP/USD","British Pound / USD","The 'Cable' — volatile, trend-heavy"],["USD/JPY","USD / Japanese Yen","The 'Gopher' — moves on risk sentiment"],["USD/CHF","USD / Swiss Franc","Safe haven — negatively correlated to gold"],["AUD/USD","Australian Dollar / USD","Commodity-linked, China sensitive"],["USD/CAD","USD / Canadian Dollar","Oil-linked, 'the Loonie'"],["NZD/USD","New Zealand Dollar / USD","Commodity pair, follows AUD closely"]].map(([pair, name, note]) => (
                    <div key={pair} className="p-2.5 bg-muted/20 rounded-lg border border-border/50">
                      <p className="font-mono font-bold text-primary text-sm">{pair}</p>
                      <p className="text-[11px] text-foreground/80 font-medium">{name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["Major pairs always include USD", "Majors have the tightest spreads and most liquidity", "EUR/USD is the most traded pair in the world", "Each major has a nickname traders use"],
          },
          {
            id: "minor-exotic", title: "Minor & Exotic Pairs", mins: 3,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p><strong>Minor pairs</strong> (also called crosses) don't include the USD but still involve major currencies. Examples: EUR/GBP, EUR/JPY, GBP/JPY. They're liquid but have wider spreads than majors.</p>
                <p><strong>Exotic pairs</strong> pair a major currency with one from a developing economy: USD/TRY (Turkish Lira), USD/ZAR (South African Rand), USD/MXN (Mexican Peso). They have wide spreads, low liquidity, and can be extremely volatile.</p>
                <div className="bg-warn/8 rounded-lg p-3 border border-warn/20">
                  <p className="font-semibold text-xs mb-1 text-warn">Beginners: stick to majors</p>
                  <p className="text-xs text-muted-foreground">Exotic pairs can gap violently on news, have much higher trading costs, and are harder to analyze. Master EUR/USD and GBP/USD first.</p>
                </div>
              </div>
            ),
            takeaways: ["Minors exclude USD but still use major currencies", "Exotics include developing market currencies", "Exotics have wider spreads and higher risk", "Beginners should master majors before exploring others"],
          },
          {
            id: "reading-quotes", title: "Reading a Currency Quote", mins: 3,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Every currency pair has two prices: the <strong>bid</strong> (what the broker buys from you) and the <strong>ask</strong> (what you buy from the broker). The ask is always higher.</p>
                <div className="bg-muted/30 rounded-lg p-4 border border-border font-mono text-center">
                  <p className="text-2xl font-bold mb-1">EUR/USD <span className="text-muted-foreground">1.0850 / 1.0852</span></p>
                  <div className="grid grid-cols-2 gap-4 text-xs mt-3">
                    <div><p className="text-neg font-bold">BID: 1.0850</p><p className="text-muted-foreground">You SELL at this price</p></div>
                    <div><p className="text-pos font-bold">ASK: 1.0852</p><p className="text-muted-foreground">You BUY at this price</p></div>
                  </div>
                  <p className="text-xs text-warn mt-2">Spread = 2 pips (cost to enter the trade)</p>
                </div>
                <p>The <strong>base currency</strong> is the first in the pair (EUR), and the <strong>quote currency</strong> is the second (USD). The price tells you how many USD you need to buy 1 EUR.</p>
              </div>
            ),
            takeaways: ["Bid = price you sell, Ask = price you buy", "Spread = Ask minus Bid = your cost to trade", "Base currency is first, quote currency is second", "The price = how much quote currency buys one base"],
          },
        ],
      },
      {
        id: "pips-lots", title: "Pips, Lots & Leverage",
        subtopics: [
          {
            id: "pips", title: "What is a Pip?", mins: 4,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>A <strong>pip</strong> (Percentage in Point) is the smallest standard price movement in forex. For most pairs it's the 4th decimal place: 0.0001. So EUR/USD moving from 1.1000 to 1.1001 = 1 pip.</p>
                <p>For JPY pairs, a pip is the 2nd decimal place: 0.01. USD/JPY moving from 150.00 to 150.01 = 1 pip.</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["Standard Lot","100,000 units","~$10/pip"],["Mini Lot","10,000 units","~$1/pip"],["Micro Lot","1,000 units","~$0.10/pip"]].map(([name,units,val])=>(
                    <div key={name} className="bg-muted/20 rounded-lg p-2.5 border border-border/50">
                      <p className="font-bold text-xs text-primary">{name}</p>
                      <p className="text-[10px] text-muted-foreground">{units}</p>
                      <p className="font-mono font-bold text-sm mt-1">{val}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Modern brokers also offer fractional pips (pipettes) — a 5th decimal place. 1.10005 is 0.5 pipettes.</p>
              </div>
            ),
            takeaways: ["A pip is the 4th decimal place for most pairs", "JPY pairs use 2nd decimal place for pips", "Standard lot = $10/pip; mini = $1/pip; micro = $0.10/pip", "Pipettes are fractional pips (5th decimal)"],
          },
          {
            id: "leverage", title: "Understanding Leverage", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Leverage lets you control a large position with a small deposit. A 100:1 leverage means $1,000 controls $100,000 worth of currency.</p>
                <div className="bg-muted/30 rounded-lg p-3 border border-border">
                  <p className="font-semibold text-xs mb-2">Example: 100:1 leverage</p>
                  <div className="space-y-1 text-xs font-mono">
                    <p>Account balance: <span className="text-primary">$1,000</span></p>
                    <p>Position size: <span className="text-primary">$100,000</span> (1 standard lot)</p>
                    <p>1 pip move: <span className="text-pos">+$10 profit</span> or <span className="text-neg">-$10 loss</span></p>
                    <p>50 pip loss: <span className="text-neg">-$500 (50% of account!)</span></p>
                  </div>
                </div>
                <div className="bg-neg/8 rounded-lg p-3 border border-neg/20">
                  <p className="font-semibold text-xs text-neg mb-1">Leverage is a double-edged sword</p>
                  <p className="text-xs text-muted-foreground">High leverage amplifies both profits AND losses. A professional trader using 50:1 might risk 1% per trade. A beginner using 500:1 can blow up in minutes. Start low — 10:1 or 20:1 maximum as a beginner.</p>
                </div>
              </div>
            ),
            takeaways: ["Leverage controls more money than you deposit", "100:1 means $1,000 controls $100,000", "Losses are amplified just as much as profits", "Beginners should use no more than 10:1-20:1 leverage"],
          },
          {
            id: "margin", title: "Margin Requirements", mins: 3,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p><strong>Margin</strong> is the deposit required to open a leveraged position — it's not a fee, it's collateral held by your broker.</p>
                <p>Required Margin = (Trade Size × Price) ÷ Leverage</p>
                <p>With 100:1 leverage, opening 1 standard lot of EUR/USD at 1.1000: ($100,000 × 1.1000) ÷ 100 = <strong>$1,100 margin required</strong>.</p>
                <p><strong>Margin call</strong>: If your losses eat into your margin, your broker will warn you — and if equity falls below maintenance margin, they'll automatically close your positions. Always keep plenty of free margin.</p>
              </div>
            ),
            takeaways: ["Margin is collateral, not a fee", "Required margin = trade size ÷ leverage", "Margin call = broker warning before forced liquidation", "Keep free margin well above minimum to avoid closeouts"],
          },
        ],
      },
      {
        id: "order-types", title: "Order Types",
        subtopics: [
          {
            id: "market-orders", title: "Market, Limit & Stop Orders", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                {[
                  { t: "Market Order", c: "text-info", d: "Executes immediately at the current market price. Fast but you pay the spread. Used when you want in NOW regardless of exact price.", ex: "EUR/USD at 1.1000 — buy now at whatever the ask is" },
                  { t: "Limit Order", c: "text-pos", d: "Executes only at your specified price or better. Buy limit below current price, sell limit above. You get the price you want or better.", ex: "EUR/USD at 1.1000 — buy if price drops to 1.0950" },
                  { t: "Stop Order", c: "text-warn", d: "Executes when price reaches a specified level, then becomes a market order. Buy stop above price (breakout trades), sell stop below (breakdown).", ex: "EUR/USD at 1.1000 — buy if price breaks above 1.1050" },
                  { t: "Stop-Limit", c: "text-info", d: "Triggers at the stop price, then places a limit order. More control but risk of no fill if price moves through.", ex: "Trigger at 1.1050 → limit buy at 1.1055" },
                ].map(x => (
                  <div key={x.t} className="p-3 bg-muted/20 rounded-lg border border-border/50">
                    <p className={cn("font-bold text-sm mb-1", x.c)}>{x.t}</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{x.d}</p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1.5 bg-muted/30 px-2 py-1 rounded">e.g. {x.ex}</p>
                  </div>
                ))}
              </div>
            ),
            takeaways: ["Market orders fill immediately at current price", "Limit orders only fill at your price or better", "Stop orders trigger when price reaches a level", "Stop-limit combines both — trigger then limit"],
          },
          {
            id: "sl-tp", title: "Stop Loss & Take Profit", mins: 4,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>These are the most important orders you'll ever place — they define your risk and reward before you enter a trade.</p>
                <div className="space-y-2">
                  <div className="p-3 bg-neg/8 rounded-lg border border-neg/20">
                    <p className="font-bold text-neg text-sm mb-1">Stop Loss (SL)</p>
                    <p className="text-xs text-foreground/80">Automatically closes your position at a loss if price moves against you by your defined amount. It's your maximum risk on the trade. <strong>Never trade without one.</strong> Professional traders treat the stop loss as sacred — they never move it further away once placed.</p>
                  </div>
                  <div className="p-3 bg-pos/8 rounded-lg border border-pos/20">
                    <p className="font-bold text-pos text-sm mb-1">Take Profit (TP)</p>
                    <p className="text-xs text-foreground/80">Closes your position automatically when price hits your target. Locks in profits even when you're away from the screen. Plan your TP at a realistic level — key support/resistance, a round number, or based on your risk:reward ratio.</p>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 border border-border">
                  <p className="text-xs font-semibold mb-1">Risk:Reward Example</p>
                  <p className="text-xs text-muted-foreground">Entry: 1.1000 | SL: 1.0970 (30 pips risk) | TP: 1.1090 (90 pips reward) = 1:3 risk:reward. Even with a 40% win rate, this setup is profitable.</p>
                </div>
              </div>
            ),
            takeaways: ["Always use a stop loss — no exceptions", "Take profit locks in gains automatically", "Risk:reward ratio is more important than win rate", "Never move your SL further away from entry"],
          },
        ],
      },
    ],
  },
  {
    id: "intermediate", label: "Intermediate", color: "text-info", bg: "bg-info/10 border-info/25",
    icon: TrendingUp,
    topics: [
      {
        id: "technical-analysis", title: "Technical Analysis",
        subtopics: [
          {
            id: "support-resistance", title: "Support & Resistance", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p><strong>Support</strong> is a price level where buying pressure historically overcomes selling — price bounces up. <strong>Resistance</strong> is the opposite — sellers overwhelm buyers and price reverses down.</p>
                <p>These levels exist because of collective memory. Thousands of traders remember where price reversed before, and they place orders there again. This self-fulfilling behavior makes S/R levels reliable.</p>
                <div className="space-y-2">
                  {[
                    { t: "Round numbers", d: "1.1000, 1.1500 — always act as S/R because traders anchor to them" },
                    { t: "Previous highs/lows", d: "A broken resistance becomes support. A broken support becomes resistance (role reversal)" },
                    { t: "Consolidation zones", d: "Areas where price moved sideways create strong S/R because many orders were placed there" },
                    { t: "Moving averages", d: "Dynamic S/R — the 200 EMA on daily charts is watched by institutions worldwide" },
                  ].map(x => (
                    <div key={x.t} className="flex gap-2.5 p-2.5 bg-muted/20 rounded-lg border border-border/50 text-xs">
                      <span className="font-semibold text-primary shrink-0 w-32">{x.t}</span>
                      <span className="text-muted-foreground">{x.d}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground bg-primary/5 rounded-lg p-2.5 border border-primary/15">Key insight: S/R is a <em>zone</em>, not a precise line. Price doesn't always reverse exactly at the level — give it 5-10 pip breathing room.</p>
              </div>
            ),
            takeaways: ["Support = buyers beat sellers; Resistance = sellers beat buyers", "Role reversal: broken resistance becomes support", "S/R is a zone, not a precise line", "Round numbers and previous highs/lows are strongest levels"],
          },
          {
            id: "trend-analysis", title: "Trend Identification", mins: 4,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>"The trend is your friend" is the most quoted rule in trading for good reason. Trading with the trend increases your probability of success dramatically.</p>
                <div className="space-y-2">
                  {[
                    { t: "Uptrend", c: "text-pos", d: "Higher highs (HH) and higher lows (HL). Each rally exceeds the last; each pullback holds above the previous pullback low. Buy on pullbacks to support." },
                    { t: "Downtrend", c: "text-neg", d: "Lower highs (LH) and lower lows (LL). Each rally fails below the previous high; each drop exceeds the previous low. Sell on bounces to resistance." },
                    { t: "Ranging/Sideways", c: "text-warn", d: "Price oscillates between horizontal S/R. Buy at support, sell at resistance. Avoid trend-following strategies here." },
                  ].map(x => (
                    <div key={x.t} className="p-2.5 bg-muted/20 rounded-lg border border-border/50">
                      <p className={cn("font-bold text-xs mb-1", x.c)}>{x.t}</p>
                      <p className="text-xs text-muted-foreground">{x.d}</p>
                    </div>
                  ))}
                </div>
                <p>Use higher timeframes (daily, weekly) to identify the primary trend, then drop to lower timeframes (H1, H4) to find entries in the trend direction.</p>
              </div>
            ),
            takeaways: ["Uptrend = higher highs and higher lows", "Downtrend = lower highs and lower lows", "Range = price bouncing between horizontal levels", "Always trade with the higher-timeframe trend"],
          },
          {
            id: "candlesticks", title: "Candlestick Patterns", mins: 6,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Candlesticks show open, high, low, and close in a single visual. The body shows where price started and ended; the wicks show the extreme range.</p>
                <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Reversal Patterns</p>
                <div className="space-y-1.5">
                  {[
                    { n: "Hammer", d: "Long lower wick, small body at top. At a downtrend bottom = buyers taking over. Bullish reversal signal." },
                    { n: "Shooting Star", d: "Long upper wick, small body at bottom. At an uptrend top = sellers rejecting higher prices. Bearish reversal." },
                    { n: "Bullish Engulfing", d: "A large bullish candle completely engulfs the previous bearish candle. Strong reversal at support." },
                    { n: "Bearish Engulfing", d: "A large bearish candle engulfs the previous bullish candle. Strong reversal at resistance." },
                    { n: "Doji", d: "Open and close at nearly the same price. Market indecision — often precedes a reversal, especially at S/R levels." },
                    { n: "Morning Star", d: "Three-candle pattern: bearish candle → small indecision candle → bullish candle. Powerful bullish reversal." },
                  ].map(x => (
                    <div key={x.n} className="flex gap-2 p-2 bg-muted/20 rounded-lg border border-border/50 text-xs">
                      <span className="font-bold text-primary shrink-0 w-28">{x.n}</span>
                      <span className="text-muted-foreground">{x.d}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-warn/8 rounded-lg p-2.5 border border-warn/20 text-xs">
                  <strong className="text-warn">Context matters:</strong> A hammer at random is meaningless. A hammer at a major support level after a strong downtrend = high-probability setup.
                </div>
              </div>
            ),
            takeaways: ["Wicks show rejection — long wicks indicate strong reversal pressure", "Always look for patterns at key S/R levels, not in isolation", "Bullish/Bearish engulfing are among the most reliable patterns", "Doji = indecision, especially meaningful at extremes"],
          },
        ],
      },
      {
        id: "indicators", title: "Technical Indicators",
        subtopics: [
          {
            id: "moving-averages", title: "Moving Averages (SMA & EMA)", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Moving averages smooth out price action to reveal the underlying trend. They're one of the most widely used indicators — meaning they become self-fulfilling as millions of traders watch the same levels.</p>
                <div className="space-y-2">
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                    <p className="font-bold text-info text-xs mb-1">SMA (Simple Moving Average)</p>
                    <p className="text-xs text-muted-foreground">Equal weight to all periods. Slower to react. The 200 SMA on the daily chart is the most watched level in all of finance — institutions watch it religiously.</p>
                  </div>
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                    <p className="font-bold text-primary text-xs mb-1">EMA (Exponential Moving Average)</p>
                    <p className="text-xs text-muted-foreground">More weight on recent prices. Faster, more responsive. Better for active trading. Common settings: 8, 21, 50, 200 EMA.</p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2">Key uses</p>
                <div className="space-y-1.5 text-xs">
                  {[
                    "Trend direction: price above MA = uptrend; below = downtrend",
                    "Dynamic support/resistance: price often bounces off the 20 or 50 EMA",
                    "MA crossovers: 50 EMA crossing above 200 EMA = 'Golden Cross' (bullish signal)",
                    "Multiple MAs together show trend strength and momentum shifts",
                  ].map(t => <p key={t} className="flex gap-1.5 text-muted-foreground"><span className="text-primary">→</span>{t}</p>)}
                </div>
              </div>
            ),
            takeaways: ["SMA = equal weight; EMA = more weight on recent prices", "200 SMA daily = most watched level in finance", "Price above MA = bullish bias; below = bearish", "Golden Cross (50 above 200) is a major bullish signal"],
          },
          {
            id: "rsi", title: "RSI — Relative Strength Index", mins: 4,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>RSI measures the speed and magnitude of price changes on a 0-100 scale. It's the most widely used momentum indicator.</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-pos/10 rounded-lg p-2.5 border border-pos/25"><p className="font-bold text-pos">RSI &lt; 30</p><p className="text-muted-foreground mt-1">Oversold — potential buy signal. Asset may have fallen too fast.</p></div>
                  <div className="bg-muted/30 rounded-lg p-2.5 border border-border"><p className="font-bold">RSI 30–70</p><p className="text-muted-foreground mt-1">Neutral zone — trend continues. Use other signals for entries.</p></div>
                  <div className="bg-neg/10 rounded-lg p-2.5 border border-neg/25"><p className="font-bold text-neg">RSI &gt; 70</p><p className="text-muted-foreground mt-1">Overbought — potential sell signal. Asset may have risen too fast.</p></div>
                </div>
                <div className="bg-primary/8 rounded-lg p-2.5 border border-primary/20 text-xs">
                  <strong className="text-primary">Advanced: RSI Divergence</strong>
                  <p className="text-muted-foreground mt-1">When price makes a new high but RSI makes a lower high = <em>bearish divergence</em> — momentum weakening, reversal likely. Price new low + RSI higher low = <em>bullish divergence</em>.</p>
                </div>
              </div>
            ),
            takeaways: ["RSI below 30 = oversold; above 70 = overbought", "Oversold/overbought doesn't mean immediate reversal in a trend", "RSI divergence is a powerful early reversal warning", "Default period is 14 — common among professional traders"],
          },
          {
            id: "macd", title: "MACD — Trend & Momentum", mins: 4,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>MACD (Moving Average Convergence Divergence) combines trend-following and momentum. It consists of three components:</p>
                <div className="space-y-1.5 text-xs">
                  {[
                    { t: "MACD Line", d: "12 EMA minus 26 EMA. Shows the difference between short and long-term momentum." },
                    { t: "Signal Line", d: "9 EMA of the MACD line. When MACD crosses above it = bullish; below = bearish." },
                    { t: "Histogram", d: "Visual bars showing the gap between MACD and Signal. Growing bars = strengthening momentum." },
                  ].map(x => (
                    <div key={x.t} className="flex gap-2 p-2 bg-muted/20 rounded-lg border border-border/50">
                      <span className="text-primary font-bold w-24 shrink-0">{x.t}</span>
                      <span className="text-muted-foreground">{x.d}</span>
                    </div>
                  ))}
                </div>
                <p>Key signals: MACD crossing above zero = bullish momentum; crossing below zero = bearish. The further from zero, the stronger the momentum. Like RSI, divergence between MACD and price is a powerful early warning.</p>
              </div>
            ),
            takeaways: ["MACD = 12 EMA minus 26 EMA", "Signal line crossover is the primary trading signal", "MACD above zero = bullish momentum phase", "Histogram growing = momentum is accelerating"],
          },
          {
            id: "bollinger-bands", title: "Bollinger Bands", mins: 4,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Bollinger Bands consist of a middle SMA (usually 20-period) with two bands set 2 standard deviations above and below. They dynamically expand and contract with volatility.</p>
                <div className="space-y-2 text-xs">
                  {[
                    { t: "Band Squeeze", c: "text-warn", d: "When bands narrow, volatility is low. A squeeze often precedes a major breakout — price is coiling. Watch for the direction of the breakout." },
                    { t: "Walking the Band", c: "text-pos", d: "In strong trends, price 'walks' along the upper (uptrend) or lower (downtrend) band. This is NOT an overbought/sold signal — it confirms the trend strength." },
                    { t: "Mean Reversion", c: "text-info", d: "In ranging markets, price touching the upper band = potential sell; touching lower band = potential buy. But only works in ranges, not trends." },
                    { t: "%B Indicator", c: "text-info", d: "Shows where price is relative to the bands: above 1.0 = above upper band; below 0 = below lower band; 0.5 = at middle." },
                  ].map(x => (
                    <div key={x.t} className="p-2.5 bg-muted/20 rounded-lg border border-border/50">
                      <p className={cn("font-bold mb-0.5", x.c)}>{x.t}</p>
                      <p className="text-muted-foreground">{x.d}</p>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["Bands expand in high volatility, contract in low volatility", "Squeeze = low volatility → big move coming", "Walking the band confirms strong trend momentum", "Mean reversion works in ranges, not trending markets"],
          },
        ],
      },
      {
        id: "trading-sessions", title: "Trading Sessions & Timing",
        subtopics: [
          {
            id: "sessions-overview", title: "The Four Sessions", mins: 4,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <div className="space-y-2">
                  {[
                    { session: "Sydney", time: "10PM–7AM GMT", pairs: "AUD, NZD pairs", c: "text-pos", d: "Quietest session. Low volatility except AUD/NZD news. Good for careful position management but avoid breakout trading." },
                    { session: "Tokyo", time: "12AM–9AM GMT", pairs: "JPY pairs, AUD", c: "text-neg", d: "Japanese banks active. JPY pairs move most. Range-bound for other pairs. BOJ interventions can cause sharp moves." },
                    { session: "London", time: "8AM–5PM GMT", pairs: "EUR, GBP, CHF", c: "text-info", d: "Most liquid session — ~35% of all forex volume. Trends start here. Major economic data from Europe moves markets significantly." },
                    { session: "New York", time: "1PM–10PM GMT", pairs: "USD pairs", c: "text-warn", d: "Heavy volume especially when overlapping with London (1-5PM GMT). US data releases (NFP, CPI, FOMC) cause extreme volatility." },
                  ].map(x => (
                    <div key={x.session} className="p-3 bg-muted/20 rounded-lg border border-border/50">
                      <div className="flex items-center justify-between mb-1">
                        <p className={cn("font-bold text-sm", x.c)}>{x.session} Session</p>
                        <span className="text-[10px] font-mono text-muted-foreground">{x.time}</span>
                      </div>
                      <p className="text-[10px] font-semibold text-primary mb-1">{x.pairs}</p>
                      <p className="text-xs text-muted-foreground">{x.d}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-primary/8 rounded-lg p-2.5 border border-primary/20 text-xs">
                  <strong className="text-primary">Best time to trade:</strong> London/New York overlap (1PM–5PM GMT). Highest volume, tightest spreads, strongest trends. This 4-hour window produces the majority of weekly forex movement.
                </div>
              </div>
            ),
            takeaways: ["London session has the most volume (~35% of daily)", "London/NY overlap is the highest-probability trading window", "Trade the pairs most active in each session", "Avoid major news releases unless you're skilled at news trading"],
          },
        ],
      },
    ],
  },
  {
    id: "advanced", label: "Advanced", color: "text-info", bg: "bg-info/10 border-info/25",
    icon: Brain,
    topics: [
      {
        id: "price-action", title: "Price Action Trading",
        subtopics: [
          {
            id: "market-structure", title: "Market Structure", mins: 6,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Market structure is the backbone of price action trading. Understanding it means you can read where the market is likely to go before an indicator tells you.</p>
                <div className="space-y-2">
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                    <p className="font-bold text-pos text-xs mb-1.5">Bullish Market Structure</p>
                    <p className="text-xs text-muted-foreground">Price makes Higher Highs (HH) and Higher Lows (HL). As long as each pullback holds above the previous HL, the trend is intact. A break below the previous HL = structure shift warning. A break below a significant HL = confirmed trend reversal.</p>
                  </div>
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                    <p className="font-bold text-neg text-xs mb-1.5">Break of Structure (BOS)</p>
                    <p className="text-xs text-muted-foreground">A BOS occurs when price breaks the most recent significant high (in a downtrend) or low (in an uptrend). This signals the trend is weakening. Combine with other confluence for high-quality entries after a BOS.</p>
                  </div>
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                    <p className="font-bold text-warn text-xs mb-1.5">Change of Character (ChoCH)</p>
                    <p className="text-xs text-muted-foreground">A ChoCH is a more significant structural shift — price aggressively breaks a key swing point. More reliable than a minor BOS. Smart money traders wait for ChoCH before calling a reversal.</p>
                  </div>
                </div>
              </div>
            ),
            takeaways: ["Uptrend = HH + HL; Downtrend = LH + LL", "A broken Higher Low signals trend weakness", "Break of Structure (BOS) = early reversal warning", "Change of Character (ChoCH) = confirmed reversal"],
          },
          {
            id: "pin-bars", title: "Pin Bars, Inside Bars & Engulfing", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>These are the three core price action setups. Used at key levels with trend confluence, they produce high-probability trades.</p>
                <div className="space-y-2">
                  {[
                    { t: "Pin Bar", c: "text-primary", d: "A single candle with a long wick and small body. The wick shows strong rejection of a price level. Bullish pin at support (long lower wick) = buyers took over. Bearish pin at resistance (long upper wick) = sellers in control. Minimum 2/3 of the candle should be wick.", tip: "Best with: trend alignment + key level + strong wick with small body" },
                    { t: "Inside Bar", c: "text-info", d: "The entire candle fits within the previous candle's range. Represents consolidation and indecision. After a breakout, inside bars show the market 'resting'. A breakout of the inside bar in the trend direction = continuation entry.", tip: "Best with: trending market + recent momentum candle + breakout in trend direction" },
                    { t: "Fakey / False Break", c: "text-warn", d: "Price breaks an inside bar or key level, then quickly reverses — trapping breakout traders. One of the highest-probability setups. The reversal candle often becomes a strong pin bar.", tip: "Best with: false breakout of key level + reversal candle + volume spike" },
                  ].map(x => (
                    <div key={x.t} className="p-3 bg-muted/20 rounded-lg border border-border/50">
                      <p className={cn("font-bold text-sm mb-1", x.c)}>{x.t}</p>
                      <p className="text-xs text-muted-foreground mb-2">{x.d}</p>
                      <p className="text-[10px] font-semibold text-primary">{x.tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["Pin bars need 2/3 wick, 1/3 body for validity", "Inside bars represent consolidation before continuation", "Fakey patterns trap weak hands and create strong moves", "Context (level + trend) is more important than the pattern itself"],
          },
        ],
      },
      {
        id: "fibonacci", title: "Fibonacci & Harmonic Patterns",
        subtopics: [
          {
            id: "fib-retracements", title: "Fibonacci Retracements", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Fibonacci retracements are based on ratios derived from the Fibonacci sequence. In nature, these ratios appear everywhere — and in financial markets, traders use them as powerful S/R levels.</p>
                <div className="grid grid-cols-2 gap-2">
                  {[["0.236 (23.6%)","Shallow pullback zone","Low probability in strong trends"],["0.382 (38.2%)","Moderate pullback","Common in strong trends"],["0.500 (50%)","Psychological midpoint","Not a true Fibonacci — but widely watched"],["0.618 (61.8%)","'The Golden Ratio'","Strongest retracement level","font-bold text-primary"],["0.786 (78.6%)","Deep retracement","Near-reversal of entire move"]].map(([level,name,note,extra])=>(
                    <div key={level} className={cn("p-2.5 bg-muted/20 rounded-lg border border-border/50 text-xs", extra)}>
                      <p className="font-mono font-bold text-primary">{level}</p>
                      <p className="font-semibold mt-0.5">{name}</p>
                      <p className="text-muted-foreground">{note}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Draw fibs from the swing low to swing high (in an uptrend). The retracement levels are where price commonly pulls back to before continuing. Combine the 0.618 level with a pin bar or S/R zone for a powerful confluence setup.</p>
              </div>
            ),
            takeaways: ["0.618 (Golden Ratio) is the most powerful Fibonacci level", "Draw from swing low to swing high in uptrends", "Confluence: Fib level + S/R + pattern = high-probability", "0.382 and 0.618 are the most reliable retracement levels"],
          },
        ],
      },
      {
        id: "psychology", title: "Trading Psychology",
        subtopics: [
          {
            id: "emotions", title: "Fear, Greed & Discipline", mins: 6,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Studies show that 70-80% of retail traders lose money. The strategy is rarely the problem — <strong>the trader's psychology is.</strong></p>
                <div className="space-y-2">
                  {[
                    { e: "Fear of Missing Out (FOMO)", d: "Chasing trades after the move has already happened. The solution: accept that missed trades are the cost of discipline. There's always another setup." },
                    { e: "Revenge Trading", d: "Taking impulsive trades after a loss to 'get it back'. This compounds losses catastrophically. After a loss, stop for the day. Come back fresh." },
                    { e: "Moving the Stop Loss", d: "Widening your SL because you don't want to be stopped out. This destroys your risk management. Your initial SL was placed for a reason." },
                    { e: "Premature Profit Taking", d: "Closing winners early out of fear they'll reverse. Trust your take profit level. Or use a trailing stop to let winners run." },
                    { e: "Overtrading", d: "Taking 10 trades a day when your edge only appears 2-3 times. More trades = more exposure to bad setups. Quality over quantity." },
                  ].map(x => (
                    <div key={x.e} className="p-2.5 bg-muted/20 rounded-lg border border-border/50">
                      <p className="font-semibold text-xs text-neg mb-1">{x.e}</p>
                      <p className="text-xs text-muted-foreground">{x.d}</p>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["Psychology, not strategy, is why most traders fail", "FOMO, revenge trading, and overtrading are the top killers", "Never move your stop loss further away from entry", "Keep a trading journal to identify psychological patterns"],
          },
          {
            id: "trading-plan", title: "Building a Trading Plan", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>A trading plan is your business plan for the markets. Successful traders don't make decisions on a whim — they follow a written plan, removing emotion from execution.</p>
                <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Your plan must cover:</p>
                <div className="space-y-1.5 text-xs">
                  {[
                    { n: "Markets & Sessions", d: "Which pairs, which times of day, which sessions you'll trade" },
                    { n: "Setup Criteria", d: "Exact rules for what constitutes a valid trade — timeframe, pattern, conditions" },
                    { n: "Risk Per Trade", d: "Fixed % of account — typically 1-2%. Never variable based on how 'certain' you feel" },
                    { n: "Entry & Exit Rules", d: "Precise entry triggers, SL placement logic, TP targets or trailing stop rules" },
                    { n: "Daily/Weekly Limits", d: "Max loss per day (e.g. 3%) after which you stop trading. Max trades per day" },
                    { n: "Review Process", d: "Weekly journal review, screenshot every trade, track win rate, R:R, psychological notes" },
                  ].map(x => (
                    <div key={x.n} className="flex gap-2 p-2 bg-muted/20 rounded-lg border border-border/50">
                      <span className="text-primary font-bold w-28 shrink-0">{x.n}</span>
                      <span className="text-muted-foreground">{x.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["A trading plan removes emotion from decisions", "Define exact entry/exit rules — no ambiguity", "Set daily loss limits to prevent catastrophic drawdown", "Review and journal every trade every week"],
          },
        ],
      },
    ],
  },
  {
    id: "expert", label: "Expert", color: "text-warn", bg: "bg-warn/10 border-warn/25",
    icon: Trophy,
    topics: [
      {
        id: "risk-management-pro", title: "Professional Risk Management",
        subtopics: [
          {
            id: "position-sizing-pro", title: "Advanced Position Sizing", mins: 6,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Position sizing is the single most important skill separating professional traders from amateurs. It's not about picking the right trade — it's about surviving long enough to be right consistently.</p>
                <div className="space-y-2">
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                    <p className="font-bold text-primary text-xs mb-1.5">Fixed Fractional Method (the standard)</p>
                    <p className="text-xs text-muted-foreground mb-2">Risk a fixed % of current account equity per trade. As your account grows, position size grows. As it shrinks, you size down. This creates asymmetric growth and prevents ruin.</p>
                    <p className="font-mono text-xs bg-muted/30 p-2 rounded">Lot Size = (Account × Risk%) ÷ (SL pips × Pip Value)</p>
                  </div>
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                    <p className="font-bold text-info text-xs mb-1.5">Kelly Criterion</p>
                    <p className="text-xs text-muted-foreground mb-2">Mathematical formula for optimal bet sizing: f = (bp - q) ÷ b, where b = win/loss ratio, p = win probability, q = loss probability. In practice, use half-Kelly to reduce variance.</p>
                    <p className="text-[10px] text-muted-foreground">Example: 55% win rate, 1.5:1 R:R → Kelly = 18.3%, Half-Kelly = 9.2% max risk</p>
                  </div>
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                    <p className="font-bold text-warn text-xs mb-1.5">Pyramiding (Scaling In)</p>
                    <p className="text-xs text-muted-foreground">Adding to a winning position at logical technical levels. Each add must use a smaller size. Move your SL to breakeven after first add. Never add to a losing position.</p>
                  </div>
                </div>
              </div>
            ),
            takeaways: ["Fixed fractional method: risk same % on every trade", "Kelly Criterion gives mathematically optimal sizing", "Use half-Kelly in practice to reduce drawdown volatility", "Pyramiding = adding to winners; never add to losers"],
          },
          {
            id: "drawdown", title: "Managing Drawdown", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Drawdown is inevitable. Every professional trader — including George Soros, Paul Tudor Jones, and every successful fund — experiences extended losing periods. The difference is how they manage it.</p>
                <div className="bg-muted/30 rounded-lg p-3 border border-border text-xs font-mono">
                  <p className="font-sans font-semibold text-sm mb-2 font-sans">Recovery math — why preserving capital matters:</p>
                  {[["10% drawdown","11.1% gain to recover"],["20% drawdown","25% gain to recover"],["30% drawdown","42.9% gain to recover"],["50% drawdown","100% gain to recover"],["75% drawdown","300% gain to recover"]].map(([d,r])=>(
                    <div key={d} className="flex justify-between py-0.5 border-b border-border/30">
                      <span className="text-neg">{d}</span><span className="text-pos">{r}</span>
                    </div>
                  ))}
                </div>
                <p>Rules during drawdown: reduce position size to 50%, trade only A+ setups, review your last 20 trades for pattern errors, take a 1-2 day break to reset psychology, never try to recover losses quickly.</p>
              </div>
            ),
            takeaways: ["Drawdown recovery is exponentially harder as losses deepen", "A 50% loss requires a 100% gain to recover", "During drawdown: halve position size and be selective", "Extended drawdown often indicates a strategy edge has degraded"],
          },
        ],
      },
      {
        id: "algo-trading", title: "Algorithmic & Quantitative Trading",
        subtopics: [
          {
            id: "backtesting", title: "Backtesting & Strategy Validation", mins: 7,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Backtesting runs a trading strategy on historical data to estimate its real-world performance. It's the foundation of quant trading — but it's full of pitfalls that fool even experienced traders.</p>
                <div className="space-y-2">
                  <div className="p-3 bg-neg/8 rounded-lg border border-neg/20">
                    <p className="font-bold text-neg text-xs mb-1">Overfitting (Curve Fitting)</p>
                    <p className="text-xs text-muted-foreground">Optimising parameters to fit past data perfectly doesn't mean the strategy will work going forward. If your strategy has 15+ parameters and works only on specific years, it's likely overfitted. Use out-of-sample testing and walk-forward analysis.</p>
                  </div>
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                    <p className="font-bold text-primary text-xs mb-1.5">Key metrics to evaluate</p>
                    <div className="space-y-1 text-xs">
                      {[["Profit Factor","> 1.5 is acceptable; > 2.0 is excellent"],["Sharpe Ratio","> 1.0 acceptable; > 2.0 exceptional"],["Max Drawdown","Should be acceptable relative to expected returns"],["Win Rate","Context-dependent — 40% win rate with 3:1 R:R is excellent"],["Trade Count","Need 200+ trades for statistical significance"]].map(([k,v])=>(
                        <div key={k} className="flex gap-2"><span className="text-muted-foreground w-28">{k}</span><span>{v}</span></div>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 bg-pos/8 rounded-lg border border-pos/20">
                    <p className="font-bold text-pos text-xs mb-1">Monte Carlo Simulation</p>
                    <p className="text-xs text-muted-foreground">Randomly reshuffles your trade sequence thousands of times to show the range of possible outcomes. Reveals worst-case drawdown scenarios. If even 5% of scenarios show ruin, your sizing is too aggressive.</p>
                  </div>
                </div>
              </div>
            ),
            takeaways: ["Overfitting makes strategies look great in backtests but fail live", "Need 200+ trades for statistical significance", "Profit Factor > 1.5 and Sharpe > 1.0 are minimum thresholds", "Monte Carlo simulation reveals worst-case drawdown scenarios"],
          },
          {
            id: "smart-money", title: "Smart Money Concepts (SMC)", mins: 7,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Smart Money Concepts is a framework based on how institutional traders (banks, hedge funds) operate in markets. The premise: institutions can't fill their massive orders at a single price — they manipulate retail traders to provide the liquidity they need.</p>
                <div className="space-y-2">
                  {[
                    { t: "Order Blocks (OB)", c: "text-primary", d: "The last bearish candle before a strong bullish impulse (bullish OB) or last bullish before bearish impulse (bearish OB). This is where institutions placed their orders. Price often returns to OBs to fill remaining orders before continuing." },
                    { t: "Fair Value Gaps (FVG)", c: "text-info", d: "A 3-candle pattern where the wicks of the 1st and 3rd candle don't overlap, creating an imbalance. Institutions often drive price back to fill these gaps before continuing the move." },
                    { t: "Liquidity Sweeps", c: "text-warn", d: "Stop hunts — price briefly breaks above a swing high (to trigger retail buy stops) or below a swing low (to trigger sell stops), then reverses. This is institutions filling orders at retail's expense." },
                    { t: "Premium & Discount Zones", c: "text-pos", d: "Use the Fibonacci 0.5 level on a range. Above 0.5 = premium (institutions sell). Below 0.5 = discount (institutions buy). This is the institutional version of buying low and selling high." },
                  ].map(x => (
                    <div key={x.t} className="p-3 bg-muted/20 rounded-lg border border-border/50">
                      <p className={cn("font-bold text-xs mb-1", x.c)}>{x.t}</p>
                      <p className="text-xs text-muted-foreground">{x.d}</p>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["Order blocks show where institutions placed large orders", "Fair Value Gaps are imbalances that often get filled", "Liquidity sweeps are stop hunts by smart money", "Trade in discount (long) and premium (short) zones like institutions"],
          },
        ],
      },
      {
        id: "macro-trading", title: "Macro & Fundamental Analysis",
        subtopics: [
          {
            id: "economic-drivers", title: "Key Economic Drivers", mins: 6,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Currency values are driven by the economic strength and monetary policy outlook of the countries involved. Understanding macroeconomics gives you the edge of knowing WHY price moves, not just WHERE.</p>
                <div className="space-y-2">
                  {[
                    { t: "Interest Rates (Most Important)", c: "text-primary", d: "Higher interest rates → currency appreciates. Capital flows to higher-yielding currencies. When the Fed raises rates, USD typically strengthens. Follow central bank decisions, dot plots, and meeting minutes closely." },
                    { t: "Inflation (CPI, PCE)", c: "text-warn", d: "High inflation forces central banks to raise rates → bullish currency. But hyperinflation is destructive. Watch CPI releases — they directly influence rate expectations and currency pairs." },
                    { t: "Employment Data (NFP)", c: "text-pos", d: "Strong jobs data → higher rates likely → stronger currency. The US Non-Farm Payrolls (NFP) is the single most market-moving monthly release. It drops first Friday of each month." },
                    { t: "GDP & Growth", c: "text-info", d: "Strong GDP growth suggests currency strength. Slowdowns signal weakness. Compare relative growth between two countries — the stronger economy's currency tends to outperform." },
                  ].map(x => (
                    <div key={x.t} className="p-3 bg-muted/20 rounded-lg border border-border/50">
                      <p className={cn("font-bold text-xs mb-1", x.c)}>{x.t}</p>
                      <p className="text-xs text-muted-foreground">{x.d}</p>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["Interest rate differentials are the primary driver of currency trends", "CPI and PCE data directly shape rate expectations", "NFP (first Friday monthly) is the biggest US forex catalyst", "Compare GDP growth between two countries for long-term trade bias"],
          },
        ],
      },
    ],
  },
  {
    id: "institutional", label: "Institutional", color: "text-info", bg: "bg-info/10 border-info/25",
    icon: Building2,
    topics: [
      {
        id: "ict-smc", title: "ICT & Smart Money Concepts",
        subtopics: [
          {
            id: "ms-delivery", title: "Market Structure & Delivery", mins: 8,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Smart Money Concepts (SMC) — popularised by ICT (Inner Circle Trader) — teaches that institutional traders leave footprints in price action through repeatable delivery mechanisms. Understanding these patterns gives you an edge over the 95% trading retail strategies.</p>
                <div className="space-y-2">
                  {[
                    { t: "Break of Structure (BOS)", d: "A BOS occurs when price takes out a previous swing high (bullish BOS) or swing low (bearish BOS). It confirms that the current trend is continuing — smart money is still delivering price in that direction." },
                    { t: "Change of Character (CHoCH)", d: "The FIRST break against the prevailing structure. A bearish CHoCH occurs when price takes out the last significant swing low in an uptrend. It does NOT confirm reversal alone — it's a warning sign, not a trading trigger by itself." },
                    { t: "Premium / Discount Arrays", d: "Price is always in a premium (above the 50% midpoint of a swing) or discount (below 50%). Smart money buys in discount and sells in premium. Always identify the swing range and the equilibrium level before entering." },
                    { t: "Inducement (IDM)", d: "Before a true reversal, institutions must induce retail traders to enter the wrong direction. A small liquidity grab below/above a minor swing — just before the real move — is the inducement. It's the fake-out before the real move." },
                  ].map(x => (
                    <div key={x.t} className="flex gap-2.5 p-2.5 bg-muted/20 rounded-lg border border-border/50">
                      <span className="font-semibold text-info text-xs w-44 shrink-0 mt-0.5">{x.t}</span>
                      <span className="text-muted-foreground text-xs leading-relaxed">{x.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["BOS confirms trend continuation; CHoCH is the first reversal warning", "Always trade in discount (buys) or premium (sells) relative to a swing", "IDM induces retail before the real institutional move", "Price delivers in opposing directions to collect liquidity before continuing"],
          },
          {
            id: "order-blocks", title: "Order Blocks & FVGs", mins: 7,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Order blocks and Fair Value Gaps are the highest-probability entry zones in ICT methodology — they represent the exact candles where institutional traders placed their original orders.</p>
                <div className="space-y-2">
                  {[
                    { t: "Bullish Order Block", d: "The last bearish (down) candle immediately before a significant bullish impulse move. This is where smart money placed their bulk buy orders. Price often returns to this candle to re-accumulate before continuing higher. Enter on the retest of the OB body with a tight SL below." },
                    { t: "Bearish Order Block", d: "The last bullish (up) candle immediately before a significant bearish impulse move. Smart money distribution zone. Price returns here to redistribute before falling further. Enter shorts on the retest." },
                    { t: "Fair Value Gap (FVG / Imbalance)", d: "A 3-candle pattern where candle 1's wick and candle 3's wick do not overlap candle 2. This gap represents a price inefficiency — price was delivered too fast, leaving unfilled orders. Price almost always returns to fill FVGs before continuing." },
                    { t: "Breaker Block", d: "A failed order block that gets taken out. When price sweeps through an OB and continues, that original OB becomes a breaker — it now acts as a resistance (former bullish OB becomes bearish resistance after BOS failure)." },
                  ].map(x => (
                    <div key={x.t} className="flex gap-2.5 p-2.5 bg-muted/20 rounded-lg border border-border/50">
                      <span className="font-semibold text-info text-xs w-44 shrink-0 mt-0.5">{x.t}</span>
                      <span className="text-muted-foreground text-xs leading-relaxed">{x.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["Bullish OB = last bearish candle before a bullish impulse", "FVGs are nearly always filled before price continues", "Breakers form when OBs are violated — they flip to opposing magnets", "Stack OB + FVG confluence for highest-probability entries"],
          },
          {
            id: "ote", title: "OTE & Liquidity Concepts", mins: 6,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>ICT's entry methodology centres around two concepts: the Optimal Trade Entry (OTE) zone and liquidity pools — the fuel that drives institutional price delivery.</p>
                <div className="space-y-2">
                  {[
                    { t: "Optimal Trade Entry (OTE)", d: "The 0.618 to 0.79 (79%) Fibonacci retracement of a confirmed swing. After a BOS, price typically retraces to this zone before continuing. This is where smart money re-enters with the best R:R. A 2:1 minimum R:R from OTE entry to the previous swing is standard." },
                    { t: "Equal Highs / Lows (EQH/EQL)", d: "Two or more swing highs/lows at approximately the same level. These represent a pool of stop-loss orders. Institutions specifically target these levels to harvest liquidity before reversing. If you see EQH forming, expect a sweep above before any real move lower." },
                    { t: "BSL / SSL (Buy/Sell Side Liquidity)", d: "BSL sits above swing highs (buy stops of shorts, stop-losses of bears). SSL sits below swing lows (stop-losses of longs). Smart money MUST move price to these levels to accumulate or distribute large positions against retail traders' stops." },
                    { t: "Kill Zones", d: "Specific time windows with highest institutional activity: London Open (2–5 AM EST), New York Open (7–10 AM EST), London Close (10 AM–12 PM EST). These are the highest-probability windows for OTE entries. Avoid trading outside kill zones for setups." },
                  ].map(x => (
                    <div key={x.t} className="flex gap-2.5 p-2.5 bg-muted/20 rounded-lg border border-border/50">
                      <span className="font-semibold text-info text-xs w-44 shrink-0 mt-0.5">{x.t}</span>
                      <span className="text-muted-foreground text-xs leading-relaxed">{x.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["OTE is the 0.618–0.79 Fibonacci zone after a BOS — the best R:R entry", "Equal highs/lows are liquidity targets — expect sweeps before reversals", "BSL and SSL are the engine of institutional price delivery", "Only trade in Kill Zones (London/New York opens) for highest-probability ICT setups"],
          },
        ],
      },
      {
        id: "quant-strategies", title: "Quantitative Strategies",
        subtopics: [
          {
            id: "momentum-factor", title: "Cross-Sectional Momentum", mins: 6,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>The momentum factor is one of the most documented and persistent anomalies in financial markets — first formally described by Jegadeesh & Titman (1993). It works in forex, equities, and commodities.</p>
                <p>The core principle: rank all instruments in your universe by their trailing 1–12 month returns. <strong>Long the top quintile. Short (or avoid) the bottom quintile.</strong> Rebalance periodically. The spread generates consistent positive expected value.</p>
                <div className="bg-muted/30 rounded-lg p-3 border border-border">
                  <p className="font-semibold text-xs mb-2 text-info">Why does momentum persist?</p>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>→ Slow institutional repositioning (large funds can't move instantly)</li>
                    <li>→ Anchoring bias (investors anchor to old prices, underreact to new trends)</li>
                    <li>→ Herding behaviour (late-cycle momentum attracts more capital)</li>
                    <li>→ Trend-following CTAs amplify moves by design</li>
                  </ul>
                </div>
                <p>In forex, apply this by ranking pairs by 20-day return. The strongest pairs continue trending; weakest continue falling. Combine with DXY direction for highest conviction.</p>
              </div>
            ),
            takeaways: ["Momentum is one of the most documented market anomalies since 1993", "Rank instruments by trailing return; long top, avoid/short bottom", "Momentum persists due to institutional slow-repositioning and anchoring bias", "In forex, combine cross-sectional momentum ranking with DXY direction"],
          },
          {
            id: "stat-arb", title: "Statistical Arbitrage & Mean Reversion", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Mean reversion strategies exploit the statistical tendency of correlated asset pairs to revert after diverging from their historical relationship. The z-score measures how far the spread is from its mean in standard deviations.</p>
                <div className="bg-primary/8 rounded-lg p-3 border border-primary/20 mb-3">
                  <p className="font-semibold text-xs mb-1 text-primary">Z-score formula</p>
                  <p className="text-xs font-mono text-foreground/80">z = (current_spread − mean_spread) / std_dev</p>
                  <p className="text-xs text-muted-foreground mt-1">Enter when |z| &gt; 2.0 (2 standard deviations). Exit when |z| &lt; 0.5 (near mean). Stop at |z| = 3.0.</p>
                </div>
                <p>Classic forex pairs for mean reversion: EUR/USD vs GBP/USD (both USD-base correlated), AUD/USD vs NZD/USD (commodity currency bloc), EUR/GBP in range-bound conditions.</p>
                <p>Key risk: <strong>regime change</strong>. Correlated pairs can structurally decouple (e.g. Brexit decoupled GBP from EUR). Always monitor correlation on a rolling 60-day basis, not just historical.</p>
              </div>
            ),
            takeaways: ["Z-score >2.0 signals mean reversion entry; exit at <0.5", "Best forex pairs: EUR/USD vs GBP/USD, AUD/USD vs NZD/USD", "Regime change can permanently decouple correlated pairs — monitor rolling correlation", "Always define stops at z-score = 3.0 to prevent holding a diverging pair indefinitely"],
          },
        ],
      },
      {
        id: "global-macro", title: "Global Macro & Intermarket",
        subtopics: [
          {
            id: "dxy-correlations", title: "DXY & Currency Correlations", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>The US Dollar Index (DXY) is the single most important macro tool for forex traders. It measures USD strength against a basket: EUR (57.6%), JPY (13.6%), GBP (11.9%), CAD (9.1%), SEK (4.2%), CHF (3.6%).</p>
                <div className="space-y-2">
                  {[
                    { pair: "EUR/USD", corr: "−0.90 to −0.95", note: "Nearly perfect inverse. DXY up = EUR/USD down, always." },
                    { pair: "GBP/USD", corr: "−0.80 to −0.88", note: "Strong inverse. GBP also affected by UK data independently." },
                    { pair: "USD/JPY", corr: "+0.80 to +0.90", note: "Positive. DXY up = USD/JPY up. Also driven by US yield differential." },
                    { pair: "XAU/USD (Gold)", corr: "−0.70 to −0.85", note: "DXY up = Gold pressure. Breaks down in risk-off crisis (gold rises despite USD)." },
                  ].map(x => (
                    <div key={x.pair} className="flex gap-2.5 p-2 bg-muted/20 rounded border border-border/40">
                      <span className="font-bold text-info text-xs w-28 shrink-0">{x.pair}</span>
                      <span className="text-pos text-xs w-24 shrink-0 font-mono">{x.corr}</span>
                      <span className="text-muted-foreground text-xs">{x.note}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Rule: always check DXY trend before entering any major USD pair. Trading against DXY momentum is low-conviction.</p>
              </div>
            ),
            takeaways: ["DXY measures USD vs 6 currencies; EUR is 57.6% of the index", "EUR/USD has ~−0.92 correlation with DXY — nearly always inverse", "USD/JPY is positively correlated with DXY and US 10yr yields", "Gold breaks DXY correlation in risk-off crises — monitor both"],
          },
          {
            id: "bond-yield-fx", title: "Yield Curves & Carry Trades", mins: 6,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Government bond yields are the primary driver of long-term currency trends. When a country's yields rise relative to others, capital flows in to capture higher returns, bidding up its currency.</p>
                <div className="bg-muted/30 rounded-lg p-3 border border-border mb-3">
                  <p className="font-semibold text-xs mb-2 text-info">Key Yield Relationships</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>→ <strong className="text-foreground">US 10yr ↑</strong> → USD/JPY ↑ (strongest yield/FX relationship)</p>
                    <p>→ <strong className="text-foreground">US−EU 2yr spread ↑</strong> → EUR/USD ↓ (rate differential drives direction)</p>
                    <p>→ <strong className="text-foreground">Inverted yield curve</strong> → recession risk → risk-off → JPY/CHF/Gold strengthen</p>
                    <p>→ <strong className="text-foreground">Steepening curve</strong> → growth optimism → risk-on → AUD/NZD/EM FX outperform</p>
                  </div>
                </div>
                <p><strong>Carry trade:</strong> Borrow in a low-yield currency (JPY, CHF at near-0%) and invest in a high-yield currency (USD, AUD, NZD, BRL). You earn the interest rate differential daily. Risk: sharp JPY/CHF rallies (carry unwind) during risk-off events.</p>
                <p>The 2024 JPY carry unwind (August 2024) caused USD/JPY to drop 10% in days as hedge funds rushed to close carry positions simultaneously — a reminder that carry trades can reverse catastrophically.</p>
              </div>
            ),
            takeaways: ["Yield differentials are the primary engine of long-term FX trends", "US 10yr yield is most strongly correlated with USD/JPY", "Inverted yield curve signals recession risk and JPY/CHF strength", "Carry trades are profitable but face sudden violent unwinds in risk-off events"],
          },
        ],
      },
      {
        id: "order-flow-micro", title: "Order Flow & Microstructure",
        subtopics: [
          {
            id: "bid-ask-depth", title: "Order Book & Depth of Market", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Order flow analysis reads the actual buy and sell orders flowing through the market in real-time, rather than just the resulting price. It's the closest you can get to seeing what institutions are actually doing.</p>
                <div className="space-y-2">
                  {[
                    { t: "Bid/Ask Spread", d: "The spread between best buy (bid) and sell (ask) price. Tight spread = high liquidity, institutional support. Widening spread = uncertainty or low liquidity. Spread spikes before news events represent market maker risk management." },
                    { t: "Iceberg Orders", d: "Large institutional orders displayed only partially (e.g. 100 lots showing, 5,000 lots behind it). They appear as consistent resting orders at a price level that keep getting partially filled. Price struggles to break through iceberg levels — they act as strong S/R." },
                    { t: "Volume Profile", d: "Shows how much volume traded at each price level over a period. Point of Control (POC) = the price with highest volume — institutions traded most here. Value Area High/Low = 70% of volume range. Price returns to these levels frequently." },
                    { t: "Delta", d: "Cumulative Delta = net difference between buys at ask (aggressor buyers) vs sells at bid (aggressor sellers). Rising price with negative delta = institutions selling into retail buying — bearish divergence, expect reversal." },
                  ].map(x => (
                    <div key={x.t} className="flex gap-2.5 p-2.5 bg-muted/20 rounded-lg border border-border/50">
                      <span className="font-semibold text-info text-xs w-36 shrink-0 mt-0.5">{x.t}</span>
                      <span className="text-muted-foreground text-xs leading-relaxed">{x.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
            takeaways: ["Spread widening signals institutional risk management and low-conviction price", "Iceberg orders create invisible S/R — watch for price repeatedly stalling", "Volume Profile POC is the fairest value price — markets revisit it frequently", "Negative cumulative delta during rally = institutional distribution — bearish warning"],
          },
          {
            id: "cumulative-delta", title: "Delta Divergence & Absorption", mins: 5,
            content: (
              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <p>Delta divergence is one of the most powerful microstructure signals. When price moves in one direction but the order flow tells a different story, institutions are quietly positioning against the visible move.</p>
                <div className="bg-muted/30 rounded-lg p-3 border border-border mb-3">
                  <p className="font-semibold text-xs mb-2 text-info">Key Delta Divergence Patterns</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex gap-2"><span className="text-neg font-bold w-32 shrink-0">Price up, Delta ↓</span><span className="text-muted-foreground">Bearish: institutions selling into retail buying. Reversal likely.</span></div>
                    <div className="flex gap-2"><span className="text-pos font-bold w-32 shrink-0">Price down, Delta ↑</span><span className="text-muted-foreground">Bullish: institutions buying into retail selling. Reversal likely.</span></div>
                    <div className="flex gap-2"><span className="text-info font-bold w-32 shrink-0">Absorption</span><span className="text-muted-foreground">Large aggressive orders fail to move price — opposing institutions absorbing every hit.</span></div>
                    <div className="flex gap-2"><span className="text-warn font-bold w-32 shrink-0">Exhaustion</span><span className="text-muted-foreground">Very large delta spike that fails to produce new price high/low — buying/selling exhaustion.</span></div>
                  </div>
                </div>
                <p>Absorption is the highest-conviction microstructure signal: when large market orders are being relentlessly absorbed at a price level without moving it, a massive resting institutional order is there. Price will eventually either break it with enormous force or reverse sharply.</p>
              </div>
            ),
            takeaways: ["Price up + delta down = institutional distribution into retail buying", "Price down + delta up = institutional accumulation into retail selling", "Absorption = large resting orders blocking price — high-conviction S/R", "Exhaustion spikes (huge delta, no new extreme) signal the end of a move"],
          },
        ],
      },
    ],
  },
];

// ─── Progress tracking ─────────────────────────────────────────────────────────

const STORAGE_KEY = "tradeai_learn_progress";

function getProgress(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

function setRead(id: string, read: boolean) {
  const p = getProgress();
  if (read) p[id] = true; else delete p[id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function getTotalCounts() {
  let total = 0, completed = 0;
  const p = getProgress();
  LEVELS.forEach(l => l.topics.forEach(t => t.subtopics.forEach(s => { total++; if (p[s.id]) completed++; })));
  return { total, completed };
}

// ─── Trading Calculators ───────────────────────────────────────────────────────

function TradingCalculators() {
  const [pipSymbol, setPipSymbol] = useState("EURUSD");
  const [pipLots, setPipLots] = useState(1);
  const [pipCount, setPipCount] = useState(10);

  const [psBalance, setPsBalance] = useState(10000);
  const [psRisk, setPsRisk] = useState(2);
  const [psSL, setPsSL] = useState(20);
  const [psSymbol, setPsSymbol] = useState("EURUSD");

  const [rrRisk, setRrRisk] = useState(50);
  const [rrReward, setRrReward] = useState(100);
  const [rrWinRate, setRrWinRate] = useState(50);

  const isJPY = (s: string) => s.includes("JPY");
  const pipValue = (symbol: string, lots: number) => (isJPY(symbol) ? 7 : 10) * lots;
  const pipSz = (symbol: string) => isJPY(symbol) ? 0.01 : 0.0001;

  const pipDollar = pipValue(pipSymbol, pipLots);
  const totalPips = (pipDollar * pipCount).toFixed(2);

  const riskAmount = (psBalance * (psRisk / 100));
  const lotSize = (riskAmount / (psSL * (isJPY(psSymbol) ? 7 : 10))).toFixed(2);

  const rrRatio = rrRisk > 0 ? (rrReward / rrRisk).toFixed(2) : "—";
  const expectedValue = ((rrWinRate / 100) * rrReward - (1 - rrWinRate / 100) * rrRisk).toFixed(2);
  const evPositive = parseFloat(expectedValue) > 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Calculator className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Trading Calculators</h1>
          <p className="text-sm text-muted-foreground">Interactive tools to plan your trades precisely</p>
        </div>
      </div>

      <div className="space-y-6">

        {/* Pip Value Calculator */}
        <div className="bg-card/40 border border-border rounded-xl overflow-hidden">
          <div className="bg-card/60 px-5 py-3.5 border-b border-border flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-pos" />
            <h3 className="font-bold text-sm">Pip Value Calculator</h3>
            <span className="text-xs text-muted-foreground ml-1">— How much is each pip worth?</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div>
                <label className="text-[10px] text-muted-foreground font-mono uppercase mb-1.5 block">Symbol</label>
                <select value={pipSymbol} onChange={e => setPipSymbol(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background/60 px-3 text-sm font-mono">
                  {["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","GBPJPY","XAUUSD","EURJPY"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-mono uppercase mb-1.5 block">Lot Size</label>
                <input type="number" min={0.01} step={0.01} value={pipLots} onChange={e => setPipLots(parseFloat(e.target.value) || 0)}
                  className="w-full h-9 rounded-md border border-border bg-background/60 px-3 text-sm font-mono" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-mono uppercase mb-1.5 block">Pip Count</label>
                <input type="number" min={1} value={pipCount} onChange={e => setPipCount(parseInt(e.target.value) || 1)}
                  className="w-full h-9 rounded-md border border-border bg-background/60 px-3 text-sm font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Value per Pip", value: `$${pipDollar.toFixed(2)}`, color: "text-primary" },
                { label: `Value × ${pipCount} pips`, value: `$${totalPips}`, color: "text-pos" },
                { label: "Pip Size", value: pipSz(pipSymbol).toString(), color: "text-muted-foreground" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-background/50 rounded-lg p-3 border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">{label}</p>
                  <p className={`font-bold text-lg font-mono ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Position Size Calculator */}
        <div className="bg-card/40 border border-border rounded-xl overflow-hidden">
          <div className="bg-card/60 px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Shield className="w-4 h-4 text-info" />
            <h3 className="font-bold text-sm">Position Size Calculator</h3>
            <span className="text-xs text-muted-foreground ml-1">— How many lots should you trade?</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              {[
                { label: "Account Balance ($)", value: psBalance, set: (v: number) => setPsBalance(v), step: 1000 },
                { label: "Risk per Trade (%)", value: psRisk, set: (v: number) => setPsRisk(v), step: 0.5, max: 10 },
                { label: "Stop Loss (pips)", value: psSL, set: (v: number) => setPsSL(v), step: 5 },
              ].map(({ label, value, set, step, max }) => (
                <div key={label}>
                  <label className="text-[10px] text-muted-foreground font-mono uppercase mb-1.5 block">{label}</label>
                  <input type="number" min={0.01} step={step} max={max} value={value}
                    onChange={e => set(parseFloat(e.target.value) || 0)}
                    className="w-full h-9 rounded-md border border-border bg-background/60 px-3 text-sm font-mono" />
                </div>
              ))}
              <div>
                <label className="text-[10px] text-muted-foreground font-mono uppercase mb-1.5 block">Symbol</label>
                <select value={psSymbol} onChange={e => setPsSymbol(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background/60 px-3 text-sm font-mono">
                  {["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","GBPJPY","XAUUSD","EURJPY"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Risk Amount", value: `$${riskAmount.toFixed(2)}`, color: "text-destructive" },
                { label: "Lot Size", value: `${parseFloat(lotSize) < 0 ? "—" : lotSize} lots`, color: "text-primary font-bold" },
                { label: "Dollar per Pip", value: `$${pipValue(psSymbol, parseFloat(lotSize) || 0).toFixed(2)}`, color: "text-muted-foreground" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-background/50 rounded-lg p-3 border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">{label}</p>
                  <p className={`font-bold text-lg font-mono ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              Risking ${riskAmount.toFixed(2)} with a {psSL}-pip stop → trade <strong>{lotSize} lots</strong> to keep risk at {psRisk}% of account
            </p>
          </div>
        </div>

        {/* Risk/Reward Analyser */}
        <div className="bg-card/40 border border-border rounded-xl overflow-hidden">
          <div className="bg-card/60 px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Target className="w-4 h-4 text-warn" />
            <h3 className="font-bold text-sm">Risk/Reward & Expected Value</h3>
            <span className="text-xs text-muted-foreground ml-1">— Is your trade worth taking?</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4 mb-5">
              {[
                { label: "Risk (pips / $)", value: rrRisk, set: setRrRisk },
                { label: "Reward (pips / $)", value: rrReward, set: setRrReward },
                { label: "Win Rate (%)", value: rrWinRate, set: setRrWinRate, max: 100 },
              ].map(({ label, value, set, max }) => (
                <div key={label}>
                  <label className="text-[10px] text-muted-foreground font-mono uppercase mb-1.5 block">{label}</label>
                  <input type="number" min={1} max={max} value={value}
                    onChange={e => set(parseInt(e.target.value) || 1)}
                    className="w-full h-9 rounded-md border border-border bg-background/60 px-3 text-sm font-mono" />
                </div>
              ))}
            </div>

            {/* Visual R:R bar */}
            <div className="mb-4">
              <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
                <div className="bg-neg/70 flex items-center justify-center text-[10px] font-bold text-foreground transition-all" style={{ width: `${(rrRisk / (rrRisk + rrReward)) * 100}%` }}>
                  Risk
                </div>
                <div className="bg-pos/70 flex-1 flex items-center justify-center text-[10px] font-bold text-foreground">
                  Reward
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "R:R Ratio", value: `1:${rrRatio}`, color: parseFloat(rrRatio as string) >= 2 ? "text-pos" : "text-warn" },
                { label: "Expected Value", value: `${evPositive ? "+" : ""}${expectedValue}`, color: evPositive ? "text-pos" : "text-destructive" },
                { label: "Break-even Win%", value: `${(rrRisk / (rrRisk + rrReward) * 100).toFixed(1)}%`, color: "text-muted-foreground" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-background/50 rounded-lg p-3 border border-border/50 text-center">
                  <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">{label}</p>
                  <p className={`font-bold text-lg font-mono ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className={cn("mt-3 rounded-lg px-4 py-2.5 text-xs font-semibold text-center border", evPositive ? "bg-pos/10 border-pos/20 text-pos" : "bg-destructive/10 border-destructive/20 text-destructive")}>
              {evPositive ? `Positive expected value — this setup is mathematically favourable at your win rate.` : `Negative expected value — improve your R:R ratio or win rate before trading this setup.`}
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Learn() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({ beginner: true });
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, boolean>>(getProgress);
  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { total, completed } = useMemo(() => getTotalCounts(), [progress]);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const toggleRead = (id: string) => {
    const next = !progress[id];
    setRead(id, next);
    setProgress(getProgress());
  };

  const selected = useMemo(() => {
    for (const level of LEVELS) for (const topic of level.topics) for (const sub of topic.subtopics) if (sub.id === selectedId) return { level, topic, sub };
    return null;
  }, [selectedId]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const results: { level: Level; topic: Topic; sub: Subtopic }[] = [];
    for (const level of LEVELS) for (const topic of level.topics) for (const sub of topic.subtopics) {
      if (sub.title.toLowerCase().includes(q) || topic.title.toLowerCase().includes(q)) results.push({ level, topic, sub });
    }
    return results;
  }, [search]);

  const allSubtopics = useMemo(() => {
    const all: { level: Level; topic: Topic; sub: Subtopic }[] = [];
    for (const level of LEVELS) for (const topic of level.topics) for (const sub of topic.subtopics) all.push({ level, topic, sub });
    return all;
  }, []);

  const currentIndex = allSubtopics.findIndex(x => x.sub.id === selectedId);

  return (
    <AppLayout>
      <div className="flex h-full overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className={cn("shrink-0 border-r border-border flex flex-col bg-card/30 overflow-hidden transition-all duration-200", sidebarOpen ? "w-64" : "w-10")}>
          {/* Header */}
          <div className={cn("border-b border-border shrink-0", sidebarOpen ? "p-4" : "p-2 flex justify-center")}>
            {sidebarOpen ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <span className="font-bold text-sm flex-1">Trading Library</span>
                  <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors" title="Collapse sidebar">
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">{completed}/{total} lessons</span>
                    <span className={cn("font-bold", pct === 100 ? "text-pos" : "text-primary")}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div className="h-full bg-primary rounded-full" animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
                  </div>
                </div>
                <div className="relative mt-3">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics…" className="h-8 pl-8 text-xs bg-background/60" />
                </div>
              </div>
            ) : (
              <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors" title="Expand sidebar">
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Nav — only rendered when sidebar is open */}
          {sidebarOpen && (
            <div className="flex-1 overflow-y-auto py-2">
              {searchResults !== null ? (
                <div className="px-2 space-y-0.5">
                  {searchResults.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No results</p>
                  ) : searchResults.map(({ level, topic, sub }) => (
                    <button key={sub.id}
                      onClick={() => { setSelectedId(sub.id); setSearch(""); }}
                      className={cn("w-full text-left px-2 py-2 rounded-lg text-xs transition-colors", selectedId === sub.id ? "bg-primary/15 text-primary" : "hover:bg-muted/50")}>
                      <p className="font-semibold">{sub.title}</p>
                      <p className="text-muted-foreground">{topic.title}</p>
                    </button>
                  ))}
                </div>
              ) : (
                LEVELS.map(level => (
                  <div key={level.id} className="mb-1">
                    <button
                      onClick={() => setExpandedLevels(p => ({ ...p, [level.id]: !p[level.id] }))}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors"
                    >
                      <level.icon className={cn("w-3.5 h-3.5 shrink-0", level.color)} />
                      <span className={cn("font-bold text-xs flex-1 text-left", level.color)}>{level.label}</span>
                      {expandedLevels[level.id] ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                    </button>
                    <AnimatePresence>
                      {expandedLevels[level.id] && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          {level.topics.map(topic => {
                            const topicRead = topic.subtopics.filter(s => progress[s.id]).length;
                            return (
                              <div key={topic.id} className="ml-2">
                                <button
                                  onClick={() => setExpandedTopics(p => ({ ...p, [topic.id]: !p[topic.id] }))}
                                  className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-muted/30 rounded-lg text-left transition-colors"
                                >
                                  {expandedTopics[topic.id] ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                                  <span className="text-xs font-semibold flex-1 text-foreground/80 leading-snug">{topic.title}</span>
                                  {topicRead > 0 && <span className="text-[10px] text-muted-foreground shrink-0">{topicRead}/{topic.subtopics.length}</span>}
                                </button>
                                <AnimatePresence>
                                  {expandedTopics[topic.id] && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden ml-4">
                                      {topic.subtopics.map(sub => (
                                        <button key={sub.id}
                                          onClick={() => setSelectedId(sub.id)}
                                          className={cn("w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors group",
                                            selectedId === sub.id ? "bg-primary/15 text-primary" : "hover:bg-muted/30 text-muted-foreground hover:text-foreground"
                                          )}
                                        >
                                          {progress[sub.id]
                                            ? <CheckCircle2 className="w-3 h-3 text-pos shrink-0" />
                                            : <Circle className="w-3 h-3 shrink-0 opacity-40" />}
                                          <span className="flex-1 leading-snug">{sub.title}</span>
                                          <span className="text-[10px] opacity-50 shrink-0 flex items-center gap-0.5">
                                            <Clock className="w-2.5 h-2.5" />{sub.mins}m
                                          </span>
                                        </button>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Calculators shortcut — only when sidebar open */}
          {sidebarOpen && (
            <div className="shrink-0 p-3 border-t border-border">
              <button
                onClick={() => setSelectedId("__calculators__")}
                className={cn("w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors", selectedId === "__calculators__" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}
                data-testid="sidebar-calculators"
              >
                <Calculator className="w-4 h-4 shrink-0" />
                Trading Calculators
              </button>
            </div>
          )}
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto">
          {selectedId === "__calculators__" ? (
            <TradingCalculators />
          ) : !selected ? (
            /* Welcome screen */
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.4 }}
                className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-5 shadow-lg">
                <BookOpen className="w-8 h-8 text-foreground" />
              </motion.div>
              <h1 className="text-2xl font-bold mb-2">Trading Knowledge Library</h1>
              <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
                From your first pip to institutional trading strategies — structured lessons covering everything you need to trade confidently and profitably.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl mb-8">
                {LEVELS.map(l => {
                  const levelTotal = l.topics.reduce((s, t) => s + t.subtopics.length, 0);
                  const levelDone  = l.topics.reduce((s, t) => s + t.subtopics.filter(x => progress[x.id]).length, 0);
                  return (
                    <div key={l.id} className={cn("p-4 rounded-xl border text-center cursor-pointer hover:scale-105 transition-transform", l.bg)}
                      onClick={() => { setExpandedLevels(p => ({ ...p, [l.id]: true })); setExpandedTopics({}); }}>
                      <l.icon className={cn("w-6 h-6 mx-auto mb-2", l.color)} />
                      <p className={cn("font-bold text-sm", l.color)}>{l.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{levelTotal} lessons</p>
                      {levelDone > 0 && <p className="text-[10px] text-pos mt-0.5">{levelDone} completed</p>}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setExpandedLevels({ beginner: true }); setExpandedTopics({ "what-is-forex": true }); setSelectedId("forex-intro"); }}
                  className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
                  Start from Beginner →
                </button>
                <button onClick={() => { setExpandedLevels({ expert: true }); setExpandedTopics({ "smart-money": true }); setSelectedId("smart-money"); }}
                  className="px-5 py-2.5 bg-muted text-foreground rounded-lg text-sm font-semibold hover:bg-muted/70 transition-colors border border-border">
                  Jump to Expert →
                </button>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={selected.sub.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                className="max-w-2xl mx-auto px-6 py-8">
                {/* Breadcrumb */}
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-4">
                  <span className={cn("font-semibold", selected.level.color)}>{selected.level.label}</span>
                  <span>›</span><span>{selected.topic.title}</span>
                </div>

                {/* Title row */}
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <h1 className="text-xl font-bold mb-1">{selected.sub.title}</h1>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{selected.sub.mins} min read</span>
                      <span className={cn("px-2 py-0.5 rounded-full border text-[10px] font-semibold", selected.level.bg, selected.level.color)}>{selected.level.label}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleRead(selected.sub.id)}
                    className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shrink-0",
                      progress[selected.sub.id] ? "border-pos/50 bg-pos/10 text-pos" : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                    )}
                    data-testid="button-mark-read"
                  >
                    {progress[selected.sub.id] ? <><CheckCircle2 className="w-3.5 h-3.5" />Completed</> : <><Circle className="w-3.5 h-3.5" />Mark as read</>}
                  </button>
                </div>

                {/* Content */}
                <div className="mb-8">{selected.sub.content}</div>

                {/* Quiz */}
                <QuizBlock
                  subtopicId={selected.sub.id}
                  onComplete={() => { if (!progress[selected.sub.id]) toggleRead(selected.sub.id); }}
                />

                {/* Key takeaways */}
                <div className="bg-primary/6 border border-primary/20 rounded-xl p-4 mt-6 mb-8">
                  <p className="font-semibold text-sm text-primary mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4" />Key Takeaways
                  </p>
                  <ul className="space-y-1.5">
                    {selected.sub.takeaways.map(t => (
                      <li key={t} className="flex gap-2 text-xs text-foreground/80">
                        <span className="text-primary shrink-0 mt-0.5">✓</span>{t}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Navigation */}
                <div className="flex justify-between gap-3 border-t border-border pt-5">
                  <button
                    onClick={() => currentIndex > 0 && setSelectedId(allSubtopics[currentIndex - 1].sub.id)}
                    disabled={currentIndex === 0}
                    className="flex-1 text-left px-4 py-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
                  >
                    <p className="text-muted-foreground mb-0.5">← Previous</p>
                    {currentIndex > 0 && <p className="font-semibold">{allSubtopics[currentIndex - 1].sub.title}</p>}
                  </button>
                  <button
                    onClick={() => {
                      if (!progress[selected.sub.id]) toggleRead(selected.sub.id);
                      if (currentIndex < allSubtopics.length - 1) setSelectedId(allSubtopics[currentIndex + 1].sub.id);
                    }}
                    disabled={currentIndex === allSubtopics.length - 1}
                    className="flex-1 text-right px-4 py-3 rounded-xl border border-primary/30 bg-primary/8 hover:bg-primary/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
                  >
                    <p className="text-primary mb-0.5">Next →</p>
                    {currentIndex < allSubtopics.length - 1 && <p className="font-semibold">{allSubtopics[currentIndex + 1].sub.title}</p>}
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
