import { sql } from "drizzle-orm";
import mqtt from "mqtt";
import type { DbClient } from "@ugo/db";
import { DEFAULT_THRESHOLDS, type ProbeState, type Thresholds } from "./verdict.js";

/**
 * Le sonde: un modo di bussare per ogni tipo di porta.
 *
 * Tutte la stessa forma e tutte lo stesso patto: **non sollevano mai** e
 * **misurano sempre**. Una sonda che solleva farebbe cadere la diagnostica
 * proprio nel momento in cui la si apre, cioè quando qualcosa è già rotto —
 * ed è precisamente il modo in cui uno strumento di diagnosi diventa inutile.
 *
 * Il millisecondo si misura anche quando la sonda fallisce: «non risponde
 * dopo 4 000 ms» e «rifiuta la connessione in 2 ms» sono due guasti diversi
 * (il primo è un container che arranca, il secondo è un container che non
 * c'è) e il pannello deve poterli distinguere senza entrare nel server.
 */

export interface ProbeReading {
  ms: number;
  reached: boolean;
  /** cosa ha risposto, in breve. Mai credenziali, mai indirizzi, mai PII. */
  detail?: string;
  /**
   * Lo stato deciso dalla sonda stessa, quando i millisecondi non sono la
   * misura giusta — il sogno notturno è «vecchio», non «lento», e farglielo
   * dire da una latenza finta sarebbe un numero inventato in una pagina che
   * esiste per non inventare numeri.
   */
  state?: ProbeState;
}

/** Cronometra qualunque promessa, e considera il rifiuto una misura. */
async function timed(run: () => Promise<string | undefined>): Promise<ProbeReading> {
  const started = performance.now();
  try {
    const detail = await run();
    return { ms: Math.round(performance.now() - started), reached: true, ...(detail !== undefined && { detail }) };
  } catch (error) {
    return {
      ms: Math.round(performance.now() - started),
      reached: false,
      detail: shortReason(error),
    };
  }
}

/**
 * Perché non ha risposto, in poche parole e senza indirizzi.
 *
 * Il messaggio d'errore di `fetch` porta dentro l'URL, che porta dentro
 * l'host interno e a volte l'utente: qui si tiene solo il codice, che è la
 * sola parte che dice qualcosa a chi ripara (`ECONNREFUSED` = non c'è
 * nessuno; `ETIMEDOUT`/`AbortError` = c'è e non ce la fa).
 */
function shortReason(error: unknown): string {
  const code = (error as { cause?: { code?: string }; code?: string; name?: string } | null);
  const raw = code?.cause?.code ?? code?.code ?? code?.name;
  if (raw === "AbortError" || raw === "TimeoutError") return "scaduto il tempo d'attesa";
  if (raw === "ECONNREFUSED") return "connessione rifiutata";
  if (raw === "ENOTFOUND" || raw === "EAI_AGAIN") return "nome non risolto";
  return typeof raw === "string" ? raw : "non raggiungibile";
}

/** Postgres: la domanda più corta che esista, quella che prova solo il giro. */
export async function probeDb(db: DbClient, thresholds = DEFAULT_THRESHOLDS): Promise<ProbeReading> {
  return timed(async () => {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
        }, thresholds.timeoutMs);
      }),
    ]);
    return undefined;
  });
}

export interface MqttTarget {
  url?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
}

/** Mosquitto: si apre e si chiude. Il broker o accetta o no. */
export async function probeMqtt(
  target: MqttTarget,
  thresholds = DEFAULT_THRESHOLDS,
): Promise<ProbeReading> {
  const url = target.url;
  if (url === undefined) return { ms: 0, reached: false };
  return timed(async () => {
    const client = await mqtt.connectAsync(url, {
      ...(target.username !== undefined && { username: target.username }),
      ...(target.password !== undefined && { password: target.password }),
      connectTimeout: thresholds.timeoutMs,
      reconnectPeriod: 0,
    });
    await client.endAsync();
    return undefined;
  });
}

/**
 * Una GET su un servizio HTTP interno.
 *
 * `read` estrae dal corpo la riga che vale la pena mostrare — la versione, i
 * modelli caricati — perché «risponde» da solo non basta a distinguere un
 * container sano da uno che risponde 200 su una pagina d'errore.
 */
export async function httpProbe(
  baseUrl: string,
  path: string,
  options: {
    thresholds?: Thresholds;
    headers?: Record<string, string>;
    read?: (body: unknown) => string | undefined;
  } = {},
): Promise<ProbeReading> {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  return timed(async () => {
    const response = await fetch(new URL(path, baseUrl), {
      signal: AbortSignal.timeout(thresholds.timeoutMs),
      ...(options.headers !== undefined && { headers: options.headers }),
    });
    if (!response.ok) throw Object.assign(new Error("http"), { code: `HTTP ${String(response.status)}` });
    if (options.read === undefined) return undefined;
    return options.read(await response.json().catch(() => undefined));
  });
}

/**
 * Quanto è indietro il ciclo di eventi di questo processo, in millisecondi.
 *
 * Sta fra le sonde e non fra le curiosità: se soul è occupato, **tutto** è
 * lento e nessuna delle altre sonde lo direbbe — misurerebbero il ritardo di
 * casa propria attribuendolo al container dall'altra parte del cavo. Questa
 * è la sola misura che assolve gli altri.
 */
export async function probeEventLoop(): Promise<number> {
  const started = performance.now();
  await new Promise<void>((resolve) => {
    setImmediate(() => {
      resolve();
    });
  });
  return Math.round(performance.now() - started);
}

/**
 * I modelli che Ollama tiene DAVVERO in memoria adesso.
 *
 * È la differenza fra «rispondo in due secondi» e «rispondo in cinquanta»:
 * un modello non residente va caricato da disco alla prima richiesta, e quel
 * caricamento è il minuto che una persona attribuisce alla creatura. Lo si
 * scopre solo chiedendolo, e fino a oggi non lo chiedeva nessuno.
 */
export async function probeOllamaResident(
  baseUrl: string,
  thresholds = DEFAULT_THRESHOLDS,
): Promise<string[]> {
  try {
    const response = await fetch(new URL("/api/ps", baseUrl), {
      signal: AbortSignal.timeout(thresholds.timeoutMs),
    });
    if (!response.ok) return [];
    const body: unknown = await response.json();
    const models = (body as { models?: { name?: string }[] } | null)?.models ?? [];
    return models.map((m) => m.name).filter((name): name is string => typeof name === "string");
  } catch {
    return [];
  }
}
