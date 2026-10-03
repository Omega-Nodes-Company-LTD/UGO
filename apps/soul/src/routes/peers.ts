import { beings, bonds, gosini, recognitionProfiles, type DbClient } from "@ugo/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { SignedCard } from "@ugo/shared";
import { z } from "zod";
import { PeerService } from "../services/peerService.js";
import { problem } from "./billing.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * L'incontro fisico (ADR-020), finalmente raggiungibile: acceso per gosino,
 * il biglietto da mostrare in QR, la presentazione del biglietto inquadrato,
 * l'avvistamento BLE dell'APK e l'oblio di chi si è conosciuto.
 *
 * Niente LLM, come vuole ADR-020: due gosini al semaforo si salutano, non si
 * scrivono un romanzo a spese dei padroni. Spento per default.
 */

export interface PeerRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  /** la KEK di processo: avvolge chiavi e segreti dei gosini */
  dataKey: Buffer;
  moodOf?: ((accountId: string, gosinoId: string) => string) | undefined;
}

const b64 = z.string().regex(/^[A-Za-z0-9+/=]{4,200}$/);
const cardSchema = z.object({
  card: z.object({
    name: z.string().min(1).max(60),
    generation: z.number().int().min(0).max(1000),
    mood: z.string().min(1).max(30),
    signingPublicKey: b64,
    // una presentazione porta sempre il segreto: senza, è un saluto e non si accetta
    rotationSecret: b64,
    epoch: z.number().int(),
    culturalGenes: z
      .object({ grunt_repertoire: z.number(), dialect: z.number(), dream_style: z.number() })
      .optional(),
  }),
  signature: b64,
});
/** Zod rende `undefined` ciò che il biglietto firmato non deve nominare affatto. */
function signed(input: z.infer<typeof cardSchema>): SignedCard {
  const { culturalGenes, ...card } = input.card;
  return { card: { ...card, ...(culturalGenes !== undefined && { culturalGenes }) }, signature: input.signature };
}
const sightingSchema = z.object({ gosino: z.uuid(), nonce: b64, tag: b64 });
const params = z.object({ id: z.uuid() });

export function registerPeerRoutes(app: FastifyInstance, deps: PeerRoutesDeps): void {
  const owner = { requireAdmin: true };
  /** Il gosino è della casa (filtro esplicito oltre a RLS) e ha gli incontri accesi? */
  const mine = async (tx: DbClient, accountId: string, id: string): Promise<{ on: boolean } | undefined> => {
    const [row] = await tx
      .select({ on: gosini.peerEncounters })
      .from(gosini)
      .where(and(eq(gosini.id, id), eq(gosini.accountId, accountId)));
    return row;
  };
  const mood = (accountId: string, gosinoId: string): string => deps.moodOf?.(accountId, gosinoId) ?? "curioso";

  app.put("/v1/gosini/:id/incontri", { preHandler: deps.guard }, async (request, reply) => {
    const id = params.safeParse(request.params);
    const body = z.object({ attivi: z.boolean() }).safeParse(request.body);
    if (!id.success || !body.success) return problem(reply, 400, "acceso o spento?");
    const done = await inAccount(deps.db, request, reply, owner, async (tx, accountId) => {
      if ((await mine(tx, accountId, id.data.id)) === undefined) return false;
      await new PeerService(tx, deps.dataKey).setEnabled(id.data.id, body.data.attivi);
      return true;
    });
    if (done === undefined) return reply;
    return done ? reply.send({ attivi: body.data.attivi }) : problem(reply, 404, "gosino non trovato");
  });

  /**
   * Il biglietto di presentazione: porta il segreto, quindi solo alla casa e
   * solo se il padrone ha acceso gli incontri. Lo chiede anche il muso
   * abbinato, perché è lui che lo mostra in QR all'altro.
   */
  app.get("/v1/gosini/:id/biglietto", { preHandler: deps.guard }, async (request, reply) => {
    const id = params.safeParse(request.params);
    if (!id.success) return problem(reply, 404, "gosino non trovato");
    const card = await inAccount(deps.db, request, reply, {}, async (tx, accountId) => {
      const row = await mine(tx, accountId, id.data.id);
      if (row === undefined) return "missing" as const;
      if (!row.on) return "off" as const;
      return new PeerService(tx, deps.dataKey).introductionCard(id.data.id, mood(accountId, id.data.id));
    });
    if (card === undefined) return reply;
    if (card === "missing") return problem(reply, 404, "gosino non trovato");
    if (card === "off") return problem(reply, 409, "gli incontri di questo gosino sono spenti");
    return reply.header("cache-control", "no-store").send(card);
  });

  /** Il biglietto dell'altro, inquadrato dal muso: firma vera e recente, o niente. */
  app.post("/v1/gosini/:id/presentazione", { preHandler: deps.guard }, async (request, reply) => {
    const id = params.safeParse(request.params);
    const body = cardSchema.safeParse(request.body);
    if (!id.success || !body.success) return problem(reply, 400, "questo non è un biglietto di gosino");
    const met = await inAccount(deps.db, request, reply, {}, async (tx, accountId) => {
      const row = await mine(tx, accountId, id.data.id);
      if (row?.on !== true) return "off" as const;
      return new PeerService(tx, deps.dataKey).accept({ accountId, gosinoId: id.data.id, card: signed(body.data) });
    });
    if (met === undefined && reply.sent) return reply;
    if (met === "off") return problem(reply, 409, "gli incontri di questo gosino sono spenti");
    if (met === undefined) return problem(reply, 422, "biglietto non valido o scaduto: fatevene mostrare uno nuovo");
    return reply.code(201).send({ conosciuto: met.name, essere: met.beingId });
  });

  /** Lo pseudonimo che l'APK annuncia via BLE: cambia a ogni epoca, non si collega a niente. */
  app.get("/v1/gosini/:id/annuncio", { preHandler: deps.guard }, async (request, reply) => {
    const id = params.safeParse(request.params);
    if (!id.success) return problem(reply, 404, "gosino non trovato");
    const seen = await inAccount(deps.db, request, reply, {}, async (tx, accountId) => {
      const row = await mine(tx, accountId, id.data.id);
      if (row?.on !== true) return "off" as const;
      return new PeerService(tx, deps.dataKey).advertisement(id.data.id);
    });
    if (seen === undefined) return reply;
    if (seen === "off") return problem(reply, 409, "gli incontri di questo gosino sono spenti");
    return reply.header("cache-control", "no-store").send({ nonce: seen.nonce.toString("base64"), tag: seen.tag.toString("base64") });
  });

  /** Un annuncio sentito vicino: si saluta solo chi ci era già stato presentato. */
  app.post("/v1/peer/avvistamento", { preHandler: deps.guard }, async (request, reply) => {
    const body = sightingSchema.safeParse(request.body);
    if (!body.success) return problem(reply, 400, "avvistamento non valido");
    const met = await inAccount(deps.db, request, reply, {}, async (tx, accountId) =>
      (await mine(tx, accountId, body.data.gosino)) === undefined
        ? undefined
        : new PeerService(tx, deps.dataKey).sighting({
            accountId,
            gosinoId: body.data.gosino,
            seen: { nonce: Buffer.from(body.data.nonce, "base64"), tag: Buffer.from(body.data.tag, "base64") },
          }),
    );
    if (met === undefined) return reply.sent ? reply : reply.code(204).send();
    return reply.send({ salutato: met.name });
  });

  app.get("/v1/gosini/:id/conoscenze", { preHandler: deps.guard }, async (request, reply) => {
    const id = params.safeParse(request.params);
    if (!id.success) return problem(reply, 404, "gosino non trovato");
    const known = await inAccount(deps.db, request, reply, owner, async (tx, accountId) => {
      const row = await mine(tx, accountId, id.data.id);
      if (row === undefined) return "missing" as const;
      const conoscenze = await tx
        .select({ essere: beings.id, nome: beings.displayName, familiarita: bonds.familiarity, vistoIl: bonds.lastSeenAt })
        .from(bonds)
        .innerJoin(beings, eq(beings.id, bonds.beingId))
        .where(and(eq(bonds.gosinoId, id.data.id), eq(beings.accountId, accountId), eq(beings.species, "gosino")));
      return { attivi: row.on, conoscenze };
    });
    if (known === undefined) return reply;
    if (known === "missing") return problem(reply, 404, "gosino non trovato");
    return reply.send(known);
  });

  /** Oblio: si butta il segreto, e il gosino smette di riconoscerlo. */
  app.delete("/v1/gosini/:id/conoscenze/:essere", { preHandler: deps.guard }, async (request, reply) => {
    const ids = z.object({ id: z.uuid(), essere: z.uuid() }).safeParse(request.params);
    if (!ids.success) return problem(reply, 404, "conoscenza non trovata");
    const gone = await inAccount(deps.db, request, reply, owner, async (tx, accountId) => {
      const [bond] = await tx
        .select({ id: bonds.beingId })
        .from(bonds)
        .innerJoin(recognitionProfiles, eq(recognitionProfiles.beingId, bonds.beingId))
        .where(and(eq(bonds.gosinoId, ids.data.id), eq(bonds.beingId, ids.data.essere), eq(bonds.accountId, accountId)))
        .limit(1);
      return bond === undefined ? false : new PeerService(tx, deps.dataKey).forget(ids.data.essere);
    });
    if (gone === undefined) return reply;
    return gone ? reply.code(204).send() : problem(reply, 404, "conoscenza non trovata");
  });
}

