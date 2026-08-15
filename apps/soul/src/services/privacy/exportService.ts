import { decryptText } from "@ugo/shared";
import type { DbClient } from "@ugo/db";
import { sql } from "drizzle-orm";

/**
 * Right to portability (SECURITY_COMPLIANCE §3): every byte the system holds
 * about **one house** and its pack, decrypted, in a standard JSON structure.
 * Read-only by construction — it never writes, so it is safe to run anytime.
 *
 * Until ADR-019 phase 2 there was no `where` in this file at all: fourteen
 * queries that read the whole database and handed it over in the clear. On a
 * single-family install that was merely imprecise; with a neighbourhood it is
 * the worst thing the system could do, and it is written in raw SQL where a
 * missing filter does not show. Every query below is scoped, and an
 * integration test asserts that not one neighbour's id reaches the file.
 *
 * Two shapes of scope, because ADR-019 puts things in two places: what belongs
 * to the *house* filters on `household_id` directly, and what belongs to an
 * *exemplar* (memories, messages, mood — `gosino_id`) filters through the
 * house's exemplars.
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
  /** the reception (ADR-052): the house's customers, decrypted like the rest */
  customers: unknown[];
  customerGosini: unknown[];
  /** metadata only — the hash grants nothing, so not even that leaves */
  customerTokens: unknown[];
  tickets: unknown[];
  customerMessages: unknown[];
  /** ADR-054: sources as metadata (credentials NEVER leave), chunks decrypted */
  customerRepos: unknown[];
  customerDocuments: unknown[];
  customerMailAccounts: unknown[];
  customerChunks: unknown[];
  customerAnswerCache: unknown[];
}

const UNREADABLE = "[non decifrabile con la chiave corrente]";

export class ExportService {
  public constructor(
    private readonly db: DbClient,
    private readonly dataKey: Buffer,
  ) {}

  private decryptColumn(
    rows: Record<string, unknown>[],
    columns: readonly string[] = ["text"],
  ): Record<string, unknown>[] {
    return rows.map((row) => {
      const out = { ...row };
      for (const column of columns) {
        const value = out[column];
        if (typeof value !== "string" || value === "") continue;
        try {
          out[column] = decryptText(value, this.dataKey);
        } catch {
          out[column] = UNREADABLE;
        }
      }
      return out;
    });
  }

  /** @param householdId the one house this file is about — never "everything" */
  public async exportAll(householdId: string, at: Date = new Date()): Promise<ExportBundle> {
    const rows = async (query: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> =>
      this.db.execute(query);

    // the bridge for every table that carries only `gosino_id` (ADR-019: the
    // memories are the exemplar's, the pack is the house's)
    const exemplars = sql`select id from gosini where household_id = ${householdId}`;

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
      customers,
      customerGosini,
      customerTokens,
      tickets,
      customerMessages,
      customerRepos,
      customerDocuments,
      customerMailAccounts,
      customerChunks,
      customerAnswerCache,
    ] =
      await Promise.all([
        rows(sql`select id, display_name, aliases, notes, created_at from beings
                 where household_id = ${householdId} order by created_at`),
        rows(sql`select id, ts, channel, role, being_id, text, tokens_in, tokens_out, cost_usd
                 from messages where gosino_id in (${exemplars}) order by ts`),
        rows(sql`select id, kind, text, importance, last_accessed, source_refs, created_at
                 from memories where gosino_id in (${exemplars}) order by created_at`),
        rows(sql`select id, date, text, mood_summary from diary_entries
                 where gosino_id in (${exemplars}) order by date`),
        rows(sql`select id, text, status, due_hint, created_at from desires
                 where gosino_id in (${exemplars}) order by created_at`),
        rows(sql`select id, platform, title, started_at, ended_at, participants, audio_uri, status
                 from meetings where gosino_id in (${exemplars}) order by started_at nulls last`),
        // transcript_segments carries no tenant column of its own: it reaches
        // the house through its meeting (ADR-048 gives it one directly)
        rows(sql`select id, meeting_id, speaker, t0, t1, text from transcript_segments
                 where meeting_id in (select id from meetings where gosino_id in (${exemplars}))
                 order by meeting_id, t0`),
        rows(sql`select id, ts, source, type, payload from events
                 where gosino_id in (${exemplars}) order by ts`),
        rows(sql`select id, date, provider, model, tokens_in, tokens_out, cost_usd
                 from budget_ledger where household_id = ${householdId} order by date`),
        rows(sql`select id, ts, vars, label from psyche_snapshots
                 where gosino_id in (${exemplars}) order by ts`),
        rows(sql`select b.being_id, n.display_name, b.familiarity, b.affinity, b.last_seen_at,
                        b.interaction_count
                 from bonds b join beings n on n.id = b.being_id
                 where b.household_id = ${householdId} order by n.display_name`),
        rows(sql`select being_a, being_b, type, strength from relations
                 where household_id = ${householdId} order by type`),
        rows(sql`select id, being_id, about_being, signal, payload, created_at
                 from corrections where gosino_id in (${exemplars}) order by created_at`),
        // biometric payloads are deliberately NOT exported: a portability file
        // is a plaintext file, and a voiceprint in the clear is the one datum
        // this system exists to keep sealed (ADR-016). Metadata proves what
        // exists and can be erased; the centroid itself stays encrypted.
        rows(sql`select being_id, modality, model, dimensions, sample_count, updated_at
                 from recognition_profiles
                 where being_id in (select id from beings where household_id = ${householdId})
                 order by being_id`),
        rows(sql`select id, name, slug, notes, daily_budget_usd, hourly_message_limit,
                        knowledge_epoch, created_at, archived_at
                 from customers where household_id = ${householdId} order by created_at`),
        rows(sql`select customer_id, gosino_id, created_at from customer_gosini
                 where household_id = ${householdId} order by created_at`),
        rows(sql`select id, customer_id, label, created_at, last_used_at, expires_at, revoked_at
                 from customer_access_tokens
                 where household_id = ${householdId} order by created_at`),
        rows(sql`select id, customer_id, gosino_id, status, title, body,
                        created_at, updated_at, closed_at
                 from tickets where household_id = ${householdId} order by created_at`),
        rows(sql`select id, customer_id, gosino_id, ticket_id, ts, role, text,
                        tokens_in, tokens_out, cost_usd, cached
                 from customer_messages
                 where household_id = ${householdId} order by ts`),
        // credentials (pat) are deliberately NOT selected: a portability file
        // is plaintext, and a live credential has no business in one
        rows(sql`select id, customer_id, remote_url, default_branch, last_commit_sha,
                        last_indexed_at, status, created_at
                 from customer_repos where household_id = ${householdId} order by created_at`),
        rows(sql`select id, customer_id, s3_key, filename, mime, size_bytes, uploaded_at,
                        indexed_at, status
                 from customer_documents where household_id = ${householdId} order by uploaded_at`),
        rows(sql`select id, customer_id, imap_host, imap_port, username, folder,
                        last_uid, last_synced_at, status, created_at
                 from customer_mail_accounts
                 where household_id = ${householdId} order by created_at`),
        rows(sql`select id, customer_id, source_type, source_id, ref, text, created_at
                 from customer_chunks where household_id = ${householdId} order by created_at`),
        rows(sql`select id, customer_id, gosino_id, question_text, answer_text,
                        knowledge_epoch, created_at, expires_at
                 from customer_answer_cache
                 where household_id = ${householdId} order by created_at`),
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
      customers: this.decryptColumn(customers, ["notes"]),
      customerGosini,
      customerTokens,
      tickets: this.decryptColumn(tickets, ["title", "body"]),
      customerMessages: this.decryptColumn(customerMessages),
      customerRepos,
      customerDocuments: this.decryptColumn(customerDocuments, ["filename"]),
      customerMailAccounts,
      customerChunks: this.decryptColumn(customerChunks),
      customerAnswerCache: this.decryptColumn(customerAnswerCache, [
        "question_text",
        "answer_text",
      ]),
    };
  }
}
