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
  /**
   * Quello che è vietato è **toccare i tratti**, non la riga.
   *
   * Distinzione imparata da questo stesso test: la cessione (ADR-082) fa un
   * `update(traitSets)` per cambiare la CASA a cui la riga appartiene — il
   * genoma resta identico byte per byte, si sposta il proprietario. Una
   * guardia che avesse continuato a urlare lì avrebbe insegnato a disattivarla,
   * ed è così che muoiono le guardie.
   */
  const TOUCHES_TRAITS = /update\(\s*traitSets\s*\)[\s\S]{0,200}?\btraits\s*:/u;
  const RAW_SQL = /update\s+trait_sets[\s\S]{0,200}?\bset\b[\s\S]{0,120}?\btraits\b/iu;

  it("nessuno riscrive i tratti: si scrivono alla nascita e basta", () => {
    const offenders = sources(ROOT).filter((path) => {
      const code = readFileSync(path, "utf8");
      return TOUCHES_TRAITS.test(code) || RAW_SQL.test(code);
    });
    expect(offenders.map((path) => path.slice(ROOT.length + 1))).toEqual([]);
  });

  it("ma spostare la riga di casa è un'altra cosa, e deve restare possibile", () => {
    // la cessione cambia il proprietario del genoma, non il genoma: se un
    // giorno questo file smettesse di farlo, vorrebbe dire che un nato non
    // può più cambiare casa
    const transfer = readFileSync(join(ROOT, "services", "transferService.ts"), "utf8");
    expect(/update\(\s*traitSets\s*\)/u.test(transfer)).toBe(true);
    expect(TOUCHES_TRAITS.test(transfer)).toBe(false);
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
