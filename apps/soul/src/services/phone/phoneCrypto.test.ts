import { describe, expect, it } from "vitest";
import {
  AUDIO_TTL_MS,
  audioPath,
  audioSigningKey,
  callRefOf,
  contactEmailHash,
  handoverPhrase,
  readHandover,
  sameSecret,
  signAudio,
  verifyAudio,
} from "./phoneCrypto.js";
import { CallMemory, PhoneAudioStore } from "./phoneMemory.js";

const TOKEN = "t".repeat(40);
const KEY = audioSigningKey(TOKEN);
const NOW = 1_800_000_000_000;

describe("the signed audio URL (ADR-128)", () => {
  it("accepts its own signature before it expires", () => {
    const exp = NOW + AUDIO_TTL_MS;
    expect(verifyAudio(KEY, "abc", String(exp), signAudio(KEY, "abc", exp), NOW)).toBe("ok");
  });

  it("says expired once the ten minutes are gone", () => {
    const exp = NOW - 1;
    expect(verifyAudio(KEY, "abc", String(exp), signAudio(KEY, "abc", exp), NOW)).toBe("expired");
  });

  it("refuses a moved deadline, another id, another key, a malformed query", () => {
    const exp = NOW + 1000;
    const sig = signAudio(KEY, "abc", exp);
    expect(verifyAudio(KEY, "abc", String(exp + 60_000), sig, NOW)).toBe("invalid");
    expect(verifyAudio(KEY, "xyz", String(exp), sig, NOW)).toBe("invalid");
    expect(verifyAudio(audioSigningKey("u".repeat(40)), "abc", String(exp), sig, NOW)).toBe("invalid");
    expect(verifyAudio(KEY, "abc", undefined, sig, NOW)).toBe("invalid");
    expect(verifyAudio(KEY, "abc", "soon", sig, NOW)).toBe("invalid");
    expect(verifyAudio(KEY, "abc", String(exp), "zz", NOW)).toBe("invalid");
  });

  it("never signs with the phone token itself", () => {
    expect(KEY.toString("utf8")).not.toContain(TOKEN);
    expect(audioPath(KEY, "abc", NOW)).toMatch(/^\/v1\/phone\/audio\/abc\?exp=\d+&sig=[0-9a-f]{64}$/u);
  });
});

describe("what is kept about a call and a customer", () => {
  it("keeps a fingerprint of the CallSid, not the CallSid", () => {
    const ref = callRefOf("CA0123456789abcdef");
    expect(ref).toMatch(/^[0-9a-f]{64}$/u);
    expect(ref).not.toContain("CA0123");
  });

  it("recognizes an email whatever its case and spaces, and depends on the data key", () => {
    const key = Buffer.alloc(32, 7);
    expect(contactEmailHash(key, " Mario@Rossi.IT ")).toBe(contactEmailHash(key, "mario@rossi.it"));
    expect(contactEmailHash(Buffer.alloc(32, 8), "mario@rossi.it")).not.toBe(
      contactEmailHash(key, "mario@rossi.it"),
    );
  });

  it("compares the service secret in full", () => {
    expect(sameSecret(TOKEN, TOKEN)).toBe(true);
    expect(sameSecret(TOKEN.slice(1), TOKEN)).toBe(false);
  });
});

describe("the handover marker", () => {
  it("passes a plain answer through", () => {
    expect(readHandover(" Apriamo alle nove. ")).toEqual({ text: "Apriamo alle nove.", handover: false });
  });

  it("turns the marker or an empty answer into a handover", () => {
    expect(readHandover("[PASSA] Non lo so.")).toEqual({ text: "Non lo so.", handover: true });
    expect(readHandover("   ").handover).toBe(true);
  });

  it("speaks the handover in the caller's language", () => {
    expect(handoverPhrase("it")).toContain("persona");
    expect(handoverPhrase("en")).toContain("person");
  });
});

describe("the phone's short memory", () => {
  it("serves audio for ten minutes, then forgets it", () => {
    const store = new PhoneAudioStore();
    const { id, expiresAt } = store.put(Buffer.from("mp3"), NOW);
    expect(expiresAt).toBe(NOW + AUDIO_TTL_MS);
    expect(store.get(id, NOW + 1000)?.toString()).toBe("mp3");
    expect(store.get(id, NOW + AUDIO_TTL_MS + 1)).toBeUndefined();
  });

  it("keeps a caller's turns for the call, and only the last eight", () => {
    const memory = new CallMemory();
    for (let turn = 0; turn < 6; turn++) memory.remember("ref", `q${String(turn)}`, `a${String(turn)}`, NOW);
    const history = memory.history("ref", NOW);
    expect(history).toHaveLength(8);
    expect(history.at(-1)).toEqual({ role: "assistant", content: "a5" });
    expect(memory.history("ref", NOW + 31 * 60_000)).toEqual([]);
    expect(memory.history("other", NOW)).toEqual([]);
  });
});
