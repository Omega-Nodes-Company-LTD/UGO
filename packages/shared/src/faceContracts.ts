import { z } from "zod";

/** WS `/v1/face` contract (PROGETTO §5.7). Zod on both directions. */

export const FACE_STATES = [
  "sleeping",
  "idle",
  "alert",
  "listening",
  "thinking",
  "talking",
] as const;
export type FaceState = (typeof FACE_STATES)[number];

/**
 * Glyph LED patterns (§4.1). Kept as a closed set so soul and the face agree
 * on meaning; the face degrades silently when the device has no Glyph SDK.
 */
export const GLYPH_PATTERNS = ["sleep", "alert", "listening", "thinking", "talking", "rec"] as const;
export type GlyphPattern = (typeof GLYPH_PATTERNS)[number];

/** Which pattern belongs to which face state (rec is driven separately). */
export const GLYPH_FOR_STATE: Readonly<Record<FaceState, GlyphPattern | undefined>> = {
  sleeping: "sleep",
  idle: undefined,
  alert: "alert",
  listening: "listening",
  thinking: "thinking",
  talking: "talking",
};

/** face → server */
export const faceToServerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heard_text"), text: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("face_seen") }),
  z.object({ type: z.literal("light"), lux: z.number().min(0) }),
  z.object({ type: z.literal("noise"), db: z.number().min(0) }),
  z.object({ type: z.literal("tap") }),
  z.object({ type: z.literal("shake") }),
  // ADR-030: which body he is in right now. Until this existed UGO could ask
  // to go out and never find out that he had been taken.
  z.object({ type: z.literal("mode"), mode: z.enum(["home", "portable"]) }),
]);
export type FaceToServerMessage = z.infer<typeof faceToServerSchema>;

/**
 * server → face
 *
 * ADR-036: every frame carries `who`, because a socket is attached to a ROOM
 * and a room can hold more than one creature. Without it a body could not tell
 * which of the two just sighed. Optional, so a single-creature house — and any
 * face built before rooms existed — keeps working untouched.
 */
export const serverToFaceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mood"),
    label: z.string(),
    vars: z.record(z.string(), z.number()),
    who: z.string().optional(),
  }),
  z.object({ type: z.literal("speak"), text: z.string(), who: z.string().optional() }),
  z.object({ type: z.literal("state"), state: z.enum(FACE_STATES), who: z.string().optional() }),
  z.object({ type: z.literal("glyph"), pattern: z.enum(GLYPH_PATTERNS), who: z.string().optional() }),
  // ADR-027: soul decides an initiative, the body performs it. The id is a
  // gesture from the body's own catalogue; a face that does not know it
  // ignores it rather than failing — the decision must never depend on the
  // renderer that happens to be running.
  z.object({ type: z.literal("gesture"), id: z.string().min(1).max(64), who: z.string().optional() }),
  // ADR-032: which exemplar answered this socket. A device that asked for
  // "cucina" and got the default has to be able to tell.
  z.object({ type: z.literal("whoami"), name: z.string().min(1).max(40), who: z.string().optional() }),
  // ADR-036: who lives in the room this socket is attached to. The body draws
  // one creature per entry, so this arrives before anything else.
  z.object({
    type: z.literal("roster"),
    room: z.string().optional(),
    gosini: z.array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(40),
        traits: z.record(z.string(), z.number()).optional(),
      }),
    ),
  }),
]);
export type ServerToFaceMessage = z.infer<typeof serverToFaceSchema>;

/** Local-reaction thresholds shared by face (zero-token logic) and soul. */
/**
 * Kept as documentation of what "loud" means physically, but no longer a
 * decision: since ADR-029 the startle is judged by the body against the
 * room's own learned floor, because an uncalibrated phone microphone with
 * automatic gain control makes an absolute number meaningless.
 */
export const NOISE_ALERT_DB = 80;
export const DARKNESS_LUX = 10;
export const NIGHT_START_HOUR = 22;
