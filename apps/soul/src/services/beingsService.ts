import { beings, corrections, events, recognitionProfiles, relations, type DbClient } from "@ugo/db";
import { SYMMETRIC_RELATION_TYPES, type RelationType } from "@ugo/shared";
import { and, eq } from "drizzle-orm";

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
  public constructor(
    private readonly db: DbClient,
    private readonly gosinoId: string,
  ) {}

  public async update(beingId: string, patch: BeingPatch, at = new Date()): Promise<UpdateReport> {
    const [existing] = await this.db.select().from(beings).where(eq(beings.id, beingId));
    if (existing === undefined) throw new BeingNotFoundError(beingId);

    const [updated] = await this.db
      .update(beings)
      .set(patch)
      .where(eq(beings.id, beingId))
      .returning({ isMinor: beings.isMinor, noAudio: beings.noAudio });

    let biometricsDestroyed = 0;
    if (updated?.isMinor === true || updated?.noAudio === true) {
      biometricsDestroyed = await this.destroyVoice(beingId);
      if (biometricsDestroyed > 0) {
        // audit with ids and counts only, never a name (NIS2)
        await this.db.insert(events).values({
          ts: at,
          source: "system",
          type: "biometrics_withdrawn",
          payload: { beingId, profiles: biometricsDestroyed, reason: updated.isMinor ? "minor" : "no_audio" },
        });
      }
    }
    return { beingId, biometricsDestroyed };
  }

  /** "Cancella la mia voce ma resto nel branco": the middle ground erasure. */
  public async destroyVoice(beingId: string): Promise<number> {
    const removed = await this.db
      .delete(recognitionProfiles)
      .where(and(eq(recognitionProfiles.beingId, beingId), eq(recognitionProfiles.modality, "voice")))
      .returning({ id: recognitionProfiles.id });
    return removed.length;
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
      .values({ beingA: a, beingB: b, type, strength })
      .onConflictDoUpdate({
        target: [relations.beingA, relations.beingB, relations.type],
        set: { strength },
      });
  }

  public async unlink(relationId: string): Promise<void> {
    await this.db.delete(relations).where(eq(relations.id, relationId));
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
      .from(relations);
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
      .where(eq(corrections.gosinoId, this.gosinoId))
      .limit(limit);
  }
}
