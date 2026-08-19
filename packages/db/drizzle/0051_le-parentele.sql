CREATE TABLE "household_ties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_household_id" uuid NOT NULL,
	"to_household_id" uuid NOT NULL,
	"label" text NOT NULL,
	"from_being_id" uuid,
	"to_being_id" uuid,
	"status" text DEFAULT 'proposta' NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "household_ties_status" CHECK ("household_ties"."status" in ('proposta', 'accettata', 'revocata')),
	CONSTRAINT "household_ties_no_self" CHECK ("household_ties"."from_household_id" <> "household_ties"."to_household_id")
);
--> statement-breakpoint
CREATE TABLE "parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tie_id" uuid NOT NULL,
	"from_household_id" uuid NOT NULL,
	"to_household_id" uuid NOT NULL,
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
ALTER TABLE "household_ties" ADD CONSTRAINT "household_ties_from_household_id_households_id_fk" FOREIGN KEY ("from_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_ties" ADD CONSTRAINT "household_ties_to_household_id_households_id_fk" FOREIGN KEY ("to_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_ties" ADD CONSTRAINT "household_ties_from_being_fk" FOREIGN KEY ("from_household_id","from_being_id") REFERENCES "public"."beings"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_ties" ADD CONSTRAINT "household_ties_to_being_fk" FOREIGN KEY ("to_household_id","to_being_id") REFERENCES "public"."beings"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_tie_id_household_ties_id_fk" FOREIGN KEY ("tie_id") REFERENCES "public"."household_ties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_from_household_id_households_id_fk" FOREIGN KEY ("from_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_to_household_id_households_id_fk" FOREIGN KEY ("to_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_from_gosino_fk" FOREIGN KEY ("from_household_id","from_gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_to_gosino_fk" FOREIGN KEY ("to_household_id","to_gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_ties_from_idx" ON "household_ties" USING btree ("from_household_id");--> statement-breakpoint
CREATE INDEX "household_ties_to_idx" ON "household_ties" USING btree ("to_household_id");--> statement-breakpoint
CREATE INDEX "parcels_from_idx" ON "parcels" USING btree ("from_household_id");--> statement-breakpoint
CREATE INDEX "parcels_to_idx" ON "parcels" USING btree ("to_household_id");--> statement-breakpoint
CREATE INDEX "parcels_tie_idx" ON "parcels" USING btree ("tie_id");