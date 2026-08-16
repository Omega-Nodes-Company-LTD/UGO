import { diaryEntries, events, type DbClient } from "@ugo/db";
import { and, desc, eq, gte } from "drizzle-orm";
import type { FaceGateway } from "./faceGateway.js";

/**
 * Parla nel sonno (gruppo 12): di notte, ogni tanto, un frammento del diario
 * di ieri come borbottio in nuvoletta.
 *
 * Il diario c'è già (reflect); questo è puro teatro a zero token: si pesca
 * una finestra di parole dal racconto di ieri e la si manda come `murmur` —
 * nuvoletta sì, voce NO, perché un borbottio che sveglia la casa è una
 * sveglia. Cavalca il battito delle iniziative come la ruminazione: nessun
 * ciclo nuovo, un solo posto da guardare quando ci si chiede «cosa gira».
 *
 * I paletti: solo in piena notte (quando il corpo dorme davvero), solo se un
 * corpo è connesso (borbottare a una stanza vuota è cpu sprecata), un
 * distanziatore sui borbottii riusciti, e il dado iniettabile — il caso è
 * del runtime, la provabilità è nostra.
 */

/** piena notte: dopo il sonno (22, `NIGHT_START_HOUR`) e prima del mattino */
const SLEEP_FROM_HOUR = 23;
const SLEEP_TO_HOUR = 6;

/** un borbottio ogni tanto, non un commento continuo */
const MURMUR_CHANCE = 0.15;
const MURMUR_GAP_MIN = 45;

/** quante parole si borbottano: un frammento, non una lettura */
const FRAGMENT_WORDS_MIN = 3;
const FRAGMENT_WORDS_MAX = 6;

export interface SleepTalkDeps {
  db: DbClient;
  hourOf: (at: Date) => number;
  gapMin?: number;
}

export interface SleepTalkRuntime {
  id: string;
  gateway: Pick<FaceGateway, "hasBody" | "broadcastMurmur">;
}

/** Il frammento: una finestra di parole dal racconto, coi puntini di chi dorme. */
export function fragmentOf(diary: string, roll: number): string {
  const words = diary.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return "";
  const span = Math.min(
    words.length,
    FRAGMENT_WORDS_MIN +
      Math.floor(roll * (FRAGMENT_WORDS_MAX - FRAGMENT_WORDS_MIN + 1)),
  );
  const start = Math.floor(roll * (words.length - span + 1));
  const piece = words
    .slice(start, start + span)
    .join(" ")
    .replace(/[.,;:!?]+$/, "");
  return `...grunf... ${piece.toLowerCase()}...`;
}

export class SleepTalk {
  public constructor(private readonly deps: SleepTalkDeps) {}

  public async maybe(
    runtime: SleepTalkRuntime,
    at: Date = new Date(),
    roll: number = Math.random(),
  ): Promise<"murmured" | "nothing"> {
    const hour = this.deps.hourOf(at);
    if (hour < SLEEP_FROM_HOUR && hour >= SLEEP_TO_HOUR) return "nothing";
    if (!runtime.gateway.hasBody()) return "nothing";
    if (roll >= MURMUR_CHANCE) return "nothing";

    // il distanziatore conta i borbottii riusciti: uno ogni tre quarti d'ora
    // al massimo, o il teatro diventa un ticchettio
    const since = new Date(at.getTime() - (this.deps.gapMin ?? MURMUR_GAP_MIN) * 60_000);
    const [recent] = await this.deps.db
      .select({ id: events.id })
      .from(events)
      .where(
        and(eq(events.gosinoId, runtime.id), eq(events.type, "sleep_talk"), gte(events.ts, since)),
      )
      .limit(1);
    if (recent !== undefined) return "nothing";

    const [entry] = await this.deps.db
      .select({ text: diaryEntries.text })
      .from(diaryEntries)
      .where(eq(diaryEntries.gosinoId, runtime.id))
      .orderBy(desc(diaryEntries.date))
      .limit(1);
    const fragment = entry === undefined ? "" : fragmentOf(entry.text, roll / MURMUR_CHANCE);
    if (fragment === "") return "nothing";

    runtime.gateway.broadcastMurmur(fragment);
    // id e tipo, mai il testo (regola 6): cosa ha borbottato sta nel diario.
    // `system`: non è un senso del corpo, è il teatro notturno dell'anima
    await this.deps.db.insert(events).values({
      source: "system",
      type: "sleep_talk",
      payload: {},
      gosinoId: runtime.id,
    });
    return "murmured";
  }
}
