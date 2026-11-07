# Where the build stands (2026-11-07)

Branch: `phase0-foundation` (PR #1). `npm test` passes (75 tests).

## Phase 0 — complete
## Phase 1 — complete (one live-market observation pending: a Live order through the trade guard)
## Phase 2 — complete except multi-asset
- Mirror (fills → pooled cost model → Arena costs; Settings opt-out), Hunter (Level 4, fragility penalty),
  prop-firm rules + Challenge Odds, Rewind (Performance hub, Gen Zero "you", drawdown windows in the Vault),
  Blueprint AI (parse + confirm + refine), License Pages (`/l/:slug` + PNG share image). Verified end to end on the
  running app with test data (deleted afterwards).

## Waiting on Marco — multi-asset (§11A, "with Phase 2")
Needs decisions before building: market data for stocks/crypto (Twelve Data plan coverage, or a second provider),
the broker for stocks/crypto (e.g. Alpaca) and an account to test with, and legal review per asset class before
live trading (§11A.10). The Instrument model and broker-adapter interface (§11A.1, §11A.6) can be built as
groundwork first.

## Also pending
- Re-run TDCI "calibrate all" at /admin/tdci (old calibrations include weekend bars).
- From Marco: VPS, owner entity name, Pro limits.

## Next: Phase 3 (build sheet §11)
