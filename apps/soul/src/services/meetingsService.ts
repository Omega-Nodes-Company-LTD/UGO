import { meetings, messages, transcriptSegments, type DbClient } from "@ugo/db";
import { searchMemories, type EmbeddingsClient, type LlmClient } from "@ugo/memory";
import { encryptText } from "@ugo/shared";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

/**
 * Meetings body (PROGETTO §4.3, ADR-004) on the REAL Vexa open-core v0.12
 * contract: POST /bots to join, GET /transcripts/{platform}/{id} polled for
 * live segments, DELETE /bots/{platform}/{id} to leave. WebSocket multiplex
 * and in-call TTS are upstream-pending — see ADR-013.
 */

const SPEAK_RATE_LIMIT_MS = 2 * 60_000; // max 1 intervento / 2 min (§4.3)

export interface VexaConfig {
  baseUrl: string;
  apiKey: string;
  /** display name: `UGO 🐾 appunti di <nome>` */
  ownerName: string;
}

export interface SpeakPort {
  speak(meetingRef: MeetingRef, text: string): Promise<void>;
}

export interface MeetingRef {
  meetingId: string;
  platform: string;
  nativeId: string;
}

const transcriptsResponseSchema = z.object({
  segments: z
    .array(
      z.object({
        speaker: z.string().nullish(),
        start: z.number().nullish(),
        end: z.number().nullish(),
        text: z.string(),
      }),
    )
    .default([]),
});

export function parseMeetingUrl(rawUrl: string): { platform: string; nativeId: string } {
  const url = new URL(rawUrl);
  if (url.hostname === "meet.google.com") {
    const nativeId = url.pathname.replaceAll("/", "");
    if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(nativeId)) {
      throw new Error("unrecognized Google Meet code");
    }
    return { platform: "google_meet", nativeId };
  }
  if (url.hostname.endsWith("teams.microsoft.com")) {
    const match = /meetup-join\/([^/]+)/.exec(url.pathname);
    if (match?.[1] === undefined) throw new Error("unrecognized Teams meeting url");
    return { platform: "teams", nativeId: decodeURIComponent(match[1]) };
  }
  throw new Error("unsupported meeting platform");
}

export interface MeetingsDeps {
  db: DbClient;
  embedder: EmbeddingsClient;
  llm: LlmClient;
  dataKey: Buffer;
  vexa: VexaConfig;
  speakPort?: SpeakPort;
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

export class MeetingsService {
  private ingestedCounts = new Map<string, number>();
  private lastSpokeAt = new Map<string, number>();
  private activeRefs = new Map<string, MeetingRef>();

  public constructor(private readonly deps: MeetingsDeps) {}

  /** live meetings currently polled by the loop in index.ts */
  public active(): MeetingRef[] {
    return [...this.activeRefs.values()];
  }

  public async pollAll(at: Date = new Date()): Promise<void> {
    for (const ref of this.activeRefs.values()) {
      await this.pollOnce(ref, at);
    }
  }

  private async vexaFetch(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    headers.set("x-api-key", this.deps.vexa.apiKey);
    return fetch(new URL(path, this.deps.vexa.baseUrl), {
      ...init,
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  }

  public async join(rawUrl: string, title?: string): Promise<MeetingRef> {
    const { platform, nativeId } = parseMeetingUrl(rawUrl);
    const response = await this.vexaFetch("/bots", {
      method: "POST",
      body: JSON.stringify({
        platform,
        native_meeting_id: nativeId,
        bot_name: `UGO 🐾 appunti di ${this.deps.vexa.ownerName}`,
      }),
    });
    if (!response.ok) throw new Error(`vexa join failed (status ${String(response.status)})`);
    const inserted = await this.deps.db
      .insert(meetings)
      .values({ platform, title: title ?? null, status: "live", startedAt: new Date() })
      .returning({ id: meetings.id });
    const row = inserted[0];
    if (row === undefined) throw new Error("meeting insert returned no row");
    const ref = { meetingId: row.id, platform, nativeId };
    this.activeRefs.set(ref.meetingId, ref);
    return ref;
  }

  public async stop(ref: MeetingRef): Promise<void> {
    await this.vexaFetch(`/bots/${ref.platform}/${encodeURIComponent(ref.nativeId)}`, {
      method: "DELETE",
    });
    this.activeRefs.delete(ref.meetingId);
    await this.deps.db
      .update(meetings)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(meetings.id, ref.meetingId));
  }

  /** One polling round: ingest only the new tail of the full transcript. */
  public async pollOnce(ref: MeetingRef, at: Date = new Date()): Promise<number> {
    const response = await this.vexaFetch(
      `/transcripts/${ref.platform}/${encodeURIComponent(ref.nativeId)}`,
    );
    if (!response.ok) return 0;
    const { segments } = transcriptsResponseSchema.parse(await response.json());

    let ingested = this.ingestedCounts.get(ref.meetingId);
    if (ingested === undefined) {
      const [row] = await this.deps.db
        .select({ n: count() })
        .from(transcriptSegments)
        .where(eq(transcriptSegments.meetingId, ref.meetingId));
      ingested = row?.n ?? 0;
    }
    const fresh = segments.slice(ingested).filter((segment) => segment.text.trim() !== "");
    if (fresh.length > 0) {
      const vectors = await this.deps.embedder.embed(fresh.map((segment) => segment.text));
      await this.deps.db.insert(transcriptSegments).values(
        fresh.map((segment, index) => ({
          meetingId: ref.meetingId,
          speaker: segment.speaker ?? null,
          t0: segment.start ?? 0,
          t1: segment.end ?? segment.start ?? 0,
          text: encryptText(segment.text, this.deps.dataKey),
          embedding: vectors[index],
        })),
      );
      for (const segment of fresh) {
        await this.maybeAnswer(ref, segment.text, at);
      }
    }
    this.ingestedCounts.set(ref.meetingId, segments.length);
    return fresh.length;
  }

  /** Voice trigger (§4.3): name + question, rate-limited, k=10 retrieval. */
  private async maybeAnswer(ref: MeetingRef, text: string, at: Date): Promise<void> {
    const mentionsBot = /\bugo\b/i.test(text);
    const asksSomething = text.includes("?");
    if (!mentionsBot || !asksSomething) return;
    const last = this.lastSpokeAt.get(ref.meetingId) ?? 0;
    if (at.getTime() - last < SPEAK_RATE_LIMIT_MS) return;
    this.lastSpokeAt.set(ref.meetingId, at.getTime());

    const retrieved = await searchMemories(this.deps.db, this.deps.embedder, text, 10, at);
    const result = await this.deps.llm.chat(
      {
        channel: "meeting",
        dynamicSystem:
          retrieved.length > 0
            ? `Ricordi pertinenti:\n${retrieved.map((memory) => `- ${memory.text}`).join("\n")}`
            : "Nessun ricordo pertinente.",
        userText: text,
      },
      at,
    );
    await this.deps.db.insert(messages).values({
      ts: at,
      channel: "meeting",
      role: "assistant",
      text: encryptText(result.text, this.deps.dataKey),
      tokensOut: result.usage?.outputTokens ?? 0,
      costUsd: (result.costUsd ?? 0).toFixed(6),
    });
    if (this.deps.speakPort !== undefined) {
      await this.deps.speakPort.speak(ref, result.text);
    } else {
      // in-call TTS is upstream-pending (ADR-013): recorded, not spoken
      this.deps.logger?.warn({ meetingId: ref.meetingId }, "speak unavailable in Vexa open-core");
    }
  }
}
