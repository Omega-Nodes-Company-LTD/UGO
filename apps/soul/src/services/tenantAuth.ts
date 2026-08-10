import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { accessTokens, households, type DbClient } from "@ugo/db";
import type { AccessRole } from "@ugo/shared";
import { and, eq, gt, isNull, or } from "drizzle-orm";

/**
 * Who is asking (ADR-019).
 *
 * A shared secret answers "do you know the password"; with more than one house
 * we need "which house, and with what authority". Tokens are stored as SHA-256
 * only: a dump of `access_tokens` grants nobody anything, and the clear value
 * exists for exactly as long as it takes to hand it over.
 */

export interface TenantContext {
  /** null only for `operator`, whose authority spans the neighbourhood */
  householdId: string | null;
  role: AccessRole;
  tokenId: string;
}

const TOKEN_BYTES = 32;
/** `last_used_at` is a liveness hint, not an audit log: one write a minute is plenty. */
const TOUCH_INTERVAL_MS = 60_000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface IssuedToken {
  /** shown once, at creation, and never again — it is not stored */
  token: string;
  id: string;
}

export async function issueToken(
  db: DbClient,
  input: { householdId: string | null; role: AccessRole; label: string; expiresAt?: Date },
): Promise<IssuedToken> {
  if (input.role !== "operator" && input.householdId === null) {
    throw new Error("only an operator token may exist without a household");
  }
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const [row] = await db
    .insert(accessTokens)
    .values({
      householdId: input.householdId,
      tokenHash: hashToken(token),
      role: input.role,
      label: input.label,
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
    })
    .returning({ id: accessTokens.id });
  if (row === undefined) throw new Error("token was not persisted");
  return { token, id: row.id };
}

export async function revokeToken(db: DbClient, tokenId: string): Promise<boolean> {
  const revoked = await db
    .update(accessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(accessTokens.id, tokenId), isNull(accessTokens.revokedAt)))
    .returning({ id: accessTokens.id });
  return revoked.length > 0;
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export interface TenantResolverOptions {
  db: DbClient;
  /**
   * The pre-ADR-019 shared secret. Still accepted, and it means `operator`, so
   * no existing deployment breaks the day this lands.
   */
  legacyToken?: string | undefined;
  /** the house a legacy token speaks for when a single-house install asks */
  legacyHouseholdId?: string | undefined;
}

export class TenantResolver {
  private readonly touched = new Map<string, number>();

  public constructor(private readonly options: TenantResolverOptions) {}

  /** Resolves a bearer token to its context, or undefined if it grants nothing. */
  public async resolve(token: string, now: Date = new Date()): Promise<TenantContext | undefined> {
    if (token === "") return undefined;

    const legacy = this.options.legacyToken;
    if (legacy !== undefined && legacy !== "" && equals(token, legacy)) {
      return {
        householdId: this.options.legacyHouseholdId ?? null,
        role: "operator",
        tokenId: "legacy",
      };
    }

    const [row] = await this.options.db
      .select({
        id: accessTokens.id,
        householdId: accessTokens.householdId,
        role: accessTokens.role,
        lastUsedAt: accessTokens.lastUsedAt,
      })
      .from(accessTokens)
      .where(
        and(
          eq(accessTokens.tokenHash, hashToken(token)),
          isNull(accessTokens.revokedAt),
          or(isNull(accessTokens.expiresAt), gt(accessTokens.expiresAt, now)),
        ),
      );
    if (row === undefined) return undefined;

    await this.touch(row.id, row.lastUsedAt, now);
    return { householdId: row.householdId, role: row.role, tokenId: row.id };
  }

  private async touch(id: string, lastUsedAt: Date | null, now: Date): Promise<void> {
    const seen = this.touched.get(id) ?? lastUsedAt?.getTime() ?? 0;
    if (now.getTime() - seen < TOUCH_INTERVAL_MS) return;
    this.touched.set(id, now.getTime());
    await this.options.db
      .update(accessTokens)
      .set({ lastUsedAt: now })
      .where(eq(accessTokens.id, id));
  }
}

/** Does this context speak for that house? An operator speaks for all of them. */
export function actsFor(context: TenantContext, householdId: string): boolean {
  return context.role === "operator" || context.householdId === householdId;
}

/** Roles allowed to destroy, export, or change who belongs to the house. */
export function canAdminister(context: TenantContext): boolean {
  return context.role === "owner" || context.role === "operator";
}

/** The house a request works on, or undefined when an operator has not said. */
export async function householdOf(
  db: DbClient,
  context: TenantContext,
  requested?: string,
): Promise<string | undefined> {
  if (requested === undefined) return context.householdId ?? undefined;
  if (!actsFor(context, requested)) return undefined;
  const [row] = await db
    .select({ id: households.id })
    .from(households)
    .where(and(eq(households.id, requested), isNull(households.closedAt)));
  return row?.id;
}
