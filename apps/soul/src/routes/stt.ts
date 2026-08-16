import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveHousehold } from "./scope.js";

/**
 * La dettatura locale (gruppo 13): il ponte fra il chiosco e whisper.
 *
 * Il chiosco manda l'enunciato (PCM int16 a 16 kHz in base64, lo stesso
 * formato di `heard_text`), soul lo gira al servizio di percezione, e il
 * testo torna indietro: NIENTE esce di casa. 501 quando la dettatura non è
 * configurata — è il segnale con cui il muso capisce che deve restare sul
 * riconoscitore del browser, e la risposta onesta di un'installazione che
 * non l'ha accesa.
 *
 * Il tetto sull'audio è aritmetica: 12 secondi di int16 a 16 kHz sono
 * 384 000 byte, cioè 512 000 caratteri di base64 — un enunciato, non un
 * nastro. Aperta come `/v1/chat` (ADR-007: mono-utente, mai pubblico).
 */

const MAX_STT_B64_CHARS = 520_000;

const sttBodySchema = z.object({ audio: z.string().min(1).max(MAX_STT_B64_CHARS) });

export interface SttRouteDeps {
  db: DbClient;
  /** per casa, come il riconoscimento: assente = 501 */
  transcriber?: (householdId: string) => { transcribe: (audio: string) => Promise<string | undefined> };
}

export function registerSttRoute(app: FastifyInstance, deps: SttRouteDeps): void {
  app.post("/v1/stt", async (request, reply) => {
    const parsed = sttBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Invalid stt request", status: 400 });
    }
    if (deps.transcriber === undefined) return reply.code(501).send();
    const scope = await resolveHousehold(deps.db, request);
    if (!scope.ok) return reply.code(501).send();
    const text = await deps.transcriber(scope.householdId).transcribe(parsed.data.audio);
    // whisper giù o in ritardo: 503, e il muso decide lui se riprovare o
    // ripiegare — un 501 direbbe «non esiste», che sarebbe una bugia
    if (text === undefined) return reply.code(503).send();
    return reply.send({ text });
  });
}
