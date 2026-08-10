import { decryptText } from "@ugo/shared";
import type { DbClient } from "@ugo/db";
import { sql } from "drizzle-orm";

/**
 * Right to portability (SECURITY_COMPLIANCE §3): every byte the system holds
 * about the owner and their people, decrypted, in a standard JSON structure.
 * Read-only by construction — it never writes, so it is safe to run anytime.
 */

export interface ExportBundle {
  exportedAt: string;
  people: unknown[];
  messages: unknown[];
  memories: unknown[];
  diaryEntries: unknown[];
  desires: unknown[];
  meetings: unknown[];
  transcriptSegments: unknown[];
  events: unknown[];
  budgetLedger: unknown[];
  psycheSnapshots: unknown[];
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

    const [people, messages, memories, diary, desires, meetings, segments, events, ledger, snapshots] =
      await Promise.all([
        rows(sql`select id, display_name, aliases, notes, created_at from people order by created_at`),
        rows(sql`select id, ts, channel, role, person_id, text, tokens_in, tokens_out, cost_usd
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
      ]);

    return {
      exportedAt: at.toISOString(),
      people,
      messages: this.decryptColumn(messages),
      memories,
      diaryEntries: diary,
      desires,
      meetings,
      transcriptSegments: this.decryptColumn(segments),
      events,
      budgetLedger: ledger,
      psycheSnapshots: snapshots,
    };
  }
}
