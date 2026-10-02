import { accounts, type DbClient } from "@ugo/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Chi sei, e cosa puoi (ADR-127): la prima cosa che il pannello chiede, per
 * non mostrare voci che il tuo ruolo o il tuo account non usano. Un menu che
 * offre l'operatore a una famiglia è un menu che fa paura invece di aiutare.
 *
 * Mostra solo ciò che riguarda chi chiede: il proprio account, il proprio
 * ruolo. Il piano e ciò che sblocca arrivano con ADR-125.
 */
export interface MeDeps {
  db: DbClient;
  guard: PreHandler;
  /** ADR-125: piano ed entitlement dell'account; assente = non ancora noti */
  plan?: (db: DbClient, accountId: string) => Promise<Record<string, unknown>>;
}

export function registerMeRoute(app: FastifyInstance, deps: MeDeps): void {
  app.get("/v1/me", { preHandler: deps.guard }, async (request, reply) => {
    const found = await inAccount(deps.db, request, reply, {}, async (db, accountId) => {
      const [row] = await db
        .select({
          id: accounts.id,
          slug: accounts.slug,
          name: accounts.name,
          kind: accounts.kind,
          canBreed: accounts.canBreed,
          isFoundry: accounts.isFoundry,
        })
        .from(accounts)
        .where(eq(accounts.id, accountId));
      return { row, plan: deps.plan === undefined ? undefined : await deps.plan(db, accountId) };
    });
    if (found === undefined) return reply;
    return reply.send({
      // nessun token (sviluppo aperto) = chi ha il server in mano
      role: request.tenant?.role ?? "operator",
      account: found.row ?? null,
      ...(found.plan !== undefined && { piano: found.plan }),
    });
  });
}
