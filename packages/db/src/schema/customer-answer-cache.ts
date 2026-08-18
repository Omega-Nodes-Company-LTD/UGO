import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { customers } from "./customers.js";
import { gosini } from "./gosini.js";
import { accountId } from "./accounts.js";

/**
 * The third cost wall (ADR-055): a repeated question deserves an answer, not
 * a refusal — at zero provider cost. Per customer AND per gosino: the reply
 * stays in the voice of the exemplar that gave it. Every entry carries the
 * `knowledge_epoch` it was minted at; a reindex (ADR-054) strands the whole
 * lot, because an answer about yesterday's code is worse than no answer.
 */
export const customerAnswerCache = pgTable(
  "customer_answer_cache",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    customerId: uuid("customer_id").notNull(),
    gosinoId: uuid("gosino_id").notNull(),
    /** hex SHA-256 of the normalized question */
    questionHash: text("question_hash").notNull(),
    /** AES-256-GCM ciphertext (rule 6) */
    questionText: text("question_text").notNull(),
    questionEmbedding: vector("question_embedding", {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    /** AES-256-GCM ciphertext (rule 6) */
    answerText: text("answer_text").notNull(),
    knowledgeEpoch: integer("knowledge_epoch").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("customer_answer_cache_question_uq").on(
      table.customerId,
      table.gosinoId,
      table.questionHash,
    ),
    index("customer_answer_cache_customer_idx").on(table.customerId),
    index("customer_answer_cache_embedding_hnsw_idx").using(
      "hnsw",
      table.questionEmbedding.op("vector_cosine_ops"),
    ),
    foreignKey({
      columns: [table.accountId, table.customerId],
      foreignColumns: [customers.accountId, customers.id],
      name: "customer_answer_cache_account_customer_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.accountId, table.gosinoId],
      foreignColumns: [gosini.accountId, gosini.id],
      name: "customer_answer_cache_account_gosino_fk",
    }).onDelete("cascade"),
  ],
);
