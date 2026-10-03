-- ADR-125 / ADR-128 / ADR-130 — il muro sull'incasso, e chi c'era prima.
-- SCRITTA A MANO (drizzle-kit generate --custom): politiche e dati.
--
-- `subscriptions` e `credit_settings` sono di UNA casa: la politica di sempre.
-- I webhook le scrivono dentro `withAccount`, dopo aver letto l'account dai
-- metadati che soul stesso ha messo sull'oggetto del PSP.
--
-- `billing_events` no: si scrive PRIMA di sapere di che casa è l'evento (è
-- proprio ciò che serve a non processarlo due volte), come `access_tokens`.
-- Non contiene niente di una casa: provider, id, tipo.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscriptions', 'credit_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_account', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (account_id = ugo_current_account()) WITH CHECK (account_id = ugo_current_account())',
      t || '_account', t
    );
  END LOOP;
END
$$;--> statement-breakpoint
-- Chi c'era prima dei piani non perde niente (ADR-125 §3): le case esistenti
-- sono l'installazione del proprietario, e nascono `allevamento` per
-- concessione. La fonderia, in più, consegna da sola (ADR-128 §4).
UPDATE accounts SET plan_grant = 'allevamento' WHERE plan_grant IS NULL AND closed_at IS NULL;--> statement-breakpoint
UPDATE accounts SET auto_deliver = true WHERE is_foundry;
