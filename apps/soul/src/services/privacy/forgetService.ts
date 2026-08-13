import {
  beings,
  diaryEntries,
  events,
  gosini,
  meetings,
  memories,
  messages,
  recognitionProfiles,
  transcriptSegments,
  type DbClient,
} from "@ugo/db";
import type { EmbeddingsClient } from "@ugo/memory";
import { decryptText, encryptText } from "@ugo/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { REDACTION, buildRedactor, redactJson } from "./redaction.js";

/**
 * `ugo forget --being <id>` (PROGETTO §7, SECURITY_COMPLIANCE §3).
 * "Anonimizzazione irreversibile" taken literally: unlinking the FK is not
 * enough — the name also lives in message/transcript bodies, in memory texts
 * and in their embeddings. Erasure redacts every occurrence across the whole
 * biography (not only linked rows: names travel through other beings'
 * turns), re-embeds the affected memories, then deletes the being. What
 * survives is UGO's lived experience, no longer referable to anyone.
 *
 * ADR-019 phase 2 draws the boundary this was missing. Erasure used to scan
 * every message, transcript, memory, diary entry and event **in the database**
 * and rewrite whatever matched a name: with two families, forgetting a Marco
 * here would quietly redact a Marco next door. Now the house comes from the
 * being itself, and every scan stays inside it.
 *
 * Asking to erase a being of another house answers 404, not 403: an authorised
 * caller must not learn which ids exist elsewhere (SECURITY_COMPLIANCE §7,
 * BOLA).
 */

export class BeingNotFoundError extends Error {}
export interface ForgetDeps {
  db: DbClient;
  dataKey: Buffer;
  /** when provided, redacted memories are re-embedded (recommended) */
  embedder?: EmbeddingsClient;
}
export interface ForgetReport {
  beingId: string;
  messagesUnlinked: number;
  messagesRedacted: number;
  segmentsRedacted: number;
  speakersRedacted: number;
  memoriesRedacted: number;
  memoriesReEmbedded: number;
  diaryRedacted: number;
  eventsRedacted: number;
  biometricProfilesDestroyed: number;
}

export class ForgetService {
  public constructor(private readonly deps: ForgetDeps) {}

  /** The exemplars of one house: the bridge to every table keyed by `gosino_id`. */
  private exemplars(householdId: string) {
    return this.deps.db
      .select({ id: gosini.id })
      .from(gosini)
      .where(eq(gosini.householdId, householdId));
  }

  public async forgetBeing(
    beingId: string,
    householdId: string,
    at: Date = new Date(),
  ): Promise<ForgetReport> {
    const { db } = this.deps;
    const [being] = await db
      .select()
      .from(beings)
      .where(and(eq(beings.id, beingId), eq(beings.householdId, householdId)));
    // not found, on purpose, for a being that exists in another house
    if (being === undefined) throw new BeingNotFoundError(beingId);

    const redact = buildRedactor([being.displayName, ...being.aliases]);
    const report: ForgetReport = {
      beingId,
      messagesUnlinked: 0,
      messagesRedacted: 0,
      segmentsRedacted: 0,
      speakersRedacted: 0,
      memoriesRedacted: 0,
      memoriesReEmbedded: 0,
      diaryRedacted: 0,
      eventsRedacted: 0,
      biometricProfilesDestroyed: 0,
    };

    await this.redactMessages(redact, report, beingId, householdId);
    await this.redactSegments(redact, report, householdId);
    await this.redactMemories(redact, report, householdId);
    await this.redactDiaryAndEvents(redact, report, householdId);

    // The biometric profiles are the point of no return: a voiceprint is the
    // one datum that stays usable forever. They cascade with the being, but we
    // count them so the report can prove they are gone (ADR-016).
    const profiles = await db
      .select({ id: recognitionProfiles.id })
      .from(recognitionProfiles)
      .where(eq(recognitionProfiles.beingId, beingId));
    report.biometricProfilesDestroyed = profiles.length;

    // the being themselves: row, notes, embedding, bonds and profiles destroyed
    await db.delete(beings).where(eq(beings.id, beingId));

    // Audit trail with IDs and counts only — never the erased name (NIS2).
    // `events` is keyed by exemplar and an erasure is an act of the *house*, so
    // it lands on the house's oldest exemplar rather than on whichever one the
    // DEFAULT would have picked. Its proper home is `audit_log` (ADR-049).
    const [eldest] = await this.exemplars(householdId).orderBy(asc(gosini.bornAt)).limit(1);
    if (eldest === undefined) throw new Error(`household ${householdId} has no exemplar`);
    await db.insert(events).values({
      gosinoId: eldest.id,
      ts: at,
      source: "system",
      type: "being_forgotten",
      payload: {
        beingId,
        messagesRedacted: report.messagesRedacted,
        segmentsRedacted: report.segmentsRedacted,
        memoriesRedacted: report.memoriesRedacted,
        biometricProfilesDestroyed: report.biometricProfilesDestroyed,
      },
    });
    return report;
  }

  private async redactMessages(
    redact: (value: string) => string,
    report: ForgetReport,
    beingId: string,
    householdId: string,
  ): Promise<void> {
    const { db, dataKey } = this.deps;
    const rows = await db
      .select({ id: messages.id, text: messages.text, beingId: messages.beingId })
      .from(messages)
      .where(inArray(messages.gosinoId, this.exemplars(householdId)));
    for (const row of rows) {
      if (row.beingId === beingId) report.messagesUnlinked += 1;
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
    householdId: string,
  ): Promise<void> {
    const { db, dataKey } = this.deps;
    // transcript_segments has no tenant column of its own: it reaches the
    // house through its meeting (ADR-048 gives it one directly)
    const rows = await db
      .select({
        id: transcriptSegments.id,
        text: transcriptSegments.text,
        speaker: transcriptSegments.speaker,
      })
      .from(transcriptSegments)
      .where(
        inArray(
          transcriptSegments.meetingId,
          db
            .select({ id: meetings.id })
            .from(meetings)
            .where(inArray(meetings.gosinoId, this.exemplars(householdId))),
        ),
      );
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
    householdId: string,
  ): Promise<void> {
    const { db, embedder } = this.deps;
    const rows = await db
      .select({ id: memories.id, text: memories.text })
      .from(memories)
      .where(inArray(memories.gosinoId, this.exemplars(householdId)));
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
    householdId: string,
  ): Promise<void> {
    const { db } = this.deps;
    const diaryRows = await db
      .select({ id: diaryEntries.id, text: diaryEntries.text })
      .from(diaryEntries)
      .where(inArray(diaryEntries.gosinoId, this.exemplars(householdId)));
    for (const row of diaryRows) {
      const redacted = redact(row.text);
      if (redacted !== row.text) {
        await db.update(diaryEntries).set({ text: redacted }).where(eq(diaryEntries.id, row.id));
        report.diaryRedacted += 1;
      }
    }
    const eventRows = await db
      .select({ id: events.id, payload: events.payload })
      .from(events)
      .where(inArray(events.gosinoId, this.exemplars(householdId)));
    for (const row of eventRows) {
      const redacted = redactJson(row.payload, redact);
      if (JSON.stringify(redacted) !== JSON.stringify(row.payload)) {
        await db.update(events).set({ payload: redacted }).where(eq(events.id, row.id));
        report.eventsRedacted += 1;
      }
    }
  }
}
