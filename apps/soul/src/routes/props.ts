import type { DbClient } from "@ugo/db";
import { MAX_PROPS_PER_ROOM, PROP_KINDS, placedPropSchema } from "@ugo/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  PropLimitError,
  PropService,
  PropStockError,
  RoomUnknownError,
} from "../services/propService.js";
import type { SceneHub } from "../services/sceneHub.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Gli arredi: metterli, spostarli, toglierli, e quanti ne restano (ADR-056).
 *
 * `GET` è aperto come `/v1/rooms`, e per lo stesso motivo: il muso deve poter
 * chiedere com'è fatta la stanza e non porta un token. Quel che espone sono
 * cinque parole e due coordinate — nessuna persona, nessun ricordo, nessuna
 * spesa. Tutto il resto è guardato: posare un oggetto è una scrittura, e
 * consuma una scorta.
 *
 * Ogni scrittura riuscita **spinge la scena** sui socket già aperti di quella
 * stanza. È la parte che rende il pannello utilizzabile: senza, il proprietario
 * dovrebbe ricaricare il chiosco a ogni cuscino.
 */

const moveSchema = z.object({
  x: z.number().min(-1).max(1),
  z: z.number().min(-1).max(1),
  rot: z.number().min(-Math.PI).max(Math.PI),
});

const stockSchema = z.object({
  kind: z.enum(PROP_KINDS),
  /** `null` = questa casa non ha limiti su questo tipo */
  remaining: z.number().int().min(0).max(999).nullable(),
  refillPerWeek: z.number().int().min(0).max(99).default(0),
});

export interface PropRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  hub: SceneHub;
}

function problem(reply: FastifyReply, status: number, title: string, detail?: string): void {
  void reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

export function registerPropRoutes(app: FastifyInstance, deps: PropRoutesDeps): void {
  /** Ripete al muso quel che c'è adesso, su ogni schermo di quella stanza. */
  const push = (accountId: string, room: string, scene: Awaited<ReturnType<PropService["inRoom"]>>): void => {
    deps.hub.broadcast(accountId, room, { type: "scene", props: scene });
  };

  app.get("/v1/props", async (request, reply) => {
    const room = (request.query as { stanza?: string }).stanza;
    if (room === undefined || room === "") {
      problem(reply, 400, "Invalid request", "serve ?stanza=");
      return reply;
    }
    // ADR-062: il servizio nasce sulla transazione che dichiara la casa
    const body = await inAccount(deps.db, request, reply, {}, async (db, accountId) => ({
      props: await new PropService(db).inRoom(accountId, room),
    }));
    if (body === undefined) return reply;
    return reply.send(body);
  });

  app.post("/v1/props", { preHandler: deps.guard }, async (request, reply) => {
    const room = (request.query as { stanza?: string }).stanza;
    const parsed = placedPropSchema.safeParse(request.body);
    if (!parsed.success || room === undefined || room === "") {
      problem(reply, 400, "Invalid request", parsed.success ? "serve ?stanza=" : "corpo non valido");
      return reply;
    }
    try {
      const made = await inAccount(
        deps.db,
        request,
        reply,
        { requireAdmin: true },
        async (db, accountId) => {
          const svc = new PropService(db);
          const placed = await svc.place(accountId, room, parsed.data);
          return { accountId, placed, scene: await svc.inRoom(accountId, room) };
        },
      );
      if (made === undefined) return await reply;
      push(made.accountId, room, made.scene);
      return await reply.status(201).send(made.placed);
    } catch (error) {
      // tre rifiuti diversi che meritano tre risposte diverse: «quella stanza
      // non c'è», «questa è piena» e «non ne hai più» sono tre cose che il
      // proprietario risolve in tre modi
      if (error instanceof RoomUnknownError) {
        problem(reply, 404, "Room not found");
        return reply;
      }
      if (error instanceof PropLimitError) {
        problem(reply, 409, "Room is full", `al massimo ${String(MAX_PROPS_PER_ROOM)} per stanza`);
        return reply;
      }
      if (error instanceof PropStockError) {
        problem(reply, 409, "Out of stock", "questa casa ha finito le scorte di questo arredo");
        return reply;
      }
      throw error;
    }
  });

  app.patch("/v1/props/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = moveSchema.safeParse(request.body);
    if (!parsed.success) {
      problem(reply, 400, "Invalid request", z.prettifyError(parsed.error));
      return reply;
    }
    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const svc = new PropService(db);
        const moved = await svc.move(accountId, id, parsed.data);
        if (moved === undefined) return "missing" as const;
        return { accountId, moved, scene: await svc.inRoom(accountId, moved.roomSlug) };
      },
    );
    if (done === undefined) return reply;
    if (done === "missing") {
      problem(reply, 404, "Prop not found");
      return reply;
    }
    // la stanza viene dall'arredo, non da chi chiama: `?stanza=` poteva
    // mancare o essere sbagliata, e allora il chiosco della stanza giusta non
    // riceveva mai lo `scene` — spostamento fatto nel database e invisibile
    push(done.accountId, done.moved.roomSlug, done.scene);
    return reply.send(done.moved);
  });

  app.delete("/v1/props/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const svc = new PropService(db);
        const gone = await svc.remove(accountId, id);
        if (gone === undefined) return "missing" as const;
        return { accountId, gone, scene: await svc.inRoom(accountId, gone.roomSlug) };
      },
    );
    if (done === undefined) return reply;
    if (done === "missing") {
      problem(reply, 404, "Prop not found");
      return reply;
    }
    // idem: la stanza è quella in cui l'arredo stava, e la sa `remove`
    push(done.accountId, done.gone.roomSlug, done.scene);
    return reply.send(done.gone);
  });

  /** Le scorte: cosa può ancora posare questa casa, e quanto ne torna. */
  app.get("/v1/props/stock", { preHandler: deps.guard }, async (request, reply) => {
    const body = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => ({ stock: await new PropService(db).stock(accountId) }),
    );
    if (body === undefined) return reply;
    return reply.send(body);
  });

  app.put("/v1/props/stock", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = stockSchema.safeParse(request.body);
    if (!parsed.success) {
      problem(reply, 400, "Invalid request", z.prettifyError(parsed.error));
      return reply;
    }
    const { kind, remaining, refillPerWeek } = parsed.data;
    const body = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const svc = new PropService(db);
        await svc.setStock(accountId, kind, remaining, refillPerWeek);
        return { stock: await svc.stock(accountId) };
      },
    );
    if (body === undefined) return reply;
    return reply.send(body);
  });
}
