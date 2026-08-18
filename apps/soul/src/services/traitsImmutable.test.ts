import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * «Si adotta, non si configura» — CLAUDE.md regola 13, divieto assoluto.
 *
 * È una regola che vive in un documento, e i documenti non fermano nessuno: la
 * manopola dei tratti la aggiungerebbe qualcuno una sera, con le migliori
 * intenzioni, perché «tanto è solo per correggere un archetipo sbagliato». Da
 * qui in poi quella sera diventa un test rosso.
 *
 * Il genoma si scrive **una volta**, alla nascita — da qualunque delle porte da
 * cui si nasce. Un `UPDATE` su `trait_sets` è la differenza fra una creatura e
 * un'impostazione, e questo test lo cerca dove potrebbe comparire.
 */

const ROOT = join(import.meta.dirname, "..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sources(path));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

describe("il genoma non si regola dopo la nascita", () => {
  it("nessuno aggiorna `trait_sets`: si scrive alla nascita e basta", () => {
    const offenders = sources(ROOT).filter((path) => {
      const code = readFileSync(path, "utf8");
      // `update(traitSets)` in drizzle, e il SQL a mano che lo aggirerebbe
      return /update\(\s*traitSets\s*\)/u.test(code) || /update\s+trait_sets/iu.test(code);
    });
    expect(offenders.map((path) => path.slice(ROOT.length + 1))).toEqual([]);
  });

  it("e non c'è nessuna rotta che prometta di farlo", () => {
    // una PATCH sull'esemplare esiste (ADR-036) e sposta di stanza: quella sì.
    // Una che accettasse `traits` sarebbe il configuratore con le orecchie
    const routes = sources(join(ROOT, "routes"));
    const suspicious = routes.filter((path) => {
      const code = readFileSync(path, "utf8");
      return /app\.(patch|put)\([^)]*\)[\s\S]{0,400}?traitsSchema/u.test(code);
    });
    expect(suspicious.map((path) => path.slice(ROOT.length + 1))).toEqual([]);
  });
});
