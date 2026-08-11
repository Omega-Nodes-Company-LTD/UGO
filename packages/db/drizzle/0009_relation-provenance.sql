-- Custom step: drizzle-kit 0.31.10 renders the ALTER TABLE but omits the
-- CREATE TYPE for a brand-new enum, so the migration fails on a real database
-- with `type "relation_source" does not exist`. Same family of trap as the
-- composite-foreign-key ordering documented in ADR-019: if this file is ever
-- regenerated, this line has to be put back.
CREATE TYPE "public"."relation_source" AS ENUM('owner', 'dream');--> statement-breakpoint
ALTER TABLE "relations" ADD COLUMN "source" "relation_source" DEFAULT 'owner' NOT NULL;
