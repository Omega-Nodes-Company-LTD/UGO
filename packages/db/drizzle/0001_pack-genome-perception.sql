CREATE TYPE "public"."being_kind" AS ENUM('resident', 'visitor', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."correction_signal" AS ENUM('too_loud', 'leave_alone', 'good', 'wrong_name');--> statement-breakpoint
CREATE TYPE "public"."desire_status" AS ENUM('pending', 'done', 'expired');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('face', 'nano', 'ear', 'meet', 'system');--> statement-breakpoint
CREATE TYPE "public"."memory_kind" AS ENUM('fact', 'preference', 'episode', 'insight');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('home', 'meeting', 'api');--> statement-breakpoint
CREATE TYPE "public"."recognition_modality" AS ENUM('voice', 'face', 'visual', 'tag', 'manual');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('parent_of', 'partner_of', 'cares_for', 'avoids');--> statement-breakpoint
CREATE TABLE "beings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"species" text DEFAULT 'human' NOT NULL,
	"kind" "being_kind" DEFAULT 'resident' NOT NULL,
	"arrival_at" date,
	"is_minor" boolean DEFAULT false NOT NULL,
	"no_vision" boolean DEFAULT false NOT NULL,
	"no_audio" boolean DEFAULT false NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid NOT NULL,
	"being_id" uuid NOT NULL,
	"familiarity" real DEFAULT 0 NOT NULL,
	"affinity" real DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"interaction_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bonds_gosino_being_uq" UNIQUE("gosino_id","being_id"),
	CONSTRAINT "bonds_familiarity_range" CHECK ("bonds"."familiarity" between 0 and 1),
	CONSTRAINT "bonds_affinity_range" CHECK ("bonds"."affinity" between -1 and 1)
);
--> statement-breakpoint
CREATE TABLE "budget_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_cache_write" integer DEFAULT 0 NOT NULL,
	"tokens_cache_read" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid NOT NULL,
	"being_id" uuid,
	"about_being" uuid,
	"signal" "correction_signal" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"text" text NOT NULL,
	"status" "desire_status" DEFAULT 'pending' NOT NULL,
	"due_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"date" date NOT NULL,
	"text" text NOT NULL,
	"mood_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "diary_entries_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "event_source" NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gosini" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location_label" text,
	"device_id" text,
	"parent_gosino_id" uuid,
	"generation" integer DEFAULT 0 NOT NULL,
	"born_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "gosini_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
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
	"gosino_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"kind" "memory_kind" NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768),
	"importance" real DEFAULT 0.5 NOT NULL,
	"last_accessed" timestamp with time zone,
	"source_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_beings" (
	"memory_id" uuid NOT NULL,
	"being_id" uuid NOT NULL,
	CONSTRAINT "memory_beings_pk" UNIQUE("memory_id","being_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" "message_channel" NOT NULL,
	"role" text NOT NULL,
	"being_id" uuid,
	"text" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perception_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid NOT NULL,
	"modality" text NOT NULL,
	"being_id" uuid,
	"candidate_being_id" uuid,
	"confidence" real,
	"observed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psyche_baselines" (
	"gosino_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"variable" text NOT NULL,
	"baseline" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psyche_baselines_gosino_id_variable_pk" PRIMARY KEY("gosino_id","variable")
);
--> statement-breakpoint
CREATE TABLE "psyche_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"vars" jsonb NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recognition_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"being_id" uuid NOT NULL,
	"modality" "recognition_modality" NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"payload" "bytea" NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recognition_profiles_being_modality_uq" UNIQUE("being_id","modality")
);
--> statement-breakpoint
CREATE TABLE "relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"being_a" uuid NOT NULL,
	"being_b" uuid NOT NULL,
	"type" "relation_type" NOT NULL,
	"strength" real DEFAULT 1 NOT NULL,
	CONSTRAINT "relations_pair_type_uq" UNIQUE("being_a","being_b","type"),
	CONSTRAINT "relations_no_self_link" CHECK ("relations"."being_a" <> "relations"."being_b"),
	CONSTRAINT "relations_symmetric_normalized" CHECK ("relations"."type" not in ('partner_of') or "relations"."being_a" < "relations"."being_b")
);
--> statement-breakpoint
CREATE TABLE "trait_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gosino_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"traits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parent_trait_set_id" uuid,
	"mutation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trait_sets_gosino_version_uq" UNIQUE("gosino_id","version")
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
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_being_id_beings_id_fk" FOREIGN KEY ("being_id") REFERENCES "public"."beings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_being_id_beings_id_fk" FOREIGN KEY ("being_id") REFERENCES "public"."beings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_about_being_beings_id_fk" FOREIGN KEY ("about_being") REFERENCES "public"."beings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desires" ADD CONSTRAINT "desires_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gosini" ADD CONSTRAINT "gosini_parent_gosino_id_gosini_id_fk" FOREIGN KEY ("parent_gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_beings" ADD CONSTRAINT "memory_beings_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_beings" ADD CONSTRAINT "memory_beings_being_id_beings_id_fk" FOREIGN KEY ("being_id") REFERENCES "public"."beings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_being_id_beings_id_fk" FOREIGN KEY ("being_id") REFERENCES "public"."beings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_events" ADD CONSTRAINT "perception_events_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_events" ADD CONSTRAINT "perception_events_being_id_beings_id_fk" FOREIGN KEY ("being_id") REFERENCES "public"."beings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_events" ADD CONSTRAINT "perception_events_candidate_being_id_beings_id_fk" FOREIGN KEY ("candidate_being_id") REFERENCES "public"."beings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psyche_baselines" ADD CONSTRAINT "psyche_baselines_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psyche_snapshots" ADD CONSTRAINT "psyche_snapshots_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition_profiles" ADD CONSTRAINT "recognition_profiles_being_id_beings_id_fk" FOREIGN KEY ("being_id") REFERENCES "public"."beings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_being_a_beings_id_fk" FOREIGN KEY ("being_a") REFERENCES "public"."beings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_being_b_beings_id_fk" FOREIGN KEY ("being_b") REFERENCES "public"."beings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trait_sets" ADD CONSTRAINT "trait_sets_gosino_id_gosini_id_fk" FOREIGN KEY ("gosino_id") REFERENCES "public"."gosini"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trait_sets" ADD CONSTRAINT "trait_sets_parent_trait_set_id_trait_sets_id_fk" FOREIGN KEY ("parent_trait_set_id") REFERENCES "public"."trait_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beings_embedding_hnsw_idx" ON "beings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "beings_species_idx" ON "beings" USING btree ("species");--> statement-breakpoint
CREATE INDEX "bonds_gosino_idx" ON "bonds" USING btree ("gosino_id");--> statement-breakpoint
CREATE INDEX "budget_ledger_date_idx" ON "budget_ledger" USING btree ("date");--> statement-breakpoint
CREATE INDEX "corrections_gosino_created_idx" ON "corrections" USING btree ("gosino_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_ts_idx" ON "events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "memories_embedding_hnsw_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memories_kind_idx" ON "memories" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "memory_beings_being_idx" ON "memory_beings" USING btree ("being_id");--> statement-breakpoint
CREATE INDEX "messages_ts_idx" ON "messages" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "messages_channel_idx" ON "messages" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "perception_events_gosino_occurred_idx" ON "perception_events" USING btree ("gosino_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "perception_events_being_idx" ON "perception_events" USING btree ("being_id");--> statement-breakpoint
CREATE INDEX "psyche_snapshots_ts_idx" ON "psyche_snapshots" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "relations_being_a_idx" ON "relations" USING btree ("being_a");--> statement-breakpoint
CREATE INDEX "relations_being_b_idx" ON "relations" USING btree ("being_b");--> statement-breakpoint
CREATE INDEX "transcript_segments_meeting_idx" ON "transcript_segments" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "transcript_segments_embedding_hnsw_idx" ON "transcript_segments" USING hnsw ("embedding" vector_cosine_ops);