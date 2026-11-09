import { randomBytes } from "node:crypto";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  customerGosini,
  customerMessages,
  customers,
  phoneCalls,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import { DEFAULT_CHAT_MODEL, DEFAULT_TTS_MODEL, LlmClient, OpenRouterTtsClient } from "@ugo/memory";
import { openRouterKey, REFUSED_MODEL, startPostgres } from "@ugo/factories";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { callRefOf, contactEmailHash } from "../../src/services/phone/phoneCrypto.js";
import { CustomerQuota } from "../../src/services/reception/customerQuota.js";
import { issueToken } from "../../src/services/tenantAuth.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * Il gosino al telefono (ADR-128, contratto C4 con Omega HQ), sullo stack
 * HTTP vero: Postgres vero, chat e voce VERE su OpenRouter, mp3 vero. Il
 * fornitore non si finge (ADR-125): ciò che si verifica è ciò che una
 * chiamata lascia — una risposta parlata, un URL che Twilio può scaricare
 * per dieci minuti, una riga di numeri sulla chiamata e niente parole.
 */

const PHONE_TOKEN = "p".repeat(48);
const dataKey = randomBytes(32);
const RISPONDI = "Rispondi solo con questa frase: Lo studio apre alle nove.";

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let studio: TestHouse;
let ownerToken: string;
let model = DEFAULT_CHAT_MODEL;

async function turn(body: Record<string, unknown>, token = PHONE_TOKEN) {
  return app.inject({
    method: "POST",
    url: "/v1/phone/turn",
    headers: { authorization: `Bearer ${token}`, host: "ugo.example.test", "x-forwarded-proto": "https" },
    payload: body,
  });
}

function relative(audioUrl: string): string {
  return audioUrl.replace("https://ugo.example.test", "");
}

beforeAll(async () => {
  const postgres = await startPostgres();
  pg = postgres.container;
  await runMigrations(postgres.url);
  db = createDbClient(postgres.url);
  studio = await createHouse(db, "studio-al-telefono");
  ownerToken = (await issueToken(db, { accountId: studio.id, role: "owner", label: "pannello" })).token;

  const [rossi] = await db
    .insert(customers)
    .values({
      accountId: studio.id,
      name: "Rossi SRL",
      slug: "rossi-srl",
      contactEmailHash: contactEmailHash(dataKey, "mario@rossi.it"),
    })
    .returning({ id: customers.id });
  if (rossi === undefined) throw new Error("customer not created");
  await db
    .insert(customerGosini)
    .values({ accountId: studio.id, customerId: rossi.id, gosinoId: studio.gosinoId });

  const llmFor = (accountId: string, gosinoId: string): LlmClient =>
    new LlmClient({
      db,
      apiKey: openRouterKey(),
      model,
      dailyBudgetUsd: 10,
      accountId,
      gosinoId,
    });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      phone: {
        token: PHONE_TOKEN,
        accountId: studio.id,
        dataKey,
        quota: new CustomerQuota(db, { hourlyMessages: 100, dailyBudgetUsd: 5, timezone: "Europe/Rome" }),
        llmFor,
        tts: new OpenRouterTtsClient({ db, apiKey: openRouterKey(), dailyBudgetUsd: 10, model: DEFAULT_TTS_MODEL }),
      },
    },
  });
  await app.ready();
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await pg.stop();
});

describe("la porta del telefono", () => {
  it("rifiuta chi non ha il segreto del telefono", async () => {
    const response = await turn({ callId: "CA0001", turn: 1, text: "pronto?" }, "q".repeat(48));
    expect(response.statusCode).toBe(401);
  });

  it("rifiuta un turno malformato", async () => {
    const response = await turn({ callId: "x", turn: 0, text: "" });
    expect(response.statusCode).toBe(400);
  });
});

describe("uno sconosciuto chiama", () => {
  it("risponde a voce: testo, mp3 vero da un URL firmato, e una riga di soli numeri", async () => {
    const response = await turn({ callId: "CA0002", turn: 1, text: RISPONDI });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ text: string; audioUrl: string | null; handover: boolean }>();
    expect(body.handover).toBe(false);
    expect(body.text.toLowerCase()).toContain("nove");
    expect(body.audioUrl).toMatch(/^https:\/\/ugo\.example\.test\/v1\/phone\/audio\/[^?]+\?exp=\d+&sig=[0-9a-f]{64}$/u);

    const audio = await app.inject({ method: "GET", url: relative(body.audioUrl ?? "") });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers["content-type"]).toBe("audio/mpeg");
    const head = audio.rawPayload.subarray(0, 3).toString("latin1");
    expect(head === "ID3" || audio.rawPayload[0] === 0xff).toBe(true);

    const [call] = await db.select().from(phoneCalls).where(eq(phoneCalls.accountId, studio.id));
    expect(call?.turns).toBe(1);
    expect(call?.outcome).toBe("answered");
    expect(call?.customerId).toBeNull();
    expect(call?.callRef).not.toContain("CA0002");
    expect(Number(call?.costUsd)).toBeGreaterThan(0);
    // chat e voce, tutte e due pagate e tutte e due sul salvadanaio della casa
    const ledger = await db.select().from(budgetLedger).where(eq(budgetLedger.accountId, studio.id));
    expect(ledger.map((row) => row.model).sort()).toEqual([DEFAULT_CHAT_MODEL, DEFAULT_TTS_MODEL].sort());
    // di uno sconosciuto non resta una parola su disco
    expect(await db.select().from(customerMessages)).toHaveLength(0);
  });

  it("un URL alterato o scaduto non dà l'audio", async () => {
    const body = (await turn({ callId: "CA0003", turn: 1, text: RISPONDI })).json<{ audioUrl: string }>();
    const url = new URL(body.audioUrl);
    const exp = url.searchParams.get("exp") ?? "0";
    const sig = url.searchParams.get("sig") ?? "";
    const moved = `${url.pathname}?exp=${String(Number(exp) + 60_000)}&sig=${sig}`;
    expect((await app.inject({ method: "GET", url: moved })).statusCode).toBe(403);
    const old = `${url.pathname}?exp=1000&sig=${sig}`;
    expect((await app.inject({ method: "GET", url: old })).statusCode).toBe(403);
  });

  it("quando il modello non risponde, passa a una persona invece di tacere", async () => {
    model = REFUSED_MODEL;
    try {
      const response = await turn({ callId: "CA0004", turn: 1, text: "pronto?" });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ text: string; handover: boolean }>();
      expect(body.handover).toBe(true);
      expect(body.text).toContain("persona");
      const [call] = await db
        .select({ outcome: phoneCalls.outcome, handovers: phoneCalls.handovers })
        .from(phoneCalls)
        .where(eq(phoneCalls.callRef, callRefOf("CA0004")));
      expect(call?.outcome).toBe("failed");
      expect(call?.handovers).toBe(1);
    } finally {
      model = DEFAULT_CHAT_MODEL;
    }
  });
});

describe("un cliente della reception chiama", () => {
  it("lo riconosce dall'email e gli risponde come alla reception, coi turni cifrati", async () => {
    const response = await turn({
      callId: "CA0005",
      turn: 1,
      text: RISPONDI,
      customerEmail: "Mario@Rossi.it",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ handover: boolean }>().handover).toBe(false);
    const [call] = await db
      .select({ customerId: phoneCalls.customerId })
      .from(phoneCalls)
      .where(eq(phoneCalls.callRef, callRefOf("CA0005")));
    expect(call?.customerId).not.toBeNull();
    const turns = await db.select().from(customerMessages);
    expect(turns).toHaveLength(2);
    // cifrati a riposo (regola 6)
    expect(turns.every((row) => !row.text.includes("nove") && !row.text.includes("Rispondi"))).toBe(true);
  });
});

describe("nel pannello", () => {
  it("mostra le chiamate coi soli numeri", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/phone/calls",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ calls: { turns: number; outcome: string; customer: string | null }[] }>();
    expect(body.calls.length).toBeGreaterThanOrEqual(3);
    expect(body.calls.some((call) => call.customer === "Rossi SRL")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("nove");
  });
});
