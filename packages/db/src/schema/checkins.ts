import { sql } from "drizzle-orm";
import { boolean, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { gosinoId } from "./self.js";

/**
 * Il check-in (ADR-085): la domanda che torna.
 *
 * Sta fuori da `desires` per una ragione di sostanza, non di comodo. Un
 * desiderio è un fatto singolo con un ciclo di vita — nasce dal sogno,
 * `pending`, poi `done` — mentre questa è una **regola**: non finisce mai,
 * torna domani. Metterle nella stessa tabella avrebbe voluto dire una riga
 * che passa a `done` e poi resuscita, che è il modo migliore per non capire
 * più cosa significhi `done`.
 *
 * Il rapporto fra le due è di produzione: quando è l'ora, la regola **scrive
 * un desiderio**, e da lì in poi la strada è quella di sempre — l'iniziativa
 * sceglie il momento buono, le ore di quiete valgono, e a interruttore spento
 * tace. Farsi vivi è precisamente ciò che quell'interruttore spegne.
 */
export const checkins = pgTable("checkins", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  gosinoId: gosinoId(),
  /** quello che chiede, con le parole di chi gliel'ha chiesto */
  question: text("question").notNull(),
  /** 0..23 nel fuso della casa */
  hour: integer("hour").notNull(),
  /** 0..59 */
  minute: integer("minute").notNull().default(0),
  /** 0 = domenica … 6 = sabato; `null` = tutti i giorni */
  weekday: integer("weekday"),
  enabled: boolean("enabled").notNull().default(true),
  /**
   * Il giorno in cui è già stato chiesto — una data, non un istante.
   *
   * È ciò che impedisce la cosa peggiore che questo meccanismo possa fare:
   * richiedere la stessa cosa ogni volta che la sentinella passa. La verità
   * sta qui e non in memoria, quindi un riavvio non fa ricominciare la
   * giornata da capo.
   */
  lastAskedOn: date("last_asked_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
