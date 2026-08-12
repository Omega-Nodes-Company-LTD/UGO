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
]);
export type FaceToServerMessage = z.infer<typeof faceToServerSchema>;

/** server → face */
export const serverToFaceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mood"),
    label: z.string(),
    vars: z.record(z.string(), z.number()),
  }),
  z.object({ type: z.literal("speak"), text: z.string() }),
  z.object({ type: z.literal("state"), state: z.enum(FACE_STATES) }),
  z.object({ type: z.literal("glyph"), pattern: z.enum(GLYPH_PATTERNS) }),
  // ADR-027: soul decides an initiative, the body performs it. The id is a
  // gesture from the body's own catalogue; a face that does not know it
  // ignores it rather than failing — the decision must never depend on the
  // renderer that happens to be running.
  z.object({ type: z.literal("gesture"), id: z.string().min(1).max(64) }),
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
