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
  onerror: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Grace after the mouth stops, for room reverb and a slow recognizer. */
const SPEECH_TAIL_MS = 800;

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
  public listen(onText: (text: string) => void): boolean {
    const Ctor = this.recognitionCtor();
    if (Ctor === undefined) return false;
    this.listening = true;

    const session = (): void => {
      if (!this.listening) return;
      const recognition = new Ctor();
      this.recognition = recognition;
      recognition.lang = "it-IT";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        if (this.speaking) return;
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const text = event.results[index]?.[0]?.transcript ?? "";
          if (text.trim() !== "") onText(text);
        }
      };
      // a session that ends — by timeout, silence or error — is restarted,
      // otherwise "always listening" quietly becomes "listened once"
      recognition.onerror = () => undefined;
      recognition.onend = () => {
        if (this.listening) setTimeout(session, 300);
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
