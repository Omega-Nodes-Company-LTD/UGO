import type { FaceState, FaceToServerMessage, ServerToFaceMessage } from "@ugo/shared/face";
import { startCameraGaze, startPointerGaze } from "./gaze.js";
import { PortableController } from "./portable.js";
import { FaceRenderer } from "./renderer.js";
import { Sensors } from "./sensors.js";
import { Speech } from "./speech.js";
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

const params = new URLSearchParams(location.search);
const soulUrl = params.get("soul") ?? `ws://${location.hostname}:3000/v1/face`;
// portable mode (§4.2): NFC tag in the shell sets ?mode=portable; manual fallback
const portableMode = params.get("mode") === "portable";
const soulHttpBase = soulUrl.replace(/^ws/, "http").replace(/\/v1\/face$/, "");

const renderer = new FaceRenderer(canvas);
const speech = new Speech();
let lastPresenceAt = 0;
let speakTimer: ReturnType<typeof setTimeout> | undefined;

function setLocalState(state: FaceState): void {
  app.dataset.state = state;
  renderer.setState(state);
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
      setLocalState(message.state);
      return;
    case "mood": {
      moodLabel.textContent = message.label;
      renderer.setMood({
        label: message.label,
        umore: message.vars.umore ?? 0.55,
        stress: message.vars.stress ?? 0.3,
      });
      return;
    }
    case "speak":
      showSpeech(message.text);
      speech.speak(message.text);
      return;
    case "glyph":
      return; // Glyph patterns: degrade silently off-device (§4.1)
  }
}

const socket = new FaceSocket(soulUrl, {
  onMessage: onServerMessage,
  onConnected: (connected) => {
    app.dataset.connected = String(connected);
    connStatus.textContent = connected ? "connesso" : "disconnesso";
  },
});

// local zero-token reactions: startle immediately, tell soul right after
const sensors = new Sensors(
  (message) => {
    socket.send(message);
  },
  () => {
    setLocalState("alert");
  },
);

canvas.addEventListener("pointerdown", () => {
  socket.send({ type: "tap" });
});

function startVoiceOnTap(): void {
  if (!speech.sttAvailable()) return;
  // MVP activation (§4.1): tap starts one listening session
  canvas.addEventListener("pointerdown", () => {
    void (async () => {
      setLocalState("listening");
      const text = await speech.listenOnce();
      if (text !== null && text.length > 0) {
        socket.send({ type: "heard_text", text });
      } else {
        setLocalState("idle");
      }
    })();
  });
}

micButton.addEventListener("click", () => {
  void (async () => {
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
    startVoiceOnTap();
    micButton.hidden = true;
  })();
});

startPointerGaze(canvas, (target) => {
  if (target !== null) renderer.setGaze(target);
});
renderer.start();
socket.connect();

// ---- portable mode wiring (§4.2) ------------------------------------------
const portable = new PortableController(
  soulHttpBase,
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
