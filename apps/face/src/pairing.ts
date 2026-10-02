/**
 * L'abbinamento del muso (ADR-121).
 *
 * Davanti a internet un muso senza cookie non apre nemmeno il socket: soul
 * non sa di che casa sia. All'avvio chiede `GET /v1/dispositivi/io`:
 *
 * - **404** — soul in casa, dove non serve abbinare niente: si va avanti come
 *   sempre;
 * - `{ abbinato: true }` — il cookie c'è, si va avanti;
 * - `{ abbinato: false }` — si mostra il riquadro delle sei cifre.
 *
 * Il token che nasce dal codice sta in un cookie `HttpOnly`: questo codice non
 * lo vede mai, quindi non lo può nemmeno perdere.
 */

export type PairingNeed = "none" | "paired" | "needed";

/** Cosa fare, dalla risposta di `/v1/dispositivi/io`. Una rete giù non chiede codici. */
export function pairingNeedOf(status: number, body: unknown): PairingNeed {
  if (status === 404) return "none";
  if (status !== 200 || typeof body !== "object" || body === null) return "none";
  return (body as { abbinato?: unknown }).abbinato === true ? "paired" : "needed";
}

/** Sei cifre, senza spazi: ciò che il pannello mostra e il server accetta. */
export function cleanCode(typed: string): string | undefined {
  const digits = typed.replace(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? digits : undefined;
}

export async function checkPairing(soulHttp: string): Promise<PairingNeed> {
  try {
    // un soul che non risponde non deve tenere fermo il muso: si va avanti senza
    const res = await fetch(`${soulHttp}/v1/dispositivi/io`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const body: unknown = res.status === 200 ? await res.json() : undefined;
    return pairingNeedOf(res.status, body);
  } catch {
    return "none";
  }
}

export interface PairingElements {
  overlay: HTMLElement;
  input: HTMLInputElement;
  button: HTMLButtonElement;
  message: HTMLElement;
}

/** Mostra il riquadro; risolve quando il muso è abbinato. */
export function askForCode(soulHttp: string, elements: PairingElements): Promise<void> {
  elements.overlay.hidden = false;
  elements.input.focus();
  return new Promise((resolve) => {
    const submit = async (): Promise<void> => {
      const code = cleanCode(elements.input.value);
      if (code === undefined) {
        elements.message.textContent = "Sono sei cifre: le trovi nel pannello, in Accessi e dispositivi.";
        return;
      }
      elements.button.disabled = true;
      try {
        const res = await fetch(`${soulHttp}/v1/dispositivi/abbina`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ codice: code }),
        });
        if (res.ok) {
          elements.overlay.hidden = true;
          resolve();
          return;
        }
        elements.message.textContent =
          res.status === 429
            ? "Troppi tentativi: aspetta un quarto d'ora e chiedi un codice nuovo."
            : "Codice sbagliato o scaduto: chiedine uno nuovo dal pannello.";
      } catch {
        elements.message.textContent = "Non riesco a raggiungere UGO: controlla la connessione.";
      } finally {
        elements.button.disabled = false;
      }
    };
    elements.button.addEventListener("click", () => void submit());
    elements.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void submit();
    });
  });
}
