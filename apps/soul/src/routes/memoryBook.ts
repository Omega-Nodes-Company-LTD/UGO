import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MemoryBook } from "../services/memoryBook.js";
import type { PreHandler } from "./guard.js";
import { accountScope } from "./scope.js";

/**
 * Il libro dei ricordi dal pannello (ADR-086).
 *
 * `/v1/memories` risponde alla domanda «cosa ricorda **adesso**» e
 * `/v1/memories/graph` a «come sono legati». Questa risponde alla terza, che
 * è quella che una persona fa per prima e che non aveva risposta: «cosa
 * ricorda **di marzo**».
 */

const querySchema = z.object({
  gosino: z.string().optional(),
  /** `YYYY-MM` per un mese, `YYYY` per un anno; assente = la costa del libro */
  periodo: z
    .string()
    .regex(/^\d{4}(-\d{2})?$/u, "un periodo è AAAA o AAAA-MM")
    .optional(),
});

export interface MemoryBookDeps {
  db: DbClient;
  guard: PreHandler;
  dataKey: Buffer;
  /** ADR-035: i ricordi sono di una creatura, quindi il libro anche */
  registry?: {
    resolve: (
      query: string | undefined,
      accountId: string,
    ) => { id: string; name: string } | undefined;
  };
}

export function registerMemoryBookRoutes(app: FastifyInstance, deps: MemoryBookDeps): void {
  const book = new MemoryBook(deps.db, deps.dataKey);

  app.get("/v1/memories/book", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "periodo non valido" });
    const accountId = await accountScope(deps.db, request, reply);
    if (accountId === undefined) return reply;

    /**
     * Assente vuol dire **la casa intera**, non «il primo che capita»: i
     * ricordi sono di una creatura (ADR-032), e ripiegare sul più anziano
     * avrebbe risposto con la memoria di uno sotto il nome di tutti — lo
     * stesso scambio silenzioso che `/v1/memories` evita già.
     */
    const asked = parsed.data.gosino;
    const who =
      asked === undefined || asked === "" ? undefined : deps.registry?.resolve(asked, accountId);
    const scope = asked === undefined || asked === "" ? undefined : (who?.id ?? asked);

    if (parsed.data.periodo === undefined) {
      return reply.send({
        ...(who !== undefined && { gosino: { id: who.id, name: who.name } }),
        months: await book.spine(accountId, scope),
      });
    }
    return reply.send({
      ...(who !== undefined && { gosino: { id: who.id, name: who.name } }),
      period: parsed.data.periodo,
      memories: await book.page(accountId, scope, parsed.data.periodo),
    });
  });
}
