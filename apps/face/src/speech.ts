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
 * Quarantena sui risultati del riconoscitore del browser dopo che la bocca ha
 * chiuso. Il riconoscitore **finalizza in ritardo**: la trascrizione di quello
 * che UGO ha appena detto arriva 1-2 secondi dopo la fine dell'audio, cioè
 * oltre gli 800 ms di coda — con `speaking` già falso, entrava come frase
 * tua (visto in produzione 2026-08-17, Silvio che si risponde da solo).
 * Un risultato finalizzato entro questa finestra è quasi certamente la sua
 * voce: una risposta umana vera dura più a lungo e finalizza più tardi.
 * Solo per i risultati del browser: le orecchie locali campionano dal vivo e
 * a loro bastano gli 800 ms di riverbero.
 */
const RESULT_TAIL_MS = 2500;
/** Quante frasi dette si ricordano per il filtro dell'eco. */
const SPOKEN_MEMORY = 3;

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

/**
 * Gli errori che sono un VERDETTO, non un contrattempo.
 *
 * `not-allowed` e `service-not-allowed` sono il sistema che dice NO al
 * riconoscimento: ritentare otto volte è un bip ogni volta per una risposta
 * che non cambierà — visto sul telefono del proprietario, il registro pieno
 * di `not-allowed`/`network` alternati per due minuti. Su un verdetto ci si
 * arrende SUBITO; il backoff resta per il tempo che può cambiare (`network`).
 */
const VERDICTS = ["not-allowed", "service-not-allowed"] as const;

export class Speech {
  private recognition: SpeechRecognitionLike | undefined;
  /** true while the mouth is busy, so the ears do not hear the mouth */
  private speaking = false;
  private lastSpoken: string[] = [];
  /** when the mouth last closed, for the result quarantine */
  private mouthClosedAt = Number.NEGATIVE_INFINITY;
  private listening = false;

  /** The last few things UGO said, newest last, for the echo filter in `heard.ts`. */
  public spokenLast(): readonly string[] {
    return this.lastSpoken;
  }

  private remember(text: string): void {
    // `speak` con voce remota che ripiega su `speakLocal` passa di qui due
    // volte con la stessa frase: una copia basta
    if (this.lastSpoken.at(-1) === text) return;
    this.lastSpoken.push(text);
    if (this.lastSpoken.length > SPOKEN_MEMORY) this.lastSpoken.shift();
  }

  public isListening(): boolean {
    return this.listening;
  }

  /** La bocca è occupata: le orecchie locali non devono sentirla (gruppo 4). */
  public isSpeaking(): boolean {
    return this.speaking;
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
    /**
     * Il freno ha mollato: su questo dispositivo il riconoscitore del browser
     * non resta acceso. Il motivo viaggia col callback perché è il CHIAMANTE
     * a decidere la strada dopo — passare alla dettatura in casa o spegnere
     * le orecchie — e il messaggio giusto dipende da quella scelta.
     */
    onGaveUp?: (why: string) => void,
  ): boolean {
    const Ctor = this.recognitionCtor();
    if (Ctor === undefined) return false;
    this.listening = true;
    let quickDeaths = 0;
    // una riga per CLASSE di errore, non una per tentativo: il registro del
    // proprietario era un muro di `not-allowed`/`network` fotocopiati, e otto
    // copie della stessa notizia non sono piu' notizia della prima
    const alreadyTold = new Set<string>();
    let verdict = false;

    const giveUp = (why: string): void => {
      this.listening = false;
      onGaveUp?.(why);
    };

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
        // la quarantena: un risultato finalizzato mentre parla O nei secondi
        // subito dopo è la sua voce che torna dal riconoscitore in ritardo
        if (this.speaking || performance.now() - this.mouthClosedAt < RESULT_TAIL_MS) return;
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
        verdict ||= (VERDICTS as readonly string[]).includes(what);
        if (worthReporting(what) && !alreadyTold.has(what)) {
          alreadyTold.add(what);
          onTrouble?.("il riconoscitore si e' fermato: " + what);
        }
      };
      recognition.onend = () => {
        if (!this.listening) return;
        // un VERDETTO (permesso negato) non si ritenta: la risposta non
        // cambia, e ogni tentativo suona il bip di sistema
        if (verdict) {
          giveUp("il sistema nega il riconoscimento vocale");
          return;
        }
        // il freno: su certi Android la sessione muore appena nata — il
        // microfono e' del misuratore di rumore e il servizio non riesce a
        // prenderlo. Ogni `start()` li' suona il bip di sistema: riavviare
        // ogni 300 ms e' un campanello perpetuo, non un orecchio.
        const diedQuickly = performance.now() - bornAt < QUICK_DEATH_MS && !heardAnything;
        quickDeaths = diedQuickly ? quickDeaths + 1 : 0;
        if (quickDeaths >= GIVES_UP_AFTER) {
          giveUp("il riconoscitore non riesce a restare acceso su questo dispositivo");
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
  /**
   * Gruppo 13: la voce remota, quando c'è. `undefined` dal fornitore = si
   * ripiega sulla voce di sistema — il degrado è dichiarato lato soul (204:
   * niente chiave, o salvadanaio finito), e il muso non deve saperne il
   * perché: deve solo continuare a parlare.
   */
  private remote: ((text: string, who?: string) => Promise<Blob | undefined>) | undefined;

  public useRemoteVoice(remote: (text: string, who?: string) => Promise<Blob | undefined>): void {
    this.remote = remote;
  }

  public speak(text: string, who?: string): void {
    const remote = this.remote;
    if (remote === undefined) {
      this.speakLocal(text, who);
      return;
    }
    this.remember(text);
    this.speaking = true;
    remote(text, who)
      .then(async (blob) => {
        if (blob === undefined) {
          this.speakLocal(text, who);
          return;
        }
        const audio = new Audio(URL.createObjectURL(blob));
        const done = (): void => {
          this.mouthClosedAt = performance.now();
          setTimeout(() => {
            this.speaking = false;
          }, SPEECH_TAIL_MS);
          URL.revokeObjectURL(audio.src);
        };
        audio.onended = done;
        audio.onerror = done;
        await audio.play();
      })
      .catch(() => {
        // rete o riproduzione: la voce di sistema c'è sempre
        this.speakLocal(text, who);
      });
  }

  private speakLocal(text: string, who?: string): void {
    this.remember(text);
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
      this.mouthClosedAt = performance.now();
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
