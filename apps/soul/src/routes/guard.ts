import type { DbClient } from "@ugo/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TenantResolver, type TenantContext } from "../services/tenantAuth.js";

/**
 * Who is asking, and may they (ADR-019, SECURITY_COMPLIANCE §9).
 *
 * Until now this file compared one shared secret and answered yes or no. A
 * shared secret can say "you know the password"; it cannot say *which house*
 * you speak for, and with more than one family under the same server that is
 * the only question worth asking. `tenantAuth.ts` has known how to answer it
 * since ADR-019 phase 1 and nothing called it: this is the wire.
 *
 * Two separate things, deliberately:
 *
 *  - **resolution** is a global `onRequest` hook that never refuses. It says
 *    who is asking when a token says so, and leaves `request.tenant` null
 *    otherwise. Routes that are open to ordinary conversation still learn the
 *    caller's house when the caller offered one;
 *  - **the guard** is a preHandler that turns a null tenant into a 401. It
 *    still protects only what is destructive (erasure), exfiltrating (export)
 *    or unbounded in cost (dream, meeting bot, upload credentials). Ordinary
 *    conversation stays open: its blast radius is capped by the budget guard.
 */

declare module "fastify" {
  interface FastifyRequest {
    /** the caller's house and authority, or null when the bearer granted nothing */
    tenant: TenantContext | null;
  }
}

export type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export interface TenantAuthOptions {
  db: DbClient;
  /**
   * The pre-ADR-019 shared secret, still honoured and still meaning
   * `operator`, so no existing deployment breaks the day this lands. Absent
   * only in development — boot refuses production without it (`config/env.ts`).
   */
  legacyToken?: string | undefined;
  /** the house a legacy token speaks for on a single-family install */
  legacyHouseholdId?: string | undefined;
}

function bearerOf(request: FastifyRequest): string {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

/**
 * Must be called before any route is registered: Fastify binds `onRequest`
 * hooks to the routes that exist in the same context when they are declared.
 */
export function registerTenantResolution(app: FastifyInstance, options: TenantAuthOptions): void {
  const resolver = new TenantResolver({
    db: options.db,
    legacyToken: options.legacyToken,
    legacyHouseholdId: options.legacyHouseholdId,
  });
  // no configured secret means development, where the server has always been
  // open; it stays open, but it now hands routes a context to scope by rather
  // than nothing at all
  const openForDevelopment = options.legacyToken === undefined;
  const developmentContext: TenantContext = {
    householdId: options.legacyHouseholdId ?? null,
    role: "operator",
    tokenId: "dev",
  };

  app.decorateRequest("tenant", null);
  app.addHook("onRequest", async (request) => {
    const token = bearerOf(request);
    const resolved = token === "" ? undefined : await resolver.resolve(token);
    request.tenant = resolved ?? (openForDevelopment ? developmentContext : null);
  });
}

export function createAuthGuard(): PreHandler {
  return async (request, reply) => {
    if (request.tenant !== null) return;
    // log the route, never the attempted secret
    request.log.warn({ url: request.url }, "unauthorized attempt on a protected route");
    await reply
      .code(401)
      .type("application/problem+json")
      .send({ type: "about:blank", title: "Unauthorized", status: 401 });
  };
}
