import { describe, expect, it } from "vitest";
import { DEFAULT_PROVIDERS } from "./chatRequest.js";
import { VISION_PROMPT, visionCompletionBody } from "./visionRequest.js";

describe("visionCompletionBody", () => {
  const body = visionCompletionBody("some/model", DEFAULT_PROVIDERS, "AAAA");

  it("puts the fixed prompt before the image, so the prefix can be cached", () => {
    const parts = body.messages[0]?.content ?? [];
    expect(parts[0]).toEqual({ type: "text", text: VISION_PROMPT });
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAAA" },
    });
  });

  it("keeps the closed provider list with no retention and no training", () => {
    expect(body.provider.only).toEqual([...DEFAULT_PROVIDERS]);
    expect(body.provider.order).toEqual([...DEFAULT_PROVIDERS]);
    expect(body.provider.zdr).toBe(true);
    expect(body.provider.data_collection).toBe("deny");
  });

  it("asks OpenRouter for the cost, which goes on the ledger", () => {
    expect(body.usage).toEqual({ include: true });
  });
});
