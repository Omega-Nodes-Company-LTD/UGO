import type { DbClient } from "@ugo/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { canAdminister, householdOf, soleHousehold } from "../services/tenantAuth.js";
import type { ExportService } from "../services/privacy/exportService.js";
import { BeingNotFoundError, type ForgetService } from "../services/privacy/forgetService.js";
import type { PreHandler } from "./guard.js";

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

/** an operator serves many houses and must say which one (`?casa=<uuid>`) */
const scopeQuerySchema = z.object({ casa: z.uuid().optional() });

export interface PrivacyRouteDeps {
  db: DbClient;
  forget: ForgetService;
  exporter: ExportService;
  guard: PreHandler;
}

/**
 * The house this request works on, or a problem response saying why not.
 * `undefined` from `householdOf` means either "an operator did not say which"
 * or "that house is not yours" — both answer 400/403 without confirming
 * whether the house exists.
 */
async function scopeOf(
  db: DbClient,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | undefined> {
  const tenant = request.tenant;
  if (tenant === null) return undefined; // unreachable behind the guard
  if (!canAdminister(tenant)) {
    await reply
      .code(403)
      .type("application/problem+json")
      .send({ type: "about:blank", title: "Forbidden", status: 403 });
    return undefined;
  }
  const query = scopeQuerySchema.safeParse(request.query);
  const requested = query.success ? query.data.casa : undefined;
  const householdId = await householdOf(db, tenant, requested);
  if (householdId !== undefined) return householdId;

  if (requested !== undefined) {
    // a house that is not yours and a house that does not exist answer the
    // same way, so nobody learns the neighbourhood by probing (BOLA)
    await reply
      .code(404)
      .type("application/problem+json")
      .send({ type: "about:blank", title: "House not found", status: 404 });
    return undefined;
  }

  // an operator that did not say which house, on an install that has only one:
  // the single-family deployments ADR-019 §107 promises not to break
  if (tenant.role === "operator") {
    const sole = await soleHousehold(db);
    if (sole !== undefined) return sole;
  }
  await reply.code(400).type("application/problem+json").send({
    type: "about:blank",
    title: "Which house?",
    status: 400,
    detail: "questo token vale per più case: indica ?casa=<uuid>",
  });
  return undefined;
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
    const householdId = await scopeOf(deps.db, request, reply);
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
    const householdId = await scopeOf(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const bundle = await deps.exporter.exportAll(householdId);
    return reply
      .header("content-disposition", 'attachment; filename="ugo-export.json"')
      .send(bundle);
  });
}
