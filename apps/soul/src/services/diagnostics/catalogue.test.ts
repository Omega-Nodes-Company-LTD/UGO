import { describe, expect, it } from "vitest";
import { dreamReading, facultyLine } from "./readings.js";

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

/**
 * Lo stato che non aveva un numero, ed è costato due giorni.
 *
 * Arruolare una voce non crea l'impronta: deposita un clip e scrive una
 * richiesta, e l'impronta la costruisce il sogno. Il chiosco e il pannello lo
 * dicono («stanotte imparo la tua voce»), ma **una frase detta una volta non
 * è uno stato**: il giorno dopo non c'era nessun posto dove leggere se quella
 * richiesta fosse stata lavorata, restasse in coda, o non fosse mai arrivata.
 */
describe("il sogno, e cosa lo sta aspettando", () => {
  const hoursAgo = (h: number): Date => new Date(Date.now() - h * 3_600_000);

  it("con la coda vuota è un sogno recente e basta", async () => {
    const reading = await dreamReading(() => Promise.resolve(hoursAgo(8)), () => Promise.resolve(0));
    expect(reading.state).toBeUndefined();
    expect(reading.detail).toContain("8 ore fa");
    expect(reading.detail).not.toContain("attesa");
    expect(reading.hint).toBeUndefined();
  });

  it("una voce in attesa è mezzo servizio, e dice cosa fare", async () => {
    const reading = await dreamReading(() => Promise.resolve(hoursAgo(2)), () => Promise.resolve(1));
    expect(reading.state).toBe("partial");
    expect(reading.detail).toContain("✗ 1 voce in attesa");
    expect(reading.hint).toContain("Fallo sognare");
  });

  it("il plurale è al plurale: si legge, non si decodifica", async () => {
    const reading = await dreamReading(() => Promise.resolve(hoursAgo(2)), () => Promise.resolve(3));
    expect(reading.detail).toContain("✗ 3 voci in attesa");
  });

  /** Un sogno vecchio è il guasto più grosso: non deve essere mascherato dalla coda. */
  it("un sogno vecchio resta «lento» anche con voci in coda", async () => {
    const reading = await dreamReading(() => Promise.resolve(hoursAgo(72)), () => Promise.resolve(2));
    expect(reading.state).toBe("slow");
    expect(reading.detail).toContain("✗ 2 voci in attesa");
  });

  it("senza aver mai sognato lo dice, e dice pure chi sta aspettando", async () => {
    const reading = await dreamReading(() => Promise.resolve(null), () => Promise.resolve(1));
    expect(reading.reached).toBe(false);
    expect(reading.detail).toContain("non ha ancora sognato");
    expect(reading.detail).toContain("✗ 1 voce in attesa");
  });

  it("un'installazione che non sa contare la coda funziona come prima", async () => {
    const reading = await dreamReading(() => Promise.resolve(hoursAgo(3)), undefined);
    expect(reading.detail).toBe("ultimo sogno 3 ore fa");
    expect(reading.hint).toBeUndefined();
  });
});
