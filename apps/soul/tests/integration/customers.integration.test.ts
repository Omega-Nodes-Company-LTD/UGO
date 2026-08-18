import { randomBytes } from "node:crypto";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  auditLog,
  createDbClient,
  customerAccessTokens,
  tickets,
  type DbClient,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * The house side of the reception (ADR-052) over the real HTTP stack: CRUD,
 * assignment that refuses foreign gosini with 404, tokens shown exactly once,
 * triage that lands in the journal.
 */

const dataKey = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let houseA: TestHouse;
let houseB: TestHouse;
let ownerA = "";
let ownerB = "";

beforeAll(async () => {
  const postgres = await startPostgres();
  pg = postgres.container;
  await runMigrations(postgres.url);
  db = createDbClient(postgres.url);
  houseA = await createHouse(db, "casa-admin-a");
  houseB = await createHouse(db, "casa-admin-b");
  ownerA = (await issueToken(db, { accountId: houseA.id, role: "owner", label: "test" })).token;
  ownerB = (await issueToken(db, { accountId: houseB.id, role: "owner", label: "test" })).token;
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      customers: { dataKey },
      internalToken: "internal-secret",
    },
  });
});

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

const asOwner = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

describe("the customers registry", () => {
  let customerId = "";

  it("creates a customer, audits it, and slugs the name", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/customers",
      headers: asOwner(ownerA),
      payload: { name: "Rossi & Figli SRL", notes: "cliente storico" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ id: string; slug: string }>();
    customerId = body.id;
    expect(body.slug).toBe("rossi-figli-srl");
    const audited = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.verb, "customer_created"), eq(auditLog.resourceId, customerId)));
    expect(audited).toHaveLength(1);
  });

  it("stores the notes encrypted and returns them decrypted", async () => {
    const detail = await app.inject({
      method: "GET",
      url: `/v1/customers/${customerId}`,
      headers: asOwner(ownerA),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json<{ notes: string | null }>().notes).toBe("cliente storico");
  });

  it("hides another house's customer behind a 404", async () => {
    const foreign = await app.inject({
      method: "GET",
      url: `/v1/customers/${customerId}`,
      headers: asOwner(ownerB),
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("refuses without admin authority", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/v1/customers" });
    expect(anonymous.statusCode).toBe(401);
    const member = await issueToken(db, {
      accountId: houseA.id,
      role: "member",
      label: "membro",
    });
    const asMember = await app.inject({
      method: "GET",
      url: "/v1/customers",
      headers: asOwner(member.token),
    });
    expect(asMember.statusCode).toBe(403);
  });

  it("assigns own gosini, and answers 404 for a neighbour's", async () => {
    const stolen = await app.inject({
      method: "PUT",
      url: `/v1/customers/${customerId}/gosini`,
      headers: asOwner(ownerA),
      payload: { gosinoIds: [houseB.gosinoId] },
    });
    expect(stolen.statusCode).toBe(404);

    const ok = await app.inject({
      method: "PUT",
      url: `/v1/customers/${customerId}/gosini`,
      headers: asOwner(ownerA),
      payload: { gosinoIds: [houseA.gosinoId] },
    });
    expect(ok.statusCode).toBe(204);
    const detail = await app.inject({
      method: "GET",
      url: `/v1/customers/${customerId}`,
      headers: asOwner(ownerA),
    });
    expect(detail.json<{ gosini: { id: string }[] }>().gosini.map((g) => g.id)).toEqual([
      houseA.gosinoId,
    ]);
  });

  it("issues a token whose clear value exists only in that response", async () => {
    const issued = await app.inject({
      method: "POST",
      url: `/v1/customers/${customerId}/tokens`,
      headers: asOwner(ownerA),
      payload: { label: "portale" },
    });
    expect(issued.statusCode).toBe(201);
    const body = issued.json<{ id: string; token: string }>();
    expect(body.token.length).toBeGreaterThan(20);
    // the database holds the hash, never the clear value
    const [row] = await db
      .select({ hash: customerAccessTokens.tokenHash })
      .from(customerAccessTokens)
      .where(eq(customerAccessTokens.id, body.id));
    expect(row?.hash).not.toBe(body.token);
    // the detail endpoint shows metadata only
    const detail = await app.inject({
      method: "GET",
      url: `/v1/customers/${customerId}`,
      headers: asOwner(ownerA),
    });
    expect(JSON.stringify(detail.json())).not.toContain(body.token);

    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/customers/${customerId}/tokens/${body.id}`,
      headers: asOwner(ownerA),
    });
    expect(revoked.statusCode).toBe(204);
    const journal = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.verb, "customer_token_revoked"), eq(auditLog.resourceId, body.id)));
    expect(journal).toHaveLength(1);
  });

  it("triages a ticket and the journal remembers", async () => {
    const [ticket] = await db
      .insert(tickets)
      .values({
        accountId: houseA.id,
        customerId,
        gosinoId: houseA.gosinoId,
        title: "v1:not-really-encrypted",
        body: "v1:not-really-encrypted",
      })
      .returning({ id: tickets.id });
    const moved = await app.inject({
      method: "PATCH",
      url: `/v1/tickets/${ticket?.id ?? ""}`,
      headers: asOwner(ownerA),
      payload: { status: "in_progress" },
    });
    expect(moved.statusCode).toBe(204);

    // a neighbour cannot even find it
    const foreign = await app.inject({
      method: "PATCH",
      url: `/v1/tickets/${ticket?.id ?? ""}`,
      headers: asOwner(ownerB),
      payload: { status: "closed" },
    });
    expect(foreign.statusCode).toBe(404);

    const journal = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.verb, "ticket_status_changed"), eq(auditLog.resourceId, ticket?.id ?? "")),
      );
    expect(journal).toHaveLength(1);
  });

  it("archives the customer and their tokens stop resolving", async () => {
    const issued = await app.inject({
      method: "POST",
      url: `/v1/customers/${customerId}/tokens`,
      headers: asOwner(ownerA),
      payload: { label: "prima dell'archivio" },
    });
    const { token } = issued.json<{ token: string }>();

    const archived = await app.inject({
      method: "PATCH",
      url: `/v1/customers/${customerId}`,
      headers: asOwner(ownerA),
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(204);
    const { CustomerResolver } = await import("../../src/services/reception/customerAuth.js");
    expect(await new CustomerResolver(db).resolve(token)).toBeUndefined();
  });
});
