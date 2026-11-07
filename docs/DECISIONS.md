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

## 2026-11-06 — Phase 0 routes split

- `server/routes.ts` was split by a script as a pure move into `server/routes/*.ts`. The sheet's list of
  groups is kept, plus one extra module, `alerts.ts` (price alerts, notifications, push), which fits none
  of the listed groups. App Health Score routes live in `admin.ts` (the sheet moves Health Score to Admin);
  backtest, watchlist, candles, calendar and news live in `market.ts`; leaderboard and strategy copy in
  `marketplace.ts`. *Why:* simplest grouping to verify; no URL changed.

## 2026-11-06 — Candle cache

- `candle_cache.time` stores Twelve Data's UTC time string instead of a timestamp, so a cached bar is
  byte-identical to a fetched one (determinism, invariant 10) and parsing stays in one place. The strings
  sort correctly within an interval.
- The Twelve Data rate limit (8/min on the free plan) is now shared by every process through an
  advisory-locked `external_calls` table; if the database is unreachable it falls back to a per-process limit.
- Measured: second load of EURUSD swing (5,000 4h + 954 daily bars) in a fresh process served 99.9% of
  bars from the cache with 2 small requests.

## 2026-11-06 — Job queue, worker process, hosting files

- pg-boss 12 (MIT) is the durable queue. It connects through `DATABASE_URL_UNPOOLED` (Neon's direct endpoint)
  because it keeps long-lived connections. pg-boss is ESM-only and needs Node ≥ 22.12; it is bundled into
  `dist/*.cjs` and `package.json` declares `engines.node >= 22.12`.
- The TDCI calibration queue moved from memory into pg-boss (`tdci.calibrate`), so calibrations survive
  restarts and run in the worker. Live progress messages ("Scoring and simulating…") are no longer shown;
  the UI shows queued / running / done with the result. Verified: a job queued with no worker running was
  picked up and completed when `dist/worker.cjs` started.
- `RUN_WORKERS` defaults to true (one process for local dev). The VPS service files set it to false on the
  web process and run `dist/worker.cjs` as a second always-on service. `deploy/` replaces Render;
  `render.yaml` is kept for now but no longer used.

## 2026-11-06 — 5-hub navigation

- Sidebar and mobile bar show only Terminal, Lab, Performance, Learn, Settings (+ Admin for admins).
- Hub pages show the existing pages as tabs (`?tab=`); a nested `AppLayout` renders only its content, so no
  page needed rewriting. Old URLs redirect: /analytics, /journal → Performance; /ai → Learn (AI Advisor tab);
  /news, /calendar → the Terminal's side panel.
- Still reachable but out of the menu: /analysis, /trade, /alerts (linked from the Terminal panel and the bell),
  /strategy and /tdci (linked from the Lab placeholder until Phase 1 replaces them), /health (linked from Admin;
  the route itself stays open so users don't lose their own score), /marketplace (hidden, per Marco).
- The app tour was rewritten for the five hubs, with copy that makes no performance claims.

## 2026-11-06 — Research Journal across the whole app

- Marco asked that the inside of the app match the landing page. The shadcn color variables now map to the
  Research Journal tokens (light default, warm dark variant via `html.dark`, chosen in the top bar; stored as
  `td_theme`, so everyone starts on light). Fraunces for h1/h2 only (small labels stay in Inter); IBM Plex Mono
  replaces JetBrains Mono.
- A one-off codemod replaced ~1,300 hard-coded palette classes in 35 files with semantic tokens that follow the
  theme: `pos` (gains), `neg` (losses), `warn` (caution), `info` (information), `on-strong` (text on solid fills).
  Gradients became solid fills; colored glows were removed; chart hexes use the same tokens. TradingView widgets
  read the current theme when they load.
- User-facing name changed from "TradeAI" to "Trade Depot"; emoji removed (the design system uses none).
- Landing page rebuilt from `docs/design/landing-a3.dc.html` (also received as a zip export; same design).
  Films load from `VITE_FILMS_CDN_URL` (the client-side name for the sheet's `FILMS_CDN_URL`); missing films show
  the labeled placeholder frame from the design.
- The 14% prop-challenge statistic is cited as the sheet gives it (FPFX Technology via Finance Magnates, 2026);
  it has not been independently checked here.
