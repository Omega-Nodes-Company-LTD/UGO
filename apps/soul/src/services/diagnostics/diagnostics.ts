import { catalogue } from "./catalogue.js";
import { probeEventLoop, probeOllamaResident, type ProbeReading } from "./probes.js";
import type { DiagnosticsDeps } from "./deps.js";
import type { TurnLogSnapshot } from "./turnLog.js";
import { DEFAULT_THRESHOLDS, stateOf, verdictOf, type ProbeState, type Verdict, type Weight } from "./verdict.js";

/**
 * La diagnostica di TUTTI i container, in un posto solo.
 *
 * Fino a oggi lo stato dello stack stava in tre punti che non si parlavano:
 * `/health` guardava quattro dipendenze su nove, `/v1/capabilities` diceva
 * quali funzioni erano configurate ma non se rispondevano, e tutto il resto —
 * searxng, il registro, la reception, il sogno — non lo guardava nessuno. Un
 * container acceso che nessuno chiama era indistinguibile da uno spento
 * (STATE §2-ter); un container lento era indistinguibile da uno morto. Davanti
 * a «ci mette un minuto a rispondere» non c'era una pagina da aprire, e la
 * diagnosi cominciava sempre da una lettura del codice.
 *
 * Questa è quella pagina. Le sonde girano **tutte insieme**: una che scade non
 * deve poter nascondere quella che sarebbe stata verde, e l'intera pagina non
 * deve costare la somma dei timeout.
 */

export interface ServiceReport {
  id: string;
  label: string;
  container: string;
  what: string;
  state: ProbeState;
  weight: Weight;
  /** quanto ci ha messo a rispondere; `null` quando non c'era una latenza da misurare */
  ms: number | null;
  detail?: string;
  /** perché è spento — col nome della variabile da impostare dentro */
  why?: string;
  /** cosa fare adesso, se non è verde */
  hint?: string;
}

export interface SoulReport {
  uptimeS: number;
  /**
   * Quanto è indietro il ciclo di eventi di questo processo.
   *
   * È la sola misura che assolve gli altri: se soul è occupato, ogni sonda di
   * questa pagina misura il ritardo di casa propria e lo attribuisce al
   * container dall'altra parte del cavo.
   */
  eventLoopMs: number;
  rssMb: number;
  /** quale muso sta servendo: se non è quello del dispositivo, il corpo è vecchio */
  faceVersion: string;
}

export interface DiagnosticsReport {
  at: string;
  verdict: Verdict;
  services: ServiceReport[];
  soul: SoulReport;
  turns: TurnLogSnapshot;
}

const OFF: ProbeReading = { ms: 0, reached: false };

export async function runDiagnostics(deps: DiagnosticsDeps): Promise<DiagnosticsReport> {
  const specs = catalogue(deps);
  const [readings, eventLoopMs, resident] = await Promise.all([
    Promise.all(specs.map(async (spec) => (spec.probe === undefined ? OFF : spec.probe()))),
    probeEventLoop(),
    probeOllamaResident(deps.ollama.url),
  ]);

  const services = specs.map((spec, index): ServiceReport => {
    const reading = readings[index] ?? OFF;
    const configured = spec.probe !== undefined;
    const measured = spec.measured !== false;
    const state =
      reading.state ??
      stateOf({ ms: reading.ms, reached: reading.reached, configured }, DEFAULT_THRESHOLDS);
    const detail =
      spec.id === "ollama" && state !== "off" ? residentLine(resident, deps.ollama.embedModel) : reading.detail;
    return {
      id: spec.id,
      label: spec.label,
      container: spec.container,
      what: spec.what,
      state,
      weight: spec.weight,
      ms: configured && measured ? reading.ms : null,
      ...(detail !== undefined && { detail }),
      ...(spec.why !== undefined && state === "off" && { why: spec.why }),
      ...(state !== "ok" && state !== "off" && { hint: spec.hint }),
    };
  });

  return {
    at: new Date().toISOString(),
    verdict: verdictOf(services.map((s) => ({ state: s.state, weight: s.weight }))),
    services,
    soul: {
      uptimeS: Math.max(0, Math.round((Date.now() - deps.startedAt.getTime()) / 1000)),
      eventLoopMs,
      rssMb: Math.round(process.memoryUsage().rss / 1_048_576),
      faceVersion: deps.faceVersion(),
    },
    turns: deps.turnLog.snapshot(),
  };
}

/**
 * Quali modelli Ollama tiene caldi adesso, e se fra questi c'è quello che
 * serve a ripescare i ricordi.
 *
 * Un modello non residente costa il caricamento da disco alla PRIMA
 * richiesta: decine di secondi, che chi aspetta addebita alla creatura.
 */
function residentLine(resident: string[], embedModel: string): string {
  if (resident.length === 0) return "nessun modello caldo: la prima richiesta paga il caricamento";
  const embed = resident.some((name) => name.startsWith(embedModel));
  return `caldi: ${resident.join(", ")}${embed ? "" : ` — ${embedModel} NON è fra questi`}`;
}
