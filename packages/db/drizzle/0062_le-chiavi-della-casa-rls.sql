-- ADR-122 / ADR-130 — il muro sulle chiavi, sulle scelte e sul credito.
-- SCRITTA A MANO come la 0013 e la 0058: drizzle-kit non modella ruoli,
-- GRANT né politiche.
--
-- Tutte e tre sono di UNA casa: la politica è quella semplice di sempre.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['provider_credentials', 'model_choices', 'credit_ledger'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_account', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (account_id = ugo_current_account()) WITH CHECK (account_id = ugo_current_account())',
      t || '_account', t
    );
  END LOOP;
END
$$;--> statement-breakpoint
-- Il credito è un registro, non un saldo: si aggiunge, non si riscrive né si
-- cancella (ADR-130). Una riga sbagliata si corregge con un `adjust`.
REVOKE UPDATE, DELETE ON credit_ledger FROM ugo_app;--> statement-breakpoint
GRANT SELECT, INSERT ON credit_ledger TO ugo_app;
