import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Gli errori parlano sempre (richiesta del proprietario, 2026-10-04).
 *
 * Il pannello mostrava «HTTP 404»; le rotte rispondevano «Bad Request»,
 * «invalid body», «non esiste» — vero, ma inutile a chi sta davanti allo
 * schermo. Qui, una volta per tutte e per ogni rotta (comprese quelle
 * scritte domani): ogni risposta d'errore esce con un `title` e un `detail`
 * in italiano, e il `detail` dice **cosa è successo e cosa fare**.
 *
 * - un messaggio della rotta già parlante resta com'è;
 * - uno in inglese o generico si traduce, o lascia il posto alla frase dello stato;
 * - uno corto e vago («non esiste») si completa con cosa fare;
 * - un 5xx porta un riferimento (`rif.`) che ritrova la riga nel registro, senza
 *   raccontare a chi guarda lo stack o la query.
 *
 * Il campo `error` di chi lo usava resta intatto: si aggiunge, non si cambia.
 */

export const STATUS_HINT: Readonly<Record<number, string>> = {
  400: "La richiesta non è completa o non è scritta bene: controlla i campi e riprova.",
  401: "Non sei entrato, o l'accesso è scaduto: rientra con la tua email o col token.",
  402: "Il tuo piano non comprende questa funzione: la trovi in Abbonamento.",
  403: "Non hai il permesso di farlo: serve il proprietario della casa.",
  404: "Non l'ho trovato: forse è stato cancellato o il link è vecchio. Ricarica la pagina.",
  405: "Questa azione non si fa così: ricarica la pagina e riprova.",
  409: "Non si può fare adesso, nello stato in cui è: ricarica la pagina e riprova.",
  410: "Non c'è più.",
  413: "È troppo grande per essere inviato: prova con qualcosa di più piccolo.",
  415: "Questo formato non lo accetto.",
  422: "Ho capito la richiesta, ma i valori non vanno bene: controllali e riprova.",
  429: "Troppe richieste in poco tempo: aspetta qualche minuto e riprova.",
  500: "Qualcosa si è rotto dalla nostra parte. Riprova fra poco; se succede ancora, scrivi a chi gestisce UGO citando il riferimento.",
  501: "Questa funzione non è configurata su questo server.",
  502: "Un servizio da cui dipendo ha risposto male. Riprova fra poco.",
  503: "Un servizio da cui dipendo non è disponibile adesso. Riprova fra poco.",
  504: "Un servizio da cui dipendo ci ha messo troppo. Riprova fra poco.",
};

const STATUS_TITLE: Readonly<Record<number, string>> = {
  400: "Richiesta non valida",
  401: "Serve l'accesso",
  402: "Serve un altro piano",
  403: "Non permesso",
  404: "Non trovato",
  409: "Non si può adesso",
  413: "Troppo grande",
  415: "Formato non accettato",
  422: "Valori non validi",
  429: "Troppe richieste",
  500: "Errore del server",
  501: "Non configurato",
  502: "Servizio irraggiungibile",
  503: "Servizio non disponibile",
  504: "Servizio troppo lento",
};

/** Le frasi fisse delle rotte che non dicevano niente a nessuno. */
const KNOWN: Readonly<Record<string, string>> = {
  "house not found": "Questa casa non esiste, o il tuo accesso non la vede.",
  "which house?": "Questo accesso vale per più case: scegli quale dal selettore in alto e riprova.",
  "no gosino here": "In questa casa non c'è ancora un gosino: adottane uno dalla vetrina.",
  "no gosino yet": "Questa casa non ha ancora un gosino: adottane uno dalla vetrina.",
  "session not found": "Questa sessione non c'è più: forse l'hai già chiusa.",
  "prop not found": "Questo arredo non c'è più: ricarica la pagina.",
  "print not found": "Questa impronta non c'è più: ricarica la pagina.",
  "memory not found": "Questo ricordo non c'è più: ricarica la pagina.",
  "being not found": "Questa persona non è nel branco.",
  "invalid code": "Il codice non è giusto o è scaduto: chiedine uno nuovo dal pannello.",
  "recognition unavailable": "Il riconoscimento di volti e voci non risponde adesso. Riprova fra poco.",
  "meeting bot unavailable": "Il servizio delle riunioni non risponde adesso. Riprova fra poco.",
  "geocoding unavailable": "Il servizio che trova i luoghi non risponde adesso. Riprova fra poco.",
  "plan required": STATUS_HINT[402] ?? "",
  "account not created": "La casa non è stata creata. Riprova; se succede ancora, scrivi a chi gestisce UGO.",
  "account creation not configured": "Su questo server le case non si creano da qui.",
  "non esiste": "Non esiste, o non esiste più: forse è stato cancellato. Ricarica la pagina.",
  "non c'è": "Non c'è più: forse è stato cancellato. Ricarica la pagina.",
  "non autorizzato": STATUS_HINT[403] ?? "",
};

const ENGLISH = /\b(invalid|not found|not created|unauthorized|forbidden|bad request|internal server error|too many requests|unavailable|required|missing|unknown|request|body|query|conflict|payment|service|entity|gateway|yet|here)\b/iu;

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Il `detail` italiano per uno stato e quello che la rotta aveva da dire. */
export function speakingDetail(status: number, said: string | undefined): string {
  const hint = STATUS_HINT[status] ?? STATUS_HINT[status >= 500 ? 500 : 400] ?? "";
  const raw = said?.trim() ?? "";
  if (raw === "") return hint;
  const known = KNOWN[raw.toLowerCase()];
  if (known !== undefined && known !== "") return known;
  if (ENGLISH.test(raw)) return hint;
  // corto e senza spiegazione («pratica non trovata»): si completa con cosa fare
  if (raw.length < 32 && !/[:.;!?]/u.test(raw)) return `${capital(raw)}. ${hint}`;
  return capital(raw);
}

/** Un titolo è un'intestazione: comincia maiuscolo, è breve e non è una frase con la punteggiatura. */
const isHeading = (title: string): boolean =>
  /^\p{Lu}/u.test(title) && title.length <= 48 && !/[,;:?!.]/u.test(title) && !ENGLISH.test(title);

export function speakingTitle(status: number, title: unknown): string {
  return typeof title === "string" && isHeading(title)
    ? title
    : (STATUS_TITLE[status] ?? (status >= 500 ? "Errore del server" : "Richiesta non riuscita"));
}

/** Il corpo d'errore completato: titolo e spiegazione parlanti, il resto intatto. */
export function speakingBody(status: number, body: Record<string, unknown>, ref?: string): Record<string, unknown> {
  const said = [body.detail, body.error, body.message, body.title].find((v): v is string => typeof v === "string" && v !== "");
  const detail = speakingDetail(status, said);
  return {
    ...body,
    type: typeof body.type === "string" ? body.type : "about:blank",
    title: speakingTitle(status, body.title),
    status,
    // il riferimento una volta sola: un corpo già parlante ripassa da qui in onSend
    detail: status >= 500 && ref !== undefined && !detail.includes("(rif. ") ? `${detail} (rif. ${ref})` : detail,
  };
}

function problem(request: FastifyRequest, reply: FastifyReply, status: number, said?: string): FastifyReply {
  return reply
    .code(status)
    .type("application/problem+json")
    .send(speakingBody(status, said === undefined ? {} : { detail: said }, request.id));
}

/** Una pagina vera per chi apre un indirizzo sbagliato nel browser: non un JSON. */
export type HtmlPage = (title: string, text: string) => string;

const plainPage: HtmlPage = (title, text) =>
  `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — UGO</title></head>` +
  `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5"><h1>${title}</h1><p>${text}</p><p><a href="/">Torna all'inizio</a></p></body></html>`;

export function registerSpeakingErrors(app: FastifyInstance, page: HtmlPage = plainPage): void {
  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.statusCode < 400 || typeof payload !== "string" || payload === "") return payload;
    const type = String(reply.getHeader("content-type") ?? "");
    if (!type.includes("json")) return payload;
    try {
      const body = JSON.parse(payload) as unknown;
      if (typeof body !== "object" || body === null || Array.isArray(body)) return payload;
      return JSON.stringify(speakingBody(reply.statusCode, body as Record<string, unknown>, request.id));
    } catch {
      return payload;
    }
  });
  app.setNotFoundHandler((request, reply) => {
    const wantsPage = !request.url.startsWith("/v1/") && (request.headers.accept ?? "").includes("text/html");
    if (wantsPage) {
      return reply
        .code(404)
        .type("text/html; charset=utf-8")
        .send(page("Questa pagina non c'è", "L'indirizzo è sbagliato, o la pagina è stata spostata. Torna all'inizio e riprova da lì."));
    }
    return problem(
      request,
      reply,
      404,
      request.url.startsWith("/v1/")
        ? "Questa funzione non esiste su questo server: forse il pannello è di una versione diversa. Ricarica la pagina."
        : "Questo indirizzo non esiste su questo server.",
    );
  });
}

/** Per il gestore degli errori di server.ts: un errore lanciato diventa una frase, mai uno stack. */
export function speakError(error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const status = (error as { statusCode?: number }).statusCode ?? 500;
  const code = (error as { code?: string }).code ?? "";
  if (status >= 500) request.log.error(error);
  else request.log.info({ status, code }, "client error");
  if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
    return problem(request, reply, 400, "Quello che è arrivato non è un JSON valido: ricarica la pagina e riprova.");
  }
  if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return problem(request, reply, 413);
  if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return problem(request, reply, 415);
  return problem(request, reply, status);
}
