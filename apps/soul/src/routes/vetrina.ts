import { withMarket, type DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PedigreeService } from "../services/pedigreeService.js";
import type { RegistryClient } from "../services/registryClient.js";
import { AdoptionService } from "../services/adoptionService.js";
import { VetrinaService } from "../services/vetrinaService.js";
import { guardBreeding } from "./breeding.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * La vetrina (ADR-083).
 *
 * Due lati, e sono asimmetrici apposta: **guardare è pubblico**, perché chi
 * guarda non ha ancora una casa — è il momento prima di averne una — e
 * **mettere in vetrina è dell'allevamento**, guardato come tutto il resto.
 */

const showSchema = z.object({
  listed: z.boolean(),
  /** in centesimi, perché i soldi non si scrivono in virgola mobile */
  priceCents: z.number().int().min(0).max(100_000_00).optional(),
});

export interface VetrinaRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  /** ADR-073: gli atti, per far vedere il pedigree a chi non ha ancora niente */
  chain?: RegistryClient;
}

export function registerVetrinaRoutes(app: FastifyInstance, deps: VetrinaRoutesDeps): void {

  /**
   * **Senza token**: è una vetrina. Quello che si vede è quello che si vede in
   * un allevamento vero — l'allevamento, i cuccioli, com'è fatto ognuno — e
   * niente delle case: nessuna persona, nessun ricordo, nessun conto.
   */
  app.get("/v1/vetrina", async (_request, reply) => {
    // ADR-097: chi guarda non ha una casa — la vetrina attraversa gli
    // allevamenti per disegno, e sotto RLS passa dal ruolo del mercato
    const allevamenti = await withMarket(deps.db, async (db) => {
      // ADR-084: le prenotazioni scadute tornano in vetrina proprio adesso, che
      // è il momento in cui qualcuno sta guardando — l'unico in cui la cosa conta
      await new AdoptionService(db).releaseExpired();
      return new VetrinaService(db).browse();
    });
    return reply.send({ allevamenti });
  });

  /**
   * Il pedigree di un cucciolo in vetrina, **pubblico come la vetrina**: chi
   * compra deve poter guardare da chi discende *prima* di comprare, ed è
   * l'unica ragione per cui un pedigree esiste. Fuori vetrina non risponde:
   * la genealogia delle creature di una casa resta di quella casa.
   */
  app.get("/v1/vetrina/:id/pedigree", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tree = await withMarket(deps.db, async (db) => {
      const listed = (await new VetrinaService(db).browse()).flatMap((kennel) => kennel.cubs);
      if (listed.find((one) => one.gosinoId === id) === undefined) return undefined;
      return (await new PedigreeService(db).ofListed(id)) ?? [];
    });
    if (tree === undefined) return reply.status(404).send({ error: "non è in vetrina" });
    const registered = await deps.chain?.actsFor(id);
    return reply.send({
      pedigree: tree,
      ...(registered !== undefined && { registered }),
    });
  });

  /** Metterlo, o toglierlo. È dell'allevamento: una casa non è un negozio. */
  app.post("/v1/gosini/:id/vetrina", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = showSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        if (!(await guardBreeding(db, accountId, "alleva", reply))) return "denied" as const;
        const shown = await new VetrinaService(db).show(
          accountId,
          id,
          parsed.data.listed,
          parsed.data.priceCents,
        );
        return shown ?? ("unfit" as const);
      },
    );
    if (done === undefined) return reply;
    if (done === "denied") return reply;
    if (done === "unfit") {
      return reply.status(422).send({
        error: "non si può mettere in vetrina",
        detail: "in vetrina ci va un nato di questa casa, e un capostipite non si vende",
      });
    }
    return reply.send(done);
  });
}
