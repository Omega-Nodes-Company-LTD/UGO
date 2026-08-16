import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { gosini } from "./gosini.js";
import { householdId } from "./households.js";

/**
 * The customer (ADR-052): a tenant-adjacent entity of the house — not a fourth
 * access role (ADR-019 keeps its three), not a being of the pack (ADR-014).
 * A B2B client the studio works for, who talks to the house's gosini through
 * the reception (ADR-051) and never through any other door.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    /** panel label, plaintext like `beings.display_name` */
    name: text("name").notNull(),
    /** stable, human-typeable handle — used in URLs and the panel */
    slug: text("slug").notNull(),
    /** AES-256-GCM ciphertext under the household DEK (rule 6) */
    notes: text("notes"),
    /** null falls back to UGO_CUSTOMER_DAILY_BUDGET_USD (ADR-055) */
    dailyBudgetUsd: numeric("daily_budget_usd", { precision: 10, scale: 4 }),
    /** null falls back to UGO_CUSTOMER_HOURLY_MESSAGES (ADR-055) */
    hourlyMessageLimit: integer("hourly_message_limit"),
    /**
     * Quante mele può dare in sette giorni; null ricade su
     * UGO_CUSTOMER_WEEKLY_REWARDS (ADR-058). Il tetto è il punto: una mela del
     * cliente vale qualcosa solo perché ne ha poche — «gliele danno solo se
     * davvero fa bene l'assistente» è una decisione del proprietario, non una
     * taratura.
     */
    weeklyRewardLimit: integer("weekly_reward_limit"),
    /**
     * Bumped by every reindex of this customer's sources (ADR-054); the
     * answer cache (ADR-055) only serves entries minted at the same epoch.
     */
    knowledgeEpoch: integer("knowledge_epoch").notNull().default(0),
    /**
     * Il digest «a che punto siamo», pre-calcolato dal sogno (backlog
     * gruppo 8): ticket aperti, fonti e loro freschezza, in prosa
     * deterministica. AES-256-GCM sotto la DEK della casa (regola 6: dentro
     * ci sono titoli di ticket). La reception lo usa quando lo stato vivo di
     * GitHub non c'è — gratis anche a freddo, con la data accanto.
     */
    digest: text("digest"),
    digestAt: timestamp("digest_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("customers_household_idx").on(table.householdId),
    unique("customers_household_slug_uq").on(table.householdId, table.slug),
    // the target of the composite keys that pin a ticket to one house
    unique("customers_household_id_uq").on(table.householdId, table.id),
  ],
);

/**
 * Which exemplars a customer may talk to (ADR-052). The customer picks one of
 * these on every conversation — the personality stays the gosino's own, and
 * over time the stats say which one the customer keeps coming back to.
 */
/**
 * Le mele date dai clienti (ADR-058, il muro del cliente).
 *
 * Una riga per mela, **mai un contatore**: il limite settimanale si conta da
 * qui a ogni richiesta, con la stessa ragione dei muri di ADR-055 — un
 * contatore che si azzera al riavvio è un contatore che mente. La finestra è
 * mobile (sette giorni indietro), quindi non serve nessun azzeramento.
 *
 * `message_id` è facoltativo e senza FK: dice *quale risposta* ha meritato la
 * mela, per il triage del pannello, ma una risposta poi dimenticata dalla
 * ritenzione non deve portarsi via la mela dal conteggio.
 */
export const customerRewards = pgTable(
  "customer_rewards",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    customerId: uuid("customer_id").notNull(),
    gosinoId: uuid("gosino_id").notNull(),
    messageId: uuid("message_id"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // il conteggio della settimana è (customer, ts): questo indice È la quota
    index("customer_rewards_customer_ts_idx").on(table.customerId, table.ts),
    // both composite keys, like `customer_gosini`: a neighbour's customer or
    // gosino is structurally impossible, and the customer's oblivion (the
    // cascade) takes his apples with him
    foreignKey({
      columns: [table.householdId, table.customerId],
      foreignColumns: [customers.householdId, customers.id],
      name: "customer_rewards_household_customer_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.householdId, table.gosinoId],
      foreignColumns: [gosini.householdId, gosini.id],
      name: "customer_rewards_household_gosino_fk",
    }).onDelete("cascade"),
  ],
);

export const customerGosini = pgTable(
  "customer_gosini",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    customerId: uuid("customer_id").notNull(),
    gosinoId: uuid("gosino_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("customer_gosini_pair_uq").on(table.customerId, table.gosinoId),
    // both composite keys: assigning a neighbour's gosino — or a neighbour's
    // customer — is structurally impossible, not merely forbidden (ADR-019)
    foreignKey({
      columns: [table.householdId, table.customerId],
      foreignColumns: [customers.householdId, customers.id],
      name: "customer_gosini_household_customer_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.householdId, table.gosinoId],
      foreignColumns: [gosini.householdId, gosini.id],
      name: "customer_gosini_household_gosino_fk",
    }).onDelete("cascade"),
  ],
);
