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

describe("choosing which exemplar this device is (ADR-032)", () => {
  const prod = { protocol: "https:", hostname: "ugo.tail", host: "ugo.tail", port: "" };

  it("asks for nobody in particular when the device does not name one", () => {
    expect(resolveSoulUrl(prod, null, null)).toBe("wss://ugo.tail/v1/face");
    expect(resolveSoulUrl(prod, null, "")).toBe("wss://ugo.tail/v1/face");
  });

  it("carries the name through, escaped", () => {
    expect(resolveSoulUrl(prod, null, "cucina")).toBe("wss://ugo.tail/v1/face?gosino=cucina");
    expect(resolveSoulUrl(prod, null, "sala da pranzo")).toContain("gosino=sala%20da%20pranzo");
  });

  it("appends to an override that already has a query string", () => {
    expect(resolveSoulUrl(prod, "wss://altro/v1/face?x=1", "studio")).toBe(
      "wss://altro/v1/face?x=1&gosino=studio",
    );
  });

  it("keeps the REST base clean: the query belongs to the socket", () => {
    expect(soulHttpBase("wss://ugo.tail/v1/face?gosino=cucina")).toBe("https://ugo.tail");
  });
});
