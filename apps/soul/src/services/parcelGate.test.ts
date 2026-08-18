import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR-092 §3: «l'unico scrittore degli invii è la rotta dell'atto».
 *
 * Una cartolina parte SOLO da un'azione esplicita di una persona: la rotta
 * `POST /v1/parcels` e il gesto «manda a …» in chat. Il giorno in cui
 * l'iniziativa, il sogno o un job decidessero di «condividere» qualcosa con
 * la casa dei parenti — con le migliori intenzioni — questo test diventa
 * rosso. È la famiglia di guardie di ADR-091 e della regola 13: la promessa
 * vive in un documento, il documento non ferma nessuno, il test sì.
 */

const ROOT = join(import.meta.dirname, "..");

/** Chi ha il diritto di imbucare: la rotta e il gesto, più chi li cabla. */
const ALLOWED = new Set([
  "routes/ties.ts",
  "services/chatService.ts",
  "services/parcelService.ts",
]);

/** E chi può soltanto COSTRUIRE il servizio per passarlo alla chat. */
const MAY_CONSTRUCT = new Set([...ALLOWED, "index.ts", "services/pack/runtimes.ts"]);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sources(path));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const relative = (path: string): string => path.slice(ROOT.length + 1);

describe("la cartolina parte solo dall'atto esplicito", () => {
  /**
   * La lezione di ADR-091 sulle guardie: cercare `parcels.send(` è una
   * guardia che un rinomino di variabile disarma senza un errore. Quella che
   * morde è strutturale: per spedire DEVI avere il servizio in mano, e per
   * averlo in mano devi nominarlo — importarlo o costruirlo. Fuori dai file
   * autorizzati, nominarlo è già l'infrazione. (Un `insert` diretto su
   * `parcels` fuori dal servizio lo ferma comunque il database: la tabella è
   * a scrittura ristretta per policy e GRANT, migrazione 0049.)
   */
  it("fuori da rotta, gesto e cablaggio nessuno nomina la posta", () => {
    const offenders = sources(ROOT).filter((path) => {
      if (MAY_CONSTRUCT.has(relative(path))) return false;
      const code = readFileSync(path, "utf8");
      return /ParcelService|parcelService\.js/u.test(code);
    });
    expect(offenders.map(relative)).toEqual([]);
  });

  it("e chi può solo cablarla non la spedisce", () => {
    for (const path of [...MAY_CONSTRUCT].filter((file) => !ALLOWED.has(file))) {
      const code = readFileSync(join(ROOT, path), "utf8");
      expect(/\.\s*send\s*\(/u.test(code), `${path} non deve spedire`).toBe(false);
    }
  });

  it("e la rotta col gesto esistono davvero: una guardia su niente non guarda niente", () => {
    const route = readFileSync(join(ROOT, "routes", "ties.ts"), "utf8");
    const chat = readFileSync(join(ROOT, "services", "chatService.ts"), "utf8");
    expect(route.includes('.send(')).toBe(true);
    expect(chat.includes('parsePostcard')).toBe(true);
  });
});
