import { gosini, type DbClient } from "@ugo/db";
import { asc, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { canAdminister, householdOf, soleHousehold } from "../services/tenantAuth.js";
import { z } from "zod";

/**
 * Which house is this request about (ADR-019 phase 2).
 *
 * Every guarded route asks the same question, so it is asked in one place.
 * Before this, the answer was `select … from households limit 1` — twice, in
 * `index.ts`, without an `order by`: with two families, which house you got
 * depended on the query plan. This is the same family of defect ADR-035 §3
 * named out loud, where a query without a scope returns data that is plausible
 * and wrong, with no exception and no log.
 *
 * The rules, in order:
 *
 *  1. a token that belongs to a house speaks for that house, and `?casa=`
 *     pointing anywhere else answers **404** — the same answer a house that
 *     does not exist gets, so probing teaches nothing (BOLA);
 *  2. an `operator` may say `?casa=`, and must, unless
 *  3. there is exactly one house, in which case it is that one. That is the
 *     promise of ADR-019 §107 to the deployments that exist today, and it
 *     expires by itself the moment a second family arrives.
 */

const scopeQuerySchema = z.object({ casa: z.uuid().optional() });

export interface ScopeOptions {
  /** for what only an owner or an operator may do: erase, export, provision */
  requireAdmin?: boolean;
}

export type ScopeResult =
  | { ok: true; householdId: string }
  | { ok: false; status: number; title: string; detail?: string };

/** The rules above, with no opinion about how a failure is reported. */
export async function resolveHousehold(
  db: DbClient,
  request: FastifyRequest,
  options: ScopeOptions = {},
): Promise<ScopeResult> {
  // A few routes are open on purpose — the body needs `/v1/rooms` and
  // `/v1/psyche` and carries no operator token — so "nobody said who they are"
  // is a case, not an error. It still resolves to a house only when there is
  // exactly one; the day a second family arrives, a dock has to be configured
  // with a token like everything else.
  const tenant = request.tenant ?? null;
  if (tenant === null && options.requireAdmin === true) {
    return { ok: false, status: 401, title: "Unauthorized" };
  }
  if (tenant !== null && options.requireAdmin === true && !canAdminister(tenant)) {
    return { ok: false, status: 403, title: "Forbidden" };
  }

  const query = scopeQuerySchema.safeParse(request.query);
  const requested = query.success ? query.data.casa : undefined;
  if (tenant !== null) {
    const householdId = await householdOf(db, tenant, requested);
    if (householdId !== undefined) return { ok: true, householdId };
    if (requested !== undefined) return { ok: false, status: 404, title: "House not found" };
  }

  if (tenant === null || tenant.role === "operator") {
    const sole = await soleHousehold(db);
    if (sole !== undefined) return { ok: true, householdId: sole };
  }
  return tenant === null
    ? { ok: false, status: 401, title: "Unauthorized" }
    : {
        ok: false,
        status: 400,
        title: "Which house?",
        detail: "questo token vale per più case: indica ?casa=<uuid>",
      };
}

/**
 * The house, or `undefined` after having already sent the problem response —
 * callers return `reply` unchanged when they get `undefined`.
 */
export async function householdScope(
  db: DbClient,
  request: FastifyRequest,
  reply: FastifyReply,
  options: ScopeOptions = {},
): Promise<string | undefined> {
  const scope = await resolveHousehold(db, request, options);
  if (scope.ok) return scope.householdId;
  await problem(reply, scope.status, scope.title, scope.detail);
  return undefined;
}

async function problem(
  reply: FastifyReply,
  status: number,
  title: string,
  detail?: string,
): Promise<void> {
  await reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, ...(detail !== undefined && { detail }) });
}

/**
 * The exemplars of one house: the bridge to every table that carries only
 * `gosino_id`, because ADR-019 puts memories, messages and mood in the
 * creature and the pack, the money and the clock in the house.
 */
function buildExemplarsOf(db: DbClient, householdId: string) {
  return db.select({ id: gosini.id }).from(gosini).where(eq(gosini.householdId, householdId));
}

export function exemplarsOf(
  db: DbClient,
  householdId: string,
): ReturnType<typeof buildExemplarsOf> {
  return buildExemplarsOf(db, householdId);
}

/**
 * The house's eldest creature.
 *
 * Some acts belong to the *house* — a correction, a new being's bond, an
 * enrolment request — and land in tables keyed only by `gosino_id`. They used
 * to land on `PRIME_GOSINO_ID` no matter who was asking, which is a write into
 * another family. The eldest is a deterministic choice inside the right house;
 * attributing them to the exemplar actually spoken to is ADR-019 phase 3.
 */
export async function eldestExemplarOf(db: DbClient, householdId: string): Promise<string> {
  const [eldest] = await db
    .select({ id: gosini.id })
    .from(gosini)
    .where(eq(gosini.householdId, householdId))
    .orderBy(asc(gosini.bornAt))
    .limit(1);
  if (eldest === undefined) throw new Error(`household ${householdId} has no exemplar`);
  return eldest.id;
}
