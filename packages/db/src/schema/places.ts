import { sql } from "drizzle-orm";
import { index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { accountId } from "./accounts.js";

/**
 * I luoghi di un account (ADR-113).
 *
 * ADR-092 ha separato il **titolare** dalla casa: «account» è chi possiede,
 * non dove si abita. Restava però una sola riga di coordinate sull'account, e
 * quindi una sola geografia: chi ha la casa in città e quella al mare aveva un
 * cielo solo, e per forza sbagliato in una delle due.
 *
 * Un luogo è **dove si sta**: ha un nome scritto da una persona («Torino»,
 * «la bottega»), delle coordinate, e le stanze che ci stanno dentro. Il tempo
 * che fa è del luogo, non del titolare — ed è la ragione per cui questa
 * tabella esiste: un dato che era vero per una casa sola stava sulla riga
 * sbagliata.
 *
 * Il fuso NON sta qui, ed è una scelta: resta dell'account. Un orario di
 * silenzio o un giro notturno appartengono a **chi vive**, non alle stanze, e
 * una famiglia che si sposta al mare per agosto non vuole due notti diverse.
 */
export const places = pgTable(
  "places",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    /** come l'ha scritto una persona: due coordinate non dicono se è il posto giusto */
    name: text("name").notNull(),
    /** `name` normalizzato: due luoghi che differiscono per una maiuscola sono uno */
    slug: text("slug").notNull(),
    lat: numeric("lat", { precision: 8, scale: 5 }),
    lon: numeric("lon", { precision: 8, scale: 5 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("places_account_idx").on(table.accountId),
    unique("places_account_slug_uq").on(table.accountId, table.slug),
  ],
);

/** L'unica normalizzazione, in un posto solo — come per le stanze. */
export function slugOfPlace(name: string): string {
  return name.trim().toLowerCase();
}
