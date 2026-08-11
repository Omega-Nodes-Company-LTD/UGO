import { customType } from "drizzle-orm/pg-core";

/**
 * Raw bytes. Used wherever the value is ciphertext and nothing else: biometric
 * centroids (ADR-016) and wrapped data keys (ADR-019). Never `text`, because
 * base64 would pay 33% on bytes that are already opaque.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * A Postgres full-text index vector. Only ever written by the database itself,
 * as a generated column, so nothing in TypeScript should be able to set it —
 * hence `never` on the write side.
 */
export const tsvector = customType<{ data: string; driverData: string; notNull: true }>({
  dataType: () => "tsvector",
});
