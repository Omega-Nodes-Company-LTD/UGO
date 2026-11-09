import { sql } from "drizzle-orm";
import { index, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { accountId } from "./accounts.js";
import { customers } from "./customers.js";
import { gosinoId } from "./self.js";

export const PHONE_OUTCOMES = ["answered", "handover", "failed"] as const;

/**
 * Le chiamate a cui ha risposto un gosino (ADR-128). Solo i NUMERI della
 * chiamata: quanti turni, quanto è durata, quanto è costata, com'è finita.
 *
 * Niente parole, niente numero di telefono. Il chiamante sconosciuto non
 * lascia testo da nessuna parte (il contesto della chiamata vive in memoria e
 * muore con lei); quello riconosciuto lascia i suoi turni dove li lascia alla
 * reception, cifrati (regola 6). `call_ref` è lo SHA-256 del CallSid di
 * Twilio: basta per sommare i turni di una chiamata, e non apre il registro
 * di Twilio a chi ha solo il nostro database.
 */
export const phoneCalls = pgTable(
  "phone_calls",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    gosinoId: gosinoId(),
    callRef: text("call_ref").notNull(),
    /** il cliente della reception riconosciuto, se c'era */
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastTurnAt: timestamp("last_turn_at", { withTimezone: true }).notNull().defaultNow(),
    turns: integer("turns").notNull().default(0),
    handovers: integer("handovers").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    /** l'esito dell'ULTIMO turno: una chiamata finita a una persona è un handover */
    outcome: text("outcome", { enum: PHONE_OUTCOMES }).notNull().default("answered"),
  },
  (table) => [
    unique("phone_calls_account_ref_uq").on(table.accountId, table.callRef),
    index("phone_calls_account_started_idx").on(table.accountId, table.startedAt),
  ],
);
