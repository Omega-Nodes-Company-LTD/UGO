-- ADR-084. Il tipo a mano: drizzle-kit non emette `CREATE TYPE` per un enum
-- nuovo (stessa trappola di `gosino_origin`, `desire_kind`, `feeding_kind`).
CREATE TYPE "public"."adoption_status" AS ENUM('prenotata', 'pagata', 'consegnata', 'annullata');--> statement-breakpoint
CREATE TABLE "adoptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid NOT NULL,
	"kennel_household_id" uuid NOT NULL,
	"buyer_household_id" uuid NOT NULL,
	"status" "adoption_status" DEFAULT 'prenotata' NOT NULL,
	"price_cents" integer,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"payment_ref" text,
	"chain_seq" integer,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "gosini" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "adoptions" ADD CONSTRAINT "adoptions_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoptions" ADD CONSTRAINT "adoptions_kennel_household_id_households_id_fk" FOREIGN KEY ("kennel_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoptions" ADD CONSTRAINT "adoptions_buyer_household_id_households_id_fk" FOREIGN KEY ("buyer_household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adoptions_kennel_idx" ON "adoptions" USING btree ("kennel_household_id");--> statement-breakpoint
CREATE INDEX "adoptions_buyer_idx" ON "adoptions" USING btree ("buyer_household_id");--> statement-breakpoint
CREATE INDEX "adoptions_gosino_idx" ON "adoptions" USING btree ("gosino_id");