import { httpProbe, probeDb, probeMqtt, type ProbeReading } from "./probes.js";
import { dreamReading, perceptionProbe } from "./readings.js";
import type { DiagnosticsDeps } from "./deps.js";
import type { Weight } from "./verdict.js";

/**
 * Il catalogo: **una voce per container del compose**, nell'ordine in cui si
 * guarda quando qualcosa non va.
 *
 * Sta in un file suo perché è l'unica parte che cambia spesso — un container
 * nuovo è una voce nuova qui e niente altro — e perché la procedura di
 * STATE §2-ter («onboarda un container nuovo») ha finalmente un posto in cui
 * atterrare: il quinto punto, quello che si dimentica sempre, è il cablaggio
 * su soul, e da oggi un container non cablato si vede in pannello invece di
 * girare a vuoto per settimane.
 *
 * Ogni voce dice quattro cose in italiano piano: **cosa fa**, **come si
 * chiama nel compose** (cioè cosa scrivere in `docker logs`), **perché è
 * spenta** se lo è, e **cosa fare** se è rossa. La quarta è quella che manca
 * sempre negli strumenti di questo tipo, ed è la sola per cui li si apre.
 */
export interface Spec {
  id: string;
  label: string;
  /** il nome del servizio nel compose: è quello che si scrive in `docker logs` */
  container: string;
  /** a cosa serve, in una riga */
  what: string;
  weight: Weight;
  /** assente = non configurato; allora `why` dice quale variabile manca */
  probe?: (() => Promise<ProbeReading>) | undefined;
  why?: string;
  /**
   * falso quando il numero non è una latenza (il provider dichiarato, l'ultimo
   * sogno): mostrare «0 ms» accanto a una cosa che non è stata cronometrata è
   * un numero inventato, e un numero inventato in una diagnostica è peggio di
   * nessun numero.
   */
  measured?: boolean;
  /** cosa fare adesso, se la riga non è verde */
  hint: string;
}

export function catalogue(deps: DiagnosticsDeps): Spec[] {
  const { perceptionUrl, searxngUrl, registry, receptionUrl, lastDream, chatModel } = deps;
  const pendingVoices = deps.pendingVoices;
  return [
    {
      id: "postgres",
      label: "Il database",
      container: "postgres",
      what: "ricordi, messaggi, umore, conti: tutto ciò che UGO è quando è spento",
      weight: "vital",
      probe: () => probeDb(deps.db),
      hint: "`docker compose logs postgres`. Se è lento è quasi sempre il disco, o una migrazione in corso.",
    },
    {
      id: "mosquitto",
      label: "Il broker dei sensori",
      container: "mosquitto",
      what: "i messaggi dei sensori e dei relè (MQTT)",
      weight: "supporting",
      ...(deps.mqtt.url === undefined
        ? { why: "manca MQTT_URL: nessun sensore parla con la casa." }
        : { probe: () => probeMqtt(deps.mqtt) }),
      hint: "Credenziali o file passwd: `ops/docker/mosquitto/generate-passwd.sh`, poi riavvia il broker.",
    },
    {
      id: "ollama",
      label: "I modelli in casa",
      container: "ollama",
      what: "embedding per ripescare i ricordi, e testo locale (consiglio, riflessione notturna)",
      weight: "supporting",
      probe: () => httpProbe(deps.ollama.url, "/api/version", { read: versionOf }),
      hint:
        "Se è lento, il modello non è caldo e la prima richiesta lo carica da disco — sono le decine di " +
        "secondi che sembrano lentezza della creatura. Tienilo residente (OLLAMA_KEEP_ALIVE) o prendine uno più piccolo.",
    },
    {
      id: "percezione",
      label: "Volto, voce, dettatura",
      container: "percezione",
      what: "riconosce chi parla e chi si vede, detta con whisper, legge con l'OCR, parla con Piper",
      weight: "supporting",
      ...(perceptionUrl === undefined
        ? {
            why: "manca UGO_RECOGNITION_URL: non sa chi ha davanti, e le orecchie restano quelle del browser.",
          }
        : { probe: () => perceptionProbe(perceptionUrl) }),
      hint:
        "Al primo avvio si scarica i pesi (ADR-047) e ci mette: è per progetto. Se resta lenta a regime, " +
        "ogni frase detta paga il suo ritardo prima ancora di arrivare al modello.",
    },
    {
      id: "searxng",
      label: "La finestra sul mondo",
      container: "searxng",
      what: "il gesto «cerca: …»",
      weight: "optional",
      ...(searxngUrl === undefined
        ? {
            why: "manca SEARXNG_URL: il gesto «cerca:» non esiste e la frase va al modello come una qualunque.",
          }
        : { probe: () => httpProbe(searxngUrl, "/healthz") }),
      hint: "L'immagine pretende tre capability (CHOWN, SETGID, SETUID): senza, il container parte e non risponde.",
    },
    {
      id: "registry",
      label: "Il libro genealogico",
      container: "registry",
      what: "gli atti di nascita in catena; ha un database suo, separato dalle anime",
      weight: "optional",
      ...(registry === undefined
        ? {
            why: "mancano UGO_REGISTRY_URL/UGO_REGISTRY_TOKEN: si nasce lo stesso, senza atto in catena.",
          }
        : {
            probe: () =>
              httpProbe(registry.baseUrl, "/health", {
                headers: { authorization: `Bearer ${registry.token}` },
              }),
          }),
      hint: "Se il registro è giù ma `registry-postgres` è su, è quasi sempre REGISTRY_SIGNING_KEY o il token.",
    },
    {
      id: "reception",
      label: "La porta sulla strada",
      container: "reception",
      what: "la suite pubblica dei clienti dello studio",
      weight: "optional",
      ...(receptionUrl === undefined
        ? { why: "manca UGO_RECEPTION_URL: non viene sondata (può essere accesa lo stesso)." }
        : { probe: () => httpProbe(receptionUrl, "/api/health") }),
      hint: "È l'unico servizio con un dominio pubblico: se è giù, i clienti trovano una porta chiusa.",
    },
    {
      id: "jobs",
      label: "Il sogno notturno",
      container: "jobs",
      what: "riflessione, trascrizioni, igiene dei dati, backup: gira di notte e poi si spegne",
      weight: "optional",
      measured: false,
      // Non è un servizio: è un container che parte, lavora e muore. Bussargli
      // non vuol dire niente — l'unica prova che stia funzionando è che
      // stanotte abbia lasciato qualcosa scritto.
      ...(lastDream === undefined
        ? { why: "questa installazione non sa dire quando ha sognato l'ultima volta." }
        : { probe: () => dreamReading(lastDream, pendingVoices) }),
      hint:
        "Non è un container che «sta su»: parte di notte e finisce. Se l'ultimo sogno è vecchio, " +
        "il compito schedulato non parte — guardalo là dove è schedulato, non in `docker ps`.",
    },
    {
      id: "provider",
      label: "Il provider della chat",
      container: "— (fuori casa)",
      what: "il modello che scrive le risposte",
      weight: "supporting",
      measured: false,
      // NON si sonda, e non è una dimenticanza: una chiamata di prova è una
      // chiamata PAGATA, e l'unico modulo autorizzato a chiamare il provider è
      // `llmClient`, che registra sul salvadanaio (regola 3). Una diagnostica
      // che spende soldi per dire «sì, risponde» è una diagnostica che nessuno
      // apre quando serve.
      ...(chatModel === undefined
        ? { why: "manca ANTHROPIC_API_KEY: risponde solo il modello locale." }
        : {
            probe: () =>
              Promise.resolve({
                ms: 0,
                reached: true,
                detail: `${chatModel} · dichiarato, non sondato: una prova sarebbe una chiamata pagata`,
              }),
          }),
      hint:
        "Se le risposte tardano e tutto il resto è verde, la fase «modello» qui sotto è la sua: " +
        "è il tempo che passa fuori casa.",
    },
  ];
}

const versionOf = (body: unknown): string | undefined => {
  const version = (body as { version?: unknown } | null)?.version;
  return typeof version === "string" ? `versione ${version}` : undefined;
};
