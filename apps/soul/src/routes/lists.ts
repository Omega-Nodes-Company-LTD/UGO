import { listItems, type DbClient } from "@ugo/db";
import { decryptText, encryptText } from "@ugo/shared";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

/**
 * Le liste dal pannello (ADR-076): perché una lista che si può solo sentire
 * non è una lista. Il testo è cifrato a riposo come i ricordi — cosa compra
 * una famiglia è una fotografia di come vive.
 */

const addSchema = z.object({
  list: z.string().min(1).max(40),
  text: z.string().min(1).max(200),
});
const patchSchema = z.object({ done: z.boolean() });

export interface ListRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  dataKey: Buffer;
}

export function registerListRoutes(app: FastifyInstance, deps: ListRoutesDeps): void {
  const readable = (value: string): string => {
    try {
      return decryptText(value, deps.dataKey);
    } catch {
      return "[non leggibile]";
    }
  };

  app.get("/v1/lists", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const rows = await deps.db
      .select({
        id: listItems.id,
        list: listItems.list,
        text: listItems.text,
        done: listItems.done,
        at: listItems.at,
      })
      .from(listItems)
      .where(eq(listItems.householdId, householdId))
      .orderBy(asc(listItems.list), asc(listItems.at));
    return reply.send({
      items: rows.map((row) => ({ ...row, text: readable(row.text) })),
    });
  });

  app.post("/v1/lists", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = addSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const [row] = await deps.db
      .insert(listItems)
      .values({
        householdId,
        list: parsed.data.list.trim().toLowerCase(),
        text: encryptText(parsed.data.text.trim(), deps.dataKey),
      })
      .returning({ id: listItems.id });
    return reply.status(201).send({ id: row?.id });
  });

  app.patch("/v1/lists/:id", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const updated = await deps.db
      .update(listItems)
      .set({ done: parsed.data.done, doneAt: parsed.data.done ? new Date() : null })
      .where(and(eq(listItems.id, id), eq(listItems.householdId, householdId)))
      .returning({ id: listItems.id });
    if (updated.length === 0) return reply.status(404).send({ error: "non esiste" });
    return reply.send({ done: parsed.data.done });
  });

  app.delete("/v1/lists/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const gone = await deps.db
      .delete(listItems)
      .where(and(eq(listItems.id, id), eq(listItems.householdId, householdId)))
      .returning({ id: listItems.id });
    if (gone.length === 0) return reply.status(404).send({ error: "non esiste" });
    return reply.status(204).send();
  });
}
