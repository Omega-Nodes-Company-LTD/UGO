-- ADR-112: il gioco in corso.
--
-- Un gioco è fatto di turni, e fra un turno e l'altro qualcosa deve ricordare
-- cosa è stato pensato e cosa non è ancora stato detto. Quel qualcosa NON può
-- essere la cronaca della conversazione: lì il segreto sarebbe leggibile
-- insieme al resto e finirebbe nel prompt al turno dopo — cioè verrebbe
-- consegnato al modello che dovrebbe custodirlo.
CREATE TABLE IF NOT EXISTS "games" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "gosino_id" uuid NOT NULL REFERENCES "gosini"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'numero' NOT NULL,
  "secret" text NOT NULL,
  "turns" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "games_gosino_idx" ON "games" ("gosino_id");--> statement-breakpoint

-- Una partita aperta per esemplare, e non una di più: un gosino non tiene due
-- numeri in mente insieme, e due righe aperte sarebbero due segreti in lite.
CREATE UNIQUE INDEX IF NOT EXISTS "games_one_open_per_gosino"
  ON "games" ("gosino_id") WHERE "ended_at" IS NULL;--> statement-breakpoint

DO $$
BEGIN
  EXECUTE 'ALTER TABLE games ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS games_own ON games';
  EXECUTE 'CREATE POLICY games_own ON games FOR ALL'
    ' USING (account_id = ugo_current_account())'
    ' WITH CHECK (account_id = ugo_current_account())';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ugo_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON games TO ugo_app';
  END IF;
END $$;
