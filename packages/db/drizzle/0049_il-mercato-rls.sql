-- ADR-097 — il mercato sotto RLS. SCRITTA A MANO come la 0013 e la 0047:
-- drizzle-kit non modella ruoli, GRANT né politiche.
--
-- Nasce `ugo_market`: NON un bypass di RLS, un ruolo NOLOGIN che una
-- transazione assume con `SET LOCAL ROLE` (solo dentro `withMarket`) e perde
-- al commit. Le politiche qui sotto sono l'inventario leggibile di cosa il
-- mercato È: sfogliare la vetrina, leggere una genealogia, prenotare,
-- consegnare, fondare. Tutto il resto — clienti, trascrizioni, impronte,
-- audit — resta fuori dalla sua portata per costruzione.
--
-- Le politiche esistenti (senza TO) valgono per PUBLIC e restano: quelle
-- permissive si OR-ano, quindi il ruolo di mercato passa dalle sue e ogni
-- altro ruolo continua a passare SOLO dalle proprie.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ugo_market') THEN
    CREATE ROLE ugo_market NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
-- chi può assumerlo: l'applicazione, e l'owner che oggi la impersona.
-- WITH INHERIT FALSE è metà del disegno: senza, ugo_app EREDITEREBBE le
-- politiche del mercato in ogni query — cioè vedrebbe la vetrina di tutti
-- senza mai dichiarare l'atto. Così invece il ruolo si può solo ASSUMERE
-- (SET ROLE dentro withMarket), mai portare addosso per sbaglio.
GRANT ugo_market TO ugo_app WITH INHERIT FALSE, SET TRUE;--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT ugo_market TO %I WITH INHERIT FALSE, SET TRUE', current_user);
END
$$;--> statement-breakpoint

-- ============ leggere ciò che è in vetrina (e mostrarla) ============
GRANT SELECT ON accounts, gosini, trait_sets, births, adoptions, customer_gosini TO ugo_market;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','gosini','trait_sets','births','adoptions','customer_gosini'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_market_read ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_market_read ON %I FOR SELECT TO ugo_market USING (true)', t, t);
  END LOOP;
END
$$;--> statement-breakpoint

-- ============ l'adozione: prenotare, confermare, scadere ============
GRANT INSERT, UPDATE ON adoptions TO ugo_market;--> statement-breakpoint
DROP POLICY IF EXISTS adoptions_market_write ON adoptions;--> statement-breakpoint
CREATE POLICY adoptions_market_write ON adoptions FOR INSERT TO ugo_market WITH CHECK (true);--> statement-breakpoint
DROP POLICY IF EXISTS adoptions_market_update ON adoptions;--> statement-breakpoint
CREATE POLICY adoptions_market_update ON adoptions FOR UPDATE TO ugo_market USING (true) WITH CHECK (true);--> statement-breakpoint

-- ============ la cessione: la creatura e ciò che è suo cambiano casa ============
GRANT UPDATE ON gosini, trait_sets, births, feedings TO ugo_market;--> statement-breakpoint
GRANT SELECT ON feedings TO ugo_market;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gosini','trait_sets','births','feedings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_market_update ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_market_update ON %I FOR UPDATE TO ugo_market USING (true) WITH CHECK (true)', t, t);
  END LOOP;
  EXECUTE 'DROP POLICY IF EXISTS feedings_market_read ON feedings';
  EXECUTE 'CREATE POLICY feedings_market_read ON feedings FOR SELECT TO ugo_market USING (true)';
END
$$;--> statement-breakpoint
-- la vita che resta in allevamento si conta e si cancella (SELECT serve al
-- RETURNING con cui la si conta: vederla è parte dell'atto, non un di più)
GRANT SELECT, DELETE ON memories, messages, diary_entries, desires, events, checkins, bonds TO ugo_market;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['memories','messages','diary_entries','desires','events','checkins','bonds'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_market_wipe ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_market_wipe ON %I FOR DELETE TO ugo_market USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_market_see ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_market_see ON %I FOR SELECT TO ugo_market USING (true)', t, t);
  END LOOP;
END
$$;--> statement-breakpoint

-- ============ fondare: una casa nuova, il suo capostipite, il suo token ============
GRANT INSERT ON accounts, gosini, trait_sets, access_tokens TO ugo_market;--> statement-breakpoint
GRANT UPDATE ON accounts TO ugo_market;--> statement-breakpoint
GRANT SELECT ON access_tokens TO ugo_market;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','gosini','trait_sets','access_tokens'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_market_found ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_market_found ON %I FOR INSERT TO ugo_market WITH CHECK (true)', t, t);
  END LOOP;
  EXECUTE 'DROP POLICY IF EXISTS accounts_market_update ON accounts';
  EXECUTE 'CREATE POLICY accounts_market_update ON accounts FOR UPDATE TO ugo_market USING (true) WITH CHECK (true)';
  EXECUTE 'DROP POLICY IF EXISTS access_tokens_market_read ON access_tokens';
  EXECUTE 'CREATE POLICY access_tokens_market_read ON access_tokens FOR SELECT TO ugo_market USING (true)';
END
$$;
