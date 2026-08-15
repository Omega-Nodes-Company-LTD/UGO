import { createHash, randomBytes } from "node:crypto";
import { customerAccessTokens, customers, type DbClient } from "@ugo/db";
import { and, eq, gt, isNull, or } from "drizzle-orm";

/**
 * Which customer is at the reception (ADR-052).
 *
 * A deliberate mirror of `tenantAuth.ts`, in a table of its own: a customer
 * token opens `/v1/reception/*` and nothing else, and a family token never
 * opens the reception. Same hygiene — SHA-256 only, shown once, expirable,
 * revocable, `last_used_at` touched at most once a minute.
 */

export interface CustomerContext {
  householdId: string;
  customerId: string;
  tokenId: string;
}

const TOKEN_BYTES = 32;
const TOUCH_INTERVAL_MS = 60_000;

export function hashCustomerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface IssuedCustomerToken {
  /** shown once, at creation, and never again — it is not stored */
  token: string;
  id: string;
}

export async function issueCustomerToken(
  db: DbClient,
  input: { householdId: string; customerId: string; label: string; expiresAt?: Date },
): Promise<IssuedCustomerToken> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const [row] = await db
    .insert(customerAccessTokens)
    .values({
      householdId: input.householdId,
      customerId: input.customerId,
      tokenHash: hashCustomerToken(token),
      label: input.label,
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
    })
    .returning({ id: customerAccessTokens.id });
  if (row === undefined) throw new Error("customer token was not persisted");
  return { token, id: row.id };
}

export async function revokeCustomerToken(db: DbClient, tokenId: string): Promise<boolean> {
  const revoked = await db
    .update(customerAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(customerAccessTokens.id, tokenId), isNull(customerAccessTokens.revokedAt)))
    .returning({ id: customerAccessTokens.id });
  return revoked.length > 0;
}

export class CustomerResolver {
  private readonly touched = new Map<string, number>();

  public constructor(private readonly db: DbClient) {}

  /**
   * Resolves a customer bearer token, or undefined if it grants nothing.
   * An archived customer's tokens stop working the moment the archive lands:
   * the reception closes with the relationship, without touching the tokens.
   */
  public async resolve(
    token: string,
    now: Date = new Date(),
  ): Promise<CustomerContext | undefined> {
    if (token === "") return undefined;
    const [row] = await this.db
      .select({
        id: customerAccessTokens.id,
        householdId: customerAccessTokens.householdId,
        customerId: customerAccessTokens.customerId,
        lastUsedAt: customerAccessTokens.lastUsedAt,
      })
      .from(customerAccessTokens)
      .innerJoin(customers, eq(customers.id, customerAccessTokens.customerId))
      .where(
        and(
          eq(customerAccessTokens.tokenHash, hashCustomerToken(token)),
          isNull(customerAccessTokens.revokedAt),
          or(
            isNull(customerAccessTokens.expiresAt),
            gt(customerAccessTokens.expiresAt, now),
          ),
          isNull(customers.archivedAt),
        ),
      );
    if (row === undefined) return undefined;
    await this.touch(row.id, row.lastUsedAt, now);
    return { householdId: row.householdId, customerId: row.customerId, tokenId: row.id };
  }

  private async touch(id: string, lastUsedAt: Date | null, now: Date): Promise<void> {
    const seen = this.touched.get(id) ?? lastUsedAt?.getTime() ?? 0;
    if (now.getTime() - seen < TOUCH_INTERVAL_MS) return;
    this.touched.set(id, now.getTime());
    await this.db
      .update(customerAccessTokens)
      .set({ lastUsedAt: now })
      .where(eq(customerAccessTokens.id, id));
  }
}
