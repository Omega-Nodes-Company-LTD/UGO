import { beings, bonds, corrections, gosini, relations, traitSets, type DbClient } from "@ugo/db";
import { PRIME_GOSINO_ID } from "@ugo/db";
import { profileFor, type SpeciesMap } from "@ugo/shared";
import { and, desc, eq, inArray, or } from "drizzle-orm";

/**
 * The pack as UGO needs to see it (ADR-014/016). Blocks 3-bis of §5.5: they
 * come after identity and psyche, before the conversation, and are never
 * cached — the pack is exactly the part that changes.
 */

const RECENT_CORRECTIONS = 5;

export interface PresentBeing {
  id: string;
  displayName: string;
  species: string;
  familiarity: number;
  affinity: number;
}

export interface SelfView {
  name: string;
  locationLabel: string | null;
  traitVersion: number | null;
}

export class PackService {
  public constructor(
    private readonly db: DbClient,
    private readonly speciesMap: SpeciesMap,
    private readonly gosinoId: string = PRIME_GOSINO_ID,
  ) {}

  /** "Chi sono io": which exemplar is speaking, and with which genome. */
  public async self(): Promise<SelfView> {
    const [me] = await this.db
      .select({ name: gosini.name, locationLabel: gosini.locationLabel })
      .from(gosini)
      .where(eq(gosini.id, this.gosinoId));
    const [traits] = await this.db
      .select({ version: traitSets.version })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, this.gosinoId))
      .orderBy(desc(traitSets.version))
      .limit(1);
    return {
      name: me?.name ?? "ugo",
      locationLabel: me?.locationLabel ?? null,
      traitVersion: traits?.version ?? null,
    };
  }

  /** The beings in the room, with THIS exemplar's opinion of each. */
  public async present(beingIds: readonly string[]): Promise<PresentBeing[]> {
    if (beingIds.length === 0) return [];
    const rows = await this.db
      .select({
        id: beings.id,
        displayName: beings.displayName,
        species: beings.species,
        familiarity: bonds.familiarity,
        affinity: bonds.affinity,
      })
      .from(beings)
      .leftJoin(bonds, and(eq(bonds.beingId, beings.id), eq(bonds.gosinoId, this.gosinoId)))
      .where(inArray(beings.id, [...beingIds]));
    return rows.map((row) => ({
      ...row,
      familiarity: row.familiarity ?? 0,
      affinity: row.affinity ?? 0,
    }));
  }

  /** Only the edges that involve someone present: the rest is noise. */
  public async relationsAmong(
    beingIds: readonly string[],
  ): Promise<{ a: string; b: string; type: string }[]> {
    if (beingIds.length === 0) return [];
    const ids = [...beingIds];
    const rows = await this.db
      .select({ a: relations.beingA, b: relations.beingB, type: relations.type })
      .from(relations)
      .where(or(inArray(relations.beingA, ids), inArray(relations.beingB, ids)));
    return rows;
  }

  public async recentCorrections(
    beingIds: readonly string[],
  ): Promise<{ signal: string; aboutBeing: string | null }[]> {
    const query = this.db
      .select({ signal: corrections.signal, aboutBeing: corrections.aboutBeing })
      .from(corrections)
      .where(eq(corrections.gosinoId, this.gosinoId))
      .orderBy(desc(corrections.createdAt))
      .limit(RECENT_CORRECTIONS);
    const rows = await query;
    if (beingIds.length === 0) return rows;
    const present = new Set(beingIds);
    return rows.filter((row) => row.aboutBeing === null || present.has(row.aboutBeing));
  }

  /** One species rule per species actually in the room — never the whole map. */
  public speciesRules(present: readonly PresentBeing[]): string[] {
    const seen = new Set<string>();
    const rules: string[] = [];
    for (const being of present) {
      if (seen.has(being.species)) continue;
      seen.add(being.species);
      rules.push(profileFor(this.speciesMap, being.species).rule);
    }
    return rules;
  }
}
