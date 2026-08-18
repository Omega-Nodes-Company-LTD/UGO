import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `memories.text` si scrive in chiaro (ADR-022, riaperto e confermato da
 * ADR-091).
 *
 * È una regola che vive in due ADR, e gli ADR non fermano nessuno: tre
 * scrittori l'hanno contraddetta in tre momenti diversi, ognuno con una buona
 * intenzione, e hanno prodotto cinque difetti — righe che non si ripescano,
 * ciphertext dentro il prompt, la redazione dell'oblio che non mordeva, la
 * doppia cifratura fra generazioni e un lascito che usciva vuoto.
 *
 * Da qui in poi quella buona intenzione diventa un test rosso.
 */

const SERVICES = join(import.meta.dirname, "..");

function sources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sources(path));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) found.push(path);
  }
  return found;
}

/**
 * Cerca un `text:` cifrato **dentro** la scrittura su `memories`, non nei
 * dintorni.
 *
 * Due tentativi buttati prima di questo, e vale la pena scriverli. Con una
 * finestra di 400 caratteri il guardiano **non mordeva**, perché fra la
 * tabella e il campo ci stava il commento che spiega la regola: una guardia
 * che un commento disarma è peggio di nessuna guardia, perché dà la
 * sensazione di essere coperti. Allargata a 2000 mordeva anche
 * `meetingsService`, che scrive il testo in chiaro e cifra dell'altro poco
 * più in là: e una guardia che grida al lupo si impara a ignorarla.
 *
 * Quindi si ritaglia l'oggetto scritto — da `insert(memories)` fino alla sua
 * chiusura — e si guarda solo lì dentro.
 */
function encryptsAMemory(source: string): boolean {
  const opens = /(?:insert|update)\(\s*memories\s*\)/gu;
  for (const match of source.matchAll(opens)) {
    const rest = source.slice(match.index);
    const close = rest.indexOf("});");
    const written = close === -1 ? rest.slice(0, 2000) : rest.slice(0, close);
    if (/^\s*text:\s*[^,\n]*encryptText\s*\(/mu.test(written)) return true;
  }
  return false;
}

describe("i ricordi si scrivono in chiaro", () => {
  const files = sources(SERVICES);

  it("legge davvero i sorgenti: se la lettura si rompe, il test non passa a vuoto", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((path) => path.endsWith("farewellService.ts"))).toBe(true);
  });

  for (const path of files) {
    it(`${path.split("/").slice(-2).join("/")} non cifra un ricordo`, () => {
      const source = readFileSync(path, "utf8");
      expect(
        encryptsAMemory(source),
        "Scrivere `memories.text` cifrato rompe cinque cose insieme (ADR-091): la riga non si ripesca, l'oblio non redige il nome che c'è dentro, il lascito la cifra una seconda volta e chi eredita non la legge. Se serve davvero, si riapre ADR-022 con un ADR nuovo.",
      ).toBe(false);
    });
  }
});
