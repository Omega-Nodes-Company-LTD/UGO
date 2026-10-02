-- ADR-122 / ADR-130 — le chiavi della casa, le scelte di modello, il credito.
--
-- Generata da drizzle-kit e POTATA a mano: lo snapshot precedente non
-- conosceva le tabelle nate da migrazioni scritte a mano (0053–0060: giochi,
-- luoghi, documenti di casa, la sorgente `peer`), e la generazione le
-- riproponeva. Qui resta solo il nuovo; lo snapshot 0061 invece descrive lo
-- schema intero, ed è ciò che riallinea ogni `db:generate` futuro.
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_micros" bigint NOT NULL,
	"ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_kind" CHECK ("credit_ledger"."kind" in ('topup', 'usage', 'refund', 'adjust')),
	CONSTRAINT "credit_ledger_sign" CHECK (("credit_ledger"."kind" = 'usage' and "credit_ledger"."amount_micros" <= 0)
        or ("credit_ledger"."kind" in ('topup', 'refund') and "credit_ledger"."amount_micros" >= 0)
        or "credit_ledger"."kind" = 'adjust')
);
--> statement-breakpoint
CREATE TABLE "model_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"role" text NOT NULL,
	"source" text DEFAULT 'byok' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"voice" text,
	"price_in_per_mtok" numeric(12, 6),
	"price_out_per_mtok" numeric(12, 6),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_choices_account_role" UNIQUE("account_id","role"),
	CONSTRAINT "model_choices_role" CHECK ("model_choices"."role" in ('chat', 'think', 'vision', 'judge', 'tts', 'stt')),
	CONSTRAINT "model_choices_source" CHECK ("model_choices"."source" in ('byok', 'ugo')),
	CONSTRAINT "model_choices_provider" CHECK ("model_choices"."provider" in ('anthropic', 'openrouter', 'openai', 'elevenlabs'))
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"secret_enc" text NOT NULL,
	"hint" text NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_credentials_account_provider" UNIQUE("account_id","provider"),
	CONSTRAINT "provider_credentials_provider" CHECK ("provider_credentials"."provider" in ('anthropic', 'openrouter', 'openai', 'elevenlabs')),
	CONSTRAINT "provider_credentials_status" CHECK ("provider_credentials"."status" in ('unverified', 'ok', 'invalid'))
);
--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD COLUMN "cost_source" text DEFAULT 'list' NOT NULL;
--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD COLUMN "key_source" text DEFAULT 'byok' NOT NULL;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "model_choices" ADD CONSTRAINT "model_choices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "credit_ledger_account_idx" ON "credit_ledger" USING btree ("account_id","created_at");
--> statement-breakpoint
CREATE INDEX "model_choices_account_idx" ON "model_choices" USING btree ("account_id");
--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD CONSTRAINT "budget_ledger_cost_source" CHECK ("budget_ledger"."cost_source" in ('provider', 'snapshot', 'list', 'fallback', 'local'));
--> statement-breakpoint
ALTER TABLE "budget_ledger" ADD CONSTRAINT "budget_ledger_key_source" CHECK ("budget_ledger"."key_source" in ('byok', 'ugo'));
