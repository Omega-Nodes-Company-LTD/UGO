import { messages, plazaInvites, plazaPresence, withAccount} from "@ugo/db";
import { decryptText } from "@ugo/shared";
import { and, asc, eq, gte, lte, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { answer, blockSender, invite, invitesOf } from "../services/plaza/invites.js";
import { runMeeting, type MeetingDeps } from "../services/plaza/meeting.js";
import { enter, leave, look } from "../services/plaza/presence.js";
import { problem } from "./billing.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * La piazza, dal pannello (ADR-132). Tutto del proprietario: entrare,
 * invitare, accettare, bloccare. L'incontro parte all'accettazione e gira da
 * solo; il pannello ne segue i turni e, alla fine, legge la SUA copia.
 */

export type PlazaRoutesDeps = MeetingDeps & { guard: PreHandler };

const enterSchema = z.object({ gosino: z.uuid() });
const inviteSchema = z.object({ gosino: z.uuid(), a: z.uuid() });
const REFUSAL: Record<string, [number, string]> = {
  "not-present": [409, "il tuo gosino deve essere in piazza per invitare"],
  gone: [404, "non è più in piazza"],
  blocked: [404, "non è più in piazza"],
  busy: [409, "uno dei due sta già chiacchierando: riprova fra poco"],
  "too-many": [429, "per oggi basta inviti: cinque al giorno"],
};

export function registerPlazaRoutes(app: FastifyInstance, deps: PlazaRoutesDeps): void {
  const owner = { requireAdmin: true };
  const accountOf = (request: Parameters<typeof inAccount>[1], reply: Parameters<typeof inAccount>[2]) =>
    inAccount(deps.db, request, reply, owner, (_db, id) => Promise.resolve(id));

  app.get("/v1/piazza", { preHandler: deps.guard }, async (request, reply) => {
    const accountId = await accountOf(request, reply);
    if (accountId === undefined) return reply;
    const mine = await withAccount(deps.db, accountId, (tx) =>
      tx
        .select({ gosino: plazaPresence.gosinoId, handle: plazaPresence.handle, scade: plazaPresence.expiresAt })
        .from(plazaPresence)
        .where(eq(plazaPresence.accountId, accountId)),
    );
    return reply.send({ presenti: await look(deps.db, accountId), miei: mine, inviti: await invitesOf(deps.db, accountId) });
  });

  app.post("/v1/piazza/presenza", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = enterSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "quale gosino?");
    const accountId = await accountOf(request, reply);
    if (accountId === undefined) return reply;
    const mood = deps.moodOf?.(accountId, parsed.data.gosino) ?? "curioso";
    const present = await enter(deps.db, accountId, parsed.data.gosino, mood);
    if (present === undefined) return problem(reply, 404, "gosino non trovato");
    return reply.code(201).send(present);
  });

  app.delete("/v1/piazza/presenza", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = enterSchema.safeParse(request.query);
    if (!parsed.success) return problem(reply, 400, "quale gosino?");
    const accountId = await accountOf(request, reply);
    if (accountId === undefined) return reply;
    await leave(deps.db, accountId, parsed.data.gosino);
    return reply.code(204).send();
  });

  app.post("/v1/piazza/inviti", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "chi invita chi?");
    const accountId = await accountOf(request, reply);
    if (accountId === undefined) return reply;
    const sent = await invite(deps.db, { accountId, gosinoId: parsed.data.gosino, handle: parsed.data.a });
    if (typeof sent === "string") {
      const [status, why] = REFUSAL[sent] ?? [409, sent];
      return problem(reply, status, why);
    }
    return reply.code(201).send(sent);
  });

  app.post("/v1/piazza/inviti/:id/:azione", { preHandler: deps.guard }, async (request, reply) => {
    const { id, azione } = request.params as { id: string; azione: string };
    if (!z.uuid().safeParse(id).success || !["accetta", "rifiuta", "blocca"].includes(azione)) {
      return problem(reply, 404, "invito non trovato");
    }
    const accountId = await accountOf(request, reply);
    if (accountId === undefined) return reply;
    if (azione === "blocca") {
      return (await blockSender(deps.db, accountId, id)) ? reply.send({ ok: true }) : problem(reply, 404, "invito non trovato");
    }
    const answered = await answer(deps.db, accountId, id, azione === "accetta");
    if (answered === undefined) return problem(reply, 404, "invito non trovato o scaduto");
    if (azione === "accetta") {
      // l'incontro gira da sé: secondi di pensiero non tengono aperta una richiesta
      runMeeting(deps, answered).catch(async (error: unknown) => {
        request.log.warn({ invite: id, reason: error instanceof Error ? error.name : "unknown" }, "plaza meeting failed");
        await withAccount(deps.db, accountId, (tx) =>
          tx.update(plazaInvites).set({ status: "interrotto", endedAt: new Date() }).where(eq(plazaInvites.id, id)),
        );
      });
      return reply.code(202).send({ stato: "accettato" });
    }
    return reply.send({ stato: "rifiutato" });
  });

  /** La SUA copia della chiacchierata: i messaggi di piazza del suo gosino, in quella finestra. */
  app.get("/v1/piazza/inviti/:id/battute", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!z.uuid().safeParse(id).success) return problem(reply, 404, "invito non trovato");
    const accountId = await accountOf(request, reply);
    if (accountId === undefined) return reply;
    const lines = await withAccount(deps.db, accountId, async (tx) => {
      const [row] = await tx
        .select()
        .from(plazaInvites)
        .where(and(eq(plazaInvites.id, id), or(eq(plazaInvites.fromAccountId, accountId), eq(plazaInvites.toAccountId, accountId))));
      if (row?.endedAt == null) return undefined;
      const mine = row.fromAccountId === accountId ? row.fromGosinoId : row.toGosinoId;
      return tx
        .select({ role: messages.role, text: messages.text })
        .from(messages)
        .where(
          and(
            eq(messages.gosinoId, mine),
            eq(messages.channel, "piazza"),
            gte(messages.ts, row.createdAt),
            lte(messages.ts, row.endedAt),
          ),
        )
        .orderBy(asc(messages.ts));
    });
    if (lines === undefined) return problem(reply, 404, "l'incontro non è finito");
    return reply.send({
      battute: lines.map((line) => ({ chi: line.role === "assistant" ? "mio" : "altro", testo: decryptText(line.text, deps.masterKey) })),
    });
  });
}
