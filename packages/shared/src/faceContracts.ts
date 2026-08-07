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
  z.object({ type: z.literal("glyph"), pattern: z.string() }),
]);
export type ServerToFaceMessage = z.infer<typeof serverToFaceSchema>;

/** Local-reaction thresholds shared by face (zero-token logic) and soul. */
export const NOISE_ALERT_DB = 80;
export const DARKNESS_LUX = 10;
export const NIGHT_START_HOUR = 22;
