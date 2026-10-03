import { gosini, withAccount, withMarket, type DbClient } from "@ugo/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AdoptionService } from "../services/adoptionService.js";
import type { RegistryClient } from "../services/registryClient.js";
import { deliverAdoption, settleAdoption } from "../services/adoptionDelivery.js";
import { incomingCubs, needsPlan, type PlanGate } from "../services/billing/plan.js";
import { guardBreeding } from "./breeding.js";
import type { PreHandler } from "./guard.js";
import { accountScope } from "./scope.js";

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
  /** ADR-124: assente quando chi prenota ha già una casa (sessione o token) */
  casa: z.object({
    slug: z
      .string()
      .min(3)
      .max(60)
      .regex(/^[a-z0-9-]+$/u, "solo minuscole, cifre e trattini"),
    nome: z.string().min(1).max(120),
    timezone: z.string().min(1).max(60).optional(),
  }).optional(),
});

const paymentSchema = z.object({ riferimento: z.string().min(1).max(200) });

export interface AdoptionRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  /**
   * Far nascere la casa di chi compra. È la stessa `createAccount` del
   * pannello e della riga di comando — iniettata perché serve la chiave madre,
   * che il server non possiede.
   */
  /** ADR-097: gira sulla transazione del mercato, non sulla connessione nuda */
  createHouse?: (
    db: DbClient,
    input: {
      slug: string;
      name: string;
      timezone?: string | undefined;
    },
  ) => Promise<{ accountId: string; ownerToken: string }>;
  registry?: { reload: () => Promise<void> };
  chain?: RegistryClient;
  /** ADR-125: i piani; assente = nessun tetto (i test che non parlano di piani) */
  plans?: PlanGate | undefined;
}

export function registerAdoptionRoutes(app: FastifyInstance, deps: AdoptionRoutesDeps): void {

  /**
   * Prenotare: nasce la casa, si apre la pratica, e il cucciolo **esce dalla
   * vetrina**. Uscire subito è la parte che conta: una vetrina che continua a
   * mostrare un cucciolo già scelto produce due famiglie che credono di
   * averlo, e una delle due lo scopre dopo aver pagato.
   */
  app.post("/v1/vetrina/:id/prenota", async (request, reply) => {
    const parsed = bookingSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    // ADR-124: chi ha già una casa prenota PER QUELLA. Solo il proprietario:
    // accogliere una creatura è un atto di chi la casa la possiede
    const tenant = request.tenant;
    const ownHouse = tenant?.role === "owner" && tenant.accountId !== null ? tenant.accountId : undefined;
    const newHouse = parsed.data.casa;
    const createHouse = deps.createHouse;
    if (ownHouse === undefined && newHouse === undefined) {
      return reply.status(400).send({ error: "manca la casa", detail: "entra nella tua casa o indicane una nuova" });
    }
    if (ownHouse === undefined && createHouse === undefined) {
      return reply.status(501).send({ error: "le case non si creano su questo server" });
    }
    const { id } = request.params as { id: string };
    // ADR-125/128: un posto per il cucciolo — contano anche quelli già in arrivo
    const plans = deps.plans;
    if (ownHouse !== undefined && plans !== undefined) {
      const room = await withAccount(deps.db, ownHouse, async (db) =>
        plans.hasRoom(db, ownHouse, "gosini", await incomingCubs(db, ownHouse)),
      );
      if (!room) return needsPlan(reply, "gosini");
    }

    // ADR-097: prenotare attraversa le case per disegno — nasce la casa di
    // chi compra mentre il cucciolo è di chi vende. Tutto nel ruolo del
    // mercato, in UNA transazione: o nasce tutto o non nasce niente
    const done = await withMarket(deps.db, async (db) => {
      const adoptions = new AdoptionService(db);
      // le prenotazioni scadute tornano in vetrina proprio adesso: è il momento
      // in cui qualcuno sta guardando, ed è l'unico in cui la cosa importa
      await adoptions.releaseExpired();

      const [cub] = await db
        .select({ listed: gosini.listedAt, name: gosini.name })
        .from(gosini)
        .where(eq(gosini.id, id));
      if (cub?.listed == null) return "not-listed" as const;

      let house: { accountId: string; ownerToken?: string };
      if (ownHouse !== undefined) {
        house = { accountId: ownHouse };
      } else if (createHouse === undefined || newHouse === undefined) {
        return "no-house" as const; // escluso sopra; qui per il compilatore
      } else {
        try {
          house = await createHouse(db, {
            slug: newHouse.slug,
            name: newHouse.nome,
            ...(newHouse.timezone !== undefined && { timezone: newHouse.timezone }),
          });
        } catch {
          // lo slug è l'unica cosa che può collidere, ed è una cosa che chi
          // prenota può correggere da solo
          return "slug-taken" as const;
        }
      }

      const booked = await adoptions.reserve(id, house.accountId);
      if (booked === undefined) return "gone" as const;
      return { cub, house, booked };
    });
    if (done === "not-listed") {
      return reply.status(404).send({ error: "non è in vetrina", detail: "non è più disponibile" });
    }
    if (done === "slug-taken") {
      return reply
        .status(409)
        .send({ error: "nome già preso", detail: "quel nome di casa esiste già, scegline un altro" });
    }
    if (done === "gone") return reply.status(409).send({ error: "non è più disponibile" });
    if (done === "no-house") return reply.status(400).send({ error: "manca la casa" });
    const { cub, house, booked } = done;
    // ADR-126 §4: un cucciolo gratuito è pagato alla prenotazione, e se chi lo
    // cede consegna da sé (la fonderia, ADR-128) è già a casa
    const settled =
      booked.priceCents === 0
        ? await settleAdoption(
            { db: deps.db, chain: deps.chain, registry: deps.registry, log: request.log },
            booked.id,
            { ref: "gratuita", provider: "gratuita" },
          )
        : undefined;

    return reply.status(201).send({
      adozione: booked.id,
      stato: settled === "delivered" ? "consegnata" : settled === "paid" ? "pagata" : "prenotata",
      gosino: { id, name: cub.name },
      prezzo: booked.priceCents === null ? null : { centesimi: booked.priceCents, valuta: "EUR" },
      /** in chiaro **una volta sola**, e solo se la casa è nata adesso */
      ...(house.ownerToken !== undefined && { token: house.ownerToken }),
      casa: house.accountId,
    });
  });

  /** Le pratiche di questa casa: quelle che cede e quelle che riceve. */
  app.get("/v1/adozioni", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await accountScope(deps.db, request, reply);
    if (accountId === undefined) return reply;
    // ADR-097: una pratica ha due case (chi cede, chi riceve) — la lettura
    // passa dal mercato, il filtro per casa resta nel servizio
    const adozioni = await withMarket(deps.db, (db) => new AdoptionService(db).of(accountId));
    return reply.send({ adozioni });
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
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    if (!(await guardBreeding(deps.db, accountId, "alleva", reply))) return reply;

    const done = await withMarket(deps.db, async (db) => {
      const adoptions = new AdoptionService(db);
      const pratica = await adoptions.ofKennel(accountId, id);
      if (pratica === undefined) return "missing" as const;
      if (!(await adoptions.markPaid(id, parsed.data.riferimento))) return { was: pratica.status };
      return "paid" as const;
    });
    if (done === "missing") return reply.status(404).send({ error: "non esiste" });
    if (done !== "paid") return reply.status(409).send({ error: `non è prenotata: è ${done.was}` });
    return reply.send({ status: "pagata" });
  });

  /** La consegna (ADR-082): il lavoro sta in `adoptionDelivery.ts`, condiviso con la fonderia. */
  app.post("/v1/adozioni/:id/consegna", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    if (!(await guardBreeding(deps.db, accountId, "alleva", reply))) return reply;
    const delivered = await deliverAdoption(
      { db: deps.db, chain: deps.chain, registry: deps.registry, log: request.log },
      accountId,
      id,
    );
    if (delivered.ok) return reply.send({ ...delivered.transfer, chainSeq: delivered.chainSeq });
    if (delivered.reason === "missing") return reply.status(404).send({ error: "non esiste" });
    if (delivered.reason === "unpaid") {
      return reply.status(409).send({ error: "non pagata", detail: "si consegna quello che è stato pagato" });
    }
    return reply.status(409).send({ error: delivered.reason });
  });

  /** Annullare: la pratica si chiude e il cucciolo torna in vetrina. */
  app.post("/v1/adozioni/:id/annulla", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    if (!(await guardBreeding(deps.db, accountId, "alleva", reply))) return reply;
    const done = await withMarket(deps.db, async (db) => {
      const adoptions = new AdoptionService(db);
      const pratica = await adoptions.ofKennel(accountId, id);
      if (pratica === undefined) return "missing" as const;
      if (!(await adoptions.cancel(id))) return { was: pratica.status };
      return "cancelled" as const;
    });
    if (done === "missing") return reply.status(404).send({ error: "non esiste" });
    if (done !== "cancelled") return reply.status(409).send({ error: `non si annulla: è ${done.was}` });
    return reply.send({ status: "annullata" });
  });
}
