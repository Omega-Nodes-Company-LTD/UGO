import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderGuidePdf, toWinAnsi } from "./guidePdf.js";

/**
 * Il testo mostrato dal PDF, dai byte: gli stream sono Flate e pdfkit
 * disegna con stringhe esadecimali (`<5469...> TJ`). Si deflano gli stream
 * e si decodificano i run hex — la compressione in produzione resta accesa.
 */
function shownText(pdf: Buffer): string {
  const pieces: string[] = [];
  const raw = pdf.toString("latin1");
  const pattern = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end === -1) continue;
    try {
      pieces.push(inflateSync(pdf.subarray(start, end)).toString("latin1"));
    } catch {
      // stream non compresso o non testuale: non è quello che cerchiamo
    }
  }
  return [...pieces.join("\n").matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((run) => Buffer.from(run[1] ?? "", "hex").toString("latin1"))
    .join("");
}

/**
 * Unit puri (regola 1): il renderer non tocca rete né disco. Il PDF si
 * verifica dai byte — magic number e metadati — non aprendolo a occhio.
 */

describe("toWinAnsi", () => {
  it("translitera i glifi tipografici che il font standard non ha", () => {
    expect(toWinAnsi("Impostazioni → “Titolo” — poi ‘Salva’…")).toBe(
      "Impostazioni -> \"Titolo\" - poi 'Salva'...",
    );
  });

  it("tiene l'italiano intero e butta le emoji senza lasciare tofu", () => {
    expect(toWinAnsi("Città, però: è già lì 🐷")).toBe("Città, però: è già lì");
  });
});

describe("renderGuidePdf", () => {
  it("produce un PDF vero, con la prima riga come titolo nei metadati", async () => {
    const pdf = await renderGuidePdf({
      text:
        "Impostare il titolo nell'app X\n" +
        "1. Apri Impostazioni.\n" +
        "2. Scrivi il titolo → premi Salva.\n" +
        "Se qualcosa non torna: ricarica la pagina.",
      customerName: "Rossi SRL",
      at: new Date("2026-08-17T12:00:00Z"),
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // il titolo sta nei metadati (Info), in chiaro
    expect(pdf.toString("latin1")).toContain("Impostare il titolo nell'app X");
    // il corpo sta negli stream compressi: il piè di pagina porta il nome
    // del cliente e la data, mai un id — e la freccia è già traslitterata
    const text = shownText(pdf);
    expect(text).toContain("Rossi SRL");
    expect(text).toContain("2026-08-17");
    expect(text).toContain("premi Salva");
    expect(text).toContain("->");
    expect(text).not.toContain("→");
  });

  it("un testo senza corpo resta un PDF valido col solo titolo", async () => {
    const pdf = await renderGuidePdf({ text: "Solo un titolo", customerName: "x" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
