import { describe, expect, it, vi } from "vitest";
import { RecognitionClient } from "./recognitionClient.js";

/**
 * Il confine col servizio di percezione (ADR-045). Logica pura attorno a una
 * fetch iniettata, quindi un unit test è il posto onesto — e ciò che va
 * protetto non è il caso buono ma **tutti i modi in cui questo può fallire
 * senza far cadere una conversazione**. Un riconoscimento mancato costa un
 * «non so chi sei»; un'eccezione qui costa la risposta.
 */

const reply = (body: unknown, ok = true): typeof fetch =>
  vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) })) as unknown as typeof fetch;

const client = (fetchImpl: typeof fetch, timeoutMs = 1_000): RecognitionClient =>
  new RecognitionClient({
    baseUrl: "http://percezione:8000",
    token: "t",
    householdId: "h",
    fetchImpl,
    timeoutMs,
  });

describe("chi sta parlando", () => {
  it("porta a casa il nome quando il servizio è sicuro", async () => {
    const found = await client(
      reply({ being_id: "ivan", candidate_being_id: null, confidence: 0.71 }),
    ).byVoice("AAAA");

    expect(found?.beingId).toBe("ivan");
    expect(found?.candidateBeingId).toBeUndefined();
    expect(found?.confidence).toBeCloseTo(0.71);
  });

  it("tiene il candidato distinto dal nome, perché è una domanda", async () => {
    const found = await client(
      reply({ being_id: null, candidate_being_id: "paola", confidence: 0.33 }),
    ).byVoice("AAAA");

    expect(found?.beingId).toBeUndefined();
    expect(found?.candidateBeingId).toBe("paola");
  });

  it("manda il token, o un servizio interno si fiderebbe della rete", async () => {
    const spy = reply({ being_id: null, confidence: 0 });
    await client(spy).byVoice("AAAA");

    const [, init] = (spy as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
  });

  it("non è nessuno quando il servizio rifiuta", async () => {
    expect(await client(reply({}, false)).byVoice("AAAA")).toBeUndefined();
  });

  it("non è nessuno quando il servizio risponde una cosa che non capiamo", async () => {
    // uno schema sbagliato è un servizio sbagliato: meglio non sapere chi è
    // che passare a valle un `beingId` che non è un id
    expect(await client(reply({ being_id: 42 })).byVoice("AAAA")).toBeUndefined();
  });

  it("non fa cadere la conversazione quando il servizio è spento", async () => {
    const dead = vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;

    await expect(client(dead).byVoice("AAAA")).resolves.toBeUndefined();
  });

  it("rinuncia invece di far aspettare: in ritardo non è una risposta", async () => {
    const slow = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    ) as unknown as typeof fetch;

    await expect(client(slow, 20).byVoice("AAAA")).resolves.toBeUndefined();
  });
});
