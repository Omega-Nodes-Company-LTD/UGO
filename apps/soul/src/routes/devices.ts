import { accounts, withAccount, type DbClient } from "@ugo/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import { closeAccount } from "../services/auth/closing.js";
import { newPairing, pair } from "../services/auth/devices.js";
import type { RateLimiter } from "../services/auth/rateLimit.js";
import { clearCookie, DEVICE_COOKIE, SESSION_COOKIE, setCookie } from "./cookies.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Il chiosco e la fine (ADR-121, ADR-124 §9).
 *
 * - `POST /v1/dispositivi/codice` (proprietario): sei cifre per dieci minuti;
 * - `POST /v1/dispositivi/abbina` (aperta, con rate limit): il codice diventa
 *   un cookie `__Host-ugo_dev` che porta un token `member`. Il token non
 *   torna nel corpo: il JS del muso non lo vede mai, quindi non lo può
 *   perdere;
 * - `POST /v1/account/chiudi` (proprietario): la morte crittografica.
 */

const codeRequestSchema = z.object({ nome: z.string().trim().min(1).max(40) });
const pairSchema = z.object({ codice: z.string().trim().regex(/^\d{6}$/) });
const closeSchema = z.object({ conferma: z.string().trim().min(1) });

/** il massimo che un browser accetta (400 giorni): il chiosco resta abbinato */
const DEVICE_COOKIE_SEC = 400 * 86_400;

export interface DeviceRoutesDeps {
  db: DbClient;
  guard: PreHandler;
  masterKey: Buffer;
  /** il pepe dei codici (`pepperFrom(masterKey, "pair")`) */
  pairPepper: Buffer;
  limiter: RateLimiter;
  audit?: AuditLogger | undefined;
  /** ADR-125: l'abbonamento si annulla presso il PSP PRIMA della chiusura */
  cancelBilling?: (accountId: string) => Promise<void>;
}

async function problem(reply: FastifyReply, status: number, title: string, detail?: string): Promise<FastifyReply> {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

export function registerDeviceRoutes(app: FastifyInstance, deps: DeviceRoutesDeps): void {
  /**
   * Aperta: il muso la chiede all'avvio per sapere se deve chiedere il codice.
   * Esiste solo in pubblico — in casa il 404 vuol dire «nessun abbinamento
   * serve», ed è proprio quello che il muso deve capire.
   */
  app.get("/v1/dispositivi/io", async (request, reply) =>
    reply.header("cache-control", "no-store").send({ abbinato: request.tenant?.accountId != null }),
  );

  app.post("/v1/dispositivi/codice", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = codeRequestSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Invalid request", "dai un nome al chiosco");
    const code = await inAccount(deps.db, request, reply, { requireAdmin: true }, (db, accountId) =>
      newPairing(db, deps.pairPepper, { accountId, label: parsed.data.nome }),
    );
    if (code === undefined) return reply;
    return reply.code(201).send({ codice: code.code, scade: code.expiresAt.toISOString() });
  });

  app.post("/v1/dispositivi/abbina", async (request, reply) => {
    if (!(await deps.limiter.allow("pairByIp", request.ip))) {
      return problem(reply, 429, "Too many requests", "troppi tentativi: riprova fra un quarto d'ora");
    }
    const parsed = pairSchema.safeParse(request.body);
    if (!parsed.success) return problem(reply, 400, "Invalid code", "il codice è di sei cifre");
    const paired = await pair(deps.db, deps.pairPepper, parsed.data.codice);
    if (paired === undefined) return problem(reply, 400, "Invalid code", "codice sbagliato o scaduto");
    const audit = deps.audit;
    if (audit !== undefined) {
      await withAccount(deps.db, paired.accountId, (tx) =>
        audit.record(
          { verb: "device_paired", outcome: "ok", accountId: paired.accountId, resourceType: "token", resourceId: paired.tokenId },
          tx,
        ),
      );
    }
    setCookie(reply, DEVICE_COOKIE, paired.token, { maxAgeSec: DEVICE_COOKIE_SEC, sameSite: "Strict" });
    return reply.send({ ok: true });
  });

  /**
   * La conferma è lo slug della casa, scritto a mano: chiudere non si annulla,
   * e un clic distratto non deve bastare.
   */
  app.post("/v1/account/chiudi", { preHandler: deps.guard }, async (request, reply) => {
    const tenant = request.tenant;
    // l'operatore non chiude le case degli altri da qui: è un atto del proprietario
    if (tenant?.role !== "owner" || tenant.accountId === null) return problem(reply, 403, "Forbidden");
    const accountId = tenant.accountId;
    const parsed = closeSchema.safeParse(request.body);
    const slug = await inAccount(deps.db, request, reply, {}, async (db) => {
      const [row] = await db.select({ slug: accounts.slug }).from(accounts).where(eq(accounts.id, accountId));
      return row?.slug ?? "";
    });
    if (slug === undefined) return reply;
    if (!parsed.success || parsed.data.conferma.toLowerCase() !== slug) {
      return problem(reply, 400, "Confirmation required", "scrivi il nome della casa per confermare");
    }
    await deps.cancelBilling?.(accountId);
    if (!(await closeAccount(deps.db, deps.masterKey, accountId))) return problem(reply, 404, "House not found");
    const audit = deps.audit;
    if (audit !== undefined) {
      await withAccount(deps.db, accountId, (tx) =>
        audit.record({ verb: "account_closed", outcome: "ok", accountId, actor: tenant, resourceType: "account", resourceId: accountId }, tx),
      );
    }
    clearCookie(reply, SESSION_COOKIE);
    return reply.send({ ok: true });
  });
}
