import { describe, expect, it } from "vitest";
import { facultyLine } from "./catalogue.js";

/**
 * I quattro mestieri di percezione, letti invece che buttati.
 *
 * Il difetto che questo file chiude è costato un pomeriggio: il container
 * risponde `200`, la sonda leggeva il `200`, e la riga diceva «risponde» a
 * dieci millisecondi mentre whisper era morto dentro. Il corpo intanto
 * scriveva «⚠ whisper non risponde» — due pagine, tutte e due verdi, e il
 * guasto in mezzo.
 */
describe("cosa sa fare davvero la percezione", () => {
  it("dice mestiere per mestiere, non un sì complessivo", () => {
    const line = facultyLine({ ok: true, voice: true, face: true, stt: false, tts: true, ocr: true });
    expect(line).toBe("voce ✓ · volto ✓ · dettatura ✗ · Piper ✓ · OCR ✓");
  });

  it("tutto caricato non porta nessuna croce", () => {
    const line = facultyLine({ ok: true, voice: true, face: true, stt: true, tts: true, ocr: true });
    expect(line).not.toContain("✗");
  });

  /** È la croce che fa scattare «a metà servizio»: se sparisse, tornerebbe la bugia. */
  it("un mestiere mancante lascia una croce da trovare", () => {
    expect(facultyLine({ ok: true, voice: true, face: true, stt: false, tts: true, ocr: true }))
      .toContain("✗");
  });

  it("una chiave assente vale quanto una falsa: non si presume acceso", () => {
    // un percezione più vecchio non dichiara `ocr`, e presumerlo vivo sarebbe
    // esattamente il modo in cui questa pagina ricomincia a mentire
    expect(facultyLine({ ok: true, voice: true, face: true, stt: true, tts: true })).toContain(
      "OCR ✗",
    );
  });

  it("un corpo che non è un oggetto non diventa una riga inventata", () => {
    expect(facultyLine(null)).toBeUndefined();
    expect(facultyLine("ok")).toBeUndefined();
  });
});
