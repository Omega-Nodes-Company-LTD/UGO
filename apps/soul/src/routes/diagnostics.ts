import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PreHandler } from "./guard.js";
import { runDiagnostics } from "../services/diagnostics/diagnostics.js";
import type { DiagnosticsDeps } from "../services/diagnostics/deps.js";
import { PROBE_STATES } from "../services/diagnostics/verdict.js";

/**
 * `GET /v1/diagnostics` — com'è messa la casa, tutta, in una risposta sola.
 *
 * Guardata come `/v1/capabilities`, e per la stessa ragione: dice com'è fatta
 * l'installazione — quali container ci sono, quali arrancano, quanto ci mette
 * una risposta — e non è affare del corpo né della strada. `/health` resta
 * dov'è e com'è: quello lo interroga docker ogni dieci secondi e deve costare
 * niente; questo lo apre una persona quando qualcosa non va, e può permettersi
 * di bussare a nove porte.
 *
 * Validata anche in uscita (Zod a ogni confine) e per costruzione senza PII:
 * millisecondi, id di container e conteggi. Nessun testo di nessuna frase.
 */

const serviceSchema = z.object({
  id: z.string(),
  label: z.string(),
  container: z.string(),
  what: z.string(),
  state: z.enum(PROBE_STATES),
  weight: z.enum(["vital", "supporting", "optional"]),
  ms: z.number().int().nullable(),
  detail: z.string().optional(),
  why: z.string().optional(),
  hint: z.string().optional(),
});

const diagnosticsResponseSchema = z.object({
  at: z.string(),
  verdict: z.enum(["ok", "degraded", "unavailable"]),
  services: z.array(serviceSchema),
  soul: z.object({
    uptimeS: z.number().int().nonnegative(),
    eventLoopMs: z.number().int().nonnegative(),
    rssMb: z.number().int().nonnegative(),
    faceVersion: z.string(),
  }),
  turns: z.object({
    counters: z.object({
      heard: z.number().int().nonnegative(),
      refused: z.number().int().nonnegative(),
      answered: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    }),
    turns: z.array(
      z.object({
        at: z.string(),
        gosinoId: z.string(),
        channel: z.string(),
        totalMs: z.number().int().nonnegative(),
        stages: z.array(z.object({ name: z.string(), ms: z.number().int() })),
      }),
    ),
    medianMs: z.number().int().nullable(),
    slowestMs: z.number().int().nullable(),
  }),
});

export type DiagnosticsResponse = z.infer<typeof diagnosticsResponseSchema>;

export interface DiagnosticsRouteDeps extends DiagnosticsDeps {
  guard: PreHandler;
}

export function registerDiagnosticsRoute(app: FastifyInstance, deps: DiagnosticsRouteDeps): void {
  app.get("/v1/diagnostics", { preHandler: deps.guard }, async (_request, reply) => {
    const report = await runDiagnostics(deps);
    // 200 anche quando il verdetto è nero: questa rotta descrive un guasto, non
    // lo subisce. Rispondere 503 farebbe leggere al pannello «la diagnostica è
    // giù» proprio nel momento in cui la diagnostica è l'unica cosa che funziona.
    return reply.send(diagnosticsResponseSchema.parse(report));
  });
}
