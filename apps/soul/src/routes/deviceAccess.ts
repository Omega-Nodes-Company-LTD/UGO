import type { DbClient } from "@ugo/db";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import {
  createLoginLink,
  createPairingCode,
  redeemLoginLink,
  redeemPairingCode,
  WEB_SESSION_TTL_MS,
} from "../services/deviceAccess.js";
import { loginEmail, type Mailer } from "../services/resendMailer.js";
import { soleAccount } from "../services/tenantAuth.js";
import { AttemptLimiter, appleAppSiteAssociation, sessionCookie } from "../services/webSecurity.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Le porte della casa sul web (ADR-127): il codice di abbinamento, il link via
 * email, e il file che dice ad Apple quali link aprono l'app.
 *
 * Le tre rotte senza chiave rispondono sempre nello stesso modo a chi sbaglia
 * — 401 per il codice, 202 per l'email — perché una risposta diversa per «non
 * esiste» e «scaduto» insegnerebbe a indovinare.
 */

export interface DeviceAccessDeps {
  db: DbClient;
  guard: PreHandler;
  audit?: AuditLogger;
  publicUrl?: string;
  appleAppIds: readonly string[];
  /** assente = il link via email non esiste, e la rotta lo dice */
  magicLink?: { mailer: Mailer; ownerEmail: string };
}

const pairSchema = z.object({
  code: z.string().min(1).max(20),
  deviceLabel: z.string().trim().min(1).max(60),
});
const emailSchema = z.object({ email: z.email().max(200) });
const redeemSchema = z.object({
  secret: z.string().min(1).max(200),
  deviceLabel: z.string().trim().min(1).max(60).optional(),
});

function problem(reply: FastifyReply, status: number, title: string): FastifyReply {
  return reply.code(status).type("application/problem+json").send({ type: "about:blank", title, status });
}

export function registerDeviceAccessRoutes(app: FastifyInstance, deps: DeviceAccessDeps): void {
  const limiter = new AttemptLimiter();
  const tooMany = (ip: string, reply: FastifyReply): boolean => {
    if (limiter.allow(ip)) return false;
    void problem(reply, 429, "Too many attempts");
    return true;
  };

  app.get("/.well-known/apple-app-site-association", (_request, reply) =>
    reply.type("application/json").send(appleAppSiteAssociation(deps.appleAppIds)),
  );

  // il pannello chiede un codice: solo chi amministra la casa
  app.post("/v1/pairing-codes", { preHandler: deps.guard }, async (request, reply) => {
    const made = await inAccount(deps.db, request, reply, { requireAdmin: true }, async (db, accountId) =>
      createPairingCode(db, { accountId, createdByTokenId: request.tenant?.tokenId ?? "unknown" }),
    );
    if (made === undefined) return reply;
    await deps.audit?.record({
      verb: "pairing_code_issued",
      outcome: "ok",
      actor: request.tenant,
      resourceType: "pairing_code",
      resourceId: "-",
    });
    return reply.code(201).send({ code: made.code, expiresAt: made.expiresAt.toISOString() });
  });

  app.post("/v1/pair", async (request, reply) => {
    if (tooMany(request.ip, reply)) return reply;
    const parsed = pairSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Invalid pairing request");
    const issued = await redeemPairingCode(deps.db, parsed.data);
    if (issued === undefined) return problem(reply, 401, "Invalid or expired code");
    await deps.audit?.record({
      verb: "device_paired",
      outcome: "ok",
      resourceType: "token",
      resourceId: issued.id,
    });
    return reply.code(201).send({ token: issued.token });
  });

  app.post("/v1/login/email", async (request, reply) => {
    if (tooMany(request.ip, reply)) return reply;
    const parsed = emailSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Invalid email");
    if (deps.magicLink === undefined || deps.publicUrl === undefined) {
      return problem(reply, 501, "Email login is not configured");
    }
    // stessa risposta per chi c'è e chi non c'è: niente elenco di indirizzi validi
    const ours = parsed.data.email.toLowerCase() === deps.magicLink.ownerEmail.toLowerCase();
    const accountId = ours ? await soleAccount(deps.db) : undefined;
    if (accountId !== undefined) {
      const secret = await createLoginLink(deps.db, accountId);
      const link = `${deps.publicUrl.replace(/\/$/u, "")}/login/${secret}`;
      await deps.magicLink.mailer.send({ to: deps.magicLink.ownerEmail, ...loginEmail(link) });
    }
    return reply.code(202).send({ sent: true });
  });

  // l'app (iOS) apre il link universale e scambia il segreto con una chiave sua
  app.post("/v1/login/redeem", async (request, reply) => {
    if (tooMany(request.ip, reply)) return reply;
    const parsed = redeemSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Invalid login request");
    const issued = await redeemLoginLink(
      deps.db,
      parsed.data.secret,
      `dispositivo: ${parsed.data.deviceLabel ?? "app"} (email)`,
    );
    if (issued === undefined) return problem(reply, 401, "Invalid or expired link");
    return reply.code(201).send({ token: issued.token });
  });

  // ADR-130: il link universale d'abbinamento, aperto senza l'app (Safari):
  // il codice non si consuma qui, si precompila nel muso
  app.get("/pair/:code", async (request, reply) => {
    const { code } = request.params as { code: string };
    return reply.redirect(`/?pair=${encodeURIComponent(code)}`, 302);
  });

  // il browser apre il link: diventa un cookie, e si torna al muso
  app.get("/login/:secret", async (request, reply) => {
    if (tooMany(request.ip, reply)) return reply;
    const { secret } = request.params as { secret: string };
    const issued = await redeemLoginLink(deps.db, secret, "web: accesso via email");
    if (issued === undefined) return reply.redirect("/?accesso=scaduto", 302);
    return reply
      .header("set-cookie", sessionCookie(issued.token, Math.floor(WEB_SESSION_TTL_MS / 1000)))
      .redirect("/", 302);
  });
}
