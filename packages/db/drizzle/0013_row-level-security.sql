-- ADR-048, tempo 1. SCRITTA A MANO: drizzle-kit non modella ruoli, GRANT né
-- politiche, e non ha nulla da generare qui.
--
-- Cosa fa e cosa NON fa. Nasce il ruolo applicativo, nascono le politiche, e
-- da qui in poi il confine fra case e' un vincolo del database. Ma i `DEFAULT`
-- su `gosino_id` e `household_id` **restano**, e `DATABASE_URL` continua a
-- puntare al proprietario delle tabelle — al quale le politiche non si
-- applicano (ADR-019 §75). In produzione, quindi, dopo questa migrazione non
-- cambia niente: RLS e' presente e inerte.
--
-- E' voluto. Il primo deploy e' gia' avvenuto e le migrazioni non girano piu'
-- su un database vuoto: se una rotta fosse rimasta senza scope, accendere tutto
-- insieme lo farebbe scoprire alla produzione, e una scrittura che prima
-- finiva silenziosamente nella casa prime comincerebbe a fallire davanti a una
-- persona. I test invece si collegano come `ugo_app` e dimostrano che il muro
-- c'e'. Il tempo 2 — caduta dei DEFAULT e DATABASE_URL_APP in servizio — e' un
-- commit separato e un passo di runbook separato.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ugo_app') THEN
    -- NOLOGIN: la password la da' il runbook, mai il repository. Nessuna
    -- ownership e nessun BYPASSRLS, che sono i due modi di rendere inutile
    -- tutto il resto di questo file.
    CREATE ROLE ugo_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO ugo_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ugo_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ugo_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ugo_app;--> statement-breakpoint

-- Nessun `FORCE ROW LEVEL SECURITY`, ed e' la riga che rende vero tutto quel
-- che c'e' scritto sopra: senza FORCE le politiche **non** si applicano al
-- proprietario delle tabelle. `DATABASE_URL` e' ancora sua, quindi in
-- produzione, oggi, non cambia niente — mentre `ugo_app`, che proprietario non
-- e', ci sbatte contro. Il tempo 2 sposta il runtime su `ugo_app` e da li' il
-- muro c'e' davvero. Aggiungere FORCE adesso significherebbe accendere tutto
-- insieme, che e' esattamente cio' che il rollout in due tempi evita.

-- La casa corrente della transazione. `true` come secondo argomento significa
-- "non sollevare se non e' impostata": una connessione che non ha ancora detto
-- di che casa parla deve vedere **zero righe**, non ricevere un errore che
-- qualcuno potrebbe avere voglia di catturare.
CREATE OR REPLACE FUNCTION ugo_current_household() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.household_id', true), '')::uuid $$;--> statement-breakpoint

-- Le tabelle che portano la casa sulla riga: confronto diretto.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'beings', 'bonds', 'relations', 'gosini', 'rooms', 'budget_ledger',
    'trait_sets', 'recognition_profiles', 'memory_beings', 'transcript_segments'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_household', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (household_id = ugo_current_household())'
      ' WITH CHECK (household_id = ugo_current_household())',
      t || '_household', t
    );
  END LOOP;
END
$$;--> statement-breakpoint

-- Le tabelle dell'esemplare (ADR-019: i ricordi e l'umore sono della creatura).
-- La sottoquery non e' correlata, quindi Postgres la valuta una volta per
-- statement e la usa come insieme hashato — non una volta per riga.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'memories', 'messages', 'events', 'meetings', 'diary_entries', 'desires',
    'psyche_snapshots', 'psyche_baselines', 'corrections', 'perception_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_household', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I'
      ' USING (gosino_id IN (SELECT id FROM gosini WHERE household_id = ugo_current_household()))'
      ' WITH CHECK (gosino_id IN (SELECT id FROM gosini WHERE household_id = ugo_current_household()))',
      t || '_household', t
    );
  END LOOP;
END
$$;--> statement-breakpoint

-- `households` in lettura resta aperta al ruolo applicativo, e va spiegato
-- perche' non e' una svista: e' la tabella che **stabilisce** di che casa si
-- parla — `householdOf()` verifica che la casa esista e non sia chiusa, e
-- `soleHousehold()` conta quante ce ne sono — e quelle domande si fanno prima
-- che `app.household_id` esista. Una politica restrittiva qui farebbe
-- rispondere 404 a ogni richiesta.
-- Cio' che ci si legge sono slug, nome, fuso, lingua, tetto di spesa e la DEK
-- **avvolta** sotto la KEK. Non e' un'esposizione nuova: un processo solo che
-- serve piu' case ha comunque la KEK in ambiente (ADR-017, ADR-019 §90).
-- In scrittura invece una casa tocca solo se stessa.
ALTER TABLE "households" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "households_self" ON "households";--> statement-breakpoint
DROP POLICY IF EXISTS "households_read" ON "households";--> statement-breakpoint
CREATE POLICY "households_read" ON "households" FOR SELECT USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "households_update" ON "households";--> statement-breakpoint
CREATE POLICY "households_update" ON "households" FOR UPDATE
  USING (id = ugo_current_household())
  WITH CHECK (id = ugo_current_household());--> statement-breakpoint

-- `access_tokens` e' l'eccezione, e va detta: risolvere un token e' cio' che
-- STABILISCE di che casa si parla, quindi non puo' gia' saperlo. Il ruolo
-- applicativo puo' leggerla per intero — cio' che ci trova sono SHA-256, mai
-- un token — e scrive solo su una casa che gia' conosce.
ALTER TABLE "access_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "access_tokens_read" ON "access_tokens";--> statement-breakpoint
CREATE POLICY "access_tokens_read" ON "access_tokens" FOR SELECT USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "access_tokens_write" ON "access_tokens";--> statement-breakpoint
CREATE POLICY "access_tokens_write" ON "access_tokens" FOR UPDATE USING (true) WITH CHECK (true);--> statement-breakpoint
DROP POLICY IF EXISTS "access_tokens_insert" ON "access_tokens";--> statement-breakpoint
CREATE POLICY "access_tokens_insert" ON "access_tokens" FOR INSERT
  WITH CHECK (household_id IS NULL OR household_id = ugo_current_household());
