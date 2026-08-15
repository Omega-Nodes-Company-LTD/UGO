-- ADR-052. SCRITTA A MANO, come la `0013` e la `0017`: drizzle-kit non modella
-- le politiche, quindi senza questo file `unknown_prints` nasce fuori dal muro
-- fra le case.
--
-- E qui pesa il doppio di una tabella qualunque. Dentro ci sono **impronte
-- biometriche di persone che non hanno acconsentito**: una tabella scoperta non
-- significherebbe che il vicino vede il tuo cuscino, significherebbe che il
-- vicino ha il volto di chi è passato da casa tua.

ALTER TABLE "unknown_prints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "unknown_prints_household" ON "unknown_prints";--> statement-breakpoint
CREATE POLICY "unknown_prints_household" ON "unknown_prints"
  USING (household_id = ugo_current_household())
  WITH CHECK (household_id = ugo_current_household());--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON unknown_prints TO ugo_app;
