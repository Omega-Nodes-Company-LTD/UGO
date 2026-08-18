import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Il grafo del workspace e il contesto dell'immagine devono raccontare la
 * stessa storia.
 *
 * `soul.Dockerfile` non copia il repo: copia **l'elenco a mano** dei pacchetti
 * che servono. Quell'elenco invecchia in silenzio — basta una dipendenza nuova
 * e l'immagine si rompe, ma solo in CI, dieci minuti dopo, o peggio al deploy.
 * È successo davvero con `registry`, aggiunto a soul per il test d'integrazione
 * dell'adozione (ADR-084): tutto verde qui, rosso là.
 *
 * Da qui in poi la dimenticanza costa dieci millisecondi invece di dieci
 * minuti. Le dipendenze di sviluppo contano quanto le altre: `turbo` costruisce
 * anche quelle prima di soul, e `pnpm deploy` deve poterle risolvere per
 * potarle.
 */

const SOUL = import.meta.dirname.replace(/\/src$/u, "");
const DOCKERFILE = join(SOUL, "..", "..", "ops", "docker", "soul.Dockerfile");

const manifest = JSON.parse(readFileSync(join(SOUL, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const dockerfile = readFileSync(DOCKERFILE, "utf8");

/** I nomi dei pacchetti di workspace da cui soul dipende, dev compresi. */
const workspaceDeps = Object.entries({
  ...manifest.dependencies,
  ...manifest.devDependencies,
})
  .filter(([, range]) => range.startsWith("workspace:"))
  .map(([name]) => name);

/** Dove vive, nel repo, il pacchetto che si chiama così. */
function directoryOf(name: string): string {
  const root = join(SOUL, "..", "..");
  for (const area of ["apps", "packages", "tests"]) {
    const candidate = join(root, area, name.replace(/^@ugo\//u, ""));
    try {
      const found = JSON.parse(readFileSync(join(candidate, "package.json"), "utf8")) as {
        name?: string;
      };
      if (found.name === name) return `${area}/${name.replace(/^@ugo\//u, "")}`;
    } catch {
      continue;
    }
  }
  throw new Error(`pacchetto di workspace non trovato nel repo: ${name}`);
}

describe("il contesto dell'immagine di soul", () => {
  it("dichiara almeno le dipendenze che ci aspettiamo", () => {
    // se un giorno sparissero tutte, il test sotto passerebbe a vuoto
    expect(workspaceDeps.length).toBeGreaterThanOrEqual(4);
    expect(workspaceDeps).toContain("@ugo/db");
  });

  for (const name of workspaceDeps) {
    it(`copia il manifesto e i sorgenti di ${name}`, () => {
      const dir = directoryOf(name);
      expect(dockerfile).toContain(`COPY ${dir}/package.json ${dir}/`);
      expect(dockerfile).toContain(`COPY ${dir} ${dir}`);
    });
  }
});
