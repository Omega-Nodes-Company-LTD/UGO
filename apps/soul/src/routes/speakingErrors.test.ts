import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerSpeakingErrors, speakError, speakingDetail, speakingTitle } from "./speakingErrors.js";

describe("gli errori parlano", () => {
  it("traduce le frasi fisse e sostituisce l'inglese con cosa fare", () => {
    expect(speakingDetail(400, "invalid body")).toContain("controlla i campi");
    expect(speakingDetail(404, "Not Found")).toContain("Ricarica la pagina");
    expect(speakingDetail(404, "House not found")).toBe("Questa casa non esiste, o il tuo accesso non la vede.");
  });

  it("completa una frase corta e vaga, lascia stare una che spiega già", () => {
    expect(speakingDetail(404, "pratica non trovata")).toBe(
      "Pratica non trovata. Non l'ho trovato: forse è stato cancellato o il link è vecchio. Ricarica la pagina.",
    );
    expect(speakingDetail(429, "per oggi basta inviti: cinque al giorno")).toBe("Per oggi basta inviti: cinque al giorno");
  });

  it("tiene i titoli italiani, cambia quelli inglesi", () => {
    expect(speakingTitle(409, "Nessuna testa per pensare")).toBe("Nessuna testa per pensare");
    expect(speakingTitle(401, "Unauthorized")).toBe("Serve l'accesso");
    expect(speakingTitle(418, undefined)).toBe("Richiesta non riuscita");
    // una frase messa nel titolo da una rotta: diventa spiegazione, e il titolo torna un titolo
    expect(speakingTitle(400, "cosa, di che tipo, e quale gosino?")).toBe("Richiesta non valida");
  });

  it("ogni rotta, anche quella che risponde «invalid body», esce parlante; `error` resta", async () => {
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, request, reply) => speakError(error, request, reply));
    registerSpeakingErrors(app);
    app.post("/v1/vecchia", (_req, reply) => reply.code(400).send({ error: "invalid body" }));
    app.get("/v1/rotta", () => {
      throw new Error("SELECT * FROM segreti");
    });
    app.post("/v1/json", () => ({ ok: true }));

    const old = await app.inject({ method: "POST", url: "/v1/vecchia" });
    expect(old.json()).toMatchObject({ error: "invalid body", title: "Richiesta non valida", status: 400 });
    expect(old.json<{ detail: string }>().detail).toContain("controlla i campi");

    const crash = await app.inject({ method: "GET", url: "/v1/rotta" });
    expect(crash.statusCode).toBe(500);
    expect(crash.body).not.toContain("segreti");
    expect(crash.json<{ detail: string }>().detail).toMatch(/Riprova fra poco.*\(rif\. req-/u);
    // una volta sola: il gestore e l'onSend passano entrambi dal formattatore
    expect(crash.json<{ detail: string }>().detail.match(/rif\./gu)).toHaveLength(1);

    const broken = await app.inject({
      method: "POST",
      url: "/v1/json",
      headers: { "content-type": "application/json" },
      payload: "{non è json",
    });
    expect(broken.json<{ detail: string }>().detail).toContain("non è un JSON valido");

    const missing = await app.inject({ method: "GET", url: "/v1/non-esiste" });
    expect(missing.json<{ detail: string }>().detail).toContain("non esiste su questo server");
    await app.close();
  });
});
