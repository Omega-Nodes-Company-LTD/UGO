import { randomBytes } from "node:crypto";
import { beings, desires, perceptionEvents, recognitionProfiles, type DbClient } from "@ugo/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { putAudioObject, type AudioStorageConfig } from "../routes/audio.js";
import { eldestExemplarOf } from "../routes/scope.js";

/**
 * Il deposito di un campione di voce per l'arruolamento (ADR-016/057).
 *
 * Estratto dalla rotta del pannello perché adesso i chiamanti sono DUE — il
 * pannello e il chiosco — e i controlli a monte (regola 9) devono essere gli
 * stessi byte per entrambi: un minore o un opt-out audio si rifiutano PRIMA
 * di scrivere nel bucket, perché l'audio di chi abbiamo promesso di non
 * modellare non deve stare da nessuna parte nemmeno per una notte.
 *
 * Il campione finisce in `inbox/` e diventa un centroide stanotte, nel passo
 * `enroll` del sogno — che poi cancella il clip: l'audio di un arruolamento
 * non si conserva mai.
 */

export type VoiceSampleResult =
  | { outcome: "queued"; objectKey: string }
  | { outcome: "refused"; reason: "minor_biometrics_forbidden" | "opted_out_of_audio" }
  | { outcome: "not_found" };

/**
 * Quanto vive la richiesta «fammi sentire la tua voce» (ADR-057).
 *
 * Il chiosco può spedire un campione SOLO dentro questa finestra dopo che il
 * volto è stato rivendicato: senza, qualunque corpo connesso potrebbe
 * arruolare voci a piacere — e un microfono che può scrivere biometria
 * quando vuole non è un corpo, è un registratore abusivo.
 */
export const VOICE_ASK_WINDOW_MIN = 30;

export const VOICE_WANTED_KIND = "voice_wanted";

export async function storeVoiceSample(
  deps: { db: DbClient; storage: AudioStorageConfig },
  input: { householdId: string; beingId: string; audio: Buffer },
): Promise<VoiceSampleResult> {
  const [being] = await deps.db
    .select({ isMinor: beings.isMinor, noAudio: beings.noAudio })
    .from(beings)
    .where(and(eq(beings.id, input.beingId), eq(beings.householdId, input.householdId)));
  if (being === undefined) return { outcome: "not_found" };
  // refuse BEFORE storing (ADR-016): gli interruttori si applicano a monte
  if (being.isMinor || being.noAudio) {
    return {
      outcome: "refused",
      reason: being.isMinor ? "minor_biometrics_forbidden" : "opted_out_of_audio",
    };
  }

  // Il timbro arrivava al MINUTO, e due depositi nello stesso minuto per lo
  // stesso essere producevano la stessa chiave: il secondo sovrascriveva il
  // primo nel bucket, silenziosamente, lasciando due righe
  // `enrollment_requested` che puntavano a un solo oggetto. I secondi non
  // bastano (il chiosco può mandare due frame ravvicinati): serve qualcosa che
  // non collida mai, ed è per questo che c'è il suffisso casuale.
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const nonce = randomBytes(4).toString("hex");
  const objectKey = `inbox/enroll_${input.beingId.slice(0, 8)}_${stamp}_${nonce}.webm`;
  await putAudioObject(deps.storage, objectKey, input.audio, "audio/webm");
  await deps.db.insert(perceptionEvents).values({
    gosinoId: await eldestExemplarOf(deps.db, input.householdId),
    modality: "audio_speech",
    beingId: input.beingId,
    observed: { kind: "enrollment_requested", object_key: objectKey, channel: "home" },
  });
  return { outcome: "queued", objectKey };
}

/**
 * Il claim del volto apre la richiesta della voce (ADR-057, la seconda metà).
 *
 * «Quello è Marco» → UGO ha imparato la faccia, e nell'occasione chiede anche
 * di parlargli, così dopo lo riconosce pure senza vederlo. Qui si scrive tutto
 * ciò che la richiesta è: il desiderio che l'iniziativa dirà a voce quando è
 * il momento, e la riga `voice_wanted` che apre la finestra del chiosco.
 *
 * Tre casi in cui NON si apre, e sono il punto: minore o opt-out audio
 * (regola 9 — chiedere la voce a chi abbiamo promesso di non modellare
 * sarebbe raccogliere un consenso che non possiamo onorare), e chi un profilo
 * vocale ce l'ha già — richiedere la voce a chi già riconosciamo è rumore.
 */
export async function openVoiceAsk(
  db: DbClient,
  input: { householdId: string; beingId: string },
): Promise<{ name: string } | undefined> {
  const [being] = await db
    .select({ name: beings.displayName, isMinor: beings.isMinor, noAudio: beings.noAudio })
    .from(beings)
    .where(and(eq(beings.id, input.beingId), eq(beings.householdId, input.householdId)));
  if (being === undefined || being.isMinor || being.noAudio) return undefined;
  const [profiled] = await db
    .select({ beingId: recognitionProfiles.beingId })
    .from(recognitionProfiles)
    .where(
      and(
        eq(recognitionProfiles.beingId, input.beingId),
        eq(recognitionProfiles.modality, "voice"),
      ),
    )
    .limit(1);
  if (profiled !== undefined) return undefined;

  const gosinoId = await eldestExemplarOf(db, input.householdId);
  // le sue parole, non quelle del modello: la domanda costa zero token, e
  // passa da `desires` perché l'iniziativa sa già QUANDO è il momento di dirla
  await db.insert(desires).values({
    gosinoId,
    text: `Chiedi a ${being.name} di farti sentire la voce: c'è un invito sullo schermo.`,
    dueHint: "quando c'è qualcuno",
  });
  await db.insert(perceptionEvents).values({
    gosinoId,
    modality: "audio_speech",
    beingId: input.beingId,
    observed: { kind: VOICE_WANTED_KIND, channel: "home" },
  });
  return { name: being.name };
}

/**
 * La richiesta è aperta? Il chiosco la consuma, non la crea: la crea il
 * claim del volto, e la finestra è ciò che distingue «UGO te l'ha appena
 * chiesto» da «un corpo si è messo a raccogliere voci».
 */
export async function voiceAskOpen(
  db: DbClient,
  beingId: string,
  at: Date = new Date(),
): Promise<boolean> {
  const since = new Date(at.getTime() - VOICE_ASK_WINDOW_MIN * 60_000);
  const [asked] = await db
    .select({ id: perceptionEvents.id })
    .from(perceptionEvents)
    .where(
      and(
        eq(perceptionEvents.beingId, beingId),
        sql`${perceptionEvents.observed}->>'kind' = ${VOICE_WANTED_KIND}`,
        gte(perceptionEvents.occurredAt, since),
      ),
    )
    .limit(1);
  if (asked === undefined) return false;
  // già consegnato? un campione basta: la finestra non è un raccoglitore
  const [already] = await db
    .select({ id: perceptionEvents.id })
    .from(perceptionEvents)
    .where(
      and(
        eq(perceptionEvents.beingId, beingId),
        sql`${perceptionEvents.observed}->>'kind' = 'enrollment_requested'`,
        gte(perceptionEvents.occurredAt, since),
      ),
    )
    .limit(1);
  return already === undefined;
}
