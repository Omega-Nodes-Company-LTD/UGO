-- ADR-046. RISCRITTA A MANO rispetto a quanto generato da drizzle-kit, e il
-- perché va letto prima di rigenerarla:
--
--   1. drizzle-kit aggiunge le colonne con `DEFAULT '<casa-prime>' NOT NULL`,
--      cioè **riempie le righe esistenti con la casa seminata** invece che con
--      la casa del loro genitore. Su questo deploy le due coincidono, perché
--      di casa ce n'è una sola — ed è esattamente il motivo per cui una
--      migrazione così passerebbe i test e sarebbe sbagliata: codifica una
--      coincidenza. Qui la colonna nasce nullable, si riempie dal genitore, e
--      solo dopo diventa NOT NULL.
--   2. le chiavi esterne composte vanno aggiunte **dopo** il riempimento, o
--      rifiutano le righe che ancora non hanno una casa.
--
-- È la terza volta che una migrazione generata va provata contro Postgres
-- invece che letta (ADR-019 §156, il CREATE TYPE mancante nella 0009).

ALTER TABLE "diary_entries" DROP CONSTRAINT "diary_entries_date_unique";--> statement-breakpoint

ALTER TABLE "memory_beings" ADD COLUMN "household_id" uuid;--> statement-breakpoint
ALTER TABLE "recognition_profiles" ADD COLUMN "household_id" uuid;--> statement-breakpoint
ALTER TABLE "trait_sets" ADD COLUMN "household_id" uuid;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD COLUMN "household_id" uuid;--> statement-breakpoint

-- il riempimento, ciascuna dal proprio genitore e non da un default
UPDATE "memory_beings" mb
   SET "household_id" = b."household_id"
  FROM "beings" b
 WHERE b."id" = mb."being_id";--> statement-breakpoint

UPDATE "recognition_profiles" rp
   SET "household_id" = b."household_id"
  FROM "beings" b
 WHERE b."id" = rp."being_id";--> statement-breakpoint

UPDATE "trait_sets" ts
   SET "household_id" = g."household_id"
  FROM "gosini" g
 WHERE g."id" = ts."gosino_id";--> statement-breakpoint

UPDATE "transcript_segments" seg
   SET "household_id" = g."household_id"
  FROM "meetings" m
  JOIN "gosini" g ON g."id" = m."gosino_id"
 WHERE m."id" = seg."meeting_id";--> statement-breakpoint

ALTER TABLE "memory_beings" ALTER COLUMN "household_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_beings" ALTER COLUMN "household_id" SET DEFAULT '00000000-0000-4000-8000-000000000002';--> statement-breakpoint
ALTER TABLE "recognition_profiles" ALTER COLUMN "household_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recognition_profiles" ALTER COLUMN "household_id" SET DEFAULT '00000000-0000-4000-8000-000000000002';--> statement-breakpoint
ALTER TABLE "trait_sets" ALTER COLUMN "household_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trait_sets" ALTER COLUMN "household_id" SET DEFAULT '00000000-0000-4000-8000-000000000002';--> statement-breakpoint
ALTER TABLE "transcript_segments" ALTER COLUMN "household_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transcript_segments" ALTER COLUMN "household_id" SET DEFAULT '00000000-0000-4000-8000-000000000002';--> statement-breakpoint

-- e solo ora i vincoli: le composte sono il muro vero, e rifiuterebbero
-- qualunque riga rimasta senza casa
ALTER TABLE "memory_beings" ADD CONSTRAINT "memory_beings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_beings" ADD CONSTRAINT "memory_beings_household_being_fk" FOREIGN KEY ("household_id","being_id") REFERENCES "public"."beings"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition_profiles" ADD CONSTRAINT "recognition_profiles_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition_profiles" ADD CONSTRAINT "recognition_profiles_household_being_fk" FOREIGN KEY ("household_id","being_id") REFERENCES "public"."beings"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trait_sets" ADD CONSTRAINT "trait_sets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trait_sets" ADD CONSTRAINT "trait_sets_household_gosino_fk" FOREIGN KEY ("household_id","gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_gosino_date_uq" UNIQUE("gosino_id","date");
