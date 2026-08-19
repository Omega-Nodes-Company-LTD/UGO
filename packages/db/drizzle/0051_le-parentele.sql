CREATE TABLE "account_ties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"label" text NOT NULL,
	"from_being_id" uuid,
	"to_being_id" uuid,
	"status" text DEFAULT 'proposta' NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "account_ties_status" CHECK ("account_ties"."status" in ('proposta', 'accettata', 'revocata')),
	CONSTRAINT "account_ties_no_self" CHECK ("account_ties"."from_account_id" <> "account_ties"."to_account_id")
);
--> statement-breakpoint
CREATE TABLE "parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tie_id" uuid NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"from_gosino_id" uuid NOT NULL,
	"to_gosino_id" uuid,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'inviata' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"kept_at" timestamp with time zone,
	CONSTRAINT "parcels_kind" CHECK ("parcels"."kind" in ('messaggio', 'ricordo')),
	CONSTRAINT "parcels_status" CHECK ("parcels"."status" in ('inviata', 'consegnata'))
);
--> statement-breakpoint
ALTER TABLE "account_ties" ADD CONSTRAINT "account_ties_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_ties" ADD CONSTRAINT "account_ties_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_ties" ADD CONSTRAINT "account_ties_from_being_fk" FOREIGN KEY ("from_account_id","from_being_id") REFERENCES "public"."beings"("account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_ties" ADD CONSTRAINT "account_ties_to_being_fk" FOREIGN KEY ("to_account_id","to_being_id") REFERENCES "public"."beings"("account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_tie_id_account_ties_id_fk" FOREIGN KEY ("tie_id") REFERENCES "public"."account_ties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_from_gosino_fk" FOREIGN KEY ("from_account_id","from_gosino_id") REFERENCES "public"."gosini"("account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_to_gosino_fk" FOREIGN KEY ("to_account_id","to_gosino_id") REFERENCES "public"."gosini"("account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_ties_from_idx" ON "account_ties" USING btree ("from_account_id");--> statement-breakpoint
CREATE INDEX "account_ties_to_idx" ON "account_ties" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "parcels_from_idx" ON "parcels" USING btree ("from_account_id");--> statement-breakpoint
CREATE INDEX "parcels_to_idx" ON "parcels" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "parcels_tie_idx" ON "parcels" USING btree ("tie_id");