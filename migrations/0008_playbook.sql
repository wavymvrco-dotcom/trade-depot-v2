CREATE TABLE "playbook_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"license_id" varchar NOT NULL,
	"name" text NOT NULL,
	"style" text NOT NULL,
	"layers" jsonb NOT NULL,
	"genome" jsonb NOT NULL,
	"regime_tags" jsonb NOT NULL,
	"stats" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "playbook_skills_user_idx" ON "playbook_skills" USING btree ("user_id","style");--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_skills_license_uq" ON "playbook_skills" USING btree ("license_id");