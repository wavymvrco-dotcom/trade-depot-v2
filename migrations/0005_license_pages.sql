ALTER TABLE "strategy_licenses" ADD COLUMN "public_slug" text;--> statement-breakpoint
ALTER TABLE "strategy_licenses" ADD COLUMN "public_name" text;--> statement-breakpoint
ALTER TABLE "strategy_licenses" ADD COLUMN "public_since" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_licenses_public_slug_uq" ON "strategy_licenses" USING btree ("public_slug");