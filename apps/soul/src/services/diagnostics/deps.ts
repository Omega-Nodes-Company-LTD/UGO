import type { DbClient } from "@ugo/db";
import type { MqttTarget } from "./probes.js";
import type { TurnLog } from "./turnLog.js";

/**
 * Cosa serve alla diagnostica per sapere che stack sta guardando.
 *
 * Tutto facoltativo tranne il database, e apposta: una casa senza registro,
 * senza reception e senza percezione è una casa legittima, non una casa
 * rotta. Ogni campo assente diventa una riga «spenta» col nome della
 * variabile da impostare accanto — che è l'unica forma in cui «manca» è
 * un'informazione utile invece di un silenzio.
 */
export interface DiagnosticsDeps {
  db: DbClient;
  mqtt: MqttTarget;
  ollama: { url: string; embedModel: string };
  perceptionUrl?: string | undefined;
  searxngUrl?: string | undefined;
  registry?: { baseUrl: string; token: string } | undefined;
  receptionUrl?: string | undefined;
  /** il modello di chat, se c'è una chiave: si dichiara, non si sonda */
  chatModel?: string | undefined;
  /** quando ha sognato l'ultima volta; assente = questa installazione non lo sa */
  lastDream?: (() => Promise<Date | null>) | undefined;
  turnLog: TurnLog;
  /** quale bundle del muso sta servendo questo soul */
  faceVersion: () => string;
  /** da quando è vivo questo processo */
  startedAt: Date;
}
