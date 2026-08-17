import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { householdId } from "./households.js";
import { bytea } from "./types.js";

/**
 * The population (ADR-015): the exemplars themselves. A gosino is a character
 * — memories, mood, genome. What belongs to the *house* rather than to the
 * creature (clock, language, money, data key) lives in `households` (ADR-019),
 * because one house may hold more than one exemplar.
 */
export const gosini = pgTable(
  "gosini",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    name: text("name").notNull(),
    /** 'cucina', 'officina', 'camera' — where this exemplar lives */
    locationLabel: text("location_label"),
    deviceId: text("device_id").unique(),
    parentGosinoId: uuid("parent_gosino_id").references((): AnyPgColumn => gosini.id),
    generation: integer("generation").notNull().default(0),
    /**
     * The creature's cryptographic identity (ADR-020). The public key is what
     * another gosino verifies; the private key and the rotation secret are
     * ciphertext under the household's data key, like every other secret.
     */
    signingPublicKey: bytea("signing_public_key"),
    signingPrivateKey: bytea("signing_private_key"),
    rotationSecret: bytea("rotation_secret"),
    /** meeting other gosini is off until the owner turns it on, per exemplar */
    peerEncounters: boolean("peer_encounters").notNull().default(false),
    /**
     * La chiave della SUA interiorità (ADR-075), avvolta nella chiave dati
     * della casa — lo stesso schema di `households.wrapped_data_key`.
     *
     * Alla morte questo involucro viene azzerato, e da quel momento ciò che
     * era cifrato con quella chiave non è più leggibile **da nessuno**:
     * nemmeno da noi, nemmeno con un backup del database, perché la chiave
     * non era nel database — era avvolta qui dentro. È l'unico modo in cui
     * la morte di una creatura digitale non è teatro.
     *
     * Nullable per due ragioni diverse: gli esemplari nati prima di questo
     * ADR non ne hanno una (e i loro messaggi restano leggibili con la chiave
     * di casa, com'è sempre stato), e i morti non ne hanno più una.
     */
    wrappedSoulKey: bytea("wrapped_soul_key"),
    bornAt: timestamp("born_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Da quando corre l'arco della vita (ADR-077).
     *
     * `null` = non ancora mortale, ed è lo stato dei capostipiti nati prima di
     * quell'ADR: il pannello chiede al proprietario di accettare la mortalità,
     * e da quel giorno — **non dalla nascita** — comincia a contare. Applicare
     * l'orologio a ritroso vorrebbe dire creature già scadute il giorno di un
     * aggiornamento, che è la morte da bug che la visione vieta.
     *
     * Per chi nasce da qui in avanti vale `born_at`: la mortalità è parte
     * dell'atto di nascita, e chi adotta l'accetta adottando.
     */
    mortalFrom: timestamp("mortal_from", { withTimezone: true }),
    /**
     * ADR-077: il dado di QUESTO esemplare, in giorni, estratto una volta
     * sola — alla nascita, o il giorno in cui un capostipite accetta la
     * mortalità.
     *
     * Senza, la vita attesa sarebbe una funzione del genoma: due fratelli
     * della stessa cucciolata morirebbero lo stesso giorno, e chiunque
     * leggesse il gene nascosto avrebbe la data. Non negativo per
     * costruzione (la garanzia dei tre anni è un pavimento), piccolo per
     * scelta (il rumore non deve coprire la selezione).
     *
     * `null` = non ancora estratto, e vale zero: è lo stato dei capostipiti
     * finché non accettano.
     */
    lifeJitterDays: integer("life_jitter_days"),
    /** ADR-077: quando gli sono stati detti i sessanta giorni. Una volta sola. */
    deathNoticeAt: timestamp("death_notice_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (table) => [
    index("gosini_household_idx").on(table.householdId),
    // the target of the composite keys that pin a bond to one house
    unique("gosini_household_id_uq").on(table.householdId, table.id),
  ],
);

/**
 * The genome: immutable per version. A trait is never updated in place — a new
 * version is created declaring its parent, so where a character came from stays
 * inspectable. The mutation engine itself is deliberately out of scope.
 */
export const traitSets = pgTable(
  "trait_sets",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gosinoId: uuid("gosino_id")
      .notNull()
      .references(() => gosini.id, { onDelete: "cascade" }),
    /**
     * ADR-048: the house on the row. The genome belongs to the exemplar
     * (ADR-019), but a Row Level Security policy has to read the tenant
     * without a join — and the composite key below makes the pair impossible
     * to get wrong.
     */
    householdId: householdId(),
    version: integer("version").notNull(),
    // jsonb precisely because this is the field meant to change shape:
    // typed columns would mean a migration per new trait
    traits: jsonb("traits").notNull().default({}),
    parentTraitSetId: uuid("parent_trait_set_id").references((): AnyPgColumn => traitSets.id),
    mutationNote: text("mutation_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("trait_sets_gosino_version_uq").on(table.gosinoId, table.version),
    foreignKey({
      columns: [table.householdId, table.gosinoId],
      foreignColumns: [gosini.householdId, gosini.id],
      name: "trait_sets_household_gosino_fk",
    }).onDelete("cascade"),
  ],
);
