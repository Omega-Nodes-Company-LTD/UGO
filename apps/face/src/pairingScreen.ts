import { DEVICE_KEY_STORE, defaultDeviceLabel, type KeyStore } from "./deviceKey.js";

/**
 * La schermata «Fammi entrare» (ADR-127): compare al primo 401, quando la casa
 * sta sul web e questo dispositivo non ha ancora la chiave.
 *
 * Due strade: il codice letto dal pannello (`/v1/pair`) o il link via email
 * (`/v1/login/email`). L'app iOS ci arriva anche coi link universali —
 * `?pair=CODICE` precompila il codice, `?login=SEGRETO` entra da solo.
 */

export interface PairingDeps {
  soulHttp: string;
  store: KeyStore;
  userAgent: string;
  /** dopo l'ingresso: di solito ricaricare la pagina, che riparte con la chiave */
  onPaired: () => void;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`#${id} missing from the markup`);
  return found;
}

async function keyFrom(response: Response): Promise<string | undefined> {
  if (response.status !== 201) return undefined;
  const body = (await response.json()) as { token?: unknown };
  return typeof body.token === "string" ? body.token : undefined;
}

export class PairingScreen {
  private readonly overlay = element("pair-overlay");
  private readonly status = element("pair-status");
  private readonly codeInput = element("pair-code-input") as HTMLInputElement;
  private readonly emailInput = element("pair-email-input") as HTMLInputElement;

  public constructor(private readonly deps: PairingDeps) {
    element("pair-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.pair(this.codeInput.value);
    });
    element("pair-email-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.email(this.emailInput.value);
    });
  }

  public show(prefill?: string): void {
    if (prefill !== undefined) this.codeInput.value = prefill;
    this.overlay.hidden = false;
  }

  private say(text: string): void {
    this.status.textContent = text;
  }

  private keep(key: string): void {
    try {
      this.deps.store.setItem(DEVICE_KEY_STORE, key);
    } catch {
      // niente memoria (navigazione privata): la chiave vale per questa visita
    }
    this.deps.onPaired();
  }

  public async pair(code: string): Promise<void> {
    if (code.trim() === "") {
      this.say("Scrivi il codice del pannello.");
      return;
    }
    this.say("Un attimo…");
    const response = await fetch(`${this.deps.soulHttp}/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceLabel: defaultDeviceLabel(this.deps.userAgent) }),
    });
    if (response.status === 429) {
      this.say("Troppi tentativi: aspetta un minuto.");
      return;
    }
    const key = await keyFrom(response);
    if (key === undefined) {
      this.say("Codice sbagliato o scaduto: chiedine uno nuovo dal pannello.");
      return;
    }
    this.keep(key);
  }

  public async email(address: string): Promise<void> {
    if (address.trim() === "") {
      this.say("Scrivi la tua email.");
      return;
    }
    const response = await fetch(`${this.deps.soulHttp}/v1/login/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: address }),
    });
    if (response.status === 501) {
      this.say("Su questa casa l'accesso via email non è acceso.");
      return;
    }
    if (response.status === 429) {
      this.say("Troppi tentativi: aspetta un minuto.");
      return;
    }
    this.say("Se l'indirizzo è quello giusto, ti è arrivato un link: vale 15 minuti.");
  }

  /** Il link universale dell'app porta il segreto: lo si scambia con una chiave. */
  public async redeem(secret: string): Promise<boolean> {
    const response = await fetch(`${this.deps.soulHttp}/v1/login/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, deviceLabel: defaultDeviceLabel(this.deps.userAgent) }),
    });
    const key = await keyFrom(response);
    if (key === undefined) {
      this.show();
      this.say("Il link è scaduto o già usato: chiedine un altro.");
      return false;
    }
    this.keep(key);
    return true;
  }
}
