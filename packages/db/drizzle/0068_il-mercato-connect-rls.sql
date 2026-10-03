-- ADR-131 — il muro sul mercato dei cuccioli.
-- SCRITTA A MANO (drizzle-kit generate --custom): politiche e GRANT.
--
-- `breeder_payout_accounts` è di UNA casa, ma il pagamento di un'adozione lo
-- apre la casa di chi COMPRA, e deve sapere su quale conto Connect andrà il
-- denaro: lo legge il ruolo del mercato (ADR-097), solo in lettura.
--
-- `listing_reports`: chi segnala vede le sue segnalazioni, e nessun altro —
-- l'allevamento non sa chi l'ha segnalato. L'operatore le legge e le chiude
-- passando dal ruolo del mercato, come ogni atto che attraversa le case.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE breeder_payout_accounts ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS breeder_payout_accounts_account ON breeder_payout_accounts';
  EXECUTE 'CREATE POLICY breeder_payout_accounts_account ON breeder_payout_accounts'
    ' USING (account_id = ugo_current_account()) WITH CHECK (account_id = ugo_current_account())';
  EXECUTE 'GRANT SELECT ON breeder_payout_accounts TO ugo_market';
  EXECUTE 'DROP POLICY IF EXISTS breeder_payout_accounts_market_read ON breeder_payout_accounts';
  EXECUTE 'CREATE POLICY breeder_payout_accounts_market_read ON breeder_payout_accounts FOR SELECT TO ugo_market USING (true)';

  EXECUTE 'ALTER TABLE listing_reports ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS listing_reports_reporter ON listing_reports';
  EXECUTE 'CREATE POLICY listing_reports_reporter ON listing_reports'
    ' USING (reporter_account_id = ugo_current_account()) WITH CHECK (reporter_account_id = ugo_current_account())';
  EXECUTE 'GRANT SELECT, UPDATE ON listing_reports TO ugo_market';
  EXECUTE 'DROP POLICY IF EXISTS listing_reports_market ON listing_reports';
  EXECUTE 'CREATE POLICY listing_reports_market ON listing_reports FOR ALL TO ugo_market USING (true) WITH CHECK (true)';
END $$;
