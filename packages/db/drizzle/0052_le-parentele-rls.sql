-- ADR-099, il muro sulle parentele e sulle cartoline. SCRITTA A MANO come la
-- `0031`, la `0034` e la `0045`: drizzle-kit non modella ruoli, GRANT né
-- politiche, e nemmeno un indice funzionale.
--
-- `account_ties` e `parcels` sono tabelle a DUE case, e la politica lo dice
-- invece di nasconderlo (il precedente è `adoptions`): le vedono le due parti
-- del legame, e nessun altro vicino.
--
-- La coppia è unica in qualunque verso — due proposte incrociate non devono
-- diventare due legami — ma solo finché il legame vive: una parentela
-- revocata non blocca per sempre un ripensamento.
CREATE UNIQUE INDEX IF NOT EXISTS account_ties_pair_uq
  ON account_ties (least(from_account_id, to_account_id),
                     greatest(from_account_id, to_account_id))
  WHERE status <> 'revocata';--> statement-breakpoint

DO $$
BEGIN
  EXECUTE 'ALTER TABLE account_ties ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS account_ties_parties ON account_ties';
  EXECUTE 'CREATE POLICY account_ties_parties ON account_ties FOR SELECT'
    ' USING (from_account_id = ugo_current_account()'
    '        OR to_account_id = ugo_current_account())';
  -- propone solo la casa che firma come mittente, e una proposta nasce
  -- proposta: un INSERT già "accettata" sarebbe un consenso mai chiesto
  EXECUTE 'DROP POLICY IF EXISTS account_ties_propose ON account_ties';
  EXECUTE 'CREATE POLICY account_ties_propose ON account_ties FOR INSERT'
    ' WITH CHECK (from_account_id = ugo_current_account()'
    '             AND status = ''proposta'')';
  -- accettare tocca al destinatario, revocare a chiunque dei due: chi può
  -- fare cosa lo decide il servizio, il database decide CHI può toccare
  EXECUTE 'DROP POLICY IF EXISTS account_ties_update ON account_ties';
  EXECUTE 'CREATE POLICY account_ties_update ON account_ties FOR UPDATE'
    ' USING (from_account_id = ugo_current_account()'
    '        OR to_account_id = ugo_current_account())'
    ' WITH CHECK (from_account_id = ugo_current_account()'
    '             OR to_account_id = ugo_current_account())';
END
$$;--> statement-breakpoint
-- un legame si revoca, non sparisce: una parentela cancellata è una
-- parentela che non è mai esistita, e qui c'è di mezzo un consenso
REVOKE DELETE ON account_ties FROM ugo_app;--> statement-breakpoint

DO $$
BEGIN
  EXECUTE 'ALTER TABLE parcels ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS parcels_parties ON parcels';
  EXECUTE 'CREATE POLICY parcels_parties ON parcels FOR SELECT'
    ' USING (from_account_id = ugo_current_account()'
    '        OR to_account_id = ugo_current_account())';
  -- imbuca solo il mittente, per casa propria
  EXECUTE 'DROP POLICY IF EXISTS parcels_send ON parcels';
  EXECUTE 'CREATE POLICY parcels_send ON parcels FOR INSERT'
    ' WITH CHECK (from_account_id = ugo_current_account())';
  -- l'unico aggiornamento è la consegna e il «tenere», e sono del destinatario
  EXECUTE 'DROP POLICY IF EXISTS parcels_delivery ON parcels';
  EXECUTE 'CREATE POLICY parcels_delivery ON parcels FOR UPDATE'
    ' USING (to_account_id = ugo_current_account())'
    ' WITH CHECK (to_account_id = ugo_current_account())';
END
$$;--> statement-breakpoint
-- append-only come `births`: una cartolina spedita non si riscrive e non si
-- ritira. L'UPDATE resta concesso SOLO sulle colonne di stato della consegna:
-- il testo, una volta partito, non è più in mano a nessuno dei due.
REVOKE UPDATE, DELETE ON parcels FROM ugo_app;--> statement-breakpoint
GRANT UPDATE (status, delivered_at, kept_at) ON parcels TO ugo_app;

-- ============================================================================
-- ADR-099, la porta della posta: il ruolo `ugo_post`.
--
-- Le politiche qui sopra sono la difesa DI DENTRO — ogni casa vede la propria
-- riga e nient'altro — e bastavano finché soul girava come proprietario delle
-- tabelle. Col flip di `DATABASE_URL_APP` (ADR-062 tempo 2b) non bastano più:
-- una cartolina, per esistere, deve leggere COSE DELL'ALTRA CASA — lo slug a
-- cui è indirizzata, la chiave con cui va cifrata (è di chi la riceve,
-- ADR-099 §4), l'esemplare destinatario. Dallo scope del mittente quelle
-- righe non esistono, e la feature morirebbe in silenzio: verde nei test che
-- girano da owner, muta in produzione.
--
-- È la quinta superficie cross-account, e prende la stessa risposta delle
-- prime quattro (ADR-097): un ruolo NOLOGIN col nome dell'atto, assunto con
-- `SET LOCAL ROLE` dentro `withPost` e perso al commit. Non un bypass: quello
-- che segue è l'inventario completo di cosa la posta È.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ugo_post') THEN
    CREATE ROLE ugo_post NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
-- WITH INHERIT FALSE per la ragione di ADR-097: ereditandolo, `ugo_app`
-- vedrebbe le parentele di tutti in ogni query senza aver dichiarato l'atto.
-- Così il ruolo si ASSUME, non si porta addosso.
GRANT ugo_post TO ugo_app WITH INHERIT FALSE, SET TRUE;--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT ugo_post TO %I WITH INHERIT FALSE, SET TRUE', current_user);
END
$$;--> statement-breakpoint

-- 1. Le due tabelle della posta: leggere entrambi i lati, proporre, spedire,
--    accettare, revocare, consegnare. Il `WITH CHECK` resta severo sul lato
--    che firma: chi propone è il mittente, chi spedisce pure — il ruolo apre
--    la lettura dell'altra casa, non il diritto di scrivere a nome suo.
GRANT SELECT, INSERT, UPDATE ON account_ties TO ugo_post;--> statement-breakpoint
GRANT SELECT, INSERT ON parcels TO ugo_post;--> statement-breakpoint
GRANT UPDATE (status, delivered_at, kept_at) ON parcels TO ugo_post;--> statement-breakpoint
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS account_ties_post ON account_ties';
  EXECUTE 'CREATE POLICY account_ties_post ON account_ties FOR SELECT TO ugo_post USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS account_ties_post_write ON account_ties';
  EXECUTE 'CREATE POLICY account_ties_post_write ON account_ties FOR INSERT TO ugo_post'
    ' WITH CHECK (status = ''proposta'')';
  EXECUTE 'DROP POLICY IF EXISTS account_ties_post_update ON account_ties';
  EXECUTE 'CREATE POLICY account_ties_post_update ON account_ties FOR UPDATE TO ugo_post'
    ' USING (true) WITH CHECK (true)';
  EXECUTE 'DROP POLICY IF EXISTS parcels_post ON parcels';
  EXECUTE 'CREATE POLICY parcels_post ON parcels FOR SELECT TO ugo_post USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS parcels_post_send ON parcels';
  EXECUTE 'CREATE POLICY parcels_post_send ON parcels FOR INSERT TO ugo_post WITH CHECK (true)';
  EXECUTE 'DROP POLICY IF EXISTS parcels_post_deliver ON parcels';
  EXECUTE 'CREATE POLICY parcels_post_deliver ON parcels FOR UPDATE TO ugo_post'
    ' USING (true) WITH CHECK (true)';
END
$$;--> statement-breakpoint

-- 2. Le case, IN SOLA LETTURA e **colonna per colonna**. È la riga più
--    delicata del file e va letta due volte.
--
--    `slug` e `name` servono a risolvere «manda ai nonni» e a dire da chi è
--    arrivata una cartolina. `wrapped_data_key` serve a ri-cifrare il testo
--    con la chiave di CHI RICEVE (ADR-099 §4): una cartolina è sua, e il
--    mittente dopo l'invio non deve poterla riaprire. Le colonne restano
--    enumerate — mai `GRANT SELECT ON accounts` — perché il resto della riga
--    (il budget, il metabolismo, le autorizzazioni d'allevamento) non ha
--    niente a che vedere con la posta, e un giorno qualcuno ne aggiungerà una
--    più delicata di tutte quelle di oggi.
--
--    E `wrapped_data_key` è la chiave AVVOLTA: senza la KEK di processo non
--    apre niente. Il ruolo consegna una busta chiusa, non un segreto.
--
--    Nota che va detta, o questo blocco promette più di quel che fa: su
--    `accounts` la lettura è già aperta a chiunque (`accounts_read USING
--    (true)`, ADR-048 §106 — risolvere un token precede il sapere di che casa
--    si parla, e ci si legge anche la DEK avvolta). Enumerare le colonne qui
--    non toglie a `ugo_app` ciò che ha: restringe ciò che vede **dentro la
--    porta**, dove la posta lavora. Il giorno in cui quella politica venisse
--    stretta — e sarebbe un bene — queste righe reggono già.
GRANT SELECT (id, slug, name, closed_at, wrapped_data_key) ON accounts TO ugo_post;--> statement-breakpoint
GRANT SELECT (id, account_id, name, born_at, retired_at) ON gosini TO ugo_post;--> statement-breakpoint
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS accounts_post_read ON accounts';
  EXECUTE 'CREATE POLICY accounts_post_read ON accounts FOR SELECT TO ugo_post USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS gosini_post_read ON gosini';
  EXECUTE 'CREATE POLICY gosini_post_read ON gosini FOR SELECT TO ugo_post USING (true)';
END
$$;--> statement-breakpoint

-- 3. Cosa la posta può SCRIVERE a casa d'altri, e non è una svista che sia
--    così poco: il desiderio con cui il gosino destinatario dirà che è
--    arrivata qualcosa (ADR-078), e il ricordo che nasce quando quella casa
--    decide di TENERE una cartolina. Nient'altro: né messaggi, né diario, né
--    psiche — una casa amica non scrive dentro la vita di un'altra.
GRANT INSERT ON desires TO ugo_post;--> statement-breakpoint
GRANT INSERT ON memories TO ugo_post;--> statement-breakpoint
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS desires_post_deliver ON desires';
  EXECUTE 'CREATE POLICY desires_post_deliver ON desires FOR INSERT TO ugo_post WITH CHECK (true)';
  EXECUTE 'DROP POLICY IF EXISTS memories_post_keep ON memories';
  EXECUTE 'CREATE POLICY memories_post_keep ON memories FOR INSERT TO ugo_post WITH CHECK (true)';
END
$$;
-- Cosa NON compare in questo file, e per costruzione: clienti, ticket,
-- trascrizioni, profili biometrici, impronte, salvadanaio, audit. Il blast
-- radius di una query sbagliata dentro `withPost` è la posta, non la casa.
