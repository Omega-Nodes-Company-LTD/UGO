import { PRIME_ACCOUNT_ID, PRIME_GOSINO_ID, type DbClient } from "@ugo/db";
import { EMBEDDING_DIMENSIONS } from "@ugo/shared";
import { z } from "zod";
import { DEFAULT_PROVIDERS, OPENROUTER_URL } from "./chatRequest.js";
import type { EmbeddingsClient } from "./embeddings.js";
import { recordSpend } from "./ledger.js";

/**
 * Gli embedding via OpenRouter (ADR-131): servito da Azure dentro l'elenco
 * chiuso dei fornitori, a 768 dimensioni come prima — lo schema non cambia.
 * Lo stesso modello e le stesse dimensioni stanno in `ops/jobs`, o i vettori
 * del sogno e quelli della chat non sarebbero confrontabili.
 */
export const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small";

const embeddingsResponseSchema = z.object({
  data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
});

export interface OpenRouterEmbeddingsOptions {
  db: DbClient;
  apiKey: string;
  model?: string;
  providers?: readonly string[];
  accountId?: string;
  gosinoId?: string;
  timezone?: string;
  timeoutMs?: number;
}

/**
 * Segnato sul registro, ma NON fermato dal tetto del giorno — scelta
 * dichiarata in ADR-131: costa circa un millesimo di un turno di chat, e
 * fermarlo trasformerebbe la degradazione dichiarata («ho finito le parole»)
 * in un 500, perché ogni turno cerca nei ricordi prima di rispondere.
 */
export class OpenRouterEmbeddingsClient implements EmbeddingsClient {
  private readonly model: string;

  public constructor(private readonly options: OpenRouterEmbeddingsOptions) {
    this.model = options.model ?? DEFAULT_EMBED_MODEL;
  }

  public async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const providers = this.options.providers ?? DEFAULT_PROVIDERS;
    const response = await fetch(new URL("/api/v1/embeddings", OPENROUTER_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
        provider: {
          order: [...providers],
          only: [...providers],
          allow_fallbacks: true,
          zdr: true,
          data_collection: "deny",
        },
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
      throw new Error(`embeddings request failed with status ${String(response.status)}`);
    }
    const payload: unknown = await response.json();
    await recordSpend(this.options.db, payload, {
      accountId: this.options.accountId ?? PRIME_ACCOUNT_ID,
      gosinoId: this.options.gosinoId ?? PRIME_GOSINO_ID,
      date: new Intl.DateTimeFormat("en-CA", {
        timeZone: this.options.timezone ?? "Europe/Rome",
      }).format(new Date()),
      model: this.model,
    });
    const { data } = embeddingsResponseSchema.parse(payload);
    if (data.length !== texts.length) {
      throw new Error("embeddings count does not match input count");
    }
    const ordered = [...data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
    for (const vector of ordered) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `expected ${String(EMBEDDING_DIMENSIONS)}-dim embeddings, got ${String(vector.length)}`,
        );
      }
    }
    return ordered;
  }
}
