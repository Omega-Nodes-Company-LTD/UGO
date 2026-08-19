import { describe, expect, it } from "vitest";
import { armsAgree, canAnswer, judgePrompt, readVerdict } from "./abstain.js";
import type { RankedMemory } from "./rerank.js";

/**
 * Le parti pure del giudice (ADR-107). Quella che chiama il modello sta nel
 * banco, dove c'è un Ollama vero: qui si prova il contorno, che è dove vive il
 * rischio — leggere male un «sì» costa una risposta persa.
 */

const memory = (over: Partial<RankedMemory> = {}): RankedMemory =>
  ({
    id: "m1",
    gosinoId: "g1",
    kind: "fact",
    text: "il gatto si chiama Bruno",
    similarity: 0.7,
    importance: 0.5,
    createdAt: new Date(),
    lastAccessed: null,
    recency: 1,
    relevance: 0.7,
    score: 0.35,
    ...over,
  }) as RankedMemory;

describe("armsAgree: l'unico indizio che ha retto la misura", () => {
  it("è vero solo se il PRIMO l'hanno trovato entrambi i bracci", () => {
    expect(armsAgree([memory({ vectorRank: 1, lexicalRank: 1 })])).toBe(true);
    expect(armsAgree([memory({ vectorRank: 1 })])).toBe(false);
    expect(armsAgree([memory({ lexicalRank: 1 })])).toBe(false);
    expect(armsAgree([])).toBe(false);
  });

  it("guarda il primo e non gli altri: l'accordo sul terzo non prova niente", () => {
    const ranked = [memory({ vectorRank: 1 }), memory({ id: "m2", vectorRank: 2, lexicalRank: 1 })];
    expect(armsAgree(ranked)).toBe(false);
  });
});

describe("readVerdict: ogni incertezza cade dalla parte del rispondere", () => {
  it("legge il no in mezzo alla punteggiatura e al preambolo", () => {
    for (const said of ["NO", "no", " No. ", "no, non c'è", "**NO**"]) {
      expect(readVerdict(said), said).toBe(false);
    }
  });

  it("legge il sì in tutte le sue forme", () => {
    for (const said of ["SI", "Sì.", "si, il gatto si chiama Bruno", "certo"]) {
      expect(readVerdict(said), said).toBe(true);
    }
  });

  /**
   * Il caso che conta: un giudice che non risponde, o che risponde una cosa
   * incomprensibile, **non deve poter zittire UGO**. Astenersi da una risposta
   * che esiste è il danno peggiore, quindi il dubbio vale «sì».
   */
  it("col modello giù o con una risposta illeggibile, si risponde lo stesso", () => {
    expect(readVerdict(undefined)).toBe(true);
    expect(readVerdict("")).toBe(true);
    expect(readVerdict("...")).toBe(true);
    expect(readVerdict("boh")).toBe(true);
  });
});

describe("judgePrompt", () => {
  it("numera gli appunti e chiede una parola sola, senza chiedere la risposta", () => {
    const prompt = judgePrompt("come si chiama il gatto?", ["il gatto si chiama Bruno", "altro"]);
    expect(prompt).toContain("1. il gatto si chiama Bruno");
    expect(prompt).toContain("2. altro");
    expect(prompt).toContain("come si chiama il gatto?");
    expect(prompt).toMatch(/SI oppure NO/u);
    // il giudice non deve mai essere invitato a rispondere nel merito
    expect(prompt).not.toMatch(/rispondi alla domanda/iu);
    /**
     * La riga sui near-miss è quella che compra `inventate 0/10`: toglierla ha
     * portato le perse da 1 a 3 (ADR-107, run 32219952282). La guardia esiste
     * perché non sparisca di nuovo per buone intenzioni.
     */
    expect(prompt).toMatch(/cose vicine/u);
  });
});

describe("canAnswer", () => {
  const never = { generate: () => Promise.resolve(undefined), available: () => Promise.resolve(true) };

  it("coi bracci d'accordo non chiede niente a nessuno, e non spende token", async () => {
    let asked = 0;
    const local = {
      generate: () => {
        asked += 1;
        return Promise.resolve("NO");
      },
      available: () => Promise.resolve(true),
    };
    const verdict = await canAnswer({ local }, "q", [memory({ vectorRank: 1, lexicalRank: 1 })]);
    expect(verdict).toMatchObject({ answerable: true, asked: false });
    expect(asked).toBe(0);
  });

  /**
   * ADR-108, ed è la prova che il proprietario ha chiesto con una frase: «deve
   * ricordare se io dico che Giovanni ha l'asma, non perché sia un fatto
   * medico, ma perché io l'ho detto». Un giudice che dice sempre NO — e su
   * questa domanda diceva NO davvero, era una delle tre perse — non deve poter
   * far sparire il ricordo dell'allergia dal prompt.
   */
  it("su «X può fare Y» non giudica: riferisce, e non spende un token", async () => {
    let asked = 0;
    const local = {
      generate: () => {
        asked += 1;
        return Promise.resolve("NO");
      },
      available: () => Promise.resolve(true),
    };
    const verdict = await canAnswer({ local }, "Sofia può mangiare i gamberi?", [
      memory({ text: "Sofia è allergica ai crostacei", vectorRank: 1 }),
    ]);
    expect(verdict).toMatchObject({ answerable: true, asked: false, reporting: true });
    expect(asked, "non c'è niente da giudicare, quindi non si chiede").toBe(0);
  });

  it("senza ricordi non c'è niente da giudicare e niente da dire", async () => {
    const verdict = await canAnswer({ local: never }, "q", []);
    expect(verdict).toMatchObject({ answerable: false, asked: false });
  });

  it("chiede al modello solo quando i bracci non concordano", async () => {
    const local = { generate: () => Promise.resolve("NO"), available: () => Promise.resolve(true) };
    const verdict = await canAnswer({ local }, "q", [memory({ vectorRank: 1 })]);
    expect(verdict).toMatchObject({ answerable: false, asked: true, said: "NO" });
  });

  /**
   * La guardia più importante del file. Il client nasce a temperatura 0.8 — la
   * temperatura del cantastorie — e un giudice che campiona dà verdetti
   * diversi sulla stessa domanda a ogni giro: è costato tre «misure» di
   * ADR-107 che confrontavano estrazioni invece di configurazioni.
   */
  it("chiede al modello a temperatura ZERO, o il verdetto cambia a ogni giro", async () => {
    let opts: unknown;
    const local = {
      generate: (_p: string, _m?: number, options?: { temperature?: number }) => {
        opts = options;
        return Promise.resolve("SI");
      },
      available: () => Promise.resolve(true),
    };
    await canAnswer({ local }, "q", [memory({ vectorRank: 1 })]);
    expect(opts).toMatchObject({ temperature: 0 });
  });

  it("mostra al giudice solo i ricordi che finirebbero nel prompt", async () => {
    let seen = "";
    const local = {
      generate: (prompt: string) => {
        seen = prompt;
        return Promise.resolve("SI");
      },
      available: () => Promise.resolve(true),
    };
    const ranked = [
      memory({ id: "a", text: "primo", vectorRank: 1 }),
      memory({ id: "b", text: "secondo" }),
      memory({ id: "c", text: "terzo" }),
    ];
    await canAnswer({ local, limit: 2 }, "q", ranked);
    expect(seen).toContain("primo");
    expect(seen).toContain("secondo");
    expect(seen).not.toContain("terzo");
  });
});
