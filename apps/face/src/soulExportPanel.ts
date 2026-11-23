import { nameMatches } from "./names.js";

/**
 * «Porta l'anima a casa», sul chiosco (ADR-132, MKT-10.4).
 *
 * Vive dentro «I tuoi dati» e ne eredita i due patti (ADR-090): il token
 * dell'account si chiede lì per lì e non si tiene, e si scrive il nome della
 * creatura prima di un atto che consegna la sua intera biografia.
 *
 * Una cosa in più, perché qui il file ha una frase di recupero: **compare una
 * volta sola** sullo schermo, e sparisce quando si chiude il pannello. Su uno
 * schermo che passano tutti è breve per scelta; chi vuole conservarla la
 * scrive su carta, ed è esattamente quello che il testo gli dice di fare.
 */

export type OptionsVerdict = "hidden" | "needs-token" | "ready";

/**
 * Quando il blocco compare, senza un contratto in più: se la funzione è
 * spenta lato server la rotta **non esiste** (404), se è accesa risponde
 * sempre (401/403 senza il token giusto, 200 con). Un guasto non la fa
 * comparire: un bottone per qualcosa che non sai se c'è è peggio di niente.
 */
export function optionsVerdict(status: number): OptionsVerdict {
  if (status === 200) return "ready";
  if (status === 401 || status === 403) return "needs-token";
  return "hidden";
}

/** Le parole del rifiuto, distinte perché sono cose diverse. */
export function exportRefusal(status: number): string {
  if (status === 401 || status === 403) {
    return "Serve il token dell'account: questo schermo lo vedono tutti.";
  }
  if (status === 422) return "Il nome non combacia: scrivilo come l'hai scelto.";
  if (status === 404) return "Non la trovo: forse non è più in questa casa.";
  if (status === 429) return "Ne hai già chiesti parecchi: riprova fra un'ora, o più tardi.";
  return `Non ci sono riuscito (${String(status)}). Riprova, o fallo dal pannello.`;
}

/**
 * Il nome con cui salvare. Lo decide soul, ma si rilegge con la stessa
 * disciplina con cui lo scrive (`[a-z0-9-]` e `.ugosoul`): un'intestazione
 * strana non deve poter far scrivere altro che un archivio.
 */
export function downloadName(contentDisposition: string | null): string {
  const match = /filename="([a-z0-9-]+\.ugosoul)"/u.exec(contentDisposition ?? "");
  return match?.[1] ?? "anima.ugosoul";
}

export interface SoulExportElements {
  box: HTMLElement;
  who: HTMLSelectElement;
  confirm: HTMLInputElement;
  button: HTMLElement;
  codeBox: HTMLElement;
  code: HTMLElement;
}

export interface SoulExportDeps {
  soulHttp: string;
  /** il token digitato adesso, o quello del chiosco */
  acting: () => string | undefined;
  say: (text: string) => void;
}

export interface SoulExportPanel {
  /** chiede a soul se c'è e chi si può portare; da chiamare all'apertura e col token nuovo */
  refresh: () => Promise<void>;
  /** il codice e il nome scritto non sopravvivono alla chiusura */
  reset: () => void;
}

interface Creature {
  id: string;
  name: string;
}

export function mountSoulExport(elements: SoulExportElements, deps: SoulExportDeps): SoulExportPanel {
  let creatures: Creature[] = [];

  const headers = (token: string | undefined): Record<string, string> =>
    token === undefined || token === "" ? {} : { authorization: `Bearer ${token}` };

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch(`${deps.soulHttp}/v1/privacy/soul-export/options`, {
        headers: headers(deps.acting()),
      });
      const verdict = optionsVerdict(response.status);
      elements.box.hidden = verdict === "hidden";
      elements.who.replaceChildren(new Option("— chi? —", ""));
      creatures = [];
      if (verdict !== "ready") return;
      const body = (await response.json()) as { creatures?: Creature[] };
      creatures = body.creatures ?? [];
      for (const creature of creatures) elements.who.append(new Option(creature.name, creature.id));
    } catch {
      // senza rete il chiosco vive lo stesso; questo blocco semplicemente non compare
      elements.box.hidden = true;
    }
  };

  const reset = (): void => {
    elements.confirm.value = "";
    elements.code.textContent = "";
    elements.codeBox.hidden = true;
  };

  elements.button.addEventListener("click", () => {
    const chosen = creatures.find((creature) => creature.id === elements.who.value);
    if (chosen === undefined) {
      deps.say("Prima dimmi chi.");
      return;
    }
    if (!nameMatches(elements.confirm.value, chosen.name)) {
      deps.say(`Scrivi «${chosen.name}» per confermare.`);
      return;
    }
    const token = deps.acting();
    if (token === undefined || token === "") {
      deps.say(exportRefusal(401));
      return;
    }
    void (async () => {
      deps.say("Preparo l'archivio…");
      const response = await fetch(`${deps.soulHttp}/v1/privacy/soul-export`, {
        method: "POST",
        headers: { ...headers(token), "content-type": "application/json" },
        body: JSON.stringify({ gosinoId: chosen.id, mode: "trasloco", confirmName: elements.confirm.value }),
      });
      if (!response.ok) {
        deps.say(exportRefusal(response.status));
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadName(response.headers.get("content-disposition"));
      link.click();
      URL.revokeObjectURL(url);
      elements.confirm.value = "";
      elements.code.textContent = response.headers.get("x-ugo-recovery-code") ?? "";
      elements.codeBox.hidden = false;
      deps.say("Scaricato. Scrivi il codice qui sotto su carta: compare una volta sola.");
    })().catch(() => {
      deps.say("Non ci sono riuscito: la connessione è caduta. Riprova.");
    });
  });

  return { refresh, reset };
}
