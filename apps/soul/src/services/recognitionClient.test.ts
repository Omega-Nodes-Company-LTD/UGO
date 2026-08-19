import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { RecognitionClient } from "./recognitionClient.js";

/**
 * Il confine col servizio di percezione (ADR-045), provato contro un server
 * HTTP **vero** su porta effimera — non contro una `fetch` finta.
 *
 * La differenza non è formale. Con `fetch` sostituita da `vi.fn` restavano
 * fuori dalla prova proprio i pezzi che si sono rotti davvero: la `fetch` del
 * runtime, il JSON che arriva a pezzi sulla rete, l'`AbortSignal` che deve
 * interrompere una richiesta già partita, un servizio che risponde 200 con un
 * corpo che non è JSON. È la stessa classe di guasto di ADR-045 — ogni pezzo
 * corretto da solo, la giunzione rotta, e nessun test rosso per mesi — e la
 * regola 1 (Zero-Mock) esiste per non ripeterla. Stesso schema dello stub di
 * rete di `chat.integration.test.ts` (playbook §3 P2).
 */

const servers: Server[] = [];

/** Un servizio di percezione finto quanto basta: parla HTTP sul serio. */
async function serving(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no ephemeral port");
  return `http://127.0.0.1:${String(address.port)}`;
}

/** Risponde sempre lo stesso corpo, e registra come è stato chiamato. */
async function replying(
  body: unknown,
  status = 200,
): Promise<{ baseUrl: string; seen: { authorization?: string }[] }> {
  const seen: { authorization?: string }[] = [];
  const baseUrl = await serving((request, response) => {
    seen.push({ ...(request.headers.authorization !== undefined && {
      authorization: request.headers.authorization,
    }) });
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  return { baseUrl, seen };
}

const client = (baseUrl: string, timeoutMs = 1_000): RecognitionClient =>
  new RecognitionClient({ baseUrl, token: "t", accountId: "h", timeoutMs });

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
});

describe("chi sta parlando", () => {
  it("porta a casa il nome quando il servizio è sicuro", async () => {
    const { baseUrl } = await replying({
      being_id: "ivan",
      candidate_being_id: null,
      confidence: 0.71,
    });

    const found = await client(baseUrl).byVoice("AAAA");

    expect(found?.beingId).toBe("ivan");
    expect(found?.candidateBeingId).toBeUndefined();
    expect(found?.confidence).toBeCloseTo(0.71);
  });

  it("tiene il candidato distinto dal nome, perché è una domanda", async () => {
    const { baseUrl } = await replying({
      being_id: null,
      candidate_being_id: "paola",
      confidence: 0.33,
    });

    const found = await client(baseUrl).byVoice("AAAA");

    expect(found?.beingId).toBeUndefined();
    expect(found?.candidateBeingId).toBe("paola");
  });

  it("manda il token, o un servizio interno si fiderebbe della rete", async () => {
    const { baseUrl, seen } = await replying({ being_id: null, confidence: 0 });

    await client(baseUrl).byVoice("AAAA");

    expect(seen[0]?.authorization).toBe("Bearer t");
  });

  it("non è nessuno quando il servizio rifiuta", async () => {
    const { baseUrl } = await replying({}, 500);

    expect(await client(baseUrl).byVoice("AAAA")).toBeUndefined();
  });

  it("non è nessuno quando il servizio risponde una cosa che non capiamo", async () => {
    // uno schema sbagliato è un servizio sbagliato: meglio non sapere chi è
    // che passare a valle un `beingId` che non è un id
    const { baseUrl } = await replying({ being_id: 42 });

    expect(await client(baseUrl).byVoice("AAAA")).toBeUndefined();
  });

  it("non è nessuno quando il servizio risponde 200 con qualcosa che non è JSON", async () => {
    // il caso che la fetch finta non poteva produrre: un proxy che si mette in
    // mezzo e risponde HTML con lo stato buono
    const baseUrl = await serving((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><title>502</title>");
    });

    await expect(client(baseUrl).byVoice("AAAA")).resolves.toBeUndefined();
  });

  it("non fa cadere la conversazione quando il servizio è spento", async () => {
    // porta chiusa davvero: ECONNREFUSED dal sistema operativo, non da un
    // `Promise.reject` scritto a mano
    const baseUrl = await serving(() => undefined);
    const closing = servers.splice(0)[0];
    await new Promise<void>((resolve) => {
      closing?.close(() => {
        resolve();
      });
    });

    await expect(client(baseUrl).byVoice("AAAA")).resolves.toBeUndefined();
  });

  it("rinuncia invece di far aspettare: in ritardo non è una risposta", async () => {
    // il server accetta la connessione e non risponde mai: è il timeout del
    // client a doverla chiudere, con un `AbortSignal` vero su una richiesta
    // vera già partita
    const baseUrl = await serving(() => undefined);

    await expect(client(baseUrl, 20).byVoice("AAAA")).resolves.toBeUndefined();
  });
});
