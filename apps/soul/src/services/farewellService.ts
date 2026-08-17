import { randomBytes } from "node:crypto";
import { diaryEntries, gosini, memories, type DbClient } from "@ugo/db";
import { encryptText, unwrapDataKey, wrapDataKey } from "@ugo/shared";
import { and, eq, isNull } from "drizzle-orm";
import { DowryService, type DowryOptions } from "./dowryService.js";

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
