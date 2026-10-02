import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eldestExemplarOf, resolveAccount } from "./scope.js";

/**
 * Le orecchie della casa (ADR-123): il ponte fra il chiosco e il modello di
 * trascrizione che la casa ha scelto (ruolo `stt`).
 *
 * Il chiosco manda l'enunciato (PCM int16 a 16 kHz in base64, lo stesso
 * formato di `heard_text`), soul lo incapsula in un WAV, lo passa al provider
 * dal cancello e lo dimentica: l'audio non si salva. 501 quando la casa non
 * ha scelto le orecchie — è il segnale con cui il muso capisce che deve
 * restare sul riconoscitore del browser.
 *
 * Il tetto sull'audio è aritmetica: 12 secondi di int16 a 16 kHz sono
 * 384 000 byte, cioè 512 000 caratteri di base64 — un enunciato, non un
 * nastro.
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
  /** ADR-123: le orecchie della casa. `undefined` come risposta = nessuna scelta → 501 */
  transcriber?: (
    who: { accountId: string; gosinoId: string },
    audio: string,
  ) => Promise<SttOutcome | undefined>;
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
    const outcome = await deps.transcriber(
      { accountId: scope.accountId, gosinoId: await eldestExemplarOf(deps.db, scope.accountId) },
      parsed.data.audio,
    );
    if (outcome === undefined) return reply.code(501).send();
    // 422: questo clip non si trascrive. Il chiosco lo lascia perdere e resta
    // dov'è — un 503 qui gli farebbe credere che le orecchie siano morte
    if (outcome.kind === "unusable") return reply.code(422).send();
    // provider giù, chiave rifiutata o tetto finito: 503, e il muso decide lui
    // se riprovare o ripiegare — un 501 direbbe «non esiste», che è un'altra cosa
    if (outcome.kind === "down") return reply.code(503).send();
    return reply.send({ text: outcome.text });
  });
}
