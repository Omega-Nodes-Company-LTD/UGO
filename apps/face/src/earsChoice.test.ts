import { describe, expect, it } from "vitest";
import { EARS_MEMORY_KEY, EarsChoice, type EarsMemory } from "./earsChoice.js";

/**
 * La scelta delle orecchie (STATE §6-tricies, il seguito).
 *
 * Sul telefono del proprietario il riconoscitore del browser non riesce a
 * tenere il microfono (lo tiene il misuratore di rumore): il freno di
 * `speech.ts` lo fa arrendere invece di suonare il bip per sempre, ma
 * arrendersi non è ascoltare. Questa classe decide COSA fare dopo: passare
 * alla dettatura in casa, ricordarselo per i prossimi avvii, e non
 * rimbalzare all'infinito fra due strade morte.
 */

function memoryOf(initial?: string): EarsMemory & { stored: Map<string, string> } {
  const stored = new Map<string, string>();
  if (initial !== undefined) stored.set(EARS_MEMORY_KEY, initial);
  return {
    stored,
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => void stored.set(key, value),
    removeItem: (key) => void stored.delete(key),
  };
}

describe("la prima scelta", () => {
  /**
   * ADR-109: il verso è cambiato, ed è il punto di tutta la decisione.
   *
   * La base è la dettatura di casa; il browser è il ripiego. Prima era il
   * contrario, e il contrario voleva dire che per default ciò che dici in
   * casa tua veniva mandato a Google — a ogni avvio di ogni dispositivo.
   */
  it("di default parte dalla dettatura in casa: la voce non esce", () => {
    expect(new EarsChoice(null, memoryOf()).first()).toBe("locale");
  });

  it("un dispositivo che ha già scoperto che qui whisper non c'è riparte dal browser", () => {
    expect(new EarsChoice(null, memoryOf("browser")).first()).toBe("browser");
  });

  it("?stt=locale forza la dettatura in casa, come sempre", () => {
    expect(new EarsChoice("locale", memoryOf()).first()).toBe("locale");
  });

  it("un dispositivo che si ricorda del browser rotto parte dalla dettatura in casa: zero bip", () => {
    expect(new EarsChoice(null, memoryOf("locale")).first()).toBe("locale");
  });

  it("?stt=locale dimentica pure: è come si riprova casa dopo che è stata dichiarata morta", () => {
    const memory = memoryOf("browser");
    expect(new EarsChoice("locale", memory).first()).toBe("locale");
    expect(memory.stored.has(EARS_MEMORY_KEY)).toBe(false);
  });

  it("?stt=browser forza il browser E dimentica: è la via d'uscita se il ricordo è stantio", () => {
    const memory = memoryOf("locale");
    expect(new EarsChoice("browser", memory).first()).toBe("browser");
    expect(memory.stored.has(EARS_MEMORY_KEY)).toBe(false);
  });
});

describe("quando il browser si arrende", () => {
  it("passa alla dettatura in casa e se lo ricorda per il prossimo avvio", () => {
    const memory = memoryOf();
    const choice = new EarsChoice(null, memory);
    expect(choice.browserGaveUp(true)).toBe("locale");
    // il ricordo sopravvive alla ricarica: la prossima scelta non suona bip
    expect(new EarsChoice(null, memory).first()).toBe("locale");
  });

  it("a microfono spento non c'è nastro da trascrivere: orecchie spente", () => {
    expect(new EarsChoice(null, memoryOf()).browserGaveUp(false)).toBe("off");
  });

  it("se la dettatura in casa è già morta in questa sessione, si spegne: niente ping-pong", () => {
    const choice = new EarsChoice(null, memoryOf());
    expect(choice.localeFailed()).toBe("browser");
    expect(choice.browserGaveUp(true)).toBe("off");
  });

  it("con ?stt=browser la resa è una resa: chi ha forzato il browser non vuole l'altra strada", () => {
    expect(new EarsChoice("browser", memoryOf()).browserGaveUp(true)).toBe("off");
  });
});

describe("quando la dettatura in casa non risponde", () => {
  it("se il browser non è ancora stato provato, si torna lì: è il ripiego di sempre", () => {
    expect(new EarsChoice("locale", memoryOf()).localeFailed()).toBe("browser");
  });

  /**
   * Il costo dichiarato di ADR-109: in una casa senza whisper il primo
   * enunciato si perde. UNA volta per dispositivo, non a ogni ricarica —
   * senza questo ricordo il nuovo default farebbe pagare quel prezzo per
   * sempre, ed è la ragione per cui la memoria adesso tiene la strada
   * invece di un sì/no.
   */
  it("il ripiego sul browser si ricorda: il prezzo si paga una volta sola", () => {
    const memory = memoryOf();
    expect(new EarsChoice(null, memory).localeFailed()).toBe("browser");
    expect(memory.stored.get(EARS_MEMORY_KEY)).toBe("browser");
    expect(new EarsChoice(null, memory).first()).toBe("browser");
  });

  it("se il browser si è già arreso in questa sessione, ci si spegne invece di rimbalzare", () => {
    const choice = new EarsChoice(null, memoryOf());
    expect(choice.browserGaveUp(true)).toBe("locale");
    expect(choice.localeFailed()).toBe("off");
  });

  it("se il browser è rotto per memoria, non si riprova a suon di bip: orecchie spente", () => {
    const choice = new EarsChoice(null, memoryOf("locale"));
    expect(choice.first()).toBe("locale");
    expect(choice.localeFailed()).toBe("off");
  });
});

describe("una memoria che non c'è o esplode", () => {
  it("senza memoria funziona tutto, solo senza ricordo fra le ricariche", () => {
    const choice = new EarsChoice(null, undefined);
    expect(choice.first()).toBe("locale");
    expect(choice.browserGaveUp(true)).toBe("locale");
  });

  it("una memoria che lancia (kiosk in incognito) non abbatte la scelta", () => {
    const broken: EarsMemory = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const choice = new EarsChoice(null, broken);
    // niente ricordo leggibile = si riparte dal default, che da ADR-109 è casa
    expect(choice.first()).toBe("locale");
    expect(choice.localeFailed()).toBe("browser");
  });
});
