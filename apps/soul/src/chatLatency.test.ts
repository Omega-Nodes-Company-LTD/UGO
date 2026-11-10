import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR-124: il budget di silenzio, cioè quanto può durare l'attesa di UNA
 * risposta.
 *
 * Questa guardia nasce da un guasto arrivato dal campo e non da un test:
 * «non parla, non sento nulla per interi minuti». Non c'era un bug da nessuna
 * parte — c'erano due attese, scritte in due file diversi da due persone che
 * non si parlavano, **in sequenza sulla strada della stessa risposta**:
 *
 *   - il giudice dell'astensione (ADR-107) sul modello di casa, col client
 *     condiviso che nasce con 45 secondi di pazienza;
 *   - l'anello di casa della catena (ADR-095), con i suoi 30.
 *
 * Settantacinque secondi per frase, e `ChatChain.queue` serializza: tre frasi
 * di fila facevano minuti. Ogni numero, da solo, era difendibile. Nessun test
 * li sommava, e nessuno li avrebbe sommati mai — è il genere di guasto che non
 * vive in un file ma **fra** due file, come la giunzione di ADR-045.
 *
 * Qui si somma. È strutturale come `gpuNode.test.ts` e `adrNumbers.test.ts`:
 * non prova una funzione, tiene vera una proprietà che nessuna funzione possiede.
 */

const SOUL = readFileSync(join(import.meta.dirname, "index.ts"), "utf8");
const LLM = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "packages", "memory", "src", "llmClient.ts"),
  "utf8",
);

/**
 * Il tetto dichiarato, e il perché di questo numero: venti secondi sono già
 * molti per chi ha appena finito di parlare. ADR-131: la catena non c'è più —
 * sulla strada di una risposta restano il giudice e OpenRouter, in sequenza.
 */
const BUDGET_MS = 20_000;
/** quanto si concede alla risposta vera, che è l'unica che non può mancare */
const PROVIDER_ALLOWANCE_MS = 5_000;

/** Il numero scritto dopo `nome = ` nel sorgente. */
const numberAfter = (source: string, pattern: RegExp): number => {
  const found = pattern.exec(source);
  if (found?.[1] === undefined) throw new Error(`non trovato nel sorgente: ${pattern.source}`);
  return Number(found[1].replace(/_/gu, ""));
};

describe("il budget di silenzio di una risposta", () => {
  it("il giudice ha un guinzaglio corto, e un client suo", () => {
    const judge = numberAfter(SOUL, /const JUDGE_TIMEOUT_MS = ([\d_]+);/u);
    expect(judge).toBeLessThanOrEqual(3_000);
    // e arriva davvero al giudice: il client condiviso resta col default lungo
    // per chi non sta aspettando (cantastorie, consiglio, iniziativa)
    expect(SOUL).toMatch(/const judgeText = textFor\(JUDGE_TIMEOUT_MS\);/u);
    expect(SOUL).toMatch(/judge: judgeText,/u);
  });

  it("la somma di quello che aspetta sta nel budget", () => {
    const judge = numberAfter(SOUL, /const JUDGE_TIMEOUT_MS = ([\d_]+);/u);
    expect(judge + PROVIDER_ALLOWANCE_MS).toBeLessThanOrEqual(BUDGET_MS);
  });

  it("il timeout passato a un client arriva davvero alla chiamata (ADR-131)", () => {
    // senza questa riga il giudice terrebbe i 60 secondi di default
    expect(LLM).toMatch(/signal: AbortSignal\.timeout\(this\.options\.timeoutMs \?\? 60_000\)/u);
    expect(SOUL).toMatch(/\.\.\.\(timeoutMs !== undefined && \{ timeoutMs \}\)/u);
  });

  it("il nome vecchio della catena non si ignora in silenzio", () => {
    const env = readFileSync(join(import.meta.dirname, "config", "env.ts"), "utf8");
    expect(env).toMatch(/UGO_CHAT_LOCAL_FIRST non esiste più/u);
  });
});
