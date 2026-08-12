import { events, meetings, memories, messages, transcriptSegments, type DbClient } from "@ugo/db";
import { searchMemories, type EmbeddingsClient, type LlmClient } from "@ugo/memory";
import { decryptText, encryptText } from "@ugo/shared";
import { asc, count, eq } from "drizzle-orm";
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
  /**
   * Which creature goes to the meeting, and whose house pays (ADR-019 phase 2).
   * Every write here used to fall on the `DEFAULT`, so a second family's calls
   * were transcribed into the first one's biography.
   */
  gosinoId: string;
  /** ADR-046: `transcript_segments` carries the house on the row now */
  householdId: string;
  embedder: EmbeddingsClient;
  llm: LlmClient;
  dataKey: Buffer;
  vexa: VexaConfig;
  speakPort?: SpeakPort;
  /** structural type: avoids a circular import with PsycheService */
  psyche?: { applyEventType: (type: string, at?: Date) => Promise<unknown> };
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

/** How many segments of the call feed the closing digest. */
const DIGEST_SEGMENT_LIMIT = 200;

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
      .values({
        gosinoId: this.deps.gosinoId,
        platform,
        title: title ?? null,
        status: "live",
        startedAt: new Date(),
      })
      .returning({ id: meetings.id });
    const row = inserted[0];
    if (row === undefined) throw new Error("meeting insert returned no row");
    const ref = { meetingId: row.id, platform, nativeId };
    this.activeRefs.set(ref.meetingId, ref);
    return ref;
  }

  public async stop(ref: MeetingRef, at: Date = new Date()): Promise<void> {
    await this.vexaFetch(`/bots/${ref.platform}/${encodeURIComponent(ref.nativeId)}`, {
      method: "DELETE",
    });
    this.activeRefs.delete(ref.meetingId);
    await this.deps.db
      .update(meetings)
      .set({ status: "ended", endedAt: at })
      .where(eq(meetings.id, ref.meetingId));

    // a finished meeting is an experience, not just a closed row (§4.3):
    // it feeds curiosity and leaves a digest behind before the night job runs
    await this.deps.db.insert(events).values({
      gosinoId: this.deps.gosinoId,
      ts: at,
      source: "meet",
      type: "meeting_completed",
      payload: { meetingId: ref.meetingId },
    });
    await this.deps.psyche?.applyEventType("meeting_completed", at);
    await this.writeDigest(ref, at);
  }

  /**
   * Post-call digest (§4.3): the night job would eventually reflect on the
   * transcript, but by then the owner has already been asked "how did it
   * go?". A digest written at hangup is available immediately.
   */
  private async writeDigest(ref: MeetingRef, at: Date): Promise<void> {
    const rows = await this.deps.db
      .select({ speaker: transcriptSegments.speaker, text: transcriptSegments.text })
      .from(transcriptSegments)
      .where(eq(transcriptSegments.meetingId, ref.meetingId))
      .orderBy(asc(transcriptSegments.t0))
      .limit(DIGEST_SEGMENT_LIMIT);
    if (rows.length === 0) return; // nothing was said: nothing to remember

    const lines: string[] = [];
    for (const row of rows) {
      try {
        lines.push(`${row.speaker ?? "voce"}: ${decryptText(row.text, this.deps.dataKey)}`);
      } catch {
        continue;
      }
    }
    if (lines.length === 0) return;

    const [meeting] = await this.deps.db
      .select({ title: meetings.title })
      .from(meetings)
      .where(eq(meetings.id, ref.meetingId));
    const result = await this.deps.llm.chat(
      {
        channel: "meeting",
        dynamicSystem:
          "Riassumi la riunione appena conclusa in massimo 3 frasi, citando le decisioni e gli " +
          "action item. Scrivi in italiano, in terza persona, senza markdown.\n\n" +
          lines.join("\n"),
        userText: "Fammi il riassunto della riunione.",
      },
      at,
    );
    if (result.degraded || result.text.trim() === "") return;

    const title = meeting?.title ?? ref.nativeId;
    const digest = `Riunione "${title}" del ${at.toISOString().slice(0, 10)}: ${result.text}`;
    const [embedding] = await this.deps.embedder.embed([digest]);
    await this.deps.db.insert(memories).values({
      gosinoId: this.deps.gosinoId,
      kind: "insight",
      text: digest,
      ...(embedding !== undefined && { embedding }),
      importance: 0.7,
      sourceRefs: { meetingId: ref.meetingId },
    });
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
          householdId: this.deps.householdId,
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
      gosinoId: this.deps.gosinoId,
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
