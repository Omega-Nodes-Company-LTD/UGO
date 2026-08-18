import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { DiaryService } from "../services/diaryService.js";
import type { GosinoRegistry } from "../services/pack/runtimes.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

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
  app.get("/v1/diary", { preHandler: deps.guard }, async (request, reply) => {
    const query = request.query as { gosino?: string; giorni?: string };
    const asked = Number(query.giorni);
    const limit = Number.isFinite(asked) && asked > 0 ? Math.min(MAX_PAGES, asked) : 30;

    // ADR-062: servizio costruito sulla transazione che dichiara la casa
    const body = await inAccount(deps.db, request, reply, {}, async (db, accountId) => {
      const who = deps.registry?.resolve(query.gosino, accountId);
      const pages = await new DiaryService(db, deps.dataKey).pages(accountId, who?.id, { limit });
      return {
        ...(who !== undefined && { gosino: { id: who.id, name: who.name } }),
        pages,
      };
    });
    if (body === undefined) return reply;
    return reply.send(body);
  });
}
