CREATE TABLE "forge_layers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_type" text NOT NULL,
	"author_id" varchar,
	"style" text NOT NULL,
	"dsl" jsonb NOT NULL,
	"text" text NOT NULL,
	"niche" text NOT NULL,
	"status" text NOT NULL,
	"score" double precision NOT NULL,
	"stats" jsonb NOT NULL,
	"novelty" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "forge_layers_style_idx" ON "forge_layers" USING btree ("style","status");--> statement-breakpoint
CREATE UNIQUE INDEX "forge_layers_style_text_uq" ON "forge_layers" USING btree ("style","text");