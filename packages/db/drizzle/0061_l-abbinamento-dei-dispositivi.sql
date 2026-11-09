-- ADR-127: l'abbinamento dei dispositivi e il link per entrare con l'email.
-- Generata da drizzle-kit e RIDOTTA alle sole tabelle nuove: lo snapshot era
-- rimasto indietro rispetto alle migrazioni 0057-0060 scritte a mano, e la
-- generazione ripeteva oggetti che esistono già (verificato su un database
-- migrato da zero). Lo snapshot 0061 è quello giusto: riallinea drizzle allo
-- schema reale, e la prossima generazione parte pulita.
CREATE TABLE "login_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_by_token_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairing_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "login_links" ADD CONSTRAINT "login_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_token_id_access_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."access_tokens"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "login_links_account_idx" ON "login_links" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "pairing_codes_account_idx" ON "pairing_codes" USING btree ("account_id");
