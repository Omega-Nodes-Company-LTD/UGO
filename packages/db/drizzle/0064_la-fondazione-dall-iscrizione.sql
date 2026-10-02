-- ADR-124. SCRITTA A MANO (drizzle-kit generate --custom): GRANT e policy
-- non sono nel modello di drizzle-kit.
--
-- Un'iscrizione fonda un account che un istante prima non esisteva: lo stesso
-- atto di `POST /v1/accounts`, quindi lo stesso ruolo — `ugo_market`
-- (ADR-097). Mancavano due pezzi:
--
--  - `places`: ADR-113 vuole che un account nasca con un luogo, ma il ruolo
--    della fondazione non poteva scriverlo — sotto RLS vera la nascita di una
--    casa con capostipite si fermava qui;
--  - `account_logins`: l'email entra nell'account NELLA STESSA transazione
--    che lo crea. Un account senza chi ci entra è irraggiungibile.
--
-- `account_logins` non ha RLS (si legge prima di sapere l'account, come
-- `access_tokens`): basta il GRANT, e `ugo_app` lo ha già dai default.
DO $$
BEGIN
  EXECUTE 'GRANT INSERT ON places TO ugo_market';
  EXECUTE 'DROP POLICY IF EXISTS places_market_found ON places';
  EXECUTE 'CREATE POLICY places_market_found ON places FOR INSERT TO ugo_market WITH CHECK (true)';
  EXECUTE 'GRANT SELECT, INSERT ON account_logins TO ugo_market';
END $$;
