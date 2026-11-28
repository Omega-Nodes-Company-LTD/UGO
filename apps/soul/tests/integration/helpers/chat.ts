import { randomBytes } from "node:crypto";
import type { DbClient } from "@ugo/db";
import { openRouterKey } from "@ugo/factories";
import { DEFAULT_CHAT_MODEL, LlmClient, OpenRouterEmbeddingsClient } from "@ugo/memory";
import { ChatService } from "../../../src/services/chatService.js";
import { characterFrom } from "../../../src/services/council/character.js";
import type { PsycheService } from "../../../src/services/psycheService.js";

/**
 * Una chat vera per UNA creatura: modello e embedding veri (ADR-125/131),
 * database vero. Chi la usa dice di chi è, come in produzione.
 */
export function chatFor(
  db: DbClient,
  who: { gosinoId: string; accountId: string },
  psyche: PsycheService,
  dataKey: Buffer = randomBytes(32),
): ChatService {
  return new ChatService({
    gosinoId: who.gosinoId,
    accountId: who.accountId,
    character: characterFrom({}),
    db,
    embedder: new OpenRouterEmbeddingsClient({ db, apiKey: openRouterKey() }),
    llm: new LlmClient({
      db,
      apiKey: openRouterKey(),
      model: DEFAULT_CHAT_MODEL,
      dailyBudgetUsd: 5,
      accountId: who.accountId,
      gosinoId: who.gosinoId,
    }),
    psyche,
    dataKey,
  });
}
