/**
 * Il chiosco nascondibile (ADR-096).
 *
 * Due stati per lo stesso muso: ESTESO — barra in alto e colonna/foglio dei
 * comandi, etichette esplicite — e NASCOSTO — resta il dock di vetro con i
 * gesti primari e il sussurro d'umore. Il CSS fa tutto il lavoro leggendo
 * `data-chrome` su `#app`; qui vive solo la macchina a due stati e la sua
 * memoria per dispositivo. Nessun `document`: gli elementi arrivano iniettati
 * (stessa regola di `logPanel`/`voiceInvite`), così la parte pura si prova in
 * Node e il filo vero lo prova l'E2E.
 */

export type ChromeState = "esteso" | "nascosto";

/** la chiave sotto cui il dispositivo ricorda com'era il suo chiosco */
export const CHROME_STORE_KEY = "ugo.hud.chrome";

/**
 * Da storage a stato. Qualunque cosa non sia un nascondimento esplicito è il
 * chiosco esteso: un dispositivo nuovo o una stringa corrotta non devono mai
 * svegliarsi coi comandi spariti.
 */
export function parseChrome(raw: string | null): ChromeState {
  return raw === "nascosto" ? "nascosto" : "esteso";
}

export function toggleChrome(state: ChromeState): ChromeState {
  return state === "esteso" ? "nascosto" : "esteso";
}

export interface ChromeStore {
  read: () => string | null;
  write: (state: ChromeState) => void;
}

export interface HudChromeMountDeps {
  /** il contenitore che porta `data-chrome`: il CSS guarda solo lui */
  app: HTMLElement;
  /** i gesti che nascondono: «Nascondi» in barra e la presa del foglio */
  hide: HTMLElement[];
  /** il tasto ⌃ nel dock che riapre il chiosco */
  expand: HTMLElement;
  store: ChromeStore;
}

/** Il lato DOM: applica lo stato ricordato e collega i due gesti. */
export function mountHudChrome(deps: HudChromeMountDeps): void {
  const apply = (state: ChromeState): void => {
    deps.app.dataset.chrome = state;
    deps.store.write(state);
  };
  apply(parseChrome(deps.store.read()));
  for (const control of deps.hide) {
    control.addEventListener("click", () => {
      apply("nascosto");
    });
  }
  deps.expand.addEventListener("click", () => {
    apply("esteso");
  });
}
