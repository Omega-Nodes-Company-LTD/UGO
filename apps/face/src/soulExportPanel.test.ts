import { describe, expect, it } from "vitest";
import { downloadName, exportRefusal, optionsVerdict } from "./soulExportPanel.js";

/**
 * «Porta l'anima a casa» sul chiosco (ADR-132, MKT-10.4) — la parte pura.
 *
 * Le due cose che, sbagliate, fanno danno: quando il blocco compare (mai per
 * una funzione che non esiste), e cosa si dice a chi sta davanti a uno schermo
 * che vedono tutti.
 */

describe("quando il blocco compare", () => {
  it("spenta lato server (404) non compare: un bottone per ciò che non c'è è peggio di niente", () => {
    expect(optionsVerdict(404)).toBe("hidden");
  });

  it("accesa ma senza il token giusto, compare e chiede il token", () => {
    expect(optionsVerdict(401)).toBe("needs-token");
    expect(optionsVerdict(403)).toBe("needs-token");
  });

  it("accesa e permessa, è pronta", () => {
    expect(optionsVerdict(200)).toBe("ready");
  });

  it("un guasto del server non lo fa comparire come se andasse tutto bene", () => {
    expect(optionsVerdict(500)).toBe("hidden");
    expect(optionsVerdict(502)).toBe("hidden");
  });
});

describe("cosa si dice quando non va", () => {
  it("distingue il nome sbagliato, il troppo presto e la creatura che non c'è", () => {
    expect(exportRefusal(422)).toMatch(/nome/u);
    expect(exportRefusal(429)).toMatch(/volta|ora|aspett/u);
    expect(exportRefusal(404)).toMatch(/non (la )?trov/iu);
    expect(exportRefusal(401)).toMatch(/token/u);
    expect(exportRefusal(403)).toMatch(/token/u);
  });

  it("per il resto dà un numero e una via d'uscita, mai un dettaglio del server", () => {
    const text = exportRefusal(500);
    expect(text).toContain("500");
    expect(text).toMatch(/pannello|riprova/iu);
  });
});

describe("il nome del file", () => {
  it("lo legge dall'intestazione", () => {
    expect(downloadName('attachment; filename="ugo-2026-11-23.ugosoul"')).toBe("ugo-2026-11-23.ugosoul");
  });

  it("senza intestazione o con una strana, ripiega su un nome sicuro", () => {
    expect(downloadName(null)).toBe("anima.ugosoul");
    expect(downloadName("inline")).toBe("anima.ugosoul");
  });

  it("non si lascia scrivere un percorso o un'estensione diversa dal server", () => {
    expect(downloadName('attachment; filename="../../x.exe"')).toBe("anima.ugosoul");
    expect(downloadName('attachment; filename="a/b.ugosoul"')).toBe("anima.ugosoul");
  });
});
