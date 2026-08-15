CREATE TABLE "unknown_prints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"modality" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"payload" "bytea" NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "unknown_prints" ADD CONSTRAINT "unknown_prints_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unknown_prints_household_idx" ON "unknown_prints" USING btree ("household_id","last_seen_at");