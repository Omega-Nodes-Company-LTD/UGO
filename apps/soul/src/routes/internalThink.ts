import { gosini, withAccount, type DbClient } from "@ugo/db";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AiResolver } from "../services/ai/resolver.js";
import type { PreHandler } from "./guard.js";

/**
 * ADR-129: il sogno pensa con le chiavi della casa, e Python non le vede.
 *
 * `ops/jobs` non chiama più nessun provider: chiede qui, col token operatore,
 * e soul risponde col ruolo `think` della casa — attraverso lo stesso cancello
 * di ogni altra parola (regola 3). Le chiavi in chiaro non escono mai da
 * questo processo.
 */

const bodySchema = z.object({
  account_id: z.uuid(),
  gosino_id: z.uuid().optional(),
  prompt: z.string().min(1).max(200_000),
  max_tokens: z.number().int().min(1).max(8_000).default(1_500),
  temperature: z.number().min(0).max(1).default(0.3),
});

export interface InternalThinkDeps {
  db: DbClient;
  guard: PreHandler;
  resolver: AiResolver;
}

/** Il primogenito: chi paga un pensiero di casa se il job non dice chi. */
async function eldest(db: DbClient, accountId: string): Promise<string | undefined> {
  const [row] = await withAccount(db, accountId, (tx) =>
    tx
      .select({ id: gosini.id })
      .from(gosini)
      .where(eq(gosini.accountId, accountId))
      .orderBy(asc(gosini.bornAt))
      .limit(1),
  );
  return row?.id;
}

export function registerInternalThinkRoute(app: FastifyInstance, deps: InternalThinkDeps): void {
  app.post(
    "/v1/interno/pensa",
    { preHandler: deps.guard, bodyLimit: 1_048_576 },
    async (request, reply) => {
      // solo l'operatore: è la porta dei job, non delle case
      if (request.tenant?.role !== "operator") {
        return reply.code(403).type("application/problem+json").send({
          type: "about:blank",
          title: "Forbidden",
          status: 403,
        });
      }
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).type("application/problem+json").send({
          type: "about:blank",
          title: "Invalid body",
          status: 400,
          detail: z.prettifyError(parsed.error),
        });
      }
      const { account_id: accountId } = parsed.data;
      await deps.resolver.load(accountId);
      if (!deps.resolver.has(accountId, "think")) {
        return reply.code(409).type("application/problem+json").send({
          type: "about:blank",
          title: "Nessuna testa per pensare",
          status: 409,
          detail: "la casa non ha scelto un modello per il ruolo «think»",
        });
      }
      const gosinoId = parsed.data.gosino_id ?? (await eldest(deps.db, accountId));
      if (gosinoId === undefined) {
        return reply.code(409).type("application/problem+json").send({
          type: "about:blank",
          title: "Nessun gosino",
          status: 409,
        });
      }
      const text = await deps.resolver
        .textFor(accountId, gosinoId, "think")
        .generate(parsed.data.prompt, parsed.data.max_tokens, {
          temperature: parsed.data.temperature,
        });
      return reply.send({ text: text ?? null });
    },
  );
}
