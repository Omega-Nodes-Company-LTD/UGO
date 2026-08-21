import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accountId } from "./accounts.js";

/**
 * Il gioco in corso (ADR-112).
 *
 * Un gioco è fatto di **turni**, e fra un turno e l'altro qualcosa deve
 * ricordare *cosa è stato pensato e cosa non è ancora stato detto*. Quel
 * qualcosa non può essere la cronaca della conversazione: lì dentro il
 * segreto sarebbe leggibile insieme al resto, e — cosa peggiore — finirebbe
 * nel prompt al turno dopo, cioè verrebbe consegnato al modello che dovrebbe
 * custodirlo.
 *
 * Quindi una riga sua, col numero pensato **cifrato** come tutto il resto
 * (regola 6), e una regola sopra tutte: il segreto non entra mai in un prompt.
 * A rispondere «più alto» o «più basso» è codice, non un modello — il che
 * rende il gioco anche gratis.
 *
 * Una riga per esemplare: due gosini in casa giocano due partite diverse, e un
 * gosino non tiene due numeri in mente insieme.
 */
export const games = pgTable(
  "games",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: accountId(),
    gosinoId: uuid("gosino_id").notNull(),
    /** oggi uno solo: `numero`. Il campo esiste perché il secondo non cambi lo schema */
    kind: text("kind").notNull().default("numero"),
    /** ciphertext AES-256-GCM: è il segreto, e un segreto in chiaro non è un segreto */
    secret: text("secret").notNull(),
    /** quanti tentativi ha fatto: serve per la resa e per il racconto finale */
    turns: integer("turns").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** l'ultima mossa: una partita abbandonata scade invece di restare aperta per sempre */
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [index("games_gosino_idx").on(table.gosinoId)],
);
