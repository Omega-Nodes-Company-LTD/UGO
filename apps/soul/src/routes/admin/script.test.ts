import { createContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { ADMIN_SCRIPT } from "./script.js";
import { ADMIN_PAGE } from "./page.js";

/**
 * The panel is assembled from several modules concatenated into one script, so
 * two of them can each declare `const SPECIES_LABEL` and be individually
 * fine — while the result dies at parse time and takes the whole page with it.
 *
 * That is exactly what happened, and it survived a local e2e run because the
 * filtered command did not rebuild soul. `new Script` compiles without
 * running, which is all this needs: a duplicate declaration is an early
 * error, raised before a single line executes.
 */
describe("the assembled panel script", () => {
  it("parses, so a duplicate declaration across modules cannot ship", () => {
    expect(() => new Script(ADMIN_SCRIPT)).not.toThrow();
  });

  it("declares each top-level const exactly once", () => {
    const names = [...ADMIN_SCRIPT.matchAll(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)].map(
      (match) => match[1],
    );
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
  });

  /**
   * Found by looking at the rendered panel, not by reading the code: one 404
   * on a route this server had not registered left the whole page blank,
   * because the loaders were an awaited chain on the critical path of logging
   * in. Everything after the first failure never ran.
   *
   * The panel is what the owner opens when something is ALREADY wrong, so a
   * section that breaks must cost that section and nothing else.
   */
  it("loads every section behind the guard, so one broken section is not a blank page", () => {
    // `boot` is the critical path: what it awaits runs before anything is on
    // screen, so an unguarded loader there is a blank page and a token prompt.
    // `go` is the router and guards each page's loaders itself.
    const boot = /async function boot\(\)[\s\S]*?\n\}/.exec(ADMIN_SCRIPT)?.[0] ?? "";
    expect(boot, "the boot sequence moved or was renamed").not.toBe("");
    const unguarded = [...boot.matchAll(/await (\w+)\(/g)]
      .map((match) => match[1])
      .filter((name) => name !== "section" && name !== "go");
    expect(unguarded).toEqual([]);
  });

  /**
   * NB per chi scrive qui dentro: un backtick NON escapato dentro un modulo
   * del pannello chiude il template letterale, e il resto del file diventa
   * TypeScript rotto — capitato scrivendo il nome di un campo fra backtick in
   * un commento (ADR-100). Non c'è un test: lo prende `tsc` in un secondo, e
   * una guardia qui non potrebbe distinguerlo da un backtick escapato
   * legittimo (ce ne sono, e servono). Se un giorno il file non compila e
   * l'errore indica una riga che sembra innocua, è questo.
   */
  it("wires every element the script reaches for", () => {
    const ids = new Set([...ADMIN_PAGE.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
    const wanted = [...ADMIN_SCRIPT.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
    const missing = [...new Set(wanted)].filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  /**
   * ADR-019 fase 3, con i denti. La promessa «la casa viaggia con OGNI
   * chiamata» era un commento sopra `forWho`, e la manteneva un loader su
   * sette: con due case il pannello rispondeva 400 su metà delle sezioni e
   * mostrava la casa sbagliata sull'altra metà. Da qui in poi lo scope sta
   * nel telaio — `call()` passa da `scoped()` — così una sezione nuova nasce
   * scoped senza che nessuno debba ricordarselo. Questo test lo ESEGUE,
   * non lo legge: se qualcuno stacca `scoped()` da `call()` o ne rompe la
   * logica, qui diventa rosso.
   */
  it("carries the selected house on every API call, structurally", () => {
    // call() must route through scoped(): the one line the whole rule hangs on
    expect(ADMIN_SCRIPT).toMatch(/fetch\(scoped\(path\)/);

    const source = /const scoped = \(path\) => \{[\s\S]*?\n\};/.exec(ADMIN_SCRIPT)?.[0];
    expect(source, "scoped() moved or was renamed").toBeDefined();
    const context = createContext({ ACCOUNT: "11111111-2222-4333-8444-555555555555" });
    const scoped = new Script(`${source ?? ""}; scoped`).runInContext(context) as (
      path: string,
    ) => string;

    // a bare path gains the house; an existing query string is appended to
    expect(scoped("/v1/rooms")).toBe("/v1/rooms?casa=11111111-2222-4333-8444-555555555555");
    expect(scoped("/v1/memories?q=x")).toBe(
      "/v1/memories?q=x&casa=11111111-2222-4333-8444-555555555555",
    );
    // forWho already carries the house: no duplicate parameter
    expect(scoped("/v1/stats?casa=altra")).toBe("/v1/stats?casa=altra");
    // outside /v1 nothing changes, and with a single house nothing ever does
    expect(scoped("/health")).toBe("/health");
    context.ACCOUNT = "";
    expect(scoped("/v1/rooms")).toBe("/v1/rooms");
  });

  it("probes the token on a route that does not demand a house", () => {
    // '/v1/stats' as the gate probe answers 400 «Which house?» with two
    // houses, which the gate reads as a bad token: nobody can log in
    const gate = /save-token[\s\S]*?\n\}\);/.exec(ADMIN_SCRIPT)?.[0] ?? "";
    expect(gate).toContain('call("/v1/accounts"');
    expect(gate).not.toContain('call("/v1/stats"');
  });

  /**
   * ADR-109: gli scalini della durata esistono in due posti che devono
   * restare veri insieme — il `check` nel database e `PHOTO_RETENTION_STEPS`.
   * Un terzo elenco scritto a mano nel pannello sarebbe quello che diverge
   * per primo, e diverge in silenzio: la tendina offrirebbe una durata che
   * il database rifiuta, e il proprietario leggerebbe un errore incomprensibile
   * al posto di una scelta.
   */
  it("l'album prende gli scalini dal server, non da una copia nel pannello", () => {
    const album = /const albumStepLabel[\s\S]*?async function loadAlbum\(\)[\s\S]*?\n\}/.exec(
      ADMIN_SCRIPT,
    )?.[0];
    expect(album, "il modulo dell'album è stato rinominato o spostato").toBeDefined();
    expect(album).toContain("data.steps");
    // nessuna lista di ore scritta a mano: 0, 6, 12, 48, 72 possono comparire
    // solo come etichette da tradurre, mai come l'elenco di ciò che è possibile
    expect(album).not.toMatch(/\[\s*0\s*,\s*6\s*,/u);
  });

  /**
   * ADR-109 §1: dal pannello si guarda e si butta, **non si scatta**. Uno
   * scatto lo chiede una persona al corpo; un bottone «scatta» qui sarebbe
   * la casa che fotografa una stanza in cui nessuno ha chiesto niente.
   */
  it("il pannello non ha un modo per far scattare una foto", () => {
    expect(ADMIN_SCRIPT).not.toMatch(/\/v1\/album\/[^"']*sca?tta/u);
    expect(ADMIN_PAGE).not.toMatch(/id="album-shoot"/u);
  });
});
