-- ADR-060, il muro fra le case sui feed. SCRITTA A MANO, come la `0013`, la
-- `0020` e la `0022`: drizzle-kit non modella ruoli, GRANT né politiche.
--
-- Senza questo file `rss_feeds` e `feed_items` nascono fuori dal muro: il
-- contenuto è pubblico per definizione (sono feed RSS), ma QUALI feed segue
-- una casa è un fatto della casa — dice a cosa lavora lo studio — e la lista
-- del vicino non sono affari di nessuno.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rss_feeds', 'feed_items']
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
GRANT SELECT, INSERT, UPDATE, DELETE ON rss_feeds TO ugo_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON feed_items TO ugo_app;
