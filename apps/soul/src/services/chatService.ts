import { beings, desires, diaryEntries, messages, type DbClient } from "@ugo/db";
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
import type { PackService } from "./packService.js";
import { buildPackPrompt } from "./packPrompt.js";
import type { PsycheService } from "./psycheService.js";
import { confirmReminder, parseReminder } from "./volition/reminders.js";

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

export class BeingNotFoundError extends Error {}

export interface ChatServiceDeps {
  db: DbClient;
  embedder: EmbeddingsClient;
  llm: LlmClient;
  psyche: PsycheService;
  dataKey: Buffer;
  /** the pack block of the prompt (ADR-014); absent = no pack context */
  pack?: PackService;
  /** the household's clock (ADR-019); defaults to the project timezone */
  timezone?: string;
  /**
   * ADR-032: whose memories, whose thread, whose diary. Two exemplars in one
   * house share the pack and the data key, and share nothing else.
   *
   * Obbligatorio da ADR-048 tempo 2: finché il `DEFAULT` esisteva, ometterlo
   * scriveva sull'esemplare seminato **invece di fallire**.
   */
  gosinoId: string;
}

/** Blocks 3+4 of the §5.5 prompt order — dynamic, therefore NEVER cached. */
function buildDynamicSystem(
  now: string,
  view: { label: string; phrase: string },
  diary: { date: string; text: string } | undefined,
  retrieved: readonly RankedMemory[],
  recordings: readonly string[],
  pack: string | undefined,
): string {
  // the clock goes in the DYNAMIC block and nowhere else: interpolating a time
  // into a cached block would break the cache on every single call (§5.5)
  const lines = [`Adesso è ${now}.`, `Stato d'animo: ${view.label}. ${view.phrase}`];
  // the pack comes before the memories: who is in the room decides how a
  // recollection should be said, not the other way round
  if (pack !== undefined && pack !== "") lines.push(pack);
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
   * Scopes a query to this exemplar. It used to be allowed to answer
   * `undefined` — «casa con un esemplare solo» — and an `undefined` inside an
   * `and()` disappears, so that branch was a query across every creature on
   * the server. ADR-048 tempo 2 removes the branch with the column DEFAULT
   * that justified it.
   */
  private mine(column: { gosinoId: unknown }): ReturnType<typeof eq> {
    return eq(column.gosinoId as never, this.deps.gosinoId);
  }

  /**
   * The wall clock in the household's timezone (ADR-028).
   *
   * Until now UGO did not know what time it was — not a small gap for someone
   * who is asked "ricordami fra dieci minuti" and who goes to sleep when it
   * gets dark.
   */
  private wallClock(at: Date): { hour: number; minute: number; text: string } {
    const tz = this.deps.timezone ?? "Europe/Rome";
    try {
      return this.formatClock(at, tz);
    } catch {
      // a bad timezone, or an ICU build without the Italian locale, must not
      // be able to swallow a reply: he loses the date, not his voice
      return {
        hour: at.getHours(),
        minute: at.getMinutes(),
        text: at.toISOString().slice(11, 16),
      };
    }
  }

  private formatClock(at: Date, tz: string): { hour: number; minute: number; text: string } {
    const parts = new Intl.DateTimeFormat("it-IT", {
      timeZone: tz,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error("unusable clock");
    return {
      // some ICU builds render midnight as "24": the rest of the system
      // expects 0..23, and an out-of-range hour silently breaks quiet hours
      hour: hour % 24,
      minute,
      text: `${get("weekday")} ${get("day")} ${get("month")}, ore ${get("hour")}:${get("minute")}`,
    };
  }

  /**
   * The last turns of *this* conversation (§5.5 block 5).
   *
   * Scoped by being and by time: without it, a question from one being
   * arrives with somebody else's thread as context — UGO answering Paola
   * while reading Ivan's turns. Assistant replies have no being_id, so they
   * are matched by the window alone, which keeps each exchange intact.
   */
  private async loadHistory(
    channel: ChatRequest["channel"],
    beingId: string | undefined,
    at: Date,
  ): Promise<LlmHistoryTurn[]> {
    const since = new Date(at.getTime() - HISTORY_WINDOW_HOURS * 3_600_000);
    const rows = await this.deps.db
      .select({ role: messages.role, text: messages.text, ts: messages.ts })
      .from(messages)
      .where(
        and(
          this.mine(messages),
          eq(messages.channel, channel),
          gte(messages.ts, since),
          beingId === undefined
            ? or(isNull(messages.beingId), sql`${messages.role} <> 'user'`)
            : or(eq(messages.beingId, beingId), sql`${messages.role} <> 'user'`),
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

  /**
   * Who is in the room, as prompt text. Only the beings we can actually name
   * are listed; an unrecognized presence becomes an explicit "do not guess".
   */
  private async packBlock(
    beingId: string | undefined,
    channel: ChatRequest["channel"],
  ): Promise<string | undefined> {
    const { pack } = this.deps;
    if (pack === undefined) return undefined;
    const present = await pack.present(beingId === undefined ? [] : [beingId]);
    const ids = present.map((being) => being.id);
    return buildPackPrompt({
      self: await pack.self(),
      present,
      relations: await pack.relationsAmong(ids),
      speciesRules: pack.speciesRules(present),
      corrections: await pack.recentCorrections(ids),
      // only at home does an unnamed speaker mean "somebody is here and I do
      // not know who": on the API channel it just means nobody said
      unidentifiedPresent: beingId === undefined && channel === "home",
    });
  }

  public async handle(request: ChatRequest, at: Date = new Date()): Promise<ChatResponse> {
    const { db, embedder, llm, psyche, dataKey } = this.deps;

    // ADR-028: «ricordami di buttare l'acqua alle 13» is a fixed shape in a
    // fixed language. It is answered here, before the provider is ever
    // reached: instant, and it costs nothing. A reminder is filed as a desire
    // with a clock on it, and initiative voices it when the moment comes.
    const wall = this.wallClock(at);
    const reminder = parseReminder(request.text, wall.hour, wall.minute);
    if (reminder !== undefined) {
      await db.insert(desires).values({
        text: reminder.task,
        status: "pending",
        dueAt: new Date(at.getTime() + reminder.inMinutes * 60_000),
        gosinoId: this.deps.gosinoId,
      });
      const reply = confirmReminder(reminder);
      // the exchange still goes into the biography, encrypted like every other
      const owner = { gosinoId: this.deps.gosinoId };
      await db.insert(messages).values([
        {
          ...owner,
          ts: at,
          channel: request.channel,
          role: "user",
          beingId: request.beingId ?? null,
          text: encryptText(request.text, dataKey),
        },
        {
          ...owner,
          ts: new Date(at.getTime() + 1),
          channel: request.channel,
          role: "assistant",
          text: encryptText(reply, dataKey),
        },
      ]);
      return { reply, moodLabel: psyche.current(at).label, memoriesUsed: [] };
    }

    if (request.beingId !== undefined) {
      const found = await db
        .select({ id: beings.id })
        .from(beings)
        .where(eq(beings.id, request.beingId));
      if (found.length === 0) throw new BeingNotFoundError(request.beingId);
    }

    const view = await psyche.applyEventType("conversation_turn", at);
    const retrieved = await searchMemories(
      db,
      embedder,
      request.text,
      K_BY_CHANNEL[request.channel],
      at,
      this.deps.gosinoId,
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
      .where(this.mine(diaryEntries))
      .orderBy(desc(diaryEntries.date))
      .limit(1);

    const history = await this.loadHistory(request.channel, request.beingId, at);
    const result = await llm.chat(
      {
        channel: request.channel,
        dynamicSystem: buildDynamicSystem(
          wall.text,
          view,
          diaryRows[0],
          retrieved,
          recordings,
          await this.packBlock(request.beingId, request.channel),
        ),
        history,
        userText: request.text,
      },
      at,
    );

    // biography is append-only and encrypted at rest (CLAUDE.md rule 6)
    const owner = { gosinoId: this.deps.gosinoId };
    await db.insert(messages).values([
      {
        ...owner,
        ts: at,
        channel: request.channel,
        role: "user",
        beingId: request.beingId ?? null,
        text: encryptText(request.text, dataKey),
      },
      {
        ...owner,
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
