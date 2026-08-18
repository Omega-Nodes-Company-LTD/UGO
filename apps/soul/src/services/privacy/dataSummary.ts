import {
  beings,
  diaryEntries,
  memories,
  messages,
  perceptionEvents,
  recognitionProfiles,
  transcriptSegments,
  unknownPrints,
  type DbClient,
} from "@ugo/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { exemplarsOf } from "../../routes/scope.js";

/**
 * «Cosa sai di me» (ADR-090).
 *
 * L'export porta via tutto e l'oblio cancella; mancava la domanda che viene
 * **prima** di tutte e due, e che è quella che una persona fa davvero
 * guardando uno schermo in cucina: *cosa tieni, di preciso?*
 *
 * Numeri, non contenuti. Un pannello su uno schermo condiviso che stampasse
 * i ricordi sarebbe la cosa più indiscreta della casa — chiunque passa di lì
 * leggerebbe la vita di qualcun altro. Un conto invece è una risposta onesta
 * e non è una fuga: dice **quanto**, mai **cosa**.
 *
 * Le due righe che contano di più sono in fondo, e sono le uniche che parlano
 * di corpi: quante persone hanno un'impronta (voce o volto) e quante volte è
 * passato qualcuno che UGO non sa chi sia.
 */

export interface DataSummary {
  /** persone e animali del branco */
  beings: number;
  /** chi ha una tutela accesa: minorenne, «non ascoltare», «non guardare» */
  protected: number;
  messages: number;
  memories: number;
  diaryPages: number;
  transcriptSegments: number;
  /** quante persone hanno un'impronta biometrica registrata */
  prints: number;
  /** quante volte è stato visto o sentito qualcuno */
  sightings: number;
  /** impronte di sconosciuti, non collegate a nessuno */
  strangers: number;
}

const count = sql<number>`count(*)::int`;

export async function dataSummary(db: DbClient, householdId: string): Promise<DataSummary> {
  const mine = exemplarsOf(db, householdId);
  const one = async (query: Promise<{ n: number }[]>): Promise<number> => (await query)[0]?.n ?? 0;

  const [
    beingCount,
    protectedCount,
    messageCount,
    memoryCount,
    diaryCount,
    segmentCount,
    printCount,
    sightingCount,
    strangerCount,
  ] = await Promise.all([
    one(db.select({ n: count }).from(beings).where(eq(beings.householdId, householdId))),
    one(
      db
        .select({ n: count })
        .from(beings)
        .where(
          and(
            eq(beings.householdId, householdId),
            sql`(${beings.isMinor} or ${beings.noAudio} or ${beings.noVision})`,
          ),
        ),
    ),
    one(db.select({ n: count }).from(messages).where(inArray(messages.gosinoId, mine))),
    one(db.select({ n: count }).from(memories).where(inArray(memories.gosinoId, mine))),
    one(db.select({ n: count }).from(diaryEntries).where(inArray(diaryEntries.gosinoId, mine))),
    // ADR-048 gli ha dato la casa sulla riga: non serve passare dalla riunione
    one(
      db
        .select({ n: count })
        .from(transcriptSegments)
        .where(eq(transcriptSegments.householdId, householdId)),
    ),
    one(
      db
        .select({ n: count })
        .from(recognitionProfiles)
        .where(eq(recognitionProfiles.householdId, householdId)),
    ),
    one(
      db.select({ n: count }).from(perceptionEvents).where(inArray(perceptionEvents.gosinoId, mine)),
    ),
    one(
      db.select({ n: count }).from(unknownPrints).where(eq(unknownPrints.householdId, householdId)),
    ),
  ]);

  return {
    beings: beingCount,
    protected: protectedCount,
    messages: messageCount,
    memories: memoryCount,
    diaryPages: diaryCount,
    transcriptSegments: segmentCount,
    prints: printCount,
    sightings: sightingCount,
    strangers: strangerCount,
  };
}
