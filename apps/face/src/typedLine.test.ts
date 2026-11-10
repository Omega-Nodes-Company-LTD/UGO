import { describe, expect, it } from "vitest";
import { TYPED_MAX_CHARS, typedText } from "./typedLine.js";

describe("typedText", () => {
  it("drops empty and blank lines", () => {
    expect(typedText("")).toBeUndefined();
    expect(typedText("   \n\t ")).toBeUndefined();
  });

  it("collapses whitespace and trims", () => {
    expect(typedText("  ciao   UGO\ncome stai ")).toBe("ciao UGO come stai");
  });

  it("never exceeds what the socket contract accepts", () => {
    expect(typedText("a".repeat(TYPED_MAX_CHARS + 50))?.length).toBe(TYPED_MAX_CHARS);
  });
});
