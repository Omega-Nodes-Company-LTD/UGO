import { gosini, type DbClient } from "@ugo/db";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { MeetingsService } from "../services/meetingsService.js";
import type { PreHandler } from "./guard.js";
import { eldestExemplarOf, accountScope } from "./scope.js";

const joinRequestSchema = z.object({
  url: z.url(),
  title: z.string().max(200).optional(),
  /**
   * CHI va in call (ADR-019). Senza, andava sempre il primo esemplare della
   * casa di boot, qualunque cosa il pannello mostrasse: con due gosini si
   * mandava «UGO in riunione» e ci andava sempre lo stesso, e la trascrizione
   * finiva nella sua biografia. Facoltativo: senza, va il più anziano della
   * casa — che è il comportamento di prima, detto ad alta voce.
   */
  gosino: z.uuid().optional(),
});

function problem(reply: FastifyReply, status: number, title: string, detail?: string): void {
  void reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

export interface MeetingsRoutesDeps {
  db: DbClient;
  service: MeetingsService;
  guard: PreHandler;
}

/** POST /v1/meetings/join (PROGETTO §5.7): launches the Vexa bot. */
export function registerMeetingsRoutes(app: FastifyInstance, deps: MeetingsRoutesDeps): void {
  app.post("/v1/meetings/join", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = joinRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      problem(reply, 400, "Invalid meeting request", z.prettifyError(parsed.error));
      return;
    }
    const accountId = await accountScope(deps.db, request, reply);
    if (accountId === undefined) return reply;

    let gosinoId: string;
    if (parsed.data.gosino === undefined) {
      try {
        gosinoId = await eldestExemplarOf(deps.db, accountId);
      } catch {
        problem(reply, 409, "Nobody to send", "questa casa non ha ancora nessun esemplare");
        return;
      }
    } else {
      // il gosino di un'altra casa risponde 404, come ovunque (anti-BOLA)
      const [mine] = await deps.db
        .select({ id: gosini.id })
        .from(gosini)
        .where(and(eq(gosini.accountId, accountId), eq(gosini.id, parsed.data.gosino)))
        .limit(1);
      if (mine === undefined) {
        problem(reply, 404, "Not Found");
        return;
      }
      gosinoId = mine.id;
    }

    try {
      const ref = await deps.service.join(parsed.data.url, parsed.data.title, {
        gosinoId,
        accountId,
      });
      return await reply.code(201).send(ref);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "join failed";
      if (/unsupported|unrecognized/.test(detail)) {
        problem(reply, 422, "Unsupported meeting url", detail);
        return;
      }
      problem(reply, 502, "Meeting bot unavailable", detail);
    }
  });
}
