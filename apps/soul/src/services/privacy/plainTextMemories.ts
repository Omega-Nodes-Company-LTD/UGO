import { gosini, memories, type DbClient } from "@ugo/db";
import { decryptText } from "@ugo/shared";
import { and, eq, inArray, like } from "drizzle-orm";

/**
 * Rimette in chiaro i ricordi scritti cifrati prima di ADR-091.
 *
 * Il pregresso non si aggiusta da solo: finché una riga resta cifrata non si
 * ripesca (il braccio lessicale gira sul ciphertext), l'oblio non ci arriva
 * dentro a togliere un nome, e se finisce in un lascito viene cifrata una
 * seconda volta. Le tre porte che le scrivevano sono chiuse; questa passa a
 * raccogliere quelle già uscite.
 *
 * Sta in una riga di comando e non in una migrazione per una ragione sola:
 * **una migrazione SQL non ha la chiave**. `UGO_DATA_KEY` vive nel processo,
 * quindi il lavoro lo fa chi ce l'ha in mano.
 *
 * Idempotente: le righe già in chiaro non hanno il prefisso di versione e non
 * vengono nemmeno lette.
 */

export interface PlainTextReport {
  /** quante righe cifrate sono state trovate */
  found: number;
  /** quante sono state riaperte e riscritte */
  converted: number;
  /**
   * quante non si sono aperte con la chiave di questa casa. Restano com'erano:
   * una riga illeggibile è un problema, sovrascriverla sarebbe una perdita.
   */
  unreadable: number;
}

export async function plainTextMemories(
  db: DbClient,
  dataKey: Buffer,
  householdId: string,
): Promise<PlainTextReport> {
  const mine = db.select({ id: gosini.id }).from(gosini).where(eq(gosini.householdId, householdId));

  const rows = await db
    .select({ id: memories.id, text: memories.text })
    .from(memories)
    // il prefisso di versione fa da filtro: chi non ce l'ha è già a posto
    .where(and(inArray(memories.gosinoId, mine), like(memories.text, "v1:%")));

  const report: PlainTextReport = { found: rows.length, converted: 0, unreadable: 0 };
  for (const row of rows) {
    let plain: string;
    try {
      plain = decryptText(row.text, dataKey);
    } catch {
      report.unreadable += 1;
      continue;
    }
    await db.update(memories).set({ text: plain }).where(eq(memories.id, row.id));
    report.converted += 1;
  }
  return report;
}
