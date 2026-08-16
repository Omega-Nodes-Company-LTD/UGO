import { describe, expect, it } from "vitest";
import { rainShouldPlay } from "./rainSound.js";

/** La decisione della pioggia: pura. Il WebAudio è browser e si prova col banco. */
describe("rainShouldPlay", () => {
  it("suona solo se piove, di giorno o al crepuscolo, a sensi accesi", () => {
    expect(rainShouldPlay({ mode: "day", weather: "rain" }, true)).toBe(true);
    expect(rainShouldPlay({ mode: "golden", weather: "rain" }, true)).toBe(true);
  });

  it("di notte tace, col sereno tace, a sensi spenti tace, senza cielo tace", () => {
    expect(rainShouldPlay({ mode: "night", weather: "rain" }, true)).toBe(false);
    expect(rainShouldPlay({ mode: "day", weather: "clear" }, true)).toBe(false);
    expect(rainShouldPlay({ mode: "day", weather: "cloudy" }, true)).toBe(false);
    expect(rainShouldPlay({ mode: "day", weather: "rain" }, false)).toBe(false);
    expect(rainShouldPlay(undefined, true)).toBe(false);
  });
});
