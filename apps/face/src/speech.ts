/**
 * A voice, derived from an id (ADR-037).
 *
 * Deterministic, so the same creature always sounds the same — a voice that
 * changed on reconnect would be worse than one voice for everybody. Spread is
 * deliberately narrow: far enough apart to tell two speakers apart, close
 * enough that everybody still sounds like a small pig.
 */
export function voiceOf(who: string | undefined): { pitch: number; rate: number } {
  if (who === undefined || who === "") return { pitch: 1.35, rate: 1.05 };
  let hash = 0;
  for (const char of who) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return {
    pitch: 1.15 + ((hash % 41) / 40) * 0.45,
    rate: 0.95 + (((hash >>> 8) % 21) / 20) * 0.25,
  };
}

/**
 * On-device voice (ADR-006): system STT/TTS, zero cloud, zero cost.
 * MVP activation is tap/presence (wake word arrives in Fase 3).
 */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: { resultIndex: number; results: { 0: { transcript: string } }[] } & Event) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  /** fires when the recognizer decides the sound it is hearing is a voice */
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * Gli errori del riconoscitore che vale la pena mostrare.
 *
 * `no-speech` arriva a ogni pausa di silenzio e `aborted` a ogni riavvio di
 * sessione — cioe' di continuo, per progetto. Riportarli seppellirebbe sotto
 * il rumore i tre che contano davvero: microfono negato, microfono assente,
 * servizio irraggiungibile.
 */
export function worthReporting(error: string): boolean {
  return !["no-speech", "aborted"].includes(error);
}

/** Grace after the mouth stops, for room reverb and a slow recognizer. */
const SPEECH_TAIL_MS = 800;

/**
 * Il freno sul riavvio del riconoscitore.
 *
 * Chrome chiude le sessioni da solo e riavviarle è il prezzo dichiarato del
 * «sempre in ascolto» — ma su certi Android la sessione **muore subito**, ogni
 * volta: il microfono è già in mano al misuratore di rumore e il servizio di
 * riconoscimento non riesce a prenderlo. Riavviare ogni 300 ms in quello stato
 * vuol dire tre cose insieme, tutte viste sul telefono del proprietario: il
 * bip di sistema di apertura microfono **a ciclo continuo**, una coda di
 * richieste che blocca il prompt dei permessi della webcam («non posso
 * abilitarla, dice che ci sono popup aperti»), e nessuna frase riconosciuta
 * comunque.
 *
 * Quindi: una sessione che muore entro `QUICK_DEATH_MS` senza aver sentito
 * niente allunga l'attesa del riavvio (300 ms → 2 s → 5 s → 15 s), e dopo
 * `GIVES_UP_AFTER` morti di fila si **spegne e lo dice**, invece di suonare
 * il bip all'infinito. Una sessione che vive o che sente qualcosa azzera
 * tutto: il comportamento sano resta identico a prima.
 */
const QUICK_DEATH_MS = 1500;
const RESTART_BACKOFF_MS = [300, 2000, 5000, 15000] as const;
const GIVES_UP_AFTER = 8;

export class Speech {
  private recognition: SpeechRecognitionLike | undefined;
  /** true while the mouth is busy, so the ears do not hear the mouth */
  private speaking = false;
  private lastSpoken: string | undefined;
  private listening = false;

  /** What UGO said last, for the echo filter in `heard.ts`. */
  public spokenLast(): string | undefined {
    return this.lastSpoken;
  }

  public isListening(): boolean {
    return this.listening;
  }

  public sttAvailable(): boolean {
    return this.recognitionCtor() !== undefined;
  }

  private recognitionCtor(): SpeechRecognitionCtor | undefined {
    const scope = globalThis as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  }

  /** one listening session; resolves with the transcript or null */
  public async listenOnce(): Promise<string | null> {
    const Ctor = this.recognitionCtor();
    if (Ctor === undefined) return null;
    return new Promise((resolve) => {
      const recognition = new Ctor();
      this.recognition = recognition;
      recognition.lang = "it-IT";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      let transcript: string | null = null;
      recognition.onresult = (event) => {
        transcript = event.results[0]?.[0]?.transcript ?? null;
      };
      recognition.onerror = () => {
        transcript = null;
      };
      recognition.onend = () => {
        resolve(transcript);
      };
      recognition.start();
    });
  }

  /**
   * Keep listening, with no tap per sentence.
   *
   * Chrome ends a recognition session on its own every so often, so the only
   * way to stay listening is to start again on `onend`. Results arriving while
   * the mouth is busy are dropped: the microphone sits next to the speaker,
   * and a creature that answers its own reply talks to nobody at the owner's
   * expense.
   */
  public listen(
    onText: (text: string) => void,
    onVoice?: () => void,
    /**
     * Il riconoscitore si e' fermato per un motivo che vale la pena dire.
     * `no-speech` e `aborted` non lo sono: il primo arriva a ogni pausa di
     * silenzio e il secondo a ogni riavvio di sessione, e riportarli
     * seppellirebbe quelli veri sotto il rumore.
     */
    onTrouble?: (what: string) => void,
    /** Il freno ha mollato: le orecchie sono SPENTE, e la UI deve dirlo. */
    onGaveUp?: () => void,
  ): boolean {
    const Ctor = this.recognitionCtor();
    if (Ctor === undefined) return false;
    this.listening = true;
    let quickDeaths = 0;

    const session = (): void => {
      if (!this.listening) return;
      const recognition = new Ctor();
      this.recognition = recognition;
      recognition.lang = "it-IT";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      const bornAt = performance.now();
      // «ha sentito qualcosa» azzera il freno: una sessione che ascolta
      // davvero puo' morire presto senza essere malata (una frase secca)
      let heardAnything = false;
      recognition.onresult = (event) => {
        heardAnything = true;
        if (this.speaking) return;
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const text = event.results[index]?.[0]?.transcript ?? "";
          if (text.trim() !== "") onText(text);
        }
      };
      // ADR-041: the recognizer knows something a level meter cannot — that
      // the loud thing happening right now is somebody talking. Without this
      // a threshold can only trade "startles at every word" against "never
      // startles at all"; with it, neither trade is necessary.
      recognition.onspeechstart = () => {
        heardAnything = true;
        onVoice?.();
      };
      recognition.onspeechend = () => onVoice?.();
      // a session that ends — by timeout, silence or error — is restarted,
      // otherwise "always listening" quietly becomes "listened once". Ma
      // riavviare **e basta** vuol dire che un microfono negato o un servizio
      // irraggiungibile diventano un orecchio che non sente e non lo dice.
      recognition.onerror = (event) => {
        const what = event.error ?? "sconosciuto";
        if (worthReporting(what)) onTrouble?.(what);
      };
      recognition.onend = () => {
        if (!this.listening) return;
        // il freno: su certi Android la sessione muore appena nata — il
        // microfono e' del misuratore di rumore e il servizio non riesce a
        // prenderlo. Ogni `start()` li' suona il bip di sistema: riavviare
        // ogni 300 ms e' un campanello perpetuo, non un orecchio.
        const diedQuickly = performance.now() - bornAt < QUICK_DEATH_MS && !heardAnything;
        quickDeaths = diedQuickly ? quickDeaths + 1 : 0;
        if (quickDeaths >= GIVES_UP_AFTER) {
          this.listening = false;
          onTrouble?.(
            "il riconoscitore non riesce a restare acceso su questo dispositivo: orecchie spente",
          );
          onGaveUp?.();
          return;
        }
        const wait =
          RESTART_BACKOFF_MS[Math.min(quickDeaths, RESTART_BACKOFF_MS.length - 1)] ?? 300;
        setTimeout(session, wait);
      };
      try {
        recognition.start();
      } catch {
        setTimeout(session, 1000);
      }
    };
    session();
    return true;
  }

  public stopListening(): void {
    this.listening = false;
    this.recognition?.stop();
  }

  /**
   * Pitched-up Italian voice: carattere da porcetto.
   *
   * ADR-037: `who` gives each creature a voice of its own. With two of them in
   * a room a single voice made the conversation unfollowable — you could hear
   * that somebody spoke and not which one. Derived from the id, so it is the
   * same voice every time and on every device, and centred on the original
   * pitch so a house with one creature still sounds exactly as it did.
   */
  public speak(text: string, who?: string): void {
    this.lastSpoken = text;
    if (!("speechSynthesis" in globalThis)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "it-IT";
    const timbre = voiceOf(who);
    utterance.pitch = timbre.pitch;
    utterance.rate = timbre.rate;
    this.speaking = true;
    // the tail matters: the room keeps a little reverb, and the recognizer is
    // still chewing on the last syllable when `onend` fires
    const done = (): void => {
      setTimeout(() => {
        this.speaking = false;
      }, SPEECH_TAIL_MS);
    };
    utterance.onend = done;
    utterance.onerror = done;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
}
