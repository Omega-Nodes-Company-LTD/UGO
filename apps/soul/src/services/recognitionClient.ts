/**
 * Chi sta parlando (ADR-045).
 *
 * Il pezzo che mancava, e che rendeva vuota tutta la faccenda: `chat.handle`
 * accetta un `beingId` **da sempre** e ha sempre ricevuto `undefined`, perché
 * sul percorso dal vivo non arrivava audio e nessuno lo identificava. Il
 * risultato era che il prompt diceva a UGO, a ogni singolo turno, «c'è
 * qualcuno che non hai riconosciuto: non tirare a indovinare».
 *
 * Il riconoscimento vive in un servizio Python perché gli encoder sono lì e
 * pesano; qui c'è solo il confine, con Zod come ogni confine del progetto.
 */

import { z } from "zod";

const recognisedSchema = z.object({
  being_id: z.string().nullable().optional(),
  candidate_being_id: z.string().nullable().optional(),
  confidence: z.number().default(0),
  modality: z.string().default("voice"),
});

const rememberedSchema = z.object({
  print_id: z.string().min(1),
  seen_count: z.number().int().min(1),
});

export interface Recognised {
  /** chi è: abbastanza sicuro da chiamarlo per nome */
  beingId?: string | undefined;
  /** chi potrebbe essere: abbastanza per chiedere, non per dire */
  candidateBeingId?: string | undefined;
  confidence: number;
}

export interface RecognitionDeps {
  baseUrl: string;
  token: string;
  accountId: string;
  /** iniettabile per i test: nessuna rete in un test di routing */
  fetchImpl?: typeof fetch;
  /** oltre questo non si aspetta: una risposta in ritardo non è una risposta */
  timeoutMs?: number;
}

/**
 * Oltre questo il riconoscimento ha perso il suo turno.
 *
 * Meglio rispondere senza sapere chi è che far aspettare la conversazione: il
 * costo di non riconoscere è un «non so chi sei», il costo di un silenzio di
 * tre secondi è una creatura che sembra rotta.
 */
const DEFAULT_TIMEOUT_MS = 1_500;
/**
 * Quanto sono più pazienti le strade che scrivono (conservare un'impronta,
 * rivendicare un volto) rispetto a quelle che rispondono in una conversazione.
 * Più larghe perché non fanno aspettare nessuno che parla — ma limitate,
 * perché «nessun limite» significa promesse appese per sempre.
 */
const SLOW_PATH_FACTOR = 8;

export class RecognitionClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(private readonly deps: RecognitionDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Chi ha detto questa frase, se si riesce a saperlo in tempo. */
  public async byVoice(audioBase64: string): Promise<Recognised | undefined> {
    return this.ask("/v1/identify/voice", {
      audio: audioBase64,
      account_id: this.deps.accountId,
    });
  }

  /**
   * Gruppo 13: la dettatura locale — whisper sul servizio di percezione,
   * niente Google. Il timeout qui è LARGO apposta: la trascrizione di un
   * enunciato su CPU costa più dell'identità, e chi chiama (la rotta
   * `/v1/stt`) sta comunque fuori dal giro sincrono della conversazione.
   */
  public async transcribe(audioBase64: string): Promise<string | undefined> {
    try {
      const response = await this.fetchImpl(new URL("/v1/transcribe", this.deps.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.deps.token}`,
        },
        body: JSON.stringify({ audio: audioBase64 }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { text?: string };
      return typeof body.text === "string" ? body.text : undefined;
    } catch {
      return undefined; // giù o lento: il chiosco resta sul riconoscitore che ha
    }
  }

  /**
   * La voce di casa (decisione 2026-08-16): Piper sul servizio di percezione.
   *
   * Gradino di mezzo della catena di `/v1/tts`: quando il provider non c'è —
   * niente chiave, o salvadanaio finito — la frase si sintetizza QUI, gratis
   * e senza uscire di casa. `undefined` = anche questo gradino manca, e la
   * rotta degrada alla voce di sistema del browser (204). Timeout largo come
   * la dettatura: la sintesi su CPU costa, e chi aspetta è un muso che sa
   * già parlare da solo.
   */
  public async synthesize(text: string): Promise<Buffer | undefined> {
    try {
      const response = await this.fetchImpl(new URL("/v1/synthesize", this.deps.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.deps.token}`,
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return undefined;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return undefined; // giù o lento: la voce di sistema c'è sempre
    }
  }

  /**
   * La lettura su gesto (ADR-065): tesseract sul servizio di percezione.
   *
   * `undefined` = OCR giù o irraggiungibile; la stringa vuota invece è una
   * risposta vera («ho guardato e non c'è scritto niente») e chi chiama deve
   * poter distinguere le due cose.
   */
  public async ocr(imageBase64: string): Promise<string | undefined> {
    try {
      const response = await this.fetchImpl(new URL("/v1/ocr", this.deps.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.deps.token}`,
        },
        body: JSON.stringify({ image: imageBase64 }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { text?: string };
      return typeof body.text === "string" ? body.text : undefined;
    } catch {
      return undefined;
    }
  }

  /** Chi è questo volto, dal ritaglio che il corpo ha già fatto. */
  public async byFace(imageBase64: string): Promise<Recognised | undefined> {
    return this.ask("/v1/identify/face", {
      image: imageBase64,
      account_id: this.deps.accountId,
    });
  }

  /**
   * ADR-057: conserva il volto di uno sconosciuto, in attesa di un nome.
   *
   * Il ritaglio non si ferma qui e non ci deve fermare: gli encoder e la
   * cifratura stanno nel servizio Python, e soul non tiene **mai** in mano un
   * embedding biometrico. Quello che torna indietro è un id e un conteggio.
   */
  public async rememberUnknownFace(
    imageBase64: string,
  ): Promise<{ printId: string; seenCount: number } | undefined> {
    const answer = await this.post("/v1/prints/unknown", {
      image: imageBase64,
      account_id: this.deps.accountId,
    });
    const parsed = rememberedSchema.safeParse(answer);
    if (!parsed.success) return undefined;
    return { printId: parsed.data.print_id, seenCount: parsed.data.seen_count };
  }

  /**
   * «Quello è Marco.» Da qui in poi quella faccia ha un nome.
   *
   * `refused` non è un guasto: è `no_vision` o `is_minor` che fanno il loro
   * lavoro, e in quel caso l'impronta ignota viene distrutta lo stesso. Chi
   * chiama deve poterlo *dire* al proprietario, quindi i due esiti sono
   * distinti invece di essere entrambi «non ha funzionato».
   */
  public async claimPrint(input: {
    printId: string;
    beingId: string;
    gosinoId: string;
  }): Promise<"learned" | "refused" | "unreachable"> {
    // stesso timeout largo di `post`: il pannello aspetta questa risposta, e
    // «irraggiungibile» detto dopo dieci secondi è una risposta; non dirla
    // affatto è una rotella che gira a vuoto
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
    }, this.timeoutMs * SLOW_PATH_FACTOR);
    try {
      const response = await this.fetchImpl(`${this.deps.baseUrl}/v1/prints/claim`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.deps.token}`,
        },
        body: JSON.stringify({
          print_id: input.printId,
          being_id: input.beingId,
          gosino_id: input.gosinoId,
          account_id: this.deps.accountId,
        }),
        signal: abort.signal,
      });
      if (response.status === 403) return "refused";
      return response.ok ? "learned" : "unreachable";
    } catch {
      return "unreachable";
    } finally {
      clearTimeout(timer);
    }
  }

  private async post(path: string, body: object): Promise<unknown> {
    // Con un timeout, e piu' lungo di quello di `ask`. La motivazione
    // originale — «conservare un'impronta non sta sul percorso critico di una
    // risposta» — non reggeva: `rememberUnknownFace` passa di qui, ed e'
    // await-ata dentro `aboutThisFace`, che e' await-ata da `handle('face_seen')`,
    // che e' await-ata dal socket. Un servizio di percezione piantato che non
    // chiude la connessione lasciava una promessa appesa PER SEMPRE a ogni
    // frame — uno ogni 30 secondi per chiosco — ognuna con la sua immagine
    // base64 in memoria. Meglio un'impronta persa che una perdita di memoria
    // che si mangia il processo.
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
    }, this.timeoutMs * SLOW_PATH_FACTOR);
    try {
      const response = await this.fetchImpl(`${this.deps.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.deps.token}`,
        },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      if (!response.ok) return undefined;
      return await response.json();
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  private async ask(path: string, body: object): Promise<Recognised | undefined> {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.deps.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.deps.token}`,
        },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      if (!response.ok) return undefined;
      const parsed = recognisedSchema.safeParse(await response.json());
      if (!parsed.success) return undefined;
      return {
        ...(parsed.data.being_id != null && { beingId: parsed.data.being_id }),
        ...(parsed.data.candidate_being_id != null && {
          candidateBeingId: parsed.data.candidate_being_id,
        }),
        confidence: parsed.data.confidence,
      };
    } catch {
      // servizio spento, scaduto, irraggiungibile: si risponde senza sapere chi
      // è. Mai far cadere una conversazione per un riconoscimento mancato.
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
