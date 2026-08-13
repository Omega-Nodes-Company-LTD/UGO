import { beings, memories, memoryBeings, relations, type DbClient } from "@ugo/db";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { PreHandler } from "./guard.js";
import { exemplarsOf, householdScope } from "./scope.js";

/**
 * How the memories hang together, for the panel to draw (backlog gruppo 1).
 *
 * Three kinds of edge, all of them already modelled:
 *   memory → being    who a memory is about (`memory_beings`, ADR-014/024)
 *   being  → being    how people relate (`relations`)
 *   memory → memory   what replaced what (`superseded_by`, ADR-023)
 *
 * Labels are short on purpose: a graph shows the shape of what he knows, and
 * the full text stays in the archive below it. A node carries enough to be
 * recognised and no more.
 *
 * ADR-019 phase 2: one house's shape. Unscoped, this drew the neighbourhood as
 * a single graph — and unlike a wrong number, a wrong graph shows the names.
 */

/** A domestic pack does not need more, and a browser drawing by hand does. */
const NODE_CAP = 200;
const LABEL_MAX = 60;

export interface MemoryGraphDeps {
  db: DbClient;
  guard: PreHandler;
}

export interface GraphNode {
  id: string;
  type: "memory" | "being";
  label: string;
  kind: string | null;
  retired: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: "about" | "relation" | "superseded_by";
  label: string | null;
}

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= LABEL_MAX ? flat : `${flat.slice(0, LABEL_MAX - 1)}…`;
}

export function registerMemoryGraphRoutes(app: FastifyInstance, deps: MemoryGraphDeps): void {
  app.get("/v1/memories/graph", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const mine = exemplarsOf(deps.db, householdId);

    const memoryRows = await deps.db
      .select({
        id: memories.id,
        text: memories.text,
        kind: memories.kind,
        invalidatedAt: memories.invalidatedAt,
        supersededBy: memories.supersededBy,
      })
      .from(memories)
      .where(inArray(memories.gosinoId, mine))
      .orderBy(desc(memories.createdAt))
      .limit(NODE_CAP);

    const beingRows = await deps.db
      .select({ id: beings.id, name: beings.displayName, species: beings.species })
      .from(beings)
      .where(eq(beings.householdId, householdId));

    const nodes: GraphNode[] = [
      ...memoryRows.map((row) => ({
        id: row.id,
        type: "memory" as const,
        label: shorten(row.text),
        kind: row.kind,
        retired: row.invalidatedAt !== null,
      })),
      ...beingRows.map((row) => ({
        id: row.id,
        type: "being" as const,
        label: row.name,
        kind: row.species,
        retired: false,
      })),
    ];

    const present = new Set(nodes.map((node) => node.id));
    const memoryIds = memoryRows.map((row) => row.id);

    const aboutRows =
      memoryIds.length === 0
        ? []
        : await deps.db
            .select({ memoryId: memoryBeings.memoryId, beingId: memoryBeings.beingId })
            .from(memoryBeings)
            .where(inArray(memoryBeings.memoryId, memoryIds));

    const relationRows = await deps.db
      .select({
        a: relations.beingA,
        b: relations.beingB,
        type: relations.type,
        source: relations.source,
      })
      .from(relations)
      .where(eq(relations.householdId, householdId));

    const edges: GraphEdge[] = [
      ...aboutRows.map((row) => ({
        from: row.memoryId,
        to: row.beingId,
        type: "about" as const,
        label: null,
      })),
      ...relationRows.map((row) => ({
        from: row.a,
        to: row.b,
        type: "relation" as const,
        // the panel shows the owner what he said and what UGO worked out
        label: row.source === "dream" ? `${row.type} (dedotto)` : row.type,
      })),
      ...memoryRows.flatMap((row) =>
        row.supersededBy === null
          ? []
          : [
              {
                from: row.id,
                to: row.supersededBy,
                type: "superseded_by" as const,
                label: null,
              },
            ],
      ),
    ].filter((edge) => present.has(edge.from) && present.has(edge.to));

    return reply.send({ nodes, edges, truncated: memoryRows.length === NODE_CAP });
  });

  /** How many edges exist at all — the panel decides whether to offer the tab. */
  app.get("/v1/memories/graph/size", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const mine = exemplarsOf(deps.db, householdId);

    // memory_beings has no tenant column of its own: it reaches the house
    // through its memory (ADR-048 gives it one directly)
    const [links] = await deps.db
      .select({ total: sql<number>`count(*)::int` })
      .from(memoryBeings)
      .where(
        inArray(
          memoryBeings.memoryId,
          deps.db.select({ id: memories.id }).from(memories).where(inArray(memories.gosinoId, mine)),
        ),
      );
    const [supersessions] = await deps.db
      .select({ total: sql<number>`count(*)::int` })
      .from(memories)
      .where(and(isNotNull(memories.supersededBy), inArray(memories.gosinoId, mine)));
    const [inferred] = await deps.db
      .select({ total: sql<number>`count(*)::int` })
      .from(relations)
      .where(and(eq(relations.source, "dream"), eq(relations.householdId, householdId)));
    return reply.send({
      about: links?.total ?? 0,
      superseded: supersessions?.total ?? 0,
      inferredRelations: inferred?.total ?? 0,
    });
  });
}
