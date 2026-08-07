-- pgvector must exist before any vector(768) column or hnsw index is created.
-- Custom migration: drizzle-kit does not manage extensions.
CREATE EXTENSION IF NOT EXISTS vector;
