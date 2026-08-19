import { describe, expect, it } from "vitest";
import { asksForAVerdict } from "./reporting.js";

/**
 * ADR-108. Il riconoscimento sbaglia da una parte sola: un falso positivo fa
 * entrare i ricordi in una domanda qualunque (il comportamento pre-ADR-107),
 * un falso negativo può far zittire un'allergia. Le prove sono scritte per
 * presidiare quell'asimmetria, non per inseguire la precisione.
 */
describe("asksForAVerdict: la domanda che nessun appunto può chiudere", () => {
  it("riconosce il modale, accenti compresi", () => {
    for (const question of [
      "Sofia può mangiare i gamberi?",
      "Sofia puo mangiare i gamberi?",
      "posso dare le noci a Sofia?",
      "potrebbe prendere l'aereo con quel raffreddore?",
      "i bambini possono restare da soli?",
    ]) {
      expect(asksForAVerdict(question), question).toBe(true);
    }
  });

  it("riconosce la domanda sul merito, che è la stessa domanda con altre parole", () => {
    for (const question of [
      "è sicuro dargli questa medicina?",
      "fa male bere il caffè a quest'ora?",
      "a cosa è allergica Sofia?",
      "rischia qualcosa se mangia il pesce?",
    ]) {
      expect(asksForAVerdict(question), question).toBe(true);
    }
  });

  it("lascia stare le domande che un ricordo chiude davvero", () => {
    for (const question of [
      "come si chiama il gatto?",
      "quando è il compleanno della nonna?",
      "dove lavora Ivan?",
      "qual è la targa della macchina?",
    ]) {
      expect(asksForAVerdict(question), question).toBe(false);
    }
  });

  /** «Come posso …» chiede istruzioni, non un verdetto su una persona. */
  it("non scambia una richiesta di istruzioni per un verdetto", () => {
    expect(asksForAVerdict("come posso arrivare in stazione?")).toBe(false);
    expect(asksForAVerdict("Come posso spegnere la caldaia?")).toBe(false);
  });
});
