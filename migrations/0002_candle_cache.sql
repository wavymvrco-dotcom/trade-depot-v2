CREATE TABLE "api_usage" (
	"day" date NOT NULL,
	"provider" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"cached_bars" bigint DEFAULT 0 NOT NULL,
	"fetched_bars" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_day_provider_pk" PRIMARY KEY("day","provider")
);
--> statement-breakpoint
CREATE TABLE "candle_cache" (
	"symbol" text NOT NULL,
	"interval" text NOT NULL,
	"time" text NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision,
	CONSTRAINT "candle_cache_symbol_interval_time_pk" PRIMARY KEY("symbol","interval","time")
);
--> statement-breakpoint
CREATE TABLE "external_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "external_calls_provider_at_idx" ON "external_calls" USING btree ("provider","at");