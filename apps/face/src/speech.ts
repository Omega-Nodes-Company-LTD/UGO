/**
 * On-device voice (ADR-006): system STT/TTS, zero cloud, zero cost.
 * MVP activation is tap/presence (wake word arrives in Fase 3).
 */

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { 0: { transcript: string } }[] } & Event) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export class Speech {
  private recognition: SpeechRecognitionLike | undefined;

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

  public stopListening(): void {
    this.recognition?.stop();
  }

  /** pitched-up Italian voice: carattere da porcetto */
  public speak(text: string): void {
    if (!("speechSynthesis" in globalThis)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "it-IT";
    utterance.pitch = 1.35;
    utterance.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
}
