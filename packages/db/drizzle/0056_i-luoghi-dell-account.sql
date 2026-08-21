-- ADR-113: i luoghi dell'account.
--
-- ADR-092 ha separato il titolare dalla casa. Restava una sola riga di
-- coordinate sull'account, quindi una sola geografia: chi ha la casa in città
-- e quella al mare aveva un cielo solo, e per forza sbagliato in una delle
-- due. Il tempo che fa è del LUOGO, non del titolare.
CREATE TABLE IF NOT EXISTS "places" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "lat" numeric(8, 5),
  "lon" numeric(8, 5),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "places_account_idx" ON "places" ("account_id");--> statement-breakpoint
ALTER TABLE "places" DROP CONSTRAINT IF EXISTS "places_account_slug_uq";--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_account_slug_uq" UNIQUE ("account_id", "slug");--> statement-breakpoint

ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "place_id" uuid REFERENCES "places"("id") ON DELETE SET NULL;--> statement-breakpoint

-- Il traghetto, e non è facoltativo: ogni account esistente aveva un posto, e
-- deve ritrovarselo come primo luogo — con le sue stanze già dentro. Il nome
-- lo prende da `accounts.place` se c'era; se non c'era, «Casa»: un luogo senza
-- nome sarebbe una riga che nessuno riconosce nel pannello.
INSERT INTO "places" ("account_id", "name", "slug", "lat", "lon")
SELECT a.id,
       COALESCE(NULLIF(btrim(a.place), ''), 'Casa'),
       lower(btrim(COALESCE(NULLIF(btrim(a.place), ''), 'Casa'))),
       a.lat,
       a.lon
FROM "accounts" a
WHERE NOT EXISTS (SELECT 1 FROM "places" p WHERE p.account_id = a.id);--> statement-breakpoint

UPDATE "rooms" r
SET "place_id" = p.id
FROM "places" p
WHERE p.account_id = r.account_id AND r."place_id" IS NULL;--> statement-breakpoint

-- Via le colonne vecchie. Tenerle «per compatibilità» creerebbe due verità
-- sulla stessa cosa, che è il difetto che ADR-092 è servita a togliere.
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "lat";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "lon";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "place";--> statement-breakpoint

DO $$
BEGIN
  EXECUTE 'ALTER TABLE places ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS places_own ON places';
  EXECUTE 'CREATE POLICY places_own ON places FOR ALL'
    ' USING (account_id = ugo_current_account())'
    ' WITH CHECK (account_id = ugo_current_account())';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ugo_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON places TO ugo_app';
  END IF;
END $$;
