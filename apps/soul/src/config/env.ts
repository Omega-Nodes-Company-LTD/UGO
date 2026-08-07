import { z } from "zod";

/** Fase 0 environment contract for soul-api. Boot fails fast if unmet. */
export const soulEnvSchema = z.object({
  DATABASE_URL: z.url(),
  MQTT_URL: z.url(),
  MQTT_USER: z.string().min(1),
  MQTT_PASS: z.string().min(1),
  OLLAMA_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  TZ: z.string().min(1).default("Europe/Rome"),
});

export type SoulEnv = z.infer<typeof soulEnvSchema>;
