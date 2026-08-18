-- ADR-081. Il tipo lo scriviamo a mano: drizzle-kit non emette `CREATE TYPE`
-- per un enum nuovo (stessa trappola di `desire_kind` e `feeding_kind`).
CREATE TYPE "public"."gosino_origin" AS ENUM('capostipite', 'nato', 'dote');--> statement-breakpoint
ALTER TABLE "gosini" ADD COLUMN "origin" "gosino_origin" DEFAULT 'capostipite' NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "is_foundry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "can_breed" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Chi ha una riga in `births` È nato: la definizione di «nato» è avere dei
-- genitori che ne hanno firmato la nascita (ADR-070), non una colonna nuova che
-- dichiara tutti capostipiti perché il default doveva pur valere qualcosa.
UPDATE "gosini" SET "origin" = 'nato'
 WHERE "id" IN (SELECT DISTINCT "child_gosino_id" FROM "births");--> statement-breakpoint

-- L'allevamento di questa installazione è la casa che c'era per prima: esisteva
-- prima che questa regola esistesse, e i suoi capostipiti sono già coniati.
-- Le case successive nascono senza nessuna delle due autorizzazioni, ed è il
-- punto: da qui in avanti un gosino non si crea, si riceve.
UPDATE "households" SET "is_foundry" = true, "can_breed" = true
 WHERE "id" = (SELECT "id" FROM "households" ORDER BY "created_at" ASC LIMIT 1);
