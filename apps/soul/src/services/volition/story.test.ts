import { describe, expect, it } from "vitest";
import { parseStoryAsk, storyPrompt, tellNoStory } from "./story.js";

/**
 * La storia della buonanotte (ADR-088) — la parte pura.
 *
 * Il confine da tenere è fra «raccontami una storia» e «raccontami cos'è
 * successo»: la prima chiede di inventare, la seconda chiede di ricordare — e
 * inventare quando ti hanno chiesto di ricordare è la bugia peggiore che una
 * creatura con la memoria possa dire.
 */

describe("chiedere una storia", () => {
  it("«raccontami una storia» è una storia", () => {
    expect(parseStoryAsk("raccontami una storia")).toEqual({ about: undefined });
  });

  it("una favola, e una storia della buonanotte, sono la stessa richiesta", () => {
    expect(parseStoryAsk("raccontami una favola")).toBeDefined();
    expect(parseStoryAsk("mi racconti una storia della buonanotte?")).toBeDefined();
  });

  it("il tema si tiene, se lo dici", () => {
    expect(parseStoryAsk("raccontami una storia sul mare")).toEqual({ about: "il mare" });
    expect(parseStoryAsk("raccontami una favola su un drago gentile")).toEqual({
      about: "un drago gentile",
    });
  });

  it("non ruba il diario: quello è ricordare, non inventare", () => {
    expect(parseStoryAsk("raccontami cos'hai fatto ieri")).toBeUndefined();
    expect(parseStoryAsk("raccontami la tua giornata")).toBeUndefined();
  });

  it("non ruba i ricordi", () => {
    expect(parseStoryAsk("raccontami la storia di quando è arrivato il corriere")).toBeUndefined();
  });

  it("senza «racconta» non è una richiesta di storia", () => {
    // «è una storia lunga» non chiede niente a nessuno
    expect(parseStoryAsk("è una storia lunga")).toBeUndefined();
  });
});

describe("il prompt che manda al modello di casa", () => {
  it("dice la lingua, la lunghezza e il tono, perché nessuna delle tre si indovina", () => {
    const prompt = storyPrompt({ about: undefined }, { persona: "un maiale curioso" });
    expect(prompt).toContain("italiano");
    expect(prompt).toContain("un maiale curioso");
  });

  it("il tema, quando c'è, ci finisce dentro", () => {
    expect(storyPrompt({ about: "il mare" }, { persona: "x" })).toContain("il mare");
  });

  it("con una riga di diario la storia parte da casa sua", () => {
    const prompt = storyPrompt(
      { about: undefined },
      { persona: "x", diary: "Oggi ha piovuto e siamo stati dentro" },
    );
    expect(prompt).toContain("piovuto");
  });
});

describe("quando il modello di casa non c'è", () => {
  it("lo dice, e non inventa una storia finta", () => {
    const said = tellNoStory();
    expect(said).toContain("storia");
    // niente «c'era una volta»: se non può raccontare, non racconta
    expect(said.toLowerCase()).not.toContain("c'era una volta");
  });
});
