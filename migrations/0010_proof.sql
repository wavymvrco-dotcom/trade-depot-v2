CREATE TABLE "proof_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"day" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_roots" (
	"day" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"root" text NOT NULL,
	"file" text NOT NULL,
	"ots" text,
	"anchored_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "proof_entries_subject_seq_uq" ON "proof_entries" USING btree ("subject","seq");--> statement-breakpoint
CREATE INDEX "proof_entries_day_idx" ON "proof_entries" USING btree ("day","id");--> statement-breakpoint
CREATE UNIQUE INDEX "proof_entries_hash_uq" ON "proof_entries" USING btree ("hash");--> statement-breakpoint
CREATE FUNCTION proof_entries_append_only() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'proof_entries is append-only'; END; $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER proof_entries_no_change BEFORE UPDATE OR DELETE ON "proof_entries" FOR EACH ROW EXECUTE FUNCTION proof_entries_append_only();
