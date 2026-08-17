-- ADR-072. Il `CREATE TYPE` è AGGIUNTO A MANO: drizzle-kit non lo genera per
-- un enum nuovo su uno schema già esistente (la trappola già pagata due volte,
-- cfr. il commento su `households.kind`). Senza questa riga la migrazione
-- fallisce su un database vergine, che è precisamente dove gira la CI.
CREATE TYPE "public"."feeding_kind" AS ENUM('affetto', 'lavoro');--> statement-breakpoint
CREATE TABLE "feedings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"gosino_id" uuid NOT NULL,
	"kind" "feeding_kind" NOT NULL,
	"amount_usd" numeric(10, 6) NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "metabolism" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feedings" ADD CONSTRAINT "feedings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedings" ADD CONSTRAINT "feedings_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedings" ADD CONSTRAINT "feedings_household_gosino_fk" FOREIGN KEY ("household_id","gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedings_gosino_idx" ON "feedings" USING btree ("gosino_id");--> statement-breakpoint
CREATE INDEX "feedings_household_idx" ON "feedings" USING btree ("household_id");