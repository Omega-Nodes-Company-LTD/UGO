import { describe, expect, it } from "vitest";
import { micBlocked, micFailure } from "./micReason.js";

/**
 * La diagnosi del microfono.
 *
 * Nata dal registro del telefono del proprietario: un muro di
 * `not-allowed`/`network` del riconoscitore, cioè il SECONDO effetto, mentre
 * la causa — il telefono che non concede il microfono a questa pagina — non
 * compariva da nessuna parte. Queste sono funzioni pure: la mappa dai guasti
 * alle frasi si prova qui, il cablaggio sta in `main.ts`.
 */

describe("l'impedimento che si conosce prima di chiedere", () => {
  it("una pagina in chiaro è la causa, e la frase nomina https", () => {
    const why = micBlocked({ isSecureContext: false, navigator: { mediaDevices: {} } });
    expect(why).toBeDefined();
    expect(why).toContain("https");
  });

  it("contesto sicuro e microfono esposto: non c'è niente da dire, si prova", () => {
    expect(micBlocked({ isSecureContext: true, navigator: { mediaDevices: {} } })).toBeUndefined();
  });

  it("niente mediaDevices in un contesto sicuro è il browser, non l'indirizzo", () => {
    const why = micBlocked({ isSecureContext: true, navigator: {} });
    expect(why).toBeDefined();
    expect(why).not.toContain("https");
  });

  it("senza sapere se il contesto è sicuro, l'indirizzo resta l'ipotesi utile", () => {
    expect(micBlocked({ navigator: {} })).toContain("https");
  });
});

describe("il motivo di un microfono che non si apre", () => {
  it("permesso negato: si dice DOVE si concede, non «non disponibile»", () => {
    const why = micFailure({ name: "NotAllowedError" });
    expect(why).toContain("negato");
    expect(why).toContain("impostazioni del sito");
  });

  it("l'alias storico di Android dice la stessa cosa", () => {
    expect(micFailure({ name: "PermissionDeniedError" })).toBe(micFailure({ name: "NotAllowedError" }));
  });

  it("nessun microfono e microfono occupato non si confondono", () => {
    expect(micFailure({ name: "NotFoundError" })).toContain("nessun microfono");
    expect(micFailure({ name: "NotReadableError" })).toContain("un'altra applicazione");
  });

  it("un guasto sconosciuto porta il suo nome, invece di sparire", () => {
    expect(micFailure({ name: "OverconstrainedError" })).toContain("OverconstrainedError");
  });

  it("un `catch` può ricevere qualunque cosa, e la frase regge lo stesso", () => {
    expect(micFailure("boh")).not.toBe("");
    expect(micFailure(undefined)).not.toBe("");
  });
});
