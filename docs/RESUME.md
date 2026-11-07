# Where the build stands (2026-11-07)

Branch: `phase0-foundation` (PR #1). `npm test` passes.

## Phase 0 — complete
## Phase 1 — complete except one live-market observation
- Engine, service, API and Lab UI built and tested; honesty tests pass; demos in `docs/DEMOS.md`.
- Verified on the running app with test data: Feasibility → Train → Arena → Vault Exam → report; Shadow Run tick
  (decision + incumbent + attribution + evidence); Tripwire demotion (history + notification); stale-signal guard.
- Mobile (375 px) and dark mode checked for /lab.
- **Still to observe during market hours:** a Live strategy's real order passing the trade guard with `license_id`
  and `risk_amount` recorded.

## To do before/alongside Phase 2
- Re-run TDCI "calibrate all" (/admin/tdci): old calibrations include weekend bars.
- From Marco: VPS, owner entity name, Pro limits.

## Next: Phase 2 (build sheet §10)
Mirror (execution_fills capture first), Hunter, Rewind, Blueprint AI, prop-firm rules, Challenge Odds, License Pages;
stocks + crypto spot per §11A.9.
