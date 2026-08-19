import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import type { AlbumService } from "../services/albumService.js";
import { ParcelService, type ParcelRefusal } from "../services/parcelService.js";
import { TieService, type TieRefusal } from "../services/tieService.js";
import type { PreHandler } from "./guard.js";
import { accountScope } from "./scope.js";

/**
 * Le parentele e le cartoline (ADR-099). Tutte le rotte sono della casa:
 * guard + scope, e il servizio rifiuta con la ragione in italiano (il pattern
 * di ADR-081) — mai un 404 che finge che la rotta non esista quando il
 * problema è un consenso che manca.
 */

/**
 * L'avvertenza di ADR-099 §2: è parte del consenso, quindi vive in UN posto
 * e il pannello la mostra PRIMA del click. Il test del pannello la pretende.
 */
export const TIE_WARNING =
  "Collegare le case rende possibile inviare messaggi e ricordi all'altra famiglia. " +
  "Ogni invio parte solo da una tua azione esplicita: niente parte mai da solo.";

const proposeSchema = z.object({
  /** id o slug, come la cessione (ADR-082): non si sfogliano le case altrui */
  toAccount: z.string().min(1).max(120),
  label: z.string().min(1).max(80),
  fromBeingId: z.uuid().optional(),
});

const acceptSchema = z.object({ toBeingId: z.uuid().optional() });

const sendSchema = z.object({
  tieId: z.uuid(),
  /** il pannello chiede QUALE esemplare spedisce: mai «va il default» */
  fromGosinoId: z.uuid(),
  toGosinoId: z.uuid().optional(),
  kind: z.enum(["messaggio", "ricordo"]),
  text: z.string().min(1).max(2000),
  /** ADR-109: una foto dell'album di casa mia, se la cartolina ne porta una */
  photoId: z.uuid().optional(),
});

const TIE_REFUSALS: Readonly<Record<TieRefusal, { status: number; detail: string }>> = {
  "casa-sconosciuta": { status: 404, detail: "quella casa non esiste" },
  "se-stessa": { status: 400, detail: "una casa non si imparenta con sé stessa" },
  "gia-legate": { status: 409, detail: "le due case sono già legate, o c'è una proposta aperta" },
  "non-esiste": { status: 404, detail: "questa parentela non esiste" },
  "non-tua": { status: 403, detail: "questa parentela non riguarda la tua casa" },
  "non-in-proposta": {
    status: 409,
    detail: "non è più una proposta: accettare tocca a chi la riceve, una volta",
  },
  "gia-revocata": { status: 409, detail: "è già stata revocata" },
};

const PARCEL_REFUSALS: Readonly<Record<ParcelRefusal, { status: number; detail: string }>> = {
  "parentela-sconosciuta": { status: 404, detail: "nessuna parentela con quella casa" },
  "non-accettata": {
    status: 403,
    detail: "la parentela non è stata ancora accettata dall'altra casa: senza il loro sì, niente parte",
  },
  "esemplare-sconosciuto": { status: 400, detail: "quell'esemplare non è di questa casa" },
  "destinatario-sconosciuto": { status: 400, detail: "quell'esemplare non è della casa destinataria" },
  "non-esiste": { status: 404, detail: "questa cartolina non esiste" },
  "non-tua": { status: 403, detail: "questa cartolina non è per la tua casa" },
  "non-un-ricordo": { status: 400, detail: "si tiene solo un ricordo: un messaggio si legge" },
  "gia-tenuta": { status: 409, detail: "è già stata tenuta" },
  illeggibile: { status: 422, detail: "non si apre con la chiave di questa casa" },
  // ADR-109 × ADR-099: i tre modi in cui una foto non parte. Tutti e tre
  // fermano l'INTERA cartolina: spedirne una a metà — il testo sì, la foto
  // no — è la sorpresa che chi riceve non ha modo di notare
  "foto-non-tua": { status: 404, detail: "quella foto non è nell'album di questa casa" },
  "album-loro-spento": {
    status: 409,
    detail:
      "quella casa non conserva foto: il loro album è spento, e la durata la decidono loro. Manda le parole, o chiedi a loro di accenderlo",
  },
  "loro-non-vogliono": {
    status: 409,
    detail: "in quella casa c'è chi ha chiesto di non essere guardato: le foto non arrivano lì",
  },
};

export interface TieRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  /** la KEK di processo: avvolge le DEK delle case (ADR-019) */
  dataKey: Buffer;
  /** ADR-109: l'album, se c'è — senza, le cartoline restano di sole parole */
  album?: AlbumService | undefined;
  audit?: AuditLogger;
}

export function registerTieRoutes(app: FastifyInstance, deps: TieRoutesDeps): void {
  const ties = new TieService(deps.db);
  const parcelService = new ParcelService(deps.db, deps.dataKey, deps.album);

  app.get("/v1/ties", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await accountScope(deps.db, request, reply);
    if (accountId === undefined) return reply;
    return reply.send({ warning: TIE_WARNING, ties: await ties.listFor(accountId) });
  });

  app.post("/v1/ties", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = proposeSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;

    const done = await ties.propose(accountId, parsed.data);
    if (typeof done === "string") {
      const refusal = TIE_REFUSALS[done];
      return reply.status(refusal.status).send({ error: done, detail: refusal.detail });
    }
    await deps.audit?.record({
      verb: "tie_proposed",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "account_tie",
      resourceId: done.id,
    });
    return reply.status(201).send(done);
  });

  app.post("/v1/ties/:id/accept", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = acceptSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;

    const done = await ties.accept(accountId, id, parsed.data.toBeingId);
    if (typeof done === "string") {
      const refusal = TIE_REFUSALS[done];
      return reply.status(refusal.status).send({ error: done, detail: refusal.detail });
    }
    await deps.audit?.record({
      verb: "tie_accepted",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "account_tie",
      resourceId: id,
    });
    return reply.send(done);
  });

  app.post("/v1/ties/:id/revoke", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;

    const done = await ties.revoke(accountId, id);
    if (typeof done === "string") {
      const refusal = TIE_REFUSALS[done];
      return reply.status(refusal.status).send({ error: done, detail: refusal.detail });
    }
    await deps.audit?.record({
      verb: "tie_revoked",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "account_tie",
      resourceId: id,
    });
    return reply.send(done);
  });

  app.get("/v1/parcels", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await accountScope(deps.db, request, reply);
    if (accountId === undefined) return reply;
    return reply.send({
      inbox: await parcelService.inbox(accountId),
      outbox: await parcelService.outbox(accountId),
    });
  });

  app.post("/v1/parcels", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = sendSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;

    const done = await parcelService.send(accountId, parsed.data);
    if (typeof done === "string") {
      const refusal = PARCEL_REFUSALS[done];
      return reply.status(refusal.status).send({ error: done, detail: refusal.detail });
    }
    await deps.audit?.record({
      verb: "parcel_sent",
      outcome: "ok",
      accountId,
      actor: request.tenant,
      resourceType: "parcel",
      resourceId: done.id,
    });
    return reply.status(201).send(done);
  });

  app.post("/v1/parcels/:id/keep", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const accountId = await accountScope(deps.db, request, reply, { requireAdmin: true });
    if (accountId === undefined) return reply;

    const done = await parcelService.keep(accountId, id);
    if (typeof done === "string") {
      const refusal = PARCEL_REFUSALS[done];
      return reply.status(refusal.status).send({ error: done, detail: refusal.detail });
    }
    return reply.send(done);
  });
}
