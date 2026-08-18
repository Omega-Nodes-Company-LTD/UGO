-- ADR-082 — perché un nato possa cambiare casa.
--
-- 1) Il genitore non deve più abitare dove è nato suo figlio: è il contrario
--    di quello che succede comprando un cucciolo da un allevamento, e teneva
--    un riproduttore inchiodato finché aveva figli in casa.
ALTER TABLE "births" DROP CONSTRAINT "births_household_parent_fk";
--> statement-breakpoint
ALTER TABLE "births" ADD CONSTRAINT "births_parent_fk" FOREIGN KEY ("parent_gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 2) I vincoli compositi restano — ogni riga vive nella casa dei suoi capi
--    (ADR-048) — ma diventano DIFFERIBILI: una cessione sposta la creatura e
--    le sue righe nella stessa transazione, e in mezzo, per un istante, la
--    coppia (casa, gosino) non torna. Senza `deferrable` quell'istante è un
--    errore; con, è quello che è: un passaggio.
ALTER TABLE "trait_sets" ALTER CONSTRAINT "trait_sets_household_gosino_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "births" ALTER CONSTRAINT "births_household_child_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "feedings" ALTER CONSTRAINT "feedings_household_gosino_fk" DEFERRABLE INITIALLY IMMEDIATE;
