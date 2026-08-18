import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accessTokens,
  beings,
  bonds,
  budgetLedger,
  createDbClient,
  gosini,
  accounts,
  relations,
  runMigrations,
  PRIME_GOSINO_ID,
  PRIME_ACCOUNT_ID,
  type DbClient,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { encryptText, decryptText, unwrapDataKey } from "@ugo/shared";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actsFor,
  canAdminister,
  accountOf,
  issueToken,
  revokeToken,
  TenantResolver,
} from "../../src/services/tenantAuth.js";
import { addBeing, createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * ADR-019, and the only version of this test worth writing: two real families
 * in a real database, asking the questions that would end the project if the
 * answer were wrong.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;
const masterKey = randomBytes(32);

let casa: TestHouse;
let vicini: TestHouse;

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  casa = await createHouse(db, "casa-rossi", { name: "casa Rossi", masterKey });
  vicini = await createHouse(db, "casa-bianchi", { name: "casa Bianchi", masterKey });
});

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("the migration leaves the first family exactly where it was", () => {
  it("moves ugo-prime into a house of its own", async () => {
    const [prime] = await db
      .select({ accountId: gosini.accountId })
      .from(gosini)
      .where(eq(gosini.id, PRIME_GOSINO_ID));
    expect(prime?.accountId).toBe(PRIME_ACCOUNT_ID);

    const [house] = await db
      .select({ slug: accounts.slug, timezone: accounts.timezone })
      .from(accounts)
      .where(eq(accounts.id, PRIME_ACCOUNT_ID));
    expect(house?.slug).toBe("casa-prime");
    expect(house?.timezone).toBe("Europe/Rome");
  });
});

describe("two families under one roof of iron", () => {
  it("refuses a bond between one house's exemplar and another's being", async () => {
    const ivan = await addBeing(db, casa, "Ivan");
    // the database says no — not a service, not a code review, the database
    await expect(
      db.insert(bonds).values({
        accountId: vicini.id,
        gosinoId: vicini.gosinoId,
        beingId: ivan,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(bonds).values({ accountId: casa.id, gosinoId: casa.gosinoId, beingId: ivan }),
    ).resolves.toBeDefined();
  });

  it("refuses a relation that would link two families", async () => {
    const nostro = await addBeing(db, casa, "Paola");
    const loro = await addBeing(db, vicini, "Giulia");
    await expect(
      db
        .insert(relations)
        .values({ accountId: casa.id, beingA: nostro, beingB: loro, type: "cares_for" }),
    ).rejects.toThrow();
  });

  // the ordinary configuration, not an edge case: one in the kitchen, one in
  // the study, same family, different lives (ADR-019)
  it("keeps ADR-014 true: two exemplars in ONE house may disagree about one person", async () => {
    const [studio] = await db
      .insert(gosini)
      .values({ accountId: casa.id, name: "ugo-studio", locationLabel: "studio" })
      .returning({ id: gosini.id });
    if (studio === undefined) throw new Error("second exemplar was not created");
    const sofia = await addBeing(db, casa, "Sofia");

    await db
      .insert(bonds)
      .values({ accountId: casa.id, gosinoId: casa.gosinoId, beingId: sofia, affinity: 0.9 });
    await db
      .insert(bonds)
      .values({ accountId: casa.id, gosinoId: studio.id, beingId: sofia, affinity: -0.3 });

    const opinions = await db
      .select({ affinity: bonds.affinity })
      .from(bonds)
      .where(and(eq(bonds.accountId, casa.id), eq(bonds.beingId, sofia)));
    expect(opinions.map((o) => o.affinity).sort()).toEqual([-0.3, 0.9].sort());
  });

  it("allows one owner per house, and only one", async () => {
    await db
      .insert(beings)
      .values({ accountId: casa.id, displayName: "Francesco", isOwner: true });
    // the neighbours get their own owner, and that is not a conflict
    await expect(
      db.insert(beings).values({ accountId: vicini.id, displayName: "Marco", isOwner: true }),
    ).resolves.toBeDefined();
    await expect(
      db.insert(beings).values({ accountId: casa.id, displayName: "Un altro", isOwner: true }),
    ).rejects.toThrow();
  });
});

describe("one key per family", () => {
  it("cannot read the neighbours' words with its own key", () => {
    const secret = encryptText("il corriere si chiama Ivan", casa.dataKey);
    expect(decryptText(secret, casa.dataKey)).toContain("Ivan");
    expect(() => decryptText(secret, vicini.dataKey)).toThrow();
  });

  it("stores keys wrapped, never in the clear", async () => {
    const [row] = await db
      .select({ wrapped: accounts.wrappedDataKey })
      .from(accounts)
      .where(eq(accounts.id, casa.id));
    const wrapped = row?.wrapped;
    if (wrapped === undefined || wrapped === null) throw new Error("no wrapped key stored");

    expect(wrapped.equals(casa.dataKey)).toBe(false);
    expect(unwrapDataKey(wrapped, masterKey)).toEqual(casa.dataKey);
    expect(() => unwrapDataKey(wrapped, randomBytes(32))).toThrow();
  });
});

describe("the piggy bank belongs to the house", () => {
  it("keeps one family's spending out of the other's day", async () => {
    await db.insert(budgetLedger).values({
      accountId: casa.id,
      gosinoId: casa.gosinoId,
      date: "2026-01-15",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      costUsd: "0.40",
    });

    const spent = async (accountId: string): Promise<number> => {
      const rows = await db
        .select({ cost: budgetLedger.costUsd })
        .from(budgetLedger)
        .where(and(eq(budgetLedger.accountId, accountId), eq(budgetLedger.date, "2026-01-15")));
      return rows.reduce((total, row) => total + Number(row.cost), 0);
    };

    expect(await spent(casa.id)).toBeCloseTo(0.4);
    expect(await spent(vicini.id)).toBe(0);
  });
});

describe("tokens say who is asking", () => {
  it("resolves a token to its house and role, and never stores it in the clear", async () => {
    const resolver = new TenantResolver({ db });
    const issued = await issueToken(db, {
      accountId: casa.id,
      role: "owner",
      label: "telefono di Francesco",
    });

    const context = await resolver.resolve(issued.token);
    expect(context?.accountId).toBe(casa.id);
    expect(context?.role).toBe("owner");

    const [stored] = await db
      .select({ hash: accessTokens.tokenHash })
      .from(accessTokens)
      .where(eq(accessTokens.id, issued.id));
    expect(stored?.hash).not.toBe(issued.token);
    expect(stored?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives nothing to a token of the wrong house", async () => {
    const resolver = new TenantResolver({ db });
    const theirs = await issueToken(db, {
      accountId: vicini.id,
      role: "owner",
      label: "telefono di Marco",
    });
    const context = await resolver.resolve(theirs.token);
    if (context === undefined) throw new Error("token should resolve");

    expect(actsFor(context, vicini.id)).toBe(true);
    expect(actsFor(context, casa.id)).toBe(false);
    expect(await accountOf(db, context, casa.id)).toBeUndefined();
    expect(await accountOf(db, context, vicini.id)).toBe(vicini.id);
  });

  it("lets an operator act for any house, and a member administer none", async () => {
    const resolver = new TenantResolver({ db });
    const operator = await issueToken(db, {
      accountId: null,
      role: "operator",
      label: "console",
    });
    const member = await issueToken(db, {
      accountId: casa.id,
      role: "member",
      label: "tablet cucina",
    });

    const asOperator = await resolver.resolve(operator.token);
    const asMember = await resolver.resolve(member.token);
    if (asOperator === undefined || asMember === undefined) throw new Error("should resolve");

    expect(actsFor(asOperator, casa.id)).toBe(true);
    expect(actsFor(asOperator, vicini.id)).toBe(true);
    expect(canAdminister(asOperator)).toBe(true);
    expect(canAdminister(asMember)).toBe(false);
  });

  it("stops honouring a token once revoked or expired", async () => {
    const resolver = new TenantResolver({ db });
    const doomed = await issueToken(db, {
      accountId: casa.id,
      role: "member",
      label: "vecchio telefono",
    });
    expect(await resolver.resolve(doomed.token)).toBeDefined();
    expect(await revokeToken(db, doomed.id)).toBe(true);
    expect(await resolver.resolve(doomed.token)).toBeUndefined();

    const expired = await issueToken(db, {
      accountId: casa.id,
      role: "member",
      label: "ospite di ieri",
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(await resolver.resolve(expired.token)).toBeUndefined();
  });

  it("still honours the old shared secret, as an operator", async () => {
    const resolver = new TenantResolver({ db, legacyToken: "il-vecchio-segreto" });
    const context = await resolver.resolve("il-vecchio-segreto");
    expect(context?.role).toBe("operator");
    expect(await resolver.resolve("quasi-il-vecchio-segreto")).toBeUndefined();
    expect(await resolver.resolve("")).toBeUndefined();
  });

  it("refuses to mint a account-less token for anyone but an operator", async () => {
    await expect(
      issueToken(db, { accountId: null, role: "owner", label: "impossibile" }),
    ).rejects.toThrow(/operator/);
  });
});

describe("the ceiling is the house's own", () => {
  it("spends against its own day and stops at its own limit", async () => {
    const { LlmClient } = await import("@ugo/memory");
    // the neighbours are frugal, and that is their business alone
    await db
      .update(accounts)
      .set({ dailyBudgetUsd: "0.10" })
      .where(eq(accounts.id, vicini.id));

    const ours = new LlmClient({
      db,
      apiKey: "unused: the budget check happens before any call",
      model: "claude-haiku-4-5",
      dailyBudgetUsd: 1,
      accountId: casa.id,
      gosinoId: casa.gosinoId,
    });
    const theirs = new LlmClient({
      db,
      apiKey: "unused",
      model: "claude-haiku-4-5",
      dailyBudgetUsd: 1,
      accountId: vicini.id,
      gosinoId: vicini.gosinoId,
    });

    expect(await ours.dailyBudgetUsd()).toBe(1);
    expect(await theirs.dailyBudgetUsd()).toBeCloseTo(0.1);

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
    await db.insert(budgetLedger).values({
      accountId: casa.id,
      gosinoId: casa.gosinoId,
      date: today,
      provider: "anthropic",
      model: "claude-haiku-4-5",
      costUsd: "0.90",
    });

    expect(await ours.spentTodayUsd()).toBeCloseTo(0.9);
    expect(await theirs.spentTodayUsd()).toBe(0);

    // over its own ceiling, UGO says so in words instead of spending more
    await db.insert(budgetLedger).values({
      accountId: casa.id,
      gosinoId: casa.gosinoId,
      date: today,
      provider: "anthropic",
      model: "claude-haiku-4-5",
      costUsd: "0.20",
    });
    const reply = await ours.chat({ channel: "home", userText: "ciao" });
    expect(reply.degraded).toBe(true);
    // and the neighbours are untouched by any of it
    expect((await theirs.spentTodayUsd()) < 0.1).toBe(true);
  });
});
