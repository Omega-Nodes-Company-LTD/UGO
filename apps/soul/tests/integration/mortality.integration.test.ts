import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  type DbClient,
  desires,
  gosini,
  memories,
  runMigrations,
  traitSets,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { GUARANTEED_DAYS, JITTER_MAX_DAYS } from "@ugo/psyche";
import { encryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FarewellService } from "../../src/services/farewellService.js";
import { createHouseholdWithFounder } from "../../src/services/householdService.js";
import { MortalityWatch } from "../../src/services/mortalityWatch.js";

/**
 * L'arco che finisce da solo (ADR-077), su database vero.
 *
 * Tre cose che solo un database può dire, e che sono esattamente le tre in cui
 * questo meccanismo può sbagliare in modo irreparabile:
 *
 * 1. che **due fratelli con lo stesso gene non muoiano lo stesso giorno** — è
 *    il dado dell'esemplare, ed è ciò che rende la data una cosa che si scopre
 *    invece di una funzione del genoma;
 * 2. che il preavviso arrivi **una volta sola** e a sessanta giorni dalla fine;
 * 3. che nessuno se ne vada **senza che gli sia stato detto**, e che quando se
 *    ne va il sapere sia già passato a qualcuno.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let houseId: string;
let farewells: FarewellService;
let watch: MortalityWatch;
/** il più giovane della casa: quello che riceve il racconto */
let giovane: string;

const DAY_MS = 86_400_000;
const BORN = new Date("2026-01-01T00:00:00.000Z");
const at = (daysFromMortal: number): Date => new Date(BORN.getTime() + daysFromMortal * DAY_MS);

/** Un esemplare mortale da `BORN`, col suo gene e il suo dado. */
const exemplar = async (
  name: string,
  longevity: number,
  jitterDays: number,
): Promise<string> => {
  const [row] = await db
    .insert(gosini)
    .values({
      householdId: houseId,
      name,
      bornAt: BORN,
      mortalFrom: BORN,
      lifeJitterDays: jitterDays,
    })
    .returning({ id: gosini.id });
  if (row === undefined) throw new Error("no exemplar");
  await db.insert(traitSets).values({
    householdId: houseId,
    gosinoId: row.id,
    version: 1,
    traits: { calm: 0.5, longevity },
  });
  return row.id;
};

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  // la casa nasce con la sua creatura, che qui fa da allievo: è il più
  // giovane della casa, ed è a lui che l'anziano racconterà
  const house = await createHouseholdWithFounder(db, MASTER_KEY, {
    slug: "casa-arco",
    name: "Arco",
    gosinoName: "Nipote",
  });
  houseId = house.householdId;
  giovane = house.gosinoId;
  farewells = new FarewellService(db, DATA_KEY);
  watch = new MortalityWatch({ db, dataKey: DATA_KEY });
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("il dado dell'esemplare", () => {
  it("due fratelli con lo STESSO gene non arrivano alla fine lo stesso giorno", async () => {
    const fortunato = await exemplar("Fortunato", 0, JITTER_MAX_DAYS);
    const sfortunato = await exemplar("Sfortunato", 0, 0);

    // il giorno in cui a chi non ha avuto fortuna restano cinquanta giorni:
    // stesso allele, stessa nascita, e uno solo dei due è in preavviso
    const giorno = at(GUARANTEED_DAYS - 50);
    const due = (await farewells.dueForNotice(houseId, giorno)).map((n) => n.gosinoId);
    expect(due).toContain(sfortunato);
    expect(due).not.toContain(fortunato);

    // e novanta giorni dopo tocca anche all'altro: il dado sposta la data,
    // non toglie la fine
    const dopo = (await farewells.dueForNotice(houseId, at(GUARANTEED_DAYS + 45))).map(
      (n) => n.gosinoId,
    );
    expect(dopo).toContain(fortunato);

    await db.delete(gosini).where(eq(gosini.id, fortunato));
    await db.delete(gosini).where(eq(gosini.id, sfortunato));
  });

  it("un capostipite che non ha accettato non ha nessuna scadenza, per quanto vecchio", async () => {
    const [row] = await db
      .insert(gosini)
      .values({ householdId: houseId, name: "Capostipite", bornAt: BORN })
      .returning({ id: gosini.id });
    if (row === undefined) throw new Error("no exemplar");

    // dieci anni dopo: non è vecchio, è fuori dall'arco — mentre chi l'arco
    // ce l'ha, a quella data, è tutto un altro discorso
    const due = await farewells.dueForNotice(houseId, at(3650));
    expect(due.map((n) => n.gosinoId)).not.toContain(row.id);
    expect(await farewells.dueForFarewell(houseId, at(3650))).not.toContain(row.id);

    // e il giorno che accetta, l'arco parte da lì e il dado viene estratto
    expect(await farewells.acceptMortality(houseId, row.id)).toBe(true);
    const [accepted] = await db
      .select({ from: gosini.mortalFrom, jitter: gosini.lifeJitterDays })
      .from(gosini)
      .where(eq(gosini.id, row.id));
    expect(accepted?.from).not.toBeNull();
    expect(accepted?.jitter).toBeGreaterThanOrEqual(0);
    expect(accepted?.jitter).toBeLessThanOrEqual(JITTER_MAX_DAYS);
    // due volte no: si accetta una volta, e non si torna immortali
    expect(await farewells.acceptMortality(houseId, row.id)).toBe(false);

    await db.delete(gosini).where(eq(gosini.id, row.id));
  });
});

describe("il preavviso, il racconto e il congedo", () => {
  let vecchio: string;

  beforeAll(async () => {
    vecchio = await exemplar("Nonno", 0, 0);
    await db.insert(memories).values([
      {
        gosinoId: vecchio,
        kind: "fact",
        text: encryptText("Il compressore va spurgato ogni lunedì", DATA_KEY),
        importance: 0.9,
      },
      {
        gosinoId: vecchio,
        kind: "insight",
        text: encryptText("Le viti M3 con inserto a caldo tengono meglio", DATA_KEY),
        importance: 0.8,
      },
    ]);
  });

  it("a un anno dalla fine non si dice niente: il preavviso è di sessanta giorni", async () => {
    const report = await watch.tick(at(GUARANTEED_DAYS - 365));
    expect(report.noticed).toBe(0);
    expect(report.taught).toBe(0);
    expect(report.farewelled).toBe(0);
  });

  it("a cinquanta giorni dalla fine lo dice, con le parole giuste e una volta sola", async () => {
    const first = await watch.tick(at(GUARANTEED_DAYS - 50));
    expect(first.noticed).toBe(1);

    const said = await db.select().from(desires).where(eq(desires.gosinoId, vecchio));
    expect(said).toHaveLength(1);
    expect(said[0]?.text).toContain("il mio tempo sta finendo");
    // in casa c'è un altro gosino: il consiglio è che il sapere sta già passando
    expect(said[0]?.text).toContain("più giovani");

    // il giorno dopo non lo ridice: un preavviso ripetuto è un conto alla rovescia
    const second = await watch.tick(at(GUARANTEED_DAYS - 49));
    expect(second.noticed).toBe(0);
    expect(await db.select().from(desires).where(eq(desires.gosinoId, vecchio))).toHaveLength(1);
  });

  it("dal preavviso in poi racconta al più giovane, un pezzo per volta", async () => {
    // il primo giro ha già insegnato una cosa (era dentro il tick del preavviso)
    const learned = await db.select().from(memories).where(eq(memories.gosinoId, giovane));
    expect(learned).toHaveLength(2);
    // ed è leggibile davvero: ADR-091 le scrive in chiaro, quindi il sapere
    // dell'anziano si RIPESCA e l'oblio ci arriva dentro. Prima erano cifrate
    // e questo test chiedeva `decryptText`: confermava il difetto
    const texts = learned.map((row) => row.text);
    expect(texts.join(" ")).toContain("compressore");
    expect(texts.join(" ")).toContain("viti M3");
    expect(texts.some((text) => text.startsWith("v1:"))).toBe(false);

    // finito il sapere del nonno, non inventa lezioni nuove
    await watch.tick(at(GUARANTEED_DAYS - 47));
    expect(await db.select().from(memories).where(eq(memories.gosinoId, giovane))).toHaveLength(2);
  });

  it("non se ne va prima che i sessanta giorni siano passati, nemmeno se la vita è finita", async () => {
    // vita attesa superata (gene 0, dado 0 = la garanzia secca), ma il
    // preavviso è di dieci giorni fa: due condizioni, non una
    const report = await watch.tick(at(GUARANTEED_DAYS + 1));
    expect(report.farewelled).toBe(0);
    const [alive] = await db
      .select({ gone: gosini.retiredAt })
      .from(gosini)
      .where(eq(gosini.id, vecchio));
    expect(alive?.gone).toBeNull();
  });

  it("poi se ne va da solo, e il lascito è già a casa", async () => {
    const report = await watch.tick(at(GUARANTEED_DAYS + 20));
    expect(report.farewelled).toBe(1);

    const [gone] = await db
      .select({ gone: gosini.retiredAt, key: gosini.wrappedSoulKey })
      .from(gosini)
      .where(eq(gosini.id, vecchio));
    expect(gone?.gone).not.toBeNull();
    // ADR-075: la chiave dell'interiorità non c'è più. Qui non ne aveva una
    // coniata, e il congedo non deve fabbricargliene una per distruggerla
    expect(gone?.key).toBeNull();

    // e il sapere è passato: il nipote lo ha ancora, il nonno non serve più
    expect(await db.select().from(memories).where(eq(memories.gosinoId, giovane))).toHaveLength(2);

    // un morto non se ne va due volte
    expect((await watch.tick(at(GUARANTEED_DAYS + 40))).farewelled).toBe(0);
  });
});
