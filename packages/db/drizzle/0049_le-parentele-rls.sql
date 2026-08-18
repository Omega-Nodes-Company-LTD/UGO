-- ADR-092, il muro sulle parentele e sulle cartoline. SCRITTA A MANO come la
-- `0031`, la `0034` e la `0045`: drizzle-kit non modella ruoli, GRANT né
-- politiche, e nemmeno un indice funzionale.
--
-- `household_ties` e `parcels` sono tabelle a DUE case, e la politica lo dice
-- invece di nasconderlo (il precedente è `adoptions`): le vedono le due parti
-- del legame, e nessun altro vicino.
--
-- La coppia è unica in qualunque verso — due proposte incrociate non devono
-- diventare due legami — ma solo finché il legame vive: una parentela
-- revocata non blocca per sempre un ripensamento.
CREATE UNIQUE INDEX IF NOT EXISTS household_ties_pair_uq
  ON household_ties (least(from_household_id, to_household_id),
                     greatest(from_household_id, to_household_id))
  WHERE status <> 'revocata';--> statement-breakpoint

DO $$
BEGIN
  EXECUTE 'ALTER TABLE household_ties ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS household_ties_parties ON household_ties';
  EXECUTE 'CREATE POLICY household_ties_parties ON household_ties FOR SELECT'
    ' USING (from_household_id = ugo_current_household()'
    '        OR to_household_id = ugo_current_household())';
  -- propone solo la casa che firma come mittente, e una proposta nasce
  -- proposta: un INSERT già "accettata" sarebbe un consenso mai chiesto
  EXECUTE 'DROP POLICY IF EXISTS household_ties_propose ON household_ties';
  EXECUTE 'CREATE POLICY household_ties_propose ON household_ties FOR INSERT'
    ' WITH CHECK (from_household_id = ugo_current_household()'
    '             AND status = ''proposta'')';
  -- accettare tocca al destinatario, revocare a chiunque dei due: chi può
  -- fare cosa lo decide il servizio, il database decide CHI può toccare
  EXECUTE 'DROP POLICY IF EXISTS household_ties_update ON household_ties';
  EXECUTE 'CREATE POLICY household_ties_update ON household_ties FOR UPDATE'
    ' USING (from_household_id = ugo_current_household()'
    '        OR to_household_id = ugo_current_household())'
    ' WITH CHECK (from_household_id = ugo_current_household()'
    '             OR to_household_id = ugo_current_household())';
END
$$;--> statement-breakpoint
-- un legame si revoca, non sparisce: una parentela cancellata è una
-- parentela che non è mai esistita, e qui c'è di mezzo un consenso
REVOKE DELETE ON household_ties FROM ugo_app;--> statement-breakpoint

DO $$
BEGIN
  EXECUTE 'ALTER TABLE parcels ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS parcels_parties ON parcels';
  EXECUTE 'CREATE POLICY parcels_parties ON parcels FOR SELECT'
    ' USING (from_household_id = ugo_current_household()'
    '        OR to_household_id = ugo_current_household())';
  -- imbuca solo il mittente, per casa propria
  EXECUTE 'DROP POLICY IF EXISTS parcels_send ON parcels';
  EXECUTE 'CREATE POLICY parcels_send ON parcels FOR INSERT'
    ' WITH CHECK (from_household_id = ugo_current_household())';
  -- l'unico aggiornamento è la consegna e il «tenere», e sono del destinatario
  EXECUTE 'DROP POLICY IF EXISTS parcels_delivery ON parcels';
  EXECUTE 'CREATE POLICY parcels_delivery ON parcels FOR UPDATE'
    ' USING (to_household_id = ugo_current_household())'
    ' WITH CHECK (to_household_id = ugo_current_household())';
END
$$;--> statement-breakpoint
-- append-only come `births`: una cartolina spedita non si riscrive e non si
-- ritira. L'UPDATE resta concesso SOLO sulle colonne di stato della consegna:
-- il testo, una volta partito, non è più in mano a nessuno dei due.
REVOKE UPDATE, DELETE ON parcels FROM ugo_app;--> statement-breakpoint
GRANT UPDATE (status, delivered_at, kept_at) ON parcels TO ugo_app;
