import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accessTokens,
  auditLog,
  createDbClient,
  type DbClient,
  loginLinks,
  pairingCodes,
  PRIME_ACCOUNT_ID,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { createLoginLink } from "../../src/services/deviceAccess.js";
import { ResendMailer } from "../../src/services/resendMailer.js";
import { issueToken } from "../../src/services/tenantAuth.js";

/**
 * ADR-127: la casa sul web, sul giro vero — Postgres reale, server reale,
 * richieste HTTP vere (inject). Senza `RESEND_API_KEY` l'invio dell'email
 * arriva fino alla chiamata a Resend e lì si ferma (chiave non valida): la
 * risposta è comunque 202, per costruzione, e il link si prova dal database.
 */

const OPERATOR = "operator-secret-for-tests";
const PUBLIC_URL = "https://ugo.omeganodes.ai";
// gli indirizzi di prova di Resend: consegnano davvero, a nessuno
const OWNER_EMAIL = "delivered@resend.dev";
const RESEND_KEY = process.env.RESEND_API_KEY;

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let ownerToken: string;

function build(): FastifyInstance {
  return buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    logger: false,
    web: {
      publicUrl: PUBLIC_URL,
      trustProxy: 1,
      appleAppIds: ["8UH44UM49Z.ai.omeganodes.ugo"],
      magicLink: {
        ownerEmail: OWNER_EMAIL,
        mailer: new ResendMailer({
          apiKey: RESEND_KEY ?? "re_not_a_real_key",
          from: process.env.EMAIL_FROM ?? "UGO <onboarding@resend.dev>",
        }),
      },
    },
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      stats: { dailyBudgetUsd: 0.5, timezone: "Europe/Rome" },
      internalToken: OPERATOR,
    },
  });
}

/** Ogni test bussa da un IP suo: il limite per IP non deve legare i test fra loro. */
let ipCounter = 10;
const nextIp = (): string => `203.0.113.${String((ipCounter += 1))}`;

beforeAll(async () => {
  const postgres = await startPostgres();
  pg = postgres.container;
  await runMigrations(postgres.url);
  db = createDbClient(postgres.url);
  app = build();
  ownerToken = (await issueToken(db, { accountId: PRIME_ACCOUNT_ID, role: "owner", label: "pannello" })).token;
});

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

beforeEach(async () => {
  await db.delete(pairingCodes);
  await db.delete(loginLinks);
});

describe("the wall", () => {
  it("refuses /v1 without a token, with the audit row ADR-049 asks for", async () => {
    await db.delete(auditLog);
    const response = await app.inject({ method: "GET", url: "/v1/stats" });
    expect(response.statusCode).toBe(401);
    const rows = await db.select().from(auditLog).where(eq(auditLog.verb, "denied"));
    expect(rows.map((row) => row.resourceId)).toContain("/v1/stats");
  });

  it("lets a valid house token through", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/tokens",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it("reads the socket token from the query, and only for the socket", async () => {
    const without = await app.inject({ method: "GET", url: "/v1/face" });
    expect(without.statusCode).toBe(401);
    // nessun gateway qui: oltre il muro c'è un 404, ed è la prova che il muro è passato
    const withToken = await app.inject({ method: "GET", url: `/v1/face?token=${ownerToken}` });
    expect(withToken.statusCode).not.toBe(401);
    const elsewhere = await app.inject({ method: "GET", url: `/v1/tokens?token=${ownerToken}` });
    expect(elsewhere.statusCode).toBe(401);
  });

  it("keeps the open doors open", async () => {
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).not.toBe(401);
    const aasa = await app.inject({ method: "GET", url: "/.well-known/apple-app-site-association" });
    expect(aasa.statusCode).toBe(200);
    expect(aasa.headers["content-type"]).toContain("application/json");
    expect(aasa.json()).toEqual({
      applinks: {
        details: [{ appIDs: ["8UH44UM49Z.ai.omeganodes.ugo"], components: [{ "/": "/pair/*" }, { "/": "/login/*" }] }],
      },
    });
  });

  it("sends the security headers on every answer", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.headers["strict-transport-security"]).toContain("max-age");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(String(response.headers["content-security-policy"])).toContain("frame-ancestors 'none'");
  });

  it("lets the app shell read answers and nobody else", async () => {
    const ours = await app.inject({
      method: "OPTIONS",
      url: "/v1/pair",
      headers: { origin: "capacitor://localhost", "access-control-request-method": "POST" },
    });
    expect(ours.headers["access-control-allow-origin"]).toBe("capacitor://localhost");
    const theirs = await app.inject({
      method: "OPTIONS",
      url: "/v1/pair",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(theirs.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("pairing a device", () => {
  async function newCode(): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/v1/pairing-codes",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ code: string; expiresAt: string }>();
    expect(body.code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/u);
    return body.code;
  }

  it("turns a code into a member token that opens /v1, and the code burns", async () => {
    const code = await newCode();
    const stored = await db.select().from(pairingCodes);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.codeHash).not.toContain(code.replace("-", ""));

    const ip = nextIp();
    const paired = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { "x-forwarded-for": ip },
      payload: { code: code.toLowerCase(), deviceLabel: "iPhone di prova" },
    });
    expect(paired.statusCode).toBe(201);
    const { token } = paired.json<{ token: string }>();

    const inside = await app.inject({
      method: "GET",
      url: "/v1/stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(inside.statusCode).not.toBe(401);

    const again = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { "x-forwarded-for": ip },
      payload: { code, deviceLabel: "secondo" },
    });
    expect(again.statusCode).toBe(401);

    const [row] = await db.select().from(accessTokens).where(eq(accessTokens.label, "dispositivo: iPhone di prova"));
    expect(row?.role).toBe("member");
  });

  it("sends the universal pairing link opened in Safari to the face, code untouched (ADR-130)", async () => {
    const response = await app.inject({ method: "GET", url: "/pair/K7Q2M9XD" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/?pair=K7Q2M9XD");
  });

  it("refuses an expired code", async () => {
    const code = await newCode();
    await db.update(pairingCodes).set({ expiresAt: new Date(Date.now() - 1000) });
    const response = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { "x-forwarded-for": nextIp() },
      payload: { code, deviceLabel: "tardi" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("closes the door again once the device is revoked from the panel", async () => {
    const code = await newCode();
    const paired = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { "x-forwarded-for": nextIp() },
      payload: { code, deviceLabel: "rubato" },
    });
    const { token } = paired.json<{ token: string }>();
    const [row] = await db.select().from(accessTokens).where(eq(accessTokens.label, "dispositivo: rubato"));
    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/tokens/${row?.id ?? ""}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(revoked.statusCode).toBeLessThan(300);
    const after = await app.inject({ method: "GET", url: "/v1/stats", headers: { authorization: `Bearer ${token}` } });
    expect(after.statusCode).toBe(401);
  });

  it("lets only an administrator ask for a code", async () => {
    const member = (await issueToken(db, { accountId: PRIME_ACCOUNT_ID, role: "member", label: "membro" })).token;
    const response = await app.inject({
      method: "POST",
      url: "/v1/pairing-codes",
      headers: { authorization: `Bearer ${member}` },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });

  it("stops a guesser after five tries a minute, per address", async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/pair",
        headers: { "x-forwarded-for": ip },
        payload: { code: "AAAA-AAAA", deviceLabel: "indovino" },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    const otherIp = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { "x-forwarded-for": nextIp() },
      payload: { code: "AAAA-AAAA", deviceLabel: "altro" },
    });
    expect(otherIp.statusCode).toBe(401);
  });
});

describe("entering with the email", () => {
  it("answers 202 the same way for the owner and for a stranger", async () => {
    const owner = await app.inject({
      method: "POST",
      url: "/v1/login/email",
      headers: { "x-forwarded-for": nextIp() },
      payload: { email: OWNER_EMAIL },
    });
    const stranger = await app.inject({
      method: "POST",
      url: "/v1/login/email",
      headers: { "x-forwarded-for": nextIp() },
      payload: { email: "qualcuno@example.com" },
    });
    expect(owner.statusCode).toBe(202);
    expect(stranger.statusCode).toBe(202);
    expect(owner.body).toBe(stranger.body);
    // un link solo per il titolare, nessuno per lo sconosciuto
    expect(await db.select().from(loginLinks)).toHaveLength(1);
  });

  it("turns the link into an HttpOnly session cookie that opens /v1, once", async () => {
    const secret = await createLoginLink(db, PRIME_ACCOUNT_ID);
    const opened = await app.inject({ method: "GET", url: `/login/${secret}`, headers: { "x-forwarded-for": nextIp() } });
    expect(opened.statusCode).toBe(302);
    const cookie = String(opened.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    const session = cookie.split(";")[0] ?? "";

    const inside = await app.inject({ method: "GET", url: "/v1/tokens", headers: { cookie: session } });
    expect(inside.statusCode).toBe(200);

    const twice = await app.inject({ method: "GET", url: `/login/${secret}`, headers: { "x-forwarded-for": nextIp() } });
    expect(twice.headers.location).toBe("/?accesso=scaduto");
  });

  it("lets the app redeem the link for a bearer token", async () => {
    const secret = await createLoginLink(db, PRIME_ACCOUNT_ID);
    const response = await app.inject({
      method: "POST",
      url: "/v1/login/redeem",
      headers: { "x-forwarded-for": nextIp() },
      payload: { secret, deviceLabel: "iPhone" },
    });
    expect(response.statusCode).toBe(201);
    const { token } = response.json<{ token: string }>();
    const [row] = await db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.label, "dispositivo: iPhone (email)"));
    expect(row?.role).toBe("owner");
    expect(row?.expiresAt).not.toBeNull();
    expect(token.length).toBeGreaterThan(20);
  });
});

