import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Il kit di casa ascolta su 0.0.0.0 dentro il contenitore (serve a Docker): il
 * confine con la rete è la pubblicazione della porta. Questo test legge il
 * compose com'è e fallisce se qualcuno lo allarga (regola 4).
 */
const compose = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../../ops/home/compose.yml"), "utf8");

function serviceBlock(name: string): string {
  const start = compose.indexOf(`\n  ${name}:`);
  expect(start).toBeGreaterThan(-1);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}\S/u);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("ops/home/compose.yml — superficie esposta", () => {
  it("pubblica solo soul, e solo su 127.0.0.1", () => {
    const published = [...compose.matchAll(/^\s*-\s*"?([^"\n]*\d+:\d+)"?\s*$/gmu)].map((m) => m[1]);
    expect(published).toEqual(["127.0.0.1:3000:3000"]);
    expect(serviceBlock("postgres")).not.toMatch(/^\s*ports:/mu);
    expect(serviceBlock("soul")).toMatch(/127\.0\.0\.1:3000:3000/u);
  });

  it("il database sta solo sulla rete interna", () => {
    expect(serviceBlock("postgres")).toMatch(/networks:\s*\[backend\]/u);
    expect(compose).toMatch(/backend:\s*\n\s+internal:\s*true/u);
  });

  it("niente utente root né privilegi in più", () => {
    const soul = serviceBlock("soul");
    expect(soul).toMatch(/cap_drop:\s*\[ALL\]/u);
    expect(soul).toMatch(/no-new-privileges:true/u);
    expect(compose).not.toMatch(/privileged:\s*true|network_mode:\s*host/u);
  });
});
