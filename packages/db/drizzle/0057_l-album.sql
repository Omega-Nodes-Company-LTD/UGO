-- ADR-109 — l'album di famiglia: la tabella e la durata scelta dalla casa.
--
-- Nota su una riga che sembra di troppo: `accounts.initiative` esiste già in
-- produzione dalla 0053, che è scritta a mano — quindi lo snapshot di
-- drizzle-kit non la conosceva, e questa generazione l'ha riproposta. Resta,
-- con `IF NOT EXISTS`, perché è ciò che **riallinea lo snapshot**: toglierla
-- lascerebbe la divergenza, e ogni `db:generate` futuro la riproporrebbe di
-- nuovo — la prossima volta magari senza che nessuno la guardi.
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"gosino_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "photos_expiry_after_taken" CHECK ("photos"."expires_at" > "photos"."taken_at")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "initiative" boolean;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "photo_retention_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_gosino_fk" FOREIGN KEY ("account_id","gosino_id") REFERENCES "public"."gosini"("account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photos_account_idx" ON "photos" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "photos_expiry_idx" ON "photos" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "photos_taken_idx" ON "photos" USING btree ("account_id","taken_at");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_photo_retention_steps" CHECK ("accounts"."photo_retention_hours" in (0, 6, 12, 24, 48, 72));