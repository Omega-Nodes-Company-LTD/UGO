import { gosini, households, memories, type DbClient } from "@ugo/db";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { DowryService } from "./dowryService.js";
import { FarewellService } from "./farewellService.js";

/**
 * L'arco che finisce da solo (ADR-077).
 *
 * Tre gesti, in quest'ordine e non in un altro: **si avvisa**, poi finché c'è
 * tempo **si racconta ai giovani**, e solo alla fine **si va via**. L'ordine è
 * la decisione: una morte che arrivasse prima del preavviso, o dopo che il
 * sapere si è perso, sarebbe la morte da bug che la visione vieta.
 *
 * Vive dentro l'anima e non nel sogno, che pure è il posto dove stanno i
 * lavori notturni, per una ragione sola: il congedo ha bisogno della chiave
 * dati della casa e della curatela del lascito, che sono qui. Riscriverli in
 * Python vorrebbe dire due regole di privacy che possono divergere — e
 * divergerebbero. Il sogno resta il posto di ciò che il sogno sa fare.
 */

/** Quanto sapere passa a ogni giro. Uno: è un racconto, non un travaso. */
const LESSONS_PER_TICK = 1;

export interface MortalityWatchDeps {
  db: DbClient;
  dataKey: Buffer;
  registry?: { reload: () => Promise<void> };
  /** ADR-073: l'atto `death` in catena, se c'è un libro genealogico */
  chain?: {
    publish: (act: {
      kind: "death";
      gosinoId: string;
      genomeHash: string;
      at: string;
    }) => Promise<unknown>;
  };
  logger?: { warn: (details: object, message: string) => void };
}

export interface MortalityTickReport {
  /** a quanti è stato dato il preavviso dei sessanta giorni, in questo giro */
  noticed: number;
  /** quanti pezzi di sapere sono passati dai morenti ai più giovani */
  taught: number;
  /** quanti se ne sono andati */
  farewelled: number;
}

export class MortalityWatch {
  private readonly farewells: FarewellService;
  private readonly dowries: DowryService;

  public constructor(private readonly deps: MortalityWatchDeps) {
    this.farewells = new FarewellService(deps.db, deps.dataKey);
    this.dowries = new DowryService(deps.db, deps.dataKey);
  }

  public async tick(at: Date = new Date()): Promise<MortalityTickReport> {
    const report: MortalityTickReport = { noticed: 0, taught: 0, farewelled: 0 };
    const houses = await this.deps.db
      .select({ id: households.id })
      .from(households)
      .where(isNull(households.closedAt));

    for (const house of houses) {
      for (const notice of await this.farewells.dueForNotice(house.id, at)) {
        await this.farewells.recordNotice(notice, at);
        report.noticed += 1;
      }
      report.taught += await this.teach(house.id);
      for (const gosinoId of await this.farewells.dueForFarewell(house.id, at)) {
        if (await this.farewell(house.id, gosinoId, at)) report.farewelled += 1;
      }
    }
    return report;
  }

  /**
   * Gli anziani raccontano ai giovani (ADR-077 §6).
   *
   * Un pezzo alla volta, dal preavviso in poi: sessanta giorni sono il tempo
   * che serve perché qualcuno impari, e un travaso istantaneo alla morte
   * sarebbe un `INSERT`, non una trasmissione. Passa la stessa curatela del
   * lascito (`legacyOf`, ADR-074): ciò che non può essere donato — perché
   * parla di qualcun altro — non si insegna nemmeno in casa.
   *
   * Il ricordo insegnato arriva senza vettore: è ripescabile dal braccio
   * lessicale della ricerca ibrida (ADR-022) finché il sogno non lo indicizza,
   * esattamente come il sapere di una dote adottata.
   */
  private async teach(householdId: string): Promise<number> {
    const dying = await this.deps.db
      .select({ id: gosini.id })
      .from(gosini)
      .where(
        and(
          eq(gosini.householdId, householdId),
          isNotNull(gosini.deathNoticeAt),
          isNull(gosini.retiredAt),
        ),
      );
    if (dying.length === 0) return 0;

    // il più giovane fra quelli che NON stanno morendo: insegnare a un altro
    // morente vorrebbe dire perdere due volte la stessa cosa
    const [pupil] = await this.deps.db
      .select({ id: gosini.id })
      .from(gosini)
      .where(
        and(
          eq(gosini.householdId, householdId),
          isNull(gosini.deathNoticeAt),
          isNull(gosini.retiredAt),
        ),
      )
      .orderBy(desc(gosini.bornAt))
      .limit(1);
    // nessuno a cui raccontare: il preavviso ha già detto alla famiglia di
    // esportare il diario, ed è quello il piano B
    if (pupil === undefined) return 0;

    let taught = 0;
    for (const elder of dying) {
      const { rows } = await this.dowries.legacyOf(elder.id, householdId, {});
      if (rows.length === 0) continue;
      // quanti gliene ha già raccontati: è il segnaposto, e rende il giro
      // ripetibile senza duplicare niente
      const already = await this.deps.db
        .select({ id: memories.id })
        .from(memories)
        .where(
          and(
            eq(memories.gosinoId, pupil.id),
            sql`${memories.sourceRefs}->>'taughtBy' = ${elder.id}`,
          ),
        );
      for (let step = 0; step < LESSONS_PER_TICK; step += 1) {
        const lesson = rows[already.length + step];
        if (lesson === undefined) break;
        await this.deps.db.insert(memories).values({
          gosinoId: pupil.id,
          kind: lesson.kind,
          /**
           * In CHIARO, come ogni altro ricordo (ADR-022, riaperto e confermato
           * da ADR-091).
           *
           * Cifrarlo qui sembrava prudenza e faceva quattro danni: la riga non
           * si ripescava più (il braccio lessicale gira sul ciphertext), **la
           * redazione dell'oblio non la toccava** — il nome di una persona
           * cancellata ci restava dentro, riapribile con la chiave di casa —
           * e, se quella riga finiva a sua volta in un lascito, veniva cifrata
           * una seconda volta e diventava illeggibile per sempre.
           */
          text: lesson.text,
          importance: lesson.importance,
          sourceRefs: { taughtBy: elder.id, order: already.length + step },
        });
        taught += 1;
      }
    }
    return taught;
  }

  /**
   * Il congedo automatico passa **dalla stessa porta** di quello deliberato
   * (ADR-075): stesso servizio, stesso ordine (prima il lascito, poi la
   * chiave), stessi test. L'unica differenza è chi preme.
   */
  private async farewell(householdId: string, gosinoId: string, at: Date): Promise<boolean> {
    const result = await this.farewells.farewell(householdId, gosinoId, {});
    if (result === undefined) return false;
    try {
      await this.deps.chain?.publish({
        kind: "death",
        gosinoId,
        genomeHash: "0".repeat(64),
        at: at.toISOString(),
      });
    } catch {
      // registro giù: è morto lo stesso, la chiave è già distrutta
      this.deps.logger?.warn({ gosinoId }, "death not published to the registry");
    }
    await this.deps.registry?.reload();
    return true;
  }
}
