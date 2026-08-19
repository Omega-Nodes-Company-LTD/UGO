import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR-110: il nodo con la scheda video, e cosa ci va sopra.
 *
 * La decisione non è «una macchina più veloce», è **quali modelli possono
 * dipendere da una seconda macchina**. Vision, testo locale e l'anello Ollama
 * della catena sì: tutti e tre degradano da soli quando il modello non
 * risponde, e su una GPU diventano possibili invece che lenti. Gli embedding
 * no, e questa è la riga che vale l'intera ADR: `OllamaEmbeddingsClient.embed()`
 * è **l'unico client locale che lancia invece di degradare**, e metterlo su
 * un'altra macchina introdurrebbe una dipendenza dura che oggi nessun
 * componente di questo sistema ha.
 *
 * È strutturale come `albumGate.test.ts`, e per la stessa ragione: il giorno
 * in cui qualcuno «uniforma» i client all'unica URL nuova, questa scelta
 * sparisce in una diff di tre caratteri e non se ne accorge nessuno finché il
 * ricordo di una casa non si scrive perché la tailnet è giù.
 */

const INDEX = readFileSync(join(import.meta.dirname, "index.ts"), "utf8");

describe("il nodo GPU", () => {
  it("senza OLLAMA_GPU_URL è la macchina di casa, e non cambia niente", () => {
    expect(INDEX).toMatch(/const gpuUrl = env\.OLLAMA_GPU_URL \?\? env\.OLLAMA_URL;/u);
  });

  it("non ci porta MAI gli embedding: l'unico client che lancia resta a casa", () => {
    const built = [...INDEX.matchAll(/new OllamaEmbeddingsClient\(\s*([\w.]+)\s*,/gu)].map(
      (match) => match[1],
    );
    // se un giorno l'embedder si costruisse in un posto solo, benissimo — ma
    // qui deve restare vero che nessuno di quei posti punta al nodo GPU
    expect(built.length).toBeGreaterThan(0);
    expect([...new Set(built)]).toEqual(["env.OLLAMA_URL"]);
  });

  it("ci porta le tre cose che una GPU rende possibili, e solo quelle", () => {
    // il modello vision: uno sguardo diventa una frase
    expect(INDEX).toMatch(/new OllamaVisionClient\(\s*gpuUrl/u);
    // il testo locale: la finestra sul mondo e l'iniziativa (ADR-027/063)
    expect([...INDEX.matchAll(/new OllamaTextClient\(\s*gpuUrl/gu)]).toHaveLength(2);
    // e l'anello di casa della catena di chat (ADR-095)
    expect(INDEX).toMatch(/local: \{ baseUrl: gpuUrl/u);
    // nessun altro client locale ci finisce per distrazione
    const onGpu = [...INDEX.matchAll(/new (\w+)\(\s*gpuUrl/gu)].map((match) => match[1]);
    expect([...new Set(onGpu)].sort()).toEqual(["OllamaTextClient", "OllamaVisionClient"]);
  });
});
