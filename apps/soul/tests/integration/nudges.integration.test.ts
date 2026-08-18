import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  events,
  gosini,
  accounts,
  psycheSnapshots,
  rooms,
  runMigrations,
  type DbClient,
} from "@ugo/db";
import type { EmbeddingsClient, LocalTextClient } from "@ugo/memory";
import type { ServerToFaceMessage } from "@ugo/shared";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NudgeService, nudgeOf } from "../../src/services/nudges.js";
import { GosinoRegistry } from "../../src/services/pack/runtimes.js";

/**
 * Le spinte (ADR-064): i primi due verbi contro un registro VERO su Postgres
 * vero. Quello che va provato non è il regex — è che una spinta assecondata
 * passa dallo stesso giro del pannello (catalogo → locationLabel → reload),
 * che il rifiuto ha una risposta, e che tutto lascia una riga nel registro.
 */

const idleEmbedder: EmbeddingsClient = {
  embed: (texts) => Promise.resolve(texts.map(() => Array.from({ length: 768 }, () => 0))),
};
const idleLocal: LocalTextClient = {
  generate: () => Promise.resolve(undefined),
  available: () => Promise.resolve(false),
};

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let registry: GosinoRegistry;
let nudges: NudgeService;
let accountId = "";
let ugo = "";
let silvio = "";
let pauroso = "";

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = pg.getConnectionUri();
  await runMigrations(url);
  db = createDbClient(url);
  const [house] = await db.select({ id: accounts.id }).from(accounts).limit(1);
  accountId = house?.id ?? "";
  await db.insert(rooms).values([
    { accountId, name: "cucina", slug: "cucina" },
    { accountId, name: "studio", slug: "studio" },
  ]);
  const born = await db
    .insert(gosini)
    .values([
      { accountId, name: "Ugo", locationLabel: "cucina" },
      { accountId, name: "Silvio", locationLabel: "studio" },
      { accountId, name: "Pauroso", locationLabel: "studio" },
    ])
    .returning({ id: gosini.id });
  ugo = born[0]?.id ?? "";
  silvio = born[1]?.id ?? "";
  pauroso = born[2]?.id ?? "";
  // il pauroso ha appena preso uno spavento: lo dice la sua psiche salvata,
  // e il restore la rilegge — la soglia si prova sul percorso vero
  await db.insert(psycheSnapshots).values({
    gosinoId: pauroso,
    vars: { stress: 0.92, energia: 0.6, umore: 0.4, affetto: 0.4, noia: 0.2, curiosita: 0.3 },
    label: "spaventato dal fracasso",
  });

  // lo stesso ordine di index.ts: il servizio nasce prima del registro e lo
  // legge al momento del gesto — così anche la chat dei runtime ce l'ha
  nudges = new NudgeService({ db, registry: () => registry });
  registry = await GosinoRegistry.load({
    db,
    embedder: idleEmbedder,
    llm: () => undefined as never,
    local: idleLocal,
    dataKey: randomBytes(32),
    timezone: "Europe/Rome",
    localModelUp: () => false,
    initiativeEnabled: () => false,
    hourOf: () => 15,
    nudges: { answer: (gosinoId, text, at) => nudges.answer(gosinoId, text, at) },
  });
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("nudgeOf: le forme", () => {
  it("riconosce i due verbi e lascia in pace il resto", () => {
    expect(nudgeOf("vai in cucina")).toEqual({ verb: "go", room: "cucina" });
    expect(nudgeOf("Ugo, vai nello studio!")).toEqual({ verb: "go", room: "studio" });
    expect(nudgeOf("spostati al salotto")).toEqual({ verb: "go", room: "salotto" });
    expect(nudgeOf("chiama Silvio")).toEqual({ verb: "call", name: "Silvio" });
    // frasi qualunque: NON sono spinte
    expect(nudgeOf("vado in cucina a farmi un caffè")).toBeUndefined();
    expect(nudgeOf("chiamami quando arrivi")).toBeUndefined();
    expect(nudgeOf("ieri sono andato in studio")).toBeUndefined();
  });
});

describe("«vai in…»: lo stesso giro del pannello", () => {
  it("sposta la stanza, ricarica il registro, e lo dice", async () => {
    const reply = await nudges.answer(ugo, "vai in studio");
    expect(reply).toContain("studio");
    const [row] = await db
      .select({ where: gosini.locationLabel })
      .from(gosini)
      .where(eq(gosini.id, ugo));
    expect(row?.where).toBe("studio");
    expect(registry.everywhere().find((r) => r.id === ugo)?.where).toBe("studio");
    // e la spinta è nel registro: verbi ed esiti, mai contenuti
    const noted = await db
      .select({ payload: events.payload })
      .from(events)
      .where(sql`${events.type} = 'nudge' and ${events.gosinoId} = ${ugo}`);
    expect(noted.map((n) => (n.payload as { outcome: string }).outcome)).toContain("done");
  });

  it("una stanza che non esiste è un rifiuto onesto, non una stanza nuova", async () => {
    const reply = await nudges.answer(ugo, "vai in cantina");
    expect(reply).toContain("cantina");
    expect(reply?.toLowerCase()).toContain("non conosco");
    const all = await db.select({ name: rooms.name }).from(rooms);
    expect(all.map((r) => r.name)).not.toContain("cantina");
  });

  it("se è già lì, lo dice invece di fingere di muoversi", async () => {
    const reply = await nudges.answer(ugo, "vai in studio");
    expect(reply?.toLowerCase()).toContain("già");
  });
});

describe("«chiama…»: la chiamata passa dal corpo dell'altro", () => {
  it("senza un corpo acceso, la verità: non può sentire", async () => {
    const reply = await nudges.answer(ugo, "chiama Silvio");
    expect(reply).toContain("Silvio");
    expect(reply).toContain("corpo");
  });

  it("col corpo acceso, il corpo di Silvio parla", async () => {
    const heard: ServerToFaceMessage[] = [];
    const silvioRuntime = registry.everywhere().find((r) => r.id === silvio);
    if (silvioRuntime === undefined) throw new Error("silvio deve esistere");
    silvioRuntime.gateway.registerSender((message) => {
      heard.push(message);
    });
    const reply = await nudges.answer(ugo, "chiama Silvio");
    expect(reply).toContain("orecchie");
    const spoken = heard.find((m) => m.type === "speak");
    expect(spoken).toBeDefined();
  });

  it("chi non vive qui non si può chiamare", async () => {
    const reply = await nudges.answer(ugo, "chiama Gennaro");
    expect(reply).toContain("Gennaro");
    expect(reply?.toLowerCase()).toContain("non vive");
  });
});

describe("il carattere decide il COME (ADR-064 §3)", () => {
  it("spaventato, rifiuta CON una risposta e non si muove", async () => {
    const reply = await nudges.answer(pauroso, "vai in cucina");
    expect(reply?.toLowerCase()).toContain("cuore");
    const [row] = await db
      .select({ where: gosini.locationLabel })
      .from(gosini)
      .where(eq(gosini.id, pauroso));
    expect(row?.where).toBe("studio");
  });
});

describe("la giunzione con la chat (la strada del chiosco)", () => {
  it("chat.handle risponde alla spinta PRIMA del provider, e la biografia resta", async () => {
    // il registry è costruito con llm `undefined as never`: se la spinta
    // arrivasse al provider, questo test esploderebbe — non esplodere È
    // l'asserzione che conta
    const runtime = registry.everywhere().find((r) => r.id === silvio);
    if (runtime === undefined) throw new Error("silvio deve esistere");
    const answer = await runtime.chat.handle({ channel: "home", text: "vai in cucina" });
    expect(answer.reply).toContain("cucina");
    const [moved] = await db
      .select({ where: gosini.locationLabel })
      .from(gosini)
      .where(eq(gosini.id, silvio));
    expect(moved?.where).toBe("cucina");
  });
});
