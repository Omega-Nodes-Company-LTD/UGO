import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { beings, createDbClient, type DbClient, memories, runMigrations } from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { decryptText, encryptText } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DowryService } from "../../src/services/dowryService.js";
import { FarewellService } from "../../src/services/farewellService.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { ForgetService } from "../../src/services/privacy/forgetService.js";
import { plainTextMemories } from "../../src/services/privacy/plainTextMemories.js";

/**
 * I ricordi cifrati (ADR-091), su database vero.
 *
 * Cinque conseguenze di una decisione sola — tre scrittori che cifravano
 * `memories.text` contro ADR-022 — e questo file le prova una per una. Le
 * fixture seminano i ricordi **come li scrive il sogno**, cioè in chiaro:
 * è precisamente il punto in cui i test di prima si erano allineati
 * all'assunzione sbagliata invece di metterla alla prova.
 */

const MASTER_KEY = randomBytes(32);
const DATA_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let houseId: string;
let who: string;

/**
 * Un embedder finto: qui non si misura la semantica, si guarda il testo. Le
 * 768 dimensioni non sono un dettaglio — la colonna `vector` le pretende, e
 * un vettore corto fa fallire la scrittura invece del test.
 */
const embedder = {
  embed: (texts: string[]) => Promise.resolve(texts.map(() => new Array<number>(768).fill(0.01))),
};

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

/** Una casa nuova per ogni prova: qui si cancella e si muore. */
const freshHouse = async (slug: string): Promise<void> => {
  const house = await createAccountWithFounder(db, MASTER_KEY, {
    slug,
    name: slug,
    gosinoName: "Vecchio",
  });
  houseId = house.accountId;
  who = house.gosinoId;
};

describe("il lascito porta davvero qualcosa", () => {
  it("un ricordo IN CHIARO — come li scrive il sogno — arriva nel lascito", async () => {
    await freshHouse("casa-lascito");
    await db.insert(memories).values({
      gosinoId: who,
      kind: "fact",
      text: "Il compressore va spurgato ogni lunedì",
      importance: 0.9,
    });

    const legacy = await new DowryService(db, DATA_KEY).legacyOf(who, houseId, {});
    // prima di ADR-091 qui c'erano ZERO righe: `readable` provava a decifrare
    // un testo in chiaro, falliva, tornava "" e il ciclo la saltava
    expect(legacy.rows).toHaveLength(1);
    expect(legacy.rows[0]?.text).toContain("compressore");
  });

  it("e dopo il congedo resta leggibile, non cifrato", async () => {
    const farewells = new FarewellService(db, DATA_KEY);
    const report = await farewells.farewell(houseId, who);
    expect(report?.legacyKept).toBe(1);

    const kept = await db.select().from(memories).where(eq(memories.gosinoId, who));
    const legacy = kept.filter((row) => (row.sourceRefs as { legacy?: boolean }).legacy === true);
    expect(legacy).toHaveLength(1);
    // in chiaro: si ripesca col braccio lessicale e la redazione lo tocca
    expect(legacy[0]?.text).toContain("compressore");
    expect(legacy[0]?.text.startsWith("v1:")).toBe(false);
  });
});

describe("l'oblio arriva dentro le righe cifrate", () => {
  it("il nome cancellato NON sopravvive, nemmeno con la chiave di casa", async () => {
    await freshHouse("casa-oblio");
    const [being] = await db
      .insert(beings)
      .values({ accountId: houseId, displayName: "Monika", species: "human", kind: "resident" })
      .returning({ id: beings.id });
    if (being === undefined) throw new Error("nessun essere");

    // una riga come le scriveva il congedo PRIMA di ADR-091: cifrata
    await db.insert(memories).values({
      gosinoId: who,
      kind: "insight",
      text: encryptText("Monika ha detto che il compressore perde", DATA_KEY),
      importance: 0.9,
      sourceRefs: { legacy: true },
    });

    const forget = new ForgetService({ db, dataKey: DATA_KEY, embedder });
    const report = await forget.forgetBeing(being.id, houseId);
    expect(report.memoriesRedacted).toBeGreaterThan(0);

    const [row] = await db.select().from(memories).where(eq(memories.gosinoId, who));
    const text = row?.text ?? "";
    // né in chiaro...
    expect(text).not.toContain("Monika");
    // ...né dietro la chiave di casa, che è il punto: prima restava lì dentro
    // e l'audit diceva che la cancellazione era riuscita
    const opened = text.startsWith("v1:") ? decryptText(text, DATA_KEY) : text;
    expect(opened).not.toContain("Monika");
    // e il resto del ricordo sopravvive: si cancella una persona, non la vita
    expect(opened).toContain("compressore");
  });
});

describe("niente più doppia cifratura", () => {
  it("un lascito di seconda generazione resta leggibile", async () => {
    await freshHouse("casa-generazioni");
    // una lezione come le scriveva l'anziano PRIMA di ADR-091
    await db.insert(memories).values({
      gosinoId: who,
      kind: "insight",
      text: encryptText("Le viti M3 con inserto a caldo tengono meglio", DATA_KEY),
      importance: 0.8,
    });

    const report = await new FarewellService(db, DATA_KEY).farewell(houseId, who);
    expect(report?.legacyKept).toBe(1);

    const [row] = await db
      .select()
      .from(memories)
      .where(eq(memories.gosinoId, who))
      .then((rows) => rows.filter((r) => (r.sourceRefs as { legacy?: boolean }).legacy === true));
    // prima: `encryptText(ciphertext)` — due giri, e aprendone uno ne usciva
    // un altro ciphertext. Il lascito di chi aveva imparato era illeggibile
    expect(row?.text).toContain("viti M3");
    expect(row?.text.startsWith("v1:")).toBe(false);
  });
});

describe("il pregresso si converte", () => {
  it("le righe già cifrate tornano in chiaro, e quelle in chiaro non si toccano", async () => {
    await freshHouse("casa-conversione");
    await db.insert(memories).values([
      { gosinoId: who, kind: "fact", text: "Questo era già in chiaro", importance: 0.5 },
      {
        gosinoId: who,
        kind: "insight",
        text: encryptText("Questo era cifrato", DATA_KEY),
        importance: 0.5,
      },
      {
        gosinoId: who,
        kind: "fact",
        // scritta con un'altra chiave: non si apre, e non si sovrascrive
        text: encryptText("Con una chiave che non abbiamo", randomBytes(32)),
        importance: 0.5,
      },
    ]);

    const report = await plainTextMemories(db, DATA_KEY, houseId);
    expect(report.found).toBe(2);
    expect(report.converted).toBe(1);
    expect(report.unreadable).toBe(1);

    const rows = await db.select().from(memories).where(eq(memories.gosinoId, who));
    const texts = rows.map((row) => row.text);
    expect(texts).toContain("Questo era già in chiaro");
    expect(texts).toContain("Questo era cifrato");
    // l'illeggibile resta com'era: sovrascriverlo sarebbe una perdita
    expect(texts.filter((text) => text.startsWith("v1:"))).toHaveLength(1);
  });

  it("passarci due volte non cambia niente", async () => {
    const again = await plainTextMemories(db, DATA_KEY, houseId);
    expect(again.converted).toBe(0);
    expect(again.found).toBe(1);
  });
});
