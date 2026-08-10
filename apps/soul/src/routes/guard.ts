import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Defense in depth over the tailnet (SECURITY_COMPLIANCE §9, ADR-007).
 *
 * The network already keeps strangers out; this guard keeps *mistakes* out —
 * a curl fired at the wrong host, another device on the tailnet, a browser
 * tab left open. It protects the operations that are destructive (erasure),
 * exfiltrating (export), or unbounded in cost (dream, meeting bot, upload
 * credentials). Ordinary conversation stays open: its blast radius is
 * already capped by the daily budget guard.
 */

export type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // compare against a same-length buffer so length alone never leaks via timing
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function createAuthGuard(token: string | undefined): PreHandler {
  return async (request, reply) => {
    if (token === undefined) return; // dev only: boot refuses this in production
    const header = request.headers.authorization ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (provided === "" || !safeEquals(provided, token)) {
      // log the route, never the attempted secret
      request.log.warn({ url: request.url }, "unauthorized attempt on a protected route");
      await reply
        .code(401)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Unauthorized", status: 401 });
    }
  };
}
