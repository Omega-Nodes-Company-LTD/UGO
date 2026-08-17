import type { FaceToServerMessage } from "@ugo/shared/face";
import { NoiseGate, DEFAULT_SENSITIVITY, type NoiseSensitivity } from "./noiseGate.js";
import { VoiceClip } from "./voiceClip.js";

/** How long after a voice a sound is still that voice, and not a bang. */
const VOICE_HUSH_MS = 1_500;

type SendFn = (message: FaceToServerMessage) => void;

const SHAKE_COOLDOWN_MS = 3000;
const SHAKE_THRESHOLD = 18; // m/s² beyond gravity-ish
const LIGHT_PERIOD_MS = 60_000;

/**
 * Local senses, zero-token by design (PROGETTO §4.1): reactions are wired
 * locally, only compact events reach soul. Everything starts on explicit
 * user gesture (mic permission) — nothing records silently.
 */
export class Sensors {
  private readonly noise = new NoiseGate(DEFAULT_SENSITIVITY);
  /** ADR-045: gli ultimi secondi, per sapere CHI ha parlato */
  private clip: VoiceClip | undefined;
  private lastShakeAt = 0;
  private audioContext: AudioContext | undefined;
  private audioTap: ((samples: Float32Array, sampleRate: number) => void) | undefined;
  /** la sorgente viva, per poter agganciare la presa anche a microfono già acceso */
  private source: MediaStreamAudioSourceNode | undefined;
  /** montata una volta sola, qualunque sia l'ordine di arrivo */
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- stessa scelta deliberata di `mountTap`
  private tapNode: ScriptProcessorNode | undefined;
  /**
   * Le tracce vere. Senza questo riferimento «orecchie spente» spegneva solo
   * l'anello: il flusso restava `live`, e il pallino rosso del browser acceso.
   */
  private stream: MediaStream | undefined;
  /** l'anello del misuratore: si ferma davvero quando si spegne */
  private metering = false;

  public constructor(
    private readonly send: SendFn,
    private readonly onLocalStartle: () => void,
    sensitivity: NoiseSensitivity = DEFAULT_SENSITIVITY,
  ) {
    this.noise.setSensitivity(sensitivity);
  }

  /** The room's learned noise floor, for the debug readout. */
  public noiseFloor(): number {
    return Math.round(this.noise.floor);
  }

  /** How easily he startles (ADR-041). Changing it does not unlearn the room. */
  public setNoiseSensitivity(sensitivity: NoiseSensitivity): void {
    this.noise.setSensitivity(sensitivity);
  }

  /**
   * Gli ultimi secondi di parlato, se ce ne sono (ADR-045). `undefined` quando
   * il microfono è spento o la finestra è ancora troppo corta — e allora la
   * frase parte senza voce, che è esattamente il comportamento di prima.
   */
  public lastVoice(): string | undefined {
    return this.clip?.take();
  }

  /** Butta la finestra: privacy mode, orecchie spente. */
  public forgetVoice(): void {
    this.clip?.forget();
  }

  /**
   * Il microfono si spegne DAVVERO: tracce fermate, grafo audio smontato,
   * anello del misuratore interrotto.
   *
   * «Orecchie spente» svuotava soltanto la finestra (`forgetVoice`), ma il
   * ciclo `requestAnimationFrame` continuava a girare e a rimetterci dentro
   * il buffer un fotogramma dopo: la finestra si ripopolava da sola. E le
   * tracce restavano `live`, cioè il pallino rosso del browser acceso su uno
   * spegnimento che non spegneva — la distanza fra quel che il muso dice e
   * quel che il muso fa, proprio sulla cosa in cui quella distanza pesa di più.
   */
  public stopMicrophone(): void {
    this.metering = false;
    this.clip?.forget();
    this.clip = undefined;
    if (this.tapNode !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- si smonta ciò che `mountTap` ha montato
      this.tapNode.onaudioprocess = null;
      this.tapNode.disconnect();
      this.tapNode = undefined;
    }
    this.source?.disconnect();
    this.source = undefined;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = undefined;
    void this.audioContext?.close();
    this.audioContext = undefined;
  }

  /** Il microfono è acceso adesso? Lo chiede il muso per il suo interruttore. */
  public micIsOn(): boolean {
    return this.metering;
  }

  /**
   * That was a voice, not a bang. Held a little past the words themselves,
   * because `onspeechend` arrives before the room stops ringing.
   */
  public heardAVoice(): void {
    this.noise.hushUntil(performance.now() + VOICE_HUSH_MS);
  }

  /**
   * La dettatura locale ascolta lo STESSO microfono (gruppo 4): un secondo
   * `getUserMedia` sarebbe un secondo bip di sistema e un secondo AGC da
   * domare. Il misuratore campiona a battiti (rAF, finestre che si perdono
   * pezzi); la dettatura vuole un nastro CONTIGUO, quindi la presa è uno
   * `ScriptProcessorNode` — deprecato ma ovunque, e senza un file worklet a
   * parte da far digerire al bundler.
   */
  public tapAudio(tap: (samples: Float32Array, sampleRate: number) => void): void {
    this.audioTap = tap;
    // e si aggancia SUBITO se il microfono è già acceso. Prima la presa si
    // montava solo dentro `startMicrophone`, sotto un `if (this.audioTap !==
    // undefined)` — ma l'ordine reale è l'opposto: `startMicrophone()` viene
    // await-ato all'avvio e `tapAudio(...)` arriva dopo, da `startLocalEars`.
    // La condizione era quindi sempre falsa, il nodo non nasceva mai,
    // `onaudioprocess` non esisteva, e con `?stt=locale` la dettatura locale
    // era morta: nemmeno i tre guasti di fila che fanno ripiegare sul browser,
    // perché nessuno chiamava mai `/v1/stt`. Le orecchie restavano sorde e
    // basta.
    this.mountTap();
  }

  /**
   * La presa contigua sul microfono già aperto. Idempotente: chiamarla due
   * volte non raddoppia il nodo, e senza microfono acceso non fa nulla —
   * ci penserà `startMicrophone`.
   */
  private mountTap(): void {
    const context = this.audioContext;
    const source = this.source;
    if (context === undefined || source === undefined) return;
    if (this.audioTap === undefined || this.tapNode !== undefined) return;
    /* eslint-disable @typescript-eslint/no-deprecated -- scelta deliberata:
       ScriptProcessorNode è deprecato ma funziona ovunque, e l'alternativa
       (AudioWorklet) vuole un modulo separato da servire — complessità di
       bundle per un percorso che oggi vive dietro `?stt=locale`. Quando la
       dettatura locale diventerà il default, si migra al worklet. */
    const processor = context.createScriptProcessor(4096, 1, 1);
    source.connect(processor);
    // il processore emette solo se è collegato a valle; il guadagno a zero
    // evita che il microfono esca dagli altoparlanti
    const mute = context.createGain();
    mute.gain.value = 0;
    processor.connect(mute);
    mute.connect(context.destination);
    processor.onaudioprocess = (event) => {
      this.audioTap?.(event.inputBuffer.getChannelData(0), context.sampleRate);
    };
    /* eslint-enable @typescript-eslint/no-deprecated */
    this.tapNode = processor;
  }

  /** microphone level meter → noise events, judged against the room (ADR-029) */
  public async startMicrophone(): Promise<void> {
    // Automatic gain control is ON by default, and it is what made a silent
    // room read as a loud one: AGC amplifies quiet input until it fills the
    // range. For a level meter we want what the room actually did.
    if (this.metering) return; // già acceso: non si aprono due microfoni
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false },
    });
    this.stream = stream;
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.source = source;
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    this.clip = new VoiceClip(this.audioContext.sampleRate);

    // se la dettatura locale si era già annunciata, la presa nasce qui
    this.mountTap();

    this.metering = true;
    const tick = (): void => {
      if (!this.metering) return;
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) sum += sample * sample;
      const rms = Math.sqrt(sum / buffer.length);
      // rough SPL estimate: enough for "sudden loud noise", not metrology
      // uncalibrated on purpose: the gate only ever uses differences, which
      // is what lets the same code work on any microphone
      // l'anello gira sempre: quando il riconoscitore consegna il testo, la
      // frase è già passata, e cominciare a registrare lì prenderebbe il
      // silenzio dopo invece della voce
      this.clip?.push(buffer);
      const db = Math.max(0, 94 + 20 * Math.log10(rms + 1e-8));
      const reading = this.noise.push(db, performance.now());
      if (reading.startled) {
        this.onLocalStartle();
        this.send({ type: "noise", db: Math.round(reading.db) });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** accelerometer bumps → shake events (urto → indignazione) */
  public startMotion(): void {
    window.addEventListener("devicemotion", (event) => {
      const a = event.accelerationIncludingGravity;
      if (a?.x == null || a.y == null || a.z == null) return;
      const magnitude = Math.abs(Math.hypot(a.x, a.y, a.z) - 9.81);
      const now = performance.now();
      if (magnitude > SHAKE_THRESHOLD && now - this.lastShakeAt > SHAKE_COOLDOWN_MS) {
        this.lastShakeAt = now;
        this.onLocalStartle();
        this.send({ type: "shake" });
      }
    });
  }

  /** ambient light → periodic light events (drives the sleep rule server-side) */
  public startLight(): void {
    interface AmbientLightSensorLike {
      illuminance?: number;
      addEventListener: (type: "reading", cb: () => void) => void;
      start: () => void;
    }
    const Ctor = (
      globalThis as { AmbientLightSensor?: new (init: { frequency: number }) => AmbientLightSensorLike }
    ).AmbientLightSensor;
    if (Ctor === undefined) return; // sensor not available: degrade silently
    try {
      const sensor = new Ctor({ frequency: 1 });
      let lastSentAt = 0;
      sensor.addEventListener("reading", () => {
        const now = performance.now();
        if (now - lastSentAt > LIGHT_PERIOD_MS && sensor.illuminance !== undefined) {
          lastSentAt = now;
          this.send({ type: "light", lux: Math.round(sensor.illuminance) });
        }
      });
      sensor.start();
    } catch {
      // permission or platform issue: no light sense, nothing breaks
    }
  }
}
