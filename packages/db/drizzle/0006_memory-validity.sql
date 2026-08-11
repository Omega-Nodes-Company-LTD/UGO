ALTER TABLE "memories" ADD COLUMN "valid_from" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "invalidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "invalidated_reason" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "superseded_by" uuid;--> statement-breakpoint
CREATE INDEX "memories_alive_idx" ON "memories" USING btree ("gosino_id","invalidated_at");--> statement-breakpoint
-- Custom step: the column defaults to now(), which for a memory learned last
-- month would be a lie. A fact held from the day it was written down.
UPDATE "memories" SET "valid_from" = "created_at" WHERE "valid_from" > "created_at";
