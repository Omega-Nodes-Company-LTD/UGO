-- ADR-072, il muro fra le case sul cibo. SCRITTA A MANO come la `0031`:
-- drizzle-kit non modella ruoli, GRANT né politiche.
--
-- Quanto una famiglia dà da mangiare alle proprie creature dice quanto le usa
-- e quanto ci guadagna: sono affari della casa, non del vicino.
--
-- Append-only imposto, non solo non concesso: un pasto è un atto. Se hai
-- sbagliato l'importo, la prossima volta gliene dai di meno — non riscrivi il
-- passato. Stessa postura di `births` (ADR-069) e dell'audit log (ADR-049).
DO $$
BEGIN
  EXECUTE 'ALTER TABLE feedings ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS feedings_household ON feedings';
  EXECUTE 'CREATE POLICY feedings_household ON feedings'
    ' USING (household_id = ugo_current_household())'
    ' WITH CHECK (household_id = ugo_current_household())';
END
$$;--> statement-breakpoint
GRANT SELECT, INSERT ON feedings TO ugo_app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON feedings FROM ugo_app;
