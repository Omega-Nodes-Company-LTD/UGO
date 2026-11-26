import { describe, expect, it } from "vitest";
import { buildDynamicSystem } from "./chatService.js";
import { characterFrom } from "./council/character.js";
import { FIRST_EXCHANGE_RULE, makesAPromise } from "./firstMeeting.js";

/**
 * La regola del primo scambio (UGOMKT-11, copione §3): sta nel blocco
 * DINAMICO del prompt, mai nel primo messaggio di sistema, che deve restare
 * identico byte per byte per la cache (regola 2). Qui si prova la forma del
 * prompt, che è funzione pura; che il modello la segua si misura sul modello
 * vero, non qui.
 */
const view = { label: "sereno", phrase: "Ti senti bene." };
const character = characterFrom({});

const build = (firstExchange?: boolean): string =>
  buildDynamicSystem(
    "lunedì 3 agosto, 15:00",
    view,
    undefined,
    [],
    [],
    undefined,
    character,
    true,
    false,
    ...(firstExchange === undefined ? [] : [firstExchange]),
  );

describe("regola del primo scambio nel blocco dinamico", () => {
  it("c'è quando è il primo scambio", () => {
    expect(build(true)).toContain(FIRST_EXCHANGE_RULE);
  });

  it("non c'è negli altri scambi, e di default", () => {
    expect(build(false)).not.toContain(FIRST_EXCHANGE_RULE);
    expect(build()).not.toContain(FIRST_EXCHANGE_RULE);
  });

  it("l'unica differenza è la regola: il resto del prompt non cambia", () => {
    expect(build(true).replace(`${FIRST_EXCHANGE_RULE}\n`, "")).toBe(build(false));
  });

  it("sta prima del tetto di parole, che chiude sempre il blocco", () => {
    const text = build(true);
    expect(text.indexOf(FIRST_EXCHANGE_RULE)).toBeLessThan(text.indexOf("Non superare"));
  });
});

describe("FIRST_EXCHANGE_RULE", () => {
  it("chiede di nominare, di fare al massimo una domanda e di non promettere", () => {
    expect(FIRST_EXCHANGE_RULE).toMatch(/nominando/iu);
    expect(FIRST_EXCHANGE_RULE).toMatch(/al massimo una domanda/iu);
    expect(FIRST_EXCHANGE_RULE).toMatch(/non promettere/iu);
  });

  it("non fa inventare il nome (regola 7) e non promette essa stessa", () => {
    expect(FIRST_EXCHANGE_RULE).toMatch(/non inventarlo/iu);
    expect(makesAPromise(FIRST_EXCHANGE_RULE)).toBe(false);
  });

  it("è una sola riga: il blocco dinamico è fatto di righe", () => {
    expect(FIRST_EXCHANGE_RULE).not.toContain("\n");
  });
});
