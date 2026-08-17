import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Speech } from "./speech.js";

/**
 * Il freno sul riavvio del riconoscitore.
 *
 * Il difetto era reale e visto sul telefono del proprietario: su certi Android
 * la sessione muore appena nata (il microfono è del misuratore di rumore), e
 * riavviare ogni 300 ms significava il bip di sistema a ciclo continuo, il
 * prompt della webcam bloccato dalla coda di richieste, e nessuna frase
 * riconosciuta comunque. Qui il riconoscitore è finto apposta: quello vero non
 * esiste fuori dal browser, ma il freno è logica nostra e si prova qui.
 */

class FakeRecognition {
  public static born: FakeRecognition[] = [];
  public lang = "";
  public continuous = false;
  public interimResults = false;
  public maxAlternatives = 0;
  public onresult: ((event: unknown) => void) | null = null;
  public onend: (() => void) | null = null;
  public onerror: ((event: { error?: string }) => void) | null = null;
  public onspeechstart: (() => void) | null = null;
  public onspeechend: (() => void) | null = null;
  public constructor() {
    FakeRecognition.born.push(this);
  }
  public start(): void {
    // il vero riconoscitore parte in asincrono; al freno interessa solo quando muore
  }
  public stop(): void {
    this.onend?.();
  }
}

const scope = globalThis as { webkitSpeechRecognition?: unknown };

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.born = [];
  scope.webkitSpeechRecognition = FakeRecognition;
});

afterEach(() => {
  vi.useRealTimers();
  delete scope.webkitSpeechRecognition;
});

const last = (): FakeRecognition => {
  const instance = FakeRecognition.born.at(-1);
  if (instance === undefined) throw new Error("no session was ever started");
  return instance;
};

describe("il freno sul riavvio (le orecchie che non suonano il campanello)", () => {
  it("dopo otto sessioni morte in culla si spegne e lo dice, invece di riavviare per sempre", () => {
    const speech = new Speech();
    const gaveUp = vi.fn();
    const troubles: string[] = [];
    speech.listen(
      () => undefined,
      undefined,
      (what) => troubles.push(what),
      gaveUp,
    );

    // ogni sessione muore subito senza aver sentito niente; fra una e l'altra
    // si scorre il tempo a passi piccoli, perché coi timer finti anche
    // `performance.now` avanza — e ammazzarla dopo un salto da un minuto la
    // farebbe sembrare longeva
    for (let i = 0; i < 20 && speech.isListening(); i += 1) {
      last().onend?.();
      const count = FakeRecognition.born.length;
      for (let ms = 0; ms < 60_000 && FakeRecognition.born.length === count; ms += 100) {
        vi.advanceTimersByTime(100);
      }
    }

    expect(speech.isListening()).toBe(false);
    // la resa porta il MOTIVO: è il chiamante a decidere la strada dopo
    // (dettatura in casa o orecchie spente) e a comporre il messaggio giusto
    expect(gaveUp).toHaveBeenCalledTimes(1);
    expect(gaveUp).toHaveBeenCalledWith(expect.stringContaining("non riesce a restare acceso"));
    // otto morti, non venti: dopo essersi arreso NON nascono altre sessioni
    expect(FakeRecognition.born.length).toBe(8);
  });

  it("l'attesa cresce invece di martellare ogni 300 ms", () => {
    const speech = new Speech();
    speech.listen(() => undefined);
    expect(FakeRecognition.born.length).toBe(1);

    last().onend?.();
    // prima morte in culla: 300 ms non bastano più, il riavvio arriva a 2 s
    vi.advanceTimersByTime(400);
    expect(FakeRecognition.born.length).toBe(1);
    vi.advanceTimersByTime(1700);
    expect(FakeRecognition.born.length).toBe(2);

    speech.stopListening();
  });

  it("una sessione che ha sentito qualcosa azzera il freno: il caso sano resta a 300 ms", () => {
    const speech = new Speech();
    const heard: string[] = [];
    speech.listen((text) => heard.push(text));

    // la sessione sente una frase e poi Chrome la chiude, come fa davvero
    last().onresult?.({ resultIndex: 0, results: [[{ transcript: "ciao ugo" }]] });
    last().onend?.();
    vi.advanceTimersByTime(300);
    expect(FakeRecognition.born.length).toBe(2);
    expect(heard).toEqual(["ciao ugo"]);

    speech.stopListening();
  });

  it("spegnere le orecchie ferma i riavvii, anche a metà di un'attesa", () => {
    const speech = new Speech();
    speech.listen(() => undefined);
    last().onend?.();
    speech.stopListening();
    vi.advanceTimersByTime(120_000);
    expect(FakeRecognition.born.length).toBe(1);
  });
});

describe("i verdetti e il registro (il telefono del proprietario, secondo giro)", () => {
  it("su not-allowed si arrende SUBITO: un verdetto non si ritenta a suon di bip", () => {
    const speech = new Speech();
    const gaveUp = vi.fn();
    const troubles: string[] = [];
    speech.listen(
      () => undefined,
      undefined,
      (what) => troubles.push(what),
      gaveUp,
    );
    last().onerror?.({ error: "not-allowed" });
    last().onend?.();
    expect(speech.isListening()).toBe(false);
    expect(gaveUp).toHaveBeenCalledTimes(1);
    expect(gaveUp).toHaveBeenCalledWith(expect.stringContaining("nega"));
    // UNA sola sessione: zero riavvii, zero bip in piu'
    expect(FakeRecognition.born.length).toBe(1);
    // il registro riceve la classe di errore; la riga di resa la compone il
    // chiamante, che sa se dopo c'è un'altra strada o il silenzio
    expect(troubles.some((t) => t.includes("not-allowed"))).toBe(true);
  });

  it("otto network fanno UNA riga nel registro, non otto fotocopie", () => {
    const speech = new Speech();
    const troubles: string[] = [];
    speech.listen(
      () => undefined,
      undefined,
      (what) => troubles.push(what),
    );
    for (let i = 0; i < 20 && speech.isListening(); i += 1) {
      last().onerror?.({ error: "network" });
      last().onend?.();
      const count = FakeRecognition.born.length;
      for (let ms = 0; ms < 60_000 && FakeRecognition.born.length === count; ms += 100) {
        if (!speech.isListening()) break;
        vi.advanceTimersByTime(100);
      }
    }
    // una riga per la classe `network`, e NIENT'ALTRO: la riga di resa è del
    // chiamante (via `onGaveUp`), qui non registrato apposta
    expect(troubles).toHaveLength(1);
    expect(troubles[0]).toContain("network");
    expect(speech.isListening()).toBe(false);
  });
});
