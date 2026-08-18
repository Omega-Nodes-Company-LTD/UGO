import { actEfficacy, desires, events, type DbClient } from "@ugo/db";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { GosinoRegistry } from "../services/pack/runtimes.js";
import type { InitiativeSwitch } from "../services/volition/initiativeSwitch.js";
import type { PreHandler } from "./guard.js";
import { exemplarsOf, inAccount } from "./scope.js";

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
 * Narrows a query to one exemplar, or — when nobody was named — to the house
 * (ADR-019 phase 2). "Absent means everyone" used to mean everyone in the
 * *database*: right while one family lived here, and a leak the day a second
 * one arrived.
 *
 * The `as never` casts are gone with the column types: `gosino_id` was typed
 * `unknown` by the schema helper, which is exactly what made a cast look
 * necessary here.
 */
function mine(
  db: DbClient,
  column: PgColumn,
  id: string | undefined,
  accountId: string,
): SQL | undefined {
  return id === undefined ? inArray(column, exemplarsOf(db, accountId)) : eq(column, id);
}

export function registerVolitionRoutes(app: FastifyInstance, deps: VolitionRoutesDeps): void {
  app.get("/v1/volition", { preHandler: deps.guard }, async (request, reply) => {
    const asked = (request.query as { gosino?: string }).gosino;
    const body = await inAccount(deps.db, request, reply, {}, async (db, accountId) => {
      const who = deps.registry?.resolve(asked, accountId);

      const journal = await db
        .select({ ts: events.ts, type: events.type, payload: events.payload })
        .from(events)
        .where(
          and(inArray(events.type, [...INITIATIVE_TYPES]), mine(db, events.gosinoId, who?.id, accountId)),
        )
        .orderBy(desc(events.ts))
        .limit(20);

      const wants = await db
        .select({
          id: desires.id,
          text: desires.text,
          status: desires.status,
          // ADR-078: un timer non è un desiderio, e il pannello lo deve dire
          kind: desires.kind,
          dueAt: desires.dueAt,
          dueHint: desires.dueHint,
          createdAt: desires.createdAt,
        })
        .from(desires)
        .where(and(eq(desires.status, "pending"), mine(db, desires.gosinoId, who?.id, accountId)))
        .orderBy(desc(desires.createdAt))
        .limit(20);

      return {
        who: who === undefined ? undefined : { id: who.id, name: who.name, where: who.where },
        initiative: deps.initiative.state(),
        journal,
        desires: wants,
      };
    });
    if (body === undefined) return reply;
    return reply.send(body);
  });

  /**
   * ADR-058: cosa gli è piaciuto fare.
   *
   * Esiste per una ragione precisa: **un apprendimento che nessuno può guardare
   * è una scatola nera che nessuno può smentire.** Se UGO comincia a preferire
   * un gesto, il proprietario deve poter vedere quale e quanto — altrimenti
   * l'unica cosa che potrà dire è «mi sembra che ultimamente…».
   */
  app.get("/v1/volition/efficacy", { preHandler: deps.guard }, async (request, reply) => {
    const asked = (request.query as { gosino?: string }).gosino;
    const rows = await inAccount(deps.db, request, reply, {}, (db, accountId) => {
      const who = deps.registry?.resolve(asked, accountId);
      return db
        .select({ act: actEfficacy.act, weight: actEfficacy.weight })
        .from(actEfficacy)
        .where(mine(db, actEfficacy.gosinoId, who?.id, accountId));
    });
    if (rows === undefined) return reply;
    return reply.send({ efficacy: rows });
  });

  app.post("/v1/volition/enabled", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = switchSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    deps.initiative.set(parsed.data.enabled ?? undefined);
    return reply.send(deps.initiative.state());
  });
}
