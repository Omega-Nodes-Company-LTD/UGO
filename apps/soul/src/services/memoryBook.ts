import { memories, type DbClient } from "@ugo/db";
import { decryptText } from "@ugo/shared";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { exemplarsOf } from "../routes/scope.js";

/**
 * Il libro dei ricordi (ADR-086).
 *
 * I ricordi ci sono da PROGETTO §5.4 e si potevano guardare in due modi:
 * **cercandoli**, se sapevi già la parola giusta, e **come grafo**, che dice
 * come sono legati e non cosa contengono. In tutti e due i casi l'elenco si
 * fermava ai trenta più recenti — cento al massimo — e non c'era nessun modo
 * di andare più indietro. Un ricordo di marzo, in agosto, era irraggiungibile
 * se non indovinavi la parola con cui cercarlo.
 *
 * Questo è la terza strada, ed è quella che una persona userebbe per prima:
 * **scorrere**. I mesi, in ordine, con quanti ricordi hanno dentro — e poi
 * quel mese, per intero.
 *
 * Il testo si legge **tollerando entrambi i mondi**, come il diario: oggi
 * alcuni ricordi sono in chiaro (il sogno, le riunioni) e altri cifrati (il
 * lascito di chi se n'è andato, le lezioni dell'anziano). Un lettore che
 * assumesse uno dei due avrebbe mostrato base64 a qualcuno — ed è esattamente
 * ciò che il pannello faceva col lascito, cioè con la cosa più preziosa che
 * resti di una creatura.
 */

export interface BookMonth {
  /** `YYYY-MM` */
  month: string;
  count: number;
}

export interface BookEntry {
  id: string;
  text: string;
  kind: string;
  importance: number;
  createdAt: Date;
  /** un ricordo smentito resta nel libro, e si vede che è smentito (ADR-023) */
  invalid: boolean;
}

/** Al massimo, per una pagina: un mese è un mese, non un dump. */
export const PAGE_LIMIT = 200;

export class MemoryBook {
  public constructor(
    private readonly db: DbClient,
    private readonly dataKey: Buffer,
  ) {}

  /**
   * Il testo leggibile. Se non si apre non si finge: si dice che non si apre,
   * perché un ricordo illeggibile è un'informazione — di solito vuol dire che
   * la chiave della casa non è quella con cui è stato scritto.
   */
  private readable(value: string): string {
    try {
      return decryptText(value, this.dataKey);
    } catch {
      // in chiaro (il sogno lo scrive così) o davvero illeggibile: il prefisso
      // di versione distingue i due casi senza provare a indovinare
      return value.startsWith("v1:") ? "[non leggibile con la chiave di questa casa]" : value;
    }
  }

  private who(householdId: string, gosinoId: string | undefined): SQL | undefined {
    return gosinoId === undefined
      ? inArray(memories.gosinoId, exemplarsOf(this.db, householdId))
      : eq(memories.gosinoId, gosinoId);
  }

  /**
   * La costa del libro: i mesi che hanno qualcosa dentro, dal più recente.
   *
   * I mesi vuoti non ci sono, e non è una svista: un buco nel libro è una
   * riga in meno, non una riga che dice zero. Il tempo in cui non è successo
   * niente non è un capitolo.
   */
  public async spine(
    householdId: string,
    gosinoId: string | undefined,
  ): Promise<BookMonth[]> {
    const month = sql<string>`to_char(${memories.createdAt}, 'YYYY-MM')`;
    const rows = await this.db
      .select({ month, count: sql<number>`count(*)::int` })
      .from(memories)
      .where(this.who(householdId, gosinoId))
      .groupBy(month)
      .orderBy(desc(month));
    return rows.map((row) => ({ month: row.month, count: row.count }));
  }

  /**
   * Un periodo, per intero e in ordine di come è successo.
   *
   * `period` è `YYYY-MM` per un mese o `YYYY` per un anno: la stessa domanda
   * fatta con due grane diverse, e il prefisso basta a distinguerle senza
   * inventare un secondo parametro che qualcuno prima o poi passerebbe
   * incoerente con l'altro.
   */
  public async page(
    householdId: string,
    gosinoId: string | undefined,
    period: string,
    options: { limit?: number; onlyValid?: boolean } = {},
  ): Promise<BookEntry[]> {
    /**
     * Due frammenti già scritti invece di un formato interpolato: qui dentro
     * varrebbe due soli valori, ma è la forma che un giorno qualcuno
     * riempirebbe con quello che arriva da fuori.
     */
    const stamp =
      period.length === 4
        ? sql`to_char(${memories.createdAt}, 'YYYY')`
        : sql`to_char(${memories.createdAt}, 'YYYY-MM')`;
    const rows = await this.db
      .select({
        id: memories.id,
        text: memories.text,
        kind: memories.kind,
        importance: memories.importance,
        createdAt: memories.createdAt,
        invalidatedAt: memories.invalidatedAt,
      })
      .from(memories)
      .where(
        and(
          this.who(householdId, gosinoId),
          sql`${stamp} = ${period}`,
          options.onlyValid === true ? isNull(memories.invalidatedAt) : undefined,
        ),
      )
      .orderBy(asc(memories.createdAt))
      .limit(Math.min(options.limit ?? PAGE_LIMIT, PAGE_LIMIT));

    return rows.map((row) => ({
      id: row.id,
      text: this.readable(row.text),
      kind: row.kind,
      importance: row.importance,
      createdAt: row.createdAt,
      invalid: row.invalidatedAt !== null,
    }));
  }
}
