import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveAccount } from "./scope.js";

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

/**
 * I due «no» della dettatura, che non sono lo stesso no.
 *
 * `unusable` è questo clip: troppo corto, o non trascrivibile. Percezione
 * risponde 422 a un audio sotto gli 0,8 s — cioè a un «sì» — e il chiosco
 * deve lasciar perdere IL CLIP, non la strada.
 *
 * `down` è il servizio: whisper non caricato, percezione giù, rete assente.
 * Lì cambiare strada è la cosa giusta.
 *
 * Collassarli in uno solo è costato la dettatura locale a un'installazione
 * intera: tre monosillabi di fila dichiaravano whisper morto, il muso tornava
 * al riconoscitore del browser — quindi la voce ricominciava a uscire di casa
 * — e la scelta veniva ricordata fra le ricariche.
 */
export type SttOutcome = { kind: "text"; text: string } | { kind: "unusable" } | { kind: "down" };

export interface SttRouteDeps {
  db: DbClient;
  /** per casa, come il riconoscimento: assente = 501 */
  transcriber?: (accountId: string) => { transcribe: (audio: string) => Promise<SttOutcome> };
}

export function registerSttRoute(app: FastifyInstance, deps: SttRouteDeps): void {
  app.post("/v1/stt", { bodyLimit: 1024 * 1024 }, async (request, reply) => {
    const parsed = sttBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Invalid stt request", status: 400 });
    }
    if (deps.transcriber === undefined) return reply.code(501).send();
    const scope = await resolveAccount(deps.db, request);
    if (!scope.ok) return reply.code(501).send();
    const outcome = await deps.transcriber(scope.accountId).transcribe(parsed.data.audio);
    // 422: questo clip non si trascrive. Il chiosco lo lascia perdere e resta
    // dov'è — un 503 qui gli farebbe credere che whisper sia morto
    if (outcome.kind === "unusable") return reply.code(422).send();
    // whisper giù o in ritardo: 503, e il muso decide lui se riprovare o
    // ripiegare — un 501 direbbe «non esiste», che sarebbe una bugia
    if (outcome.kind === "down") return reply.code(503).send();
    return reply.send({ text: outcome.text });
  });
}
