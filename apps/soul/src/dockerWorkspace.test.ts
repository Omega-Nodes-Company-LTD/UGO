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
 *
 * **E poi ha mancato di un livello, il 2026-08-19.** Guardava le dipendenze di
 * soul, ma l'immagine costruisce anche il **muso** (`--filter=face`, ADR-018
 * Tempo 1: la faccia viaggia dentro l'immagine di soul). Quando il corpo è
 * uscito in `@ugo/face-body` (ADR-115) la nuova dipendenza era del muso e non
 * di soul: qui tutto verde, immagine rossa in CI — esattamente il fallimento
 * che questo file esiste per impedire, un piano più in là.
 *
 * Adesso i filtri si **leggono dal Dockerfile**: qualunque app quell'immagine
 * costruisca, le sue dipendenze di workspace devono essere copiate. Chiedere
 * al file cosa costruisce, invece di ricordarselo, è l'unico modo perché la
 * guardia non invecchi insieme a ciò che sorveglia.
 */

const SOUL = import.meta.dirname.replace(/\/src$/u, "");
const DOCKERFILE = join(SOUL, "..", "..", "ops", "docker", "soul.Dockerfile");

const dockerfile = readFileSync(DOCKERFILE, "utf8");

/** Le app che QUESTA immagine costruisce, lette dal comando `turbo` che c'è dentro. */
function builtApps(): string[] {
  const line = /pnpm turbo build((?:\s+--filter=[\w@/-]+)+)/u.exec(dockerfile);
  const filters = line?.[1] ?? "";
  return [...filters.matchAll(/--filter=([\w@/-]+)/gu)].map((match) => match[1] ?? "");
}

function manifestOf(dir: string): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

/** Tutti i pacchetti di workspace che servono a costruire quello che l'immagine costruisce. */
const workspaceDeps = [
  ...new Set(
    builtApps().flatMap((app) => {
      const dir = join(SOUL, "..", app === "soul" ? "soul" : app);
      const found = manifestOf(dir);
      return Object.entries({ ...found.dependencies, ...found.devDependencies })
        .filter(([, range]) => range.startsWith("workspace:"))
        .map(([name]) => name);
    }),
  ),
];

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

  it("legge dal Dockerfile quali app costruisce, invece di ricordarselo", () => {
    // se il comando cambiasse forma, `builtApps()` tornerebbe vuoto e ogni
    // controllo sotto sparirebbe in silenzio: questa riga lo impedisce
    expect(builtApps()).toContain("soul");
    expect(builtApps().length).toBeGreaterThanOrEqual(2);
  });

  for (const name of workspaceDeps) {
    it(`copia il manifesto e i sorgenti di ${name}`, () => {
      const dir = directoryOf(name);
      expect(dockerfile).toContain(`COPY ${dir}/package.json ${dir}/`);
      expect(dockerfile).toContain(`COPY ${dir} ${dir}`);
    });
  }
});
