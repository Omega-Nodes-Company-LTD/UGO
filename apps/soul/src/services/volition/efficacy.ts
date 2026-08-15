import {
  actEfficacy,
  EFFICACY_MAX,
  EFFICACY_MIN,
  FLAT_STEP,
  NIGHTLY_DECAY,
  PRAISE_STEP,
  type DbClient,
} from "@ugo/db";
import { eq, sql } from "drizzle-orm";

/**
 * Quanto bene gli è andata, atto per atto (ADR-058).
 *
 * ⚠️ Da scriverlo con queste parole, e resterà scritto: **non è apprendimento in
 * nessun senso generale.** È un peso di preferenza su nove atti cablati,
 * limitato a ±40%, che decade verso 1 ogni notte. Non inventa comportamenti,
 * non cambia il carattere, non tocca `trait_sets`. Riordina atti che si
 * somigliano già come punteggio.
 *
 * Due sorgenti, e una delle due **esisteva già inutilizzata**: `scoreLast` in
 * `volitionService` misura da sempre se un'iniziativa ha davvero abbassato la
 * pressione a cui mirava, scrive `initiative_worked` / `initiative_flat` — e
 * non lo rileggeva nessuno. L'altra è la mela.
 *
 * Il tick scrive, il sogno decade. Mettere il decadimento nel tick renderebbe
 * il tasso dipendente da quanto spesso gira il tick, cioè un incidente di
 * configurazione travestito da parametro di carattere.
 */

const clamp = (value: number): number =>
  value < EFFICACY_MIN ? EFFICACY_MIN : value > EFFICACY_MAX ? EFFICACY_MAX : value;

export class EfficacyService {
  public constructor(
    private readonly db: DbClient,
    private readonly gosinoId: string,
  ) {}

  /** I pesi, come `decide()` li vuole. Un atto senza riga vale 1. */
  public async weights(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ act: actEfficacy.act, weight: actEfficacy.weight })
      .from(actEfficacy)
      .where(eq(actEfficacy.gosinoId, this.gosinoId));
    return Object.fromEntries(rows.map((row) => [row.act, row.weight]));
  }

  /**
   * Un atto è andato bene, o è caduto nel vuoto.
   *
   * `praise` sposta il doppio di `flat`, e non è generosità: `scoreLast` è una
   * misura **rumorosa** — una pressione può calare da sola, e un'iniziativa
   * innocua si prenderebbe il merito. Un dito su un muso invece non succede per
   * caso.
   */
  public async nudge(act: string, direction: "praise" | "flat"): Promise<number> {
    const step = direction === "praise" ? PRAISE_STEP : -FLAT_STEP;
    const [row] = await this.db
      .insert(actEfficacy)
      .values({ gosinoId: this.gosinoId, act, weight: clamp(1 + step) })
      .onConflictDoUpdate({
        target: [actEfficacy.gosinoId, actEfficacy.act],
        // il fermo lo applica anche SQL: il `check` del database rifiuterebbe
        // comunque, ma un rifiuto a runtime su un tick notturno è un job che
        // muore invece di un peso che si ferma
        set: {
          weight: sql`least(${EFFICACY_MAX}, greatest(${EFFICACY_MIN}, ${actEfficacy.weight} + ${step}))`,
          updatedAt: new Date(),
        },
      })
      .returning({ weight: actEfficacy.weight });
    return row?.weight ?? 1;
  }

  /**
   * La notte: ogni peso torna un po' verso 1.
   *
   * Senza, un atto premiato una volta resterebbe preferito per sempre e la casa
   * si fisserebbe sulla prima cosa che le è piaciuta. Il decadimento è ciò che
   * rende la preferenza una *tendenza recente* invece di una decisione presa
   * una sera di agosto.
   */
  public async decay(): Promise<number> {
    const moved = await this.db
      .update(actEfficacy)
      .set({
        weight: sql`${actEfficacy.weight} + (1 - ${actEfficacy.weight}) * ${NIGHTLY_DECAY}`,
        updatedAt: new Date(),
      })
      .where(eq(actEfficacy.gosinoId, this.gosinoId))
      .returning({ act: actEfficacy.act });
    return moved.length;
  }
}
