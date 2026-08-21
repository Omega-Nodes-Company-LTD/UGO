import { describe, expect, it } from "vitest";
import { ATTENTION_MS, AddressGate, MAX_UNNAMED_TURNS, mentionsName } from "./addressGate.js";

/** ADR-111. Puro: frasi dentro, verdetti fuori, niente microfono e niente orologio vero. */

describe("il nome nella frase", () => {
  it("vale ovunque stia, comunque sia scritto", () => {
    for (const phrase of [
      "Ciao Silvio",
      "Ehi Silvio!",
      "silvio, che ne pensi?",
      "che ne dici tu, SILVIO?",
      "Sìlvio vieni qui",
    ]) {
      expect(mentionsName(phrase, "Silvio"), phrase).toBe(true);
    }
  });

  it("perdona la lettera che whisper storpia, sui nomi lunghi", () => {
    expect(mentionsName("ciao silvia", "Silvio")).toBe(true);
    expect(mentionsName("ehi sylvio", "Silvio")).toBe(true);
    expect(mentionsName("ciao silvios", "Silvio")).toBe(true);
    // due lettere non sono più una storpiatura: sono un altro nome
    expect(mentionsName("ciao sylvia", "Silvio")).toBe(false);
  });

  it("i nomi corti si pretendono esatti", () => {
    expect(mentionsName("ciao ugo", "Ugo")).toBe(true);
    expect(mentionsName("ciao ago", "Ugo")).toBe(false);
    // un nome di due lettere non apre il cancello a mezza stanza
    expect(mentionsName("bo che dici", "Bo")).toBe(true);
    expect(mentionsName("boh che dici", "Bo")).toBe(false);
  });

  it("una frase qualsiasi non lo nomina", () => {
    expect(mentionsName("che ore sono?", "Silvio")).toBe(false);
    expect(mentionsName("passami il sale per favore", "Silvio")).toBe(false);
  });
});

describe("il cancello", () => {
  const names = ["Silvio"];

  it("chiuso, una frase senza nome è origliata", () => {
    const gate = new AddressGate(() => names);
    expect(gate.judge("che tempo fa domani?", 0)).toBe("overheard");
  });

  it("il nome apre, e la conversazione prosegue senza ripeterlo", () => {
    const gate = new AddressGate(() => names);
    expect(gate.judge("ehi Silvio, ci sei?", 0)).toBe("addressed");
    expect(gate.judge("che tempo fa domani?", 10_000)).toBe("conversing");
  });

  it("la finestra scade: dopo un minuto di silenzio serve di nuovo il nome", () => {
    const gate = new AddressGate(() => names);
    gate.judge("ciao Silvio", 0);
    expect(gate.judge("mi passi il sale?", ATTENTION_MS + 1)).toBe("overheard");
    expect(gate.judge("Silvio, dicevo a te", ATTENTION_MS + 2)).toBe("addressed");
  });

  it("la sua voce tiene viva la conversazione", () => {
    const gate = new AddressGate(() => names);
    gate.judge("ciao Silvio", 0);
    gate.spoke(50_000);
    // 100 s dal nome, ma solo 50 dalla sua risposta: si sta ancora parlando
    expect(gate.judge("e poi cos'è successo?", 100_000)).toBe("conversing");
  });

  it("il tetto chiude: una conversazione altrui non lo tiene sveglio per sempre", () => {
    const gate = new AddressGate(() => names);
    let at = 0;
    gate.judge("ciao Silvio", at);
    for (let turn = 0; turn < MAX_UNNAMED_TURNS; turn += 1) {
      at += 5_000;
      expect(gate.judge("una frase detta a qualcun altro", at)).toBe("conversing");
      gate.sent(at);
      // la sua risposta rinnova la finestra ma NON il contatore: è il punto
      gate.spoke(at + 1_000);
    }
    expect(gate.judge("un'altra frase ancora", at + 5_000)).toBe("overheard");
    // il nome riapre e azzera
    expect(gate.judge("Silvio, torniamo a noi", at + 6_000)).toBe("addressed");
    expect(gate.judge("allora, che dicevi?", at + 7_000)).toBe("conversing");
  });

  it("con più abitanti basta nominarne uno", () => {
    const gate = new AddressGate(() => ["Silvio", "Gedeone"]);
    expect(gate.judge("Gedeone, vieni qui", 0)).toBe("addressed");
  });

  it("senza nomi non filtra: il mondo di prima", () => {
    const gate = new AddressGate(() => []);
    expect(gate.judge("una frase qualunque", 0)).toBe("conversing");
    const blank = new AddressGate(() => ["  "]);
    expect(blank.judge("una frase qualunque", 0)).toBe("conversing");
  });
});
