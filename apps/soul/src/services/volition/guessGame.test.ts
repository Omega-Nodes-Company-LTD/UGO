import { describe, expect, it } from "vitest";
import { HIGH, judge, LOW, MERCY_TURNS, moveOf } from "./guessGame.js";

describe("moveOf: `playing` cambia il senso della frase", () => {
  it("riconosce l'invito a giocare", () => {
    for (const text of ["giochiamo?", "facciamo un gioco", "pensa un numero"]) {
      expect(moveOf(text, false), text).toEqual({ move: "start" });
    }
  });

  /**
   * Il caso che conta: **fuori partita un numero non è un tentativo**. Dentro
   * sì — «ho 43 anni» durante una partita viene letto come 43, ed è un rischio
   * accettato perché la partita è aperta solo se qualcuno l'ha chiesta e dura
   * poche battute. Fuori sarebbe un gioco che comincia da solo, molto peggio.
   */
  it("un numero conta solo a partita aperta", () => {
    expect(moveOf("42", false)).toEqual({ move: "none" });
    expect(moveOf("42", true)).toEqual({ move: "guess", number: 42 });
    expect(moveOf("provo con 7", true)).toEqual({ move: "guess", number: 7 });
  });

  it("i numeri fuori dal campo non sono tentativi", () => {
    expect(moveOf(String(HIGH + 1), true)).toEqual({ move: "none" });
    expect(moveOf(String(LOW - 1), true)).toEqual({ move: "none" });
  });

  it("la resa vale solo dentro una partita", () => {
    expect(moveOf("mi arrendo", true)).toEqual({ move: "give-up" });
    expect(moveOf("mi arrendo", false)).toEqual({ move: "none" });
  });
});

describe("judge", () => {
  it("dice da che parte, e non di più", () => {
    expect(judge(50, 30, 1).reply).toContain("più alto");
    expect(judge(50, 70, 1).reply).toContain("più basso");
    expect(judge(50, 30, 1).over).toBe(false);
    // il segreto non compare finché non è finita: è tutto il gioco
    expect(judge(50, 30, 1).reply).not.toContain("50");
  });

  it("quando ci prendi lo dice, col conto dei tentativi", () => {
    const verdict = judge(50, 50, 4);
    expect(verdict.over).toBe(true);
    expect(verdict.reply).toContain("50");
    expect(verdict.reply).toContain("4");
  });

  it("dopo troppi tentativi offre la via d'uscita, senza imporla", () => {
    expect(judge(50, 30, MERCY_TURNS).reply).toContain("mi arrendo");
    expect(judge(50, 30, MERCY_TURNS).over).toBe(false);
  });
});
