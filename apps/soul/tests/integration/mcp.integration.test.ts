import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createDbClient, diaryEntries, memories, runMigrations, type DbClient } from "@ugo/db";
import type { EmbeddingsClient } from "@ugo/memory";
import { startPostgres } from "@ugo/factories";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";
import { createHouse, type TestHouse } from "./helpers/tenancy.js";

/**
 * Il server MCP (backlog gruppo 3): un agente esterno interroga la memoria di
 * UGO col token di casa. Server Fastify VERO in ascolto su una porta vera,
 * client MCP VERO dell'SDK sopra — la giunzione provata è quella che userà
 * chiunque punti un agente a `/v1/mcp`.
 *
 * L'embedder è registrato e deterministico (dichiarato): Ollama nei test gira
 * solo in CI, e qui si prova il SERVER, non l'embedding — la matematica del
 * recupero ha i suoi test in packages/memory.
 */

/** 768 dimensioni come nomic-embed-text; chiave sulla parola, non sul caso */
function fakeVector(text: string): number[] {
  const seed = text.toLowerCase().includes("mel") ? 7 : 3;
  return Array.from({ length: 768 }, (_v, i) => Math.sin(i * seed));
}

const embedder: EmbeddingsClient = {
  embed: (texts) => Promise.resolve(texts.map((text) => fakeVector(text))),
};

let container: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let baseUrl = "";
let mine: TestHouse;
let theirs: TestHouse;
let myToken = "";
let theirToken = "";

async function mcpClient(token: string | undefined): Promise<Client> {
  const client = new Client({ name: "agente-di-prova", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/v1/mcp`), {
    ...(token !== undefined && {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  });
  // cast di confine: i tipi dell'SDK non sono compilati con
  // exactOptionalPropertyTypes — l'oggetto E' il Transport che si aspetta
  await client.connect(transport as Parameters<Client["connect"]>[0]);
  return client;
}

function textOf(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.map((piece) => piece.text ?? "").join("\n");
}

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  mine = await createHouse(db, "casa-mcp");
  theirs = await createHouse(db, "casa-mcp-vicina");
  myToken = (await issueToken(db, { accountId: mine.id, role: "owner", label: "mcp" })).token;
  theirToken = (
    await issueToken(db, { accountId: theirs.id, role: "owner", label: "mcp-vicini" })
  ).token;

  await db.insert(diaryEntries).values({
    gosinoId: mine.gosinoId,
    date: "2026-08-15",
    text: "Oggi ho conosciuto il corriere e ho ricevuto una mela.",
  });
  await db.insert(memories).values({
    gosinoId: mine.gosinoId,
    kind: "fact",
    text: "Al proprietario piacciono le mele rosse.",
    embedding: fakeVector("le mele"),
  });

  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      mcp: { embedder },
    },
  });
  baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
}, 180_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await container.stop();
});

describe("il server MCP di sola lettura", () => {
  it("elenca i tre strumenti, e sono di sola lettura per costruzione", async () => {
    const client = await mcpClient(myToken);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "cerca_ricordi",
      "il_branco",
      "leggi_diario",
    ]);
    await client.close();
  });

  it("cerca_ricordi trova il ricordo pertinente, con la data", async () => {
    const client = await mcpClient(myToken);
    const found = await client.callTool({
      name: "cerca_ricordi",
      arguments: { domanda: "cosa piace mangiare al proprietario? le mele?" },
    });
    expect(textOf(found)).toContain("mele rosse");
    await client.close();
  });

  it("leggi_diario porta le pagine della MIA casa", async () => {
    const client = await mcpClient(myToken);
    const diary = await client.callTool({ name: "leggi_diario", arguments: { giorni: 3 } });
    expect(textOf(diary)).toContain("2026-08-15");
    expect(textOf(diary)).toContain("una mela");
    await client.close();
  });

  it("il vicino, col SUO token, vede la sua casa e non la mia", async () => {
    const client = await mcpClient(theirToken);
    // il MIO diario ha una pagina; il suo e' vuoto — se vedesse il mio,
    // qui arriverebbe la mela del corriere
    const diary = await client.callTool({ name: "leggi_diario", arguments: {} });
    expect(textOf(diary)).toContain("vuoto");
    expect(textOf(diary)).not.toContain("mela");
    // e la MIA memoria per lui non esiste nemmeno come «non pertinente»
    const found = await client.callTool({
      name: "cerca_ricordi",
      arguments: { domanda: "le mele del proprietario" },
    });
    expect(textOf(found)).not.toContain("mele rosse");
    await client.close();
  });

  it("senza token la porta non si apre", async () => {
    await expect(mcpClient(undefined)).rejects.toThrow();
  });
});
