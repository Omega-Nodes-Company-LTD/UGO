CREATE TYPE "public"."desire_status" AS ENUM('pending', 'done', 'expired');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('face', 'nano', 'ear', 'meet', 'system');--> statement-breakpoint
CREATE TYPE "public"."memory_kind" AS ENUM('fact', 'preference', 'episode', 'insight');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('home', 'meeting', 'api');--> statement-breakpoint
CREATE TABLE "budget_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"status" "desire_status" DEFAULT 'pending' NOT NULL,
	"due_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"text" text NOT NULL,
	"mood_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "diary_entries_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "event_source" NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"title" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audio_uri" text,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "memory_kind" NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768),
	"importance" real DEFAULT 0.5 NOT NULL,
	"last_accessed" timestamp with time zone,
	"source_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" "message_channel" NOT NULL,
	"role" text NOT NULL,
	"person_id" uuid,
	"text" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psyche_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"vars" jsonb NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"speaker" text,
	"t0" real NOT NULL,
	"t1" real NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768)
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_ledger_date_idx" ON "budget_ledger" USING btree ("date");--> statement-breakpoint
CREATE INDEX "events_ts_idx" ON "events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "memories_embedding_hnsw_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memories_kind_idx" ON "memories" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "messages_ts_idx" ON "messages" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "messages_channel_idx" ON "messages" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "people_embedding_hnsw_idx" ON "people" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "psyche_snapshots_ts_idx" ON "psyche_snapshots" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "transcript_segments_meeting_idx" ON "transcript_segments" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "transcript_segments_embedding_hnsw_idx" ON "transcript_segments" USING hnsw ("embedding" vector_cosine_ops);