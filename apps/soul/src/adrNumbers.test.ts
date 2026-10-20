import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Due ADR non possono avere lo stesso numero, e nessuno può stare fuori
 * dall'indice.
 *
 * Questa guardia nasce dopo **tre** collisioni, e due delle tre sono passate
 * in silenzio attraverso una CI verde:
 *
 * - il merge di #93 lasciò due ADR-099 — `a1eb3a0` li separò a mano;
 * - il merge di #103 lasciò due ADR-108… e poi **anche** due 109 e due 110.
 *
 * Il secondo caso spiega perché la guardia controlla due cose e non una. I
 * tre ADR della #103 non erano entrati in `README.md`, e chi è venuto dopo ha
 * contato i numeri liberi **dall'indice**: ha visto 109 e 110 disponibili e li
 * ha presi in buona fede. Un ADR fuori dall'indice non è un difetto di forma —
 * è un numero che il prossimo riassegna. Quindi «unico» e «elencato» sono lo
 * stesso invariante guardato da due lati, e vanno asseriti insieme.
 *
 * È strutturale come `exportCoverage.test.ts`, e per la stessa ragione: la
 * cosa che si dimentica non è scrivere il documento, è dichiararlo dove
 * qualcun altro lo cercherà.
 */

const ADR = join(import.meta.dirname, "..", "..", "..", "docs", "ADR");
/** `012-persistenza-baseline-psiche.md` → `{ number: "012", file }` */
const FILE_SHAPE = /^(\d{3})-[a-z0-9-]+\.md$/u;
/** la riga dell'indice: `| [012](./012-….md) | Titolo | Stato |` */
const INDEX_LINK = /^\|\s*\[(\d{3})\]\(\.\/([^)]+)\)/gmu;

interface AdrFile {
  number: string;
  file: string;
}

function onDisk(): AdrFile[] {
  const found: AdrFile[] = [];
  for (const file of readdirSync(ADR)) {
    const match = FILE_SHAPE.exec(file);
    if (match?.[1] !== undefined) found.push({ number: match[1], file });
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

const indexSource = readFileSync(join(ADR, "README.md"), "utf8");
const linked = [...indexSource.matchAll(INDEX_LINK)].map((match) => ({
  number: match[1] ?? "",
  file: match[2] ?? "",
}));

describe("i numeri degli ADR", () => {
  it("si leggono davvero: se la lettura si rompe, il test non deve passare a vuoto", () => {
    // il pattern di exportCoverage: una guardia che non trova niente è una
    // guardia verde che non sta guardando
    expect(onDisk().length).toBeGreaterThan(50);
    expect(linked.length).toBeGreaterThan(50);
  });

  it("sono unici: nessun numero appartiene a due decisioni", () => {
    const byNumber = new Map<string, string[]>();
    for (const adr of onDisk()) {
      byNumber.set(adr.number, [...(byNumber.get(adr.number) ?? []), adr.file]);
    }
    const doubled = [...byNumber.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([number, files]) => `${number}: ${files.join(" + ")}`);
    expect(
      doubled,
      "due decisioni con lo stesso numero. Chi è arrivato primo tiene il numero, l'altro scala al primo libero — e va messo nell'indice, o il prossimo riassegnerà il suo.",
    ).toEqual([]);
  });

  it("sono tutti nell'indice, perché è da lì che si conta il prossimo libero", () => {
    const listed = new Set(linked.map((entry) => entry.file));
    const missing = onDisk()
      .filter((adr) => !listed.has(adr.file))
      .map((adr) => adr.file);
    expect(
      missing,
      "ADR su disco e non in docs/ADR/README.md. È così che il merge di #103 ha prodotto tre numeri doppi invece di uno: chi è venuto dopo ha contato dall'indice.",
    ).toEqual([]);
  });

  it("e l'indice non promette documenti che non esistono", () => {
    const present = new Set(onDisk().map((adr) => adr.file));
    const dangling = linked.filter((entry) => !present.has(entry.file)).map((entry) => entry.file);
    expect(dangling, "righe dell'indice che puntano a un file assente").toEqual([]);
  });

  /**
   * E il numero dentro il documento è quello del suo nome.
   *
   * Questa l'ha trovata la rinumerazione stessa: 117, 118 e 119 erano stati
   * spostati da un altro giro di collisioni **senza aggiornare il titolo**, e
   * si intitolavano ancora ADR-109, ADR-110 e ADR-111. Il nome del file è la
   * verità, perché è quello che l'indice linka; un titolo rimasto indietro fa
   * credere a chi legge il documento che il numero sia un altro — ed è così
   * che nel codice sono finiti commenti che citano «ADR-109» intendendo le
   * orecchie di casa, cioè un numero che adesso appartiene a un'altra
   * decisione.
   */
  it("e il titolo dentro il documento porta il numero del suo nome", () => {
    const mismatched: string[] = [];
    for (const adr of onDisk()) {
      const first = readFileSync(join(ADR, adr.file), "utf8").split("\n", 1)[0] ?? "";
      const titled = /ADR-(\d{3})/u.exec(first)?.[1];
      if (titled !== undefined && titled !== adr.number) {
        mismatched.push(`${adr.file} si intitola ADR-${titled}`);
      }
    }
    expect(mismatched, "titolo e nome del file dicono due numeri diversi").toEqual([]);
  });

  it("e il numero nel link è quello del file che nomina", () => {
    // un copia-incolla sbagliato nell'indice — `[121](./122-….md)` — manda
    // altrove chi segue il link, e il conteggio del prossimo libero resta
    // giusto per caso
    const crossed = linked
      .filter((entry) => !entry.file.startsWith(`${entry.number}-`))
      .map((entry) => `[${entry.number}] → ${entry.file}`);
    expect(crossed, "il numero dell'indice non combacia col file linkato").toEqual([]);
  });
});
