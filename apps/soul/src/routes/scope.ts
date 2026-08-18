import { gosini, withAccount, type DbClient } from "@ugo/db";
import { asc, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { canAdminister, accountOf, soleAccount } from "../services/tenantAuth.js";
import { z } from "zod";

/**
 * Which house is this request about (ADR-019 phase 2).
 *
 * Every guarded route asks the same question, so it is asked in one place.
 * Before this, the answer was `select … from accounts limit 1` — twice, in
 * `index.ts`, without an `order by`: with two families, which house you got
 * depended on the query plan. This is the same family of defect ADR-035 §3
 * named out loud, where a query without a scope returns data that is plausible
 * and wrong, with no exception and no log.
 *
 * The rules, in order:
 *
 *  1. a token that belongs to a house speaks for that house, and `?account=`
 *     pointing anywhere else answers **404** — the same answer a house that
 *     does not exist gets, so probing teaches nothing (BOLA);
 *  2. an `operator` may say `?account=`, and must, unless
 *  3. there is exactly one house, in which case it is that one. That is the
 *     promise of ADR-019 §107 to the deployments that exist today, and it
 *     expires by itself the moment a second family arrives.
 */

const scopeQuerySchema = z.object({ account: z.uuid().optional() });

export interface ScopeOptions {
  /** for what only an owner or an operator may do: erase, export, provision */
  requireAdmin?: boolean;
}

export type ScopeResult =
  | { ok: true; accountId: string }
  | { ok: false; status: number; title: string; detail?: string };

/** The rules above, with no opinion about how a failure is reported. */
export async function resolveAccount(
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
  const requested = query.success ? query.data.account : undefined;
  if (tenant !== null) {
    const accountId = await accountOf(db, tenant, requested);
    if (accountId !== undefined) return { ok: true, accountId };
    if (requested !== undefined) return { ok: false, status: 404, title: "House not found" };
  }

  if (tenant === null || tenant.role === "operator") {
    const sole = await soleAccount(db);
    if (sole !== undefined) return { ok: true, accountId: sole };
  }
  return tenant === null
    ? { ok: false, status: 401, title: "Unauthorized" }
    : {
        ok: false,
        status: 400,
        title: "Which house?",
        detail: "questo token vale per più account: indica ?account=<uuid>",
      };
}

/**
 * The house, or `undefined` after having already sent the problem response —
 * callers return `reply` unchanged when they get `undefined`.
 */
export async function accountScope(
  db: DbClient,
  request: FastifyRequest,
  reply: FastifyReply,
  options: ScopeOptions = {},
): Promise<string | undefined> {
  const scope = await resolveAccount(db, request, options);
  if (scope.ok) return scope.accountId;
  await problem(reply, scope.status, scope.title, scope.detail);
  return undefined;
}

/**
 * ADR-062: risolve la casa E la dichiara al database, in un colpo solo.
 *
 * `work` gira dentro `withAccount` — una transazione con
 * `SET LOCAL app.account_id`, che è l'unica cosa che le politiche RLS
 * leggono. Da quando `DATABASE_URL_APP` entrerà in servizio (tempo 2b), una
 * query eseguita FUORI da qui non vedrà zero righe per sbaglio: le vedrà per
 * costruzione, e il test se ne accorge.
 *
 * L'unità di scoping è l'unità di lavoro, non la richiesta: il pensiero — le
 * chiamate al modello — sta fuori, perché una transazione tenuta aperta
 * attraverso una chiamata LLM è una connessione `idle in transaction` per la
 * durata del pensiero. Un handler che alterna query e modello chiama
 * `inAccount` più volte.
 *
 * `undefined` = la risposta problem è già partita, come `accountScope`.
 */
export async function inAccount<T>(
  db: DbClient,
  request: FastifyRequest,
  reply: FastifyReply,
  options: ScopeOptions,
  work: (tx: DbClient, accountId: string) => Promise<T>,
): Promise<T | undefined> {
  const accountId = await accountScope(db, request, reply, options);
  if (accountId === undefined) return undefined;
  return withAccount(db, accountId, (tx) => work(tx, accountId));
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
function buildExemplarsOf(db: DbClient, accountId: string) {
  return db.select({ id: gosini.id }).from(gosini).where(eq(gosini.accountId, accountId));
}

export function exemplarsOf(
  db: DbClient,
  accountId: string,
): ReturnType<typeof buildExemplarsOf> {
  return buildExemplarsOf(db, accountId);
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
export async function eldestExemplarOf(db: DbClient, accountId: string): Promise<string> {
  const [eldest] = await db
    .select({ id: gosini.id })
    .from(gosini)
    .where(eq(gosini.accountId, accountId))
    .orderBy(asc(gosini.bornAt))
    .limit(1);
  if (eldest === undefined) throw new Error(`account ${accountId} has no exemplar`);
  return eldest.id;
}
