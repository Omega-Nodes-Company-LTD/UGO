-- ADR-058, il muro del cliente. SCRITTA A MANO, come la `0013` e la `0020`:
-- drizzle-kit non modella ruoli, GRANT né politiche, e non ha nulla da
-- generare qui.
--
-- Senza questo file `customer_rewards` nasce **fuori dal muro fra le case**:
-- una tabella senza politiche è una tabella che il ruolo applicativo legge
-- tutta, e si comporta esattamente come una protetta finché non arriva la
-- seconda famiglia. La riga porta `household_id`, quindi ha la forma del primo
-- blocco della `0013` — confronto diretto.
ALTER TABLE "customer_rewards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "customer_rewards_household" ON "customer_rewards";--> statement-breakpoint
CREATE POLICY "customer_rewards_household" ON "customer_rewards"
  USING (household_id = ugo_current_household())
  WITH CHECK (household_id = ugo_current_household());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_rewards TO ugo_app;
