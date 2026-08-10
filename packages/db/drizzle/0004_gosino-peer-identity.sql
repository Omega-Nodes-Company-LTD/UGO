ALTER TABLE "gosini" ADD COLUMN "signing_public_key" "bytea";--> statement-breakpoint
ALTER TABLE "gosini" ADD COLUMN "signing_private_key" "bytea";--> statement-breakpoint
ALTER TABLE "gosini" ADD COLUMN "rotation_secret" "bytea";--> statement-breakpoint
ALTER TABLE "gosini" ADD COLUMN "peer_encounters" boolean DEFAULT false NOT NULL;