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
-- La posta guadagna le foto (ADR-109 × ADR-099).
--
-- Una cartolina può portare una foto, e allora il ruolo che la spedisce deve
-- poterla leggere dalla casa mittente e scriverne una copia in quella
-- destinataria — ri-cifrata con la chiave di CHI RICEVE, come già il testo.
-- Restano le stesse due regole di ADR-099: la posta legge e imbuca, non
-- modifica; e non tocca niente che non sia posta.
GRANT SELECT, INSERT ON photos TO ugo_post;--> statement-breakpoint
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS photos_post_read ON photos';
  EXECUTE 'CREATE POLICY photos_post_read ON photos FOR SELECT TO ugo_post USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS photos_post_write ON photos';
  EXECUTE 'CREATE POLICY photos_post_write ON photos FOR INSERT TO ugo_post WITH CHECK (true)';
END
$$;--> statement-breakpoint
-- e la durata della casa destinataria, che è quella che vale per una foto
-- ricevuta: la si legge, non la si decide (ADR-109 §6)
GRANT SELECT (photo_retention_hours) ON accounts TO ugo_post;
