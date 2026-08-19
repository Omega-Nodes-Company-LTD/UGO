import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { beings } from "./beings.js";
import { gosini } from "./gosini.js";
import { accounts } from "./accounts.js";

/**
 * La parentela fra le case (ADR-099): un legame proposto da una casa e vero
 * solo quando l'altra accetta. Seconda tabella a due case del progetto, sul
 * precedente di `adoptions` (ADR-084): la vedono le due parti, nessun altro.
 *
 * `beings`, `bonds` e `relations` non c'entrano e non cambiano: le loro FK
 * composite restano il muro di ADR-019. Qui non si lega un essere a un essere
 * — si lega una casa a una casa, e ciascun lato può al massimo indicare il
 * PROPRIO essere locale che rappresenta l'altra famiglia («nonno Sandro»
 * com'è nel nostro branco): un puntatore dentro casa propria, mai un accesso
 * a casa altrui.
 *
 * `label` è testo libero come le specie (ADR-014): «i nonni» non è un enum.
 * Lo stato è text + check e non un enum Postgres: la trappola di drizzle-kit
 * che non genera CREATE TYPE è già stata pagata due volte (v. accounts.kind).
 */
export const accountTies = pgTable(
  "account_ties",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** chi propone il legame */
    fromAccountId: uuid("from_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** chi lo riceve, e deve accettarlo perché esista */
    toAccountId: uuid("to_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** l'essere di casa MIA che rappresenta l'altra famiglia (facoltativo) */
    fromBeingId: uuid("from_being_id"),
    /** idem, visto dall'altra casa: lo compila lei, mai il proponente */
    toBeingId: uuid("to_being_id"),
    status: text("status").notNull().default("proposta"),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("account_ties_from_idx").on(table.fromAccountId),
    index("account_ties_to_idx").on(table.toAccountId),
    check("account_ties_status", sql`${table.status} in ('proposta', 'accettata', 'revocata')`),
    check("account_ties_no_self", sql`${table.fromAccountId} <> ${table.toAccountId}`),
    // ognuno indica un essere di casa PROPRIA: il puntatore non attraversa il muro
    foreignKey({
      name: "account_ties_from_being_fk",
      columns: [table.fromAccountId, table.fromBeingId],
      foreignColumns: [beings.accountId, beings.id],
    }),
    foreignKey({
      name: "account_ties_to_being_fk",
      columns: [table.toAccountId, table.toBeingId],
      foreignColumns: [beings.accountId, beings.id],
    }),
    // l'unicità della COPPIA, in qualunque verso, è un indice funzionale
    // least/greatest nella migrazione RLS scritta a mano: drizzle-kit non lo
    // modella, e due proposte incrociate non devono diventare due legami
  ],
);

/**
 * La cartolina (ADR-099): un messaggio o un ricordo, testo, un elemento per
 * volta, da una casa all'altra — e SOLO su azione esplicita di una persona.
 * L'unico scrittore è `ParcelService.send()`; né l'iniziativa né il sogno né
 * un job hanno il diritto di imbucare qualcosa, e una guardia sui sorgenti lo
 * tiene vero.
 *
 * `text` a riposo è cifrato con la DEK della casa DESTINATARIA: una cartolina
 * è di chi la riceve, e il mittente, dopo l'invio, non ha più un canale di
 * lettura — come una cartolina vera.
 *
 * Append-only per REVOKE (come `births`): l'unico UPDATE concesso dalla
 * policy è il passaggio di stato della consegna, lato destinatario.
 */
export const parcels = pgTable(
  "parcels",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tieId: uuid("tie_id")
      .notNull()
      .references(() => accountTies.id, { onDelete: "cascade" }),
    fromAccountId: uuid("from_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    toAccountId: uuid("to_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** quale esemplare l'ha spedita: il pannello lo chiede, mai «va il default» */
    fromGosinoId: uuid("from_gosino_id").notNull(),
    /** a quale esemplare è indirizzata; nullo = alla casa, deciderà lei */
    toGosinoId: uuid("to_gosino_id"),
    kind: text("kind").notNull(),
    /** ciphertext AES-256-GCM con la chiave della casa destinataria */
    text: text("text").notNull(),
    status: text("status").notNull().default("inviata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** quando il desiderio del gosino destinatario è stato scritto */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** ADR-099 §3: un ricordo ricevuto si può «tenere» — una volta sola */
    keptAt: timestamp("kept_at", { withTimezone: true }),
  },
  (table) => [
    index("parcels_from_idx").on(table.fromAccountId),
    index("parcels_to_idx").on(table.toAccountId),
    index("parcels_tie_idx").on(table.tieId),
    check("parcels_kind", sql`${table.kind} in ('messaggio', 'ricordo')`),
    check("parcels_status", sql`${table.status} in ('inviata', 'consegnata')`),
    // chi spedisce è un esemplare della casa mittente; chi riceve, se
    // nominato, uno della destinataria — le composite FK di ADR-019
    foreignKey({
      name: "parcels_from_gosino_fk",
      columns: [table.fromAccountId, table.fromGosinoId],
      foreignColumns: [gosini.accountId, gosini.id],
    }),
    foreignKey({
      name: "parcels_to_gosino_fk",
      columns: [table.toAccountId, table.toGosinoId],
      foreignColumns: [gosini.accountId, gosini.id],
    }),
  ],
);
