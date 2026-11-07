CREATE TABLE "hive_predictions" (
	"license_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"style" text NOT NULL,
	"bar_time" text NOT NULL,
	"p" double precision NOT NULL,
	"horizon" integer NOT NULL,
	"up" boolean,
	"log_score" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hive_predictions_license_id_symbol_bar_time_pk" PRIMARY KEY("license_id","symbol","bar_time")
);
--> statement-breakpoint
CREATE INDEX "hive_predictions_symbol_idx" ON "hive_predictions" USING btree ("symbol","bar_time");