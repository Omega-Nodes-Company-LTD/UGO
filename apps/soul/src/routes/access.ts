import { withAccount, type DbClient } from "@ugo/db";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import { consumeLink, requestLink, type LinkDeps } from "../services/auth/links.js";
import type { RateLimiter } from "../services/auth/rateLimit.js";
import { normalizeEmail } from "../services/auth/secrets.js";
import {
  deviceLabel,
  listSessions,
  openSession,
  revokeSession,
  SESSION_DAYS,
  sessionIdOf,
} from "../services/auth/sessions.js";
import { clearCookie, SESSION_COOKIE, setCookie } from "./cookies.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";
import { confirmPage } from "./site/pages.js";

/**
 * Le porte dell'accesso (ADR-124).
 *
 * Il link della mail non entra da solo: `GET /auth/verifica` mostra una
 * pagina con un pulsante, e solo il `POST` consuma il link. Gli antivirus
 * della posta aprono i link per guardarci dentro — se bastasse un GET,
 * entrerebbero loro al posto tuo e a te resterebbe un link già usato.
 */

const linkSchema = z.object({
  // gli spazi incollati con l'indirizzo non sono un indirizzo sbagliato
  email: z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.email().max(254)),
  scopo: z.enum(["iscrizione", "accesso"]),
  /** termini e informativa (ADR-124 §8): obbligatori per iscriversi */
  consenso: z.boolean().optional(),
});

const verifySchema = z.object({ t: z.string().min(20).max(200) });

export interface AccessRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  links: Omit<LinkDeps, "db" | "audit">;
  limiter: RateLimiter;
  audit?: AuditLogger | undefined;
}

async function problem(reply: FastifyReply, status: number, title: string, detail?: string): Promise<FastifyReply> {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

export function registerAccessRoutes(app: FastifyInstance, deps: AccessRoutesDeps): void {
  const links: LinkDeps = { ...deps.links, db: deps.db, audit: deps.audit };
  const ours = new URL(deps.links.publicUrl).origin;
  // il pulsante della pagina di conferma è un <form>: funziona anche senza JS
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });

  app.post("/v1/auth/link", async (request, reply) => {
    const parsed = linkSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Invalid request", "serve un indirizzo email valido");
    const { email, scopo, consenso } = parsed.data;
    if (scopo === "iscrizione" && consenso !== true) {
      return problem(reply, 400, "Consent required", "per iscriverti accetta termini e informativa");
    }
    const byIp = await deps.limiter.allow("linkByIp", request.ip);
    const byEmail = await deps.limiter.allow("linkByEmail", normalizeEmail(email));
    if (!byIp || !byEmail) return problem(reply, 429, "Too many requests", "troppe richieste: riprova fra un po'");
    await requestLink(links, { email, purpose: scopo === "iscrizione" ? "signup" : "login" });
    // sempre la stessa risposta: che l'indirizzo esista lo sa solo la sua casella
    return reply.code(202).send({ ok: true });
  });

  app.get("/auth/verifica", async (request, reply) => {
    const parsed = verifySchema.safeParse(request.query);
    return reply
      .type("text/html; charset=utf-8")
      .header("cache-control", "no-store")
      .send(confirmPage(parsed.success ? parsed.data.t : undefined));
  });

  app.post("/auth/verifica", async (request, reply) => {
    // il login CSRF: una pagina altrui che ti fa entrare nel SUO account
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== ours) return problem(reply, 403, "Cross-site request refused");
    const parsed = verifySchema.safeParse(request.body);
    const admitted = parsed.success ? await consumeLink(links, parsed.data.t) : undefined;
    if (admitted === undefined) return reply.redirect("/accedi?link=scaduto", 303);
    const session = await openSession(deps.db, {
      accountId: admitted.accountId,
      loginId: admitted.loginId,
      label: deviceLabel(request.headers["user-agent"]),
    });
    const audit = deps.audit;
    if (audit !== undefined) {
      await withAccount(deps.db, admitted.accountId, (tx) =>
        audit.record(
          { verb: "session_opened", outcome: "ok", accountId: admitted.accountId, resourceType: "session", resourceId: session.id },
          tx,
        ),
      );
    }
    setCookie(reply, SESSION_COOKIE, session.token, { maxAgeSec: SESSION_DAYS * 86_400, sameSite: "Lax" });
    return reply.redirect(admitted.created ? "/casa#/benvenuto" : "/casa", 303);
  });

  app.post("/v1/auth/esci", async (request, reply) => {
    const id = sessionIdOf(request.tenant);
    const accountId = request.tenant?.accountId;
    if (id !== undefined && accountId != null) {
      const actor = request.tenant;
      await withAccount(deps.db, accountId, async (tx) => {
        await revokeSession(tx, accountId, id);
        await deps.audit?.record({ verb: "session_revoked", outcome: "ok", accountId, actor, resourceType: "session", resourceId: id }, tx);
      });
    }
    clearCookie(reply, SESSION_COOKIE);
    return reply.code(204).send();
  });

  app.get("/v1/sessioni", { preHandler: deps.guard }, async (request, reply) => {
    const current = sessionIdOf(request.tenant);
    const found = await inAccount(deps.db, request, reply, {}, (db, accountId) =>
      listSessions(db, accountId, current),
    );
    if (found === undefined) return reply;
    return reply.send({ sessioni: found });
  });

  app.delete("/v1/sessioni/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!z.uuid().safeParse(id).success) return problem(reply, 404, "Session not found");
    const done = await inAccount(deps.db, request, reply, { requireAdmin: true }, async (db, accountId) => {
      const revoked = await revokeSession(db, accountId, id);
      if (revoked) {
        await deps.audit?.record({ verb: "session_revoked", outcome: "ok", accountId, actor: request.tenant, resourceType: "session", resourceId: id }, db);
      }
      return revoked;
    });
    if (done === undefined) return reply;
    if (!done) return problem(reply, 404, "Session not found");
    return reply.code(204).send();
  });
}
