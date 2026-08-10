ALTER TABLE "budget_ledger" ADD COLUMN "tokens_cache_write" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD COLUMN "tokens_cache_read" integer DEFAULT 0 NOT NULL;