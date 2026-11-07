# Phase 1 demos (build sheet §9.13, Definition of Done)

Reproduce with `npx tsx script/lab-demos.ts`. Synthetic markets (see `tests/lab-helpers.ts`): three pairs, 4,000
four-hour bars each, six layers of AR(1) noise. Full-size Lab runs: 128 agents × 40 generations × 8 episodes, the
real engine, real costs (spread, slippage, commission), the Vault Exam and grading. Recorded 2026-11-07.

## 1. Planted signal — it finds a real edge and proves it

Layer 2 drives the next bar's return. Every run found it (largest weight, trading *with* it), and every run passed
the Vault Exam on locked data it had never seen, survived double costs, beat the default TDCI weights and cleared
the luck adjustment.

| Seed | Grade | Reasons | Trials | Weight on layer 2 (largest?) | Vault trades | Vault R | 2× cost R | Default TDCI R | Luck-adjusted confidence |
|---|---|---|---|---|---|---|---|---|---|
| 1 | probation | — | 120 | 1.00 (yes) | 309 | +118.0 | +97.8 | +9.4 | 100% |
| 2 | probation | — | 120 | 1.00 (yes) | 198 | +103.6 | +90.6 | +12.1 | 100% |
| 3 | probation | — | 120 | 1.00 (yes) | 203 | +77.0 | +63.7 | +19.8 | 100% |
| 4 | probation | — | 120 | 0.89 (yes) | 268 | +145.7 | +128.2 | +37.7 | 100% |
| 5 | probation | — | 120 | 1.00 (yes) | 290 | +109.0 | +90.1 | +36.4 | 100% |

"Probation" is the best grade the Vault can give: Licensing still requires a Shadow Run on live prices.

## 2. Pure random walk — it refuses to be fooled

No layer has any signal. Every run was Scrapped. Note seed 3: the champion made **+11.8R on the locked data** by
luck, and the luck adjustment (Deflated Sharpe over 120 trials) still rejected it at 7% confidence. Seed 2 is the
same story at +3.9R. A plain backtest would have called both of these winners.

| Seed | Grade | Reasons | Trials | Vault trades | Vault R | 2× cost R | Default TDCI R | Luck-adjusted confidence |
|---|---|---|---|---|---|---|---|---|
| 1 | scrapped | vault_negative, likely_luck | 120 | 51 | −7.2 | −8.9 | −24.5 | 21% |
| 2 | scrapped | likely_luck | 120 | 83 | +3.9 | +2.1 | −13.7 | 42% |
| 3 | scrapped | likely_luck | 120 | 82 | +11.8 | +10.0 | +2.2 | 7% |
| 4 | scrapped | weak_profit_factor, cost_fragile, likely_luck, no_better_than_default | 120 | 66 | +1.1 | −0.3 | +5.1 | 36% |
| 5 | scrapped | likely_luck, no_better_than_default | 120 | 70 | +5.0 | +3.4 | +5.4 | 33% |

The automated version of this check (`tests/lab-engine.test.ts`) runs 40 random-walk seeds and requires at least
38 to be Scrapped; all 40 are.

## 3. Real data (EURUSD, GBPUSD, USDJPY, AUDUSD — swing and day)

Every real run so far was Scrapped: losses on the locked data and results consistent with luck, or (Day style, about
seven months of history) no version willing to trade enough to be examined. This matches the earlier TDCI
calibration finding that the current layers show no proven edge. The Lab is reporting that honestly; the Forge
(Phase 3) is where new layers will be invented and tested.

## 4. Shadow Run, Live and Tripwire on the running app (test account, test data, deleted afterwards)

- **Shadow Run:** on a live closed bar the strategy recorded `SHORT EURUSD` (score 23) beside the incumbent's `FLAT`
  (logged as a disagreement), with exact attribution (50% HTF trend · 31% market structure · 18% floor pivots), and
  saved its graduation evidence (verdict: continue).
- **Tripwire:** with the strategy Live, 14 closed −1R trades pushed its drawdown past the Vault's 99th percentile;
  the next tick demoted it Licensed/Live → Probation/Shadow, wrote the reason to its history, sent the
  notification, and left open positions alone.
- **Live safety:** over the weekend the newest closed bar was Friday 20:45; the Live strategy decided on it and
  placed no order because the signal was stale.
- **Not yet observed:** a real Live order filling through the trade guard (needs market hours).
