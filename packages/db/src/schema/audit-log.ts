import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { households } from "./households.js";

/**
 * Chi ha fatto cosa (ADR-049).
 *
 * `events` fa da giornale della *creatura* — cosa le è successo, cosa ha
 * deciso — e la parola «audit» compariva solo nei commenti. Ma un giornale
 * della creatura non può rispondere alla domanda che NIS2 §2 pone davvero:
 * *chi* ha chiesto un sogno fuori orario, *chi* ha esportato la casa, *chi* ha
 * bussato con un token che non vale. `dream_requested` diceva che qualcuno
 * aveva chiesto un sogno; non chi. Un 401 non lasciava traccia in database.
 *
 * Sette colonne, e nessuna di più: **solo id e verbi** (scelta del
 * proprietario). Niente nomi, niente testo, niente payload libero — non per
 * pudore ma perché un audit log è la tabella che nessuno può cancellare, e
 * scriverci una PII significa scriverla per sempre. La regola 6 vale qui più
 * che altrove.
 *
 * Append-only, e non per convenzione: a `ugo_app` si concede `INSERT` e si
 * revocano `UPDATE` e `DELETE`. È ciò che il ruolo dedicato di ADR-048 rende
 * finalmente possibile — prima non esisteva un utente a cui negare qualcosa.
 * La retention è di dodici mesi e la applica `hygiene.py`, che gira come
 * proprietario delle tabelle: cancellare per scadenza è un atto della casa,
 * non dell'applicazione.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Nullable, ed è il caso che conta di più: un 401 avviene **prima** che si
     * sappia di che casa si tratti. Renderla obbligatoria vorrebbe dire non
     * poter registrare esattamente l'evento per cui un audit log esiste.
     */
    householdId: uuid("household_id").references(() => households.id),
    /**
     * Quale token, non quale segreto. Deliberatamente **senza** foreign key:
     * un token revocato o cancellato non deve portarsi via la propria scia, che
     * è precisamente ciò che si vorrebbe leggere dopo una revoca.
     */
    tokenId: uuid("token_id"),
    /** `owner`, `member`, `device`, `operator` — o null quando nessuno lo era */
    role: text("role"),
    /** l'atto: `export`, `forget`, `token_issued`, `dream_requested`, `denied` */
    verb: text("verb").notNull(),
    /** su cosa: `household`, `being`, `token`, `route` */
    resourceType: text("resource_type"),
    /** l'id della risorsa, o la rotta per un rifiuto. Mai un nome, mai un testo. */
    resourceId: text("resource_id"),
    /** `ok` | `denied` | `error` — un tentativo fallito è la riga più preziosa */
    outcome: text("outcome").notNull(),
  },
  (table) => [
    // le due letture reali: «cosa è successo in questa casa» e «cosa ha fatto
    // questo token», entrambe sempre in ordine di tempo
    index("audit_log_household_at_idx").on(table.householdId, table.at),
    index("audit_log_at_idx").on(table.at),
  ],
);

/** Gli esiti che una riga può portare. Tre, e bastano. */
export const AUDIT_OUTCOMES = ["ok", "denied", "error"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/** Per quanto si tiene una riga (scelta del proprietario: dodici mesi). */
export const AUDIT_RETENTION_DAYS = 365;
