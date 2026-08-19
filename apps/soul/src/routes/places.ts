import { places, rooms, slugOfPlace, type DbClient } from "@ugo/db";
import { and, asc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * I luoghi di un account (ADR-113).
 *
 * Sostituiscono `/v1/account/place`, che dava per scontato che un titolare
 * abitasse in un posto solo. Non è una rotta in più: è la stessa cosa detta
 * bene, e la vecchia è stata **tolta** invece di lasciata accanto — due verità
 * sulla stessa cosa sono il difetto che ADR-092 è servita a togliere.
 */

const placeSchema = z.object({
  name: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
});

export interface PlaceRoutesDeps {
  db: DbClient;
  guard: PreHandler;
}

export function registerPlaceRoutes(app: FastifyInstance, deps: PlaceRoutesDeps): void {
  app.get("/v1/places", { preHandler: deps.guard }, async (request, reply) => {
    const rows = await inAccount(deps.db, request, reply, {}, async (db, accountId) =>
      db
        .select({
          id: places.id,
          name: places.name,
          slug: places.slug,
          lat: places.lat,
          lon: places.lon,
          // quante stanze ci stanno dentro: senza, un luogo da buttare sembra
          // vuoto anche quando ci vive mezza casa
          rooms: sql<number>`(select count(*) from ${rooms} where ${rooms.placeId} = ${places.id})`,
        })
        .from(places)
        .where(eq(places.accountId, accountId))
        .orderBy(asc(places.createdAt)),
    );
    if (rows === undefined) return reply;
    return reply.send({
      places: rows.map((row) => ({
        ...row,
        lat: row.lat === null ? null : Number(row.lat),
        lon: row.lon === null ? null : Number(row.lon),
        rooms: row.rooms,
      })),
    });
  });

  app.post("/v1/places", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = placeSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const made = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const slug = slugOfPlace(parsed.data.name);
        const [existing] = await db
          .select({ id: places.id })
          .from(places)
          .where(and(eq(places.accountId, accountId), eq(places.slug, slug)));
        if (existing !== undefined) return { conflict: true as const };
        const [row] = await db
          .insert(places)
          .values({
            accountId,
            name: parsed.data.name.trim(),
            slug,
            ...(parsed.data.lat !== undefined && { lat: parsed.data.lat.toFixed(5) }),
            ...(parsed.data.lon !== undefined && { lon: parsed.data.lon.toFixed(5) }),
          })
          .returning({ id: places.id });
        return { conflict: false as const, id: row?.id };
      },
    );
    if (made === undefined) return reply;
    if (made.conflict) {
      return reply.status(409).send({ error: "un luogo con questo nome c'è già" });
    }
    return reply.status(201).send({ id: made.id });
  });

  app.put("/v1/places/:id", { preHandler: deps.guard }, async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.status(400).send({ error: "invalid id" });
    const parsed = placeSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const updated = await db
          .update(places)
          .set({
            name: parsed.data.name.trim(),
            slug: slugOfPlace(parsed.data.name),
            lat: parsed.data.lat === undefined ? null : parsed.data.lat.toFixed(5),
            lon: parsed.data.lon === undefined ? null : parsed.data.lon.toFixed(5),
          })
          .where(and(eq(places.id, id.data), eq(places.accountId, accountId)))
          .returning({ id: places.id });
        return { found: updated.length > 0 };
      },
    );
    if (done === undefined) return reply;
    if (!done.found) return reply.status(404).send({ error: "not found" });
    return reply.send({ id: id.data });
  });

  /**
   * Buttare un luogo **con dentro delle stanze si rifiuta**, e si dice quante.
   *
   * Le due alternative erano peggiori: cancellare a cascata butterebbe la
   * piantina di casa per un click, e staccare le stanze lasciandole senza
   * luogo le renderebbe senza cielo — un guasto silenzioso che si scopre
   * guardando fuori dalla finestra sbagliata.
   */
  app.delete("/v1/places/:id", { preHandler: deps.guard }, async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.status(400).send({ error: "invalid id" });
    const outcome = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const inside = await db
          .select({ id: rooms.id })
          .from(rooms)
          .where(and(eq(rooms.accountId, accountId), eq(rooms.placeId, id.data)));
        if (inside.length > 0) return { rooms: inside.length, gone: false };
        const removed = await db
          .delete(places)
          .where(and(eq(places.id, id.data), eq(places.accountId, accountId)))
          .returning({ id: places.id });
        return { rooms: 0, gone: removed.length > 0 };
      },
    );
    if (outcome === undefined) return reply;
    if (outcome.rooms > 0) {
      return reply.status(409).send({
        error: `ci sono ancora ${String(outcome.rooms)} stanze in questo luogo: spostale prima`,
        rooms: outcome.rooms,
      });
    }
    if (!outcome.gone) return reply.status(404).send({ error: "not found" });
    return reply.status(204).send();
  });

  /** In quale luogo sta una stanza: l'unico modo per spostarla. */
  app.put("/v1/rooms/:id/place", { preHandler: deps.guard }, async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { id?: string }).id);
    const body = z.object({ placeId: z.uuid() }).safeParse(request.body);
    if (!id.success || !body.success) return reply.status(400).send({ error: "invalid body" });
    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        // il luogo dev'essere di questa casa: senza il controllo, un id preso
        // altrove sposterebbe una stanza in un posto che non le appartiene
        const [place] = await db
          .select({ id: places.id })
          .from(places)
          .where(and(eq(places.id, body.data.placeId), eq(places.accountId, accountId)));
        if (place === undefined) return { ok: false };
        const moved = await db
          .update(rooms)
          .set({ placeId: body.data.placeId })
          .where(and(eq(rooms.id, id.data), eq(rooms.accountId, accountId)))
          .returning({ id: rooms.id });
        return { ok: moved.length > 0 };
      },
    );
    if (done === undefined) return reply;
    if (!done.ok) return reply.status(404).send({ error: "not found" });
    return reply.send({ id: id.data, placeId: body.data.placeId });
  });
}
