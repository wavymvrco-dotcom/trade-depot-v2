# Design decisions

Decisions made by Marco Lopez (owner) during the Strategy Lab build, with the reason for each.
Newest at the bottom. Format: date — decision — why.

## 2026-11-06 — answers to the build sheet's open questions

- **User accounts erased.** All 13 existing accounts and their data were deleted from production
  (Neon snapshot `snap-cold-unit-arqbwtu2` taken first). Seeded AI lessons and TDCI calibrations kept.
  *Why:* a clean start for the rebuilt product. No account had a plain-text password, so the Phase 0
  password fix only removes the legacy login code; no migration or forced reset is needed.
- **Hosting: a cheap VPS instead of Render.** One always-on server runs the web process and the
  background worker. *Why:* lowest monthly cost for processes that must never sleep. Place it near
  Neon's us-west-2 (Oregon) region.
- **AI-signal auto-trade must earn a license.** It becomes a strategy that goes through Shadow Run
  like any Lab strategy before it can trade real money. *Why:* one honest bar for everything that trades.
- **Scalp stays in the Lab, with a warning.** Its Vault covers only about 2 weeks of 5-minute data,
  so every scalp report shows a "short test window" warning. *Why:* keep the style available without
  overstating the evidence.
- **Tiers.** Lab limits are settings. Free uses the sheet's values (population ≤ 48, generations ≤ 20,
  2 runs/month); Pro values are set before launch.
- **Marketplace hidden.** Removed from the menu; code and data kept. *Why:* it has no place in the
  5-hub navigation yet and may return for sharing Licensed strategies.
- **Mirror data contribution on by default,** clearly explained in Settings, with an opt-out.
  *Note:* some privacy laws prefer opt-in; to be reviewed by a lawyer before launch.
