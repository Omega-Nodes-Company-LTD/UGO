CREATE TYPE "public"."customer_source_status" AS ENUM('pending', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."customer_source_type" AS ENUM('repo', 'document', 'email');--> statement-breakpoint
CREATE TABLE "customer_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"source_type" "customer_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"s3_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"indexed_at" timestamp with time zone,
	"status" "customer_source_status" DEFAULT 'pending' NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "customer_mail_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"imap_host" text NOT NULL,
	"imap_port" integer DEFAULT 993 NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"folder" text DEFAULT 'INBOX' NOT NULL,
	"last_uid" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"status" "customer_source_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"remote_url" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"pat" text,
	"last_commit_sha" text,
	"last_indexed_at" timestamp with time zone,
	"status" "customer_source_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_chunks" ADD CONSTRAINT "customer_chunks_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_chunks" ADD CONSTRAINT "customer_chunks_household_customer_fk" FOREIGN KEY ("household_id","customer_id") REFERENCES "public"."customers"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_household_customer_fk" FOREIGN KEY ("household_id","customer_id") REFERENCES "public"."customers"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_mail_accounts" ADD CONSTRAINT "customer_mail_accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_mail_accounts" ADD CONSTRAINT "customer_mail_accounts_household_customer_fk" FOREIGN KEY ("household_id","customer_id") REFERENCES "public"."customers"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_repos" ADD CONSTRAINT "customer_repos_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_repos" ADD CONSTRAINT "customer_repos_household_customer_fk" FOREIGN KEY ("household_id","customer_id") REFERENCES "public"."customers"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_chunks_customer_idx" ON "customer_chunks" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_chunks_source_idx" ON "customer_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "customer_chunks_embedding_hnsw_idx" ON "customer_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "customer_documents_customer_idx" ON "customer_documents" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_mail_accounts_customer_idx" ON "customer_mail_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_repos_customer_idx" ON "customer_repos" USING btree ("customer_id");
-- ADR-054, la parte che drizzle-kit non sa modellare: politiche RLS.
-- Quattro tabelle tenant come le altre (vedi 0016): politica sulla riga,
-- privilegi DML ereditati dall'ALTER DEFAULT PRIVILEGES di `0013`.
ALTER TABLE customer_repos ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS customer_repos_household ON customer_repos;--> statement-breakpoint
CREATE POLICY customer_repos_household ON customer_repos
  USING (household_id = ugo_current_household());--> statement-breakpoint
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS customer_documents_household ON customer_documents;--> statement-breakpoint
CREATE POLICY customer_documents_household ON customer_documents
  USING (household_id = ugo_current_household());--> statement-breakpoint
ALTER TABLE customer_mail_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS customer_mail_accounts_household ON customer_mail_accounts;--> statement-breakpoint
CREATE POLICY customer_mail_accounts_household ON customer_mail_accounts
  USING (household_id = ugo_current_household());--> statement-breakpoint
ALTER TABLE customer_chunks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS customer_chunks_household ON customer_chunks;--> statement-breakpoint
CREATE POLICY customer_chunks_household ON customer_chunks
  USING (household_id = ugo_current_household());
