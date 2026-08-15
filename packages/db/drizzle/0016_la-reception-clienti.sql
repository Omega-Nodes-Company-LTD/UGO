CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'waiting', 'closed');--> statement-breakpoint
ALTER TYPE "public"."message_channel" ADD VALUE 'ticket';--> statement-breakpoint
CREATE TABLE "customer_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "customer_access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "customer_gosini" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"gosino_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_gosini_pair_uq" UNIQUE("customer_id","gosino_id")
);
--> statement-breakpoint
CREATE TABLE "customer_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"gosino_id" uuid NOT NULL,
	"ticket_id" uuid,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"cached" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"notes" text,
	"daily_budget_usd" numeric(10, 4),
	"hourly_message_limit" integer,
	"knowledge_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "customers_household_slug_uq" UNIQUE("household_id","slug"),
	CONSTRAINT "customers_household_id_uq" UNIQUE("household_id","id")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"gosino_id" uuid NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "customer_access_tokens" ADD CONSTRAINT "customer_access_tokens_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_access_tokens" ADD CONSTRAINT "customer_access_tokens_household_customer_fk" FOREIGN KEY ("household_id","customer_id") REFERENCES "public"."customers"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_gosini" ADD CONSTRAINT "customer_gosini_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_gosini" ADD CONSTRAINT "customer_gosini_household_customer_fk" FOREIGN KEY ("household_id","customer_id") REFERENCES "public"."customers"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_gosini" ADD CONSTRAINT "customer_gosini_household_gosino_fk" FOREIGN KEY ("household_id","gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_messages" ADD CONSTRAINT "customer_messages_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_messages" ADD CONSTRAINT "customer_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_messages" ADD CONSTRAINT "customer_messages_household_customer_fk" FOREIGN KEY ("household_id","customer_id") REFERENCES "public"."customers"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_messages" ADD CONSTRAINT "customer_messages_household_gosino_fk" FOREIGN KEY ("household_id","gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_household_customer_fk" FOREIGN KEY ("household_id","customer_id") REFERENCES "public"."customers"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_household_gosino_fk" FOREIGN KEY ("household_id","gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_access_tokens_customer_idx" ON "customer_access_tokens" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_messages_customer_ts_idx" ON "customer_messages" USING btree ("customer_id","ts");--> statement-breakpoint
CREATE INDEX "customers_household_idx" ON "customers" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "tickets_customer_idx" ON "tickets" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");
-- ADR-051/052, la parte che drizzle-kit non sa modellare: politiche RLS.
--
-- Le cinque tabelle della reception sono tabelle tenant come le altre
-- (ADR-048): la politica legge la casa dalla riga, senza join. I privilegi
-- DML arrivano da soli dall'ALTER DEFAULT PRIVILEGES di `0013`; le politiche
-- no, e vanno dichiarate qui — una tabella con RLS acceso e nessuna politica
-- sarebbe muta per `ugo_app`, non isolata.
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS customers_household ON customers;--> statement-breakpoint
CREATE POLICY customers_household ON customers
  USING (household_id = ugo_current_household());--> statement-breakpoint
ALTER TABLE customer_gosini ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS customer_gosini_household ON customer_gosini;--> statement-breakpoint
CREATE POLICY customer_gosini_household ON customer_gosini
  USING (household_id = ugo_current_household());--> statement-breakpoint
ALTER TABLE customer_access_tokens ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS customer_access_tokens_household ON customer_access_tokens;--> statement-breakpoint
CREATE POLICY customer_access_tokens_household ON customer_access_tokens
  USING (household_id = ugo_current_household());--> statement-breakpoint
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tickets_household ON tickets;--> statement-breakpoint
CREATE POLICY tickets_household ON tickets
  USING (household_id = ugo_current_household());--> statement-breakpoint
ALTER TABLE customer_messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS customer_messages_household ON customer_messages;--> statement-breakpoint
CREATE POLICY customer_messages_household ON customer_messages
  USING (household_id = ugo_current_household());
