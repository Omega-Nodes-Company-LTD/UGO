import { type Channel, type Impulse, type Posture, clamp } from "./channels.js";

/**
 * The gesture catalogue — events, not states.
 *
 * A continuous pose says how UGO *is*; it cannot say that he just sneezed.
 * Sneezing has a beginning and an end, so it lives here.
 *
 * Every gesture is DATA, not code: a duration plus a handful of channel tracks.
 * That is the whole point — fifty hand-written animation functions would be
 * fifty things to debug, while fifty rows of three fields are readable in one
 * screenful and cost nothing to add to.
 */

/** The curve shapes a track can take. */
/**
 * Every shape must start AND end at zero. A gesture is additive on top of the
 * continuous pose, so one that ends anywhere else pops back to the pose in a
 * single frame when its clock runs out. `pose.test.ts` asserts this on the
 * whole catalogue, which is how the first draft's "doze" was caught: it faded
 * the eyes shut with a ramp and then snapped them open again.
 */
export type Shape =
  | "bell" // 0 → 1 → 0, the default arc
  | "hold" // 0 → 1 → hold → 0, for things that last
  | "snap" // slow load, fast release (a sneeze, a head-snap)
  | "wobble" // oscillation inside an envelope
  | "twoBeat" // two arcs: a nod, a double grunt
  | "flick"; // all of it in the first third, then nothing

export interface Track {
  ch: Channel;
  shape: Shape;
  /** peak amplitude, signed */
  amp: number;
  /** oscillations over the gesture, only meaningful for `wobble` */
  freq?: number;
}

/** What a gesture is *about*, so autonomy can pick one that fits the mood. */
export type Tag =
  | "calm"
  | "sleepy"
  | "bored"
  | "happy"
  | "affection"
  | "alert"
  | "curious"
  | "stress"
  | "nose"
  | "speech"
  | "wake";

export interface GestureSpec {
  /** English id — the key everything else refers to */
  id: string;
  /** Italian label, for the panel and the bench */
  it: string;
  ms: number;
  tracks: Track[];
  tags: Tag[];
  /** postures this gesture makes sense in; omitted = any */
  needs?: Posture[];
}

const bell = (u: number): number => Math.sin(Math.PI * clamp(u, 0, 1));

function shapeValue(shape: Shape, u: number, freq: number): number {
  switch (shape) {
    case "bell":
      return bell(u);
    case "hold":
      // rises fast, stays, leaves fast: for things that last a while
      return clamp(Math.min(u / 0.18, (1 - u) / 0.18), 0, 1);
    case "snap":
      // loads slowly, then releases past zero — the shape of a sneeze
      return u < 0.68 ? (u / 0.68) ** 2 : -1.25 * bell((u - 0.68) / 0.32);
    case "wobble":
      return Math.sin(2 * Math.PI * freq * u) * bell(u);
    case "twoBeat":
      return bell((u * 2) % 1) * (u < 0.5 ? 1 : 0.72);
    case "flick":
      return u < 0.28 ? Math.sin((Math.PI * u) / 0.28) : 0;
  }
}

/** Sample one gesture at progress `u` ∈ [0,1]. Pure. */
export function sampleGesture(spec: GestureSpec, u: number): Impulse {
  const out: Impulse = {};
  for (const track of spec.tracks) {
    const value = shapeValue(track.shape, u, track.freq ?? 1) * track.amp;
    out[track.ch] = (out[track.ch] ?? 0) + value;
  }
  return out;
}

const t = (ch: Channel, shape: Shape, amp: number, freq?: number): Track =>
  freq === undefined ? { ch, shape, amp } : { ch, shape, amp, freq };

/**
 * Fifty-six gestures. Grouped by what they are about, because that is also how
 * autonomy picks them.
 */
export const GESTURES: readonly GestureSpec[] = [
  // ── quiet, the ones that just keep him alive on screen ────────────────
  { id: "blinkSlow", it: "battito lento", ms: 900, tags: ["calm"], tracks: [t("eyeOpen", "bell", -0.9)] },
  { id: "lookAround", it: "si guarda attorno", ms: 2600, tags: ["calm", "curious"], tracks: [t("headYaw", "wobble", 0.28, 1.5), t("pupilX", "wobble", 0.6, 1.5), t("earTwitch", "flick", 0.2)] },
  { id: "settle", it: "si assesta", ms: 1200, tags: ["calm"], tracks: [t("sink", "bell", 0.12), t("shake", "wobble", 0.15, 3), t("lean", "bell", 0.05)] },
  { id: "weightShift", it: "sposta il peso", ms: 1500, tags: ["calm", "bored"], tracks: [t("headRoll", "wobble", 0.07, 1), t("lean", "wobble", 0.05, 1)] },
  { id: "deepBreath", it: "respiro profondo", ms: 2400, tags: ["calm"], tracks: [t("sink", "bell", -0.06), t("snout", "bell", 0.3)] },
  { id: "earFlick", it: "orecchio che scatta", ms: 450, tags: ["calm"], tracks: [t("earTwitch", "flick", 0.6)] },
  { id: "tailIdle", it: "coda pigra", ms: 1800, tags: ["calm"], tracks: [t("tailWag", "wobble", 0.3, 2)] },
  { id: "slowScan", it: "sguardo lento", ms: 3000, tags: ["calm", "bored"], tracks: [t("pupilX", "wobble", 0.8, 0.8), t("headYaw", "wobble", 0.12, 0.8)] },
  { id: "sniffShort", it: "annusata breve", ms: 700, tags: ["nose", "calm"], tracks: [t("snout", "wobble", 0.8, 6), t("headPitch", "bell", 0.06)] },
  { id: "grunt", it: "grugnito", ms: 600, tags: ["calm", "speech"], tracks: [t("mouthOpen", "bell", 0.45), t("shake", "bell", 0.2), t("earTwitch", "bell", 0.2)] },

  // ── stanco e assonnato ────────────────────────────────────────────────
  { id: "yawn", it: "sbadiglio", ms: 1900, tags: ["sleepy"], tracks: [t("mouthOpen", "bell", 1), t("eyeOpen", "bell", -0.8), t("headPitch", "bell", 0.3), t("earLift", "bell", -0.4)] },
  { id: "stretch", it: "stiracchiata", ms: 2200, tags: ["sleepy", "wake"], tracks: [t("lean", "bell", -0.2), t("sink", "bell", -0.12), t("headPitch", "bell", 0.22), t("tailCurl", "bell", 0.3)] },
  { id: "headNod", it: "testa che ciondola", ms: 2600, tags: ["sleepy"], tracks: [t("headPitch", "wobble", 0.18, 1.2), t("eyeOpen", "wobble", -0.35, 1.2)] },
  { id: "heavyLids", it: "occhi pesanti", ms: 1800, tags: ["sleepy"], tracks: [t("eyeOpen", "hold", -0.5)] },
  { id: "doze", it: "si appisola", ms: 3000, tags: ["sleepy"], tracks: [t("eyeOpen", "hold", -0.85), t("headPitch", "hold", -0.25), t("sink", "hold", 0.1)] },
  { id: "snore", it: "russa", ms: 2400, tags: ["sleepy"], needs: ["lying", "crouching"], tracks: [t("snout", "wobble", 0.6, 1.2), t("sink", "wobble", 0.05, 1.2), t("mouthOpen", "wobble", 0.18, 1.2)] },
  { id: "dreamTwitch", it: "sussulto nel sonno", ms: 500, tags: ["sleepy"], needs: ["lying", "crouching"], tracks: [t("shake", "flick", 0.5), t("earTwitch", "flick", 0.5), t("bounce", "flick", 0.1)] },
  { id: "wakeStart", it: "risveglio di soprassalto", ms: 900, tags: ["wake"], tracks: [t("eyeOpen", "snap", 1), t("earLift", "snap", 0.8), t("headPitch", "flick", 0.2), t("bounce", "flick", 0.25)] },
  { id: "sighTired", it: "sospiro stanco", ms: 1600, tags: ["sleepy", "bored"], tracks: [t("sink", "bell", 0.08), t("earLift", "bell", -0.35), t("mouthOpen", "bell", 0.25), t("headPitch", "bell", -0.1)] },

  // ── annoiato: la noia deve VEDERSI, non solo spegnere le altre cose ────
  { id: "sighBored", it: "sbuffo annoiato", ms: 1400, tags: ["bored"], tracks: [t("mouthOpen", "bell", 0.4), t("snout", "bell", 0.5), t("earLift", "bell", -0.3), t("headPitch", "bell", -0.08)] },
  { id: "stareBlank", it: "guarda il vuoto", ms: 3200, tags: ["bored"], tracks: [t("eyeOpen", "hold", -0.18), t("pupilY", "hold", -0.2)] },
  { id: "countBeams", it: "conta le travi", ms: 3000, tags: ["bored"], tracks: [t("headPitch", "bell", 0.3), t("pupilY", "bell", 0.8)] },
  { id: "flopEars", it: "orecchie a terra", ms: 1600, tags: ["bored"], tracks: [t("earLift", "hold", -0.6)] },
  { id: "shuffle", it: "zampetta sul posto", ms: 1400, tags: ["bored"], needs: ["standing"], tracks: [t("bounce", "wobble", 0.08, 4), t("headRoll", "wobble", 0.04, 4)] },
  { id: "dawdle", it: "ciondola", ms: 2800, tags: ["bored"], tracks: [t("headRoll", "wobble", 0.12, 0.9), t("lean", "wobble", 0.06, 0.9)] },

  // ── contento e affettuoso ─────────────────────────────────────────────
  { id: "wiggle", it: "si dimena", ms: 1100, tags: ["happy"], tracks: [t("shake", "wobble", 0.5, 4), t("tailWag", "wobble", 0.7, 5)] },
  { id: "hop", it: "saltello", ms: 700, tags: ["happy"], needs: ["standing"], tracks: [t("bounce", "bell", 0.5), t("earLift", "bell", 0.5)] },
  { id: "spin", it: "giravolta", ms: 1400, tags: ["happy"], needs: ["standing"], tracks: [t("headYaw", "wobble", 0.7, 1), t("tailWag", "wobble", 0.8, 3), t("bounce", "twoBeat", 0.2)] },
  { id: "nod", it: "annuisce", ms: 1000, tags: ["happy", "speech"], tracks: [t("headPitch", "twoBeat", -0.2)] },
  { id: "earFan", it: "orecchie a ventaglio", ms: 900, tags: ["happy"], tracks: [t("earLift", "bell", 0.9), t("earTwitch", "bell", 0.3)] },
  { id: "tailFast", it: "coda a mille", ms: 1600, tags: ["affection"], tracks: [t("tailWag", "wobble", 0.9, 7), t("tailCurl", "bell", 0.25)] },
  { id: "nuzzle", it: "si strofina", ms: 1500, tags: ["affection"], tracks: [t("headYaw", "wobble", 0.3, 2), t("headRoll", "wobble", 0.2, 2), t("lean", "bell", 0.12)] },
  { id: "happyGrunt", it: "grugnito felice", ms: 800, tags: ["happy", "speech"], tracks: [t("mouthOpen", "twoBeat", 0.5), t("bounce", "twoBeat", 0.15), t("earLift", "bell", 0.4)] },
  { id: "leanIn", it: "si sporge", ms: 1300, tags: ["affection", "curious"], tracks: [t("lean", "bell", 0.22), t("earLift", "bell", 0.5), t("eyeOpen", "bell", 0.2)] },
  { id: "squint", it: "strizza gli occhi", ms: 700, tags: ["happy"], tracks: [t("eyeOpen", "bell", -0.5), t("headRoll", "bell", 0.1)] },

  // ── attento e incuriosito ─────────────────────────────────────────────
  { id: "perkUp", it: "drizza le orecchie", ms: 800, tags: ["alert"], tracks: [t("earLift", "snap", 1), t("eyeOpen", "bell", 0.25)] },
  { id: "headSnap", it: "scatto di testa", ms: 600, tags: ["alert"], tracks: [t("headYaw", "snap", 0.5), t("earLift", "flick", 0.7), t("eyeOpen", "flick", 0.3)] },
  { id: "tilt", it: "inclina la testa", ms: 1600, tags: ["curious"], tracks: [t("headRoll", "bell", 0.35), t("earLift", "bell", 0.3)] },
  { id: "sniffAir", it: "annusa l'aria", ms: 1400, tags: ["curious", "nose"], tracks: [t("headPitch", "bell", 0.25), t("snout", "wobble", 0.9, 8), t("earLift", "bell", 0.4)] },
  { id: "focus", it: "mette a fuoco", ms: 1200, tags: ["curious"], tracks: [t("eyeOpen", "bell", 0.3), t("pupilX", "bell", -0.15), t("headPitch", "bell", 0.05)] },
  { id: "freeze", it: "si irrigidisce", ms: 1500, tags: ["alert"], tracks: [t("eyeOpen", "hold", 0.35), t("earLift", "hold", 0.9), t("sink", "hold", 0.04)] },
  { id: "trackSound", it: "segue un rumore", ms: 1800, tags: ["alert"], tracks: [t("headYaw", "wobble", 0.45, 1), t("earTwitch", "wobble", 0.35, 2)] },
  { id: "peer", it: "sbircia", ms: 1400, tags: ["curious"], tracks: [t("lean", "bell", 0.15), t("headPitch", "bell", -0.08), t("eyeOpen", "bell", 0.25)] },

  // ── sotto stress ──────────────────────────────────────────────────────
  { id: "startle", it: "sussulto", ms: 550, tags: ["stress", "alert"], tracks: [t("bounce", "flick", 0.4), t("eyeOpen", "flick", 0.55), t("earLift", "flick", 1), t("shake", "flick", 0.6)] },
  { id: "shakeOff", it: "scrollata", ms: 900, tags: ["stress"], tracks: [t("shake", "wobble", 1, 13), t("headRoll", "wobble", 0.3, 13), t("earTwitch", "bell", 0.5)] },
  { id: "shiver", it: "tremito", ms: 1600, tags: ["stress"], tracks: [t("shake", "wobble", 0.35, 16), t("sink", "bell", 0.05), t("earLift", "hold", -0.3)] },
  { id: "backOff", it: "indietreggia", ms: 1200, tags: ["stress"], tracks: [t("lean", "bell", -0.2), t("earLift", "bell", -0.7), t("eyeOpen", "bell", 0.3)] },
  { id: "pant", it: "ansima", ms: 2000, tags: ["stress"], tracks: [t("mouthOpen", "wobble", 0.45, 4), t("sink", "wobble", 0.03, 4)] },
  { id: "cower", it: "si rannicchia", ms: 1800, tags: ["stress"], tracks: [t("sink", "hold", 0.16), t("earLift", "hold", -0.9), t("headPitch", "hold", -0.2), t("eyeOpen", "hold", -0.25)] },
  { id: "headShakeNo", it: "scuote la testa", ms: 900, tags: ["stress", "speech"], tracks: [t("headYaw", "wobble", 0.35, 3), t("earTwitch", "wobble", 0.4, 3)] },

  // ── il naso, che in un maiale è metà del carattere ────────────────────
  { id: "rootDig", it: "grufolata", ms: 2200, tags: ["nose"], needs: ["standing", "crouching"], tracks: [t("headPitch", "hold", -0.5), t("snout", "wobble", 1, 9), t("headYaw", "wobble", 0.18, 4)] },
  { id: "sneeze", it: "starnuto", ms: 850, tags: ["nose"], tracks: [t("headPitch", "snap", 0.4), t("mouthOpen", "flick", 0.8), t("bounce", "flick", 0.35), t("shake", "wobble", 0.4, 9), t("eyeOpen", "flick", -0.9)] },
  { id: "chew", it: "mastica", ms: 1400, tags: ["nose"], tracks: [t("mouthOpen", "wobble", 0.3, 6), t("snout", "wobble", 0.3, 6)] },
  { id: "noseBlow", it: "soffia dal naso", ms: 700, tags: ["nose"], tracks: [t("snout", "bell", 1), t("mouthOpen", "bell", 0.2), t("headPitch", "bell", -0.06)] },

  // ── attorno al parlare ────────────────────────────────────────────────
  { id: "clearThroat", it: "si schiarisce la gola", ms: 800, tags: ["speech"], tracks: [t("mouthOpen", "bell", 0.35), t("headPitch", "bell", -0.1), t("shake", "bell", 0.15)] },
  { id: "questioning", it: "verso interrogativo", ms: 1200, tags: ["speech", "curious"], tracks: [t("headRoll", "bell", 0.3), t("earLift", "bell", 0.5), t("headPitch", "bell", 0.1)] },
  { id: "skeptic", it: "sbuffo scettico", ms: 1100, tags: ["speech"], tracks: [t("earLift", "bell", -0.2), t("headRoll", "bell", -0.18), t("mouthOpen", "bell", 0.3), t("eyeOpen", "bell", -0.2)] },
  { id: "resigned", it: "sospiro rassegnato", ms: 1700, tags: ["speech", "bored"], tracks: [t("sink", "bell", 0.1), t("earLift", "bell", -0.5), t("mouthOpen", "bell", 0.3), t("headPitch", "bell", -0.12)] },
];

export const GESTURE_BY_ID: ReadonlyMap<string, GestureSpec> = new Map(
  GESTURES.map((spec) => [spec.id, spec]),
);

/** Gestures carrying a given tag and allowed in a given posture. */
export function gesturesFor(tag: Tag, posture: Posture): GestureSpec[] {
  return GESTURES.filter(
    (spec) => spec.tags.includes(tag) && (spec.needs === undefined || spec.needs.includes(posture)),
  );
}

/** The driver: holds which gesture is running and its clock. Not pure. */
export class GesturePlayer {
  private spec: GestureSpec | undefined;
  private startedAt = 0;
  private lastId: string | undefined;

  public play(id: string, now: number): boolean {
    const spec = GESTURE_BY_ID.get(id);
    if (spec === undefined) return false;
    this.spec = spec;
    this.startedAt = now;
    this.lastId = id;
    return true;
  }

  public get busy(): boolean {
    return this.spec !== undefined;
  }

  public get currentId(): string | undefined {
    return this.spec?.id;
  }

  public get lastPlayed(): string | undefined {
    return this.lastId;
  }

  public sample(now: number): Impulse {
    const spec = this.spec;
    if (spec === undefined) return {};
    const u = (now - this.startedAt) / spec.ms;
    if (u >= 1) {
      this.spec = undefined;
      return {};
    }
    return sampleGesture(spec, u);
  }
}
