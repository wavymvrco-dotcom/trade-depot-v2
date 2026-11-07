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

## 2026-11-06 — Phase 1 engine

- **Engine is pure** (`server/lab/engine/`): no database, HTTP or service imports (enforced by a test). Calibration's
  trade simulator moved into `engine/outcomes.ts` and both use it; a parity test keeps a verbatim copy of the old one.
- **Layer matrix stored as Float32 always** (fresh or cached), so cached and freshly built environments give
  byte-identical results.
- **Vault isolation is structural:** training code receives environments with every vault candle removed. A test
  changes vault candles and confirms training output is identical.
- **Constraints the genome can't control are rules, not deaths.** `sessionHoursUtc` filters entries;
  `noWeekendHolding` closes positions at the last bar of the entry week. `maxConsecutiveLosses` is a death
  (the agent's choices cause it). `maxStopAtr` / `minRr` bound the genome's grid. *Why:* killing every agent for a
  rule none of them can affect would make those Blueprints unusable.
- **Tripwire CUSUM uses h = 6, not 5.** Measured over 1,000 runs × 1,000 trades (k = 0.5):
  h = 5 falsely trips 66.6% of runs on normal returns and 11.6% on trade-shaped (+2R/−1R) returns;
  h = 6: 31.7% / 2.7%; h = 8: 4.2% / 0.0%. Median trades to catch a win-rate drop 40% → 20%: 91 (h=5), 131 (h=6),
  326 (h=8). Trade results are two-point, so h = 6 meets the sheet's "< 5% false trips over 1,000 trades" on the
  realistic distribution while still reacting in ~130 trades; the drawdown-breach rule is the fast backstop.
- **Luck adjustment is strict, as designed.** The Deflated Sharpe uses the champion's validation trades. On a single
  pair a real but modest edge (per-trade Sharpe ≈ 0.3) needs roughly 400 validation trades to reach 0.95, so it is
  usually graded "likely luck". With 3–4 pairs the same edge passes. Consequence: the Feasibility check steers users
  toward more pairs, and single-pair Blueprints on short histories will mostly be Scrapped. This is the honest answer.
- **Measured performance:** population 128 × 40 generations × 8 episodes on 5,000 bars × 8 layers: 0.62 s with
  successive halving (19,200 agent-episodes) vs 0.89 s without (40,960). Sheet target: < 60 s.

## 2026-11-06 — Phase 1 service layer

- **Data is pinned per day.** Lab runs use bars up to 00:00 UTC of the current day, so every run that day sees the
  same data and shares one `env_cache` entry per (symbol, style, data version, TDCI version) across all users.
- **No worker threads (yet).** The Arena yields to the event loop after every generation (~15–50 ms of work), which
  keeps the worker responsive and lets progress be saved and Stop be honoured. A full 128×40 run on real data took
  about a minute end to end, mostly data loading on first use. Revisit if runs grow large.
- **Vault-once record:** `vault_openings` (run, genome). A crash-retry may repeat the same deterministic exam only if no
  result was ever stored for that run — it reveals nothing new.
- **Luck adjustment variance** uses only hall-of-fame candidates with ≥ 30 validation trades (same bar as a champion).
  A real run showed one candidate with a handful of trades producing a variance of 15,182 and SR₀ = 320. Every
  candidate still counts toward N (trials).
- **Live requires Licensed, for every auto-executed signal.** AI-generated signals and TradingView alerts are their own
  strategy kinds (`ai_signals`, `tradingview`). Until those kinds can go through Shadow Run, auto-execution of them is
  paused; signals are still generated and notified for manual action.
- **Tiers:** Free cannot start Shadow Run or go Live (sheet §14). Admins can set a user's Lab plan
  (`PATCH /api/admin/users/:id/lab-tier`) until billing exists. Pro run and Shadow limits are env-configurable
  (`LAB_PRO_RUNS_PER_MONTH`, default 10; `LAB_PRO_SHADOW_SLOTS`, default 5) until Marco sets them.
- **Shadow decisions** are recorded only when the candidate or the incumbent acts (both flat = nothing to compare).
  Market data is fetched once per (symbol, style) per bar for all strategies; on weekends the check repeats each minute
  but the candle cache makes it a no-op request at most every few minutes.

## 2026-11-06 — Phase 1 UI and real-data findings

- The Lab replaces the Strategy and TDCI pages (they redirect to /lab); TDCI calibration stays for admins at
  /admin/tdci because calibrations still seed Gen Zero. The Analytics Backtest tab is removed.
- Per-trade Sharpe is 0 when its spread is numerically zero (every trade hit the same target); otherwise one such
  candidate made the luck adjustment meaningless (variance 19,193). After the fix a real run gave variance 0.10.
- First real runs (swing, 3–4 majors, 128 × 40): all Scrapped — vault negative and likely luck. This matches the
  earlier calibration finding that the current TDCI layers show no proven edge. The Lab is reporting it honestly.

## 2026-11-07 — Weekend bars, Live safety, Phase 1 verification

- **The data feed quotes FX around the clock.** Twelve Data returned full Saturday and Sunday bars for EURUSD
  (288 fifteen-minute bars per weekend day, moving like real ones: average range 5.7 bp vs 4.8 bp in trading hours),
  about 27% of all bars. No forex broker fills orders then. Calibration, the Lab and Shadow Run were partly scoring a
  closed market. Fix (build sheet §11A.3): `shared/sessions.ts` FX calendar (closed Fri 21:00 → Sun 21:00 UTC);
  `fetchCandles` drops closed-market bars on read (the raw cache keeps everything) and asks for 45% more raw bars so
  callers still get the history length they asked for. `TDCI_VERSION` → 2 so cached Lab environments rebuild.
  **Consequence:** existing TDCI calibrations were computed with weekend bars; re-run "calibrate all" from
  /admin/tdci. Holidays are not modelled yet.
- **Live orders only on fresh signals:** a Live strategy places a real order only if its signal bar closed within
  the last two bar lengths. Verified over a weekend: it decided on Friday 20:45's bar and placed nothing.
- **Tripwire restarts the Shadow clock:** a demoted strategy needs fresh Shadow evidence to graduate again.
- **Day-style finding:** with ~7 months of 15-minute history and real TDCI layers, evolution learns to barely trade
  (losing less beats losing more), so no version reaches 30 validation trades and the run ends "no champion". Honest,
  but a reason to give Day/Scalp more history (Twelve Data plan) or more pairs.

## 2026-11-07 — Phase 2: Mirror and Hunter

- **Mirror** records every real order's quote, fill and latency (opens, and closes the broker confirms). Demo fills
  are excluded from the fit (they are the quote itself). Prior quantiles reproduce the Phase 1 assumption
  (spread 0.8–2.5×, slippage 0–4× the base), so with no fills a run behaves as before. A user who opts out is
  removed from the pool entirely, past fills included, at the next nightly fit (03:15 UTC). The Arena uses the
  no-news cell (historical bars have no reliable news flag). Costs are drawn per bar per episode and shared by every
  agent in the generation (invariant 5).
- **Hunter** is Level 4 of the curriculum (reached after Level 3 is cleared). Delayed entries reuse the next bar's
  cached outcome; hunted stops use 4× base slippage until Mirror has real stop fills. Hunter results are reported
  ("keeps X% of its results under attack") but do not gate the grade — the sheet does not ask for a gate.
  Co-evolving Hunter's budget allocation (optional in the sheet) is not built.

## 2026-11-07 — Phase 2: prop rules, Challenge Odds, Rewind

- **Prop rules:** loss limits are % of the starting account (the common convention); daily limit measured from the
  day's starting equity, resetting at a user-set UTC hour. In the Arena only daily-loss and drawdown breaches kill
  (targets and time limits belong to a whole challenge, not one episode window). News restrictions are recorded but
  not simulated (no historical news calendar). No firm's rules are hard-coded — two editable templates only.
- **Challenge Odds interval:** Wilson 90% interval using the number of *real* trades as the sample size, not the
  10,000 simulated paths — the uncertainty is in the evidence. Fewer than 10 real trades → no estimate at all.
- **Rewind** replays on 15-minute candles (~7 months); older trades are counted as skipped. Each change keeps the
  user's own exit. Size changes are shown but never offered as "the" fix (they scale wins and losses alike).
  Journal entries are included unless they duplicate a position (same pair, opened within a minute).
- **Rewind in the Gauntlet:** the champion is run over the user's two worst drawdown periods *inside* the one Vault
  Exam (so the Vault still opens once). Periods overlapping training/validation are labelled in-sample and not
  graded; out-of-sample breaches of the Vault's 95th-percentile drawdown fail with `rewind_drawdown`.
- **Gen Zero "you":** logistic regression of the user's entry bars vs. 5× random bars on |layer value| (entries are
  side-agnostic); only layers that made entries more likely get weight; needs ≥ 20 entries.

## 2026-11-07 — Phase 2: Blueprint AI

- The model receives a hand-written JSON Schema (zod 3 has no built-in exporter); a test keeps its fields identical
  to the zod schema. Acceptance is a pure function (`acceptAiSpec`) — only a strictly valid spec ever leaves it.
  One retry with the validation errors, then "please use the form".
- Confirmation is explicit: the plain-English read-back must be accepted before the form is filled, and a run still
  needs the feasibility check and Train. Refinements are reviewed in the form, never run automatically.
- Reflection sends only the report-card summary (grade, reasons, vault statistics), never candles or trades.
- Cost control: 12 Blueprint AI calls per user per hour, on the user's own key.
- **Trials across runs (invariant 3):** every earlier finished run by the same user on the same pairs, style and data
  day adds its trials to the luck adjustment — not only Blueprint versions. Re-running until something looks lucky
  makes the bar higher, as it should.

## 2026-11-07 — Phase 2: License Pages

- Server-rendered HTML at `/l/:slug` (not the React app): fast, cacheable (5 min), readable without JavaScript, and
  impossible to alter from the browser. The slug is random (64 bits). Only strategies that passed the Vault can be
  published; unpublishing removes the page immediately (after the 5-minute cache).
- The share image is a PNG (most platforms ignore SVG), drawn from SVG with `@resvg/resvg-js` (MPL-2.0); it falls
  back to SVG if the renderer is unavailable. On the VPS, install a basic font package (e.g. `fonts-dejavu-core`) so
  its text renders.
- Publish/unpublish only touches the page fields, through `licenses.ts` (`setPublicPage`), never grade or stage.
- The "Verify" button and timestamping are Proof of Process (§11.10, Phase 3).

## 2026-11-07 — Phase 3: Forge and Storm Mode

- **Forge DSL validator is hand-written**, not a recursive zod union: the zod version re-checks every branch at every
  level and took 42 s on a deep tree (now ~2 ms). It refuses unknown ops, unknown keys, wrong types, out-of-range
  numbers, depth > 6, > 40 nodes and nested `htf()`. A `hour` series (UTC hour of the bar's close) was added so the
  "session" family the sheet lists can exist.
- **Acceptance** pools the training rows of EURUSD, GBPUSD, USDJPY and AUDUSD per style; only rows after a layer's own
  warmup count; programs that read no market data are refused. layerTrials = every program ever tested for that
  style (never reset), which raises the |t| bar via Bonferroni.
- **Real-data result (swing, 2026-11-07):** 109 programs tested by mutation (no AI key), **none accepted**; best
  |t| = 1.69 against a bar of 3.49. Reported as is. The first 55 were judged with a warmup flaw (constant programs
  scored on warmup zeros); they stay in the count — they were real trials.
- **Arena use:** accepted layers become extra genome dimensions at weight 0 in Gen Zero; Shadow Run evaluates them on
  live data. `TDCI_VERSION` → 3 (environments now carry higher-timeframe bars for `htf()`).
- **Gap fills (§11A.3):** a stop or target crossed by the bar's *open* fills at the open — worse for stops, better for
  targets. Applies to calibration, the Lab and Shadow Run alike. The parity test still holds (no gaps in its data).
- **Storm Mode** runs as its own job after a Vault pass: 200 worlds (bootstrap, regime, gaps, spread blowouts) over the
  strategy's pairs, each the length of the Vault period plus warmup, all TDCI layers recomputed (COT/rates keep real
  values). Limit: the prop rules' max drawdown in R if set, else the Vault's 99th-percentile drawdown. Pass = ≥ 95% of
  worlds under the limit. It is a stamp only — never a grade change, never imported by training (test-enforced).
  ~7 s for 200 worlds.
