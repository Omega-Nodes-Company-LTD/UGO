import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { householdId } from "./households.js";
import { bytea } from "./types.js";

/**
 * Le impronte di chi non sappiamo ancora chi sia (ADR-052).
 *
 * Perché una tabella separata da `recognition_profiles`: quella è indicizzata
 * **per essere**, e un'impronta ignota per definizione non ne ha uno. La
 * scorciatoia sarebbe stata creare un `being` provvisorio per ogni faccia
 * passata davanti alla camera — e il branco si sarebbe riempito di persone che
 * non esistono, che è precisamente ciò che ADR-014 tiene fuori.
 *
 * ⚠️ **Questi sono dati biometrici di chi non ha acconsentito.** Il proprietario
 * l'ha scelto sapendolo, quindi il prezzo si paga per intero e per iscritto:
 *
 * - **cifrati** come qualunque altra impronta (ADR-016), mai in chiaro;
 * - **a scadenza**: {@link UNKNOWN_PRINT_RETENTION_DAYS} giorni, applicati da
 *   un job come i dodici mesi dell'audit log. Un'impronta che nessuno ha
 *   rivendicato non è un archivio, è una domanda a cui non si è risposto;
 * - **cancellabili dal pannello**, una per una;
 * - **distrutte dall'oblio**: `ForgetService` le porta via insieme al resto, o
 *   il diritto all'oblio avrebbe un buco esattamente dove fa più male.
 */
export const unknownPrints = pgTable(
  "unknown_prints",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    householdId: householdId(),
    /** `face` oggi; la colonna esiste perché la voce ignota è lo stesso caso */
    modality: text("modality").notNull(),
    /** quale encoder l'ha prodotta: due modelli non sono confrontabili */
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    /** il centroide, cifrato AES-256-GCM con la DEK della casa (ADR-016) */
    payload: bytea("payload").notNull(),
    /** quante volte l'abbiamo rivista: chi passa spesso vale una domanda */
    seenCount: integer("seen_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Se UGO ha già chiesto chi fosse. Non si richiede all'infinito: una
     * creatura che domanda «e questo chi è?» ogni volta che ti passa davanti
     * il postino è una creatura che si spegne.
     */
    askedAt: timestamp("asked_at", { withTimezone: true }),
  },
  (table) => [
    index("unknown_prints_household_idx").on(table.householdId, table.lastSeenAt),
  ],
);

/**
 * Quanto si conserva un'impronta che nessuno ha rivendicato.
 *
 * Trenta giorni e non dodici mesi come l'audit log, e la differenza è il punto:
 * l'audit log contiene verbi e id, questo contiene la faccia di una persona che
 * non ci ha detto di sì. Trenta giorni sono lo spazio per un «chi era quello di
 * ieri?» e niente di più.
 */
export const UNKNOWN_PRINT_RETENTION_DAYS = 30;
