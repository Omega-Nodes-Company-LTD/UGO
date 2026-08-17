import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, gosini, households, runMigrations, type DbClient } from "@ugo/db";
import type { EmbeddingsClient, LlmClient } from "@ugo/memory";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { PsycheService } from "../../src/services/psycheService.js";

/**
 * Input immagini (gruppo 4): la foto diventa una frase col modello LOCALE, e
 * al provider arriva SOLO quella — i pixel muoiono in casa. Postgres vero;
 * il provider è uno stub che cattura (qui si prova cosa gli arriva, non come
 * scrive), il vision è registrato e deterministico come nei test dell'occhiata.
 */

const flatEmbedder: EmbeddingsClient = {
  embed: (texts) => Promise.resolve(texts.map(() => Array.from({ length: 768 }, () => 0))),
};

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let gosinoId = "";
let householdId = "";
// UNA chiave per tutto il file: la cronologia scritta da un test si rilegge
// nel successivo, come in produzione
const dataKey = randomBytes(32);
const askedOfProvider: string[] = [];

/** il provider che cattura: struttura di LlmClient.chat, niente rete */
const capturingLlm = {
  chat: (input: { userText: string }) => {
    askedOfProvider.push(input.userText);
    return Promise.resolve({ text: "Grunf! Che bella mela rossa!", usage: undefined, costUsd: 0 });
  },
} as unknown as LlmClient;

async function chatWith(
  vision: { describe: (b64: string) => Promise<string | undefined> } | undefined,
): Promise<ChatService> {
  return new ChatService({
    db,
    embedder: flatEmbedder,
    llm: capturingLlm,
    psyche: await PsycheService.restore(db, new Date(), gosinoId),
    dataKey,
    gosinoId,
    householdId,
    character: characterFrom({}),
    ...(vision !== undefined && { vision }),
  });
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = pg.getConnectionUri();
  await runMigrations(url);
  db = createDbClient(url);
  const [house] = await db.select({ id: households.id }).from(households).limit(1);
  householdId = house?.id ?? "";
  const [pig] = await db
    .insert(gosini)
    .values({ householdId, name: "ugo-foto" })
    .returning({ id: gosini.id });
  gosinoId = pig?.id ?? "";
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("la foto nella chat", () => {
  it("il provider riceve la DESCRIZIONE locale, mai i pixel", async () => {
    const chat = await chatWith({
      describe: () => Promise.resolve("una mela rossa su un tavolo di legno"),
    });
    const answer = await chat.handle({
      channel: "home",
      text: "guarda questa foto!",
      imageBase64: "jpeg-finto-in-base64",
    });
    expect(answer.reply).toContain("mela");
    const seen = askedOfProvider.at(-1) ?? "";
    expect(seen).toContain("una mela rossa su un tavolo di legno");
    expect(seen).not.toContain("jpeg-finto-in-base64");
  });

  it("occhi locali giù o assenti: al modello arriva l'onestà, non il silenzio", async () => {
    const blind = await chatWith({ describe: () => Promise.resolve(undefined) });
    await blind.handle({ channel: "home", text: "e questa?", imageBase64: "altro-jpeg" });
    expect(askedOfProvider.at(-1)).toContain("non funzionano");

    const none = await chatWith(undefined);
    await none.handle({ channel: "home", text: "la vedi?", imageBase64: "terzo-jpeg" });
    expect(askedOfProvider.at(-1)).toContain("non funzionano");
  });

  it("senza foto, il testo passa intonso: il ramo non tocca la chat di sempre", async () => {
    const chat = await chatWith({ describe: () => Promise.resolve("mai chiamato") });
    await chat.handle({ channel: "home", text: "ciao ugo, come va?" });
    expect(askedOfProvider.at(-1)).toBe("ciao ugo, come va?");
  });
});
