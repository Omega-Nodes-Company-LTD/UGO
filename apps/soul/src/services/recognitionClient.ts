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
  householdId: string;
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
      household_id: this.deps.householdId,
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

  /** Chi è questo volto, dal ritaglio che il corpo ha già fatto. */
  public async byFace(imageBase64: string): Promise<Recognised | undefined> {
    return this.ask("/v1/identify/face", {
      image: imageBase64,
      household_id: this.deps.householdId,
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
      household_id: this.deps.householdId,
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
          household_id: this.deps.householdId,
        }),
      });
      if (response.status === 403) return "refused";
      return response.ok ? "learned" : "unreachable";
    } catch {
      return "unreachable";
    }
  }

  private async post(path: string, body: object): Promise<unknown> {
    // senza timeout, a differenza di `ask`: conservare un'impronta non sta sul
    // percorso critico di una risposta, e mollarlo a meta' lascerebbe un
    // volto scritto solo a meta'
    try {
      const response = await this.fetchImpl(`${this.deps.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.deps.token}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) return undefined;
      return await response.json();
    } catch {
      return undefined;
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
