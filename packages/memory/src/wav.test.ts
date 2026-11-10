import { describe, expect, it } from "vitest";
import { pcm16ToWav } from "./wav.js";

describe("pcm16ToWav", () => {
  const pcm = new Uint8Array([1, 0, 2, 0, 3, 0]);
  const wav = pcm16ToWav(pcm);
  const view = new DataView(wav.buffer);
  const text = (from: number, to: number) => String.fromCharCode(...wav.slice(from, to));

  it("writes a 44-byte RIFF/WAVE header in front of the samples", () => {
    expect(wav.length).toBe(44 + pcm.length);
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 12)).toBe("WAVE");
    expect(text(36, 40)).toBe("data");
    expect([...wav.slice(44)]).toEqual([...pcm]);
  });

  it("declares mono 16-bit PCM at 16 kHz with consistent sizes", () => {
    expect(view.getUint32(4, true)).toBe(36 + pcm.length);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(28, true)).toBe(32_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(pcm.length);
  });
});
