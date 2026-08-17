CREATE TABLE "list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"list" text NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"being_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_being_id_beings_id_fk" FOREIGN KEY ("being_id") REFERENCES "public"."beings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_items_household_list_idx" ON "list_items" USING btree ("household_id","list");