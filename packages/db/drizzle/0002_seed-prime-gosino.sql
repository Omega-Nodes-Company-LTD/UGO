-- Custom migration: drizzle-kit generates schema, not data.
-- ADR-015 — every state table defaults gosino_id to this row, so it must
-- exist before the first insert or the FK would reject it. Idempotent.
INSERT INTO "gosini" ("id", "name", "location_label", "generation")
VALUES ('00000000-0000-4000-8000-000000000001', 'ugo-prime', 'casa', 0)
ON CONFLICT ("id") DO NOTHING;
