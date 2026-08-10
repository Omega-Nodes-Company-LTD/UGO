import { diaryEntries, messages, people, type DbClient } from "@ugo/db";
import {
  searchMemories,
  searchTranscripts,
  type EmbeddingsClient,
  type LlmClient,
  type LlmHistoryTurn,
  type RankedMemory,
} from "@ugo/memory";
import { decryptText, encryptText, type ChatRequest, type ChatResponse } from "@ugo/shared";
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { PsycheService } from "./psycheService.js";

/** top-k per channel (PROGETTO §5.4: k=6 casa, k=10 riunioni) */
const K_BY_CHANNEL = { home: 6, meeting: 10, api: 6 } as const;
const TRANSCRIPT_K = 3;
const HISTORY_TURNS = 8;
/**
 * Turns older than this never come back as "the conversation so far": a
 * thread from last month is memory's job, not the context window's.
 */
const HISTORY_WINDOW_HOURS = 12;
const DIARY_EXCERPT_CHARS = 300;

export class PersonNotFoundError extends Error {}

export interface ChatServiceDeps {
  db: DbClient;
  embedder: EmbeddingsClient;
  llm: LlmClient;
  psyche: PsycheService;
  dataKey: Buffer;
}

/** Blocks 3+4 of the §5.5 prompt order — dynamic, therefore NEVER cached. */
function buildDynamicSystem(
  view: { label: string; phrase: string },
  diary: { date: string; text: string } | undefined,
  retrieved: readonly RankedMemory[],
  recordings: readonly string[],
): string {
  const lines = [`Stato d'animo: ${view.label}. ${view.phrase}`];
  if (diary !== undefined) {
    lines.push(`Dal diario (${diary.date}): ${diary.text.slice(0, DIARY_EXCERPT_CHARS)}`);
  }
  lines.push(
    retrieved.length > 0
      ? `Ricordi pertinenti:\n${retrieved
          .map((memory) => `- (${memory.createdAt.toISOString().slice(0, 10)}) ${memory.text}`)
          .join("\n")}`
      : "Nessun ricordo pertinente.",
  );
  if (recordings.length > 0) {
    lines.push(`Dalle registrazioni:\n${recordings.map((text) => `- ${text}`).join("\n")}`);
  }
  return lines.join("\n");
}

export class ChatService {
  public constructor(private readonly deps: ChatServiceDeps) {}

  /**
   * The last turns of *this* conversation (§5.5 block 5).
   *
   * Scoped by person and by time: without it, a question from one person
   * arrives with somebody else's thread as context — UGO answering Paola
   * while reading Ivan's turns. Assistant replies have no person_id, so they
   * are matched by the window alone, which keeps each exchange intact.
   */
  private async loadHistory(
    channel: ChatRequest["channel"],
    personId: string | undefined,
    at: Date,
  ): Promise<LlmHistoryTurn[]> {
    const since = new Date(at.getTime() - HISTORY_WINDOW_HOURS * 3_600_000);
    const rows = await this.deps.db
      .select({ role: messages.role, text: messages.text, ts: messages.ts })
      .from(messages)
      .where(
        and(
          eq(messages.channel, channel),
          gte(messages.ts, since),
          personId === undefined
            ? or(isNull(messages.personId), sql`${messages.role} <> 'user'`)
            : or(eq(messages.personId, personId), sql`${messages.role} <> 'user'`),
        ),
      )
      .orderBy(desc(messages.ts), asc(messages.id))
      .limit(HISTORY_TURNS);
    return rows
      .reverse()
      .filter((row): row is typeof row & { role: "user" | "assistant" } =>
        ["user", "assistant"].includes(row.role),
      )
      .map((row) => ({ role: row.role, content: decryptText(row.text, this.deps.dataKey) }));
  }

  public async handle(request: ChatRequest, at: Date = new Date()): Promise<ChatResponse> {
    const { db, embedder, llm, psyche, dataKey } = this.deps;

    if (request.personId !== undefined) {
      const found = await db
        .select({ id: people.id })
        .from(people)
        .where(eq(people.id, request.personId));
      if (found.length === 0) throw new PersonNotFoundError(request.personId);
    }

    const view = await psyche.applyEventType("conversation_turn", at);
    const retrieved = await searchMemories(
      db,
      embedder,
      request.text,
      K_BY_CHANNEL[request.channel],
      at,
    );
    // recordings made "in giro" are interrogable through chat (§4.2)
    const transcripts = await searchTranscripts(db, embedder, request.text, TRANSCRIPT_K);
    const recordings: string[] = [];
    for (const segment of transcripts) {
      try {
        recordings.push(decryptText(segment.text, dataKey));
      } catch {
        // undecryptable segment (rotated key?): skip, never break the chat
      }
    }
    const diaryRows = await db
      .select({ date: diaryEntries.date, text: diaryEntries.text })
      .from(diaryEntries)
      .orderBy(desc(diaryEntries.date))
      .limit(1);

    const history = await this.loadHistory(request.channel, request.personId, at);
    const result = await llm.chat(
      {
        channel: request.channel,
        dynamicSystem: buildDynamicSystem(view, diaryRows[0], retrieved, recordings),
        history,
        userText: request.text,
      },
      at,
    );

    // biography is append-only and encrypted at rest (CLAUDE.md rule 6)
    await db.insert(messages).values([
      {
        ts: at,
        channel: request.channel,
        role: "user",
        personId: request.personId ?? null,
        text: encryptText(request.text, dataKey),
      },
      {
        ts: new Date(at.getTime() + 1),
        channel: request.channel,
        role: "assistant",
        text: encryptText(result.text, dataKey),
        tokensIn:
          (result.usage?.inputTokens ?? 0) +
          (result.usage?.cacheCreationInputTokens ?? 0) +
          (result.usage?.cacheReadInputTokens ?? 0),
        tokensOut: result.usage?.outputTokens ?? 0,
        costUsd: (result.costUsd ?? 0).toFixed(6),
      },
    ]);

    return {
      reply: result.text,
      moodLabel: view.label,
      memoriesUsed: retrieved.map((memory) => memory.id),
    };
  }

  /** Debug/CLI semantic search (GET /v1/memories/search). */
  public async search(query: string, k: number): Promise<RankedMemory[]> {
    return searchMemories(this.deps.db, this.deps.embedder, query, k);
  }

  /** exposed for tests asserting encrypted persistence */
  public async decryptedMessages(ids: string[]): Promise<string[]> {
    const rows = await this.deps.db
      .select({ text: messages.text })
      .from(messages)
      .where(inArray(messages.id, ids));
    return rows.map((row) => decryptText(row.text, this.deps.dataKey));
  }
}
