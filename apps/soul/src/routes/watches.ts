import { accounts, gosini, watchFinds, watches, type DbClient } from "@ugo/db";
import { decryptText, encryptText } from "@ugo/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { problem } from "./billing.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Le cose che segue (ADR-133), dal pannello: cosa tiene d'occhio, cosa ha
 * trovato, aggiungerne una, dimenticarla, e l'interruttore della ricerca sul
 * web — l'unico punto in cui il tema esce di casa.
 *
 * Le capisce il sogno da come parla il proprietario; qui si vedono e si
 * correggono. Tutto del proprietario: dice cosa ha in testa.
 */

export interface WatchRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  /** la KEK di processo: soggetti, ricerche e trovati sono cifrati con lei, come i messaggi */
  dataKey: Buffer;
}

const addSchema = z.object({
  gosino: z.uuid(),
  soggetto: z.string().trim().min(3).max(200),
  tipo: z.enum(["curiosita", "progetto", "preoccupazione"]),
  giorni: z.number().int().min(7).max(365).default(90),
});
const FINDS_SHOWN = 30;

export function registerWatchRoutes(app: FastifyInstance, deps: WatchRoutesDeps): void {
  const owner = { requireAdmin: true };
  const open = (value: string | null): string | null => {
    if (value === null) return null;
    try {
      return decryptText(value, deps.dataKey);
    } catch {
      return null;
    }
  };

  app.get("/v1/tieni-d-occhio", { preHandler: deps.guard }, async (request, reply) => {
    const seen = await inAccount(deps.db, request, reply, owner, async (tx, accountId) => {
      const [house] = await tx.select({ web: accounts.watchWeb }).from(accounts).where(eq(accounts.id, accountId));
      const rows = await tx
        .select({
          id: watches.id,
          gosino: gosini.name,
          kind: watches.kind,
          subject: watches.subjectEnc,
          source: watches.source,
          status: watches.status,
          until: watches.until,
          createdAt: watches.createdAt,
          lastSearchedAt: watches.lastSearchedAt,
        })
        .from(watches)
        .innerJoin(gosini, eq(gosini.id, watches.gosinoId))
        .where(eq(watches.accountId, accountId))
        .orderBy(desc(watches.createdAt));
      const finds =
        rows.length === 0
          ? []
          : await tx
              .select()
              .from(watchFinds)
              .where(and(eq(watchFinds.accountId, accountId), inArray(watchFinds.watchId, rows.map((r) => r.id))))
              .orderBy(desc(watchFinds.createdAt))
              .limit(FINDS_SHOWN);
      return { web: house?.web ?? false, rows, finds };
    });
    if (seen === undefined) return reply;
    return reply.send({
      web: seen.web,
      cose: seen.rows.map((row) => ({
        id: row.id,
        gosino: row.gosino,
        tipo: row.kind,
        soggetto: open(row.subject),
        fonte: row.source,
        stato: row.until < new Date() && row.status === "attivo" ? "scaduto" : row.status,
        fino: row.until,
        creata: row.createdAt,
        cercata: row.lastSearchedAt,
      })),
      trovati: seen.finds.map((find) => ({
        cosa: find.watchId,
        titolo: open(find.titleEnc),
        link: open(find.linkEnc),
        frase: open(find.lineEnc),
        esito: find.verdict,
        quando: find.createdAt,
      })),
    });
  });

  /** A mano: le ricerche sono il soggetto stesso, il vettore lo calcola il sogno. */
  app.post("/v1/tieni-d-occhio", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = addSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "cosa, di che tipo, e quale gosino?");
    const { gosino, soggetto, tipo, giorni } = parsed.data;
    const made = await inAccount(deps.db, request, reply, owner, async (tx, accountId) => {
      const [mine] = await tx
        .select({ id: gosini.id })
        .from(gosini)
        .where(and(eq(gosini.id, gosino), eq(gosini.accountId, accountId)));
      if (mine === undefined) return "missing" as const;
      const [row] = await tx
        .insert(watches)
        .values({
          accountId,
          gosinoId: gosino,
          kind: tipo,
          subjectEnc: encryptText(soggetto, deps.dataKey),
          queriesEnc: encryptText(JSON.stringify([soggetto]), deps.dataKey),
          source: "pannello",
          until: new Date(Date.now() + giorni * 86_400_000),
        })
        .returning({ id: watches.id });
      return row;
    });
    if (made === undefined && reply.sent) return reply;
    if (made === "missing" || made === undefined) return problem(reply, 404, "gosino non trovato");
    return reply.code(201).send({ id: made.id });
  });

  /** Dimenticare è cancellare: la cosa e tutto quello che ha trovato. */
  app.delete("/v1/tieni-d-occhio/:id", { preHandler: deps.guard }, async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { id: string }).id);
    if (!id.success) return problem(reply, 404, "non la sto seguendo");
    const gone = await inAccount(deps.db, request, reply, owner, (tx, accountId) =>
      tx
        .delete(watches)
        .where(and(eq(watches.id, id.data), eq(watches.accountId, accountId)))
        .returning({ id: watches.id }),
    );
    if (gone === undefined) return reply;
    return gone.length > 0 ? reply.code(204).send() : problem(reply, 404, "non la sto seguendo");
  });

  app.put("/v1/tieni-d-occhio/web", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = z.object({ attiva: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "accesa o spenta?");
    const done = await inAccount(deps.db, request, reply, owner, (tx, accountId) =>
      tx.update(accounts).set({ watchWeb: parsed.data.attiva }).where(eq(accounts.id, accountId)),
    );
    if (done === undefined) return reply;
    return reply.send({ web: parsed.data.attiva });
  });
}

