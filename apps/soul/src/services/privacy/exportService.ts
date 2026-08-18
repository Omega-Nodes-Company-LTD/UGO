import { decryptText, unwrapDataKey } from "@ugo/shared";
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
  /** ADR-058: le mele date dai clienti — solo id e istanti, com'è la riga */
  customerRewards: unknown[];
  /** ADR-060: i feed della casa e le novità scaricate — contenuto pubblico */
  rssFeeds: unknown[];
  feedItems: unknown[];
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
  /** ADR-089: la casa stessa, e tutto ciò che nessuno aveva mai portato fuori */
  household: unknown[];
  rooms: unknown[];
  placedProps: unknown[];
  propStock: unknown[];
  listItems: unknown[];
  checkins: unknown[];
  traitSets: unknown[];
  psycheBaselines: unknown[];
  actEfficacy: unknown[];
  births: unknown[];
  feedings: unknown[];
  adoptions: unknown[];
  /** ADR-092: i legami fra le case — le due parti, mai il vicinato intero */
  householdTies: unknown[];
  /**
   * ADR-092: le cartoline. Le RICEVUTE escono in chiaro (sono della casa);
   * delle SPEDITE esce la busta — il testo è cifrato con la chiave della
   * casa destinataria, e un export che potesse riaprirlo smentirebbe la
   * promessa fatta al momento dell'invio.
   */
  parcels: unknown[];
  /** senza il vettore: il fatto che qualcuno è passato, non il suo volto */
  perceptionEvents: unknown[];
  unknownPrints: unknown[];
  memoryBeings: unknown[];
  auditLog: unknown[];
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
          /**
           * Chiaro o cifrato, si esporta il testo che c'è. `memories` è
           * l'esempio: il sogno lo scrive in chiaro, il lascito cifrato — e
           * marcare «non decifrabile» una riga in chiaro sarebbe cancellarla
           * dall'export di chi la sta portando via.
           */
          out[column] = value.startsWith("v1:") ? UNREADABLE : value;
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
      customerRewards,
      rssFeeds,
      feedItems,
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
                        weekly_reward_limit, knowledge_epoch, created_at, archived_at
                 from customers where household_id = ${householdId} order by created_at`),
        rows(sql`select customer_id, gosino_id, created_at from customer_gosini
                 where household_id = ${householdId} order by created_at`),
        rows(sql`select id, customer_id, gosino_id, message_id, ts from customer_rewards
                 where household_id = ${householdId} order by ts`),
        rows(sql`select id, url, label, enabled, last_fetched_at, created_at from rss_feeds
                 where household_id = ${householdId} order by created_at`),
        rows(sql`select id, feed_id, guid, title, link, published_at, advised_at from feed_items
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

    /**
     * Il secondo giro (ADR-089).
     *
     * Queste tabelle esistevano e **non uscivano**: la casa stessa, le sue
     * stanze e come sono arredate, la spesa, le domande che UGO ha imparato a
     * fare, il genoma delle creature, chi è stato visto e quando. Il commento
     * in cima a questo file prometteva «ogni byte», e la promessa era vera nel
     * giorno in cui è stata scritta — poi sono arrivate diciassette tabelle e
     * nessuna di loro ha bussato qui. Da ADR-089 c'è un test che bussa al
     * posto loro.
     */
    const [
      household,
      rooms,
      placedProps,
      propStock,
      listItems,
      checkins,
      traitSets,
      psycheBaselines,
      actEfficacy,
      births,
      feedings,
      adoptions,
      householdTies,
      parcels,
      houseKeyRow,
      perceptionEvents,
      unknownPrints,
      memoryBeings,
      auditLog,
    ] = await Promise.all([
      rows(sql`select id, slug, name, kind, timezone, locale, daily_budget_usd, metabolism,
                      created_at
               from households where id = ${householdId}`),
      rows(sql`select id, name, slug, created_at from rooms
               where household_id = ${householdId} order by created_at`),
      rows(sql`select id, room_slug, kind, x, z, rot, created_at from placed_props
               where household_id = ${householdId} order by created_at`),
      rows(sql`select id, kind, remaining, refill_per_week, refilled_at from prop_stock
               where household_id = ${householdId} order by kind`),
      rows(sql`select id, list, text, done, being_id, at, done_at from list_items
               where household_id = ${householdId} order by at`),
      rows(sql`select id, gosino_id, question, hour, minute, weekday, enabled, last_asked_on,
                      created_at
               from checkins where gosino_id in (${exemplars}) order by created_at`),
      rows(sql`select id, gosino_id, version, traits, parent_trait_set_id, mutation_note,
                      created_at
               from trait_sets where household_id = ${householdId} order by created_at`),
      rows(sql`select gosino_id, variable, baseline, updated_at from psyche_baselines
               where gosino_id in (${exemplars}) order by gosino_id, variable`),
      rows(sql`select gosino_id, act, weight, updated_at from act_efficacy
               where gosino_id in (${exemplars}) order by gosino_id, act`),
      rows(sql`select id, child_gosino_id, parent_gosino_id, weight, born_at from births
               where household_id = ${householdId} order by born_at`),
      rows(sql`select id, gosino_id, kind, amount_usd, note, at from feedings
               where household_id = ${householdId} order by at`),
      rows(sql`select id, gosino_id, kennel_household_id, buyer_household_id, status,
                      price_cents, currency, chain_seq, reserved_at, paid_at, delivered_at,
                      cancelled_at
               from adoptions
               where kennel_household_id = ${householdId}
                  or buyer_household_id = ${householdId}
               order by reserved_at`),
      rows(sql`select id, from_household_id, to_household_id, label, from_being_id, to_being_id,
                      status, proposed_at, accepted_at, revoked_at
               from household_ties
               where from_household_id = ${householdId} or to_household_id = ${householdId}
               order by proposed_at`),
      rows(sql`select id, tie_id, from_household_id, to_household_id, from_gosino_id,
                      to_gosino_id, kind, text, status, created_at, delivered_at, kept_at
               from parcels
               where from_household_id = ${householdId} or to_household_id = ${householdId}
               order by created_at`),
      // la DEK della casa: le cartoline ricevute sono cifrate con LEI (ADR-092
      // §4), non con la chiave di processo che apre il resto dell'export
      rows(sql`select wrapped_data_key from households where id = ${householdId}`),
      /**
       * Chi è stato visto o sentito, e quando. Senza il vettore: un embedding
       * biometrico è la cosa che ADR-016 tiene cifrata in `bytea`, e
       * riversarlo in un JSON in chiaro sarebbe esportare il volto di una
       * persona invece del fatto che è passata. Stessa regola dei
       * `recognition_profiles`, che già escono senza centroidi.
       */
      rows(sql`select id, gosino_id, modality, being_id, candidate_being_id, confidence,
                      observed, occurred_at
               from perception_events where gosino_id in (${exemplars}) order by occurred_at`),
      rows(sql`select id, modality, model, dimensions, seen_count, first_seen_at, last_seen_at,
                      asked_at
               from unknown_prints where household_id = ${householdId} order by first_seen_at`),
      rows(sql`select memory_id, being_id from memory_beings
               where household_id = ${householdId} order by memory_id`),
      rows(sql`select id, at, role, verb, resource_type, resource_id, outcome from audit_log
               where household_id = ${householdId} order by at`),
    ]);

    return {
      exportedAt: at.toISOString(),
      beings,
      messages: this.decryptColumn(messages),
      memories: this.decryptColumn(memories),
      diaryEntries: this.decryptColumn(diary),
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
      customerRewards,
      rssFeeds,
      feedItems,
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
      household,
      rooms,
      placedProps,
      propStock,
      listItems: this.decryptColumn(listItems),
      checkins,
      traitSets,
      psycheBaselines,
      actEfficacy,
      births,
      feedings,
      adoptions,
      householdTies,
      parcels: this.openParcels(parcels, householdId, houseKeyRow),
      perceptionEvents,
      unknownPrints,
      memoryBeings,
      auditLog,
    };
  }

  /**
   * ADR-092: le cartoline ricevute si aprono con la DEK della casa; delle
   * spedite esce solo la busta — il testo appartiene alla casa destinataria,
   * e questo file non ha (né deve avere) la chiave per riaprirlo.
   */
  private openParcels(
    parcels: Record<string, unknown>[],
    householdId: string,
    houseKeyRow: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    let houseKey: Buffer | undefined;
    const wrapped = houseKeyRow[0]?.wrapped_data_key;
    if (wrapped != null) {
      try {
        houseKey = unwrapDataKey(wrapped as Buffer, this.dataKey);
      } catch {
        houseKey = undefined;
      }
    }
    return parcels.map((row) => {
      if (row.to_household_id !== householdId) {
        return { ...row, text: "[spedita: il testo è della casa destinataria]" };
      }
      const value = row.text;
      if (typeof value !== "string" || houseKey === undefined) return { ...row, text: UNREADABLE };
      try {
        return { ...row, text: decryptText(value, houseKey) };
      } catch {
        return { ...row, text: UNREADABLE };
      }
    });
  }
}
