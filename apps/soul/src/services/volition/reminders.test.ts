import { describe, expect, it } from "vitest";
import { confirmReminder, parseReminder, voiceReminder } from "./reminders.js";

/**
 * A reminder that lands at the wrong time is worse than one that was never
 * taken, so most of these assert that it FAILS — closed, quietly, letting the
 * sentence carry on as an ordinary conversation.
 */

// eleven thirty in the morning, in the household's own clock
const H = 11;
const M = 30;

describe("parseReminder", () => {
  it("understands minutes from now", () => {
    expect(parseReminder("ricordami di chiamare Ivan fra 10 minuti", H, M)).toEqual({
      task: "chiamare Ivan",
      inMinutes: 10,
    });
    expect(parseReminder("ricordami fra dieci minuti la pasta", H, M)?.inMinutes).toBe(10);
    expect(parseReminder("avvisami tra 45 min di uscire", H, M)?.inMinutes).toBe(45);
  });

  it("understands hours and half hours", () => {
    expect(parseReminder("ricordami di stendere fra un'ora", H, M)?.inMinutes).toBe(60);
    expect(parseReminder("ricordami tra due ore di chiamare mamma", H, M)?.inMinutes).toBe(120);
    expect(parseReminder("ricordami di girare l'arrosto fra mezz'ora", H, M)?.inMinutes).toBe(30);
  });

  it("understands a clock time later today", () => {
    // 11:30 → 13:00 is ninety minutes
    expect(parseReminder("dimmi di buttare l'acqua alle 13", H, M)).toEqual({
      task: "buttare l'acqua",
      inMinutes: 90,
    });
    expect(parseReminder("ricordami la riunione alle 14:15", H, M)?.inMinutes).toBe(165);
  });

  it("rolls an hour that has already gone round to tomorrow", () => {
    // 11:30 → 9:00 is not this morning, it is tomorrow morning
    // 11:30 → midnight is 12h30, plus nine hours: twenty-one and a half
    expect(parseReminder("ricordami di prendere la pastiglia alle 9", H, M)?.inMinutes).toBe(
      21 * 60 + 30,
    );
  });

  it("takes «domani» literally", () => {
    const tomorrow = parseReminder("ricordami domani alle 15 di pagare la bolletta", H, M);
    expect(tomorrow?.inMinutes).toBe(24 * 60 + 3 * 60 + 30);
    expect(tomorrow?.task).toBe("pagare la bolletta");
  });

  it("ignores a sentence that is not asking for a reminder at all", () => {
    expect(parseReminder("che ore sono?", H, M)).toBeUndefined();
    expect(parseReminder("alle 13 ho mangiato benissimo", H, M)).toBeUndefined();
    expect(parseReminder("mi ricordo di quella volta al mare", H, M)).toBeUndefined();
  });

  it("refuses what it cannot pin down, instead of guessing an hour", () => {
    expect(parseReminder("ricordami di comprare il pane", H, M)).toBeUndefined();
    expect(parseReminder("ricordami più tardi", H, M)).toBeUndefined();
    expect(parseReminder("ricordami alle 99", H, M)).toBeUndefined();
    expect(parseReminder("ricordami fra 3 mesi di rinnovare", H, M)).toBeUndefined();
    // a time with nothing to remember is not a reminder
    expect(parseReminder("ricordami alle 13", H, M)).toBeUndefined();
  });

  it("never returns a moment in the past", () => {
    for (const phrase of [
      "ricordami alle 11 di uscire",
      "ricordami alle 11:30 di uscire",
      "ricordami fra 0 minuti di uscire",
    ]) {
      const parsed = parseReminder(phrase, H, M);
      if (parsed !== undefined) expect(parsed.inMinutes).toBeGreaterThan(0);
    }
  });

  it("strips the scaffolding out of the task, and keeps the substance", () => {
    expect(parseReminder("ricordami di buttare l'acqua alle 13, per favore", H, M)?.task).toBe(
      "buttare l'acqua",
    );
  });
});

describe("what he says", () => {
  it("confirms in his own words: no token is spent to say «va bene»", () => {
    expect(confirmReminder({ task: "buttare l'acqua", inMinutes: 10 })).toContain("10 minuti");
    expect(confirmReminder({ task: "stendere", inMinutes: 60 })).toContain("1 ora");
    expect(confirmReminder({ task: "stendere", inMinutes: 180 })).toContain("3 ore");
    expect(confirmReminder({ task: "pagare", inMinutes: 3000 })).toContain("me lo segno");
  });

  it("gives it back attributed to you, not as an order of his own", () => {
    expect(voiceReminder("buttare l'acqua")).toContain("mi avevi detto");
    expect(voiceReminder("buttare l'acqua")).toContain("buttare l'acqua");
  });
});
