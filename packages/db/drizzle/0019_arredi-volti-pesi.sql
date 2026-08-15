CREATE TABLE "act_efficacy" (
	"gosino_id" uuid NOT NULL,
	"act" text NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "act_efficacy_gosino_id_act_pk" PRIMARY KEY("gosino_id","act"),
	CONSTRAINT "act_efficacy_range" CHECK ("act_efficacy"."weight" between 0.6 and 1.4)
);
--> statement-breakpoint
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
CREATE TABLE "unknown_prints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"modality" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"payload" "bytea" NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "act_efficacy" ADD CONSTRAINT "act_efficacy_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placed_props" ADD CONSTRAINT "placed_props_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_stock" ADD CONSTRAINT "prop_stock_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unknown_prints" ADD CONSTRAINT "unknown_prints_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "placed_props_household_room_idx" ON "placed_props" USING btree ("household_id","room_slug");--> statement-breakpoint
CREATE INDEX "unknown_prints_household_idx" ON "unknown_prints" USING btree ("household_id","last_seen_at");