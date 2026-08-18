-- ADR-078. Il tipo lo scriviamo a mano: drizzle-kit non emette `CREATE TYPE`
-- per un enum nuovo (stessa trappola di `households.kind` e `feeding_kind`),
-- e senza questa riga la migrazione muore sul tipo che non esiste.
CREATE TYPE "public"."desire_kind" AS ENUM('desiderio', 'promemoria', 'timer', 'sveglia');--> statement-breakpoint
ALTER TABLE "desires" ADD COLUMN "kind" "desire_kind" DEFAULT 'desiderio' NOT NULL;--> statement-breakpoint
-- Le righe che avevano già un'ora sopra ERANO promemoria (ADR-028): lasciarle
-- `desiderio` sarebbe una colonna nuova che mente sul passato.
UPDATE "desires" SET "kind" = 'promemoria' WHERE "due_at" IS NOT NULL;
