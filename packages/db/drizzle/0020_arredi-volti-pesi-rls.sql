-- ADR-056, ADR-057, ADR-058. SCRITTA A MANO, come la `0013`: drizzle-kit non
-- modella ruoli, GRANT né politiche, e non ha nulla da generare qui.
--
-- Senza questo file le quattro tabelle della `0019` nascono **fuori dal muro fra
-- le case**. `ENABLE ROW LEVEL SECURITY` non è un default, e una tabella senza
-- politiche è una tabella che il ruolo applicativo legge tutta — e si comporta
-- **esattamente** come una tabella protetta finché non arriva la seconda
-- famiglia. È lo stesso gesto che la `0013` fa per nome su ogni tabella di
-- allora: ogni tabella nuova va aggiunta a mano, o resta scoperta per sempre.
--
-- `unknown_prints` pesa il doppio delle altre. Dentro ci sono **impronte
-- biometriche di persone che non hanno acconsentito** (ADR-057): una tabella
-- scoperta lì non significherebbe che il vicino vede il tuo cuscino,
-- significherebbe che il vicino ha il volto di chi è passato da casa tua.

-- Le tre che portano la casa sulla riga: confronto diretto.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['placed_props', 'prop_stock', 'unknown_prints']
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

-- `act_efficacy` porta `gosino_id` e non `household_id`, quindi ha la forma del
-- **secondo** blocco della `0013` — quello delle tabelle dell'esemplare: i pesi
-- sono di una creatura, come i suoi ricordi e il suo umore, e due gosini sotto
-- lo stesso tetto imparano cose diverse (ADR-058). La sottoquery non è
-- correlata: Postgres la valuta una volta per statement.
ALTER TABLE "act_efficacy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "act_efficacy_household" ON "act_efficacy";--> statement-breakpoint
CREATE POLICY "act_efficacy_household" ON "act_efficacy"
  USING (gosino_id IN (SELECT id FROM gosini WHERE household_id = ugo_current_household()))
  WITH CHECK (gosino_id IN (SELECT id FROM gosini WHERE household_id = ugo_current_household()));--> statement-breakpoint

-- I privilegi: il `GRANT ... ON ALL TABLES` della `0013` vale per le tabelle di
-- allora. Le `ALTER DEFAULT PRIVILEGES` della stessa migrazione coprono quelle
-- create dopo dallo stesso ruolo, ma dirlo a voce alta costa quattro righe e
-- vale un dubbio in meno il giorno che qualcuno migri con un utente diverso.
GRANT SELECT, INSERT, UPDATE, DELETE ON placed_props TO ugo_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON prop_stock TO ugo_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON unknown_prints TO ugo_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON act_efficacy TO ugo_app;
