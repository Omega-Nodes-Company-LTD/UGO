CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"household_id" uuid,
	"token_id" uuid,
	"role" text,
	"verb" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"outcome" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_household_at_idx" ON "audit_log" USING btree ("household_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint

-- ADR-049, la parte che drizzle-kit non sa modellare: privilegi e politiche.
--
-- **Append-only imposto dal database, non dalla disciplina.** `0013` aveva
-- concesso a `ugo_app` SELECT/INSERT/UPDATE/DELETE su tutte le tabelle, e ha
-- lasciato un `ALTER DEFAULT PRIVILEGES` che farebbe ereditare gli stessi
-- quattro a ogni tabella nuova — compresa questa. Quindi qui non basta non
-- concedere: bisogna **revocare**. Un audit log che l'applicazione puo'
-- riscrivere non e' un audit log, e' un suggerimento.
--
-- La cancellazione per scadenza (dodici mesi, `hygiene.py`) resta possibile
-- perche' i job girano come proprietario delle tabelle. E' voluto: far scadere
-- una riga e' un atto della casa, riscriverla sarebbe un atto
-- dell'applicazione, e sono due poteri diversi.
REVOKE UPDATE, DELETE ON audit_log FROM ugo_app;--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO ugo_app;--> statement-breakpoint

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS audit_log_read ON audit_log;--> statement-breakpoint
DROP POLICY IF EXISTS audit_log_append ON audit_log;--> statement-breakpoint

-- In lettura, la propria casa e basta. Le righe con `household_id` nullo — i
-- rifiuti avvenuti prima che si sapesse di che casa si trattasse — restano
-- invisibili al ruolo applicativo e visibili al proprietario: e' la scelta
-- giusta, perche' un 401 non appartiene a nessuna famiglia e mostrarlo a una
-- qualsiasi direbbe una cosa falsa.
CREATE POLICY audit_log_read ON audit_log FOR SELECT
  USING (household_id = ugo_current_household());--> statement-breakpoint

-- In scrittura si accetta anche il nullo, ed e' obbligatorio che sia cosi':
-- l'evento per cui un audit log esiste — qualcuno ha bussato con un token che
-- non vale — avviene appunto prima di sapere di che casa parliamo.
CREATE POLICY audit_log_append ON audit_log FOR INSERT
  WITH CHECK (household_id IS NULL OR household_id = ugo_current_household());
