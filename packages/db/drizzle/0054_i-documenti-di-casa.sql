-- ADR-111: i documenti di casa. La macchina è quella dei clienti (ADR-054),
-- il perimetro è la famiglia.
--
-- Due tabelle e non una: il documento è la cosa che si carica e si butta, il
-- frammento è la cosa che si cerca. E NON si allarga `customer_chunks`, dove
-- lo scope è `customer_id` e la reception ci legge sopra: un referto del
-- veterinario in quella tabella starebbe a un `where` di distanza dall'occhio
-- di un cliente.
CREATE TABLE IF NOT EXISTS "house_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "s3_key" text NOT NULL,
  "filename" text NOT NULL,
  "mime" text NOT NULL,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "indexed_at" timestamp with time zone,
  "status" "customer_source_status" DEFAULT 'pending' NOT NULL,
  "last_error" text
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "house_documents_account_idx" ON "house_documents" ("account_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "house_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "document_id" uuid NOT NULL REFERENCES "house_documents"("id") ON DELETE CASCADE,
  "ref" text NOT NULL,
  "text" text NOT NULL,
  "embedding" vector(768) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "house_chunks_document_idx" ON "house_chunks" ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "house_chunks_embedding_hnsw_idx"
  ON "house_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint

-- Il muro (ADR-048): una casa vede i suoi documenti e nient'altro. Scritto a
-- mano come le altre politiche, perché drizzle-kit non modella né GRANT né RLS.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE house_documents ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS house_documents_own ON house_documents';
  EXECUTE 'CREATE POLICY house_documents_own ON house_documents FOR ALL'
    ' USING (account_id = ugo_current_account())'
    ' WITH CHECK (account_id = ugo_current_account())';

  EXECUTE 'ALTER TABLE house_chunks ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS house_chunks_own ON house_chunks';
  EXECUTE 'CREATE POLICY house_chunks_own ON house_chunks FOR ALL'
    ' USING (account_id = ugo_current_account())'
    ' WITH CHECK (account_id = ugo_current_account())';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ugo_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON house_documents TO ugo_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON house_chunks TO ugo_app';
  END IF;
END $$;
