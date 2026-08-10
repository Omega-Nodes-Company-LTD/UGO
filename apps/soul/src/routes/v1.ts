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
import type { PsycheService } from "../services/psycheService.js";

export interface V1Deps {
  db: DbClient;
  chat: ChatService;
  psyche: PsycheService;
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

  app.get("/v1/psyche", async (_request, reply) => {
    const { vars, label, phrase } = deps.psyche.current();
    return reply.send({ vars, label, phrase });
  });

  app.post("/v1/events", async (request, reply) => {
    const parsed = eventRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      problem(reply, 400, "Invalid event", z.prettifyError(parsed.error));
      return;
    }
    const inserted = await deps.db
      .insert(events)
      .values({ source: parsed.data.source, type: parsed.data.type, payload: parsed.data.payload })
      .returning({ id: events.id });
    const view = await deps.psyche.applyEventType(parsed.data.type);
    // IDs only in responses/logs — the payload is never echoed back
    return reply.code(201).send({ id: inserted[0]?.id, moodLabel: view.label });
  });

  app.get("/v1/memories/search", async (request, reply) => {
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
