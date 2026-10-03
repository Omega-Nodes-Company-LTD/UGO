-- ADR-132 — il muro della piazza.
-- SCRITTA A MANO (drizzle-kit generate --custom): ruolo, GRANT, politiche.
--
-- Le tre tabelle sono di una casa (la presenza, il blocco) o delle due parti
-- (l'invito). La SOLA cosa che attraversa le case è guardare la piazza: chi
-- c'è adesso e chi mi ha bloccato. La guarda `ugo_plaza`, un ruolo NOLOGIN che
-- si ASSUME per quell'atto (sul modello di `ugo_market`, ADR-097, e
-- `ugo_post`, ADR-099), e che vede presenze, blocchi e inviti — mai ricordi,
-- messaggi o persone.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ugo_plaza') THEN
    CREATE ROLE ugo_plaza NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
-- WITH INHERIT FALSE: ereditandolo, `ugo_app` vedrebbe la piazza di tutti in
-- ogni query senza aver dichiarato l'atto
GRANT ugo_plaza TO ugo_app WITH INHERIT FALSE, SET TRUE;--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT ugo_plaza TO %I WITH INHERIT FALSE, SET TRUE', current_user);
END
$$;--> statement-breakpoint
DO $$
BEGIN
  EXECUTE 'ALTER TABLE plaza_presence ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS plaza_presence_account ON plaza_presence';
  EXECUTE 'CREATE POLICY plaza_presence_account ON plaza_presence'
    ' USING (account_id = ugo_current_account()) WITH CHECK (account_id = ugo_current_account())';

  EXECUTE 'ALTER TABLE plaza_blocks ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS plaza_blocks_account ON plaza_blocks';
  EXECUTE 'CREATE POLICY plaza_blocks_account ON plaza_blocks'
    ' USING (account_id = ugo_current_account()) WITH CHECK (account_id = ugo_current_account())';

  -- l'invito è delle due parti: chi invita lo scrive, chi è invitato lo accetta
  EXECUTE 'ALTER TABLE plaza_invites ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS plaza_invites_parties ON plaza_invites';
  EXECUTE 'CREATE POLICY plaza_invites_parties ON plaza_invites'
    ' USING (from_account_id = ugo_current_account() OR to_account_id = ugo_current_account())'
    ' WITH CHECK (from_account_id = ugo_current_account() OR to_account_id = ugo_current_account())';

  EXECUTE 'GRANT SELECT ON plaza_presence, plaza_blocks, plaza_invites TO ugo_plaza';
  EXECUTE 'DROP POLICY IF EXISTS plaza_presence_plaza ON plaza_presence';
  EXECUTE 'CREATE POLICY plaza_presence_plaza ON plaza_presence FOR SELECT TO ugo_plaza USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS plaza_blocks_plaza ON plaza_blocks';
  EXECUTE 'CREATE POLICY plaza_blocks_plaza ON plaza_blocks FOR SELECT TO ugo_plaza USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS plaza_invites_plaza ON plaza_invites';
  EXECUTE 'CREATE POLICY plaza_invites_plaza ON plaza_invites FOR SELECT TO ugo_plaza USING (true)';
END
$$;
