import { identityPrompt, receptionPrompt, rulesPrompt } from "@ugo/prompts";
import { describe, expect, it } from "vitest";
import {
  cachedPrefix,
  chatCompletionBody,
  chatMessages,
  DEFAULT_PROVIDERS,
} from "./chatRequest.js";

const LOCALE = "it";

describe("the cached prefix (§5.5, rule 2)", () => {
  it("is identity then the house rules, and nothing else", () => {
    expect(cachedPrefix("home", LOCALE)).toBe(`${identityPrompt(LOCALE)}\n\n${rulesPrompt(LOCALE)}`);
  });

  it("uses the reception rules on the ticket channel (ADR-052)", () => {
    expect(cachedPrefix("ticket", LOCALE)).toBe(
      `${identityPrompt(LOCALE)}\n\n${receptionPrompt(LOCALE)}`,
    );
  });

  it("uses the reception rules on the phone too: the caller is not family (ADR-128)", () => {
    expect(cachedPrefix("phone", LOCALE)).toBe(cachedPrefix("ticket", LOCALE));
  });

  it("keeps a phone turn short: every character is seconds of synthesis", () => {
    const body = chatCompletionBody("m", DEFAULT_PROVIDERS, {
      channel: "phone",
      locale: LOCALE,
      userText: "pronto?",
    });
    expect(body.max_tokens).toBeLessThanOrEqual(150);
  });

  it("stays byte-identical whatever the dynamic content", () => {
    const first = chatMessages({
      channel: "home",
      locale: LOCALE,
      dynamicSystem: "Stato: gasato.",
      userText: "prima",
    });
    const second = chatMessages({
      channel: "meeting",
      locale: LOCALE,
      dynamicSystem: "Stato: mogio. Ricordi: il gatto si chiama Bruno.",
      userText: "seconda",
    });
    expect(first[0]).toEqual(second[0]);
    expect(first[0]?.content).not.toContain("Bruno");
  });
});

describe("the message order", () => {
  it("puts the dynamic block in its own system message, after the prefix", () => {
    const messages = chatMessages({
      channel: "home",
      locale: LOCALE,
      dynamicSystem: "Ricordi: il gatto si chiama Bruno.",
      userText: "ciao",
    });
    expect(messages.map((m) => m.role)).toEqual(["system", "system", "user"]);
    expect(messages[1]?.content).toContain("Bruno");
  });

  it("omits an empty dynamic block instead of sending a blank message", () => {
    const messages = chatMessages({ channel: "home", locale: LOCALE, dynamicSystem: "", userText: "ciao" });
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("puts history before the user text", () => {
    const messages = chatMessages({
      channel: "home",
      locale: LOCALE,
      history: [
        { role: "user", content: "come stai?" },
        { role: "assistant", content: "Grunf, benone." },
      ],
      userText: "e adesso?",
    });
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages.at(-1)?.content).toBe("e adesso?");
  });
});

describe("the OpenRouter body (ADR-125)", () => {
  const body = chatCompletionBody("deepseek/deepseek-v4-flash", DEFAULT_PROVIDERS, {
    channel: "meeting",
    locale: LOCALE,
    userText: "ciao",
  });

  it("switches reasoning off: a thinking model spends its cap and answers empty", () => {
    expect(body.reasoning).toEqual({ enabled: false });
  });

  it("routes only to the listed providers, in order, without retention", () => {
    expect(body.provider.only).toEqual([...DEFAULT_PROVIDERS]);
    expect(body.provider.order).toEqual([...DEFAULT_PROVIDERS]);
    expect(body.provider.zdr).toBe(true);
    expect(body.provider.data_collection).toBe("deny");
  });

  it("keeps the providers that cache first (measured, ADR-125)", () => {
    expect(DEFAULT_PROVIDERS.slice(0, 2)).toEqual(["DeepInfra", "Azure"]);
  });

  it("never lists a provider based in China", () => {
    for (const banned of ["DeepSeek", "Baidu", "SiliconFlow", "StreamLake"]) {
      expect(DEFAULT_PROVIDERS).not.toContain(banned);
    }
  });

  it("caps tokens by channel and asks for the cost", () => {
    expect(body.max_tokens).toBe(300);
    expect(body.usage).toEqual({ include: true });
  });
});
