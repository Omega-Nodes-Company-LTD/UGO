import type { FaceToServerMessage } from "@ugo/shared/face";
import { NoiseGate, DEFAULT_SENSITIVITY, type NoiseSensitivity } from "./noiseGate.js";
import { TAP_WORKLET_NAME, TAP_WORKLET_SOURCE } from "./tapWorklet.js";
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
  /** montata una volta sola, qualunque sia l'ordine di arrivo; `stop` smonta ciò che il montaggio ha fatto */
  private tap: { stop: () => void } | undefined;
  /** `addModule` è asincrono: questa bandiera evita due montaggi in corsa */
  private tapMounting = false;
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
    this.tap?.stop();
    this.tap = undefined;
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
   * pezzi); la dettatura vuole un nastro CONTIGUO, quindi la presa è un
   * `AudioWorklet` (`tapWorklet.ts`): i campioni si raccolgono sul thread
   * audio, non su quello che disegna il muso. Dove il worklet non c'è o non
   * si carica, resta il vecchio `ScriptProcessorNode` come ripiego.
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
    if (this.audioTap === undefined || this.tap !== undefined || this.tapMounting) return;
    // il cast è onesto: le WebView vecchie non hanno `audioWorklet`, e lì si
    // torna al nodo deprecato invece di restare sordi
    const worklet = (context as { audioWorklet?: AudioWorklet }).audioWorklet;
    if (worklet === undefined) {
      this.mountLegacyTap(context, source);
      return;
    }
    this.tapMounting = true;
    void this.mountWorkletTap(context, source, worklet).finally(() => {
      this.tapMounting = false;
    });
  }

  /**
   * Il worklet non è un file servito a parte: il sorgente è una stringa nel
   * bundle (`tapWorklet.ts`) e diventa modulo via Blob URL. Era l'unico costo
   * che aveva tenuto in vita `ScriptProcessorNode`, e non c'è più.
   */
  private async mountWorkletTap(
    context: AudioContext,
    source: MediaStreamAudioSourceNode,
    worklet: AudioWorklet,
  ): Promise<void> {
    const url = URL.createObjectURL(new Blob([TAP_WORKLET_SOURCE], { type: "text/javascript" }));
    try {
      await worklet.addModule(url);
    } catch {
      // un CSP severo o un browser bugiardo: la strada vecchia funziona ancora
      if (this.audioContext === context && this.tap === undefined) {
        this.mountLegacyTap(context, source);
      }
      return;
    } finally {
      URL.revokeObjectURL(url);
    }
    // `addModule` è un giro di pista: nel frattempo le orecchie possono
    // essersi spente (contesto nuovo o nessuno più in ascolto)
    if (this.audioContext !== context || this.audioTap === undefined || this.tap !== undefined) {
      return;
    }
    const node = new AudioWorkletNode(context, TAP_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      this.audioTap?.(event.data, context.sampleRate);
    };
    source.connect(node);
    // un nodo che nessuno tira a valle non viene processato; il guadagno a
    // zero evita che il microfono esca dagli altoparlanti
    const mute = context.createGain();
    mute.gain.value = 0;
    node.connect(mute);
    mute.connect(context.destination);
    this.tap = {
      stop: () => {
        node.port.onmessage = null;
        node.port.close();
        node.disconnect();
        mute.disconnect();
      },
    };
  }

  /** Il ripiego, tale e quale a com'era quando era l'unica strada. */
  private mountLegacyTap(context: AudioContext, source: MediaStreamAudioSourceNode): void {
    /* eslint-disable @typescript-eslint/no-deprecated -- scelta deliberata:
       qui si arriva solo dove `AudioWorklet` manca o non si carica, e un
       nodo deprecato che sente è meglio di orecchie moderne sorde. */
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
    this.tap = {
      stop: () => {
        processor.onaudioprocess = null;
        processor.disconnect();
        mute.disconnect();
      },
    };
    /* eslint-enable @typescript-eslint/no-deprecated */
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
