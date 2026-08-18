import { sql } from "drizzle-orm";
import { foreignKey, index, pgTable, real, timestamp, uuid } from "drizzle-orm/pg-core";
import { gosini } from "./gosini.js";
import { householdId } from "./households.js";
import { bytea } from "./types.js";

/**
 * The lineage, N-ary (ADR-069): one row per parent of a birth. The litter can
 * be polyparental (ADR-068), so `gosini.parent_gosino_id` — a single column —
 * keeps carrying the first parent for everything that reads it today, while
 * this table is the complete truth the pedigree will anchor to.
 *
 * `parent_gosino_id` deliberately does NOT cascade: a living child's genealogy
 * must not vanish with its parent's row.
 */
export const births = pgTable(
  "births",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    childGosinoId: uuid("child_gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    parentGosinoId: uuid("parent_gosino_id")
      .notNull()
      .references(() => gosini.id),
    /** polyparental contribution weight (equal until the API exposes it) */
    weight: real("weight").notNull().default(1),
    /**
     * The pedigree (ADR-070): this parent's Ed25519 signature over the birth
     * certificate, and the public key that made it. The key rides along with
     * the signature — never read from `gosini` at verification time — so a
     * certificate stays verifiable offline even if the parent later rotates
     * keys or is retired. Null on births from before ADR-070: `unsigned`, not
     * invalid.
     */
    signature: bytea("signature"),
    parentPublicKey: bytea("parent_public_key"),
    bornAt: timestamp("born_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("births_household_idx").on(table.householdId),
    index("births_child_idx").on(table.childGosinoId),
    index("births_parent_idx").on(table.parentGosinoId),
    // both ends of the edge must live in the same house as the row (ADR-048)
    foreignKey({
      columns: [table.householdId, table.childGosinoId],
      foreignColumns: [gosini.householdId, gosini.id],
      name: "births_household_child_fk",
    }).onDelete("cascade"),
    /**
     * ADR-082: il **genitore no**.
     *
     * La coppia composita c'era per la stessa ragione di quella sul figlio —
     * ogni riga vive nella casa dei suoi capi (ADR-048) — ma diceva anche una
     * cosa che non è vera: che un genitore debba abitare dove è nato suo
     * figlio. È il contrario di ciò che accade quando si compra un cucciolo da
     * un allevamento, e impediva a un riproduttore di essere ceduto finché
     * aveva figli in casa. Resta il vincolo semplice: il genitore deve
     * esistere.
     */
    foreignKey({
      columns: [table.parentGosinoId],
      foreignColumns: [gosini.id],
      name: "births_parent_fk",
    }),
  ],
);
