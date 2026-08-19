import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  checkins,
  createDbClient,
  type DbClient,
  gosini,
  listItems,
  memories,
  perceptionEvents,
  rooms,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { encryptText } from "@ugo/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { ExportService } from "../../src/services/privacy/exportService.js";

/**
 * L'export che manteneva metà promessa (ADR-089), su database vero.
 *
 * Il commento in cima a `exportService.ts` dice «ogni byte che il sistema
 * tiene su una casa». Per diciassette tabelle non era vero, e nessuna di loro
 * era piccola: la casa stessa, le sue stanze, come è arredata, la spesa, le
 * domande che UGO ha imparato a fare, il genoma delle creature, **chi è stato
 * visto e quando**.
 *
 * Qui si semina una riga per tabella e si controlla che esca — e, altrettanto
 * importante, che **certe cose non escano**: un embedding biometrico e l'hash
 * di un token non sono dati da consegnare in un JSON in chiaro.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let houseId: string;
let who: string;

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-export",
    name: "Export",
    gosinoName: "Ugo",
  });
  houseId = house.accountId;
  who = house.gosinoId;

  await db.insert(rooms).values({ accountId: houseId, name: "Cucina", slug: "cucina" });
  await db.insert(listItems).values({
    accountId: houseId,
    list: "spesa",
    text: encryptText("il latte", DATA_KEY),
  });
  await db.insert(checkins).values({
    gosinoId: who,
    question: "se ho preso le medicine",
    hour: 8,
  });
  await db.insert(perceptionEvents).values({
    gosinoId: who,
    modality: "face",
    confidence: 0.9,
    observed: {},
  });
  // il genoma non si semina: la casa nasce col capostipite, che ce l'ha già
  // due ricordi come li scrive davvero il sistema: uno in chiaro (il sogno) e
  // uno cifrato (il lascito, ADR-075)
  await db.insert(memories).values([
    { gosinoId: who, kind: "fact", text: "Il corriere passa il martedì", importance: 0.8 },
    {
      gosinoId: who,
      kind: "insight",
      text: encryptText("Le viti M3 tengono meglio", DATA_KEY),
      importance: 0.9,
      sourceRefs: { legacy: true },
    },
  ]);
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("cosa esce", () => {
  it("la casa, le stanze, la spesa, le domande, il genoma e chi è passato", async () => {
    const bundle = await new ExportService(db, DATA_KEY).exportAll(houseId);
    expect(bundle.account).toHaveLength(1);
    expect(bundle.rooms).toHaveLength(1);
    expect(bundle.checkins).toHaveLength(1);
    expect(bundle.perceptionEvents).toHaveLength(1);
    expect(bundle.traitSets.length).toBeGreaterThan(0);
    expect(JSON.stringify(bundle.checkins)).toContain("medicine");
  });

  it("la spesa esce in CHIARO: un file che non si può leggere non è portabilità", async () => {
    const bundle = await new ExportService(db, DATA_KEY).exportAll(houseId);
    expect(JSON.stringify(bundle.listItems)).toContain("il latte");
    expect(JSON.stringify(bundle.listItems)).not.toContain("v1:");
  });

  it("i ricordi escono tutti e due: il chiaro resta chiaro, il cifrato si apre", async () => {
    // il lettore tollerante di ADR-086, portato anche qui: prima marcare
    // «non decifrabile» un ricordo in chiaro l'avrebbe cancellato dall'export
    const serialized = JSON.stringify(
      (await new ExportService(db, DATA_KEY).exportAll(houseId)).memories,
    );
    expect(serialized).toContain("Il corriere passa il martedì");
    expect(serialized).toContain("viti M3");
    expect(serialized).not.toContain("v1:");
  });
});

describe("cosa NON esce", () => {
  it("nessun vettore biometrico: esce il fatto che qualcuno è passato, non il suo volto", async () => {
    const bundle = await new ExportService(db, DATA_KEY).exportAll(houseId);
    const serialized =
      JSON.stringify(bundle.perceptionEvents) + JSON.stringify(bundle.unknownPrints);
    // non filtrato dopo: non è mai stato selezionato (ADR-016)
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("embedding");
  });

  it("nessuna credenziale: un export non è un mazzo di chiavi", async () => {
    const bundle = await new ExportService(db, DATA_KEY).exportAll(houseId);
    expect(JSON.stringify(bundle)).not.toContain("token_hash");
  });

  it("e resta di UNA casa: il vicino non compare", async () => {
    const vicina = await createAccountWithFounder(db, MASTER_KEY, {
      slug: "vicina-export",
      name: "Vicina",
      gosinoName: "Altro",
    });
    await db.insert(rooms).values({
      accountId: vicina.accountId,
      name: "SalottoDelVicino",
      slug: "salotto-vicino",
    });
    const bundle = await new ExportService(db, DATA_KEY).exportAll(houseId);
    expect(JSON.stringify(bundle)).not.toContain("SalottoDelVicino");
    expect(JSON.stringify(bundle)).not.toContain(vicina.accountId);
  });
});

describe("il congedo non toglie niente all'export", () => {
  it("un esemplare che se n'è andato porta con sé la sua biografia, non la cancella", async () => {
    await db.update(gosini).set({ retiredAt: new Date() });
    const bundle = await new ExportService(db, DATA_KEY).exportAll(houseId);
    expect(bundle.memories.length).toBeGreaterThan(0);
    expect(bundle.checkins).toHaveLength(1);
  });
});
