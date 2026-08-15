import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { householdId } from "./households.js";

/**
 * Gli arredi: cosa c'è nella stanza, e quanti ne restano da mettere (ADR-056).
 *
 * Due tabelle e non una, perché sono due domande diverse:
 *
 * - `placed_props` — **dov'è** un oggetto adesso. Riga per oggetto piazzato;
 * - `prop_stock` — **quanti** ne ha ancora questa casa. Riga per tipo.
 *
 * Il *catalogo* non è né l'una né l'altra: sta in `packages/shared/props.ts`,
 * perché una riga di database che nomina un arredo che il corpo non sa
 * disegnare è un modo di rompere le cose che non serve a niente. Qui si
 * conserva solo ciò che davvero varia da casa a casa.
 *
 * `text` più `check` e **non** un enum di Postgres: STATE §7 registra già la
 * trappola pagata due volte — drizzle-kit non genera `CREATE TYPE`, quindi una
 * migrazione con un enum nuovo sembra giusta e fallisce sul database vero.
 */

/**
 * I tipi ammessi, ripetuti qui in SQL.
 *
 * È una duplicazione di `PROP_KINDS`, ed è voluta: il vincolo deve vivere nel
 * database, o «kind» diventa una colonna di testo libero in cui prima o poi
 * finisce un refuso che nessuno vede finché il muso non disegna il vuoto. Il
 * test che le tiene allineate sta in `props.integration.test.ts`.
 */
const KINDS = ["cushion", "grass", "bush", "ball", "trough"] as const;

export const placedProps = pgTable(
  "placed_props",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    /**
     * Lo slug della stanza, non il suo id.
     *
     * È la stessa scelta che ADR-039 ha già fatto per `gosini.location_label`:
     * lo slug **è** l'indirizzo (`/?stanza=cucina`), e sostituirlo con un id
     * significherebbe che il proprietario non lo vede mai più. Chi scrive
     * valida contro `rooms`, come fanno già nascite e traslochi.
     */
    roomSlug: text("room_slug").notNull(),
    kind: text("kind").notNull(),
    /** normalizzate in [-1,1]: il recinto vero lo dimensiona il muso */
    x: real("x").notNull(),
    z: real("z").notNull(),
    rot: real("rot").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("placed_props_household_room_idx").on(table.householdId, table.roomSlug),
    check("placed_props_kind", sql`${table.kind} in ('cushion','grass','bush','ball','trough')`),
    check("placed_props_x_range", sql`${table.x} between -1 and 1`),
    check("placed_props_z_range", sql`${table.z} between -1 and 1`),
    check("placed_props_rot_range", sql`${table.rot} between -3.15 and 3.15`),
  ],
);

/**
 * Le scorte.
 *
 * Il proprietario ha chiesto che in casa siano infinite e che ai clienti ne
 * tocchino poche a settimana, «così da premiare solo le risposte davvero
 * ottime». Qui c'è la forma che regge entrambi i casi senza decidere per il
 * ramo che i clienti li sta costruendo: `remaining` è un numero, e
 * `refillPerWeek` è quanto ne torna. Una casa senza riga è una casa **senza
 * limiti** — che è la casa del proprietario, e non richiede una semina.
 *
 * Assente ≠ zero, ed è la decisione portante: il contrario avrebbe reso ogni
 * casa esistente incapace di posare un cuscino il giorno del deploy.
 */
export const propStock = pgTable(
  "prop_stock",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    kind: text("kind").notNull(),
    remaining: integer("remaining").notNull(),
    /** quanti ne tornano ogni settimana; 0 = quel che c'è è quel che c'è */
    refillPerWeek: integer("refill_per_week").notNull().default(0),
    refilledAt: timestamp("refilled_at", { withTimezone: true }),
  },
  (table) => [
    unique("prop_stock_household_kind_uq").on(table.householdId, table.kind),
    check("prop_stock_kind", sql`${table.kind} in ('cushion','grass','bush','ball','trough')`),
    check("prop_stock_remaining_positive", sql`${table.remaining} >= 0`),
    check("prop_stock_refill_positive", sql`${table.refillPerWeek} >= 0`),
  ],
);

/** I tipi che il database accetta, per il test che li confronta col catalogo. */
export const PROP_KINDS_IN_DB: readonly string[] = KINDS;
