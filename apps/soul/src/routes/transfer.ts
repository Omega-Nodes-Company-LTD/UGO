import { gosini, accounts, traitSets, type DbClient } from "@ugo/db";
import { genomeHash, holderHash } from "@ugo/shared";
import { and, eq, isNull, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RegistryClient } from "../services/registryClient.js";
import { TransferService, type TransferRefusal } from "../services/transferService.js";
import { guardBreeding } from "./breeding.js";
import type { PreHandler } from "./guard.js";
import { accountScope } from "./scope.js";

/**
 * La cessione (ADR-082): il gesto con cui un allevamento consegna un nato.
 *
 * Chiede il nome della creatura come conferma, per la stessa ragione del
 * congedo (ADR-075): un click accanto ad altri click non è un consenso a una
 * cosa che non si annulla. E non si annulla davvero — la vita vissuta in
 * allevamento resta lì, e non torna indietro insieme a lui.
 */

const cedeSchema = z.object({
  /**
   * La casa che riceve: **id o slug**. Lo slug perché chi vende non può
   * elencare le case degli altri — e non deve poterlo fare: la destinazione la
   * sa perché gliel'ha detta chi compra, non perché sfoglia un elenco.
   */
  toAccount: z.string().min(1).max(120),
  /** deve combaciare col nome: è la conferma */
  confirmName: z.string().min(1).max(40),
});

const REFUSALS: Readonly<Record<TransferRefusal, { status: number; detail: string }>> = {
  "non-esiste": { status: 404, detail: "non esiste, o non è di questa casa" },
  "non-cedibile": {
    status: 422,
    detail: "si cedono solo i nati: un capostipite è l'inizio di una stirpe, e si vendono i figli",
  },
  "stessa-casa": { status: 400, detail: "è già di quella casa" },
  "se-n-e-andato": { status: 409, detail: "se n'è già andato" },
  "ha-clienti": {
    status: 409,
    detail: "ha clienti assegnati: sciogli prima i rapporti di lavoro, poi lo si cede",
  },
};

export interface TransferRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  registry?: { reload: () => Promise<void> };
  /** ADR-082: l'atto in catena, che è dove la cessione diventa verificabile */
  chain?: RegistryClient;
}

export function registerTransferRoutes(app: FastifyInstance, deps: TransferRoutesDeps): void {
  const transfers = new TransferService(deps.db);

  app.post("/v1/gosini/:id/cede", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = cedeSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;
    // cedere è un atto d'allevamento: chi non alleva non ha nati da cedere
    if (!(await guardBreeding(deps.db, accountId, "alleva", reply))) return reply;

    const [creature] = await deps.db
      .select({ name: gosini.name })
      .from(gosini)
      .where(and(eq(gosini.id, id), eq(gosini.accountId, accountId)));
    if (creature === undefined) return reply.status(404).send({ error: "non esiste" });
    if (creature.name !== parsed.data.confirmName) {
      return reply
        .status(400)
        .send({ error: "il nome non combacia", detail: "scrivi il suo nome per confermare" });
    }

    // uno slug è una parola, un id è un uuid: si accettano tutti e due, e si
    // confronta l'id solo quando quello che è arrivato *è* un uuid
    const asked = parsed.data.toAccount.trim();
    const byId = z.uuid().safeParse(asked).success ? eq(accounts.id, asked) : undefined;
    const [destination] = await deps.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(isNull(accounts.closedAt), or(eq(accounts.slug, asked.toLowerCase()), byId)));
    if (destination === undefined) {
      return reply.status(404).send({ error: "casa sconosciuta", detail: "quella casa non esiste" });
    }

    // l'impronta del genoma si legge PRIMA: dopo la cessione quel genoma è di
    // un'altra casa, e questa non ha più titolo per leggerlo
    const [genome] = await deps.db
      .select({ traits: traitSets.traits })
      .from(traitSets)
      .where(eq(traitSets.gosinoId, id))
      .orderBy(traitSets.version)
      .limit(1);

    const done = await transfers.cede(accountId, id, destination.id);
    if (typeof done === "string") {
      const refusal = REFUSALS[done];
      return reply.status(refusal.status).send({ error: done, detail: refusal.detail });
    }

    /**
     * L'atto in catena. Se il registro è giù **la cessione è avvenuta lo
     * stesso** — le righe sono già cambiate casa — e resta da pubblicare: è la
     * stessa scelta della nascita (ADR-073), perché una consegna che fallisce
     * per un servizio esterno lascerebbe una creatura in mezzo al guado.
     */
    if (deps.chain !== undefined) {
      const outcome = await deps.chain.publish({
        kind: "transfer",
        gosinoId: id,
        genomeHash: genomeHash(genome?.traits ?? {}),
        at: new Date().toISOString(),
        fromHash: holderHash(accountId),
        toHash: holderHash(destination.id),
      });
      if (!outcome.published) {
        request.log.warn(
          { gosinoId: id, reason: outcome.reason },
          "transfer not published to the registry: the creature has changed hands anyway",
        );
      }
    }

    await deps.registry?.reload();
    return reply.send(done);
  });
}
