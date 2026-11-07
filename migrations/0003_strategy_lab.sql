CREATE TABLE "blueprints" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"prompt" text,
	"spec" jsonb NOT NULL,
	"spec_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "env_cache" (
	"symbol" text NOT NULL,
	"style" text NOT NULL,
	"data_version" text NOT NULL,
	"tdci_version" integer NOT NULL,
	"payload" "bytea" NOT NULL,
	"built_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "env_cache_symbol_style_data_version_tdci_version_pk" PRIMARY KEY("symbol","style","data_version","tdci_version")
);
--> statement-breakpoint
CREATE TABLE "lab_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"blueprint_id" varchar NOT NULL,
	"style" text NOT NULL,
	"symbols" jsonb NOT NULL,
	"config" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"progress" jsonb,
	"result" jsonb,
	"trials" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "license_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" varchar NOT NULL,
	"from_grade" text,
	"from_stage" text,
	"to_grade" text NOT NULL,
	"to_stage" text NOT NULL,
	"reason" text NOT NULL,
	"data" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shadow_trades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"side" text,
	"signal_time" text NOT NULL,
	"score" integer,
	"entry" double precision,
	"sl" double precision,
	"tp" double precision,
	"exit" double precision,
	"exit_time" text,
	"r" double precision,
	"status" text NOT NULL,
	"incumbent_action" text NOT NULL,
	"incumbent_r" double precision,
	"attribution" jsonb,
	"decided_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_licenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"run_id" varchar,
	"kind" text DEFAULT 'lab' NOT NULL,
	"name" text NOT NULL,
	"style" text NOT NULL,
	"symbols" jsonb NOT NULL,
	"genome" jsonb NOT NULL,
	"genome_hash" text NOT NULL,
	"layers" jsonb NOT NULL,
	"grade" text NOT NULL,
	"stage" text NOT NULL,
	"vault" jsonb,
	"evidence" jsonb,
	"vault_hash" text,
	"incumbent_id" varchar,
	"shadow_started_at" timestamp,
	"live_since" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_openings" (
	"run_id" varchar NOT NULL,
	"genome_hash" text NOT NULL,
	"vault_hash" text NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vault_openings_run_id_genome_hash_pk" PRIMARY KEY("run_id","genome_hash")
);
--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "license_id" varchar;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "risk_amount" real;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "lab_tier" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "lab_credits_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "lab_credits_month" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "contribute_execution_data" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "blueprints_user_idx" ON "blueprints" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "lab_runs_user_idx" ON "lab_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "lab_runs_status_idx" ON "lab_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "license_events_license_idx" ON "license_events" USING btree ("license_id","at");--> statement-breakpoint
CREATE INDEX "shadow_trades_license_idx" ON "shadow_trades" USING btree ("license_id","signal_time");--> statement-breakpoint
CREATE UNIQUE INDEX "shadow_trades_decision_uq" ON "shadow_trades" USING btree ("license_id","symbol","signal_time");--> statement-breakpoint
CREATE INDEX "strategy_licenses_user_idx" ON "strategy_licenses" USING btree ("user_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_licenses_run_genome_uq" ON "strategy_licenses" USING btree ("run_id","genome_hash");--> statement-breakpoint
CREATE INDEX "positions_license_idx" ON "positions" USING btree ("license_id");