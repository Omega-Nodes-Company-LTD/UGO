-- ADR-128 — il gosino al telefono. Generata da drizzle-kit; in coda il muro
-- di casa scritto a mano come in 0055 (drizzle-kit non modella politiche né GRANT).
CREATE TABLE "phone_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"gosino_id" uuid NOT NULL,
	"call_ref" text NOT NULL,
	"customer_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_turn_at" timestamp with time zone DEFAULT now() NOT NULL,
	"turns" integer DEFAULT 0 NOT NULL,
	"handovers" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"outcome" text DEFAULT 'answered' NOT NULL,
	CONSTRAINT "phone_calls_account_ref_uq" UNIQUE("account_id","call_ref")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "contact_email_hash" text;--> statement-breakpoint
ALTER TABLE "phone_calls" ADD CONSTRAINT "phone_calls_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_calls" ADD CONSTRAINT "phone_calls_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_calls" ADD CONSTRAINT "phone_calls_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phone_calls_account_started_idx" ON "phone_calls" USING btree ("account_id","started_at");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_account_contact_uq" UNIQUE("account_id","contact_email_hash");--> statement-breakpoint

-- Il muro di casa, scritto a mano come in 0055: drizzle-kit non modella
-- politiche né GRANT. Le chiamate sono di UNA casa.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE phone_calls ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS phone_calls_account ON phone_calls';
  EXECUTE 'CREATE POLICY phone_calls_account ON phone_calls FOR ALL'
    ' USING (account_id = ugo_current_account())'
    ' WITH CHECK (account_id = ugo_current_account())';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ugo_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON phone_calls TO ugo_app';
  END IF;
END $$;
