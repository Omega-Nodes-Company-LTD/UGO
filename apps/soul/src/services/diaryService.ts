import { diaryEntries, type DbClient } from "@ugo/db";
import { decryptText } from "@ugo/shared";
import { and, desc, eq, inArray, lte, type SQL } from "drizzle-orm";
import { exemplarsOf } from "../routes/scope.js";

/**
 * Il libro della vita (ADR-079): la parte che mancava del sogno.
 *
 * Il diario notturno esiste da PROGETTO §5.6 e non l'ha mai letto nessuno.
 * Finiva in tre posti — la prima pagina nel prompt, una frase nel sonno, il
 * dump dell'export — e in nessuno dei tre come **libro**. È la cosa più
 * preziosa che UGO scriva: quello che la famiglia ha vissuto, distillato una
 * notte per volta.
 *
 * Il testo si legge **tollerando entrambi i mondi**: il sogno oggi lo scrive
 * in chiaro, e se un giorno lo cifrerà (v. il debito dichiarato in STATE §7)
 * questa funzione continuerà a leggerlo senza modifiche. Un lettore che
 * assumesse uno dei due avrebbe restituito base64 a qualcuno, un giorno.
 */

export interface DiaryPage {
  date: string;
  text: string;
  /** le medie della giornata più l'ultima etichetta, come le scrive il sogno */
  mood: Record<string, unknown>;
}

export class DiaryService {
  public constructor(
    private readonly db: DbClient,
    private readonly dataKey: Buffer,
  ) {}

  /**
   * Le pagine, dalla più recente. Senza esemplare vale la casa intera
   * (ADR-019 fase 2): «tutti» non ha mai voluto dire «tutto il database».
   */
  public async pages(
    accountId: string,
    gosinoId: string | undefined,
    options: { limit?: number; until?: string } = {},
  ): Promise<DiaryPage[]> {
    const filters: (SQL | undefined)[] = [
      gosinoId === undefined
        ? inArray(diaryEntries.gosinoId, exemplarsOf(this.db, accountId))
        : eq(diaryEntries.gosinoId, gosinoId),
    ];
    if (options.until !== undefined) filters.push(lte(diaryEntries.date, options.until));

    const rows = await this.db
      .select({
        date: diaryEntries.date,
        text: diaryEntries.text,
        mood: diaryEntries.moodSummary,
      })
      .from(diaryEntries)
      .where(and(...filters))
      .orderBy(desc(diaryEntries.date))
      .limit(Math.min(365, Math.max(1, options.limit ?? 30)));

    return rows.map((row) => ({
      date: row.date,
      text: this.readable(row.text),
      mood: typeof row.mood === "object" && row.mood !== null ? { ...row.mood } : {},
    }));
  }

  /** Una pagina precisa, se quella notte ha sognato. */
  public async page(
    accountId: string,
    gosinoId: string | undefined,
    date: string,
  ): Promise<DiaryPage | undefined> {
    const [found] = await this.pages(accountId, gosinoId, { limit: 1, until: date });
    return found?.date === date ? found : undefined;
  }

  /**
   * In chiaro comunque sia scritto. `decryptText` fallisce su un testo che non
   * è ciphertext, ed è esattamente il caso normale di oggi: allora vale il
   * testo così com'è.
   */
  private readable(value: string): string {
    try {
      return decryptText(value, this.dataKey);
    } catch {
      return value;
    }
  }
}
