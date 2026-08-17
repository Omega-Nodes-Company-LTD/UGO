import { births, gosini, traitSets, type DbClient } from "@ugo/db";
import { genomeHash, verdictFor, type BirthCertificate, type LineageVerdict } from "@ugo/shared";
import { and, asc, eq, inArray } from "drizzle-orm";

/**
 * Reading a pedigree (ADR-070): walk up the lineage and say, for every edge,
 * whether the parent really attested that birth.
 *
 * The certificate is never stored — it is rebuilt from the rows and checked
 * against the signature, so there is exactly one truth. A `unsigned` edge is
 * an honest ancestor (a founder, or a birth from before this ADR); only
 * `invalid` means somebody edited the database.
 */

export interface PedigreeNode {
  id: string;
  name: string;
  generation: number;
  bornAt: string;
  /** the fingerprint the parents signed, so it can be compared by hand */
  genomeHash?: string;
  parents: { id: string; name: string; verdict: LineageVerdict }[];
}

const MAX_GENERATIONS = 8;

export class PedigreeService {
  public constructor(private readonly db: DbClient) {}

  /**
   * `undefined` when the exemplar is not this house's: a pedigree that is not
   * yours does not exist, rather than being forbidden.
   */
  public async of(
    householdId: string,
    gosinoId: string,
    generations = 4,
  ): Promise<PedigreeNode[] | undefined> {
    const depth = Math.min(Math.max(1, generations), MAX_GENERATIONS);
    const [root] = await this.db
      .select({ id: gosini.id })
      .from(gosini)
      .where(and(eq(gosini.id, gosinoId), eq(gosini.householdId, householdId)));
    if (root === undefined) return undefined;

    const nodes: PedigreeNode[] = [];
    const seen = new Set<string>();
    let frontier = [gosinoId];

    for (let level = 0; level < depth && frontier.length > 0; level += 1) {
      const fresh = frontier.filter((id) => !seen.has(id));
      fresh.forEach((id) => seen.add(id));
      if (fresh.length === 0) break;

      const rows = await this.db
        .select({
          id: gosini.id,
          name: gosini.name,
          generation: gosini.generation,
          bornAt: gosini.bornAt,
        })
        .from(gosini)
        .where(and(eq(gosini.householdId, householdId), inArray(gosini.id, fresh)));

      const next: string[] = [];
      for (const row of rows) {
        const node = await this.nodeFor(householdId, row);
        nodes.push(node);
        next.push(...node.parents.map((parent) => parent.id));
      }
      frontier = next;
    }
    return nodes;
  }

  private async nodeFor(
    householdId: string,
    row: { id: string; name: string; generation: number; bornAt: Date },
  ): Promise<PedigreeNode> {
    const [genome] = await this.db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, row.id))
      .orderBy(asc(traitSets.version))
      .limit(1);

    const edges = await this.db
      .select({
        parentId: births.parentGosinoId,
        signature: births.signature,
        parentPublicKey: births.parentPublicKey,
        parentName: gosini.name,
      })
      .from(births)
      .innerJoin(gosini, eq(gosini.id, births.parentGosinoId))
      .where(and(eq(births.childGosinoId, row.id), eq(births.householdId, householdId)))
      .orderBy(asc(births.parentGosinoId));

    const hash = genome === undefined ? undefined : genomeHash(genome.traits);
    const certificate: BirthCertificate = {
      childId: row.id,
      genomeHash: hash ?? "",
      parentIds: edges.map((edge) => edge.parentId),
      bornAt: row.bornAt.toISOString(),
      generation: row.generation,
    };

    return {
      id: row.id,
      name: row.name,
      generation: row.generation,
      bornAt: row.bornAt.toISOString(),
      ...(hash !== undefined && { genomeHash: hash }),
      parents: edges.map((edge) => ({
        id: edge.parentId,
        name: edge.parentName,
        verdict: verdictFor(certificate, edge.signature, edge.parentPublicKey),
      })),
    };
  }
}
