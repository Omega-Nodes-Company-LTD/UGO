import type { DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eldestExemplarOf, resolveAccount } from "./scope.js";

/**
 * La voce (ADR-123): il muso chiede l'audio di una frase, soul lo sintetizza
 * con la voce che la casa ha scelto — OpenAI, ElevenLabs o OpenRouter, con la
 * sua chiave o con quelle UGO a consumo — e lo restituisce. Il cancello tiene
 * il salvadanaio (regola 3); qui stanno la sagoma delle istruzioni, il memo
 * per le frasi ricorrenti, e la degradazione: 204 = «arrangiati con la voce
 * del browser», che il muso sa già fare.
 *
 * Il tetto sui caratteri è il paracadute contro l'abuso, insieme al budget.
 */

const MAX_TTS_CHARS = 300;
const MEMO_MAX = 50;

const ttsBodySchema = z.object({
  text: z.string().min(1).max(MAX_TTS_CHARS),
  /** l'umore della psiche, in parole: diventa il tono della voce */
  mood: z.string().max(60).optional(),
});

/** la sagoma: il carattere è fisso, l'umore del momento lo colora */
export function instructionsFor(mood: string | undefined): string {
  return (
    "Sei la voce di un maialino domestico italiano: calda, giocosa, un po' fiera, " +
    "con frasi che finiscono spesso in un piccolo grugnito." +
    (mood === undefined || mood === "" ? "" : ` In questo momento il suo umore è: ${mood}.`)
  );
}

export interface TtsRouteDeps {
  db: DbClient;
  /**
   * ADR-123: la voce della casa. `undefined` come risposta = nessuna voce
   * scelta, budget finito o provider giù: 204, e il muso usa la sua.
   */
  voice?: (
    who: { accountId: string; gosinoId: string },
    text: string,
    instructions: string,
  ) => Promise<{ audio: Buffer; mime: string } | undefined>;
  /** ADR-125: il piano della casa ha la voce sintetica? Assente = sì */
  allows?: (accountId: string, capability: "voice") => Promise<boolean>;
}

export function registerTtsRoute(app: FastifyInstance, deps: TtsRouteDeps): void {
  // il memo: i saluti e le frasi di rito tornano identici, e una frase già
  // pagata non si ripaga. LRU spannometrica: oltre il tetto si svuota — è un
  // memo, non una cache che promette. Il tipo viaggia col buffer perché i
  // provider parlano formati diversi (mpeg da OpenAI/ElevenLabs, wav da OpenRouter)
  const memo = new Map<string, { audio: Buffer; type: string }>();

  app.post("/v1/tts", { bodyLimit: 64 * 1024 }, async (request, reply) => {
    const parsed = ttsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Invalid tts request", status: 400 });
    }
    if (deps.voice === undefined) return reply.code(204).send();
    const scope = await resolveAccount(deps.db, request);
    if (!scope.ok) return reply.code(204).send();
    // senza la voce nel piano: 204, e il muso parla con quella del browser
    if (deps.allows !== undefined && !(await deps.allows(scope.accountId, "voice"))) return reply.code(204).send();

    // La casa sta NELLA chiave. Senza, il memo era uno per processo e comune
    // a tutte le case: la casa B che chiedeva la stessa frase si sentiva
    // restituire l’audio già pagato dalla casa A — contenuto di una famiglia
    // servito a un’altra, e una spesa che il salvadanaio non vedeva passare.
    const key = `${scope.accountId}${parsed.data.mood ?? ""}${parsed.data.text}`;
    const remembered = memo.get(key);
    if (remembered !== undefined) {
      return reply.type(remembered.type).send(remembered.audio);
    }

    const spoken = await deps.voice(
      { accountId: scope.accountId, gosinoId: await eldestExemplarOf(deps.db, scope.accountId) },
      parsed.data.text,
      instructionsFor(parsed.data.mood),
    );
    if (spoken === undefined) return reply.code(204).send();
    const voice = { audio: spoken.audio, type: spoken.mime };
    if (memo.size >= MEMO_MAX) memo.clear();
    memo.set(key, voice);
    return reply.type(voice.type).send(voice.audio);
  });
}
