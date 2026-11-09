import { describe, expect, it } from "vitest";
import {
  currentKey,
  defaultDeviceLabel,
  DEVICE_KEY_STORE,
  installSoulKey,
  isSoulRequest,
  socketUrlWithKey,
  type KeyStore,
} from "./deviceKey.js";

function memoryStore(initial: Record<string, string> = {}): KeyStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("which key this device uses (ADR-127)", () => {
  it("prefers the kiosk token in the address, then the paired key", () => {
    const store = memoryStore({ [DEVICE_KEY_STORE]: "paired" });
    expect(currentKey(new URLSearchParams("token=kiosk"), store)).toBe("kiosk");
    expect(currentKey(new URLSearchParams(""), store)).toBe("paired");
    expect(currentKey(new URLSearchParams(""), memoryStore())).toBeUndefined();
  });

  it("survives a store that throws (private mode)", () => {
    const broken: KeyStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(currentKey(new URLSearchParams(""), broken)).toBeUndefined();
  });
});

describe("the socket carries the key in its query", () => {
  it("appends it with the right separator, encoded", () => {
    expect(socketUrlWithKey("wss://ugo.omeganodes.ai/v1/face", "a b")).toBe(
      "wss://ugo.omeganodes.ai/v1/face?token=a%20b",
    );
    expect(socketUrlWithKey("wss://x/v1/face?stanza=cucina", "k")).toBe("wss://x/v1/face?stanza=cucina&token=k");
    expect(socketUrlWithKey("wss://x/v1/face", undefined)).toBe("wss://x/v1/face");
  });
});

describe("only soul gets the key", () => {
  it("recognises soul's own urls and nothing else", () => {
    expect(isSoulRequest("https://ugo.omeganodes.ai/v1/chat", "https://ugo.omeganodes.ai")).toBe(true);
    expect(isSoulRequest("https://ugo.omeganodes.ai.evil.example/v1", "https://ugo.omeganodes.ai")).toBe(false);
    expect(isSoulRequest("https://s3.hetzner.example/bucket?sig=1", "https://ugo.omeganodes.ai")).toBe(false);
  });
});

describe("the device label", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", "Mac"],
    ["Mozilla/5.0 (Linux; Android 15)", "Android"],
    ["curl/8", "browser"],
  ])("%s → %s", (ua, label) => {
    expect(defaultDeviceLabel(ua)).toBe(label);
  });
});

describe("the fetch wrapper", () => {
  it("adds the key to soul, keeps an explicit header, and reports a 401", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    let unauthorized = 0;
    const target = {
      fetch: (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        seen.push({ url, auth: new Headers(init?.headers).get("authorization") });
        return Promise.resolve(new Response(null, { status: url.endsWith("/denied") ? 401 : 200 }));
      },
    };
    installSoulKey({
      soulHttp: "https://ugo.omeganodes.ai",
      key: () => "device-key",
      onUnauthorized: () => {
        unauthorized += 1;
      },
      target,
    });
    await target.fetch("https://ugo.omeganodes.ai/v1/rooms");
    await target.fetch("https://ugo.omeganodes.ai/v1/pack", { headers: { authorization: "Bearer kiosk" } });
    await target.fetch("https://s3.example/upload");
    await target.fetch("https://ugo.omeganodes.ai/denied");
    expect(seen.map((row) => row.auth)).toEqual([
      "Bearer device-key",
      "Bearer kiosk",
      null,
      "Bearer device-key",
    ]);
    expect(unauthorized).toBe(1);
  });
});
