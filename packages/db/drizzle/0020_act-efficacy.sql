CREATE TABLE "act_efficacy" (
	"gosino_id" uuid NOT NULL,
	"act" text NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "act_efficacy_gosino_id_act_pk" PRIMARY KEY("gosino_id","act"),
	CONSTRAINT "act_efficacy_range" CHECK ("act_efficacy"."weight" between 0.6 and 1.4)
);
--> statement-breakpoint
ALTER TABLE "act_efficacy" ADD CONSTRAINT "act_efficacy_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;