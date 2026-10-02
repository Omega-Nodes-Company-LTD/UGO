import type { DbClient } from "@ugo/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuditLogger } from "../services/auditLog.js";
import { resolveSession } from "../services/auth/sessions.js";
import { TenantResolver, type TenantContext } from "../services/tenantAuth.js";
import { DEVICE_COOKIE, readCookie, SESSION_COOKIE } from "./cookies.js";

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
    /**
     * ADR-124: how the caller proved it. A cookie travels by itself, so a
     * cookie-borne write must also prove it comes from our own pages (CSRF);
     * a bearer has to be attached on purpose and needs no such proof.
     */
    authVia: "bearer" | "cookie" | null;
  }
  interface FastifyInstance {
    /** ADR-121: soul faces the internet — nobody anonymous speaks for a house */
    publicMode: boolean;
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
  legacyAccountId?: string | undefined;
  /** ADR-121: never open for development, whatever the configuration says */
  publicMode?: boolean;
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
    legacyAccountId: options.legacyAccountId,
  });
  // no configured secret means development, where the server has always been
  // open; it stays open, but it now hands routes a context to scope by rather
  // than nothing at all
  const openForDevelopment = options.legacyToken === undefined && options.publicMode !== true;
  const developmentContext: TenantContext = {
    accountId: options.legacyAccountId ?? null,
    role: "operator",
    tokenId: "dev",
  };

  app.decorate("publicMode", options.publicMode === true);
  app.decorateRequest("tenant", null);
  app.decorateRequest("authVia", null);
  // in order: a bearer someone attached on purpose, the browser session
  // (ADR-124), the paired kiosk (ADR-121). The first that grants something wins
  app.addHook("onRequest", async (request) => {
    const token = bearerOf(request);
    if (token !== "") {
      const resolved = await resolver.resolve(token);
      if (resolved !== undefined) {
        request.tenant = resolved;
        request.authVia = "bearer";
        return;
      }
    }
    const session = readCookie(request, SESSION_COOKIE);
    const device = readCookie(request, DEVICE_COOKIE);
    const fromCookie =
      (session === undefined ? undefined : await resolveSession(options.db, session)) ??
      (device === undefined ? undefined : await resolver.resolve(device));
    if (fromCookie !== undefined) {
      request.tenant = fromCookie;
      request.authVia = "cookie";
      return;
    }
    request.tenant = openForDevelopment ? developmentContext : null;
  });
}

export function createAuthGuard(audit?: AuditLogger): PreHandler {
  return async (request, reply) => {
    if (request.tenant !== null) return;
    // log the route, never the attempted secret
    request.log.warn({ url: request.url }, "unauthorized attempt on a protected route");
    // ADR-049: un 401 restava solo nel log di Fastify, che ruota e se ne va.
    // E' la riga piu' preziosa dell'intero giornale — qualcuno ha bussato con
    // un token che non vale — e non aveva un posto dove durare. La casa e'
    // assente per costruzione: e' esattamente cio' che non si sa ancora.
    await audit?.record({
      verb: "denied",
      outcome: "denied",
      resourceType: "route",
      resourceId: request.url,
    });
    await reply
      .code(401)
      .type("application/problem+json")
      .send({ type: "about:blank", title: "Unauthorized", status: 401 });
  };
}
