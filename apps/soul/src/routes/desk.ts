import { desires, gosini, type DbClient } from "@ugo/db";
import { DESIRE_KINDS } from "@ugo/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import type { GosinoRegistry } from "../services/pack/runtimes.js";
import type { PreHandler } from "./guard.js";
import { exemplarsOf, inAccount } from "./scope.js";

/**
 * La scrivania (ADR-104): le cose che si facevano solo in psql.
 *
 * Non sono cinque funzionalità nuove: sono cinque **gesti già previsti dal
 * modello dati** che non avevano una porta. Ritirare un esemplare, scrivergli
 * un ricordo a mano, dargli o togliergli un promemoria, rileggere e buttare
 * una riunione. Ogni volta la risposta era «apri psql», e «apri psql» in un
 * progetto che si dichiara adottabile vuol dire **non si può fare**.
 *
 * Il filo comune, e la ragione per cui stanno in un file solo: sono tutte
 * azioni del titolare sulla sua casa, tutte `inAccount` + admin, e tutte
 * scrivono su tabelle che qualcun altro legge (il registro dei runtime, il
 * recupero dei ricordi, l'iniziativa) — quindi ognuna deve dire a chi legge
 * che qualcosa è cambiato, invece di lasciarlo scoprire al riavvio.
 */

const retireSchema = z.object({
  /** `false` lo rimette in servizio: ritirare non è cancellare */
  retired: z.boolean(),
});

const desireSchema = z.object({
  gosinoId: z.uuid().optional(),
  text: z.string().min(1).max(300),
  kind: z.enum(DESIRE_KINDS).optional(),
  dueAt: z.iso.datetime().optional(),
  dueHint: z.string().min(1).max(80).optional(),
});

export interface DeskRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  audit: AuditLogger;
  /** ADR-032: il registro tiene il roster in RAM, e un ritiro lo invalida */
  registry?: { reload: () => Promise<void>; resolve: GosinoRegistry["resolve"] };
}

export function registerDeskRoutes(app: FastifyInstance, deps: DeskRoutesDeps): void {
  /** Chi è di questa casa: un id di un altro non deve nemmeno risultare esistente. */
  const mine = async (db: DbClient, accountId: string, id: string): Promise<boolean> => {
    const [row] = await db
      .select({ id: gosini.id })
      .from(gosini)
      .where(and(eq(gosini.id, id), eq(gosini.accountId, accountId)));
    return row !== undefined;
  };

  /**
   * Il ritiro (ADR-104).
   *
   * `retired_at` esisteva da ADR-015 e lo scriveva soltanto una `UPDATE` a
   * mano. È **reversibile apposta**: un esemplare ritirato non è cancellato —
   * i suoi ricordi, il suo pedigree e la sua discendenza restano, e restare è
   * il punto. Cancellare una creatura è un'altra porta, e ha il suo ADR.
   */
  app.post("/v1/gosini/:id/retire", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = retireSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };

    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const changed = await db
          .update(gosini)
          .set({ retiredAt: parsed.data.retired ? new Date() : null })
          .where(and(eq(gosini.id, id), eq(gosini.accountId, accountId)))
          .returning({ id: gosini.id, name: gosini.name, retiredAt: gosini.retiredAt });
        const row = changed[0];
        if (row === undefined) return "missing" as const;
        // ADR-062: il giornale scrive sulla transazione che ha dichiarato la
        // casa, o sotto `ugo_app` il WITH CHECK rifiuterebbe la riga
        await deps.audit.record(
          {
            verb: parsed.data.retired ? "gosino_retired" : "gosino_restored",
            outcome: "ok",
            accountId,
            resourceType: "gosino",
            resourceId: row.id,
          },
          db,
        );
        return row;
      },
    );
    if (done === undefined) return reply;
    if (done === "missing") return reply.status(404).send({ error: "non esiste" });
    // il roster vive in RAM: senza questo il ritirato continua a rispondere
    // fino al prossimo riavvio, che è il modo peggiore di scoprire un ritiro
    await deps.registry?.reload();
    return reply.send({ id: done.id, name: done.name, retiredAt: done.retiredAt });
  });

  /** Un desiderio o un promemoria dati a mano (ADR-028/078). */
  app.post("/v1/volition/desires", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = desireSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const body = parsed.data;

    const made = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const who = body.gosinoId ?? deps.registry?.resolve(undefined, accountId)?.id;
        if (who === undefined || !(await mine(db, accountId, who))) return "no-gosino" as const;
        const [row] = await db
          .insert(desires)
          .values({
            gosinoId: who,
            text: body.text,
            ...(body.kind !== undefined && { kind: body.kind }),
            ...(body.dueAt !== undefined && { dueAt: new Date(body.dueAt) }),
            ...(body.dueHint !== undefined && { dueHint: body.dueHint }),
          })
          .returning({ id: desires.id });
        return row ?? ("not-created" as const);
      },
    );
    if (made === undefined) return reply;
    if (made === "no-gosino") return reply.status(404).send({ error: "non esiste" });
    if (made === "not-created") return reply.status(500).send({ error: "not created" });
    return reply.status(201).send({ id: made.id });
  });

  /**
   * Annullare un desiderio.
   *
   * `expired`, non una riga cancellata: ciò che UGO aveva in mente ieri fa
   * parte della sua biografia come i ricordi, e una sveglia sparita non
   * spiegherebbe più perché quella sera non ha detto niente. Lo stato
   * `expired` c'è già e vuol dire esattamente questo — smette di essere in
   * sospeso senza fingere di non essere mai esistito.
   */
  app.delete("/v1/volition/desires/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const changed = await db
          .update(desires)
          .set({ status: "expired" })
          .where(
            and(eq(desires.id, id), inArray(desires.gosinoId, exemplarsOf(db, accountId))),
          )
          .returning({ id: desires.id });
        return changed[0] ?? ("missing" as const);
      },
    );
    if (done === undefined) return reply;
    if (done === "missing") return reply.status(404).send({ error: "non esiste" });
    return reply.send({ id: done.id, status: "expired" });
  });
}
