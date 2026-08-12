import { desires, events, type DbClient } from "@ugo/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { GosinoRegistry } from "../services/pack/runtimes.js";
import type { InitiativeSwitch } from "../services/volition/initiativeSwitch.js";
import type { PreHandler } from "./guard.js";

/**
 * What he decided, and why (ADR-034).
 *
 * ADR-027 already wrote down every initiative with the pressure that drove it
 * and its `because` in Italian — expressly so that an initiative could be
 * explained after the fact. Nothing read it back. This is the reading end:
 * without it "perché me l'ha chiesto?" had no answer short of a psql session.
 */

/** The journal lines that are about him having started something himself. */
const INITIATIVE_TYPES = [
  "initiative_taken",
  "initiative_worked",
  "initiative_flat",
  "reminder_voiced",
  "wants_out",
] as const;

const switchSchema = z.object({
  /** null hands the last word back to UGO_INITIATIVE */
  enabled: z.boolean().nullable(),
});

export interface VolitionRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  initiative: InitiativeSwitch;
  registry?: GosinoRegistry;
}

/**
 * Narrows a query to one exemplar. Absent means everyone, which is the
 * single-exemplar house and must keep reading exactly as it did (ADR-032).
 * `gosino_id` is NOT NULL with the seeded exemplar as default, so there is no
 * unattributed prehistory to fall back to.
 */
function mine(
  table: { gosinoId: unknown },
  id: string | undefined,
): ReturnType<typeof eq> | undefined {
  return id === undefined ? undefined : eq(table.gosinoId as never, id);
}

export function registerVolitionRoutes(app: FastifyInstance, deps: VolitionRoutesDeps): void {
  app.get("/v1/volition", { preHandler: deps.guard }, async (request, reply) => {
    const asked = (request.query as { gosino?: string }).gosino;
    const who = deps.registry?.resolve(asked);

    const journal = await deps.db
      .select({ ts: events.ts, type: events.type, payload: events.payload })
      .from(events)
      .where(and(inArray(events.type, [...INITIATIVE_TYPES]), mine(events, who?.id)))
      .orderBy(desc(events.ts))
      .limit(20);

    const wants = await deps.db
      .select({
        id: desires.id,
        text: desires.text,
        status: desires.status,
        dueAt: desires.dueAt,
        dueHint: desires.dueHint,
        createdAt: desires.createdAt,
      })
      .from(desires)
      .where(and(eq(desires.status, "pending"), mine(desires, who?.id)))
      .orderBy(desc(desires.createdAt))
      .limit(20);

    return reply.send({
      who: who === undefined ? undefined : { id: who.id, name: who.name, where: who.where },
      initiative: deps.initiative.state(),
      journal,
      desires: wants,
    });
  });

  app.post("/v1/volition/enabled", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = switchSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    deps.initiative.set(parsed.data.enabled ?? undefined);
    return reply.send(deps.initiative.state());
  });
}
