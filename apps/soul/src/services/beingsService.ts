import {
  beings,
  corrections,
  events,
  gosini,
  recognitionProfiles,
  relations,
  type DbClient,
} from "@ugo/db";
import { SYMMETRIC_RELATION_TYPES, type RelationType } from "@ugo/shared";
import { and, asc, eq, inArray } from "drizzle-orm";

/**
 * Mutations on the pack (ADR-014/016). The interesting rule lives here rather
 * than in the route: when somebody withdraws consent — they are marked as a
 * minor, or ask not to be listened to — the voiceprint is **destroyed**, not
 * merely ignored from then on. A protection that only stops future use leaves
 * the biometric sitting in the database, which is the thing it exists to
 * prevent.
 */

export class BeingNotFoundError extends Error {}

export interface BeingPatch {
  displayName?: string | undefined;
  species?: string | undefined;
  kind?: "resident" | "visitor" | "unknown" | undefined;
  arrivalAt?: string | undefined;
  isMinor?: boolean | undefined;
  noVision?: boolean | undefined;
  noAudio?: boolean | undefined;
  aliases?: string[] | undefined;
  notes?: string | undefined;
}

export interface UpdateReport {
  beingId: string;
  /** voice profiles destroyed because consent was withdrawn */
  biometricsDestroyed: number;
}

export class BeingsService {
  /**
   * ADR-019 phase 2: the house is the boundary, and it is not optional. The
   * exemplar a correction is attributed to used to be `PRIME_GOSINO_ID`
   * regardless of who was asking — so a correction made in one house was
   * recorded against another house's creature. It is the house's eldest now;
   * attributing it to the exemplar that was actually spoken to is phase 3.
   */
  public constructor(
    private readonly db: DbClient,
    private readonly householdId: string,
  ) {}

  private async eldestExemplar(): Promise<string> {
    const [eldest] = await this.db
      .select({ id: gosini.id })
      .from(gosini)
      .where(eq(gosini.householdId, this.householdId))
      .orderBy(asc(gosini.bornAt))
      .limit(1);
    if (eldest === undefined) throw new Error(`household ${this.householdId} has no exemplar`);
    return eldest.id;
  }

  /** A being of this house, or nothing — never one of the neighbours' by id. */
  private mine(beingId: string) {
    return and(eq(beings.id, beingId), eq(beings.householdId, this.householdId));
  }

  public async update(beingId: string, patch: BeingPatch, at = new Date()): Promise<UpdateReport> {
    const [existing] = await this.db.select().from(beings).where(this.mine(beingId));
    if (existing === undefined) throw new BeingNotFoundError(beingId);

    const [updated] = await this.db
      .update(beings)
      .set(patch)
      .where(this.mine(beingId))
      .returning({ isMinor: beings.isMinor, noAudio: beings.noAudio });

    let biometricsDestroyed = 0;
    if (updated?.isMinor === true || updated?.noAudio === true) {
      biometricsDestroyed = await this.destroyVoice(beingId);
      if (biometricsDestroyed > 0) {
        // audit with ids and counts only, never a name (NIS2)
        await this.db.insert(events).values({
          gosinoId: await this.eldestExemplar(),
          ts: at,
          source: "system",
          type: "biometrics_withdrawn",
          payload: { beingId, profiles: biometricsDestroyed, reason: updated.isMinor ? "minor" : "no_audio" },
        });
      }
    }
    return { beingId, biometricsDestroyed };
  }

  /**
   * "Cancella la mia voce ma resto nel branco": the middle ground erasure.
   *
   * ADR-057: la modalità è un argomento perché adesso ce ne sono due, e la
   * differenza conta — «non guardarmi più» e «non ascoltarmi più» sono due
   * consensi distinti, e una funzione sola che ne cancella uno solo li
   * confonderebbe esattamente come `_guard` li ha confusi per mesi.
   */
  public async destroyRecognition(
    beingId: string,
    modality: "voice" | "face",
  ): Promise<number> {
    // recognition_profiles has no tenant column of its own: it reaches the
    // house through its being (ADR-048 gives it one directly)
    const removed = await this.db
      .delete(recognitionProfiles)
      .where(
        and(
          eq(recognitionProfiles.beingId, beingId),
          eq(recognitionProfiles.modality, modality),
          inArray(
            recognitionProfiles.beingId,
            this.db
              .select({ id: beings.id })
              .from(beings)
              .where(eq(beings.householdId, this.householdId)),
          ),
        ),
      )
      .returning({ id: recognitionProfiles.id });
    return removed.length;
  }

  /** Retrocompatibile: la voce è ancora la modalità di gran lunga più usata. */
  public async destroyVoice(beingId: string): Promise<number> {
    return this.destroyRecognition(beingId, "voice");
  }

  /**
   * Symmetric relations are normalized here so the caller never has to know:
   * partner_of(B,A) is stored as partner_of(A,B), and the database check that
   * forbids the mirror image is never hit by an honest request.
   */
  public async link(beingA: string, beingB: string, type: RelationType, strength = 1): Promise<void> {
    const symmetric = (SYMMETRIC_RELATION_TYPES as readonly string[]).includes(type);
    const swap = symmetric && beingA > beingB;
    const a = swap ? beingB : beingA;
    const b = swap ? beingA : beingB;
    await this.db
      .insert(relations)
      .values({ householdId: this.householdId, beingA: a, beingB: b, type, strength })
      .onConflictDoUpdate({
        target: [relations.beingA, relations.beingB, relations.type],
        set: { strength },
      });
  }

  public async unlink(relationId: string): Promise<void> {
    await this.db
      .delete(relations)
      .where(and(eq(relations.id, relationId), eq(relations.householdId, this.householdId)));
  }

  public async listRelations(): Promise<
    { id: string; beingA: string; beingB: string; type: string; strength: number }[]
  > {
    return this.db
      .select({
        id: relations.id,
        beingA: relations.beingA,
        beingB: relations.beingB,
        type: relations.type,
        strength: relations.strength,
      })
      .from(relations)
      .where(eq(relations.householdId, this.householdId));
  }

  public async recentCorrections(limit = 10): Promise<
    { id: string; signal: string; aboutBeing: string | null; createdAt: Date }[]
  > {
    return this.db
      .select({
        id: corrections.id,
        signal: corrections.signal,
        aboutBeing: corrections.aboutBeing,
        createdAt: corrections.createdAt,
      })
      .from(corrections)
      .where(
        inArray(
          corrections.gosinoId,
          this.db
            .select({ id: gosini.id })
            .from(gosini)
            .where(eq(gosini.householdId, this.householdId)),
        ),
      )
      .limit(limit);
  }
}
