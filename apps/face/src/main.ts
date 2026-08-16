import type { FaceState, FaceToServerMessage, ServerToFaceMessage } from "@ugo/shared/face";
import { startCameraGaze, startPointerGaze } from "./gaze.js";
import { openFaceLocator } from "./faceLocator.js";
import { GlyphDriver } from "./glyph.js";
import { PortableController } from "./portable.js";
import { ScreenAwake } from "./wakelock.js";
import { createFace } from "./body/createFace.js";
import { Sensors } from "./sensors.js";
import { resolveSoulUrl, soulHttpBase } from "./soulUrl.js";
import { myBuildId, shouldReload } from "./version.js";
import { DEFAULT_SENSITIVITY, SENSITIVITIES, type NoiseSensitivity } from "./noiseGate.js";
import { mountLogPanel } from "./logPanel.js";
import { Speech } from "./speech.js";
import { worthSending } from "./heard.js";
import { FaceSocket } from "./ws.js";

const PRESENCE_COOLDOWN_MS = 30_000;

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`face markup incomplete: ${selector}`);
  }
  return element;
}

const app = requireElement("#app");
const canvasElement = requireElement("#face");
if (!(canvasElement instanceof HTMLCanvasElement)) throw new Error("#face is not a canvas");
const canvas = canvasElement;
const moodLabel = requireElement("#mood-label");
const speakText = requireElement("#speak-text");
const connStatus = requireElement("#conn");
const micButton = requireElement("#btn-mic");
const roomPick = requireElement("#room-pick") as HTMLSelectElement;
const earPick = requireElement("#ear-pick") as HTMLSelectElement;
const logPanel = requireElement("#log");
const logLines = requireElement("#log-lines");
const earsButton = requireElement("#btn-ears");
const versionLabel = requireElement("#version");

const params = new URLSearchParams(location.search);
// ADR-036: `?stanza=cucina` makes this device the body of a ROOM — whoever
// lives there appears on it, one or several. `?gosino=` (ADR-032) still names
// one exactly; without either, the dock gets the eldest, which is what a
// single-exemplar house has always shown.
const soulUrl = resolveSoulUrl(location, params.get("soul"), params.get("gosino"), params.get("stanza"));
// portable mode (§4.2): NFC tag in the shell sets ?mode=portable; manual fallback
const portableMode = params.get("mode") === "portable";
const soulHttp = soulHttpBase(soulUrl);

// ADR-026: the body is 3D where the device can, 2D where it cannot. Nothing
// below this line knows which one it got.
const renderer = createFace(canvas, {
  force: params.get("renderer"),
  wander: params.get("wander") !== "off",
});
const glyph = new GlyphDriver(app);
const speech = new Speech();
let lastPresenceAt = 0;
/** who is in this room (ADR-036); one nameless entry until the roster lands */
let residents: { id: string; name: string }[] = [];
const nameOf = (who: string | undefined): string | undefined =>
  residents.find((r) => r.id === who)?.name;
/** each creature's mood, so the caption can name all of them (ADR-038) */
const moods = new Map<string, string>();

/** What was said, kept and reopenable (ADR-038). */
const { remember } = mountLogPanel(
  {
    app,
    panel: logPanel,
    lines: logLines,
    toggle: requireElement("#btn-log"),
    close: requireElement("#log-close"),
    clear: requireElement("#log-clear"),
  },
  params.get("stanza"),
);

/**
 * Qualcosa nel corpo non ha funzionato, e lo si vede senza un portatile.
 *
 * Finisce nello stesso registro di cio' che e' stato detto, con un nome che
 * non si confonde con una creatura. Il posto giusto sarebbe una console; il
 * posto **utile** e' lo schermo che hai davanti quando UGO non risponde.
 */
function trouble(what: string): void {
  remember({ who: "⚠ il corpo", text: what, at: Date.now(), mine: false });
}

/**
 * Quale muso stai guardando, e ricaricarlo da solo quando ne esce uno nuovo.
 *
 * Nasce da un pomeriggio perso: davanti a un muso che non rispondeva non c'era
 * modo di sapere se il dispositivo eseguisse il codice appena rilasciato o
 * quello vecchio ancora in cache, e ogni ipotesi costava un giro di deploy per
 * essere smentita. Adesso la versione e' scritta accanto alla creatura, e
 * quando soul ne serve una diversa la pagina si ricarica.
 */
const MY_BUILD = myBuildId();
const VERSION_POLL_MS = 60_000;
versionLabel.textContent = MY_BUILD;

async function checkVersion(): Promise<void> {
  try {
    const response = await fetch(`${soulHttp}/v1/version`);
    if (!response.ok) return;
    const served = (await response.json()) as { version?: string };
    if (!shouldReload(MY_BUILD, served.version)) return;
    // ricaricare mentre qualcuno parla e' sgarbato, ma un muso vecchio che
    // sembra nuovo e' peggio: lo si dice e lo si fa
    trouble(`nuova versione (${served.version ?? "?"}): ricarico`);
    location.reload();
  } catch {
    // soul irraggiungibile: e' gia' il lavoro del socket dirlo, e un secondo
    // allarme per la stessa cosa e' rumore
  }
}

void checkVersion();
setInterval(() => void checkVersion(), VERSION_POLL_MS);
// tornare sulla scheda dopo un deploy e' il momento in cui la domanda «sto
// guardando roba vecchia?» si pone davvero
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void checkVersion();
});

let speakTimer: ReturnType<typeof setTimeout> | undefined;

/** Nobody named means the whole room, which is also the one-creature case. */
function setLocalState(state: FaceState, who?: string): void {
  // the shell's own state drives the page chrome (privacy, sleep). With several
  // in the room it follows whoever is most awake, so one sleeping creature does
  // not put the whole screen to bed.
  if (who !== undefined) states.set(who, state);
  app.dataset.state = liveliest(state);
  renderer.setState(state, who);
}

const states = new Map<string, FaceState>();
/** The most awake state in the room: a screen is asleep only if everybody is. */
const LIVELINESS: FaceState[] = ["sleeping", "idle", "alert", "listening", "thinking", "talking"];
function liveliest(fallback: FaceState): FaceState {
  if (residents.length < 2) return fallback;
  let best = 0;
  for (const state of states.values()) best = Math.max(best, LIVELINESS.indexOf(state));
  return LIVELINESS[best] ?? fallback;
}

/**
 * ADR-037: with more than one creature in the room the bubble has to say who
 * spoke. A room where you can hear a sentence and not tell which of them said
 * it is worse than a room with one creature in it.
 */
function showSpeech(text: string, who?: string): void {
  const name = residents.length > 1 ? nameOf(who) : undefined;
  speakText.textContent = name === undefined ? text : `${name}: ${text}`;
  speakText.classList.add("visible");
  clearTimeout(speakTimer);
  speakTimer = setTimeout(() => {
    speakText.classList.remove("visible");
  }, 6000);
}

/**
 * Which room this screen is (ADR-037).
 *
 * The room used to be settable only by editing the query string, which is not
 * an interface — the owner asked for exactly this. Switching reloads rather
 * than reconnecting in place: the socket, the senses and the renderer are all
 * built around one room at boot, and pretending to swap them live would be a
 * lot of moving parts for a control used twice a year.
 */
async function loadRooms(): Promise<void> {
  let rooms: { room: string; gosini: { name: string }[] }[] = [];
  try {
    const res = await fetch(`${soulHttp}/v1/rooms`);
    rooms = ((await res.json()) as { rooms?: typeof rooms }).rooms ?? [];
  } catch {
    return; // no soul yet: the picker simply does not appear
  }
  // shown as soon as ONE room exists. Hiding it below two was wrong twice
  // over: a screen that shows a room must say WHICH room even when there is
  // only one, and a house that puts everybody in the same room had no way to
  // pick it at all.
  if (rooms.length === 0) return;
  const current = params.get("stanza")?.toLowerCase();
  roomPick.innerHTML = rooms
    .map((r) => {
      const chosen = r.room.toLowerCase() === current ? " selected" : "";
      // ADR-039: a room can be empty now, and "cucina · " with nothing after
      // the separator reads like a bug rather than like an empty room
      const names = r.gosini.map((g) => g.name).join(", ");
      const who = names === "" ? " · vuota" : ` · ${names}`;
      return `<option value="${r.room}"${chosen}>${r.room}${who}</option>`;
    })
    .join("");
  // an explicit "nobody in particular" entry, so the choice is reversible
  roomPick.insertAdjacentHTML(
    "afterbegin",
    `<option value=""${current === undefined ? " selected" : ""}>— nessuna stanza —</option>`,
  );
  roomPick.hidden = false;
}

/**
 * How easily he startles (ADR-041).
 *
 * Kept on the device and per room, not on the creature: the same creature in a
 * quiet study and in a kitchen with a television needs two different answers,
 * and it is the room that differs. The setting outlives a reload, because a
 * threshold you have to set again every morning is not a setting.
 */
const EAR_KEY = `ugo_ears_${params.get("stanza") ?? "casa"}`;

function savedSensitivity(): NoiseSensitivity {
  const stored = localStorage.getItem(EAR_KEY);
  return stored !== null && stored in SENSITIVITIES
    ? (stored as NoiseSensitivity)
    : DEFAULT_SENSITIVITY;
}

earPick.value = savedSensitivity();
earPick.addEventListener("change", () => {
  const chosen = earPick.value as NoiseSensitivity;
  localStorage.setItem(EAR_KEY, chosen);
  sensors.setNoiseSensitivity(chosen);
});

roomPick.addEventListener("change", () => {
  const next = new URL(location.href);
  if (roomPick.value === "") next.searchParams.delete("stanza");
  else next.searchParams.set("stanza", roomPick.value);
  location.assign(next.toString());
});

function onServerMessage(message: ServerToFaceMessage): void {
  switch (message.type) {
    case "state":
      setLocalState(message.state, message.who);
      return;
    case "mood": {
      // ADR-038: one caption for a room of several was a caption about nobody.
      // Each creature's mood is kept and the line lists them all by name.
      if (message.who !== undefined) moods.set(message.who, message.label);
      moodLabel.textContent =
        residents.length > 1
          ? residents
              .map((r) => `${r.name}: ${moods.get(r.id) ?? "—"}`)
              .join("  ·  ")
          : message.label;
      // every psyche variable reaches the body now, not just umore and stress
      renderer.setMood(message.label, message.vars, message.who);
      return;
    }
    case "speak":
      remember({
        who: nameOf(message.who) ?? "UGO",
        text: message.text,
        at: Date.now(),
        mine: false,
      });
      showSpeech(message.text, message.who);
      speech.speak(message.text, message.who);
      // and the others turn to look at whoever is talking: a room where
      // nobody reacts to anybody is two creatures in the same picture, not
      // two creatures in the same room
      renderer.attendTo?.(message.who);
      return;
    case "glyph":
      glyph.play(message.pattern);
      return;
    case "whoami":
      // an unknown name falls back to the default, so the dock says whose face
      // this actually is instead of quietly showing somebody else
      app.dataset.gosino = message.name;
      return;
    case "roster":
      // ADR-036: who lives in this room. The body draws one creature per entry,
      // and keeps the ones already here so a reconnect does not make them
      // all flinch.
      residents = message.gosini;
      app.dataset.room = message.room ?? "";
      app.dataset.gosino = message.gosini.map((g) => g.name).join(", ");
      renderer.setResidents?.(message.gosini);
      return;
    case "gesture":
      // ADR-027: soul decided, the body performs. Unknown ids are dropped by
      // the player, so an older face and a newer soul stay compatible.
      renderer.reflex(message.id, message.who);
      return;
    case "scene":
      // ADR-056: cosa c'è nella stanza. Arriva dopo il roster all'apertura, e
      // di nuovo ogni volta che il proprietario sposta qualcosa dal pannello —
      // senza la seconda cosa dovrebbe ricaricare il chiosco a ogni cuscino.
      renderer.setProps?.(message.props);
      return;
  }
}

const socket = new FaceSocket(soulUrl, {
  onMessage: onServerMessage,
  onConnected: (connected) => {
    app.dataset.connected = String(connected);
    connStatus.textContent = connected ? "connesso" : "disconnesso";
    // ADR-030: declare which shell this is on every (re)connection, not once
    // at boot — a socket that dropped while out must not leave soul thinking
    // he is still on the shelf.
    if (connected) socket.send({ type: "mode", mode: portableMode ? "portable" : "home" });
  },
});

/**
 * The one door out (ADR-038). What the room was heard to say is half the
 * conversation, and the scroll records it here rather than at the microphone:
 * a sentence typed in, or replayed from the offline queue, is still something
 * that was said in this room, and hooking the recorder to one input would have
 * kept only the half that came through that input.
 */
function sendToSoul(message: FaceToServerMessage): void {
  if (message.type === "heard_text") {
    remember({ who: "tu", text: message.text, at: Date.now(), mine: true });
  }
  socket.send(message);
}

// local zero-token reactions: startle immediately, tell soul right after
const sensors = new Sensors(
  (message) => {
    // ADR-056 (gruppo 10): il botto viaggia con chi era al riparo quando è
    // suonato. Arricchito QUI e non dentro `sensors`, che dei corpi non sa
    // niente — sa solo quanto è forte la stanza
    if (message.type === "noise") {
      const sheltered = renderer.shelteredNow?.() ?? [];
      socket.send(sheltered.length > 0 ? { ...message, sheltered } : message);
      return;
    }
    socket.send(message);
  },
  () => {
    setLocalState("alert");
    // zero-token local reaction: he jumps before soul has heard about it
    renderer.reflex("noise");
  },
  savedSensitivity(),
);

canvas.addEventListener("pointerdown", (event) => {
  // ADR-058: due gesti, e la differenza è dove hai puntato. Sul **muso** è la
  // mela, un premio deliberato che scalda il legame e pesa l'ultima iniziativa;
  // ovunque altro è la carezza, che è piccola e con un tetto. Un premio che si
  // dà per sbaglio non è un premio.
  const box = canvas.getBoundingClientRect();
  const snout = renderer.snoutAt?.({
    x: ((event.clientX - box.left) / box.width) * 2 - 1,
    y: -(((event.clientY - box.top) / box.height) * 2 - 1),
  });
  if (snout !== undefined) {
    // senza `act`: quale iniziativa stai premiando lo sa **soul**, che l'ha
    // presa e l'ha scritta in `events`. Farlo tracciare anche al muso sarebbe
    // una seconda copia della stessa verità, tenuta allineata a mano.
    socket.send({ type: "reward" });
    renderer.reflex("wiggle", snout);
    return;
  }
  socket.send({ type: "tap" });
  renderer.reflex("tap");
});

// ADR-056: è andato da solo sul cuscino, e lo dice. La decisione è del corpo e
// costa zero token (ADR-026 §6); l'anima è l'unica che possa scriverlo nella
// psiche, quindi è l'unica cosa che deve attraversare il socket.
renderer.onUsedProp?.((who, kind) => {
  socket.send({ type: "used_prop", kind, ...(who !== "" && { who }) });
});

/**
 * Listening without being asked (§4.1).
 *
 * The tap-per-sentence was honest while the browser's recognizer was the only
 * option, but it makes a companion feel like a walkie-talkie. Now UGO listens
 * for as long as the senses are on, and two guards keep that from being
 * expensive: `worthSending` drops grunts and drops UGO's own voice coming back
 * from the speaker, and the mouth mutes the ears while it talks.
 *
 * The trade is declared, not hidden: the browser's recognizer is Google's, so
 * what you SAY leaves the house while this is on. `Ehi UGO` on the device
 * (Fase 3) is what removes that, and the button below is what removes it now.
 */
function startListening(): void {
  if (!speech.sttAvailable()) return;
  const started = speech.listen(
    (text) => {
      if (!worthSending(text, { spoken: speech.spokenLast() })) return;
      setLocalState("listening");
      // ADR-045: la voce che l'ha detta viaggia con la frase, così soul può
      // sapere CHI sta parlando. Assente se il microfono è spento: allora è
      // esattamente il messaggio di prima.
      // ADR-045 dice che l'audio e' FACOLTATIVO, ma stava su una riga che
      // poteva mangiarsi la frase: `lastVoice()` prima di `sendToSoul()`, e
      // un'eccezione li' faceva sparire tutto — nemmeno il registro locale, che
      // e' scritto dentro `sendToSoul`. Degradare a solo-testo e' il
      // comportamento dichiarato; perdere la frase non lo e' mai stato.
      let voice: string | undefined;
      try {
        voice = sensors.lastVoice();
      } catch {
        voice = undefined;
        trouble("la voce non si e' potuta ritagliare: mando solo il testo");
      }
      sendToSoul({ type: "heard_text", text, ...(voice !== undefined && { audio: voice }) });
    },
    // ADR-041: the recognizer heard a VOICE. Whatever the level meter is about
    // to make of that sound, it is not a bang — this is the one signal that
    // stops "sente ogni mia parola come botto" without also making him deaf.
    () => {
      sensors.heardAVoice();
    },
    // `onerror` era `() => undefined`: se Chrome rifiutava il microfono o non
    // raggiungeva il proprio servizio, il corpo riavviava la sessione per
    // sempre e non lo diceva a nessuno. Un orecchio che non sente e non lo
    // dichiara e' indistinguibile da una stanza silenziosa.
    (what) => {
      trouble("il riconoscitore si e' fermato: " + what);
    },
    // Il freno ha mollato (speech.ts): su questo dispositivo le sessioni
    // muoiono appena nate — tipicamente un Android in cui il misuratore di
    // rumore tiene il microfono — e insistere era il bip di sistema a ciclo
    // continuo piu' una coda di richieste che bloccava il prompt della
    // webcam. Le orecchie si spengono DAVVERO e il bottone lo mostra: i
    // sensi restano accesi (rumore, luce, camera), manca solo la dettatura,
    // e un altro tocco sul bottone riprova.
    () => {
      app.dataset.ears = "off";
      setLocalState("idle");
      earsButton.textContent = "🔇 orecchie spente";
    },
  );
  if (started) app.dataset.ears = "on";
}

function stopListening(): void {
  // ADR-045: le orecchie spente devono anche dimenticare, o "spento" vorrebbe
  // dire solo "non manda"
  sensors.forgetVoice();
  speech.stopListening();
  app.dataset.ears = "off";
  setLocalState("idle");
}

/**
 * In the dock the screen must stay on, or the creature is a screensaver.
 * Taken together with the senses because both need the same user gesture,
 * and re-taken whenever the tab comes back — the system drops it on hide.
 */
const awake = new ScreenAwake();
awake.watch(document);

// il ripiego universale, finché la camera non si accende: senza, in un browser
// senza permessi le pupille non si muoverebbero mai. Si spegne appena la
// camera parte — due sorgenti sulle stesse pupille vuol dire che vince
// l'ultima che ha parlato.
const pointerGaze = startPointerGaze(canvas, (target) => {
  renderer.setGaze(target);
});

micButton.addEventListener("click", () => {
  void (async () => {
    await awake.acquire();
    await sensors.startMicrophone().catch(() => undefined);
    sensors.startMotion();
    sensors.startLight();
    // ADR-044: il locator ORA viene passato. Prima non lo passava nessuno, e
    // `startCameraGaze` ripiegava sul `FaceDetector` nativo — un'API ritirata,
    // che in ogni browser spedito fallisce: la camera non si accendeva mai e
    // le pupille seguivano il dito.
    const locator = await openFaceLocator();
    const camera = await startCameraGaze(
      (target) => {
        // `null` incluso, ed è il punto: era `if (target !== null)`, quindi
        // uscendo dal campo le pupille restavano congelate su dove eri
        renderer.setGaze(target);
      },
      (crop) => {
        const now = performance.now();
        if (now - lastPresenceAt > PRESENCE_COOLDOWN_MS) {
          lastPresenceAt = now;
          // ADR-057: il ritaglio viaggia con la presenza. Il video non esce mai
          // dal telefono — quel che parte è un rettangolo di 112×112 già
          // ridotto al volto, e solo se il rilevatore ha dato un rettangolo.
          socket.send({ type: "face_seen", ...(crop !== undefined && { image: crop }) });
        }
      },
      locator,
    ).catch(() => null);
    if (camera !== null) {
      // due sorgenti sulle stesse pupille vuol dire che vince l'ultima che ha
      // parlato: da qui in poi decide la camera, e il dito si toglie di mezzo
      pointerGaze.stop();
    }
    startListening();
    micButton.hidden = true;
    earsButton.hidden = false;
  })();
});

earsButton.addEventListener("click", () => {
  if (speech.isListening()) {
    stopListening();
    earsButton.textContent = "🔇 orecchie spente";
  } else {
    startListening();
    earsButton.textContent = "👂 ti ascolto";
  }
});

renderer.start();
void socket.start();
// the picker asks the soul which rooms exist; it never blocks the body
void loadRooms();


// ---- portable mode wiring (§4.2) ------------------------------------------
const portable = new PortableController(
  soulHttp,
  {
    recBanner: requireElement("#rec-banner"),
    privacyOverlay: requireElement("#privacy-overlay"),
    qrOverlay: requireElement("#qr-overlay"),
    qrCanvas: (() => {
      const el = requireElement("#qr-canvas");
      if (!(el instanceof HTMLCanvasElement)) throw new Error("#qr-canvas is not a canvas");
      return el;
    })(),
  },
  (message) => {
    socket.send(message);
  },
  params.get("contact") ?? "https://thinkpinkstudio.it",
  params.get("token") ?? undefined,
  (recording) => {
    if (recording) glyph.play("rec");
  },
);

if (portableMode) {
  app.dataset.mode = "portable";
  renderer.setLowPower(true);
  for (const id of ["#btn-rec", "#btn-privacy", "#btn-card"]) requireElement(id).hidden = false;
  const recButton = requireElement("#btn-rec");
  recButton.addEventListener("click", () => {
    void (async () => {
      if (portable.recorderState() === "recording") {
        await portable.stopRecording();
        recButton.textContent = "● REC";
      } else {
        await portable.startRecording();
        recButton.textContent = "■ STOP";
      }
    })();
  });
  requireElement("#btn-privacy").addEventListener("click", () => {
    void portable.setPrivacy(true);
  });
  requireElement("#btn-privacy-off").addEventListener("click", () => {
    void portable.setPrivacy(false);
  });
  requireElement("#btn-card").addEventListener("click", () => {
    void portable.showBusinessCard();
  });
  requireElement("#btn-qr-close").addEventListener("click", () => {
    portable.hideBusinessCard();
  });
}

/** deterministic hooks for e2e tests */
declare global {
  interface Window {
    __ugoFace: {
      send: (message: FaceToServerMessage) => void;
      queued: () => number;
      queuedFresh: () => Promise<number>;
      awake: () => { available: boolean; held: boolean };
      /** what the room sounds like to him, for diagnosing a jumpy UGO */
      senses: () => { noiseFloor: number; listening: boolean };
    };
    __ugoGlyph: { current: () => string | undefined; available: () => boolean };
    __ugoBody: {
      debug: () => Record<string, string | number>;
      play: (id: string) => void;
      mood: (vars: Record<string, number>) => void;
    };
    __ugoPortable: {
      startRec: () => Promise<void>;
      stopRec: () => Promise<void>;
      setPrivacy: (on: boolean) => Promise<void>;
      showCard: () => Promise<void>;
      recorderState: () => string;
      trackStates: () => string[];
      pending: () => number;
    };
  }
}
window.__ugoFace = {
  send: (message) => {
    sendToSoul(message);
  },
  queued: () => socket.queuedCount(),
  queuedFresh: () => socket.queuedCountFresh(),
  awake: () => ({ available: awake.available(), held: awake.held() }),
  senses: () => ({ noiseFloor: sensors.noiseFloor(), listening: speech.isListening() }),
};
window.__ugoBody = {
  debug: () => renderer.debug(),
  play: (id) => {
    renderer.reflex(id);
  },
  mood: (vars) => {
    renderer.setMood("test", vars);
  },
};
window.__ugoGlyph = {
  current: () => glyph.currentPattern(),
  available: () => glyph.available(),
};
window.__ugoPortable = {
  startRec: () => portable.startRecording(),
  stopRec: () => portable.stopRecording(),
  setPrivacy: (on) => portable.setPrivacy(on),
  showCard: () => portable.showBusinessCard(),
  recorderState: () => portable.recorderState(),
  trackStates: () => portable.trackStates(),
  pending: () => portable.pendingCount(),
};
