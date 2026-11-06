# TradeAI Terminal

## Overview
Full-stack autonomous AI trading terminal with adaptive AI learning, multi-broker execution, 5 AI providers, WebSocket live prices, risk management, economic calendar, analytics, education, and trade journaling.

## Architecture
- **Frontend**: React + TypeScript + Vite + Wouter + Tailwind CSS + Framer Motion + Recharts
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Sessions**: PostgreSQL-backed sessions via connect-pg-simple (persistent across restarts)
- **Auth**: bcrypt password hashing (12 rounds); plain-text passwords are never accepted (server/password.ts)
- **Real-time**: WebSocket price feed at `/ws/prices` (3s broadcast interval)

## Admin System
- **Admin Panel**: Full admin dashboard at `/admin` — visible in sidebar only for admins
- **Admin DB fields**: `users.is_admin`, `users.is_banned`, `users.ban_reason`
- **Admin middleware**: `requireAdmin` on all `/api/admin/*` routes — checks session + isAdmin
- **Initial setup**: Admin was seeded via DB for user `Yes`. To promote future users, use Admin Panel → Users → Make Admin
- **Features**: Platform stats, user management (ban/unban/delete/promote/reset-password), all trades view, all signals view, marketplace moderation, broadcast notifications to all users

## Key Features

### AI System
- **5 AI Providers**: OpenAI, Claude, Gemini, Groq, Perplexity — per-user API key management
- **AI Knowledge Base**: 24 expert lessons seeded at startup (entry patterns, risk rules, pair behavior, psychology, market mechanics). Lessons are injected into AI signal prompts to enhance quality
- **AI Learning**: After each trade closes, AI generates a post-trade review → extracts a lesson → stores it in the knowledge base. The AI progressively improves with each trade
- **AI Trade Reviews**: Auto-generated after every closed position — grade (A+ to F), strengths, improvements, mistake type classification, lesson extracted
- **AI Weekly Report**: On-demand AI coach report covering last 7 days of trading
- **AI Signals**: Signals stored to DB with history; injected knowledge makes signals expert-grade

### Risk Management
- **Risk Dashboard**: Real-time gauges for daily P&L vs limit, max drawdown, open position count
- **Configurable Limits**: Per-user daily loss limit, max drawdown, max open positions, max lot size
- **Auto-pause**: Trading pauses automatically when limits are breached
- **Manual Resume**: Users can manually resume trading after reviewing the breach

### Analytics (6 tabs)
- **Overview**: Equity curve, win rate, profit factor, drawdown, streak tracking (current/best/worst)
- **Risk**: Live risk dashboard with gauges and limit editor
- **Backtest**: Real OHLCV from Twelve Data; EMA/RSI signals; equity curve + drawdown
- **Correlation**: Matrix of forex pair correlations (light/dark mode compatible)
- **Sessions**: Live market session clock (Sydney/Tokyo/London/NY with countdown) + heatmap
- **Leaderboard**: Single-query SQL aggregation (no N+1)

### Trading Terminal
- TradingView widgets, live price feed, multi-timeframe charts
- Multi-broker: MT5 JSON bridge, OANDA, IBKR, Demo ($10K virtual)
- Auto-trade worker (60s interval), trailing stop support

### Broker Execution (Real)
- **OANDA**: Live trade placement via REST API (`placeOandaOrder`, `closeOandaTrade`) — keys stored in userSettings
- **MT5**: JSON bridge integration (`placeMT5Order`, `closeMT5Trade`) — brokerServer is the bridge URL
- **Execution flow**: Signal execute → check brokerType → call broker API → store `brokerTradeId` on position → close via same ID
- **Fallback**: Position always saved locally even if broker call fails; error logged but not fatal

### News (Live Forex Feed)
- **RSS Aggregation**: 4 feeds (ForexLive, MarketWatch, Investing.com, FXStreet) — fetched in parallel, 5-min server cache
- **AI Sentiment**: `/api/news/sentiment` — returns sentiment (bullish/bearish/neutral), score (-100 to +100), impact, affected pairs, urgency
- **Frontend**: Live article feed with currency filter (All/USD/EUR/GBP/JPY/AUD/CAD/CHF/XAU), category badges, AI impact button per article, Economic Calendar toggle

### Analysis Page
- **Pair Selector**: 12 forex pairs including XAUUSD; timeframe selector (1m–1W)
- **Live Chart**: Full TradingView Advanced Chart (dynamic symbol + timeframe)
- **Technical Analysis Widget**: TradingView's multi-indicator panel (switchable tab)
- **AI Read Chart**: `/api/analysis/ai-read` — uses Twelve Data candles + current price for context; returns 6-section written analysis with trade setup and confidence rating

### Marketplace
- **Star Ratings**: 1–5 star display per listing; rating count shown
- **Sort Options**: Most Popular, Highest Rated, Newest, Best Win Rate
- **Featured Section**: Top 3 strategies highlighted with gradient border and award badge
- **Strategy Detail Modal**: Full view before applying (description, pairs, stats, vote/apply buttons)

### Dashboard — Live P&L
- **WebSocket P&L**: `useLivePrices` hook tracks open position symbols; floating P&L computed from live bid/ask
- **Per-position live price**: Live column in positions table; mobile positions panel shows live price
- **Account balance**: Displayed in P&L strip when set in Settings
- **Broker status**: Green badge showing connected broker type (OANDA/MT5) in P&L strip
- **Signal UX**: Spinner while analyzing, formatted signal card details, toast on completion

### Mobile (Full Pass)
- **AppLayout bottom nav**: Fixed 5-tab bar (Terminal/Analysis/News/Alerts/More) on all non-dashboard pages
- **Dashboard**: Has its own mobile bottom nav (Chart/Positions/Orders) with live P&L bar on chart view
- **Pages**: All pages add `pb-20 md:pb-4` clearance for mobile nav; fully responsive at 375px

### Other
- **Strategy Builder**: Risk %, max positions, R:R ratio, auto-trade toggle
- **Economic Calendar**: Live economic events
- **Price Alerts**: Real-time watcher every 30s, in-app notifications
- **Trading Journal**: Paper + live logs, P&L calendar heatmap, CSV export
- **Public Profile**: `/profile/:username` — shareable performance card
- **Email Notifications**: Per-user SMTP config or server env vars
- **TradingView Webhook**: `/api/webhook/tradingview`
- **Learning Library**: 35+ structured lessons with quizzes
- **Keyboard Shortcuts**: G/A/J/M/N/L/D and more
- **Dark/Light Mode**: CSS `html.light` class override
- **PWA**: manifest.json, install prompt

## Pages
- `/` — Trading Terminal
- `/analysis` — Technical Analysis
- `/strategy` — Strategy Builder
- `/analytics` — Analytics (overview + risk + backtest + correlation + sessions + leaderboard)
- `/ai` — AI Advisor (signals + knowledge brain + trade reviews + weekly report)
- `/calendar` — Economic Calendar
- `/alerts` — Price Alerts
- `/news` — News Feed
- `/learn` — Trading Education Library
- `/journal` — Trade Journal
- `/marketplace` — Strategy Marketplace
- `/profile/:username` — Public performance card
- `/settings` — Settings (AI keys, broker, email, MT5, risk limits)

## Database Tables
- `users` — Auth with bcrypt-hashed passwords
- `session` — Persistent sessions
- `strategies` — Per-user trading strategies
- `positions` — Open/closed positions
- `ai_signals` — AI signal history
- `user_settings` — API keys, onboarding, theme, SMTP
- `price_alerts` — Price alert rules
- `notifications` — In-app notifications
- `watchlist` — Per-user saved symbols
- `trade_journal` — Manual trade logs
- `strategy_marketplace` — Community strategies
- `marketplace_votes` — Strategy votes
- `ai_knowledge` — Expert lessons + AI-learned patterns (seeded on startup)
- `trade_reviews` — AI post-trade analysis per closed position
- `risk_limits` — Per-user risk configuration

## Server Modules
- `server/ai-engine.ts` — Multi-provider AI signal generation + expert knowledge prompt
- `server/ai-knowledge.ts` — Knowledge base seeding, trade review generation, weekly reports
- `server/risk.ts` — Risk dashboard computation, limit enforcement, auto-pause
- `server/ws.ts` — WebSocket price feed (3s broadcast to subscribers)
- `server/pips.ts` — Pip/lot calculations for 25+ symbols
- `server/backtest.ts` — Backtesting engine (Twelve Data OHLCV)
- `server/email.ts` — Nodemailer email notifications
- `server/brokers/mt5.ts` — MT5 JSON bridge

## Dev Notes
- Port 5000 (only unblocked port)
- WebSocket at `/ws/prices` — subscribe with `{ type: "subscribe", symbols: [...] }`
- Auto-trade worker: 60s interval
- Alert watcher: 30s interval
- Knowledge base seeded on first startup (24 expert lessons)
- TWELVE_DATA_API_KEY available in env for backtesting
