import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  accessTokens,
  accountLogins,
  accounts,
  createDbClient,
  gosini,
  loginLinks,
  places,
  rateLimits,
  runMigrations,
  sessions,
  type DbClient,
} from "@ugo/db";
import { ResendStub, startPostgres, startResendStub } from "@ugo/factories";
import { DEFAULT_SPECIES_MAP, decryptText, generateDataKey, unwrapDataKey } from "@ugo/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { ResendMailer } from "../../src/services/auth/mailer.js";
import { sweepAccess } from "../../src/services/auth/rateLimit.js";

/**
 * ADR-121 / ADR-124: soul davanti a internet. Postgres vero (le grant di
 * `ugo_market` si provano davvero: l'iscrizione fonda la casa in quel ruolo),
 * Resend su uno stub di rete vero: il link che il test apre è quello che la
 * mail ha portato, letto dal corpo della richiesta HTTP.
 */

const MASTER = generateDataKey();
const OPERATOR = "operatore-pubblico";
const SITE = "https://ugo.test";
const EMAIL = "anna@example.it";

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let resend: ResendStub;
let app: FastifyInstance;

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
  resend = await startResendStub();
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    public: {
      publicUrl: SITE,
      masterKey: MASTER,
      mailer: new ResendMailer({ apiKey: "re_test", from: "UGO <ugo@ugo.test>", baseUrl: resend.baseUrl }),
      legal: { name: "Allevamento di prova", contact: "privacy@ugo.test", termsVersion: "2026-10-02" },
    },
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: OPERATOR,
      // il branco e il pannello: una casa appena nata deve aprirli senza errori
      speciesMap: DEFAULT_SPECIES_MAP,
    },
  });
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
  await resend.close();
});

function cookieFrom(res: LightMyRequestResponse, name: string): string | undefined {
  const header = res.headers["set-cookie"];
  const all = header === undefined ? [] : Array.isArray(header) ? header : [header];
  const found = all.find((c) => c.startsWith(`${name}=`));
  return found?.slice(name.length + 1, found.indexOf(";"));
}

const askLink = (email: string, scopo: "iscrizione" | "accesso", ip: string, consenso = true) =>
  app.inject({
    method: "POST",
    url: "/v1/auth/link",
    remoteAddress: ip,
    payload: { email, scopo, ...(scopo === "iscrizione" && consenso && { consenso: true }) },
  });

const tokenOf = (link: string): string => new URL(link).searchParams.get("t") ?? "";

const confirm = (token: string) =>
  app.inject({
    method: "POST",
    url: "/auth/verifica",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: SITE },
    payload: `t=${encodeURIComponent(token)}`,
  });

let sessionCookie = "";
let accountId = "";

describe("l'iscrizione", () => {
  it("senza consenso non parte niente", async () => {
    const res = await askLink(EMAIL, "iscrizione", "10.0.0.1", false);
    expect(res.statusCode).toBe(400);
    expect(resend.sent).toHaveLength(0);
  });

  it("manda un link, e in database l'email non c'è in chiaro", async () => {
    const res = await askLink("  Anna@Example.it ", "iscrizione", "10.0.0.1");
    expect(res.statusCode).toBe(202);
    const mail = resend.lastTo(EMAIL);
    expect(mail?.authorization).toBe("Bearer re_test");
    expect(mail?.subject).toContain("Benvenuto");
    const link = ResendStub.linkIn(mail ?? resend.sent[0] ?? ({} as never)) ?? "";
    expect(link.startsWith(`${SITE}/auth/verifica?t=`)).toBe(true);
    const [row] = await db.select().from(loginLinks);
    expect(row?.emailEnc).not.toContain("anna");
    expect(row?.tokenHash).not.toBe(tokenOf(link));
  });

  it("aprire il link non entra: entra solo il pulsante", async () => {
    const link = ResendStub.linkIn(resend.lastTo(EMAIL) ?? ({} as never)) ?? "";
    const page = await app.inject({ method: "GET", url: `/auth/verifica?t=${tokenOf(link)}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('action="/auth/verifica"');
    const [row] = await db.select().from(loginLinks);
    expect(row?.usedAt).toBeNull();
  });

  it("il pulsante fonda una casa vuota con un luogo, e apre la sessione", async () => {
    const link = ResendStub.linkIn(resend.lastTo(EMAIL) ?? ({} as never)) ?? "";
    const res = await confirm(tokenOf(link));
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe("/casa#/benvenuto");
    const raw = String(res.headers["set-cookie"]);
    expect(raw).toContain("__Host-ugo_sid=");
    expect(raw).toContain("HttpOnly; Secure; SameSite=Lax");
    sessionCookie = cookieFrom(res, "__Host-ugo_sid") ?? "";

    const [login] = await db.select().from(accountLogins);
    accountId = login?.accountId ?? "";
    expect(login?.role).toBe("owner");
    expect(login?.termsVersion).toBe("2026-10-02");
    const [house] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    const dek = unwrapDataKey(house?.wrappedDataKey ?? Buffer.alloc(0), MASTER);
    expect(decryptText(login?.emailEnc ?? "", dek)).toBe(EMAIL);
    expect(await db.select().from(gosini).where(eq(gosini.accountId, accountId))).toHaveLength(0);
    expect(await db.select().from(places).where(eq(places.accountId, accountId))).toHaveLength(1);
    // si entra con la sessione: nessun token del proprietario in giro
    expect(await db.select().from(accessTokens).where(eq(accessTokens.accountId, accountId))).toHaveLength(0);
  });

  it("lo stesso link due volte non apre due porte", async () => {
    const link = ResendStub.linkIn(resend.lastTo(EMAIL) ?? ({} as never)) ?? "";
    const again = await confirm(tokenOf(link));
    expect(again.headers.location).toBe("/accedi?link=scaduto");
  });

  it("la sessione dice chi sei, e si vede fra le sessioni", async () => {
    const cookie = { cookie: `__Host-ugo_sid=${sessionCookie}` };
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: cookie });
    expect(me.json()).toMatchObject({ role: "owner", account: { id: accountId } });
    // una casa senza gosino non riceve l'umore di un'altra casa (il ripiego di bootstrap)
    expect((await app.inject({ method: "GET", url: "/v1/psyche", headers: cookie })).statusCode).toBe(404);
    // ...e il suo branco è vuoto, non rotto
    expect((await app.inject({ method: "GET", url: "/v1/pack", headers: cookie })).json()).toMatchObject({ gosinoId: null, beings: [] });
    const list = await app.inject({ method: "GET", url: "/v1/sessioni", headers: cookie });
    expect(list.json<{ sessioni: { current: boolean }[] }>().sessioni).toEqual([
      expect.objectContaining({ current: true }),
    ]);
  });
});

describe("l'accesso", () => {
  it("chi è iscritto riceve un link per entrare, anche se chiede di iscriversi", async () => {
    resend.reset();
    await askLink(EMAIL, "iscrizione", "10.0.0.2");
    expect(resend.lastTo(EMAIL)?.subject).toContain("per entrare");
    const res = await confirm(tokenOf(ResendStub.linkIn(resend.lastTo(EMAIL) ?? ({} as never)) ?? ""));
    expect(res.headers.location).toBe("/casa");
    expect(await db.select().from(accountLogins)).toHaveLength(1);
  });

  it("uno sconosciuto riceve l'invito, e chi ha chiesto non lo sa", async () => {
    resend.reset();
    const before = (await db.select().from(loginLinks)).length;
    const res = await askLink("nessuno@example.it", "accesso", "10.0.0.3");
    expect(res.statusCode).toBe(202);
    expect(resend.lastTo("nessuno@example.it")?.subject).toContain("Nessun account");
    expect(await db.select().from(loginLinks)).toHaveLength(before);
  });

  it("un link scaduto non vale", async () => {
    resend.reset();
    await askLink(EMAIL, "accesso", "10.0.0.4");
    await db.update(loginLinks).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await confirm(tokenOf(ResendStub.linkIn(resend.lastTo(EMAIL) ?? ({} as never)) ?? ""));
    expect(res.headers.location).toBe("/accedi?link=scaduto");
  });

  it("una casella non si bombarda: il quarto link in un quarto d'ora è un 429", async () => {
    const victim = "bersaglio@example.it";
    for (const ip of ["10.1.0.1", "10.1.0.2", "10.1.0.3"]) {
      expect((await askLink(victim, "accesso", ip)).statusCode).toBe(202);
    }
    expect((await askLink(victim, "accesso", "10.1.0.4")).statusCode).toBe(429);
  });

  it("una pagina altrui non può farti entrare nel SUO account (login CSRF)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/verifica",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://altrove.example" },
      payload: "t=qualunque-cosa-lunga-abbastanza",
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("la porta pubblica", () => {
  it("chi non si presenta non parla con l'API, ma vede il sito e la vetrina", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/psyche" })).statusCode).toBe(401);
    // la vetrina vera ha la sua suite: qui conta che la porta non la chiuda
    expect((await app.inject({ method: "GET", url: "/v1/vetrina" })).statusCode).not.toBe(401);
    // il pannello è markup: si apre a tutti, i dati passano dall'API
    expect((await app.inject({ method: "GET", url: "/casa" })).statusCode).toBe(200);
    const home = await app.inject({ method: "GET", url: "/" });
    expect(home.statusCode).toBe(200);
    expect(home.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(home.headers["strict-transport-security"]).toContain("max-age=");
    expect((await app.inject({ method: "GET", url: "/privacy" })).body).toContain("Allevamento di prova");
  });

  it("un muso di prima che bussa alla radice va sotto /muso/", async () => {
    const res = await app.inject({ method: "GET", url: "/?gosino=ugo" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/muso/?gosino=ugo");
  });

  it("una scrittura col cookie vuole la nostra origine (CSRF)", async () => {
    const cookie = `__Host-ugo_sid=${sessionCookie}`;
    const bare = await app.inject({
      method: "POST",
      url: "/v1/dispositivi/codice",
      headers: { cookie },
      payload: { nome: "cucina" },
    });
    expect(bare.statusCode).toBe(403);
    const evil = await app.inject({
      method: "POST",
      url: "/v1/dispositivi/codice",
      headers: { cookie, origin: "https://altrove.example" },
      payload: { nome: "cucina" },
    });
    expect(evil.statusCode).toBe(403);
  });
});

describe("il chiosco", () => {
  let deviceCookie = "";

  it("sei cifre dal pannello diventano un cookie del muso, una volta sola", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/dispositivi/codice",
      headers: { cookie: `__Host-ugo_sid=${sessionCookie}`, origin: SITE },
      payload: { nome: "cucina" },
    });
    expect(made.statusCode).toBe(201);
    const { codice } = made.json<{ codice: string }>();
    expect(codice).toMatch(/^\d{6}$/);

    const paired = await app.inject({ method: "POST", url: "/v1/dispositivi/abbina", payload: { codice } });
    expect(paired.statusCode).toBe(200);
    expect(paired.body).not.toContain(cookieFrom(paired, "__Host-ugo_dev") ?? "assente");
    expect(String(paired.headers["set-cookie"])).toContain("SameSite=Strict");
    deviceCookie = cookieFrom(paired, "__Host-ugo_dev") ?? "";

    const again = await app.inject({ method: "POST", url: "/v1/dispositivi/abbina", payload: { codice } });
    expect(again.statusCode).toBe(400);

    const me = await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: `__Host-ugo_dev=${deviceCookie}` } });
    expect(me.json()).toMatchObject({ role: "member", account: { id: accountId } });
    // il muso chiede chi è prima e dopo l'abbinamento
    expect((await app.inject({ method: "GET", url: "/v1/dispositivi/io" })).json()).toEqual({ abbinato: false });
    const io = await app.inject({ method: "GET", url: "/v1/dispositivi/io", headers: { cookie: `__Host-ugo_dev=${deviceCookie}` } });
    expect(io.json()).toEqual({ abbinato: true });
    const [token] = await db.select().from(accessTokens).where(eq(accessTokens.accountId, accountId));
    expect(token?.label).toBe("chiosco: cucina");
  });

  it("chi tira a indovinare viene fermato", async () => {
    const tries = [];
    for (let i = 0; i < 11; i += 1) {
      tries.push(
        (await app.inject({ method: "POST", url: "/v1/dispositivi/abbina", remoteAddress: "10.9.9.9", payload: { codice: "000000" } }))
          .statusCode,
      );
    }
    expect(tries.at(-1)).toBe(429);
  });

  it("chiudere la casa revoca tutto e distrugge la chiave", async () => {
    const cookie = `__Host-ugo_sid=${sessionCookie}`;
    const [before] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    const wrong = await app.inject({
      method: "POST",
      url: "/v1/account/chiudi",
      headers: { cookie, origin: SITE },
      payload: { conferma: "un'altra" },
    });
    expect(wrong.statusCode).toBe(400);
    const closed = await app.inject({
      method: "POST",
      url: "/v1/account/chiudi",
      headers: { cookie, origin: SITE },
      payload: { conferma: before?.slug },
    });
    expect(closed.statusCode).toBe(200);

    const [after] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(after?.closedAt).not.toBeNull();
    expect(after?.wrappedDataKey?.equals(before?.wrappedDataKey ?? Buffer.alloc(0))).toBe(false);
    expect(await db.select().from(accountLogins).where(eq(accountLogins.accountId, accountId))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.accountId, accountId))).toHaveLength(0);
    const device = await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: `__Host-ugo_dev=${deviceCookie}` } });
    expect(device.statusCode).toBe(401);
  });
});

describe("l'uscita", () => {
  it("revoca la sessione: il cookie vecchio non apre più", async () => {
    resend.reset();
    await askLink("bruno@example.it", "iscrizione", "10.2.0.1");
    const entered = await confirm(tokenOf(ResendStub.linkIn(resend.lastTo("bruno@example.it") ?? ({} as never)) ?? ""));
    const cookie = `__Host-ugo_sid=${cookieFrom(entered, "__Host-ugo_sid") ?? ""}`;
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { cookie } })).statusCode).toBe(200);
    const out = await app.inject({ method: "POST", url: "/v1/auth/esci", headers: { cookie, origin: SITE } });
    expect(out.statusCode).toBe(204);
    expect(String(out.headers["set-cookie"])).toContain("Max-Age=0");
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { cookie } })).statusCode).toBe(401);
  });
});

describe("la pulizia", () => {
  it("porta via link, finestre e sessioni morte da più di un giorno, e lascia il resto", async () => {
    const later = new Date(Date.now() + 3 * 86_400_000);
    const linksBefore = (await db.select().from(loginLinks)).length;
    expect(linksBefore).toBeGreaterThan(0);
    expect((await db.select().from(rateLimits)).length).toBeGreaterThan(0);
    // fra tre giorni: ogni link (15 minuti) e ogni finestra sono morti da un pezzo
    await sweepAccess(db, later);
    expect(await db.select().from(loginLinks)).toHaveLength(0);
    expect(await db.select().from(rateLimits)).toHaveLength(0);
    // le sessioni vive (trenta giorni) restano; quelle revocate se ne vanno
    const left = await db.select().from(sessions);
    expect(left.every((row) => row.revokedAt === null)).toBe(true);
  });
});
