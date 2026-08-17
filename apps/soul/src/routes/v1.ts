import { events, type DbClient } from "@ugo/db";
import {
  chatRequestSchema,
  chatResponseSchema,
  eventRequestSchema,
  memorySearchQuerySchema,
} from "@ugo/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { BeingNotFoundError, type ChatService } from "../services/chatService.js";
import type { GosinoRegistry } from "../services/pack/runtimes.js";
import type { PsycheService } from "../services/psycheService.js";
import type { PreHandler } from "./guard.js";
import { eldestExemplarOf, resolveHousehold } from "./scope.js";

export interface V1Deps {
  db: DbClient;
  chat: ChatService;
  psyche: PsycheService;
  /** ADR-032: present once the house can hold more than one of them */
  registry?: GosinoRegistry;
  /**
   * Il guardiano di `/v1/memories/search`, e di quella soltanto.
   *
   * Le altre rotte di questo file restano aperte per la ragione dichiarata in
   * `stt.ts` (ADR-007: mono-utente, mai pubblico). La ricerca no: restituisce
   * il **testo** dei ricordi, che è esattamente ciò che `archive.ts` protegge
   * scrivendo «these return stored content, not just counts». La stessa classe
   * di dato non può essere guardata di là e aperta di qua.
   */
  guard: PreHandler;
}

/** RFC 7807 problem responses (PROGETTO §5.7). */
function problem(reply: FastifyReply, status: number, title: string, detail?: string): void {
  void reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

export function registerV1Routes(app: FastifyInstance, deps: V1Deps): void {
  app.post("/v1/chat", async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      problem(reply, 400, "Invalid chat request", z.prettifyError(parsed.error));
      return;
    }
    try {
      const response = await deps.chat.handle(parsed.data);
      return await reply.send(chatResponseSchema.parse(response));
    } catch (error) {
      if (error instanceof BeingNotFoundError) {
        problem(reply, 404, "Person not found");
        return;
      }
      throw error;
    }
  });

  app.get("/v1/psyche", async (request, reply) => {
    // ADR-034: with more than one exemplar under the roof, an unscoped read
    // returned whichever of them had snapshotted last — a mood belonging to
    // nobody. Absent `gosino` still means the house's own single creature.
    const asked = (request.query as { gosino?: string }).gosino;
    // this route is open to the body, which may carry no token at all: with no
    // identity there is no house to narrow to, and the single fallback psyche
    // answers exactly as it did before ADR-019
    const scope = await resolveHousehold(deps.db, request);
    const who = scope.ok ? deps.registry?.resolve(asked, scope.householdId) : undefined;
    const psyche = who?.psyche ?? deps.psyche;
    const at = new Date();
    const { vars, label, phrase } = psyche.current(at);
    return reply.send({
      vars,
      label,
      phrase,
      breakdown: psyche.breakdown(at),
      ...(who !== undefined && { who: { id: who.id, name: who.name, where: who.where } }),
    });
  });

  app.post("/v1/events", async (request, reply) => {
    const parsed = eventRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      problem(reply, 400, "Invalid event", z.prettifyError(parsed.error));
      return;
    }
    // the body sends these, and the body may carry no token: with no identity
    // there is only one house to put an event in, and if there is more than
    // one the dock has to be configured (ADR-019 phase 2)
    const scope = await resolveHousehold(deps.db, request);
    if (!scope.ok) {
      problem(reply, scope.status, scope.title, scope.detail);
      return;
    }
    const who = deps.registry?.resolve((request.query as { gosino?: string }).gosino, scope.householdId);
    const inserted = await deps.db
      .insert(events)
      .values({
        gosinoId: who?.id ?? (await eldestExemplarOf(deps.db, scope.householdId)),
        source: parsed.data.source,
        type: parsed.data.type,
        payload: parsed.data.payload,
      })
      .returning({ id: events.id });
    const view = await (who?.psyche ?? deps.psyche).applyEventType(parsed.data.type);
    // IDs only in responses/logs — the payload is never echoed back
    return reply.code(201).send({ id: inserted[0]?.id, moodLabel: view.label });
  });

  app.get("/v1/memories/search", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = memorySearchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      problem(reply, 400, "Invalid search query", z.prettifyError(parsed.error));
      return;
    }
    const results = await deps.chat.search(parsed.data.q, parsed.data.k);
    return reply.send(
      results.map(({ id, text, kind, score, similarity }) => ({
        id,
        text,
        kind,
        score,
        similarity,
      })),
    );
  });
}
