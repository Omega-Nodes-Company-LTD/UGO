CREATE TABLE "placed_props" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"room_slug" text NOT NULL,
	"kind" text NOT NULL,
	"x" real NOT NULL,
	"z" real NOT NULL,
	"rot" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placed_props_kind" CHECK ("placed_props"."kind" in ('cushion','grass','bush','ball','trough')),
	CONSTRAINT "placed_props_x_range" CHECK ("placed_props"."x" between -1 and 1),
	CONSTRAINT "placed_props_z_range" CHECK ("placed_props"."z" between -1 and 1),
	CONSTRAINT "placed_props_rot_range" CHECK ("placed_props"."rot" between -3.15 and 3.15)
);
--> statement-breakpoint
CREATE TABLE "prop_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"remaining" integer NOT NULL,
	"refill_per_week" integer DEFAULT 0 NOT NULL,
	"refilled_at" timestamp with time zone,
	CONSTRAINT "prop_stock_household_kind_uq" UNIQUE("household_id","kind"),
	CONSTRAINT "prop_stock_kind" CHECK ("prop_stock"."kind" in ('cushion','grass','bush','ball','trough')),
	CONSTRAINT "prop_stock_remaining_positive" CHECK ("prop_stock"."remaining" >= 0),
	CONSTRAINT "prop_stock_refill_positive" CHECK ("prop_stock"."refill_per_week" >= 0)
);
--> statement-breakpoint
ALTER TABLE "placed_props" ADD CONSTRAINT "placed_props_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_stock" ADD CONSTRAINT "prop_stock_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "placed_props_household_room_idx" ON "placed_props" USING btree ("household_id","room_slug");