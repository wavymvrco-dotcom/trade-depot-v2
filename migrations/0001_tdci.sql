CREATE TABLE "tdci_calibrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"interval" text NOT NULL,
	"weights" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ai_signals" ADD COLUMN "tdci_score" integer;--> statement-breakpoint
ALTER TABLE "ai_signals" ADD COLUMN "tdci_direction" text;--> statement-breakpoint
ALTER TABLE "ai_signals" ADD COLUMN "tdci_layers" jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "tdci_min_score" integer DEFAULT 60;--> statement-breakpoint
CREATE INDEX "tdci_calibrations_symbol_interval_idx" ON "tdci_calibrations" USING btree ("symbol","interval","created_at");