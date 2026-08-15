import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { customers } from "./customers.js";
import { customerSourceStatus, customerSourceType } from "./enums.js";
import { householdId } from "./households.js";

/**
 * What the gosino knows about a customer's work (ADR-054): three read-only
 * sources feeding one encrypted, vector-only index. Credentials (a GitHub
 * PAT, an IMAP password) are ciphertext under the data key, decrypted only
 * in-process by the sync jobs, never logged.
 */

export const customerRepos = pgTable(
  "customer_repos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    customerId: uuid("customer_id").notNull(),
    remoteUrl: text("remote_url").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    /** AES-256-GCM ciphertext; empty = public repository */
    pat: text("pat"),
    lastCommitSha: text("last_commit_sha"),
    lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
    status: customerSourceStatus("status").notNull().default("pending"),
    /** an error CODE, never free text: rule 6 applies to errors too */
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_repos_customer_idx").on(table.customerId),
    foreignKey({
      columns: [table.householdId, table.customerId],
      foreignColumns: [customers.householdId, customers.id],
      name: "customer_repos_household_customer_fk",
    }).onDelete("cascade"),
  ],
);

export const customerDocuments = pgTable(
  "customer_documents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    customerId: uuid("customer_id").notNull(),
    /** opaque object key in the private docs bucket */
    s3Key: text("s3_key").notNull(),
    /** AES-256-GCM ciphertext: a filename is content (rule 6) */
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    status: customerSourceStatus("status").notNull().default("pending"),
    lastError: text("last_error"),
  },
  (table) => [
    index("customer_documents_customer_idx").on(table.customerId),
    foreignKey({
      columns: [table.householdId, table.customerId],
      foreignColumns: [customers.householdId, customers.id],
      name: "customer_documents_household_customer_fk",
    }).onDelete("cascade"),
  ],
);

export const customerMailAccounts = pgTable(
  "customer_mail_accounts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    customerId: uuid("customer_id").notNull(),
    imapHost: text("imap_host").notNull(),
    imapPort: integer("imap_port").notNull().default(993),
    username: text("username").notNull(),
    /** AES-256-GCM ciphertext; read-only access, SMTP does not exist (ADR-054) */
    password: text("password").notNull(),
    folder: text("folder").notNull().default("INBOX"),
    /** the IMAP UID high-water mark: only newer messages are fetched */
    lastUid: integer("last_uid").notNull().default(0),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    status: customerSourceStatus("status").notNull().default("pending"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_mail_accounts_customer_idx").on(table.customerId),
    foreignKey({
      columns: [table.householdId, table.customerId],
      foreignColumns: [customers.householdId, customers.id],
      name: "customer_mail_accounts_household_customer_fk",
    }).onDelete("cascade"),
  ],
);

/**
 * The knowledge index (ADR-054): text encrypted, embedding beside it,
 * retrieval vector-only — the lexical arm is deliberately sacrificed to
 * rule 6, the exact `transcript_segments` precedent. `ref` stays plaintext
 * because it is an identifier (path@sha, message-id), never content.
 */
export const customerChunks = pgTable(
  "customer_chunks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    customerId: uuid("customer_id").notNull(),
    sourceType: customerSourceType("source_type").notNull(),
    /** the row id in the source's own table */
    sourceId: uuid("source_id").notNull(),
    /** path@sha / RFC822 message-id / page — identifiers, not content */
    ref: text("ref").notNull(),
    /** AES-256-GCM ciphertext under the data key (rule 6) */
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_chunks_customer_idx").on(table.customerId),
    index("customer_chunks_source_idx").on(table.sourceId),
    index("customer_chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    foreignKey({
      columns: [table.householdId, table.customerId],
      foreignColumns: [customers.householdId, customers.id],
      name: "customer_chunks_household_customer_fk",
    }).onDelete("cascade"),
  ],
);
