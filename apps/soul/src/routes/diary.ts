import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { DiaryService } from "../services/diaryService.js";
import type { GosinoRegistry } from "../services/pack/runtimes.js";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

/**
 * Il libro della vita (ADR-079): il lato che legge.
 *
 * Il diario esisteva da PROGETTO §5.6 e non usciva da nessuna rotta. Adesso
 * esce da qui, guardato e scopato per casa — è la cosa più intima che UGO
 * scriva, e una rotta aperta su questo sarebbe peggio di non averla.
 */

const MAX_PAGES = 120;

export interface DiaryRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  dataKey: Buffer;
  /** per rispondere di CHI si sta guardando il diario (ADR-035) */
  registry?: GosinoRegistry;
}

export function registerDiaryRoutes(app: FastifyInstance, deps: DiaryRoutesDeps): void {
  const diary = new DiaryService(deps.db, deps.dataKey);

  app.get("/v1/diary", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const query = request.query as { gosino?: string; giorni?: string };
    const who = deps.registry?.resolve(query.gosino, householdId);
    const asked = Number(query.giorni);
    const limit = Number.isFinite(asked) && asked > 0 ? Math.min(MAX_PAGES, asked) : 30;

    const pages = await diary.pages(householdId, who?.id, { limit });
    return reply.send({
      ...(who !== undefined && { gosino: { id: who.id, name: who.name } }),
      pages,
    });
  });
}
