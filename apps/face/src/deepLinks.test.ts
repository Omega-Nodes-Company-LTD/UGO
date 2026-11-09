import { describe, expect, it } from "vitest";
import { deepLinkTarget } from "./deepLinks.js";

const ORIGIN = "https://ugo.omeganodes.ai";

describe("i link universali dell'app (ADR-127, ADR-130)", () => {
  it("porta il login al soul, che mette il cookie e torna al muso", () => {
    expect(deepLinkTarget(`${ORIGIN}/login/abc_123`, ORIGIN)).toBe(`${ORIGIN}/login/abc_123`);
  });

  it("porta l'abbinamento al muso col codice precompilato", () => {
    expect(deepLinkTarget(`${ORIGIN}/pair/K7Q2M9XD`, ORIGIN)).toBe(`${ORIGIN}/?pair=K7Q2M9XD`);
  });

  it("ignora un altro dominio: un link non può portare l'app fuori casa", () => {
    expect(deepLinkTarget("https://example.com/login/abc", ORIGIN)).toBeUndefined();
  });

  it("ignora percorsi che non sono i due previsti, o con pezzi in più", () => {
    expect(deepLinkTarget(`${ORIGIN}/v1/rooms`, ORIGIN)).toBeUndefined();
    expect(deepLinkTarget(`${ORIGIN}/login/`, ORIGIN)).toBeUndefined();
    expect(deepLinkTarget(`${ORIGIN}/pair/abc/extra`, ORIGIN)).toBeUndefined();
    expect(deepLinkTarget("non è un url", ORIGIN)).toBeUndefined();
  });

  it("codifica il valore: niente iniezione di parametri dal link", () => {
    expect(deepLinkTarget(`${ORIGIN}/pair/a%26login%3Dx`, ORIGIN)).toBe(`${ORIGIN}/?pair=a%26login%3Dx`);
  });
});
