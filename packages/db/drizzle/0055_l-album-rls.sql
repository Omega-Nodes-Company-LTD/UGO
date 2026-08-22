-- ADR-109 — il muro sull'album. SCRITTA A MANO come la 0013, la 0049 e la
-- 0052: drizzle-kit non modella ruoli, GRANT né politiche.
--
-- Le foto sono di UNA casa, a differenza delle cartoline: la politica è
-- quella semplice di sempre, `account_id = ugo_current_account()`.
--
-- `UPDATE` **non è concesso a nessuno**, ed è una decisione: una foto non si
-- modifica. Si scatta, si guarda, e scade — o si cancella. La didascalia la
-- scrive il modello vision allo scatto, e una didascalia riscritta a mano
-- sarebbe un ricordo che dice una cosa mentre l'immagine ne mostra un'altra.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE photos ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS photos_account ON photos';
  EXECUTE 'CREATE POLICY photos_account ON photos'
    ' USING (account_id = ugo_current_account())'
    ' WITH CHECK (account_id = ugo_current_account())';
END
$$;--> statement-breakpoint
REVOKE UPDATE ON photos FROM ugo_app;--> statement-breakpoint
-- il DELETE invece SÌ, e serve: è come una foto sparisce quando scade, e come
-- il proprietario ne butta una senza aspettare (ADR-109 §5). L'album è
-- l'opposto di un registro: `births` è un atto, questa è una fotografia.
GRANT SELECT, INSERT, DELETE ON photos TO ugo_app;--> statement-breakpoint

-- ============================================================================
-- La posta NON guadagna niente qui, ed è una nota che vale la riga.
--
-- Una cartolina può portare una foto (ADR-109 × ADR-099), e verrebbe da
-- pensare che il ruolo `ugo_post` debba poter leggere l'album del mittente e
-- scrivere in quello del destinatario. Non serve: i pixel passano dalla porta
-- di casa di ognuno — `withAccount(mittente)` per aprirli, `withAccount(chi
-- riceve)` per riscriverli — che è la stessa meccanica con cui la consegna
-- scrive già un desiderio in casa d'altri (ADR-099 §consegna).
--
-- `ugo_post` esiste per ciò che una casa sola non può vedere: la riga della
-- parentela e la busta della cartolina. Le foto non sono in quell'elenco, e
-- un `USING (true)` in più su una tabella di immagini sarebbe una porta
-- aperta per un passaggio che nessuno percorre.
