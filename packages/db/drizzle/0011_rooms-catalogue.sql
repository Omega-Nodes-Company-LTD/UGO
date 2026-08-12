CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid DEFAULT '00000000-0000-4000-8000-000000000002' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_household_slug_uq" UNIQUE("household_id","slug")
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rooms_household_idx" ON "rooms" USING btree ("household_id");--> statement-breakpoint
-- Backfill (ADR-039): every room that already existed as a label becomes a real
-- room, so nothing that was valid before this migration is invalid after it.
-- Written by hand because drizzle-kit generates schema, not data — and without
-- it the first move after deploying would be rejected against an empty
-- catalogue for a room the owner has been using for weeks.
INSERT INTO "rooms" ("household_id", "name", "slug")
SELECT DISTINCT ON (g."household_id", lower(btrim(g."location_label")))
       g."household_id", btrim(g."location_label"), lower(btrim(g."location_label"))
FROM "gosini" g
WHERE g."location_label" IS NOT NULL AND btrim(g."location_label") <> ''
ON CONFLICT ("household_id", "slug") DO NOTHING;
