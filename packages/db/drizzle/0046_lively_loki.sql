CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid NOT NULL,
	"question" text NOT NULL,
	"hour" integer NOT NULL,
	"minute" integer DEFAULT 0 NOT NULL,
	"weekday" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_asked_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;