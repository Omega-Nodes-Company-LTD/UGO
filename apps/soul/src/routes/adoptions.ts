import { gosini, traitSets, type DbClient } from "@ugo/db";
import { genomeHash, holderHash } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AdoptionService } from "../services/adoptionService.js";
import type { RegistryClient } from "../services/registryClient.js";
import { TransferService } from "../services/transferService.js";
import { guardBreeding } from "./breeding.js";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

/**
 * L'adozione (ADR-084): il gesto che lega la vetrina alla consegna.
 *
 * La prenotazione è **pubblica**, come la vetrina, e per la stessa ragione:
 * chi sceglie un cucciolo non ha ancora una casa — ce l'avrà *perché* ha
 * scelto. È l'unica rotta del sistema che fa nascere una casa senza un token,
 * ed è guardata da altro: si può prenotare solo ciò che è in vetrina, un
 * cucciolo per volta, e la prenotazione **scade**.
 *
 * Tutto il resto — pagamento, consegna, annullamento — è dell'allevamento.
 */

const bookingSchema = z.object({
  casa: z.object({
    slug: z
      .string()
      .min(3)
      .max(60)
      .regex(/^[a-z0-9-]+$/u, "solo minuscole, cifre e trattini"),
    nome: z.string().min(1).max(120),
    timezone: z.string().min(1).max(60).optional(),
  }),
});

const paymentSchema = z.object({ riferimento: z.string().min(1).max(200) });

export interface AdoptionRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  /**
   * Far nascere la casa di chi compra. È la stessa `createHousehold` del
   * pannello e della riga di comando — iniettata perché serve la chiave madre,
   * che il server non possiede.
   */
  createHouse?: (input: {
    slug: string;
    name: string;
    timezone?: string | undefined;
  }) => Promise<{ householdId: string; ownerToken: string }>;
  registry?: { reload: () => Promise<void> };
  chain?: RegistryClient;
}

export function registerAdoptionRoutes(app: FastifyInstance, deps: AdoptionRoutesDeps): void {
  const adoptions = new AdoptionService(deps.db);
  const transfers = new TransferService(deps.db);

  /**
   * Prenotare: nasce la casa, si apre la pratica, e il cucciolo **esce dalla
   * vetrina**. Uscire subito è la parte che conta: una vetrina che continua a
   * mostrare un cucciolo già scelto produce due famiglie che credono di
   * averlo, e una delle due lo scopre dopo aver pagato.
   */
  app.post("/v1/vetrina/:id/prenota", async (request, reply) => {
    const parsed = bookingSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    if (deps.createHouse === undefined) {
      return reply.status(501).send({ error: "le case non si creano su questo server" });
    }
    const { id } = request.params as { id: string };

    // le prenotazioni scadute tornano in vetrina proprio adesso: è il momento
    // in cui qualcuno sta guardando, ed è l'unico in cui la cosa importa
    await adoptions.releaseExpired();

    const [cub] = await deps.db
      .select({ listed: gosini.listedAt, name: gosini.name })
      .from(gosini)
      .where(eq(gosini.id, id));
    if (cub?.listed == null) {
      return reply.status(404).send({ error: "non è in vetrina", detail: "non è più disponibile" });
    }

    let house;
    try {
      house = await deps.createHouse({
        slug: parsed.data.casa.slug,
        name: parsed.data.casa.nome,
        ...(parsed.data.casa.timezone !== undefined && { timezone: parsed.data.casa.timezone }),
      });
    } catch {
      // lo slug è l'unica cosa che può collidere, ed è una cosa che chi
      // prenota può correggere da solo
      return reply
        .status(409)
        .send({ error: "nome già preso", detail: "quel nome di casa esiste già, scegline un altro" });
    }

    const booked = await adoptions.reserve(id, house.householdId);
    if (booked === undefined) {
      return reply.status(409).send({ error: "non è più disponibile" });
    }

    return reply.status(201).send({
      adozione: booked.id,
      gosino: { id, name: cub.name },
      prezzo: booked.priceCents === null ? null : { centesimi: booked.priceCents, valuta: "EUR" },
      /** in chiaro **una volta sola**, come ogni token di proprietario */
      token: house.ownerToken,
      casa: house.householdId,
    });
  });

  /** Le pratiche di questa casa: quelle che cede e quelle che riceve. */
  app.get("/v1/adozioni", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    return reply.send({ adozioni: await adoptions.of(householdId) });
  });

  /**
   * Il pagamento. **Non è un gateway**: è il punto in cui l'allevamento dice
   * di aver visto i soldi, con il riferimento che li identifica — un bonifico,
   * una ricevuta, un id di un incasso. Il giorno che ci sarà un incassatore
   * automatico chiamerà questa stessa rotta, ed è precisamente perché esiste
   * che quel giorno non serviranno altre porte.
   */
  app.post("/v1/adozioni/:id/pagamento", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = paymentSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    if (!(await guardBreeding(deps.db, householdId, "alleva", reply))) return reply;

    const pratica = await adoptions.ofKennel(householdId, id);
    if (pratica === undefined) return reply.status(404).send({ error: "non esiste" });
    if (!(await adoptions.markPaid(id, parsed.data.riferimento))) {
      return reply.status(409).send({ error: `non è prenotata: è ${pratica.status}` });
    }
    return reply.send({ status: "pagata" });
  });

  /**
   * La consegna: **qui la creatura cambia casa davvero** (ADR-082) e l'atto va
   * in catena.
   *
   * Non si consegna quello che non è stato pagato, e non per burocrazia: la
   * consegna è irreversibile e il pagamento no.
   */
  app.post("/v1/adozioni/:id/consegna", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    if (!(await guardBreeding(deps.db, householdId, "alleva", reply))) return reply;

    const pratica = await adoptions.ofKennel(householdId, id);
    if (pratica === undefined) return reply.status(404).send({ error: "non esiste" });
    if (pratica.status !== "pagata") {
      return reply
        .status(409)
        .send({ error: "non pagata", detail: "si consegna quello che è stato pagato" });
    }

    // l'impronta si legge PRIMA: dopo, quel genoma è di un'altra casa
    const [genome] = await deps.db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, pratica.gosinoId))
      .orderBy(traitSets.version)
      .limit(1);

    const done = await transfers.cede(householdId, pratica.gosinoId, pratica.buyerHouseholdId);
    if (typeof done === "string") {
      return reply.status(409).send({ error: done });
    }

    /**
     * L'atto in catena. Se il registro è giù **la consegna è avvenuta lo
     * stesso** — le righe sono già cambiate casa — e la pratica resta con
     * `chainSeq` vuoto, che è una cosa da guardare e non un dettaglio: la
     * creatura ha cambiato casa e il libro genealogico non lo sa ancora.
     */
    let chainSeq: number | undefined;
    if (deps.chain !== undefined) {
      const outcome = await deps.chain.publish({
        kind: "transfer",
        gosinoId: pratica.gosinoId,
        genomeHash: genomeHash(genome?.traits ?? {}),
        at: new Date().toISOString(),
        fromHash: holderHash(householdId),
        toHash: holderHash(pratica.buyerHouseholdId),
      });
      if (outcome.published) chainSeq = outcome.seq;
      else request.log.warn({ adozione: id, reason: outcome.reason }, "transfer not published");
    }

    await adoptions.markDelivered(id, chainSeq);
    await deps.registry?.reload();
    return reply.send({ ...done, chainSeq: chainSeq ?? null });
  });

  /** Annullare: la pratica si chiude e il cucciolo torna in vetrina. */
  app.post("/v1/adozioni/:id/annulla", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    if (!(await guardBreeding(deps.db, householdId, "alleva", reply))) return reply;
    const pratica = await adoptions.ofKennel(householdId, id);
    if (pratica === undefined) return reply.status(404).send({ error: "non esiste" });
    if (!(await adoptions.cancel(id))) {
      return reply.status(409).send({ error: `non si annulla: è ${pratica.status}` });
    }
    return reply.send({ status: "annullata" });
  });
}
