CREATE TYPE "public"."access_role" AS ENUM('owner', 'member', 'operator');--> statement-breakpoint
CREATE TABLE "access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"token_hash" text NOT NULL,
	"role" "access_role" NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Rome' NOT NULL,
	"locale" text DEFAULT 'it-IT' NOT NULL,
	"daily_budget_usd" numeric(10, 4),
	"wrapped_data_key" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "households_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- Custom step: drizzle-kit generates schema, not data (see 0002).
-- ADR-019 — every tenant-scoped column defaults to this house, so it has to
-- exist before the NOT NULL DEFAULT columns land, or the FK would reject them.
-- The existing exemplar and its whole pack become the first family. Idempotent.
INSERT INTO "households" ("id", "slug", "name", "timezone", "locale")
VALUES ('00000000-0000-4000-8000-000000000002', 'casa-prime', 'casa', 'Europe/Rome', 'it-IT')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "bonds" DROP CONSTRAINT "bonds_gosino_id_gosini_id_fk";
--> statement-breakpoint
ALTER TABLE "bonds" DROP CONSTRAINT "bonds_being_id_beings_id_fk";
--> statement-breakpoint
ALTER TABLE "relations" DROP CONSTRAINT "relations_being_a_beings_id_fk";
--> statement-breakpoint
ALTER TABLE "relations" DROP CONSTRAINT "relations_being_b_beings_id_fk";
--> statement-breakpoint
DROP INDEX "budget_ledger_date_idx";--> statement-breakpoint
ALTER TABLE "beings" ADD COLUMN "household_id" uuid DEFAULT '00000000-0000-4000-8000-000000000002' NOT NULL;--> statement-breakpoint
ALTER TABLE "beings" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bonds" ADD COLUMN "household_id" uuid DEFAULT '00000000-0000-4000-8000-000000000002' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD COLUMN "household_id" uuid DEFAULT '00000000-0000-4000-8000-000000000002' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD COLUMN "gosino_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "gosini" ADD COLUMN "household_id" uuid DEFAULT '00000000-0000-4000-8000-000000000002' NOT NULL;--> statement-breakpoint
ALTER TABLE "relations" ADD COLUMN "household_id" uuid DEFAULT '00000000-0000-4000-8000-000000000002' NOT NULL;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_tokens_household_idx" ON "access_tokens" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "beings" ADD CONSTRAINT "beings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gosini" ADD CONSTRAINT "gosini_household_id_uq" UNIQUE("household_id","id");
--> statement-breakpoint
ALTER TABLE "beings" ADD CONSTRAINT "beings_household_id_uq" UNIQUE("household_id","id");
--> statement-breakpoint
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_being_same_household_fk" FOREIGN KEY ("household_id","being_id") REFERENCES "public"."beings"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_gosino_same_household_fk" FOREIGN KEY ("household_id","gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD CONSTRAINT "budget_ledger_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD CONSTRAINT "budget_ledger_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gosini" ADD CONSTRAINT "gosini_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_being_a_same_household_fk" FOREIGN KEY ("household_id","being_a") REFERENCES "public"."beings"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_being_b_same_household_fk" FOREIGN KEY ("household_id","being_b") REFERENCES "public"."beings"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beings_household_idx" ON "beings" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "beings_one_owner_per_household_uq" ON "beings" USING btree ("household_id") WHERE "beings"."is_owner";--> statement-breakpoint
CREATE INDEX "bonds_household_idx" ON "bonds" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "budget_ledger_household_date_idx" ON "budget_ledger" USING btree ("household_id","date");--> statement-breakpoint
CREATE INDEX "gosini_household_idx" ON "gosini" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "relations_household_idx" ON "relations" USING btree ("household_id");