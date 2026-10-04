-- ADR-133 — il muro sulle cose che segue.
-- SCRITTA A MANO (drizzle-kit generate --custom): politiche e un dato.
--
-- Le due tabelle sono della casa e di nessun altro: nessun ruolo dedicato
-- le attraversa. DELETE resta concesso: «dimentica che volevo andare in
-- Uganda» deve poterlo togliere davvero, trovati compresi (cascade).
DO $$
BEGIN
  EXECUTE 'ALTER TABLE watches ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS watches_account ON watches';
  EXECUTE 'CREATE POLICY watches_account ON watches'
    ' USING (account_id = ugo_current_account()) WITH CHECK (account_id = ugo_current_account())';

  EXECUTE 'ALTER TABLE watch_finds ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS watch_finds_account ON watch_finds';
  EXECUTE 'CREATE POLICY watch_finds_account ON watch_finds'
    ' USING (account_id = ugo_current_account()) WITH CHECK (account_id = ugo_current_account())';
END
$$;--> statement-breakpoint
-- Le case che esistono già sono dell'installazione di prima, il cui titolare
-- ha chiesto la ricerca sul web (2026-10-04); le nuove nascono col default
-- spento e la accendono dal pannello (privacy by default, GDPR art. 25).
UPDATE accounts SET watch_web = true;
