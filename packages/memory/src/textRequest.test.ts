import { describe, expect, it } from "vitest";
import { DEFAULT_PROVIDERS } from "./chatRequest.js";
import { textCompletionBody } from "./textRequest.js";

describe("textCompletionBody", () => {
  const body = textCompletionBody("m", DEFAULT_PROVIDERS, "dimmi ciao", 40, 0.3);

  it("sends the prompt as the only user message", () => {
    expect(body.messages).toEqual([{ role: "user", content: "dimmi ciao" }]);
    expect(body.max_tokens).toBe(40);
    expect(body.temperature).toBe(0.3);
  });

  it("keeps reasoning off and the closed, no-retention provider list", () => {
    expect(body.reasoning).toEqual({ enabled: false });
    expect(body.provider.only).toEqual([...DEFAULT_PROVIDERS]);
    expect(body.provider.zdr).toBe(true);
    expect(body.provider.data_collection).toBe("deny");
  });
});
