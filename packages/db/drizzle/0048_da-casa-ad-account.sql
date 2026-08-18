-- ADR-092 — «casa» diventa «account». SCRITTA A MANO: drizzle-kit non rinomina
-- politiche, funzioni e vincoli, e un rename dedotto da lui sarebbe un DROP +
-- CREATE, cioè la tabella dei titolari buttata via.
--
-- La parola faceva tre lavori insieme: il titolare dei dati (che può essere una
-- famiglia, uno studio, un negozio o un allevamento), l'abitazione, e il
-- contenitore delle stanze. Da qui in poi «account» è il titolare e basta.
--
-- Scritta coi cataloghi invece che con un elenco di nomi: cinquanta nomi a mano
-- sono cinquanta occasioni di dimenticarne uno, e quello dimenticato non si
-- vede finché qualcuno non legge un vincolo che parla di una cosa che non
-- esiste più.

-- 1. la tabella
ALTER TABLE households RENAME TO accounts;--> statement-breakpoint

-- 2. le colonne, ovunque siano. Le politiche RLS seguono da sole: Postgres le
-- tiene come alberi, non come testo, quindi un rename di colonna le aggiorna.
--
-- `LIKE '%household%'` e non `= 'household_id'`, e la differenza l'ha trovata
-- un test: `adoptions` ha `kennel_household_id` e `buyer_household_id` — due
-- case sulla stessa riga, ADR-084 — e un confronto esatto le avrebbe lasciate
-- indietro mentre il codice le chiamava già col nome nuovo.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name LIKE '%household%'
  LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I',
                   r.table_name, r.column_name,
                   replace(r.column_name, 'household', 'account'));
  END LOOP;
END
$$;--> statement-breakpoint

-- 3. la funzione dello scope, e il nome dell'impostazione che legge.
-- Il rename tiene le politiche attaccate (la riferiscono per OID), il
-- CREATE OR REPLACE le cambia il corpo: il codice ora scrive `app.account_id`,
-- e finché questa leggeva `app.household_id` le politiche avrebbero risposto
-- «nessuna casa» a ogni richiesta — cioè RLS spenta in silenzio
ALTER FUNCTION ugo_current_household() RENAME TO ugo_current_account;--> statement-breakpoint
CREATE OR REPLACE FUNCTION ugo_current_account() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.account_id', true), '')::uuid $$;--> statement-breakpoint

-- 4. i nomi delle politiche
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE '%household%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I RENAME TO %I',
      r.policyname, r.schemaname, r.tablename,
      replace(r.policyname, 'household', 'account')
    );
  END LOOP;
END
$$;--> statement-breakpoint

-- 5. i vincoli (chiavi esterne, unici, check)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, t.relname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND c.conname LIKE '%household%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
      r.relname, r.conname, replace(r.conname, 'household', 'account')
    );
  END LOOP;
END
$$;--> statement-breakpoint

-- 6. gli indici che non sono già stati rinominati insieme al loro vincolo
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE '%household%'
  LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname,
                   replace(r.indexname, 'household', 'account'));
  END LOOP;
END
$$;
