CREATE TABLE "execution_fills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"position_id" varchar,
	"kind" text NOT NULL,
	"broker" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"quote_bid" double precision,
	"quote_ask" double precision,
	"requested_at" timestamp NOT NULL,
	"filled_at" timestamp NOT NULL,
	"fill_price" double precision,
	"latency_ms" integer,
	"news_within_min" integer,
	"contribute" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mirror_models" (
	"broker" text NOT NULL,
	"symbol" text NOT NULL,
	"hour_bucket" integer NOT NULL,
	"news" boolean NOT NULL,
	"n" integer NOT NULL,
	"spread" jsonb NOT NULL,
	"slippage" jsonb NOT NULL,
	"fitted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mirror_models_broker_symbol_hour_bucket_news_pk" PRIMARY KEY("broker","symbol","hour_bucket","news")
);
--> statement-breakpoint
CREATE INDEX "execution_fills_model_idx" ON "execution_fills" USING btree ("broker","symbol","filled_at");