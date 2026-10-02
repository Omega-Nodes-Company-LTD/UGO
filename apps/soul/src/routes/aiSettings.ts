import type { DbClient } from "@ugo/db";
import { verifyKey, type ModelCatalog, type ProviderBaseUrls } from "@ugo/memory";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import { AI_ROLES, choiceInputSchema, removeChoice, ROLE_PROVIDERS } from "../services/ai/choices.js";
import { removeKey, saveKey } from "../services/ai/keyring.js";
import type { AiResolver, PlatformKeys } from "../services/ai/resolver.js";
import { catalogQuerySchema, choose, modelsFor, voicesOf } from "../services/ai/settings.js";
import { aiStatus } from "../services/ai/status.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Impostazioni → AI (ADR-122): le chiavi della casa e un modello per ruolo.
 * Tutto da titolare (`requireAdmin`): chi spende i soldi della casa decide.
 */

export interface AiSettingsDeps {
  db: DbClient;
  guard: PreHandler;
  masterKey: Buffer;
  resolver: AiResolver;
  catalog: ModelCatalog;
  platform: PlatformKeys;
  baseUrls: ProviderBaseUrls;
  dailyBudgetUsd: number;
  audit?: AuditLogger;
}

const providerSchema = z.enum(["anthropic", "openrouter", "openai", "elevenlabs"]);
const roleSchema = z.enum(AI_ROLES);
const keyBodySchema = z.object({ secret: z.string().trim().min(8).max(500) });
const voicesQuerySchema = z.object({
  provider: z.enum(["openai", "elevenlabs", "openrouter"]),
  fonte: z.enum(["byok", "ugo"]).default("byok"),
});

function problem(reply: FastifyReply, status: number, title: string, detail?: string): FastifyReply {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

export function registerAiSettingsRoutes(app: FastifyInstance, deps: AiSettingsDeps): void {
  const admin = { requireAdmin: true } as const;

  app.get("/v1/ai/stato", { preHandler: deps.guard }, async (request, reply) => {
    const status = await inAccount(deps.db, request, reply, admin, (db, accountId) =>
      aiStatus(db, accountId, { platform: deps.platform, dailyBudgetUsd: deps.dailyBudgetUsd }),
    );
    return status === undefined ? reply : reply.send(status);
  });

  app.put("/v1/ai/chiavi/:provider", { preHandler: deps.guard }, async (request, reply) => {
    const provider = providerSchema.safeParse((request.params as { provider: string }).provider);
    const body = keyBodySchema.safeParse(request.body);
    if (!provider.success || !body.success) return problem(reply, 400, "richiesta non valida");
    const verdict = await verifyKey(provider.data, body.data.secret, deps.baseUrls);
    if (verdict === "invalid") {
      return problem(reply, 422, "chiave rifiutata", `${provider.data} non riconosce questa chiave`);
    }
    const saved = await inAccount(deps.db, request, reply, admin, async (db, accountId) => {
      const summary = await saveKey(db, accountId, deps.masterKey, {
        provider: provider.data,
        secret: body.data.secret,
        status: verdict === "ok" ? "ok" : "unverified",
      });
      await deps.audit?.record(
        {
          verb: "provider_key_saved",
          outcome: "ok",
          accountId,
          actor: request.tenant,
          resourceType: "provider_key",
          resourceId: provider.data,
        },
        db,
      );
      return { accountId, summary };
    });
    if (saved === undefined) return reply;
    deps.resolver.invalidate(saved.accountId);
    deps.catalog.forget(saved.accountId);
    return reply.send(saved.summary);
  });

  app.delete("/v1/ai/chiavi/:provider", { preHandler: deps.guard }, async (request, reply) => {
    const provider = providerSchema.safeParse((request.params as { provider: string }).provider);
    if (!provider.success) return problem(reply, 400, "provider sconosciuto");
    const done = await inAccount(deps.db, request, reply, admin, async (db, accountId) => {
      const gone = await removeKey(db, accountId, provider.data);
      if (gone) {
        await deps.audit?.record(
          {
            verb: "provider_key_removed",
            outcome: "ok",
            accountId,
            actor: request.tenant,
            resourceType: "provider_key",
            resourceId: provider.data,
          },
          db,
        );
      }
      return { accountId, gone };
    });
    if (done === undefined) return reply;
    deps.resolver.invalidate(done.accountId);
    deps.catalog.forget(done.accountId);
    return done.gone ? reply.code(204).send() : problem(reply, 404, "nessuna chiave per questo provider");
  });

  /** La lista da cui si sceglie: del provider, filtrata per ruolo. */
  app.get("/v1/ai/modelli", { preHandler: deps.guard }, async (request, reply) => {
    const query = catalogQuerySchema.safeParse(request.query);
    if (!query.success) return problem(reply, 400, "richiesta non valida");
    const listed = await inAccount(deps.db, request, reply, admin, (db, accountId) =>
      modelsFor(db, accountId, deps, query.data),
    );
    if (listed === undefined) return reply;
    if (listed === "nokey") {
      return problem(reply, 409, "manca la chiave", `aggiungi prima una chiave ${query.data.provider}`);
    }
    if (listed === "unreachable") return problem(reply, 503, "il provider non risponde");
    return reply.send({ modelli: listed });
  });

  /** ADR-123: le voci di un provider, per il ruolo `tts`. */
  app.get("/v1/ai/voci", { preHandler: deps.guard }, async (request, reply) => {
    const query = voicesQuerySchema.safeParse(request.query);
    if (!query.success) return problem(reply, 400, "richiesta non valida");
    const listed = await inAccount(deps.db, request, reply, admin, (db, accountId) =>
      voicesOf(db, accountId, deps, query.data.provider, query.data.fonte),
    );
    if (listed === undefined) return reply;
    if (listed === "unreachable") return problem(reply, 503, "il provider non risponde");
    return reply.send({ voci: listed });
  });

  app.put("/v1/ai/scelte/:ruolo", { preHandler: deps.guard }, async (request, reply) => {
    const role = roleSchema.safeParse((request.params as { ruolo: string }).ruolo);
    const body = choiceInputSchema.safeParse(request.body);
    if (!role.success || !body.success) return problem(reply, 400, "richiesta non valida");
    if (!ROLE_PROVIDERS[role.data].includes(body.data.provider)) {
      return problem(reply, 422, "provider non adatto", `${body.data.provider} non serve per «${role.data}»`);
    }
    const outcome = await inAccount(deps.db, request, reply, admin, (db, accountId) =>
      choose(db, accountId, deps, role.data, body.data, request.tenant),
    );
    if (outcome === undefined) return reply;
    if (typeof outcome === "string") return problem(reply, 422, "scelta non valida", outcome);
    deps.resolver.invalidate(outcome.accountId);
    return reply.code(204).send();
  });

  app.delete("/v1/ai/scelte/:ruolo", { preHandler: deps.guard }, async (request, reply) => {
    const role = roleSchema.safeParse((request.params as { ruolo: string }).ruolo);
    if (!role.success) return problem(reply, 400, "ruolo sconosciuto");
    const done = await inAccount(deps.db, request, reply, admin, async (db, accountId) => ({
      accountId,
      gone: await removeChoice(db, accountId, role.data),
    }));
    if (done === undefined) return reply;
    deps.resolver.invalidate(done.accountId);
    return reply.code(204).send();
  });
}
