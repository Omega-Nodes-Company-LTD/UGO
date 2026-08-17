-- ADR-076, il muro fra le case sulle liste. SCRITTA A MANO come le altre:
-- drizzle-kit non modella ruoli, GRANT né politiche.
--
-- Cosa compra una famiglia è una fotografia di come vive: la lista della
-- spesa del vicino non sono affari di nessuno.
--
-- Qui UPDATE e DELETE ci sono, a differenza di `births` e `feedings`: una
-- riga di lista si spunta e si cancella. Non è un atto — è la spesa.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE list_items ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS list_items_household ON list_items';
  EXECUTE 'CREATE POLICY list_items_household ON list_items'
    ' USING (household_id = ugo_current_household())'
    ' WITH CHECK (household_id = ugo_current_household())';
END
$$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON list_items TO ugo_app;
