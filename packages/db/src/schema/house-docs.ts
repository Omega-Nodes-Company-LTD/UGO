import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { customerSourceStatus } from "./enums.js";
import { accountId } from "./accounts.js";

/**
 * I documenti di casa (backlog gruppo 7, ADR-111).
 *
 * «UGO conosce solo ciò che ha sentito»: il libretto della caldaia, il
 * contratto della luce, il referto del veterinario esistono, e finché non
 * glieli si legge ad alta voce lui non li sa. La macchina per saperli è già
 * scritta — bucket privato, estrazione, finestre, embedding locale,
 * ciphertext, ricerca vettoriale — ma vive tutta dentro la reception, per i
 * clienti (ADR-054). Qui la stessa macchina serve la **casa**.
 *
 * Due tabelle e non una: il documento è la cosa che si carica e si butta, il
 * frammento è la cosa che si cerca. Tenerli insieme vorrebbe dire ricalcolare
 * gli embedding per rinominare un file.
 *
 * Perché NON si è riusata `customer_chunks` allargandola: là dentro lo scope è
 * `customer_id` e la reception ci legge sopra. Un documento di famiglia in
 * quella tabella sarebbe a un `where` di distanza dall'occhio di un cliente, e
 * quel `where` sarebbe l'unica cosa fra il referto del veterinario e uno
 * sconosciuto. Due tabelle, due muri.
 */

export const houseDocuments = pgTable(
  "house_documents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    /** chiave opaca nel bucket privato: mai il nome del file */
    s3Key: text("s3_key").notNull(),
    /** ciphertext AES-256-GCM: un nome di file è contenuto (regola 6) */
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    status: customerSourceStatus("status").notNull().default("pending"),
    lastError: text("last_error"),
  },
  (table) => [index("house_documents_account_idx").on(table.accountId)],
);

export const houseChunks = pgTable(
  "house_chunks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    documentId: uuid("document_id").notNull(),
    /** pagina o finestra: un identificatore, non contenuto */
    ref: text("ref").notNull(),
    /** ciphertext AES-256-GCM sotto la chiave di casa (regola 6) */
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("house_chunks_document_idx").on(table.documentId),
    index("house_chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
