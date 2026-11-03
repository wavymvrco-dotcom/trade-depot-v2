CREATE TABLE "ai_knowledge" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'expert' NOT NULL,
	"confidence" integer DEFAULT 80 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"pairs" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_signals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"action" text NOT NULL,
	"confidence" integer NOT NULL,
	"reasoning" text NOT NULL,
	"entry_price" real,
	"stop_loss" real,
	"take_profit" real,
	"size" real DEFAULT 0.1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"outcome" text,
	"outcome_price" real,
	"outcome_at" timestamp,
	"ai_provider" text,
	"htf_bias" text,
	"source" text DEFAULT 'ai',
	"knowledge_ids" text[],
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketplace_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"data" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"type" text NOT NULL,
	"size" real NOT NULL,
	"entry_price" real NOT NULL,
	"current_price" real,
	"stop_loss" real,
	"take_profit" real,
	"profit" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"ai_signal" boolean DEFAULT false NOT NULL,
	"broker_trade_id" text,
	"signal_id" varchar
);
--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"target_price" real NOT NULL,
	"label" text,
	"triggered" boolean DEFAULT false NOT NULL,
	"triggered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "risk_limits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"daily_loss_limit" real DEFAULT 500,
	"max_drawdown_limit" real DEFAULT 2000,
	"max_open_positions" integer DEFAULT 5,
	"max_position_size" real DEFAULT 1,
	"trailing_stop_enabled" boolean DEFAULT false,
	"trailing_stop_pips" real DEFAULT 20,
	"weekly_report_enabled" boolean DEFAULT false,
	"trading_paused" boolean DEFAULT false,
	"pause_reason" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "risk_limits_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"goal" text NOT NULL,
	"style" text NOT NULL,
	"description" text,
	"risk_percent" real DEFAULT 2 NOT NULL,
	"max_positions" integer DEFAULT 3 NOT NULL,
	"rr_ratio" real DEFAULT 2.5 NOT NULL,
	"account_size" real DEFAULT 10000,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategy_marketplace" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" varchar NOT NULL,
	"author_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'forex' NOT NULL,
	"style" text DEFAULT 'swing' NOT NULL,
	"risk_percent" real DEFAULT 2 NOT NULL,
	"win_rate" real,
	"total_return" real,
	"max_drawdown" real,
	"copy_count" integer DEFAULT 0 NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"strategy_data" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "trade_journal" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"entry_price" real NOT NULL,
	"exit_price" real,
	"lots" real DEFAULT 0.1 NOT NULL,
	"stop_loss" real,
	"take_profit" real,
	"profit_loss" real,
	"pips" real,
	"notes" text,
	"emotion" text,
	"outcome" text,
	"mode" text DEFAULT 'paper' NOT NULL,
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "trade_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"position_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"entry_price" real NOT NULL,
	"exit_price" real NOT NULL,
	"profit" real NOT NULL,
	"pips" real,
	"grade" text DEFAULT 'C' NOT NULL,
	"grade_score" integer DEFAULT 70 NOT NULL,
	"review" text NOT NULL,
	"strengths" text[],
	"improvements" text[],
	"mistake_type" text,
	"lesson_learned" text,
	"ai_provider" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "trade_reviews_position_id_unique" UNIQUE("position_id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"broker_type" text DEFAULT 'demo',
	"mql5_account" text,
	"mql5_password" text,
	"broker_server" text,
	"broker_api_key" text,
	"broker_account_id" text,
	"broker_connected" boolean DEFAULT false,
	"broker_connected_at" timestamp,
	"broker_balance" real DEFAULT 10000,
	"tradingview_user" text,
	"webhook_token" text,
	"tradingview_connected" boolean DEFAULT false,
	"tradingview_connected_at" timestamp,
	"selected_ai_provider" text DEFAULT 'none',
	"openai_api_key" text,
	"openai_connected" boolean DEFAULT false,
	"openai_connected_at" timestamp,
	"anthropic_api_key" text,
	"anthropic_connected" boolean DEFAULT false,
	"anthropic_connected_at" timestamp,
	"gemini_api_key" text,
	"gemini_connected" boolean DEFAULT false,
	"gemini_connected_at" timestamp,
	"groq_api_key" text,
	"groq_connected" boolean DEFAULT false,
	"groq_connected_at" timestamp,
	"perplexity_api_key" text,
	"perplexity_connected" boolean DEFAULT false,
	"perplexity_connected_at" timestamp,
	"xai_api_key" text,
	"xai_connected" boolean DEFAULT false,
	"xai_connected_at" timestamp,
	"notifications" boolean DEFAULT true NOT NULL,
	"auto_trade" boolean DEFAULT false NOT NULL,
	"risk_mode" text DEFAULT 'moderate',
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"theme" text DEFAULT 'dark',
	"email_address" text,
	"email_notifications" boolean DEFAULT false,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_user" text,
	"smtp_pass" text,
	"trading_instruments" text[],
	"trading_timezone" text DEFAULT 'UTC',
	"active_sessions" text[],
	"off_hours_behavior" text DEFAULT 'pause',
	"off_hours_risk_reduction" integer DEFAULT 50,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_settings_webhook_token_unique" UNIQUE("webhook_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verification_token" text,
	"password_reset_token" text,
	"password_reset_expires" timestamp,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "ai_signals_user_status_idx" ON "ai_signals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "positions_user_status_idx" ON "positions" USING btree ("user_id","status");