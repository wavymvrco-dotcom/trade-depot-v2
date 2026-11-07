// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Landing-page copy, keyed for translation (§17.4: English first, Spanish later).
// Copy rules: every number is real and sourced or labeled Example/Illustrative;
// never claim profits, win rates, or that the AI beats the market.

export const landing = {
  en: {
    nav: { systems: "The systems", prop: "Prop traders", pricing: "Pricing", signIn: "Sign in", start: "Start free" },
    hero: {
      eyebrow: "STRATEGY VALIDATION LAB · EARLY ACCESS",
      title: "Your strategies, examined like a fund would examine them.",
      body: "Invent, attack, examine and shadow-test every idea before it trades. One honest record for each strategy you own.",
      cta: "Write your first Blueprint",
      console: { title: "Your strategies", label: "EXAMPLE ACCOUNT", cols: ["Strategy", "Stage", "Vault", "Shadow"] },
    },
    reel: {
      title: "Watch each system work.",
      systems: [
        { id: "arena", name: "Arena", code: "ARENA", step: "STAGE 03", headline: "Thousands of versions trade the same markets.", body: "Every variation faces identical randomized worlds, easy to hard, with real costs and missed fills. Only consistent survivors move on." },
        { id: "gauntlet", name: "Gauntlet", code: "GAUNTLET", step: "STAGE 04", headline: "Then we try to break what survived.", body: "Hunter attacks its stops and fills. Rewind replays your real losses. Storm Mode throws crises history has not shown yet." },
        { id: "vault", name: "Vault Exam", code: "VAULT", step: "STAGE 05", headline: "One exam on data it has never seen.", body: "The score is discounted for every attempt made and rerun at double costs. Rejected is a real answer." },
        { id: "shadow", name: "Shadow Run", code: "SHADOW", step: "STAGE 06", headline: "It trades silently beside you first.", body: "On live prices, with every disagreement logged, until the evidence says it is ready." },
        { id: "licensed", name: "Licensed", code: "LICENSE", step: "STAGE 07", headline: "Only then can it touch real money.", body: "Its whole record is fingerprinted and timestamped, and Tripwire pulls it back if live results drift." },
      ],
    },
    problem: {
      title: "Most strategies only look good.",
      cards: [
        { title: "Overfitting", body: "Tune enough settings on the same history and anything looks profitable. The Lab keeps a locked slice of data the strategy never sees until its one exam." },
        { title: "Luck", body: "Try a thousand variations and the best one wins by chance. Every attempt is counted, and the result is discounted for how many were tried." },
        { title: "Real costs", body: "Spreads, slippage and missed fills turn thin edges negative. Every test pays realistic costs, then is rerun at double costs." },
      ],
    },
    loop: {
      title: "The loop",
      stages: [
        { name: "Blueprint", body: "Describe the strategy you want: style, pairs, risk and the rules it must never break." },
        { name: "Gen Zero", body: "Start from the defaults, past calibrations and your own settings." },
        { name: "Arena", body: "Variations trade the same randomized worlds; only consistent ones survive." },
        { name: "Gauntlet", body: "Survivors are attacked: worse fills, hunted stops, replayed losses." },
        { name: "Vault Exam", body: "One test on locked data, at normal and double costs, adjusted for luck." },
        { name: "Shadow Run", body: "It trades on live prices without money, beside your current strategy." },
        { name: "Live", body: "Only a Licensed strategy can trade, and only inside your risk limits." },
        { name: "Tripwire", body: "If live results drift from what the exam predicted, it is pulled back to Shadow." },
      ],
    },
    prop: {
      eyebrow: "FOR PROP TRADERS",
      title: "Know your odds before you pay for a challenge.",
      body: "Enter your firm's rules: daily loss limit, maximum drawdown, profit target. Challenge Odds runs your strategy's examined trades through those rules thousands of times and reports a range, never a single promise.",
      stat: "14%",
      statLabel: "of prop-firm challenge accounts reach a payout.",
      statSource: "Source: FPFX Technology, via Finance Magnates (2026).",
      card: { label: "ILLUSTRATIVE", title: "Challenge Odds", range: "38–52%", rangeLabel: "estimated chance to pass", rows: [["Most common failure", "Daily loss limit"], ["Median days to pass", "19"], ["Simulated paths", "10,000"]] },
    },
    license: {
      eyebrow: "PROOF OF PROCESS",
      title: "A license is a record nobody can edit.",
      body: "Before the Vault Exam, the strategy and the locked data are fingerprinted. Every Shadow Run decision is chained to the one before it, and each day's fingerprints are timestamped publicly. Anyone can check that nothing was changed after the results were known.",
      card: { label: "EXAMPLE", name: "London Breakout", rows: [["Vault Exam", "Passed · 2× costs passed"], ["Luck-adjusted confidence", "0.97"], ["Shadow Run", "31 days · 22 trades"], ["Fingerprint", "9f3c…a71e"], ["Timestamped", "2026-10-04"]] },
    },
    markets: {
      title: "Markets",
      items: [{ name: "Forex", status: "Live" }, { name: "Stocks", status: "Coming" }, { name: "Crypto", status: "Coming" }, { name: "Futures", status: "Coming" }],
    },
    learn: {
      title: "Learn",
      guides: [
        { lang: "EN", title: "Why a backtest lies", body: "Overfitting, look-ahead and survivorship, with examples." },
        { lang: "EN", title: "Reading a Vault Exam report", body: "What each number means and when Rejected is the right answer." },
        { lang: "EN", title: "Costs that kill edges", body: "Spread, slippage and commission in R-multiples." },
        { lang: "ES", title: "Cómo leer un examen Vault", body: "Qué significa cada número y por qué «Rechazada» también es una respuesta válida." },
      ],
    },
    pricing: {
      title: "Pricing",
      plans: [
        { name: "Free", price: "$0", features: ["Blueprint and Arena (small populations)", "2 Lab runs a month", "Full Vault Exam reports"] },
        { name: "Pro", price: "[YOUR PRICE]", features: ["Full-size Arena runs", "Shadow Run and Live", "Prop-firm rules and Challenge Odds", "Rewind on your own trades"] },
      ],
    },
    final: { title: "Find out if your strategy is real.", cta: "Start free" },
    footer: {
      disclaimer: "Trade Depot is a self-directed strategy testing tool, not investment advice. Simulated and historical results do not guarantee future performance. Trading involves substantial risk of loss.",
      copyright: "© 2026 [OWNER ENTITY]. All rights reserved.",
      links: { terms: "Terms", privacy: "Privacy", signIn: "Sign in" },
    },
  },
} as const;

export type LandingCopy = typeof landing.en;
