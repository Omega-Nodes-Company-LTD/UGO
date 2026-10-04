CREATE TABLE "watch_finds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watch_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"gosino_id" uuid NOT NULL,
	"url_hash" text NOT NULL,
	"title_enc" text NOT NULL,
	"link_enc" text NOT NULL,
	"line_enc" text,
	"verdict" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_finds_once" UNIQUE("watch_id","url_hash"),
	CONSTRAINT "watch_finds_verdict" CHECK ("watch_finds"."verdict" in ('proposto', 'scartato'))
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"gosino_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_enc" text NOT NULL,
	"queries_enc" text NOT NULL,
	"embedding" vector(768),
	"source" text DEFAULT 'conversazione' NOT NULL,
	"status" text DEFAULT 'attivo' NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"last_searched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "watches_kind" CHECK ("watches"."kind" in ('curiosita', 'progetto', 'preoccupazione')),
	CONSTRAINT "watches_status" CHECK ("watches"."status" in ('attivo', 'chiuso')),
	CONSTRAINT "watches_source" CHECK ("watches"."source" in ('conversazione', 'pannello'))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "watch_web" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "desires" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "watch_finds" ADD CONSTRAINT "watch_finds_watch_id_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_finds" ADD CONSTRAINT "watch_finds_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_finds" ADD CONSTRAINT "watch_finds_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watch_finds_day_idx" ON "watch_finds" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "watches_open_idx" ON "watches" USING btree ("account_id","status","until");