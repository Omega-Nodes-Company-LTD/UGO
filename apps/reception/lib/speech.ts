"use client";

/**
 * La voce resta nel browser (ADR-053): SpeechRecognition per ascoltare,
 * speechSynthesis per parlare, nessun percorso di upload audio — il tubo non
 * esiste. La voce di ogni gosino è deterministica dal suo id (il pattern
 * `voiceOf` del corpo di casa): stesso gosino, stessa voce, su ogni visita.
 */

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** senza STT la suite degrada a tastiera, dichiarandolo (ADR-053) */
export function speechAvailable(): boolean {
  return recognitionCtor() !== undefined;
}

export interface ListenHandle {
  stop: () => void;
}

export function listen(callbacks: {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onEnd: () => void;
}): ListenHandle | undefined {
  const Ctor = recognitionCtor();
  if (Ctor === undefined) return undefined;
  const recognition = new Ctor();
  recognition.lang = "it-IT";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result === undefined) continue;
      const text = result[0].transcript.trim();
      if (result.isFinal) callbacks.onFinal(text);
      else callbacks.onPartial(text);
    }
  };
  recognition.onend = () => {
    callbacks.onEnd();
  };
  recognition.onerror = () => {
    callbacks.onEnd();
  };
  recognition.start();
  return {
    stop: () => {
      recognition.stop();
    },
  };
}

/** hash stabile → pitch/rate: la voce è del gosino, non della visita */
function seedOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash / 9973;
}

export function speak(gosinoId: string, text: string, onDone?: () => void): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onDone?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const seed = seedOf(gosinoId);
  utterance.lang = "it-IT";
  utterance.pitch = 0.85 + seed * 0.55;
  utterance.rate = 0.95 + seed * 0.15;
  const italian = window.speechSynthesis.getVoices().find((voice) => voice.lang.startsWith("it"));
  if (italian !== undefined) utterance.voice = italian;
  if (onDone !== undefined) utterance.onend = onDone;
  window.speechSynthesis.speak(utterance);
}

export function hush(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
