import { VOICE_SAMPLE_BITRATE, type FaceToServerMessage } from "@ugo/shared/face";

/**
 * L'invito «fatti sentire la voce» (ADR-057, la seconda metà).
 *
 * Arriva dal claim del volto nel pannello: UGO ha appena imparato la faccia di
 * qualcuno e chiede — qui, dove la persona sta davvero — di parlargli, così
 * dopo la riconosce anche senza vederla. Un bottone temporaneo nell'HUD, dieci
 * secondi di microfono con la stessa ricetta del pannello, e il clip sale sul
 * socket come `voice_sample`.
 *
 * La finestra vera la tiene soul (`voiceAskOpen`, 30 minuti): il TTL locale è
 * più corto apposta, perché un bottone che si preme e viene rifiutato dal
 * server è peggio di un bottone che sparisce prima.
 */

/** quanto vive il bottone sullo schermo prima di sparire da solo */
export const INVITE_TTL_MS = 10 * 60_000;
/** la stessa durata della ricetta del pannello (`script/voice.ts`) */
export const RECORD_MS = 10_000;
/**
 * Il tetto del contratto (`faceContracts.ts`): oltre non partirebbe comunque.
 *
 * Da oggi è una rete di sicurezza e non un limite che si tocca: il ritmo di
 * registrazione è dichiarato ({@link VOICE_SAMPLE_BITRATE}), quindi dieci
 * secondi stanno sempre in 40 000 caratteri. Prima non lo era, e il risultato
 * era il peggiore possibile — si chiedeva alla persona di parlare per dieci
 * secondi, e POI si buttava via il clip.
 */
export const MAX_AUDIO_B64 = 120_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // a blocchi: `String.fromCharCode(...bytes)` su centinaia di KB sfora lo
  // stack degli argomenti
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * La logica dell'invito, senza DOM né microfono: chi è invitato, per quanto,
 * e cosa diventa un clip registrato. Separata così perché è l'unica parte che
 * un test in Node può provare — il resto è browser, e si prova col banco.
 */
export class VoiceInvite {
  private offer: { beingId: string; name: string; expiresAt: number } | undefined;

  public constructor(private readonly clock: () => number = () => Date.now()) {}

  /** un invito alla volta: l'ultimo arrivato vince */
  public open(beingId: string, name: string): void {
    this.offer = { beingId, name, expiresAt: this.clock() + INVITE_TTL_MS };
  }

  public current(): { beingId: string; name: string } | undefined {
    if (this.offer === undefined) return undefined;
    if (this.clock() > this.offer.expiresAt) {
      this.offer = undefined;
      return undefined;
    }
    return { beingId: this.offer.beingId, name: this.offer.name };
  }

  /**
   * Il clip diventa un frame, o un motivo per cui no. Consuma l'invito quando
   * riesce: un campione basta, e la finestra non è un raccoglitore — la stessa
   * regola che soul applica dal suo lato (`voiceAskOpen`).
   */
  public frameFor(
    bytes: Uint8Array,
  ): { frame: FaceToServerMessage & { type: "voice_sample" } } | { error: string } {
    const offer = this.current();
    if (offer === undefined) return { error: "l'invito è scaduto" };
    if (bytes.length === 0) return { error: "non è arrivato audio dal microfono" };
    const audio = toBase64(bytes);
    if (audio.length > MAX_AUDIO_B64) return { error: "il clip è troppo lungo per il contratto" };
    this.offer = undefined;
    return { frame: { type: "voice_sample", beingId: offer.beingId, audio } };
  }
}

/** dieci secondi di webm/opus — la ricetta identica al pannello */
async function recordClip(): Promise<Uint8Array> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    // il ritmo si DICHIARA: senza, il browser sceglie da sé, sceglie alto, e
    // dieci secondi sforano il tetto del contratto (`faceContracts.ts`)
    const recorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: VOICE_SAMPLE_BITRATE,
    });
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => {
        resolve();
      });
    });
    recorder.start();
    setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, RECORD_MS);
    await stopped;
    return new Uint8Array(await new Blob(chunks, { type: "audio/webm" }).arrayBuffer());
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

export interface VoiceInviteMountDeps {
  hud: HTMLElement;
  send: (message: FaceToServerMessage) => void;
  trouble: (what: string) => void;
  /** iniettabile per il banco; il vero è microfono + MediaRecorder */
  record?: () => Promise<Uint8Array>;
}

/** Il lato DOM: il bottone che appare, registra, e sparisce. */
export function mountVoiceInvite(deps: VoiceInviteMountDeps): {
  offer: (beingId: string, name: string) => void;
} {
  const invite = new VoiceInvite();
  let button: HTMLButtonElement | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;

  const dismiss = (): void => {
    clearTimeout(expiry);
    button?.remove();
    button = undefined;
  };

  const capture = async (name: string, pressed: HTMLButtonElement): Promise<void> => {
    pressed.disabled = true;
    pressed.textContent = "● sto ascoltando…";
    try {
      const clip = await (deps.record ?? recordClip)();
      const made = invite.frameFor(clip);
      if ("error" in made) {
        deps.trouble(`la voce non è partita: ${made.error}`);
        // il bottone RESTA. `frameFor` non consuma l'invito quando rifiuta
        // (lo dice il suo test), ma qui si chiamava `dismiss()`: l'invito
        // sopravviveva invisibile e la persona non aveva più niente da
        // premere. Un rifiuto deve costare un tentativo, non la strada.
        pressed.disabled = false;
        pressed.textContent = `La voce di ${name}`;
        return;
      }
      deps.send(made.frame);
      dismiss();
    } catch (error) {
      // microfono negato o rotto: il bottone resta, un altro tocco riprova
      deps.trouble(
        `la voce non è partita: ${error instanceof Error ? error.message : "microfono non disponibile"}`,
      );
      pressed.disabled = false;
      pressed.textContent = `La voce di ${name}`;
    }
  };

  return {
    offer: (beingId: string, name: string): void => {
      dismiss();
      invite.open(beingId, name);
      const created = document.createElement("button");
      created.type = "button";
      created.id = "btn-voice-invite";
      created.dataset.testid = "btn-voice-invite";
      created.textContent = `La voce di ${name}`;
      created.addEventListener("click", () => {
        void capture(name, created);
      });
      deps.hud.append(created);
      button = created;
      expiry = setTimeout(dismiss, INVITE_TTL_MS);
    },
  };
}
