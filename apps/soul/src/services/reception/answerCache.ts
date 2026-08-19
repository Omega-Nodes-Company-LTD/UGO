import { createHash } from "node:crypto";
import { customerAnswerCache, customers, type DbClient } from "@ugo/db";
import type { EmbeddingsClient } from "@ugo/memory";
import { decryptText, encryptText } from "@ugo/shared";
import { and, cosineDistance, eq, gt, sql } from "drizzle-orm";

/**
 * The third cost wall (ADR-055): the repeated question is the reception's
 * normal case, not abuse — it deserves an answer at zero provider cost.
 * Two tiers: exact hash of the normalized question, then semantic (local
 * Ollama, free) above a strict threshold. Entries die with their TTL or the
 * moment the knowledge epoch moves (ADR-054): a cached answer about
 * yesterday's code is worse than no answer.
 */

const SEMANTIC_THRESHOLD = 0.95;
const TTL_HOURS = 24;

export function normalizeQuestion(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function questionHash(text: string): string {
  return createHash("sha256").update(normalizeQuestion(text), "utf8").digest("hex");
}

export interface CacheKey {
  accountId: string;
  customerId: string;
  gosinoId: string;
}

export class AnswerCache {
  public constructor(
    private readonly db: DbClient,
    private readonly dataKey: Buffer,
    private readonly embedder?: EmbeddingsClient,
    /** ADR-098: la connessione della casa del cliente; assente = `db` */
    private readonly dbFor?: (accountId: string) => DbClient,
  ) {}

  private dbOf(accountId: string): DbClient {
    return this.dbFor?.(accountId) ?? this.db;
  }

  private async epochOf(db: DbClient, customerId: string): Promise<number> {
    const [row] = await db
      .select({ epoch: customers.knowledgeEpoch })
      .from(customers)
      .where(eq(customers.id, customerId));
    return row?.epoch ?? 0;
  }

  /** The cached reply, or undefined when the question deserves the provider. */
  public async lookup(key: CacheKey, question: string, at: Date = new Date()): Promise<string | undefined> {
    const db = this.dbOf(key.accountId);
    const epoch = await this.epochOf(db, key.customerId);
    const valid = and(
      eq(customerAnswerCache.customerId, key.customerId),
      eq(customerAnswerCache.gosinoId, key.gosinoId),
      eq(customerAnswerCache.knowledgeEpoch, epoch),
      gt(customerAnswerCache.expiresAt, at),
    );

    const [exact] = await db
      .select({ answer: customerAnswerCache.answerText })
      .from(customerAnswerCache)
      .where(and(valid, eq(customerAnswerCache.questionHash, questionHash(question))));
    if (exact !== undefined) return this.open(exact.answer);

    if (this.embedder === undefined) return undefined;
    const [embedding] = await this.embedder.embed([normalizeQuestion(question)]);
    if (embedding === undefined) return undefined;
    const distance = cosineDistance(customerAnswerCache.questionEmbedding, embedding);
    const [near] = await db
      .select({
        answer: customerAnswerCache.answerText,
        similarity: sql<number>`1 - (${distance})`,
      })
      .from(customerAnswerCache)
      .where(valid)
      .orderBy(distance)
      .limit(1);
    if (near !== undefined && near.similarity >= SEMANTIC_THRESHOLD) {
      return this.open(near.answer);
    }
    return undefined;
  }

  /** Remember a paid answer so its repetitions cost nothing. */
  public async store(
    key: CacheKey,
    question: string,
    answer: string,
    at: Date = new Date(),
  ): Promise<void> {
    if (this.embedder === undefined) return;
    const [embedding] = await this.embedder.embed([normalizeQuestion(question)]);
    if (embedding === undefined) return;
    const db = this.dbOf(key.accountId);
    const epoch = await this.epochOf(db, key.customerId);
    await db
      .insert(customerAnswerCache)
      .values({
        accountId: key.accountId,
        customerId: key.customerId,
        gosinoId: key.gosinoId,
        questionHash: questionHash(question),
        questionText: encryptText(normalizeQuestion(question), this.dataKey),
        questionEmbedding: embedding,
        answerText: encryptText(answer, this.dataKey),
        knowledgeEpoch: epoch,
        createdAt: at,
        expiresAt: new Date(at.getTime() + TTL_HOURS * 3_600_000),
      })
      .onConflictDoUpdate({
        target: [
          customerAnswerCache.customerId,
          customerAnswerCache.gosinoId,
          customerAnswerCache.questionHash,
        ],
        set: {
          answerText: encryptText(answer, this.dataKey),
          questionEmbedding: embedding,
          knowledgeEpoch: epoch,
          createdAt: at,
          expiresAt: new Date(at.getTime() + TTL_HOURS * 3_600_000),
        },
      });
  }

  private open(ciphertext: string): string | undefined {
    try {
      return decryptText(ciphertext, this.dataKey);
    } catch {
      return undefined;
    }
  }
}
