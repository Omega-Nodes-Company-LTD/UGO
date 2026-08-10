ALTER TABLE "transcript_segments" ADD COLUMN "being_id" uuid;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_being_id_beings_id_fk" FOREIGN KEY ("being_id") REFERENCES "public"."beings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcript_segments_being_idx" ON "transcript_segments" USING btree ("being_id");