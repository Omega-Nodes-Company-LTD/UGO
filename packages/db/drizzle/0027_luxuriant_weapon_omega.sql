CREATE INDEX "events_gosino_ts_idx" ON "events" USING btree ("gosino_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "meetings_gosino_idx" ON "meetings" USING btree ("gosino_id");--> statement-breakpoint
CREATE INDEX "messages_gosino_ts_idx" ON "messages" USING btree ("gosino_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "psyche_snapshots_gosino_ts_idx" ON "psyche_snapshots" USING btree ("gosino_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transcript_segments_household_idx" ON "transcript_segments" USING btree ("household_id");