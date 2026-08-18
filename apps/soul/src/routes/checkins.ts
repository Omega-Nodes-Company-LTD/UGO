import { checkins, gosini, type DbClient } from "@ugo/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

/**
 * Le domande che tornano, dal pannello (ADR-085).
 *
 * Si **mettono a voce** — è un gesto, come le liste e i timer — e da qui si
 * guardano e si tolgono. Non è una svista: una cosa che si fa vivo da solo
 * tutti i giorni deve essere visibile in un posto dove si può anche
 * fermarla, altrimenti l'unico modo per scoprire quante ne ha in piedi è
 * aspettare che le chieda.
 */

export interface CheckinRoutesDeps {
  db: DbClient;
  guard: PreHandler;
}

/**
 * Di chi si stanno guardando le domande.
 *
 * Si legge dal database e non dal registro dei runtime: il registro è la
 * mappa di chi è **acceso adesso**, e una casa il cui processo non ha ancora
 * caricato i suoi esemplari avrebbe visto un pannello vuoto invece delle sue
 * domande — cioè avrebbe creduto di non averne.
 */
async function which(
  db: DbClient,
  householdId: string,
  query: string | undefined,
): Promise<{ id: string; name: string } | undefined> {
  const here = await db
    .select({ id: gosini.id, name: gosini.name })
    .from(gosini)
    .where(and(eq(gosini.householdId, householdId), isNull(gosini.retiredAt)))
    .orderBy(asc(gosini.bornAt));
  if (query !== undefined && query !== "") {
    const wanted = query.trim().toLowerCase();
    const found = here.find((row) => row.id === query || row.name.toLowerCase() === wanted);
    if (found !== undefined) return found;
  }
  // il più anziano di QUESTA casa, come fa il resto del pannello
  return here[0];
}

export function registerCheckinRoutes(app: FastifyInstance, deps: CheckinRoutesDeps): void {
  app.get("/v1/checkins", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const query = request.query as { gosino?: string };
    const who = await which(deps.db, householdId, query.gosino);
    if (who === undefined) return reply.send({ checkins: [] });

    const rows = await deps.db
      .select({
        id: checkins.id,
        question: checkins.question,
        hour: checkins.hour,
        minute: checkins.minute,
        weekday: checkins.weekday,
        enabled: checkins.enabled,
        lastAskedOn: checkins.lastAskedOn,
      })
      .from(checkins)
      .where(eq(checkins.gosinoId, who.id))
      .orderBy(asc(checkins.hour), asc(checkins.minute));

    return reply.send({ gosino: { id: who.id, name: who.name }, checkins: rows });
  });

  app.delete("/v1/checkins/:id", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const { id } = request.params as { id: string };

    /**
     * La riga dice già di chi è, quindi qui non si chiede «quale esemplare»:
     * si controlla che quell'esemplare sia di questa casa. Cancellare per id
     * senza questo giro vorrebbe dire spegnere le domande del vicino.
     */
    const [owned] = await deps.db
      .select({ id: checkins.id })
      .from(checkins)
      .innerJoin(gosini, eq(gosini.id, checkins.gosinoId))
      .where(and(eq(checkins.id, id), eq(gosini.householdId, householdId)));
    if (owned === undefined) return reply.status(404).send({ error: "non esiste" });

    await deps.db.delete(checkins).where(eq(checkins.id, id));
    return reply.send({ removed: true });
  });
}
