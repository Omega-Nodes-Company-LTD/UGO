import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./hud.css";
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
import { CHROME_STORE_KEY, mountHudChrome, type ChromeState } from "./hudChrome.js";
import { mountLogPanel } from "./logPanel.js";
import { mountMyData } from "./myData.js";
import { startObjectSpotter } from "./objectSpotter.js";
import { RainSound } from "./rainSound.js";
import { Speech } from "./speech.js";
import { EarsChoice } from "./earsChoice.js";
import { micBlocked, micFailure } from "./micReason.js";
import { worthSending } from "./heard.js";
import { UtteranceGate } from "./utteranceGate.js";
import { toPcm16Base64 } from "./voiceClip.js";
import { watchSky } from "./skyWatch.js";
import { mountVoiceInvite } from "./voiceInvite.js";
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
/** gruppo 12: la camera accesa, se c'è — per lo sguardo chiesto da soul */
let activeCamera: { video?: HTMLVideoElement } | null = null;

/**
 * Uno sguardo della stanza: JPEG, solo quando soul lo CHIEDE e solo a camera
 * già accesa. I pixel vanno al server di casa, il modello locale li racconta,
 * e nessuno li scrive da nessuna parte.
 *
 * `fine` (ADR-065): 640px per LEGGERE — l'OCR su 320px vede macchie, non
 * lettere. Il tetto del contratto (120 000 caratteri di base64) non si tocca:
 * si cala la qualità finché il frame ci sta, e se non ci sta non si manda.
 */
const GLIMPSE_MAX_B64 = 120_000;

function captureGlimpse(fine = false): string | undefined {
  const video = activeCamera?.video;
  if (video === undefined || video.videoWidth === 0) return undefined;
  const width = fine ? 640 : 320;
  const frame = document.createElement("canvas");
  frame.width = width;
  frame.height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
  const ctx = frame.getContext("2d");
  if (ctx === null) return undefined;
  ctx.drawImage(video, 0, 0, frame.width, frame.height);
  for (const quality of [0.6, 0.45, 0.3]) {
    const image = frame.toDataURL("image/jpeg", quality).split(",")[1];
    if (image !== undefined && image.length <= GLIMPSE_MAX_B64) return image;
  }
  return undefined;
}
let lastPresenceAt = 0;
/** who is in this room (ADR-036); one nameless entry until the roster lands */
let residents: { id: string; name: string }[] = [];
const nameOf = (who: string | undefined): string | undefined =>
  residents.find((r) => r.id === who)?.name;
/** each creature's mood, so the caption can name all of them (ADR-038) */
const moods = new Map<string, string>();

// gruppo 13: la voce interim — soul sintetizza col TTS emotivo (l'umore del
// momento colora il tono), e su 204 o guasto si torna alla voce di sistema
speech.useRemoteVoice(async (text, who) => {
  const mood = (who !== undefined ? moods.get(who) : undefined) ?? moods.values().next().value;
  const response = await fetch(`${soulHttp}/v1/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, ...(mood !== undefined && { mood }) }),
  });
  if (response.status !== 200) return undefined;
  return response.blob();
});

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
 * ADR-090: i due diritti, dove vive chi li ha.
 *
 * Il token del chiosco basta per **contare** — quanto tiene, non cosa — e non
 * basta per i due atti: quelli chiedono il token dell'account lì per lì, e non lo
 * tengono. Su uno schermo che vedono tutti è la differenza fra una porta e un
 * buco nel muro.
 */
mountMyData(
  {
    panel: requireElement("#mydata"),
    toggle: requireElement("#btn-mydata"),
    close: requireElement("#mydata-close"),
    lines: requireElement("#mydata-lines"),
    who: requireElement("#mydata-who") as HTMLSelectElement,
    confirmName: requireElement("#mydata-confirm") as HTMLInputElement,
    token: requireElement("#mydata-token") as HTMLInputElement,
    forget: requireElement("#mydata-forget"),
    exportAll: requireElement("#mydata-export"),
    message: requireElement("#mydata-msg"),
  },
  { soulHttp, kioskToken: params.get("token") ?? undefined },
);

// ADR-096: il chiosco nascondibile. La veste la fa il CSS su `data-chrome`;
// qui solo i due gesti e la memoria per dispositivo. Uno storage rotto (Safari
// privato, quota piena) non deve rompere il muso: si degrada a "solo per
// questa visita".
mountHudChrome({
  app,
  hide: [requireElement("#btn-hide"), requireElement("#sheet-grip")],
  expand: requireElement("#btn-expand"),
  store: {
    read: (): string | null => {
      try {
        return localStorage.getItem(CHROME_STORE_KEY);
      } catch {
        return null;
      }
    },
    write: (state: ChromeState): void => {
      try {
        localStorage.setItem(CHROME_STORE_KEY, state);
      } catch {
        // senza storage lo stato vive quanto la pagina, ed è già abbastanza
      }
    },
  },
});

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

// ADR-057, la seconda metà: quando il pannello rivendica un volto, UGO chiede
// anche la voce — e la chiede QUI, dove la persona sta davvero. Il bottone è
// temporaneo; la finestra vera la tiene soul, il TTL locale è solo cortesia.
const voiceInvite = mountVoiceInvite({
  hud: requireElement("#hud"),
  send: (message) => {
    sendToSoul(message);
  },
  trouble,
});

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
  let rooms: { room: string; gosini: { name: string }[] }[];
  try {
    const res = await fetch(`${soulHttp}/v1/rooms`);
    const payload = (await res.json()) as { rooms?: unknown };
    // Setacciato invece che creduto sulla parola. Non con Zod: portarlo nel
    // bundle del chiosco per tre campi costerebbe più di quanto valga, e la
    // batteria del corpo è già un debito aperto (STATE §7). Qui basta
    // scartare ciò che non ha la forma giusta — un proxy che risponde HTML
    // con lo stato buono faceva arrivare `undefined` fin dentro le voci del
    // selettore, che leggeva «undefined · vuota».
    rooms = (Array.isArray(payload.rooms) ? payload.rooms : [])
      .filter(
        (entry): entry is { room: string; gosini?: unknown } =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as { room?: unknown }).room === "string" &&
          (entry as { room: string }).room !== "",
      )
      .map((entry) => ({
        room: entry.room,
        gosini: (Array.isArray(entry.gosini) ? entry.gosini : [])
          .filter(
            (who): who is { name: string } =>
              typeof who === "object" &&
              who !== null &&
              typeof (who as { name?: unknown }).name === "string",
          )
          .map((who) => ({ name: who.name })),
      }));
  } catch {
    return; // no soul yet: the picker simply does not appear
  }
  // shown as soon as ONE room exists. Hiding it below two was wrong twice
  // over: a screen that shows a room must say WHICH room even when there is
  // only one, and a house that puts everybody in the same room had no way to
  // pick it at all.
  if (rooms.length === 0) return;
  const current = params.get("stanza")?.toLowerCase();

  // Costruito con le API del DOM e non con `innerHTML`: il nome di una stanza
  // e il nome di una creatura sono testo che arriva dal pannello, e finivano
  // interpolati grezzi dentro un attributo (`value="${r.room}"`). Una stanza
  // chiamata `"><img src=x onerror=…>` eseguiva script sull'origin di soul, su
  // ogni chiosco che apriva il selettore — e lì accanto, in `localStorage`,
  // c'è il token. `escapeHtml` di `logPanel.ts` non sarebbe bastato: passa da
  // `textContent`, che NON codifica le virgolette doppie, ed è corretto solo
  // in contesto testo. `new Option(...)` non ha un contesto da sbagliare.
  roomPick.replaceChildren();
  // an explicit "nobody in particular" entry, so the choice is reversible
  roomPick.append(new Option("— nessuna stanza —", "", false, current === undefined));
  for (const r of rooms) {
    // ADR-039: a room can be empty now, and "cucina · " with nothing after
    // the separator reads like a bug rather than like an empty room
    const names = r.gosini.map((g) => g.name).join(", ");
    const who = names === "" ? " · vuota" : ` · ${names}`;
    const chosen = r.room.toLowerCase() === current;
    roomPick.append(new Option(`${r.room}${who}`, r.room, false, chosen));
  }
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

/**
 * Gruppo 4 — input immagini: fagli vedere una foto. Si riduce QUI a 640px
 * JPEG (a moondream i pixel grandi non servono, e non devono viaggiare),
 * parte verso la chat di casa, e il commento torna a voce come tutto il
 * resto. I pixel non si salvano da nessuna parte: resta il commento.
 */
const photoButton = requireElement("#btn-photo");
const photoFile = requireElement("#photo-file") as HTMLInputElement;
const PHOTO_MAX_B64 = 190_000;

async function photoToJpeg(file: File): Promise<string | undefined> {
  const bitmap = await createImageBitmap(file);
  const width = Math.min(640, bitmap.width);
  const frame = document.createElement("canvas");
  frame.width = width;
  frame.height = Math.max(1, Math.round((width * bitmap.height) / bitmap.width));
  const ctx = frame.getContext("2d");
  if (ctx === null) return undefined;
  ctx.drawImage(bitmap, 0, 0, frame.width, frame.height);
  for (const quality of [0.7, 0.5, 0.35]) {
    const image = frame.toDataURL("image/jpeg", quality).split(",")[1];
    if (image !== undefined && image.length <= PHOTO_MAX_B64) return image;
  }
  return undefined;
}

photoButton.addEventListener("click", () => {
  photoFile.click();
});
photoFile.addEventListener("change", () => {
  const file = photoFile.files?.[0];
  photoFile.value = "";
  if (file === undefined) return;
  void (async () => {
    const image = await photoToJpeg(file).catch(() => undefined);
    if (image === undefined) {
      trouble("quella foto non si riesce a preparare: prova con un'altra");
      return;
    }
    remember({ who: "tu", text: "📷 (gli hai fatto vedere una foto)", at: Date.now(), mine: true });
    setLocalState("thinking");
    try {
      const response = await fetch(`${soulHttp}/v1/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: "home", text: "guarda questa foto!", imageBase64: image }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { reply?: string };
      if (typeof body.reply === "string" && body.reply !== "") {
        remember({ who: residents[0]?.name ?? "UGO", text: body.reply, at: Date.now(), mine: false });
        showSpeech(body.reply);
        speech.speak(body.reply, undefined);
      }
    } catch {
      trouble("la foto non è arrivata: soul non risponde");
    } finally {
      setLocalState("idle");
    }
  })();
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
      // gruppo 12: un `murmur` è parlare nel sonno — la nuvoletta appare e il
      // registro ricorda, ma la voce NON parte e nessuno si gira a guardare:
      // un borbottio notturno che sveglia la casa è una sveglia
      if (message.murmur === true) return;
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
    case "glimpse_ask": {
      // gruppo 12: «fammi dare un'occhiata». Solo a camera accesa — a camera
      // spenta la risposta è niente, che è la risposta giusta
      const image = captureGlimpse(message.fine ?? false);
      if (image !== undefined) socket.send({ type: "glimpse", image });
      return;
    }
    case "enroll_voice":
      // ADR-057, la seconda metà: il volto è appena stato imparato, e UGO
      // chiede anche la voce. Nel registro, così si capisce da dove è
      // spuntato il bottone.
      remember({
        who: nameOf(message.who) ?? "UGO",
        text: `vorrei sentire la voce di ${message.name} (c'è un bottone qui sotto)`,
        at: Date.now(),
        mine: false,
      });
      voiceInvite.offer(message.beingId, message.name);
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
      // 2026-08-16: la stanza dichiarata rumorosa viaggia col botto — di là
      // pesa metà (loud_noise_muffled), perché in un'officina il fracasso è
      // parte della vita e non deve tenere il cuore a mille per un quarto d'ora
      const enriched = {
        ...message,
        ...(sheltered.length > 0 && { sheltered }),
        ...(savedSensitivity() === "bassa" && { roomLoud: true }),
      };
      socket.send(enriched);
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
/**
 * Una frase sentita, da qualunque orecchio (browser o dettatura locale):
 * filtro dell'eco, stato, ritaglio della voce per l'identità, e via a soul.
 */
function handleHeardText(text: string): void {
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
}

/**
 * Gruppo 4, la metà chiosco della dettatura locale.
 *
 * Nata dietro `?stt=locale` e solo dietro; da STATE §6-terquadragies è
 * anche il ripiego AUTOMATICO del telefono su cui il riconoscitore del
 * browser non resta acceso (il microfono è del misuratore di rumore, ogni
 * `start()` è un bip di sistema). La decisione su quale orecchio usare — e
 * su cosa fare quando uno muore — sta in `EarsChoice`, che è pura e testata;
 * qui c'è solo il cablaggio.
 *
 * Il giro: la presa contigua sul microfono già aperto (`sensors.tapAudio`),
 * il cancello puro decide gli enunciati, ogni enunciato va a `/v1/stt` e il
 * testo entra dallo stesso `handleHeardText` del browser. 501 = il server
 * non ha la dettatura; tre guasti di fila = whisper muto: in entrambi i casi
 * decide `EarsChoice` se c'è un'altra strada o se le orecchie si spengono.
 * Niente esce di casa finché funziona: è tutto il punto.
 */
const ears = new EarsChoice(params.get("stt"), localStorage);
let localEarsOn = false;
let localEarsTapWired = false;

/** Le orecchie si spengono DAVVERO, e l'interfaccia lo dice. */
function earsOff(): void {
  app.dataset.ears = "off";
  setLocalState("idle");
  earsButton.textContent = "orecchie spente";
}

function startLocalEars(): void {
  localEarsOn = true;
  app.dataset.ears = "on";
  if (localEarsTapWired) return;
  localEarsTapWired = true;
  let failures = 0;
  let gateFor: { rate: number; gate: UtteranceGate } | undefined;

  const transcribe = async (audio: string): Promise<void> => {
    try {
      const response = await fetch(`${soulHttp}/v1/stt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audio }),
      });
      if (response.status === 501) {
        localeFailed("la dettatura in casa non è configurata sul server");
        return;
      }
      /**
       * Un rifiuto DI QUESTO CLIP non è un servizio giù.
       *
       * Dal campo: un «sì» detto al chiosco dura meno di 0,8 s, e percezione
       * risponde 422 «troppo corto». Qualunque codice non-ok contava fra i
       * fallimenti, quindi TRE monosillabi di fila dichiaravano whisper
       * morto e riportavano le orecchie su Google — scelta poi RICORDATA fra
       * le ricariche (`earsChoice`), quindi la strada di casa non tornava
       * più da sola. Solo il 5xx e la rete assente dicono «sono giù».
       */
      if (response.status >= 400 && response.status < 500) {
        // il clip non si trascrive: si lascia perdere questo, non la strada
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      failures = 0;
      const body = (await response.json()) as { text?: string };
      if (typeof body.text === "string" && body.text.trim() !== "") {
        handleHeardText(body.text.trim());
      }
    } catch {
      failures += 1;
      if (failures >= 3) localeFailed("whisper non risponde");
    }
  };

  const localeFailed = (why: string): void => {
    if (!localEarsOn) return;
    localEarsOn = false;
    // niente ping-pong: se il browser si è già arreso (o è rotto per memoria)
    // le orecchie si spengono e lo dicono, invece di rimbalzare fra due morti
    if (ears.localeFailed() === "browser") {
      trouble(why + ": torno al riconoscitore del browser");
      startBrowserListening();
    } else {
      trouble(why + ": orecchie spente (un tocco riprova)");
      earsOff();
    }
  };

  sensors.tapAudio((samples, rate) => {
    if (!localEarsOn) return;
    // la bocca è occupata: le orecchie non devono sentire l'altoparlante
    if (speech.isSpeaking()) return;
    if (gateFor?.rate !== rate) {
      gateFor = { rate, gate: new UtteranceGate(rate, () => { sensors.heardAVoice(); }) };
    }
    const utterance = gateFor.gate.feed(samples, performance.now());
    if (utterance !== undefined) void transcribe(toPcm16Base64(utterance, rate));
  });
}

/**
 * Il microfono si apre, e se non si apre lo DICE (`micReason.ts`).
 *
 * Prima era `.catch(() => { trouble("microfono non disponibile"); })`, che
 * sono tre parole per cinque guasti diversi — e nel caso piu' frequente sul
 * telefono (pagina in chiaro, quindi contesto non sicuro) erano anche tre
 * parole sbagliate: non e' il microfono a non essere disponibile, e' il
 * browser che non lo concede a un indirizzo `http://`. L'unico sintomo che
 * arrivava in fondo era il riconoscitore che si spegneva e riaccendeva, cioe'
 * il secondo effetto raccontato al posto della causa.
 */
async function openMicrophone(): Promise<boolean> {
  if (sensors.micIsOn()) return true;
  const blocked = micBlocked(globalThis);
  if (blocked !== undefined) {
    trouble(blocked);
    return false;
  }
  try {
    await sensors.startMicrophone();
    return true;
  } catch (error) {
    trouble(micFailure(error));
    return false;
  }
}

async function startListening(): Promise<void> {
  // Riaccendere le orecchie riapre il microfono, che ora `stopListening()`
  // spegne davvero. Il click sul bottone è il gesto dell'utente che
  // `getUserMedia` richiede, quindi il permesso non viene richiesto due volte:
  // il browser lo ricorda per l'origin.
  //
  // E si ASPETTA che sia aperto prima di scegliere le orecchie: `EarsChoice`
  // decide anche in base al fatto che ci sia un nastro da ascoltare
  // (`browserGaveUp(micIsOn)`), e interrogarlo mentre `getUserMedia` e' ancora
  // per strada gli faceva dire «niente microfono» di un microfono che stava
  // per aprirsi. Senza microfono non c'e' nessuna delle due strade: le
  // orecchie si spengono subito, col motivo vero, invece di spendere un
  // minuto di bip per arrivare alla stessa conclusione.
  if (!(await openMicrophone())) {
    earsOff();
    return;
  }
  if (ears.first() === "locale") {
    startLocalEars();
    return;
  }
  startBrowserListening();
}

/**
 * Il riconoscitore del browser non e' una strada su questo dispositivo.
 *
 * Due modi di scoprirlo, stessa decisione: la resa del freno (`onGaveUp`) e
 * l'assenza pura e semplice dell'API — Firefox su Android non ha nessuno
 * `SpeechRecognition`, e li' `startBrowserListening` usciva in silenzio: le
 * orecchie non partivano, il bottone diceva «ti ascolto» e non ascoltava
 * niente, per sempre. Una strada che non c'e' e' una strada morta come le
 * altre, e `EarsChoice` sa gia' cosa farne.
 */
function browserIsNotARoad(why: string): void {
  if (ears.browserGaveUp(sensors.micIsOn()) === "locale") {
    trouble(why + ": passo alla dettatura in casa");
    startLocalEars();
  } else {
    trouble(why + ": orecchie spente (un tocco riprova)");
    earsOff();
  }
}

function startBrowserListening(): void {
  if (!speech.sttAvailable()) {
    browserIsNotARoad("questo browser non ha il riconoscitore vocale");
    return;
  }
  const started = speech.listen(
    (text) => {
      handleHeardText(text);
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
    // la frase completa la compone `speech.ts`, che sa distinguere un
    // contrattempo da un verdetto: qui si riferisce e basta
    (what) => {
      trouble(what);
    },
    // Il freno ha mollato (speech.ts): su questo dispositivo le sessioni
    // muoiono appena nate — tipicamente un Android in cui il misuratore di
    // rumore tiene il microfono — e insistere era il bip di sistema a ciclo
    // continuo piu' una coda di richieste che bloccava il prompt della
    // webcam. La resa non e' piu' la fine: se la dettatura in casa e'
    // percorribile si passa a lei — ascolta il microfono GIA' aperto, quindi
    // zero bip — e il dispositivo se lo ricorda per il prossimo avvio.
    // Altrimenti le orecchie si spengono DAVVERO e il bottone lo mostra: i
    // sensi restano accesi (rumore, luce, camera), manca solo la dettatura,
    // e un altro tocco sul bottone riprova.
    (why) => {
      browserIsNotARoad(why);
    },
  );
  if (started) app.dataset.ears = "on";
}

function stopListening(): void {
  // ADR-045: le orecchie spente devono anche dimenticare, o "spento" vorrebbe
  // dire solo "non manda".
  //
  // E devono spegnere il microfono, non solo svuotare la finestra:
  // `forgetVoice()` da solo buttava l'anello che il misuratore riempiva di
  // nuovo un fotogramma dopo, con le tracce ancora `live` e il pallino rosso
  // del browser acceso. Spento vuol dire spento.
  localEarsOn = false;
  speech.stopListening();
  sensors.stopMicrophone();
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
    // il microfono PRIMA della camera, come sempre: e' l'ordine in cui il
    // gesto dell'utente vale ancora, ed e' l'unico senso che le orecchie
    // usano davvero. L'esito si tiene: se non si e' aperto, il motivo l'ha
    // gia' detto `openMicrophone`, e chiederglielo di nuovo da
    // `startListening` sarebbe la stessa riga due volte
    const earsPossible = await openMicrophone();
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
      activeCamera = camera;
      // gruppo 12: gli occhi per le cose, sulla STESSA camera — un giro ogni
      // tre secondi, on-device, e il video non esce mai. La reazione è del
      // corpo (zero token); a soul va solo la categoria, per il registro
      if (camera.video !== undefined) {
        void startObjectSpotter(camera.video, (spotted) => {
          showSpeech(
            spotted.kind === "apple" ? "Grunf! Una mela!? Per me?" : `Oh, ${spotted.label}!`,
          );
          renderer.reflex(spotted.kind === "apple" ? "wiggle" : "perkUp");
          sendToSoul({ type: "seen_object", kind: spotted.kind });
        });
      }
    }
    if (earsPossible) {
      void startListening();
    } else {
      earsOff();
    }
    // il bottone compare comunque: concedere il permesso e ritoccare e' la
    // strada per cui la riga nel registro e' stata scritta
    micButton.hidden = true;
    earsButton.hidden = false;
  })();
});

earsButton.addEventListener("click", () => {
  // Si chiede al MUSO se sta ascoltando, non al riconoscitore del browser.
  // `speech.isListening()` è falso per costruzione quando le orecchie sono
  // quelle locali (`?stt=locale` non chiama mai `speech.listen()`): il
  // bottone prendeva sempre il ramo «accendi», e non c'era modo di zittire
  // il microfono dall'interfaccia. `dataset.ears` lo sanno entrambi i
  // percorsi, ed è quello che l'utente vede scritto sul bottone.
  if (app.dataset.ears === "on") {
    stopListening();
    earsButton.textContent = "orecchie spente";
  } else {
    void startListening();
    earsButton.textContent = "ti ascolto";
  }
  // la pioggia segue l'interruttore dei sensi: uno solo, quello che c'è già
  rain.update(lastSky, app.dataset.ears === "on");
});

renderer.start();
void socket.start();
// the picker asks the soul which rooms exist; it never blocks the body
void loadRooms();
// gruppo 12: il cielo del recinto segue quello vero — meteo da soul ogni
// mezz'ora, e di notte luna e pianeti calcolati qui (zero rete). Un corpo 2D
// non ha un cielo e ignora tutto, come per gli arredi. Gruppo 13: quando nel
// cielo piove, si sente — piano, mai di notte, e solo a sensi accesi
const rain = new RainSound();
let lastSky: Parameters<typeof rain.update>[0];
watchSky(soulHttp, (state) => {
  renderer.setSky?.(state);
  lastSky = state;
  rain.update(state, app.dataset.ears === "on");
});


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
