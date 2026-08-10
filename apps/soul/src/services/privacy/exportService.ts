import { decryptText } from "@ugo/shared";
import type { DbClient } from "@ugo/db";
import { sql } from "drizzle-orm";

/**
 * Right to portability (SECURITY_COMPLIANCE §3): every byte the system holds
 * about the owner and their pack, decrypted, in a standard JSON structure.
 * Read-only by construction — it never writes, so it is safe to run anytime.
 */

export interface ExportBundle {
  exportedAt: string;
  beings: unknown[];
  messages: unknown[];
  memories: unknown[];
  diaryEntries: unknown[];
  desires: unknown[];
  meetings: unknown[];
  transcriptSegments: unknown[];
  events: unknown[];
  budgetLedger: unknown[];
  psycheSnapshots: unknown[];
  bonds: unknown[];
  relations: unknown[];
  corrections: unknown[];
  /** metadata only — see the query for why the centroids stay behind */
  recognitionProfiles: unknown[];
}

const UNREADABLE = "[non decifrabile con la chiave corrente]";

export class ExportService {
  public constructor(
    private readonly db: DbClient,
    private readonly dataKey: Buffer,
  ) {}

  private decryptColumn(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map((row) => {
      const value = row.text;
      if (typeof value !== "string") return row;
      try {
        return { ...row, text: decryptText(value, this.dataKey) };
      } catch {
        return { ...row, text: UNREADABLE };
      }
    });
  }

  public async exportAll(at: Date = new Date()): Promise<ExportBundle> {
    const rows = async (query: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> =>
      this.db.execute(query);

    const [
      beings,
      messages,
      memories,
      diary,
      desires,
      meetings,
      segments,
      events,
      ledger,
      snapshots,
      bonds,
      relations,
      corrections,
      recognitionProfiles,
    ] =
      await Promise.all([
        rows(sql`select id, display_name, aliases, notes, created_at from beings order by created_at`),
        rows(sql`select id, ts, channel, role, being_id, text, tokens_in, tokens_out, cost_usd
                 from messages order by ts`),
        rows(sql`select id, kind, text, importance, last_accessed, source_refs, created_at
                 from memories order by created_at`),
        rows(sql`select id, date, text, mood_summary from diary_entries order by date`),
        rows(sql`select id, text, status, due_hint, created_at from desires order by created_at`),
        rows(sql`select id, platform, title, started_at, ended_at, participants, audio_uri, status
                 from meetings order by started_at nulls last`),
        rows(sql`select id, meeting_id, speaker, t0, t1, text from transcript_segments
                 order by meeting_id, t0`),
        rows(sql`select id, ts, source, type, payload from events order by ts`),
        rows(sql`select id, date, provider, model, tokens_in, tokens_out, cost_usd
                 from budget_ledger order by date`),
        rows(sql`select id, ts, vars, label from psyche_snapshots order by ts`),
        rows(sql`select b.being_id, n.display_name, b.familiarity, b.affinity, b.last_seen_at,
                        b.interaction_count
                 from bonds b join beings n on n.id = b.being_id order by n.display_name`),
        rows(sql`select being_a, being_b, type, strength from relations order by type`),
        rows(sql`select id, being_id, about_being, signal, payload, created_at
                 from corrections order by created_at`),
        // biometric payloads are deliberately NOT exported: a portability file
        // is a plaintext file, and a voiceprint in the clear is the one datum
        // this system exists to keep sealed (ADR-016). Metadata proves what
        // exists and can be erased; the centroid itself stays encrypted.
        rows(sql`select being_id, modality, model, dimensions, sample_count, updated_at
                 from recognition_profiles order by being_id`),
      ]);

    return {
      exportedAt: at.toISOString(),
      beings,
      messages: this.decryptColumn(messages),
      memories,
      diaryEntries: diary,
      desires,
      meetings,
      transcriptSegments: this.decryptColumn(segments),
      events,
      budgetLedger: ledger,
      psycheSnapshots: snapshots,
      bonds,
      relations,
      corrections,
      recognitionProfiles,
    };
  }
}
