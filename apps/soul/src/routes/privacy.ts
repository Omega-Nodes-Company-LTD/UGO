import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ExportService } from "../services/privacy/exportService.js";
import { BeingNotFoundError, type ForgetService } from "../services/privacy/forgetService.js";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

/**
 * Data-subject rights over HTTP (PROGETTO §7). Always behind the guard, and
 * since ADR-019 phase 2 always about **one house**: exporting or erasing is
 * exactly where "the whole database" was the wrong default.
 */

const forgetRequestSchema = z.object({
  beingId: z.uuid(),
  /** erasure is irreversible: the caller must say so explicitly */
  confirm: z.literal(true),
});

export interface PrivacyRouteDeps {
  db: DbClient;
  forget: ForgetService;
  exporter: ExportService;
  guard: PreHandler;
}

export function registerPrivacyRoutes(app: FastifyInstance, deps: PrivacyRouteDeps): void {
  app.post("/v1/privacy/forget", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = forgetRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).type("application/problem+json").send({
        type: "about:blank",
        title: "Invalid erasure request",
        status: 400,
        detail: z.prettifyError(parsed.error),
      });
    }
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    try {
      const report = await deps.forget.forgetBeing(parsed.data.beingId, householdId);
      return await reply.send(report);
    } catch (error) {
      if (error instanceof BeingNotFoundError) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send({ type: "about:blank", title: "Being not found", status: 404 });
      }
      throw error;
    }
  });

  app.get("/v1/privacy/export", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const bundle = await deps.exporter.exportAll(householdId);
    return reply
      .header("content-disposition", 'attachment; filename="ugo-export.json"')
      .send(bundle);
  });
}
