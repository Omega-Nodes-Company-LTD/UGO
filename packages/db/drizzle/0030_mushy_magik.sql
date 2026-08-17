CREATE TABLE "births" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"child_gosino_id" uuid NOT NULL,
	"parent_gosino_id" uuid NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"born_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "births" ADD CONSTRAINT "births_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "births" ADD CONSTRAINT "births_child_gosino_id_gosini_id_fk" FOREIGN KEY ("child_gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "births" ADD CONSTRAINT "births_parent_gosino_id_gosini_id_fk" FOREIGN KEY ("parent_gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "births" ADD CONSTRAINT "births_household_child_fk" FOREIGN KEY ("household_id","child_gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "births" ADD CONSTRAINT "births_household_parent_fk" FOREIGN KEY ("household_id","parent_gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "births_household_idx" ON "births" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "births_child_idx" ON "births" USING btree ("child_gosino_id");--> statement-breakpoint
CREATE INDEX "births_parent_idx" ON "births" USING btree ("parent_gosino_id");