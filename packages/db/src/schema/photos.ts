import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { gosini } from "./gosini.js";

/**
 * L'album di famiglia (ADR-109): le foto che una casa decide di tenere, e per
 * quanto.
 *
 * Riapre il vincolo 1 di ADR-016 («nessun media raw persistito»), in forma
 * stretta: si scatta **solo su gesto esplicito**, i pixel vivono cifrati con
 * la DEK della casa in un bucket privato, e la durata la sceglie il titolare
 * fra cinque scalini — o «non si tengono», che è il default.
 *
 * `caption` sta **in chiaro**, e non è una svista: è la frase con cui la foto
 * si ritrova («gli scatti del parco»), e vale la ragione di ADR-091 — il dato
 * sensibile è il pixel, la didascalia è una frase. Il pixel non è mai qui
 * dentro: qui c'è solo la chiave dell'oggetto.
 *
 * `expires_at` si calcola **allo scatto** e non si ricalcola: allungare la
 * durata non deve resuscitare una foto che stava per sparire, e accorciarla
 * deve valere subito. Chi scade legge questa colonna e nient'altro.
 */
export const photos = pgTable(
  "photos",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** quale esemplare l'ha scattata: il pannello lo chiede, mai «va il default» */
    gosinoId: uuid("gosino_id").notNull(),
    /** la chiave nel bucket; l'oggetto è ciphertext AES-256-GCM (ADR-109 §3) */
    objectKey: text("object_key").notNull(),
    /** la frase del modello vision, in chiaro perché è come si ritrova */
    caption: text("caption").notNull().default(""),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    /** quando sparisce: scritto allo scatto, mai ricalcolato */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("photos_account_idx").on(table.accountId),
    // chi scade cerca per scadenza: è l'unico indice che serve a un job
    index("photos_expiry_idx").on(table.expiresAt),
    index("photos_taken_idx").on(table.accountId, table.takenAt),
    // chi ha scattato è un esemplare della casa: la composite di ADR-019
    foreignKey({
      name: "photos_gosino_fk",
      columns: [table.accountId, table.gosinoId],
      foreignColumns: [gosini.accountId, gosini.id],
    }),
    // una foto che nasce già scaduta è una foto che nessuno ha mai visto
    check("photos_expiry_after_taken", sql`${table.expiresAt} > ${table.takenAt}`),
    // ADR-109 × ADR-099: la cartolina punta alla foto con la coppia
    // (casa, foto), come ogni riferimento di questo schema — una chiave da
    // sola attraverserebbe il muro delle case senza che nessuno se ne accorga
    unique("photos_account_id_uq").on(table.accountId, table.id),
  ],
);

/**
 * Gli scalini della durata (ADR-109 §2), in ore. `0` = non si tengono, ed è
 * il default: l'album acceso d'ufficio sarebbe una casa che comincia a
 * conservare immagini per un aggiornamento, cioè la sorpresa che la visione
 * vieta (la stessa ragione di `accounts.metabolism`).
 *
 * Cinque scalini e non un numero libero: si scelgono da una tendina e si
 * dicono a voce («tienile un giorno»), e nessuno deve pensare a un numero.
 * Duplicati nel `check` della migrazione, che è il posto in cui diventano veri.
 */
export const PHOTO_RETENTION_STEPS = [0, 6, 12, 24, 48, 72] as const;
export type PhotoRetentionHours = (typeof PHOTO_RETENTION_STEPS)[number];
