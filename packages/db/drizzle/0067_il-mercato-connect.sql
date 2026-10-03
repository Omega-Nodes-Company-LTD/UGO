CREATE TABLE "breeder_payout_accounts" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"stripe_account_id" text NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"requirements_due" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "breeder_payout_accounts_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
CREATE TABLE "listing_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid NOT NULL,
	"kennel_account_id" uuid NOT NULL,
	"reporter_account_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'aperta' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "listing_reports_reason" CHECK ("listing_reports"."reason" in ('maltrattamento', 'ingannevole', 'prezzo', 'altro')),
	CONSTRAINT "listing_reports_status" CHECK ("listing_reports"."status" in ('aperta', 'sospeso', 'archiviata')),
	CONSTRAINT "listing_reports_note" CHECK ("listing_reports"."note" is null or length("listing_reports"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "breeder_payout_accounts" ADD CONSTRAINT "breeder_payout_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_kennel_account_id_accounts_id_fk" FOREIGN KEY ("kennel_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_reporter_account_id_accounts_id_fk" FOREIGN KEY ("reporter_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_reports_status_idx" ON "listing_reports" USING btree ("status","created_at");