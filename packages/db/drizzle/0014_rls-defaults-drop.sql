-- ADR-048 tempo 2: i DEFAULT cadono.
--
-- Diciannove colonne tenant nascevano con un valore di ripiego — l'esemplare e
-- la casa seminati dalla prima migrazione. Serviva finche' il codice non diceva
-- lo scope ovunque, e nel frattempo faceva questo: una scrittura che si
-- dimenticava di che casa fosse **non falliva**, finiva nella casa sbagliata,
-- in silenzio e senza un log. La separazione la tenevano il codice e i test,
-- non il database (STATE §7).
--
-- Da qui in avanti la tiene Postgres: `not-null violation`, subito, sulla riga
-- che ha sbagliato. E' additiva e reversibile (un `SET DEFAULT` la annulla) e
-- non tocca un solo dato: ogni riga gia' scritta ha il suo valore.
--
-- Generata con drizzle-kit (regola 5), dopo aver tolto `.default()` dai due
-- helper di schema: e' quella rimozione a rendere il tipo un errore di
-- compilazione, e questo file a renderlo un errore a runtime.
ALTER TABLE "beings" ALTER COLUMN "household_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "bonds" ALTER COLUMN "household_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "budget_ledger" ALTER COLUMN "household_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "budget_ledger" ALTER COLUMN "gosino_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "desires" ALTER COLUMN "gosino_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "diary_entries" ALTER COLUMN "gosino_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "gosino_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "gosini" ALTER COLUMN "household_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "gosino_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "gosino_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "memory_beings" ALTER COLUMN "household_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "gosino_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "psyche_baselines" ALTER COLUMN "gosino_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "psyche_snapshots" ALTER COLUMN "gosino_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "recognition_profiles" ALTER COLUMN "household_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "relations" ALTER COLUMN "household_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "household_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "trait_sets" ALTER COLUMN "household_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "transcript_segments" ALTER COLUMN "household_id" DROP DEFAULT;