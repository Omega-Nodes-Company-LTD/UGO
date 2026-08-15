-- ADR-053. SCRITTA A MANO, come la `0013`, la `0017` e la `0019`: drizzle-kit
-- non modella le politiche.
--
-- `act_efficacy` porta `gosino_id` e non `household_id`, quindi la politica ha
-- la forma del **secondo** blocco della `0013` — quello delle tabelle
-- dell'esemplare: i pesi sono di una creatura, come i suoi ricordi e il suo
-- umore, e due gosini sotto lo stesso tetto imparano cose diverse.
--
-- La sottoquery non e' correlata: Postgres la valuta una volta per statement.

ALTER TABLE "act_efficacy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "act_efficacy_household" ON "act_efficacy";--> statement-breakpoint
CREATE POLICY "act_efficacy_household" ON "act_efficacy"
  USING (gosino_id IN (SELECT id FROM gosini WHERE household_id = ugo_current_household()))
  WITH CHECK (gosino_id IN (SELECT id FROM gosini WHERE household_id = ugo_current_household()));--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON act_efficacy TO ugo_app;
