import { describe, expect, it } from "vitest";
import { audioTagFor, taggedText } from "./voiceTags.js";

describe("the mood becomes an audio tag (ADR-125 §6)", () => {
  it.each([
    ["gasato", "[excited]"],
    ["mogio", "[sad]"],
    ["in letargo", "[tired]"],
    ["annoiato", "[bored]"],
    ["curioso", "[curious]"],
    ["in ansia", "[nervous]"],
    ["in ansia da caldo", "[nervous]"],
    ["spaventato dal fracasso", "[nervous]"],
    ["offeso per l'urto", "[annoyed]"],
  ])("%s → %s", (mood, tag) => {
    expect(audioTagFor(mood)).toBe(tag);
  });

  it("leaves a calm or unknown mood untagged: the gene's voice, no added colour", () => {
    expect(audioTagFor("sereno")).toBeUndefined();
    expect(audioTagFor("un umore mai visto")).toBeUndefined();
    expect(audioTagFor(undefined)).toBeUndefined();
  });

  it("puts the tag in front of the text, and nothing when there is no tag", () => {
    expect(taggedText("Ciao!", "gasato")).toBe("[excited] Ciao!");
    expect(taggedText("Ciao!", "sereno")).toBe("Ciao!");
  });
});
