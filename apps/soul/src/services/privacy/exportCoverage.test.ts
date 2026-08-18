import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * L'export deve conoscere ogni tabella (ADR-089).
 *
 * `exportService.ts` elenca le tabelle **a mano**, in SQL grezzo. È una scelta
 * giusta — ogni riga dichiara quali colonne escono, e su una che porta
 * biometria o chiavi la differenza è tutta — ma ha un difetto che non si vede:
 * una tabella nuova non bussa. Diciassette erano entrate nello schema senza
 * mai uscire dall'export, e il commento in cima al file continuava a
 * promettere «ogni byte».
 *
 * Da qui in poi bussano. Una tabella nuova o entra nell'export, o entra
 * nell'elenco qui sotto **con scritto perché**: le due cose insieme sono la
 * definizione di una decisione presa, invece che di una dimenticanza.
 */

const SCHEMA = join(import.meta.dirname, "..", "..", "..", "..", "..", "packages", "db", "src", "schema");
const EXPORT = join(import.meta.dirname, "exportService.ts");

/**
 * Le tabelle che **non** vanno nell'export di una casa, e la ragione.
 *
 * L'elenco è corto apposta: ogni voce è una cosa che il proprietario non
 * riceve, e ognuna deve reggere davanti a chi chiede «perché no».
 */
const NOT_PERSONAL: Readonly<Record<string, string>> = {
  // esportare l'hash di un token è consegnare le credenziali di casa dentro
  // il file che si manda per email al Garante o a sé stessi
  access_tokens: "credenziali: sono hash di token, non dati della famiglia",
};

function tablesInSchema(): string[] {
  const found = new Set<string>();
  for (const file of readdirSync(SCHEMA)) {
    if (!file.endsWith(".ts")) continue;
    const source = readFileSync(join(SCHEMA, file), "utf8");
    for (const match of source.matchAll(/pgTable\(\s*"([a-z_]+)"/gu)) {
      const name = match[1];
      if (name !== undefined) found.add(name);
    }
  }
  return [...found].sort();
}

const exportSource = readFileSync(EXPORT, "utf8");
/** Le tabelle nominate in un `from`, comprese quelle delle sottoquery. */
const exported = new Set(
  [...exportSource.matchAll(/\bfrom\s+([a-z_]+)/gu)].map((match) => match[1] ?? ""),
);

describe("la copertura dell'export", () => {
  it("trova davvero le tabelle: se la lettura si rompe, il test non deve passare a vuoto", () => {
    const tables = tablesInSchema();
    expect(tables.length).toBeGreaterThan(30);
    expect(tables).toContain("messages");
    expect(exported.size).toBeGreaterThan(30);
  });

  for (const table of tablesInSchema()) {
    it(`${table} esce dall'export, o è dichiarata come non esportabile`, () => {
      const excused = NOT_PERSONAL[table];
      if (excused !== undefined) {
        expect(excused.length).toBeGreaterThan(20);
        return;
      }
      expect(
        exported.has(table),
        `«${table}» non compare in exportService.ts. O la si esporta, o la si mette in NOT_PERSONAL con scritto perché — una tabella che nessuno ha deciso è una tabella dimenticata.`,
      ).toBe(true);
    });
  }
});
