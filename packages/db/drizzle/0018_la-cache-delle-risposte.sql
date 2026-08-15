CREATE TABLE "customer_answer_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"gosino_id" uuid NOT NULL,
	"question_hash" text NOT NULL,
	"question_text" text NOT NULL,
	"question_embedding" vector(768) NOT NULL,
	"answer_text" text NOT NULL,
	"knowledge_epoch" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customer_answer_cache_question_uq" UNIQUE("customer_id","gosino_id","question_hash")
);
--> statement-breakpoint
ALTER TABLE "customer_answer_cache" ADD CONSTRAINT "customer_answer_cache_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_answer_cache" ADD CONSTRAINT "customer_answer_cache_household_customer_fk" FOREIGN KEY ("household_id","customer_id") REFERENCES "public"."customers"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_answer_cache" ADD CONSTRAINT "customer_answer_cache_household_gosino_fk" FOREIGN KEY ("household_id","gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_answer_cache_customer_idx" ON "customer_answer_cache" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_answer_cache_embedding_hnsw_idx" ON "customer_answer_cache" USING hnsw ("question_embedding" vector_cosine_ops);
-- ADR-055, la parte che drizzle-kit non sa modellare: la politica RLS.
ALTER TABLE customer_answer_cache ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS customer_answer_cache_household ON customer_answer_cache;--> statement-breakpoint
CREATE POLICY customer_answer_cache_household ON customer_answer_cache
  USING (household_id = ugo_current_household());
