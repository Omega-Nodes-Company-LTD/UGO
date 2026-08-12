import type { FaceState, FaceToServerMessage, ServerToFaceMessage } from "@ugo/shared/face";
import { startCameraGaze, startPointerGaze } from "./gaze.js";
import { GlyphDriver } from "./glyph.js";
import { PortableController } from "./portable.js";
import { ScreenAwake } from "./wakelock.js";
import { createFace } from "./body/createFace.js";
import { Sensors } from "./sensors.js";
import { resolveSoulUrl, soulHttpBase } from "./soulUrl.js";
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
const earsButton = requireElement("#btn-ears");

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
let speakTimer: ReturnType<typeof setTimeout> | undefined;

/** Nobody named means the whole room, which is also the one-creature case. */
function setLocalState(state: FaceState, who?: string): void {
  app.dataset.state = state;
  renderer.setState(state, who);
}

function showSpeech(text: string): void {
  speakText.textContent = text;
  speakText.classList.add("visible");
  clearTimeout(speakTimer);
  speakTimer = setTimeout(() => {
    speakText.classList.remove("visible");
  }, 6000);
}

function onServerMessage(message: ServerToFaceMessage): void {
  switch (message.type) {
    case "state":
      setLocalState(message.state, message.who);
      return;
    case "mood": {
      // with several in the room the caption would flicker between their moods,
      // so it follows the first — the others show theirs in how they move
      if (message.who === undefined || message.who === residents[0]?.id) {
        moodLabel.textContent = message.label;
      }
      // every psyche variable reaches the body now, not just umore and stress
      renderer.setMood(message.label, message.vars, message.who);
      return;
    }
    case "speak":
      showSpeech(message.text);
      speech.speak(message.text);
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

// local zero-token reactions: startle immediately, tell soul right after
const sensors = new Sensors(
  (message) => {
    socket.send(message);
  },
  () => {
    setLocalState("alert");
    // zero-token local reaction: he jumps before soul has heard about it
    renderer.reflex("noise");
  },
);

canvas.addEventListener("pointerdown", () => {
  socket.send({ type: "tap" });
  renderer.reflex("tap");
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
  const started = speech.listen((text) => {
    if (!worthSending(text, { spoken: speech.spokenLast() })) return;
    setLocalState("listening");
    socket.send({ type: "heard_text", text });
  });
  if (started) app.dataset.ears = "on";
}

function stopListening(): void {
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

micButton.addEventListener("click", () => {
  void (async () => {
    await awake.acquire();
    await sensors.startMicrophone().catch(() => undefined);
    sensors.startMotion();
    sensors.startLight();
    const camera = await startCameraGaze(
      (target) => {
        if (target !== null) renderer.setGaze(target);
      },
      () => {
        const now = performance.now();
        if (now - lastPresenceAt > PRESENCE_COOLDOWN_MS) {
          lastPresenceAt = now;
          socket.send({ type: "face_seen" });
        }
      },
    ).catch(() => null);
    if (camera === null) {
      // universal fallback: pupils follow pointer/touch
      startPointerGaze(canvas, (target) => {
        if (target !== null) renderer.setGaze(target);
      });
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

startPointerGaze(canvas, (target) => {
  if (target !== null) renderer.setGaze(target);
});
renderer.start();
void socket.start();


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
    socket.send(message);
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
