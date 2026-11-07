import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, index, jsonb, doublePrecision, primaryKey, date, bigint, bigserial, uniqueIndex, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  banReason: text("ban_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const strategies = pgTable("strategies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  goal: text("goal").notNull(),
  style: text("style").notNull(),
  description: text("description"),
  riskPercent: real("risk_percent").notNull().default(2.0),
  maxPositions: integer("max_positions").notNull().default(3),
  rrRatio: real("rr_ratio").notNull().default(2.5),
  accountSize: real("account_size").default(10000),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertStrategySchema = createInsertSchema(strategies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Strategy = typeof strategies.$inferSelect;

export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  symbol: text("symbol").notNull(),
  type: text("type").notNull(),
  size: real("size").notNull(),
  entryPrice: real("entry_price").notNull(),
  currentPrice: real("current_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  profit: real("profit").notNull().default(0),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  aiSignal: boolean("ai_signal").notNull().default(false),
  brokerTradeId: text("broker_trade_id"),
  signalId: varchar("signal_id"),
  licenseId: varchar("license_id"), // Strategy Lab license that opened this position (live trades)
  riskAmount: real("risk_amount"),  // account currency at risk at the stop when opened (for R-multiples)
}, (t) => [index("positions_user_status_idx").on(t.userId, t.status), index("positions_license_idx").on(t.licenseId)]);

export const insertPositionSchema = createInsertSchema(positions).omit({
  id: true,
  openedAt: true,
  closedAt: true,
});
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positions.$inferSelect;

export const aiSignals = pgTable("ai_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  symbol: text("symbol").notNull(),
  action: text("action").notNull(),
  confidence: integer("confidence").notNull(),
  reasoning: text("reasoning").notNull(),
  entryPrice: real("entry_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  size: real("size").notNull().default(0.1),
  status: text("status").notNull().default("pending"),
  // Outcome tracking
  outcome: text("outcome"),          // 'TP_HIT' | 'SL_HIT' | 'EXPIRED' | null
  outcomePrice: real("outcome_price"),
  outcomeAt: timestamp("outcome_at"),
  aiProvider: text("ai_provider"),   // which provider generated this signal
  htfBias: text("htf_bias"),         // 'bullish' | 'bearish' | 'neutral'
  source: text("source").default("ai"), // 'ai' | 'rules' | 'tradingview'
  knowledgeIds: text("knowledge_ids").array(), // lessons injected into the prompt — credited/blamed on outcome
  tdciScore: integer("tdci_score"),           // 0–100 confluence at signal time
  tdciDirection: text("tdci_direction"),      // LONG | SHORT | NEUTRAL
  tdciLayers: jsonb("tdci_layers"),           // per-layer values and explanations
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("ai_signals_user_status_idx").on(t.userId, t.status)]);

export const insertAiSignalSchema = createInsertSchema(aiSignals).omit({
  id: true,
  createdAt: true,
  executedAt: true,
});
export type InsertAiSignal = z.infer<typeof insertAiSignalSchema>;
export type AiSignal = typeof aiSignals.$inferSelect;

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  brokerType: text("broker_type").default("demo"),
  // Broker credentials
  mql5Account: text("mql5_account"),
  mql5Password: text("mql5_password"),
  brokerServer: text("broker_server"),
  brokerApiKey: text("broker_api_key"),
  brokerAccountId: text("broker_account_id"),
  // Connection status
  brokerConnected: boolean("broker_connected").default(false),
  brokerConnectedAt: timestamp("broker_connected_at"),
  brokerBalance: real("broker_balance").default(10000),
  // TradingView
  tradingViewUser: text("tradingview_user"),
  webhookToken: text("webhook_token").unique(), // random secret for /api/webhook/tradingview
  tradingviewConnected: boolean("tradingview_connected").default(false),
  tradingviewConnectedAt: timestamp("tradingview_connected_at"),
  // AI Providers
  selectedAiProvider: text("selected_ai_provider").default("none"),
  openaiApiKey: text("openai_api_key"),
  openaiConnected: boolean("openai_connected").default(false),
  openaiConnectedAt: timestamp("openai_connected_at"),
  anthropicApiKey: text("anthropic_api_key"),
  anthropicConnected: boolean("anthropic_connected").default(false),
  anthropicConnectedAt: timestamp("anthropic_connected_at"),
  geminiApiKey: text("gemini_api_key"),
  geminiConnected: boolean("gemini_connected").default(false),
  geminiConnectedAt: timestamp("gemini_connected_at"),
  groqApiKey: text("groq_api_key"),
  groqConnected: boolean("groq_connected").default(false),
  groqConnectedAt: timestamp("groq_connected_at"),
  perplexityApiKey: text("perplexity_api_key"),
  perplexityConnected: boolean("perplexity_connected").default(false),
  perplexityConnectedAt: timestamp("perplexity_connected_at"),
  xaiApiKey: text("xai_api_key"),
  xaiConnected: boolean("xai_connected").default(false),
  xaiConnectedAt: timestamp("xai_connected_at"),
  // Preferences
  notifications: boolean("notifications").notNull().default(true),
  autoTrade: boolean("auto_trade").notNull().default(false),
  riskMode: text("risk_mode").default("moderate"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  theme: text("theme").default("dark"),
  emailAddress: text("email_address"),
  emailNotifications: boolean("email_notifications").default(false),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  // Trading instruments & hours
  tradingInstruments: text("trading_instruments").array(),
  tradingTimezone: text("trading_timezone").default("UTC"),
  activeSessions: text("active_sessions").array(),
  offHoursBehavior: text("off_hours_behavior").default("pause"),
  offHoursRiskReduction: integer("off_hours_risk_reduction").default(50),
  tdciMinScore: integer("tdci_min_score").default(60), // auto-trade only at or above this TDCI
  labTier: text("lab_tier").notNull().default("free"),         // free | pro (Strategy Lab limits)
  labCreditsUsed: integer("lab_credits_used").notNull().default(0),
  labCreditsMonth: text("lab_credits_month"),                  // YYYY-MM the credit count belongs to
  contributeExecutionData: boolean("contribute_execution_data").notNull().default(true), // Mirror (Phase 2)
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;

export const priceAlerts = pgTable("price_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  targetPrice: real("target_price").notNull(),
  label: text("label"),
  triggered: boolean("triggered").notNull().default(false),
  triggeredAt: timestamp("triggered_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPriceAlertSchema = createInsertSchema(priceAlerts).omit({
  id: true,
  triggered: true,
  triggeredAt: true,
  createdAt: true,
});
export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;
export type PriceAlert = typeof priceAlerts.$inferSelect;

export const watchlist = pgTable("watchlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  symbol: text("symbol").notNull(),
  addedAt: timestamp("added_at").defaultNow(),
});
export const insertWatchlistSchema = createInsertSchema(watchlist).omit({ id: true, addedAt: true });
export type InsertWatchlistItem = z.infer<typeof insertWatchlistSchema>;
export type WatchlistItem = typeof watchlist.$inferSelect;

export const tradeJournal = pgTable("trade_journal", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  lots: real("lots").notNull().default(0.1),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  profitLoss: real("profit_loss"),
  pips: real("pips"),
  notes: text("notes"),
  emotion: text("emotion"),
  outcome: text("outcome"),
  mode: text("mode").notNull().default("paper"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});
export const insertTradeJournalSchema = createInsertSchema(tradeJournal).omit({ id: true, openedAt: true });
export type InsertTradeJournal = z.infer<typeof insertTradeJournalSchema>;
export type TradeJournal = typeof tradeJournal.$inferSelect;

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  data: text("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const strategyMarketplace = pgTable("strategy_marketplace", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorId: varchar("author_id").notNull(),
  authorName: text("author_name").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("forex"),
  style: text("style").notNull().default("swing"),
  riskPercent: real("risk_percent").notNull().default(2.0),
  winRate: real("win_rate"),
  totalReturn: real("total_return"),
  maxDrawdown: real("max_drawdown"),
  copyCount: integer("copy_count").notNull().default(0),
  upvotes: integer("upvotes").notNull().default(0),
  isPublic: boolean("is_public").notNull().default(true),
  strategyData: text("strategy_data"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertMarketplaceSchema = createInsertSchema(strategyMarketplace).omit({ id: true, createdAt: true, copyCount: true, upvotes: true });
export type InsertMarketplace = z.infer<typeof insertMarketplaceSchema>;
export type MarketplaceStrategy = typeof strategyMarketplace.$inferSelect;

export const marketplaceVotes = pgTable("marketplace_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marketplaceId: varchar("marketplace_id").notNull(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── AI Knowledge Base ────────────────────────────────────────────────────────
// Each row is a "lesson" — either seeded expert knowledge or learned from real trades
export const aiKnowledge = pgTable("ai_knowledge", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // null = shared seed lesson; set = learned from this user's trades
  category: text("category").notNull(), // 'entry_pattern' | 'risk_rule' | 'pair_behavior' | 'psychology' | 'learned'
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull().default("expert"), // 'expert' | 'trade_review' | 'backtest'
  confidence: integer("confidence").notNull().default(80), // 0-100
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  pairs: text("pairs").array(), // which pairs this lesson applies to, null = all
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertAiKnowledgeSchema = createInsertSchema(aiKnowledge).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiKnowledge = z.infer<typeof insertAiKnowledgeSchema>;
export type AiKnowledge = typeof aiKnowledge.$inferSelect;

// ─── Trade Reviews (AI post-trade analysis) ───────────────────────────────────
export const tradeReviews = pgTable("trade_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  positionId: varchar("position_id").notNull().unique(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(), // 'long' | 'short'
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price").notNull(),
  profit: real("profit").notNull(),
  pips: real("pips"),
  grade: text("grade").notNull().default("C"), // 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  gradeScore: integer("grade_score").notNull().default(70), // 0-100
  review: text("review").notNull(), // AI narrative
  strengths: text("strengths").array(), // what the trader did right
  improvements: text("improvements").array(), // what to improve
  mistakeType: text("mistake_type"), // 'early_exit' | 'oversize' | 'no_sl' | 'revenge' | null (no mistake)
  lessonLearned: text("lesson_learned"), // extracted lesson for knowledge base
  aiProvider: text("ai_provider"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertTradeReviewSchema = createInsertSchema(tradeReviews).omit({ id: true, createdAt: true });
export type InsertTradeReview = z.infer<typeof insertTradeReviewSchema>;
export type TradeReview = typeof tradeReviews.$inferSelect;

// ─── Push Subscriptions ───────────────────────────────────────────────────────
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// ─── Subscriptions ────────────────────────────────────────────────────────────
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan").notNull().default("free"),       // 'free' | 'pro' | 'enterprise'
  status: text("status").notNull().default("active"), // 'active' | 'cancelled' | 'past_due' | 'trialing'
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// ─── Risk Limits (per-user) ───────────────────────────────────────────────────
export const riskLimits = pgTable("risk_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  dailyLossLimit: real("daily_loss_limit").default(500),      // $ max loss per day
  maxDrawdownLimit: real("max_drawdown_limit").default(2000), // $ max drawdown from peak
  maxOpenPositions: integer("max_open_positions").default(5),
  maxPositionSize: real("max_position_size").default(1.0),    // lots
  trailingStopEnabled: boolean("trailing_stop_enabled").default(false),
  trailingStopPips: real("trailing_stop_pips").default(20),
  weeklyReportEnabled: boolean("weekly_report_enabled").default(false),
  tradingPaused: boolean("trading_paused").default(false),
  pauseReason: text("pause_reason"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── TDCI calibrations ────────────────────────────────────────────────────────
// Result of backtesting the Trade Depot Confluence Index on one symbol/timeframe:
// learned layer weights (fit in-sample) and out-of-sample performance by score.
export const tdciCalibrations = pgTable("tdci_calibrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  interval: text("interval").notNull(),
  weights: jsonb("weights").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("tdci_calibrations_symbol_interval_idx").on(t.symbol, t.interval, t.createdAt)]);
export type TdciCalibration = typeof tdciCalibrations.$inferSelect;

// ─── Market data cache (shared by all users) ──────────────────────────────────
// Every candle the app has fetched, so the same history is never requested
// twice. `time` keeps Twelve Data's UTC string ("YYYY-MM-DD HH:MM:SS", or
// "YYYY-MM-DD" for daily+) so cached bars are byte-identical to fetched ones.
export const candleCache = pgTable("candle_cache", {
  symbol: text("symbol").notNull(),
  interval: text("interval").notNull(),
  time: text("time").notNull(),
  open: doublePrecision("open").notNull(),
  high: doublePrecision("high").notNull(),
  low: doublePrecision("low").notNull(),
  close: doublePrecision("close").notNull(),
  volume: doublePrecision("volume"),
}, (t) => [primaryKey({ columns: [t.symbol, t.interval, t.time] })]);

// One row per external market-data request; drives the cross-process rate limit.
export const externalCalls = pgTable("external_calls", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  provider: text("provider").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("external_calls_provider_at_idx").on(t.provider, t.at)]);

// Daily totals for the Admin page: requests made and cache effectiveness.
export const apiUsage = pgTable("api_usage", {
  day: date("day").notNull(),
  provider: text("provider").notNull(),
  calls: integer("calls").notNull().default(0),
  cachedBars: bigint("cached_bars", { mode: "number" }).notNull().default(0),
  fetchedBars: bigint("fetched_bars", { mode: "number" }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.provider] })]);

// ─── Strategy Lab (Phase 1) ───────────────────────────────────────────────────
// JSON columns are validated with the zod schemas in shared/lab-schemas.ts.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** Shared, precomputed layer matrices per (symbol, style, data version, TDCI version). */
export const envCache = pgTable("env_cache", {
  symbol: text("symbol").notNull(),
  style: text("style").notNull(),
  dataVersion: text("data_version").notNull(),
  tdciVersion: integer("tdci_version").notNull(),
  payload: bytea("payload").notNull(),
  builtAt: timestamp("built_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.symbol, t.style, t.dataVersion, t.tdciVersion] })]);

export const blueprints = pgTable("blueprints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  prompt: text("prompt"),
  spec: jsonb("spec").notNull(),
  specVersion: integer("spec_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("blueprints_user_idx").on(t.userId, t.createdAt)]);

export const labRuns = pgTable("lab_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  blueprintId: varchar("blueprint_id").notNull(),
  style: text("style").notNull(),
  symbols: jsonb("symbols").notNull(),
  config: jsonb("config").notNull(),
  seed: integer("seed").notNull(),
  status: text("status").notNull().default("queued"), // queued | running | done | failed | cancelled
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  progress: jsonb("progress"),
  result: jsonb("result"),
  trials: integer("trials").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
}, (t) => [index("lab_runs_user_idx").on(t.userId, t.createdAt), index("lab_runs_status_idx").on(t.status)]);

/** One row per examined (run, champion). Its existence is the "vault opened" record (invariant 2). */
export const vaultOpenings = pgTable("vault_openings", {
  runId: varchar("run_id").notNull(),
  genomeHash: text("genome_hash").notNull(),
  vaultHash: text("vault_hash").notNull(),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.runId, t.genomeHash] })]);

export const strategyLicenses = pgTable("strategy_licenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  runId: varchar("run_id"),
  kind: text("kind").notNull().default("lab"),    // lab | ai_signals
  name: text("name").notNull(),
  style: text("style").notNull(),
  symbols: jsonb("symbols").notNull(),             // shadow/live symbols (up to 3 best vault pairs)
  genome: jsonb("genome").notNull(),
  genomeHash: text("genome_hash").notNull(),
  layers: jsonb("layers").notNull(),               // layer keys, in genome weight order
  grade: text("grade").notNull(),                  // licensed | probation | scrapped
  stage: text("stage").notNull(),                  // vault | shadow | live | retired
  vault: jsonb("vault"),                           // immutable Vault Exam report
  evidence: jsonb("evidence"),                     // latest Shadow / Tripwire evidence
  vaultHash: text("vault_hash"),
  incumbentId: varchar("incumbent_id"),
  shadowStartedAt: timestamp("shadow_started_at"),
  liveSince: timestamp("live_since"),
  publicSlug: text("public_slug"),                 // License Page (opt-in); null = not shared
  publicName: text("public_name"),                 // optional display name shown on the page (otherwise anonymous)
  publicSince: timestamp("public_since"),
  storm: jsonb("storm"),                           // Storm Mode verdict (pass/fail only; never affects the grade)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("strategy_licenses_user_idx").on(t.userId, t.stage),
  uniqueIndex("strategy_licenses_run_genome_uq").on(t.runId, t.genomeHash),
  uniqueIndex("strategy_licenses_public_slug_uq").on(t.publicSlug),
]);

/** Immutable audit log of every grade/stage change. */
export const licenseEvents = pgTable("license_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  licenseId: varchar("license_id").notNull(),
  fromGrade: text("from_grade"), fromStage: text("from_stage"),
  toGrade: text("to_grade").notNull(), toStage: text("to_stage").notNull(),
  reason: text("reason").notNull(),
  data: jsonb("data"),
  at: timestamp("at").notNull().defaultNow(),
}, (t) => [index("license_events_license_idx").on(t.licenseId, t.at)]);

/** Shadow Run decisions, written at decision time (append-only; exits filled in when they happen). */
export const shadowTrades = pgTable("shadow_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  licenseId: varchar("license_id").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side"),                     // LONG | SHORT | null when the candidate stayed flat
  signalTime: text("signal_time").notNull(),
  score: integer("score"),
  entry: doublePrecision("entry"), sl: doublePrecision("sl"), tp: doublePrecision("tp"),
  exit: doublePrecision("exit"), exitTime: text("exit_time"),
  r: doublePrecision("r"),
  status: text("status").notNull(),      // pending | open | closed | flat
  incumbentAction: text("incumbent_action").notNull(), // LONG | SHORT | FLAT
  incumbentR: doublePrecision("incumbent_r"),
  attribution: jsonb("attribution"),
  decidedAt: timestamp("decided_at").notNull().defaultNow(),
}, (t) => [
  index("shadow_trades_license_idx").on(t.licenseId, t.signalTime),
  uniqueIndex("shadow_trades_decision_uq").on(t.licenseId, t.symbol, t.signalTime),
]);

// ─── Mirror (Phase 2): execution digital twin ─────────────────────────────────

/** One row per real order fill (open or close). Written fire-and-forget; never blocks an order. */
export const executionFills = pgTable("execution_fills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  positionId: varchar("position_id"),
  kind: text("kind").notNull(),                 // open | close
  broker: text("broker").notNull(),             // demo | oanda | mt5
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),                 // BUY | SELL (the order's side)
  quoteBid: doublePrecision("quote_bid"),
  quoteAsk: doublePrecision("quote_ask"),
  requestedAt: timestamp("requested_at").notNull(),
  filledAt: timestamp("filled_at").notNull(),
  fillPrice: doublePrecision("fill_price"),
  latencyMs: integer("latency_ms"),
  newsWithinMin: integer("news_within_min"),    // minutes to the nearest high-impact event if within 30, else null
  contribute: boolean("contribute").notNull().default(true), // user's Mirror opt-in at the time
}, (t) => [index("execution_fills_model_idx").on(t.broker, t.symbol, t.filledAt)]);

/** Fitted cost distributions per (broker, symbol, 4-hour UTC bucket, news flag), pooled and anonymized. */
export const mirrorModels = pgTable("mirror_models", {
  broker: text("broker").notNull(),
  symbol: text("symbol").notNull(),
  hourBucket: integer("hour_bucket").notNull(),  // 0..5 → 00–04, 04–08, … UTC
  news: boolean("news").notNull(),
  n: integer("n").notNull(),
  spread: jsonb("spread").notNull(),             // { p10, p50, p90, p99 } in pips, shrunk toward the prior
  slippage: jsonb("slippage").notNull(),         // same, signed against the trader
  fittedAt: timestamp("fitted_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.broker, t.symbol, t.hourBucket, t.news] })]);

// ─── Forge (Phase 3): layers invented as DSL programs ─────────────────────────
/** Every layer program ever tested (accepted or not): the MAP-Elites archive and the layerTrials count. */
export const forgeLayers = pgTable("forge_layers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorType: text("author_type").notNull(),     // forge | user (Layer Kit submission)
  authorId: varchar("author_id"),                // user who ran the Forge job or submitted it
  style: text("style").notNull(),                // layers are judged per TDCI style (timeframe)
  dsl: jsonb("dsl").notNull(),                   // validated JSON AST
  text: text("text").notNull(),                  // printed form, for dedupe and display
  niche: text("niche").notNull(),                // family:timeframe
  status: text("status").notNull(),              // accepted | rejected
  score: doublePrecision("score").notNull(),
  stats: jsonb("stats").notNull(),               // acceptance result
  novelty: doublePrecision("novelty"),           // 1 − max |ρ| with existing layers
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("forge_layers_style_idx").on(t.style, t.status), uniqueIndex("forge_layers_style_text_uq").on(t.style, t.text)]);

// ─── Playbook (Phase 3): Licensed strategies as reusable skills (per user) ────
export const playbookSkills = pgTable("playbook_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  licenseId: varchar("license_id").notNull(),
  name: text("name").notNull(),
  style: text("style").notNull(),
  layers: jsonb("layers").notNull(),             // layer keys in weight order (skills only seed runs with the same layers)
  genome: jsonb("genome").notNull(),
  regimeTags: jsonb("regime_tags").notNull(),    // regimes where its Vault result was positive
  stats: jsonb("stats").notNull(),
  provenance: jsonb("provenance").notNull(),     // run, vault hash, dates
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("playbook_skills_user_idx").on(t.userId, t.style), uniqueIndex("playbook_skills_license_uq").on(t.licenseId)]);

// ─── Hive (Phase 3): per-bar probability predictions of Licensed strategies ───
export const hivePredictions = pgTable("hive_predictions", {
  licenseId: varchar("license_id").notNull(),
  symbol: text("symbol").notNull(),
  style: text("style").notNull(),
  barTime: text("bar_time").notNull(),
  p: doublePrecision("p").notNull(),             // P(close in icHorizon bars > close now), from its Vault calibration
  horizon: integer("horizon").notNull(),
  up: boolean("up"),                             // filled when the horizon has passed
  logScore: doublePrecision("log_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.licenseId, t.symbol, t.barTime] }), index("hive_predictions_symbol_idx").on(t.symbol, t.barTime)]);
