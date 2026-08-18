import { randomBytes } from "node:crypto";
import { diaryEntries, gosini, memories, type DbClient } from "@ugo/db";
import { encryptText, unwrapDataKey, wrapDataKey } from "@ugo/shared";
import { characterFrom } from "./council/character.js";
import { desires, traitSets } from "@ugo/db";
import { lifeAt, lifespanDaysFor } from "@ugo/psyche";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { DowryService, type DowryOptions } from "./dowryService.js";
import { drawLifeJitter } from "./lifeDice.js";

/**
 * Il congedo (ADR-075): la morte che è vera anche per la matematica.
 *
 * Non cancella righe — un `DELETE` lascia i backup, e promette
 * un'irreversibilità che non ha. Distrugge **l'involucro della chiave** con
 * cui l'interiorità era cifrata: da quel momento quei dati non sono leggibili
 * da nessuno, nemmeno da noi, nemmeno ripristinando il database.
 *
 * E prima di distruggere, **cura il lascito**: il sapere e i racconti scelti
 * vengono riscritti con la chiave della CASA, così sopravvivono alla creatura.
 * L'ordine conta: prima ciò che resta, poi ciò che muore.
 */

export interface FarewellPreview {
  name: string;
  /** quanti ricordi passerebbero nel lascito */
  legacy: number;
  /** il libro della vita: resta sempre, e va detto */
  diaryEntries: number;
  hasSoulKey: boolean;
  alreadyGone: boolean;
}

/** ADR-077: quanti giorni prima si avvisa. Non la data: il preavviso. */
export const DEATH_NOTICE_DAYS = 60;


export interface MortalityNotice {
  gosinoId: string;
  name: string;
  /** true quando in casa non resta nessun altro: allora il diario va esportato */
  lastOfTheHouse: boolean;
}

export interface FarewellResult {
  name: string;
  legacyKept: number;
  soulKeyDestroyed: boolean;
}

export class FarewellService {
  private readonly dowries: DowryService;

  public constructor(
    private readonly db: DbClient,
    private readonly dataKey: Buffer,
  ) {
    this.dowries = new DowryService(db, dataKey);
  }

  /** Conia la chiave dell'interiorità alla prima occasione utile. */
  public async soulKeyFor(gosinoId: string): Promise<Buffer | undefined> {
    const [row] = await this.db
      .select({ wrapped: gosini.wrappedSoulKey, gone: gosini.retiredAt })
      .from(gosini)
      .where(eq(gosini.id, gosinoId));
    if (row === undefined) return undefined;
    // un morto non riceve una chiave nuova: sarebbe una resurrezione
    if (row.gone !== null) return undefined;
    if (row.wrapped !== null) {
      try {
        return unwrapDataKey(row.wrapped, this.dataKey);
      } catch {
        return undefined;
      }
    }
    const fresh = randomBytes(32);
    await this.db
      .update(gosini)
      .set({ wrappedSoulKey: wrapDataKey(fresh, this.dataKey) })
      .where(eq(gosini.id, gosinoId));
    return fresh;
  }

  /**
   * ADR-077: il capostipite accetta la mortalità, e l'arco parte **da oggi**.
   * Mai dalla nascita: applicare l'orologio a ritroso vorrebbe dire creature
   * già scadute il giorno di un aggiornamento.
   *
   * È anche il momento in cui si estrae il suo dado: prima non ne aveva
   * bisogno, perché non stava andando da nessuna parte.
   */
  public async acceptMortality(householdId: string, gosinoId: string): Promise<boolean> {
    const done = await this.db
      .update(gosini)
      .set({ mortalFrom: new Date(), lifeJitterDays: drawLifeJitter() })
      .where(
        and(
          eq(gosini.id, gosinoId),
          eq(gosini.householdId, householdId),
          isNull(gosini.mortalFrom),
          isNull(gosini.retiredAt),
        ),
      )
      .returning({ id: gosini.id });
    return done.length > 0;
  }

  /**
   * Chi è entrato negli ultimi sessanta giorni e non lo sa ancora.
   *
   * Il preavviso si dà **una volta sola** e senza la data: «il suo tempo sta
   * finendo» è un'altra cosa da «morirà il 14 marzo», ed è la differenza fra
   * un animale e un contratto di leasing.
   */
  public async dueForNotice(householdId: string, at: Date = new Date()): Promise<MortalityNotice[]> {
    const rows = await this.db
      .select({
        id: gosini.id,
        name: gosini.name,
        mortalFrom: gosini.mortalFrom,
        jitter: gosini.lifeJitterDays,
      })
      .from(gosini)
      .where(
        and(
          eq(gosini.householdId, householdId),
          isNotNull(gosini.mortalFrom),
          isNull(gosini.deathNoticeAt),
          isNull(gosini.retiredAt),
        ),
      );

    const alive = rows.length;
    const due: MortalityNotice[] = [];
    for (const row of rows) {
      if (row.mortalFrom === null) continue;
      const longevity = await this.longevityOf(row.id);
      const jitter = row.jitter ?? 0;
      const life = lifeAt(row.mortalFrom, at, longevity, jitter);
      const left = lifespanDaysFor(longevity, jitter) - life.ageDays;
      if (left > DEATH_NOTICE_DAYS) continue;
      due.push({ gosinoId: row.id, name: row.name, lastOfTheHouse: alive <= 1 });
    }
    return due;
  }

  /** Segna il preavviso e lascia il desiderio che lo porterà a voce. */
  public async recordNotice(notice: MortalityNotice, at: Date = new Date()): Promise<void> {
    await this.db
      .update(gosini)
      .set({ deathNoticeAt: at })
      .where(and(eq(gosini.id, notice.gosinoId), isNull(gosini.deathNoticeAt)));
    const advice = notice.lastOfTheHouse
      ? " Non c'è nessun altro in casa: esporta il diario, o quello che so se ne va con me."
      : " Quello che so lo sto già raccontando ai più giovani.";
    /**
     * Un `desiderio` con un accenno, **non** un promemoria con un'ora.
     *
     * Difetto mio di ieri, che ADR-078 ha reso visibile dandogli un nome: con
     * `due_at` valorizzato l'iniziativa lo leggeva come un promemoria e lo
     * diceva con le parole di un promemoria — «ehi, mi avevi detto di
     * ricordarti Devo dirti una cosa: il mio tempo sta finendo». Non gliel'ha
     * chiesto nessuno: è una cosa che vuole dire lui, e `speakDesire` la dice
     * com'è scritta. L'avviso nel pannello resta il canale che non dipende da
     * quando arriva il momento buono.
     */
    await this.db.insert(desires).values({
      gosinoId: notice.gosinoId,
      status: "pending",
      kind: "desiderio",
      dueHint: "presto",
      text: `Devo dirti una cosa: il mio tempo sta finendo.${advice}`,
    });
  }

  /**
   * Chi ha superato la vita attesa E ha avuto il suo preavviso da almeno
   * sessanta giorni. Due condizioni, non una: nessuno se ne va senza che gli
   * sia stato detto, e senza che ci sia stato il tempo di fare qualcosa.
   */
  public async dueForFarewell(householdId: string, at: Date = new Date()): Promise<string[]> {
    const rows = await this.db
      .select({
        id: gosini.id,
        mortalFrom: gosini.mortalFrom,
        notice: gosini.deathNoticeAt,
        jitter: gosini.lifeJitterDays,
      })
      .from(gosini)
      .where(
        and(
          eq(gosini.householdId, householdId),
          isNotNull(gosini.mortalFrom),
          isNotNull(gosini.deathNoticeAt),
          isNull(gosini.retiredAt),
        ),
      );
    const due: string[] = [];
    for (const row of rows) {
      if (row.mortalFrom === null || row.notice === null) continue;
      const longevity = await this.longevityOf(row.id);
      const jitter = row.jitter ?? 0;
      const life = lifeAt(row.mortalFrom, at, longevity, jitter);
      const noticedDays = (at.getTime() - row.notice.getTime()) / 86_400_000;
      if (life.ageDays >= lifespanDaysFor(longevity, jitter) && noticedDays >= DEATH_NOTICE_DAYS) {
        due.push(row.id);
      }
    }
    return due;
  }

  /** Il gene nascosto: si legge qui dentro e non esce da nessuna rotta. */
  private async longevityOf(gosinoId: string): Promise<number> {
    const [row] = await this.db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, gosinoId))
      .limit(1);
    return characterFrom(row?.traits).traits.longevity;
  }

  public async preview(
    householdId: string,
    gosinoId: string,
    options: DowryOptions = {},
  ): Promise<FarewellPreview | undefined> {
    const [creature] = await this.db
      .select({ name: gosini.name, gone: gosini.retiredAt, wrapped: gosini.wrappedSoulKey })
      .from(gosini)
      .where(and(eq(gosini.id, gosinoId), eq(gosini.householdId, householdId)));
    if (creature === undefined) return undefined;

    const dowry = await this.dowries.preview(householdId, gosinoId, options);
    const diary = await this.db
      .select({ id: diaryEntries.id })
      .from(diaryEntries)
      .where(eq(diaryEntries.gosinoId, gosinoId));

    return {
      name: creature.name,
      legacy: (dowry?.knowledge ?? 0) + (options.includeStories === true ? (dowry?.stories ?? 0) : 0),
      diaryEntries: diary.length,
      hasSoulKey: creature.wrapped !== null,
      alreadyGone: creature.gone !== null,
    };
  }

  /**
   * Il congedo vero. Non si annulla — e il pannello lo dice prima, con
   * l'anteprima di ciò che resterà.
   */
  public async farewell(
    householdId: string,
    gosinoId: string,
    options: DowryOptions = {},
  ): Promise<FarewellResult | undefined> {
    const [creature] = await this.db
      .select({ name: gosini.name, gone: gosini.retiredAt })
      .from(gosini)
      .where(and(eq(gosini.id, gosinoId), eq(gosini.householdId, householdId)));
    if (creature?.gone !== null) return undefined;

    // 1. ciò che resta, PRIMA di ciò che muore
    const { rows } = await this.dowries.legacyOf(gosinoId, householdId, options);
    let kept = 0;
    for (const row of rows) {
      await this.db.insert(memories).values({
        gosinoId,
        kind: row.kind,
        // riscritto con la chiave della CASA: sopravvive alla creatura
        text: encryptText(row.text, this.dataKey),
        importance: row.importance,
        sourceRefs: { legacy: true },
      });
      kept += 1;
    }

    // 2. l'involucro della chiave sparisce: qui la morte diventa matematica
    const destroyed = await this.db
      .update(gosini)
      .set({ wrappedSoulKey: null, retiredAt: new Date() })
      .where(and(eq(gosini.id, gosinoId), isNull(gosini.retiredAt)))
      .returning({ id: gosini.id });

    return {
      name: creature.name,
      legacyKept: kept,
      soulKeyDestroyed: destroyed.length > 0,
    };
  }
}
