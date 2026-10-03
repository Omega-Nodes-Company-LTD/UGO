ALTER TYPE "public"."message_channel" ADD VALUE 'piazza';--> statement-breakpoint
CREATE TABLE "plaza_blocks" (
	"account_id" uuid NOT NULL,
	"blocked_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plaza_blocks_account_id_blocked_account_id_pk" PRIMARY KEY("account_id","blocked_account_id")
);
--> statement-breakpoint
CREATE TABLE "plaza_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_gosino_id" uuid NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_gosino_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"from_name" text NOT NULL,
	"to_name" text NOT NULL,
	"status" text DEFAULT 'attesa' NOT NULL,
	"turns_done" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "plaza_invites_status" CHECK ("plaza_invites"."status" in ('attesa', 'accettato', 'rifiutato', 'scaduto', 'concluso', 'interrotto'))
);
--> statement-breakpoint
CREATE TABLE "plaza_presence" (
	"handle" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"generation" integer NOT NULL,
	"mood" text NOT NULL,
	"look" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plaza_presence_gosino_id_unique" UNIQUE("gosino_id")
);
--> statement-breakpoint
ALTER TABLE "plaza_blocks" ADD CONSTRAINT "plaza_blocks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaza_blocks" ADD CONSTRAINT "plaza_blocks_blocked_account_id_accounts_id_fk" FOREIGN KEY ("blocked_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaza_invites" ADD CONSTRAINT "plaza_invites_from_gosino_id_gosini_id_fk" FOREIGN KEY ("from_gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaza_invites" ADD CONSTRAINT "plaza_invites_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaza_invites" ADD CONSTRAINT "plaza_invites_to_gosino_id_gosini_id_fk" FOREIGN KEY ("to_gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaza_invites" ADD CONSTRAINT "plaza_invites_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaza_presence" ADD CONSTRAINT "plaza_presence_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaza_presence" ADD CONSTRAINT "plaza_presence_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plaza_invites_from_idx" ON "plaza_invites" USING btree ("from_account_id","created_at");--> statement-breakpoint
CREATE INDEX "plaza_invites_to_idx" ON "plaza_invites" USING btree ("to_account_id","created_at");--> statement-breakpoint
CREATE INDEX "plaza_presence_expires_idx" ON "plaza_presence" USING btree ("expires_at");