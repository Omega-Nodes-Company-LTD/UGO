/**
 * «I tuoi dati», sul chiosco (ADR-090).
 *
 * I due diritti esistevano da sempre e vivevano in due posti dove una persona
 * non va: una rotta HTTP e il pannello di chi amministra. Chi vive in questa
 * casa vede solo il muso — e un diritto che si esercita altrove, per chi sta
 * davanti a quello schermo, è un diritto che non esiste.
 *
 * Due decisioni che questo file incarna, e che valgono più del codice:
 *
 * 1. **numeri, mai contenuti.** Lo schermo è in cucina e chiunque passa lo
 *    legge: stampare i ricordi sarebbe la cosa più indiscreta della casa. Un
 *    conto dice *quanto*, mai *cosa*.
 * 2. **il token si chiede al momento, e non si tiene.** Portare via tutto e
 *    cancellare qualcuno sono atti che su uno schermo condiviso non possono
 *    dipendere da chi ci passa davanti. Chiederlo ogni volta è attrito, ed è
 *    attrito giusto: è la differenza fra una porta e un buco nel muro.
 */

export interface DataSummary {
  beings: number;
  protected: number;
  messages: number;
  memories: number;
  diaryPages: number;
  transcriptSegments: number;
  prints: number;
  sightings: number;
  strangers: number;
}

export interface SummaryLine {
  label: string;
  value: number;
  /** una riga che parla di corpi si guarda diversamente da una che conta parole */
  body?: boolean;
}

/**
 * Cosa tiene, in italiano.
 *
 * Le righe ci sono **anche quando valgono zero**: «nessuna impronta
 * registrata» è una risposta, e nasconderla lascerebbe credere che la domanda
 * non sia stata fatta.
 */
export function summaryLines(summary: DataSummary): SummaryLine[] {
  return [
    { label: "persone e animali che conosce", value: summary.beings },
    { label: "di cui con una tutela accesa", value: summary.protected },
    { label: "cose dette, da tutti e due i lati", value: summary.messages },
    { label: "ricordi", value: summary.memories },
    { label: "pagine di diario", value: summary.diaryPages },
    { label: "pezzi di riunione trascritti", value: summary.transcriptSegments },
    { label: "impronte di voce o volto registrate", value: summary.prints, body: true },
    { label: "volte che ha visto o sentito qualcuno", value: summary.sightings, body: true },
    { label: "impronte di sconosciuti, non collegate a nessuno", value: summary.strangers, body: true },
  ];
}

/**
 * Il nome scritto combacia con quello scelto?
 *
 * Stesso patto del congedo (ADR-075): **un click solo non è un consenso a una
 * cosa irreversibile**. Tollerante sugli spazi e sulle maiuscole, perché una
 * tastiera a schermo le sbaglia; intollerante su tutto il resto, perché è
 * l'ultimo passo prima di una cosa che non si torna indietro.
 */
export function nameMatches(typed: string, chosen: string): boolean {
  const clean = (value: string): string => value.trim().toLowerCase().replace(/\s+/gu, " ");
  return clean(typed) !== "" && clean(typed) === clean(chosen);
}

/** Cosa si dice quando manca il token: non «errore», ma cosa fare. */
export function needTokenMessage(): string {
  return "Serve il token di casa: questo schermo lo vedono tutti, e portare via i dati o cancellare qualcuno non può dipendere da chi ci passa davanti.";
}

/** Le parole del rifiuto, distinte l'una dall'altra perché sono cose diverse. */
export function refusalMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "Quel token non basta per questa cosa. Serve quello di casa.";
  }
  if (status === 404) return "Non l'ho trovato: forse è già stato cancellato.";
  return `Non ci sono riuscito (${String(status)}). Riprova, o fallo dal pannello.`;
}

export interface MyDataElements {
  panel: HTMLElement;
  toggle: HTMLElement;
  close: HTMLElement;
  lines: HTMLElement;
  who: HTMLSelectElement;
  confirmName: HTMLInputElement;
  token: HTMLInputElement;
  forget: HTMLElement;
  exportAll: HTMLElement;
  message: HTMLElement;
}

export interface MyDataDeps {
  /** l'indirizzo di soul, già risolto dal chiosco */
  soulHttp: string;
  /** il token che il chiosco ha già: basta per i conti, non per gli atti */
  kioskToken: string | undefined;
}

/** Come li manda `/v1/pack`: il nome è `displayName`, non `name`. */
interface Being {
  id: string;
  displayName: string;
}

/**
 * Monta il pannello. Vive fuori da `main.ts` per la stessa ragione del log:
 * quel file è già oltre la regola delle 200 righe, e questa è una funzione
 * intera con il suo stato.
 */
export function mountMyData(elements: MyDataElements, deps: MyDataDeps): void {
  let beings: Being[] = [];

  const say = (text: string): void => {
    elements.message.textContent = text;
  };

  // `Record` e non `HeadersInit`: quest'ultimo ammette anche un array, e uno
  // spread su un array dà una lista di indici invece di intestazioni
  const headers = (token: string | undefined): Record<string, string> =>
    token === undefined || token === "" ? {} : { authorization: `Bearer ${token}` };

  /** Il token digitato adesso; se non c'è, quello del chiosco. */
  const acting = (): string | undefined => {
    const typed = elements.token.value.trim();
    return typed === "" ? deps.kioskToken : typed;
  };

  const drawLines = (summary: DataSummary): void => {
    elements.lines.replaceChildren();
    for (const line of summaryLines(summary)) {
      const row = document.createElement("li");
      if (line.body === true) row.dataset.body = "yes";
      const label = document.createElement("span");
      label.textContent = line.label;
      const value = document.createElement("b");
      value.textContent = String(line.value);
      row.append(value, label);
      elements.lines.append(row);
    }
  };

  const load = async (): Promise<void> => {
    try {
      const [summary, pack] = await Promise.all([
        fetch(`${deps.soulHttp}/v1/privacy/summary`, { headers: headers(deps.kioskToken) }),
        fetch(`${deps.soulHttp}/v1/pack`, { headers: headers(deps.kioskToken) }),
      ]);
      if (!summary.ok) {
        say(refusalMessage(summary.status));
        return;
      }
      drawLines((await summary.json()) as DataSummary);
      if (pack.ok) {
        const body = (await pack.json()) as { beings?: Being[] };
        beings = body.beings ?? [];
        elements.who.replaceChildren();
        elements.who.append(new Option("— chi? —", ""));
        for (const being of beings) elements.who.append(new Option(being.displayName, being.id));
      }
      say("");
    } catch {
      // il chiosco vive anche senza rete: qui non si finge un conto a zero,
      // perché uno zero inventato è la bugia peggiore in questa pagina
      say("Non riesco a chiedere a UGO cosa tiene. Riprova fra un momento.");
    }
  };

  elements.toggle.addEventListener("click", () => {
    const opening = elements.panel.hidden;
    elements.panel.hidden = !opening;
    if (opening) void load();
  });
  elements.close.addEventListener("click", () => {
    elements.panel.hidden = true;
    // il token digitato non sopravvive alla chiusura: non è nostro da tenere
    elements.token.value = "";
  });

  elements.exportAll.addEventListener("click", () => {
    const token = acting();
    if (token === undefined || token === "") {
      say(needTokenMessage());
      return;
    }
    void (async () => {
      const response = await fetch(`${deps.soulHttp}/v1/privacy/export`, {
        headers: headers(token),
      });
      if (!response.ok) {
        say(refusalMessage(response.status));
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "ugo-export.json";
      link.click();
      URL.revokeObjectURL(url);
      say("Scaricato. È tutto quello che tiene su questa casa.");
    })();
  });

  elements.forget.addEventListener("click", () => {
    const chosen = beings.find((being) => being.id === elements.who.value);
    if (chosen === undefined) {
      say("Prima dimmi chi.");
      return;
    }
    if (!nameMatches(elements.confirmName.value, chosen.displayName)) {
      say(`Scrivi «${chosen.displayName}» per confermare: da qui non si torna indietro.`);
      return;
    }
    const token = acting();
    if (token === undefined || token === "") {
      say(needTokenMessage());
      return;
    }
    void (async () => {
      const response = await fetch(`${deps.soulHttp}/v1/privacy/forget`, {
        method: "POST",
        headers: { ...headers(token), "content-type": "application/json" },
        body: JSON.stringify({ beingId: chosen.id, confirm: true }),
      });
      if (!response.ok) {
        say(refusalMessage(response.status));
        return;
      }
      elements.confirmName.value = "";
      say(`${chosen.displayName} non c'è più: il nome è stato tolto anche da quello che era già stato detto.`);
      await load();
    })();
  });
}
