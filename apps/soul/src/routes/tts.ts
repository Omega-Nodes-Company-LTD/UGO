import { traitSets, type DbClient } from "@ugo/db";
import type { LocalTtsClient } from "@ugo/memory";
import { speakingVoice } from "@ugo/psyche";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { characterFrom } from "../services/council/character.js";
import { eldestExemplarOf, resolveAccount } from "./scope.js";

/**
 * La voce (ADR-125, ADR-126): il muso chiede l'audio di una frase, soul lo
 * sintetizza con ElevenLabs via OpenRouter e lo restituisce. La voce è quella
 * del corpo di chi parla, l'umore la colora con un tag. Il client tiene il
 * salvadanaio (regola 3: ogni frase è una riga di `budget_ledger`); qui stanno
 * il memo per le frasi ricorrenti e la degradazione: 204 = «arrangiati con la
 * voce di sistema», che il muso sa già fare.
 *
 * Aperta come `/v1/chat` e `/v1/weather` (ADR-007: servizio mono-utente, mai
 * pubblico): il corpo non porta un token. Il tetto sui caratteri è il
 * paracadute contro l'abuso, insieme al budget.
 */

const MAX_TTS_CHARS = 300;
const MEMO_MAX = 50;

const ttsBodySchema = z.object({
  text: z.string().min(1).max(MAX_TTS_CHARS),
  /** l'umore della psiche, in parole: diventa il tono della voce */
  mood: z.string().max(60).optional(),
});

/**
 * La voce di QUESTO gosino: dal corpo dell'ultima versione del genoma
 * (ADR-126). Senza genoma è il corpo di un UGO qualunque, che è la verità su
 * una casa che non ha ancora un esemplare nato da una cucciolata.
 */
export async function voiceOf(db: DbClient, gosinoId: string): Promise<string> {
  const [row] = await db
    .select({ traits: traitSets.traits })
    .from(traitSets)
    .where(eq(traitSets.gosinoId, gosinoId))
    .orderBy(desc(traitSets.version))
    .limit(1);
  return speakingVoice(characterFrom(row?.traits).traits).name;
}

export interface TtsRouteDeps {
  db: DbClient;
  /** assente = si passa al gradino sotto (Piper), o al 204 */
  tts?: LocalTtsClient;
  /**
   * La voce di casa (decisione 2026-08-16): Piper sul servizio di percezione,
   * per casa come il riconoscimento. Gradino di mezzo della catena: provider →
   * Piper → 204 (voce di sistema del browser). Gratuita e senza umore — Piper
   * non sa colorare il tono, ma una voce di casa piatta batte una voce di
   * sistema piatta, e la casa non resta mai muta.
   */
  local?: (accountId: string) => { synthesize: (text: string) => Promise<Buffer | undefined> };
}

export function registerTtsRoute(app: FastifyInstance, deps: TtsRouteDeps): void {
  // il memo: i saluti e le frasi di rito tornano identici, e una frase già
  // pagata non si ripaga. LRU spannometrica: oltre il tetto si svuota — è un
  // memo, non una cache che promette. Il tipo viaggia col buffer perché i due
  // gradini parlano formati diversi (mpeg dal provider, wav da Piper)
  const memo = new Map<string, { audio: Buffer; type: string }>();

  app.post("/v1/tts", { bodyLimit: 64 * 1024 }, async (request, reply) => {
    const parsed = ttsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send({ type: "about:blank", title: "Invalid tts request", status: 400 });
    }
    if (deps.tts === undefined && deps.local === undefined) return reply.code(204).send();
    const scope = await resolveAccount(deps.db, request);
    if (!scope.ok) return reply.code(204).send();

    // La casa sta NELLA chiave. Senza, il memo era uno per processo e comune
    // a tutte le case: la casa B che chiedeva la stessa frase si sentiva
    // restituire l’audio già pagato dalla casa A — contenuto di una famiglia
    // servito a un’altra, e una spesa che il salvadanaio non vedeva passare.
    // l'esemplare sta nella chiave insieme alla casa: due gosini della stessa
    // casa non parlano con la stessa voce, e il memo non deve confonderli
    const gosinoId = await eldestExemplarOf(deps.db, scope.accountId);
    const key = `${scope.accountId}${gosinoId}${parsed.data.mood ?? ""}${parsed.data.text}`;
    const remembered = memo.get(key);
    if (remembered !== undefined) {
      return reply.type(remembered.type).send(remembered.audio);
    }

    let voice: { audio: Buffer; type: string } | undefined;
    if (deps.tts !== undefined) {
      const audio = await deps.tts.synth(
        {
          text: parsed.data.text,
          ...(parsed.data.mood !== undefined && { mood: parsed.data.mood }),
          voice: await voiceOf(deps.db, gosinoId),
        },
        { accountId: scope.accountId, gosinoId },
      );
      if (audio !== undefined) voice = { audio, type: "audio/mpeg" };
    }
    if (voice === undefined && deps.local !== undefined) {
      const audio = await deps.local(scope.accountId).synthesize(parsed.data.text);
      if (audio !== undefined) voice = { audio, type: "audio/wav" };
    }
    if (voice === undefined) return reply.code(204).send();
    if (memo.size >= MEMO_MAX) memo.clear();
    memo.set(key, voice);
    return reply.type(voice.type).send(voice.audio);
  });
}
