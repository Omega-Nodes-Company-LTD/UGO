import { describe, expect, it } from "vitest";
import { readUsage } from "./ledger.js";

describe("readUsage — what OpenRouter declares, per kind of call", () => {
  it("chat: separates cached tokens from the fresh ones", () => {
    const read = readUsage({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        cost: 0.001,
        prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 },
      },
    });
    expect(read.counted).toBe(true);
    expect(read.usage).toEqual({
      inputTokens: 30,
      outputTokens: 20,
      cacheCreationInputTokens: 10,
      cacheReadInputTokens: 60,
    });
    expect(read.costUsd).toBe(0.001);
  });

  it("embeddings: no completion tokens, still counted", () => {
    const read = readUsage({ usage: { prompt_tokens: 4, total_tokens: 4, cost: 8e-8 } });
    expect(read.counted).toBe(true);
    expect(read.usage.inputTokens).toBe(4);
    expect(read.usage.outputTokens).toBe(0);
    expect(read.costUsd).toBe(8e-8);
  });

  it("transcription: seconds and cost only, still counted", () => {
    const read = readUsage({ usage: { seconds: 1, cost: 0.0001 } });
    expect(read.counted).toBe(true);
    expect(read.costUsd).toBe(0.0001);
  });

  it("no usage at all: zero, and declared as not counted", () => {
    const read = readUsage({});
    expect(read.counted).toBe(false);
    expect(read.costUsd).toBe(0);
  });
});
