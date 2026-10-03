import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { confirmPage, kennelPage, landingPage, pupPage, shopPage, signupPage } from "./pages.js";
import { SITE_JS } from "./script.js";

/**
 * Il sito è una stringa servita come JavaScript: il compilatore non la vede,
 * quindi la compila questo test (come `script.test.ts` per il pannello).
 */
describe("il sito pubblico", () => {
  it("lo script si compila", () => {
    expect(() => new Script(SITE_JS)).not.toThrow();
  });

  it("nessuna pagina porta script inline: la CSP li rifiuterebbe", () => {
    for (const page of [landingPage(), signupPage(), shopPage(), pupPage("x"), kennelPage("a"), confirmPage("t".repeat(30))]) {
      const scripts = [...page.matchAll(/<script\b([^>]*)>/g)].map((match) => match[1] ?? "");
      expect(scripts.every((attrs) => attrs.includes("src="))).toBe(true);
      expect(page).not.toMatch(/\son[a-z]+=/);
    }
  });

  it("i dati scritti nella pagina sono sempre escapati", () => {
    expect(kennelPage('"><script>')).not.toContain('"><script>');
    expect(confirmPage('"><img src=x>' + "a".repeat(20))).not.toContain('"><img');
  });
});
