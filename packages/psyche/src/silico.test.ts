import { describe, expect, it } from "vitest";
import { simulateGoldenDay } from "./silico.js";

/**
 * Lo screening in silico, e il risultato **negativo** che l'ha ridefinito
 * (backlog gruppo 20, ADR-114).
 *
 * L'idea era: far vivere una giornata al carattere che nascerebbe, e buttare i
 * rotti prima della nascita. Il meccanismo funziona; quello che non esiste è
 * ciò che dovrebbe prendere. Su **243 caratteri raggiungibili** — tutta la
 * griglia dei limiti che `characterFrom` impone — la giornata d'oro non ne
 * boccia **nessuno**, e non è una soglia da alzare: è che la psiche risponde
 * agli eventi allo stesso modo per tutti, e del genoma dipendono solo i
 * livelli di riposo, che sono già dentro limiti sani per costruzione.
 *
 * Quindi qui non c'è un filtro alla nascita — sarebbe un controllo che passa
 * sempre, pagato a ogni cucciolo. C'è una **guardia sui limiti**: se qualcuno
 * allarga i clamp di `characterFrom`, o cambia il motore in modo che una
 * combinazione ammessa produca una creatura inchiodata, questi test diventano
 * rossi. È il valore vero di aver costruito la giornata.
 */

/** I limiti che `characterFrom` impone: nessun genoma può uscirne. */
const BOUNDS = {
  umore: [0.25, 0.8],
  affetto: [0.1, 0.9],
  noia: [0.15, 0.75],
  stress: [0.05, 0.7],
  curiosita: [0.1, 0.95],
} as const;

const AVERAGE = { umore: 0.55, affetto: 0.5, noia: 0.4, stress: 0.3, curiosita: 0.5 };

const corners = (pair: readonly [number, number]): number[] => [
  pair[0],
  (pair[0] + pair[1]) / 2,
  pair[1],
];

describe("la giornata d'oro", () => {
  it("un carattere nella media la passa", () => {
    expect(simulateGoldenDay(AVERAGE)).toEqual({ viable: true, reasons: [] });
  });

  it("è deterministica: stesso carattere, stesso verdetto", () => {
    expect(simulateGoldenDay(AVERAGE)).toEqual(simulateGoldenDay(AVERAGE));
  });

  /**
   * **La guardia.** Ogni carattere che può nascere deve sopravvivere a una
   * giornata ordinaria. Se questo diventa rosso, o si sono allargati i limiti
   * di `characterFrom`, o il motore ha smesso di riportare indietro una
   * variabile spinta — e in tutt'e due i casi qualcuno nascerebbe rotto.
   */
  it("nessun carattere raggiungibile esce rotto da una giornata ordinaria", () => {
    const broken: string[] = [];
    for (const umore of corners(BOUNDS.umore)) {
      for (const affetto of corners(BOUNDS.affetto)) {
        for (const noia of corners(BOUNDS.noia)) {
          for (const stress of corners(BOUNDS.stress)) {
            for (const curiosita of corners(BOUNDS.curiosita)) {
              const verdict = simulateGoldenDay({ umore, affetto, noia, stress, curiosita });
              if (!verdict.viable) {
                broken.push(
                  `${JSON.stringify({ umore, affetto, noia, stress, curiosita })}: ${verdict.reasons.join("; ")}`,
                );
              }
            }
          }
        }
      }
    }
    expect(broken, "un carattere che può nascere non deve poter uscire rotto").toEqual([]);
  });

  /**
   * E la controprova, senza la quale la guardia sopra non vuol dire niente: la
   * giornata **sa** riconoscere una creatura inchiodata. Queste baseline non
   * sono raggiungibili da nessun genoma — è il punto — ma se lo diventassero,
   * verrebbero prese.
   */
  it("sa riconoscere l'inchiodato, se mai diventasse raggiungibile", () => {
    const verdict = simulateGoldenDay({
      umore: 1,
      affetto: 1,
      noia: 1,
      stress: 1,
      curiosita: 1,
    });
    expect(verdict.viable).toBe(false);
    expect(verdict.reasons.join(" ")).toMatch(/inchiodata/u);
  });
});
