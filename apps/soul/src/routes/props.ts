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
import { householdScope } from "./scope.js";

/**
 * Gli arredi: metterli, spostarli, toglierli, e quanti ne restano (ADR-051).
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
  const props = new PropService(deps.db);

  /** Ripete al muso quel che c'è adesso, su ogni schermo di quella stanza. */
  const push = async (householdId: string, room: string): Promise<void> => {
    deps.hub.broadcast(householdId, room, {
      type: "scene",
      props: await props.inRoom(householdId, room),
    });
  };

  app.get("/v1/props", async (request, reply) => {
    const room = (request.query as { stanza?: string }).stanza;
    if (room === undefined || room === "") {
      problem(reply, 400, "Invalid request", "serve ?stanza=");
      return reply;
    }
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    return reply.send({ props: await props.inRoom(householdId, room) });
  });

  app.post("/v1/props", { preHandler: deps.guard }, async (request, reply) => {
    const room = (request.query as { stanza?: string }).stanza;
    const parsed = placedPropSchema.safeParse(request.body);
    if (!parsed.success || room === undefined || room === "") {
      problem(reply, 400, "Invalid request", parsed.success ? "serve ?stanza=" : "corpo non valido");
      return reply;
    }
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    try {
      const made = await props.place(householdId, room, parsed.data);
      await push(householdId, room);
      return await reply.status(201).send(made);
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
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const moved = await props.move(householdId, id, parsed.data);
    if (moved === undefined) {
      problem(reply, 404, "Prop not found");
      return reply;
    }
    const room = (request.query as { stanza?: string }).stanza;
    if (room !== undefined && room !== "") await push(householdId, room);
    return reply.send(moved);
  });

  app.delete("/v1/props/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const gone = await props.remove(householdId, id);
    if (gone === undefined) {
      problem(reply, 404, "Prop not found");
      return reply;
    }
    const room = (request.query as { stanza?: string }).stanza;
    if (room !== undefined && room !== "") await push(householdId, room);
    return reply.send(gone);
  });

  /** Le scorte: cosa può ancora posare questa casa, e quanto ne torna. */
  app.get("/v1/props/stock", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    return reply.send({ stock: await props.stock(householdId) });
  });

  app.put("/v1/props/stock", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = stockSchema.safeParse(request.body);
    if (!parsed.success) {
      problem(reply, 400, "Invalid request", z.prettifyError(parsed.error));
      return reply;
    }
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const { kind, remaining, refillPerWeek } = parsed.data;
    await props.setStock(householdId, kind, remaining, refillPerWeek);
    return reply.send({ stock: await props.stock(householdId) });
  });
}
