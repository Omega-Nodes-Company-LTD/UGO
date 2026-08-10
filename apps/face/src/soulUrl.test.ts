import { describe, expect, it } from "vitest";
import { resolveSoulUrl, soulHttpBase } from "./soulUrl.js";

function at(url: string): URL {
  return new URL(url);
}

describe("resolveSoulUrl", () => {
  it("takes the explicit override verbatim", () => {
    expect(resolveSoulUrl(at("https://ugo.example/"), "ws://elsewhere:9/v1/face")).toBe(
      "ws://elsewhere:9/v1/face",
    );
  });

  it("ignores an empty override instead of producing an empty URL", () => {
    expect(resolveSoulUrl(at("http://ugo.example/"), "")).toBe("ws://ugo.example/v1/face");
  });

  it("rewrites the port in Vite dev, where soul is a separate process", () => {
    expect(resolveSoulUrl(at("http://127.0.0.1:5173/"))).toBe("ws://127.0.0.1:3000/v1/face");
    expect(resolveSoulUrl(at("http://127.0.0.1:4173/"))).toBe("ws://127.0.0.1:3000/v1/face");
  });

  it("stays same-origin when soul serves the face itself", () => {
    expect(resolveSoulUrl(at("http://100.101.102.103:3000/"))).toBe(
      "ws://100.101.102.103:3000/v1/face",
    );
  });

  // mixed content: an https page may not open a ws:// socket, and the phone
  // needs https anyway for microphone and wake lock
  it("follows the page to TLS", () => {
    expect(resolveSoulUrl(at("https://ugo.tail1234.ts.net/"))).toBe(
      "wss://ugo.tail1234.ts.net/v1/face",
    );
  });
});

describe("soulHttpBase", () => {
  it("keeps the scheme in step with the socket", () => {
    expect(soulHttpBase("wss://ugo.tail1234.ts.net/v1/face")).toBe("https://ugo.tail1234.ts.net");
    expect(soulHttpBase("ws://127.0.0.1:3000/v1/face")).toBe("http://127.0.0.1:3000");
  });
});
