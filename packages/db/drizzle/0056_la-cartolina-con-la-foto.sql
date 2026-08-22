-- ADR-109 × ADR-099 — la cartolina può portare una foto.
--
-- Tre pezzi, e l'ordine conta: prima l'unicità su cui la chiave esterna si
-- appoggia, poi la colonna, poi il vincolo.
--
-- `ON DELETE SET NULL (photo_id)` è la ragione per cui questa migrazione è
-- scritta a mano: drizzle-kit genera un `no action`, e con quello la prima
-- foto che scade **bloccherebbe la propria scadenza** — la riga della
-- cartolina la sta ancora nominando. Una cartolina non deve tenere in vita
-- una foto oltre la durata scelta dalla casa che la ospita (ADR-109 §2): la
-- foto sparisce, e della cartolina resta il testo, che è come funziona la
-- posta. La lista di colonne dopo SET NULL esiste da Postgres 15 e serve
-- perché `to_account_id` è NOT NULL: senza, Postgres proverebbe ad azzerare
-- tutte e due le colonne della coppia e rifiuterebbe.
ALTER TABLE "photos" ADD CONSTRAINT "photos_account_id_uq" UNIQUE("account_id","id");--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "photo_id" uuid;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_photo_fk"
  FOREIGN KEY ("to_account_id","photo_id") REFERENCES "public"."photos"("account_id","id")
  ON DELETE SET NULL ("photo_id") ON UPDATE no action;
