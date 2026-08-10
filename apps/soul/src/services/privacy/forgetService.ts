import {
  diaryEntries,
  events,
  memories,
  messages,
  people,
  transcriptSegments,
  type DbClient,
} from "@ugo/db";
import type { EmbeddingsClient } from "@ugo/memory";
import { decryptText, encryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { REDACTION, buildRedactor, redactJson } from "./redaction.js";

/**
 * `ugo forget --person <id>` (PROGETTO §7, SECURITY_COMPLIANCE §3).
 * "Anonimizzazione irreversibile" taken literally: unlinking the FK is not
 * enough — the name also lives in message/transcript bodies, in memory texts
 * and in their embeddings. Erasure redacts every occurrence across the whole
 * biography (not only linked rows: names travel through other people's
 * turns), re-embeds the affected memories, then deletes the person. What
 * survives is UGO's lived experience, no longer referable to anyone.
 */

export class PersonNotFoundError extends Error {}
export interface ForgetDeps {
  db: DbClient;
  dataKey: Buffer;
  /** when provided, redacted memories are re-embedded (recommended) */
  embedder?: EmbeddingsClient;
}
export interface ForgetReport {
  personId: string;
  messagesUnlinked: number;
  messagesRedacted: number;
  segmentsRedacted: number;
  speakersRedacted: number;
  memoriesRedacted: number;
  memoriesReEmbedded: number;
  diaryRedacted: number;
  eventsRedacted: number;
}

export class ForgetService {
  public constructor(private readonly deps: ForgetDeps) {}

  public async forgetPerson(personId: string, at: Date = new Date()): Promise<ForgetReport> {
    const { db } = this.deps;
    const [person] = await db.select().from(people).where(eq(people.id, personId));
    if (person === undefined) throw new PersonNotFoundError(personId);

    const redact = buildRedactor([person.displayName, ...person.aliases]);
    const report: ForgetReport = {
      personId,
      messagesUnlinked: 0,
      messagesRedacted: 0,
      segmentsRedacted: 0,
      speakersRedacted: 0,
      memoriesRedacted: 0,
      memoriesReEmbedded: 0,
      diaryRedacted: 0,
      eventsRedacted: 0,
    };

    await this.redactMessages(redact, report, personId);
    await this.redactSegments(redact, report);
    await this.redactMemories(redact, report);
    await this.redactDiaryAndEvents(redact, report);

    // the person themselves: row, notes and face/voice embedding destroyed
    await db.delete(people).where(eq(people.id, personId));

    // audit trail with IDs and counts only — never the erased name (NIS2)
    await db.insert(events).values({
      ts: at,
      source: "system",
      type: "person_forgotten",
      payload: {
        personId,
        messagesRedacted: report.messagesRedacted,
        segmentsRedacted: report.segmentsRedacted,
        memoriesRedacted: report.memoriesRedacted,
      },
    });
    return report;
  }

  private async redactMessages(
    redact: (value: string) => string,
    report: ForgetReport,
    personId: string,
  ): Promise<void> {
    const { db, dataKey } = this.deps;
    const rows = await db
      .select({ id: messages.id, text: messages.text, personId: messages.personId })
      .from(messages);
    for (const row of rows) {
      if (row.personId === personId) report.messagesUnlinked += 1;
      let plain: string;
      try {
        plain = decryptText(row.text, dataKey);
      } catch {
        continue; // unreadable row (rotated key): nothing we can redact
      }
      const redacted = redact(plain);
      if (redacted !== plain) {
        await db
          .update(messages)
          .set({ text: encryptText(redacted, dataKey) })
          .where(eq(messages.id, row.id));
        report.messagesRedacted += 1;
      }
    }
  }

  private async redactSegments(
    redact: (value: string) => string,
    report: ForgetReport,
  ): Promise<void> {
    const { db, dataKey } = this.deps;
    const rows = await db
      .select({
        id: transcriptSegments.id,
        text: transcriptSegments.text,
        speaker: transcriptSegments.speaker,
      })
      .from(transcriptSegments);
    for (const row of rows) {
      const update: { text?: string; speaker?: string } = {};
      try {
        const plain = decryptText(row.text, dataKey);
        const redacted = redact(plain);
        if (redacted !== plain) {
          update.text = encryptText(redacted, dataKey);
          report.segmentsRedacted += 1;
        }
      } catch {
        // unreadable body: still scrub the speaker label below
      }
      if (row.speaker !== null && redact(row.speaker) !== row.speaker) {
        update.speaker = REDACTION;
        report.speakersRedacted += 1;
      }
      if (Object.keys(update).length > 0) {
        await db.update(transcriptSegments).set(update).where(eq(transcriptSegments.id, row.id));
      }
    }
  }

  private async redactMemories(
    redact: (value: string) => string,
    report: ForgetReport,
  ): Promise<void> {
    const { db, embedder } = this.deps;
    const rows = await db.select({ id: memories.id, text: memories.text }).from(memories);
    const toReEmbed: { id: string; text: string }[] = [];
    for (const row of rows) {
      const redacted = redact(row.text);
      if (redacted !== row.text) {
        await db.update(memories).set({ text: redacted }).where(eq(memories.id, row.id));
        report.memoriesRedacted += 1;
        toReEmbed.push({ id: row.id, text: redacted });
      }
    }
    // the old vector still encodes the removed name: recompute it
    if (embedder !== undefined && toReEmbed.length > 0) {
      const vectors = await embedder.embed(toReEmbed.map((item) => item.text));
      for (const [index, item] of toReEmbed.entries()) {
        await db.update(memories).set({ embedding: vectors[index] }).where(eq(memories.id, item.id));
        report.memoriesReEmbedded += 1;
      }
    }
  }

  private async redactDiaryAndEvents(
    redact: (value: string) => string,
    report: ForgetReport,
  ): Promise<void> {
    const { db } = this.deps;
    const diaryRows = await db
      .select({ id: diaryEntries.id, text: diaryEntries.text })
      .from(diaryEntries);
    for (const row of diaryRows) {
      const redacted = redact(row.text);
      if (redacted !== row.text) {
        await db.update(diaryEntries).set({ text: redacted }).where(eq(diaryEntries.id, row.id));
        report.diaryRedacted += 1;
      }
    }
    const eventRows = await db.select({ id: events.id, payload: events.payload }).from(events);
    for (const row of eventRows) {
      const redacted = redactJson(row.payload, redact);
      if (JSON.stringify(redacted) !== JSON.stringify(row.payload)) {
        await db.update(events).set({ payload: redacted }).where(eq(events.id, row.id));
        report.eventsRedacted += 1;
      }
    }
  }
}
