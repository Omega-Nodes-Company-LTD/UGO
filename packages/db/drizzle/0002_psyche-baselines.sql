CREATE TABLE "psyche_baselines" (
	"variable" text PRIMARY KEY NOT NULL,
	"baseline" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
