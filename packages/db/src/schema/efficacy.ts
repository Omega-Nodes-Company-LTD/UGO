import { check, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gosinoId } from "./self.js";

/**
 * Quanto bene gli è andata, atto per atto (ADR-058).
 *
 * ⚠️ **Non è apprendimento in nessun senso generale**, e va detto qui perché è
 * qui che fra sei mesi qualcuno verrà a leggere: è un **peso di preferenza su
 * nove atti cablati**, limitato a ±40%, che decade verso 1 ogni notte. Non
 * inventa comportamenti, non cambia il carattere, non tocca il genoma. Riordina
 * atti che si somigliano già come punteggio, e basta.
 *
 * Perché una tabella sua e non `psyche_baselines`: quella significa «dove
 * riposa una variabile della psiche», e il sogno che la legge dovrebbe imparare
 * a saltare righe che non lo sono. Due significati in una tabella sono due
 * tabelle scritte male.
 *
 * E **mai** `trait_sets`: quello è immutabile per versione (ADR-015 §38-42),
 * non ha un motore di mutazione ed è una decisione, non una mancanza. Il
 * livello giusto sta sotto — qui.
 */
export const actEfficacy = pgTable(
  "act_efficacy",
  {
    gosinoId: gosinoId(),
    /** l'id dell'atto, da `acts.ts`: `lookOver`, `nudge`, `askQuestion`… */
    act: text("act").notNull(),
    /**
     * Il moltiplicatore del **sollievo**. 1 = come sempre.
     *
     * I fermi non sono decorazione: fuori da [0.6, 1.4] un peso smetterebbe di
     * riordinare e comincerebbe a decidere, cioè un atto molto premiato
     * scavalcherebbe la soglia da solo — e allora la lode fabbricherebbe
     * iniziative invece di preferirne una fra due.
     */
    weight: real("weight").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.gosinoId, table.act] }),
    check("act_efficacy_range", sql`${table.weight} between 0.6 and 1.4`),
  ],
);

/** I fermi, in un posto solo: il database li impone, il codice li rispetta. */
export const EFFICACY_MIN = 0.6;
export const EFFICACY_MAX = 1.4;

/**
 * Quanto si muove un peso per una lode, e quanto per un buco nell'acqua.
 *
 * La lode pesa il doppio del fallimento, e non è generosità: `scoreLast` misura
 * il calo di una pressione dopo un'iniziativa, ed è **rumorosa** — una
 * pressione può calare da sola. Una lode invece è un dito su un muso, e non
 * succede per caso.
 */
export const PRAISE_STEP = 0.08;
export const FLAT_STEP = 0.04;

/**
 * Quanto ogni peso torna verso 1 in una notte.
 *
 * Nel **sogno**, non nel tick. Metterlo nel tick renderebbe il tasso di
 * decadimento dipendente da quanto spesso gira il tick — cioè un incidente di
 * configurazione travestito da parametro di carattere.
 */
export const NIGHTLY_DECAY = 0.06;
