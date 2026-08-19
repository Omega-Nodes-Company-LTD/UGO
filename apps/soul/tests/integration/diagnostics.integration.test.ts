import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { createDbClient, runMigrations, type DbClient } from "@ugo/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";
import { TurnLog } from "../../src/services/diagnostics/turnLog.js";

/**
 * La diagnostica, contro roba vera (regola 1).
 *
 * Postgres e Mosquitto sono container davvero accesi; Ollama, il registro e la
 * percezione puntano alla porta 1, dove non ascolta nessuno — cioè un guasto
 * di rete vero e non uno stub che finge di esserlo. È esattamente la
 * situazione che questa pagina esiste per descrivere, e l'unico modo di
 * sapere che la descrive bene è metterla in quella situazione.
 */

const TOKEN = "operator-token";
/** porta 1: non ascolta nessuno, e il rifiuto arriva in millisecondi */
const NOWHERE = "http://127.0.0.1:1";

const MOSQUITTO_ANON_CONF = `listener 1883
allow_anonymous true
`;

let pg: StartedPostgreSqlContainer;
let broker: StartedTestContainer;
let db: DbClient;
let app: FastifyInstance;
let turnLog: TurnLog;

beforeAll(async () => {
  [pg, broker] = await Promise.all([
    new PostgreSqlContainer("pgvector/pgvector:pg16").start(),
    new GenericContainer("eclipse-mosquitto:2")
      .withCopyContentToContainer([
        { content: MOSQUITTO_ANON_CONF, target: "/mosquitto/config/mosquitto.conf" },
      ])
      .withExposedPorts(1883)
      .start(),
  ]);
  await runMigrations(pg.getConnectionUri());
  db = createDbClient(pg.getConnectionUri());
  turnLog = new TurnLog();

  app = buildServer({
    db,
    mqtt: { url: `mqtt://${broker.getHost()}:${String(broker.getMappedPort(1883))}` },
    ollamaUrl: NOWHERE,
    logger: false,
    diagnostics: {
      mqtt: { url: `mqtt://${broker.getHost()}:${String(broker.getMappedPort(1883))}` },
      ollama: { url: NOWHERE, embedModel: "nomic-embed-text" },
      // percezione e registro accesi nella configurazione ma irraggiungibili:
      // è il caso che `/health` non sapeva raccontare
      perceptionUrl: NOWHERE,
      turnLog,
      faceVersion: () => "test",
      startedAt: new Date(),
    },
    features: {
      chat: undefined as never,
      psyche: undefined as never,
      internalToken: TOKEN,
    },
  });
}, 240_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await Promise.all([pg.stop(), broker.stop()]);
});

const ask = () =>
  app.inject({
    method: "GET",
    url: "/v1/diagnostics",
    headers: { authorization: `Bearer ${TOKEN}` },
  });

interface Service {
  id: string;
  container: string;
  state: string;
  ms: number | null;
  why?: string;
  hint?: string;
}
interface Report {
  verdict: string;
  services: Service[];
  soul: { eventLoopMs: number; faceVersion: string };
  turns: { counters: Record<string, number>; turns: { totalMs: number }[]; medianMs: number | null };
}

const byId = (report: Report, id: string): Service => {
  const found = report.services.find((s) => s.id === id);
  if (found === undefined) throw new Error(`nessuna riga per ${id}`);
  return found;
};

describe("GET /v1/diagnostics", () => {
  it("è guardata: com'è messa l'installazione non è affare di chi passa", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/v1/diagnostics" });
    expect(anonymous.statusCode).toBe(401);
  });

  it("dice ok di ciò che risponde davvero, misurandolo", async () => {
    const report = (await ask()).json<Report>();
    expect(byId(report, "postgres").state).toBe("ok");
    expect(byId(report, "mosquitto").state).toBe("ok");
    // un numero vero: la sonda ha cronometrato, non ha dichiarato
    expect(byId(report, "postgres").ms).toBeGreaterThanOrEqual(0);
  });

  it("dice «non risponde» di un container acceso in configurazione e irraggiungibile", async () => {
    const report = (await ask()).json<Report>();
    expect(byId(report, "ollama").state).toBe("down");
    expect(byId(report, "percezione").state).toBe("down");
    // e dice cosa fare, che è la parte per cui si apre la pagina
    expect(byId(report, "ollama").hint).toBeTruthy();
    expect(report.verdict).toBe("degraded");
  });

  it("distingue lo spento dal rotto, e dice quale variabile lo accende", async () => {
    const report = (await ask()).json<Report>();
    const searx = byId(report, "searxng");
    expect(searx.state).toBe("off");
    expect(searx.why).toContain("SEARXNG_URL");
    // spento non porta un consiglio di riparazione: non c'è niente da riparare
    expect(searx.hint).toBeUndefined();
    expect(byId(report, "registry").why).toContain("UGO_REGISTRY_URL");
    expect(byId(report, "reception").why).toContain("UGO_RECEPTION_URL");
  });

  it("nomina ogni container del compose, col nome che si scrive in docker logs", async () => {
    const report = (await ask()).json<Report>();
    // la lista di ops/docker/compose.dev.yml, meno i due database dei servizi
    // che si sondano attraverso il servizio che li usa
    expect(report.services.map((s) => s.id).sort()).toEqual(
      ["jobs", "mosquitto", "ollama", "percezione", "postgres", "provider", "reception", "registry", "searxng"].sort(),
    );
    expect(byId(report, "postgres").container).toBe("postgres");
  });

  it("non spende un centesimo per dire come sta il provider", async () => {
    const report = (await ask()).json<Report>();
    const provider = byId(report, "provider");
    // senza chiave è spento; e in nessun caso viene cronometrato, perché in
    // nessun caso viene chiamato: una prova sarebbe una chiamata pagata
    expect(provider.state).toBe("off");
    expect(provider.ms).toBeNull();
  });

  it("porta i turni misurati e i contatori delle frasi", async () => {
    const turn = turnLog.start("gos-test", "home");
    turn.lap("ripescaggio");
    turn.done();
    turnLog.heard();
    turnLog.answered();

    const report = (await ask()).json<Report>();
    expect(report.turns.turns).toHaveLength(1);
    expect(report.turns.medianMs).not.toBeNull();
    expect(report.turns.counters.heard).toBe(1);
    expect(report.turns.counters.answered).toBe(1);
    expect(report.soul.faceVersion).toBe("test");
  });

  it("risponde 200 anche quando il verdetto è nero: descrive un guasto, non lo subisce", async () => {
    const response = await ask();
    expect(response.statusCode).toBe(200);
  });
});
