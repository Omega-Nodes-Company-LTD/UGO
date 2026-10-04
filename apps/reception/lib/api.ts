"use client";

import { token } from "./session";

/**
 * Il filo verso soul: ogni chiamata passa dal BFF (`/api/*`), che aggiunge il
 * segreto di servizio lato server (ADR-051). Da qui esce solo il token del
 * cliente, nell'header dedicato — mai in `Authorization`.
 */

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Gli errori parlano sempre: soul risponde già con un `detail` in italiano;
 * qui si copre quel che non arriva da soul — la rete che cade, un corpo vuoto,
 * una pagina d'errore del proxy.
 */
const SAY: Readonly<Record<number, string>> = {
  400: "La richiesta non è completa: controlla i campi e riprova.",
  401: "Il tuo accesso non vale più: apri di nuovo il link che ti abbiamo dato.",
  403: "Questo non è tra le cose che puoi fare da qui.",
  404: "Non l'ho trovato: forse è stato chiuso o spostato. Ricarica la pagina.",
  409: "Non si può fare adesso: ricarica la pagina e riprova.",
  413: "È troppo grande per essere inviato.",
  429: "Troppe richieste in poco tempo: aspetta qualche minuto e riprova.",
  500: "Qualcosa si è rotto dalla nostra parte. Riprova fra poco.",
  502: "Il servizio non risponde bene in questo momento: riprova fra poco.",
  503: "Il servizio non è disponibile in questo momento: riprova fra poco.",
};
export const OFFLINE = "Non riesco a raggiungere il servizio: controlla la connessione e riprova.";

export function speaking(status: number, said?: string): string {
  if (said !== undefined && said !== "" && !/^HTTP \d+$/u.test(said)) return said;
  return SAY[status] ?? (status >= 500 ? (SAY[500] ?? OFFLINE) : (SAY[400] ?? OFFLINE));
}

async function reach(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
}

/**
 * Scarica un file dal BFF e lo consegna al browser. Stesso filo di `call`
 * (token nell'header dedicato), ma il corpo resta binario: niente json().
 */
export async function download(path: string, body: unknown, filename: string): Promise<void> {
  const response = await reach(`/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-reception-customer": token() },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(speaking(response.status), response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body !== undefined) headers.set("content-type", "application/json");
  headers.set("x-reception-customer", token());
  const response = await reach(`/api${path}`, { ...options, headers });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // 204 e simili: nessun corpo è un esito, non un errore
  }
  if (!response.ok) {
    const problem = body as { detail?: string; title?: string } | null;
    throw new ApiError(speaking(response.status, problem?.detail ?? problem?.title), response.status);
  }
  return body as T;
}
