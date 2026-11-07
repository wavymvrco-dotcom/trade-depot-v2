# Where the build stands (2026-11-07)

Branch: `phase0-foundation` (PR #1). `npm test` passes (108 tests).

## Phase 0 — complete
## Phase 1 — complete (one live-market observation pending: a Live order through the trade guard)
## Phase 2 — complete except multi-asset
## Phase 3 — complete except the Forecast layer (deferred, see DECISIONS)
- Forge (layer DSL, acceptance with a rising bar, MAP-Elites archive, Lab → Forge tab) and Layer Kit
  (`packages/layer-kit`), Storm Mode, Playbook + regime-gated genomes, Core v1, Hive (Terminal panel), Shelf Life and
  Fleet (Licenses tab), Proof of Process (hash chains, daily Merkle seals, Verify on License Pages).
- Real data so far: every Lab run Scrapped; Forge 0 accepted of 109. Both reported as is.

## Waiting on Marco
- Multi-asset (§11A): market data for stocks/crypto, broker (e.g. Alpaca) + test account, legal review per asset class.
- VPS, owner entity name (`[OWNER ENTITY]` placeholders), Pro limits, Layer Kit license.
- Turn on OpenTimestamps anchoring (`PROOF_ANCHOR=1`) once on the VPS, if wanted.

## Also pending
- Re-run TDCI "calibrate all" at /admin/tdci (old calibrations include weekend bars).
- Watch one real Live order go through the trade guard on a weekday.

## Next
- Assessment: should the engine "learn" the 47-book list? (docs/BOOKS.md)
- Explainer films for each system, built in Blender (docs/FILMS.md, `client/src/content/films.ts`).
