-- ADR-085, il muro sui check-in. SCRITTA A MANO come la `0013` e la `0045`:
-- drizzle-kit non modella ruoli, GRANT né politiche.
--
-- Scope per esemplare, come `desires` — un check-in è una cosa fra chi lo ha
-- chiesto e chi lo chiederà, e la casa di mezzo è la stessa.
--
-- DELETE resta concesso, al contrario di `births` e `adoptions`: «non
-- chiedermelo più» deve poterlo togliere davvero. Un appuntamento quotidiano
-- che si può solo spegnere e non cancellare è un appuntamento che resta lì a
-- ricordarti che c'era, e questo è l'opposto di quello che è stato chiesto.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE checkins ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS checkins_household ON checkins';
  EXECUTE 'CREATE POLICY checkins_household ON checkins'
    ' USING (gosino_id IN (SELECT id FROM gosini WHERE household_id = ugo_current_household()))'
    ' WITH CHECK (gosino_id IN (SELECT id FROM gosini WHERE household_id = ugo_current_household()))';
END
$$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON checkins TO ugo_app;
