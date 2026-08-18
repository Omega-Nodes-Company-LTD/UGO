-- ADR-069, il muro fra le case sulle nascite. SCRITTA A MANO, come la `0013`,
-- la `0020`, la `0022` e la `0024`: drizzle-kit non modella ruoli, GRANT né
-- politiche.
--
-- Senza questo file `births` nasce fuori dal muro: chi è nato da chi è un
-- fatto della famiglia — dice quanti esemplari ha una casa e come li alleva —
-- e il lignaggio del vicino non sono affari di nessuno.
--
-- Niente UPDATE né DELETE a `ugo_app`: una nascita è un atto, non un record da
-- correggere — come l'audit log (ADR-049), il lignaggio è append-only per
-- GRANT, non per convenzione. L'oblio GDPR non passa da qui: `births` porta
-- solo id di esemplari, mai persone.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE births ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS births_household ON births';
  EXECUTE 'CREATE POLICY births_household ON births'
    ' USING (household_id = ugo_current_household())'
    ' WITH CHECK (household_id = ugo_current_household())';
END
$$;--> statement-breakpoint
GRANT SELECT, INSERT ON births TO ugo_app;--> statement-breakpoint
-- i DEFAULT PRIVILEGES concedono tutto alle tabelle nuove: l'append-only va
-- IMPOSTO, come sull'audit log (ADR-049) — revocato, non solo non concesso
REVOKE UPDATE, DELETE ON births FROM ugo_app;

