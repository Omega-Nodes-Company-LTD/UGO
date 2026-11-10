import { budgetLedger, type DbClient } from "@ugo/db";
import { z } from "zod";
import type { TokenUsage } from "./pricing.js";

/**
 * Il conteggio, da solo: si legge PRIMA e indipendentemente dal resto, perché
 * la spesa va segnata anche quando la forma del resto è cambiata sotto i piedi.
 */
const usageSchema = z.object({
  // gli embedding non hanno uscita, la trascrizione conta secondi e non token:
  // conta il costo, che c'è sempre
  prompt_tokens: z.number().default(0),
  completion_tokens: z.number().default(0),
  cost: z.number(),
  prompt_tokens_details: z
    .object({ cached_tokens: z.number().optional(), cache_write_tokens: z.number().optional() })
    .optional(),
});

export interface SpendRow {
  accountId: string;
  gosinoId: string;
  /** il giorno nel fuso della casa (ADR-050) */
  date: string;
  model: string;
}

export interface RecordedSpend {
  usage: TokenUsage;
  costUsd: number;
  /** false = usage illeggibile: riga scritta a zero, chi chiama lo dichiara */
  counted: boolean;
}

/** Funzione pura: cosa dichiara OpenRouter, letto senza fidarsi della forma. */
export function readUsage(payload: unknown): RecordedSpend {
  const counted = usageSchema.safeParse((payload as { usage?: unknown } | null)?.usage);
  // OpenRouter conta i token in cache DENTRO prompt_tokens: qui si separano,
  // perché il ledger li ha in colonne distinte e il conto non va fatto due volte
  const cacheRead = counted.success ? (counted.data.prompt_tokens_details?.cached_tokens ?? 0) : 0;
  const cacheWrite = counted.success
    ? (counted.data.prompt_tokens_details?.cache_write_tokens ?? 0)
    : 0;
  const usage: TokenUsage = {
    inputTokens: counted.success ? counted.data.prompt_tokens - cacheRead - cacheWrite : 0,
    outputTokens: counted.success ? counted.data.completion_tokens : 0,
    cacheCreationInputTokens: cacheWrite,
    cacheReadInputTokens: cacheRead,
  };
  // il costo lo dichiara chi incassa (ADR-125 §5): un listino copiato qui invecchia
  return { usage, costUsd: counted.success ? counted.data.cost : 0, counted: counted.success };
}

/**
 * Scrive la riga su `budget_ledger` per una chiamata OpenRouter GIÀ PAGATA
 * (regola 3). Si chiama prima di guardare la forma della risposta: se il
 * provider aggiunge un blocco inatteso, la spesa resta segnata lo stesso.
 */
export async function recordSpend(
  db: DbClient,
  payload: unknown,
  row: SpendRow,
): Promise<RecordedSpend> {
  const { usage, costUsd, counted } = readUsage(payload);
  await db.insert(budgetLedger).values({
    accountId: row.accountId,
    gosinoId: row.gosinoId,
    date: row.date,
    provider: "openrouter",
    model: row.model,
    tokensIn: usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens,
    tokensCacheWrite: usage.cacheCreationInputTokens,
    tokensCacheRead: usage.cacheReadInputTokens,
    tokensOut: usage.outputTokens,
    costUsd: costUsd.toFixed(6),
  });
  return { usage, costUsd, counted };
}
