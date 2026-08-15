-- ADR-051. SCRITTA A MANO, come la `0013` e per la stessa ragione: drizzle-kit
-- non modella ruoli, GRANT ne' politiche, quindi una tabella nuova nasce
-- **fuori dal muro fra le case** e nessuno se ne accorge — `ENABLE ROW LEVEL
-- SECURITY` non e' un default, e una tabella senza politiche e' una tabella che
-- il ruolo applicativo legge tutta.
--
-- E' il difetto che ADR-048 ha gia' pagato una volta: le politiche della `0013`
-- elencano le tabelle **per nome**, quindi ogni tabella nuova va aggiunta qui a
-- mano o resta scoperta per sempre. Questo file e' quel gesto per
-- `placed_props` e `prop_stock`.
--
-- Entrambe portano `household_id` sulla riga, quindi e' il confronto diretto —
-- la stessa forma del primo blocco della `0013`. Un arredo appartiene alla
-- **casa** e non all'esemplare (ADR-019: la stanza e' della famiglia, e due
-- gosini nella stessa cucina vedono lo stesso cuscino).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['placed_props', 'prop_stock']
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

-- I privilegi: la `0013` ha fatto un `GRANT ... ON ALL TABLES`, che vale per le
-- tabelle **di allora**. Le `ALTER DEFAULT PRIVILEGES` della stessa migrazione
-- coprono le tabelle create dallo stesso ruolo da li' in avanti, ma dirlo a
-- voce alta costa una riga e vale un dubbio in meno il giorno che qualcuno
-- migri con un utente diverso.
GRANT SELECT, INSERT, UPDATE, DELETE ON placed_props TO ugo_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON prop_stock TO ugo_app;
