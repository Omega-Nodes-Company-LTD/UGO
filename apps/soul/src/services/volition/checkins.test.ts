import { describe, expect, it } from "vitest";
import { confirmCheckin, parseCheckin, tellCheckins } from "./checkins.js";

/**
 * Il check-in (ADR-085) — puro, per esempi.
 *
 * La differenza che questo parser deve tenere in piedi è una sola, e non è
 * grammaticale: un promemoria è **tuo** e succede una volta, un check-in è
 * **suo** e torna. «Ricordami di chiamare la banca» è roba tua che lui
 * custodisce; «ogni sera chiedimi com'è andata» è una cosa che da domani
 * vorrà sapere lui, tutti i giorni, senza che gliela si ridica.
 */

describe("mettere un check-in", () => {
  it("legge l'ora, il giorno e la domanda", () => {
    const command = parseCheckin("ogni giorno alle 21 chiedimi com'è andata la giornata");
    expect(command).toEqual({
      action: "set",
      hour: 21,
      minute: 0,
      weekday: undefined,
      question: "com'è andata la giornata",
    });
  });

  it("«ogni sera alle nove» — l'ora si dice anche a lettere", () => {
    const command = parseCheckin("ogni sera alle nove chiedimi come sto");
    expect(command).toMatchObject({ action: "set", hour: 21, minute: 0 });
  });

  it("«e mezza» sono trenta minuti, non zero", () => {
    expect(parseCheckin("tutti i giorni alle 7 e mezza chiedimi se ho dormito")).toMatchObject({
      hour: 7,
      minute: 30,
    });
  });

  it("un giorno della settimana lo tiene: «ogni lunedì» non è «ogni giorno»", () => {
    expect(parseCheckin("ogni lunedì alle 9 chiedimi cosa devo fare questa settimana")).toMatchObject(
      { weekday: 1, hour: 9 },
    );
    expect(parseCheckin("ogni domenica alle 10 chiedimi come va")).toMatchObject({ weekday: 0 });
  });

  it("«ogni mattina» senza ora non si inventa: fallisce chiuso", () => {
    expect(parseCheckin("ogni mattina chiedimi come sto")).toBeUndefined();
  });

  it("senza «ogni» è un'altra cosa, e non la tocca", () => {
    // questa è una domanda, non un appuntamento: se la prendesse, da domani
    // la rifarebbe tutti i giorni senza che nessuno l'abbia chiesto
    expect(parseCheckin("chiedimi come sto")).toBeUndefined();
  });

  it("non ruba il promemoria: quello ha una cosa da ricordare, e succede una volta", () => {
    expect(parseCheckin("ricordami di chiamare la banca alle 15")).toBeUndefined();
  });

  it("non ruba la sveglia", () => {
    expect(parseCheckin("svegliami alle 7")).toBeUndefined();
  });

  it("una domanda vuota non è una domanda", () => {
    expect(parseCheckin("ogni giorno alle 21 chiedimi")).toBeUndefined();
  });

  it("la domanda si taglia dove finisce: niente code di frase", () => {
    const command = parseCheckin("ogni giorno alle 8 chiedimi se ho preso le medicine, mi raccomando");
    expect(command).toMatchObject({ question: "se ho preso le medicine" });
  });
});

describe("spegnere e chiedere", () => {
  it("«non chiedermelo più» spegne", () => {
    expect(parseCheckin("non chiedermelo più")).toEqual({ action: "cancel" });
    expect(parseCheckin("smettila di chiedermelo")).toEqual({ action: "cancel" });
  });

  it("«cosa mi chiedi?» è una domanda sulle domande", () => {
    expect(parseCheckin("cosa mi chiedi ogni giorno?")).toEqual({ action: "list" });
    expect(parseCheckin("che domande mi fai?")).toEqual({ action: "list" });
  });
});

describe("le parole della risposta", () => {
  it("la conferma ripete l'appuntamento, perché chi ascolta possa smentirlo", () => {
    const said = confirmCheckin({
      action: "set",
      hour: 21,
      minute: 0,
      weekday: undefined,
      question: "com'è andata",
    });
    expect(said).toContain("21:00");
    expect(said).toContain("ogni giorno");
    expect(said).toContain("com'è andata");
  });

  it("col giorno lo dice: «ogni lunedì», non «ogni giorno»", () => {
    const said = confirmCheckin({
      action: "set",
      hour: 9,
      minute: 30,
      weekday: 1,
      question: "come va",
    });
    expect(said).toContain("ogni lunedì");
    expect(said).toContain("9:30");
  });

  it("nessuna domanda in piedi si dice, e non si tace", () => {
    expect(tellCheckins([])).toContain("Non ti chiedo niente");
  });

  it("l'elenco le dice tutte, con la loro ora", () => {
    const said = tellCheckins([
      { question: "com'è andata", hour: 21, minute: 0, weekday: null },
      { question: "se hai dormito", hour: 7, minute: 30, weekday: 1 },
    ]);
    expect(said).toContain("com'è andata");
    expect(said).toContain("21:00");
    expect(said).toContain("lunedì");
  });
});
