# Where the build stands (paused 2026-11-06)

Branch: `phase0-foundation` (all work committed; not pushed). `npm test` passes (52 tests).

## Done
- **Phase 0** complete: password fix, routes split, candle cache, pg-boss queue + worker process, VPS deploy
  files, 5-hub navigation, Research Journal design across the app, A3 landing page.
- **Phase 1 engine** (`server/lab/engine/`): Arena, worlds/curriculum, successive halving, Vault Exam, Deflated
  Sharpe, grading, Shadow/Tripwire rules, license transitions. All §9.13 tests pass, including the honesty tests.
- **Phase 1 service + API** (`server/lab/service/`, `server/routes/lab.ts`): runs on real data in the worker,
  env cache, feasibility, vault-once record, licenses with audit log, Shadow Run tick, Tripwire, Live gate.
- **Phase 1 UI** (`/lab`): Blueprint, Arena (live), Report, Shadow, Licenses. Strategy/TDCI pages redirect to the
  Lab; TDCI calibration moved to `/admin/tdci`; Analytics Backtest tab removed.
- Verified end to end on real data: Feasibility → Train → Arena live → Vault Exam → Scrapped report → strategy record.

## Left in Phase 1
1. **Finish verifying Shadow Run on a live tick.** The test was interrupted: put a test strategy into Shadow,
   wait for a tick, confirm `shadow_trades` rows (with attribution and incumbent action) and saved evidence.
   (Test data was deleted when pausing.)
2. **Verify Live + Tripwire** with a demo-broker test account: Go Live → order has `license_id` and `risk_amount`;
   force a drift → Tripwire demotes to Probation/Shadow and notifies.
3. **`docs/DEMOS.md`**: record the planted-signal demo and the random-walk demo (DoD requirement).
4. Mobile check of the Lab tabs at 375 px; dark-mode check of the Lab.
5. Commit, then the Phase 1 summary for Marco. After that, Phase 2.

## Still needed from Marco
- A VPS (InfinityFree cannot run Node). Owner entity name for LICENSE/footer. Pro limits (runs/month, Shadow slots).
- Blender MCP: install the add-on in Blender, Connect, start a new session.
