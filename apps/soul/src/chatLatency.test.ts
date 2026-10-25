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
const ENV = readFileSync(join(import.meta.dirname, "config", "env.ts"), "utf8");
const CHAIN = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "packages", "memory", "src", "chatChain.ts"),
  "utf8",
);

/**
 * Il tetto dichiarato, e il perché di questo numero: venti secondi sono già
 * molti per chi ha appena finito di parlare, e sono il massimo che si accetta
 * di spendere quando ogni anello va storto. La configurazione normale sta
 * molto sotto — un solo anello esterno risponde in un paio di secondi.
 */
const BUDGET_MS = 20_000;
/** quanto si concede al provider finale, che è l'unico che risponde sempre */
const PROVIDER_ALLOWANCE_MS = 5_000;

/** Il numero scritto dopo `nome = ` o `nome: … .default(` nel sorgente. */
const numberAfter = (source: string, pattern: RegExp): number => {
  const found = pattern.exec(source);
  if (found?.[1] === undefined) throw new Error(`non trovato nel sorgente: ${pattern.source}`);
  return Number(found[1].replace(/_/gu, ""));
};

describe("il budget di silenzio di una risposta", () => {
  it("il giudice ha un guinzaglio corto, e un client suo", () => {
    const judge = numberAfter(SOUL, /const JUDGE_TIMEOUT_MS = ([\d_]+);/u);
    expect(judge).toBeLessThanOrEqual(3_000);
    // e arriva davvero al giudice: `local` resta quello da 45s per il sogno,
    // l'iniziativa e il cantastorie, dove nessuno sta aspettando
    expect(SOUL).toMatch(/const judgeText = new OllamaTextClient\(/u);
    expect(SOUL).toMatch(/judge: judgeText,/u);
  });

  it("un anello intermedio non tiene la parola più di dodici secondi", () => {
    const fromEnv = numberAfter(
      ENV,
      /UGO_CHAT_LINK_TIMEOUT_MS:[\s\S]{0,200}?\.default\(([\d_]+)\)/u,
    );
    const fromChain = numberAfter(CHAIN, /const DEFAULT_TIMEOUT_MS = ([\d_]+);/u);
    expect(fromEnv).toBeLessThanOrEqual(12_000);
    // anche la catena montata senza un tetto esplicito: il default del codice
    // è l'altra metà della stessa promessa
    expect(fromChain).toBeLessThanOrEqual(12_000);
  });

  it("la somma di quello che aspetta, nella configurazione che spediamo, sta nel budget", () => {
    const judge = numberAfter(SOUL, /const JUDGE_TIMEOUT_MS = ([\d_]+);/u);
    const link = numberAfter(ENV, /UGO_CHAT_LINK_TIMEOUT_MS:[\s\S]{0,200}?\.default\(([\d_]+)\)/u);
    // ── quanti anelli intermedi ci sono DAVVERO sulla strada ──────────────
    // di serie uno solo: la voce di casa è spenta (sotto), quindi resta
    // OpenRouter. Accenderla ne aggiunge uno, e il conto lo dice qui invece
    // di scoprirlo sul campo.
    const worstShipped = judge + link + PROVIDER_ALLOWANCE_MS;
    expect(worstShipped).toBeLessThanOrEqual(BUDGET_MS);
    // e con la voce di casa accesa — il giorno del nodo GPU — il conto deve
    // restare in piedi: due anelli, non tre
    expect(judge + link * 2 + PROVIDER_ALLOWANCE_MS).toBeLessThanOrEqual(BUDGET_MS + link);
  });

  it("la voce di casa resta spenta finché non la si accende a mano", () => {
    expect(ENV).toMatch(
      /UGO_CHAT_HOME_VOICE:[\s\S]{0,200}?z\.enum\(\["on", "off"\]\)\.default\("off"\)/u,
    );
    // e il nome vecchio non si ignora in silenzio: chi l'aveva a `on` deve
    // sapere che il mondo è cambiato, non dedurlo dai secondi
    expect(ENV).toMatch(/UGO_CHAT_LOCAL_FIRST non esiste più/u);
  });

  it("fuori parla prima di casa: è l'ordine, e sta in una riga sola", () => {
    expect(CHAIN).toMatch(
      /const answer = \(await this\.tryOpenRouter\(request\)\) \?\?\s*\(await this\.tryOllama\(request\)\);/u,
    );
  });
});
