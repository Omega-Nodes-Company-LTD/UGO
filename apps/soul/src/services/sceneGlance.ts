import { events, type DbClient } from "@ugo/db";
import type { LocalVisionClient } from "@ugo/memory";
import { and, eq, gte, sql } from "drizzle-orm";
import type { FaceGateway } from "./faceGateway.js";

/**
 * Lo sguardo che diventa una frase (gruppo 12, il secondo taglio della
 * visione).
 *
 * Ogni tanto, di giorno, se un corpo è connesso, UGO «dà un'occhiata»: chiede
 * al chiosco uno sguardo della stanza (`glimpse_ask`), e al battito dopo — se
 * lo sguardo è arrivato ed è fresco — il modello vision LOCALE lo trasforma
 * in una frase che entra nella ruminazione: un evento `rumination` con
 * `about: "vista"`, che il sogno vaglierà come ogni altro pensiero. Mai il
 * provider, mai un'immagine scritta da qualche parte: i pixel vivono in
 * memoria dentro il gateway e si consumano alla lettura.
 *
 * Due battiti e non uno, ed è il disegno: chiedere e aspettare nella stessa
 * chiamata terrebbe un giro dell'iniziativa appeso alla rete del chiosco.
 */

/** di giorno: la notte è del sogno, e uno sguardo al buio descrive il buio */
const GLANCE_FROM_HOUR = 8;
const GLANCE_TO_HOUR = 22;

/** un'occhiata ogni tanto: il mondo non cambia ogni quattro minuti */
const GLANCE_CHANCE = 0.2;
const GLANCE_GAP_MIN = 60;

/** quanto può invecchiare uno sguardo prima di non valere più una frase */
const GLIMPSE_MAX_AGE_MS = 10 * 60_000;

export interface SceneGlanceDeps {
  db: DbClient;
  vision: LocalVisionClient;
  visionUp: () => boolean;
  hourOf: (at: Date) => number;
  gapMin?: number;
}

export interface SceneGlanceRuntime {
  id: string;
  gateway: Pick<FaceGateway, "hasBody" | "askGlimpse" | "takeGlimpse">;
}

export class SceneGlance {
  public constructor(private readonly deps: SceneGlanceDeps) {}

  public async maybe(
    runtime: SceneGlanceRuntime,
    at: Date = new Date(),
    roll: number = Math.random(),
  ): Promise<"asked" | "thought" | "nothing"> {
    const hour = this.deps.hourOf(at);
    if (hour < GLANCE_FROM_HOUR || hour >= GLANCE_TO_HOUR) return "nothing";
    if (!runtime.gateway.hasBody()) return "nothing";
    if (!this.deps.visionUp()) return "nothing";

    // uno sguardo già arrivato si guarda SEMPRE, anche col dado cattivo: è
    // stato chiesto, e chiedere per poi non guardare è il tic peggiore
    const held = runtime.gateway.takeGlimpse(GLIMPSE_MAX_AGE_MS, at);
    if (held !== undefined) {
      const thought = await this.deps.vision.describe(held);
      if (thought === undefined) return "nothing";
      // il pensiero entra dal canale della ruminazione: il sogno lo vaglia,
      // non diventa memoria da solo (ADR-059) — e i pixel sono già svaniti
      await this.deps.db.insert(events).values({
        source: "system",
        type: "rumination",
        payload: { about: "vista", thought },
        gosinoId: runtime.id,
      });
      return "thought";
    }

    if (roll >= GLANCE_CHANCE) return "nothing";
    const since = new Date(at.getTime() - (this.deps.gapMin ?? GLANCE_GAP_MIN) * 60_000);
    const [recent] = await this.deps.db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.gosinoId, runtime.id),
          eq(events.type, "rumination"),
          sql`${events.payload}->>'about' = 'vista'`,
          gte(events.ts, since),
        ),
      )
      .limit(1);
    if (recent !== undefined) return "nothing";

    runtime.gateway.askGlimpse();
    return "asked";
  }
}
