import { describe, expect, it } from "vitest";
import { linkLabel } from "./speechLink.js";

describe("la fonte nella nuvoletta", () => {
  it("dice dove si legge, senza il www", () => {
    expect(linkLabel("https://www.viaggiaresicuri.it/find-country/country/UGA")).toBe("Leggi su viaggiaresicuri.it");
  });

  it("non mostra ciò che non è un indirizzo web", () => {
    expect(linkLabel("javascript:alert(1)")).toBeUndefined();
    expect(linkLabel("non un url")).toBeUndefined();
  });
});
