-- ADR-084, il muro sulle adozioni. SCRITTA A MANO come la `0031` e la `0034`:
-- drizzle-kit non modella ruoli, GRANT né politiche.
--
-- `adoptions` è l'unica tabella del progetto che appartiene a DUE case, e la
-- politica lo dice invece di nasconderlo: la vedono l'allevamento che cede e
-- la famiglia che riceve, e nessun altro. Una compravendita non è un segreto
-- fra chi vende e sé stesso.
--
-- UPDATE resta concesso — a differenza di `births` — perché un'adozione **ha
-- degli stati**: prenotata, pagata, consegnata, annullata. Non è un atto, è
-- una pratica. DELETE no: una pratica che sparisce è una pratica che non è mai
-- esistita, e qui c'è di mezzo del denaro.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE adoptions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS adoptions_parties ON adoptions';
  EXECUTE 'CREATE POLICY adoptions_parties ON adoptions'
    ' USING (kennel_household_id = ugo_current_household()'
    '        OR buyer_household_id = ugo_current_household())'
    ' WITH CHECK (kennel_household_id = ugo_current_household()'
    '             OR buyer_household_id = ugo_current_household())';
END
$$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON adoptions TO ugo_app;--> statement-breakpoint
REVOKE DELETE ON adoptions FROM ugo_app;
