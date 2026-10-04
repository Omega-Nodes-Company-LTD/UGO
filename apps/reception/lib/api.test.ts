import { describe, expect, it } from "vitest";
import { OFFLINE, speaking } from "./api";

describe("gli errori della reception parlano", () => {
  it("tiene la frase di soul quando c'è", () => {
    expect(speaking(409, "Questo ticket è già chiuso.")).toBe("Questo ticket è già chiuso.");
  });

  it("non mostra mai «HTTP 404»: dice cosa fare", () => {
    expect(speaking(404, "HTTP 404")).toContain("Ricarica la pagina");
    expect(speaking(502)).toContain("riprova fra poco");
    expect(speaking(418)).toContain("controlla i campi");
    expect(OFFLINE).toContain("connessione");
  });
});
