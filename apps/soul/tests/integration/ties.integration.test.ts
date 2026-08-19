import { randomBytes } from "node:crypto";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  budgetLedger,
  createDbClient,
  type DbClient,
  desires,
  accounts,
  memories,
  parcels,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { decryptText, unwrapDataKey } from "@ugo/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatService } from "../../src/services/chatService.js";
import { characterFrom } from "../../src/services/council/character.js";
import { createAccountWithFounder } from "../../src/services/accountService.js";
import { ParcelService } from "../../src/services/parcelService.js";
import { PsycheService } from "../../src/services/psycheService.js";
import { TieService } from "../../src/services/tieService.js";

/**
 * ADR-099 sul giro vero: tre case su un Postgres migrato, DEK avvolte come
 * in produzione. Le promesse che solo l'integrazione prova: il consenso
 * bilaterale apre la porta e la revoca la chiude; il testo a riposo è
 * cifrato con la chiave della casa DESTINATARIA (il mittente non lo riapre);
 * la consegna è un desiderio del gosino giusto; «tenere» scrive un ricordo
 * IN CHIARO (ADR-091) con l'origine dichiarata.
 */

const MASTER_KEY = randomBytes(32);

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let ties: TieService;
let posta: ParcelService;
let nostra: { accountId: string; gosinoId: string };
let parenti: { accountId: string; gosinoId: string };
let vicini: { accountId: string; gosinoId: string };
let tieId: string;

const houseKey = async (accountId: string): Promise<Buffer> => {
  const [row] = await db
    .select({ wrapped: accounts.wrappedDataKey })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (row?.wrapped == null) throw new Error("la casa non ha una DEK");
  return unwrapDataKey(row.wrapped, MASTER_KEY);
};

beforeAll(async () => {
  const started = await startPostgres();
  pg = started.container;
  await runMigrations(started.url);
  db = createDbClient(started.url);

  nostra = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-nostra",
    name: "Casa Nostra",
    gosinoName: "Ugo",
  });
  parenti = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-nonni",
    name: "I Nonni",
    gosinoName: "Nonnino",
  });
  vicini = await createAccountWithFounder(db, MASTER_KEY, {
    slug: "casa-vicini",
    name: "I Vicini",
    gosinoName: "Estraneo",
  });

  ties = new TieService(db);
  posta = new ParcelService(db, MASTER_KEY);
}, 240_000);

afterAll(async () => {
  await db.$client.end();
  await pg.stop();
});

describe("la parentela: proposta, consenso, revoca", () => {
  it("si propone per slug, e nasce proposta", async () => {
    const done = await ties.propose(nostra.accountId, {
      toAccount: "casa-nonni",
      label: "i nonni",
    });
    if (typeof done === "string") throw new Error(done);
    tieId = done.id;

    const loro = await ties.listFor(parenti.accountId);
    expect(loro).toHaveLength(1);
    expect(loro[0]?.status).toBe("proposta");
    expect(loro[0]?.proposedByUs).toBe(false);
    expect(loro[0]?.otherSlug).toBe("casa-nostra");
  });

  it("senza il sì dell'altra casa non parte NIENTE", async () => {
    const refused = await posta.send(nostra.accountId, {
      tieId,
      fromGosinoId: nostra.gosinoId,
      kind: "messaggio",
      text: "troppo presto",
    });
    expect(refused).toBe("non-accettata");
  });

  it("accettare tocca solo alla casa che ha ricevuto la proposta", async () => {
    expect(await ties.accept(vicini.accountId, tieId)).toBe("non-tua");
    expect(await ties.accept(nostra.accountId, tieId)).toBe("non-tua");
    const done = await ties.accept(parenti.accountId, tieId);
    expect(done).toEqual({ id: tieId });
    expect(await ties.accept(parenti.accountId, tieId)).toBe("non-in-proposta");
  });

  it("il gesto la trova per etichetta, per slug o per nome", async () => {
    for (const name of ["i nonni", "casa-nonni", "I Nonni"]) {
      const found = await ties.acceptedTieByName(nostra.accountId, name);
      expect(found?.id).toBe(tieId);
      expect(found?.otherAccountId).toBe(parenti.accountId);
    }
    expect(await ties.acceptedTieByName(nostra.accountId, "gli zii")).toBeUndefined();
    // i vicini non hanno parentele: per loro «i nonni» non è nessuno
    expect(await ties.acceptedTieByName(vicini.accountId, "i nonni")).toBeUndefined();
  });
});

describe("la cartolina: cifratura, consegna, cassetta", () => {
  let parcelId: string;

  it("parte, e a riposo è della casa destinataria", async () => {
    const done = await posta.send(nostra.accountId, {
      tieId,
      fromGosinoId: nostra.gosinoId,
      toGosinoId: parenti.gosinoId,
      kind: "messaggio",
      text: "oggi siamo stati al parco!",
    });
    if (typeof done === "string") throw new Error(done);
    parcelId = done.id;

    const [row] = await db.select().from(parcels).where(eq(parcels.id, parcelId));
    if (row === undefined) throw new Error("cartolina sparita");
    // mai in chiaro sul database
    expect(row.text).not.toContain("parco");
    // si apre con la chiave dei NONNI, non con la nostra: il mittente,
    // spedita che l'ha, non ha più un canale di lettura
    expect(decryptText(row.text, await houseKey(parenti.accountId))).toBe(
      "oggi siamo stati al parco!",
    );
    expect(() => decryptText(row.text, MASTER_KEY)).toThrow();
    expect(row.status).toBe("consegnata");
    expect(row.deliveredAt).not.toBeNull();
  });

  it("la consegna è un desiderio del gosino destinatario, mai la voce altrui", async () => {
    const wishes = await db
      .select({ text: desires.text, kind: desires.kind })
      .from(desires)
      .where(eq(desires.gosinoId, parenti.gosinoId));
    const arrival = wishes.filter((wish) => wish.text.includes("cartolina"));
    expect(arrival).toHaveLength(1);
    expect(arrival[0]?.text).toContain("Casa Nostra");
    expect(arrival[0]?.kind).toBe("desiderio");
  });

  it("la cassetta della posta è in chiaro per chi riceve, muta per chi spedisce", async () => {
    const inbox = await posta.inbox(parenti.accountId);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.text).toBe("oggi siamo stati al parco!");
    expect(inbox[0]?.otherSlug).toBe("casa-nostra");

    const outbox = await posta.outbox(nostra.accountId);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.text).toBeUndefined();

    // i vicini non vedono la posta degli altri
    expect(await posta.inbox(vicini.accountId)).toHaveLength(0);
    expect(await posta.outbox(vicini.accountId)).toHaveLength(0);
  });

  it("un messaggio si legge, non si tiene", async () => {
    expect(await posta.keep(parenti.accountId, parcelId)).toBe("non-un-ricordo");
  });
});

describe("il ricordo che si tiene", () => {
  let ricordoId: string;

  it("arriva, si tiene una volta, e diventa un ricordo IN CHIARO con l'origine", async () => {
    const sent = await posta.send(nostra.accountId, {
      tieId,
      fromGosinoId: nostra.gosinoId,
      toGosinoId: parenti.gosinoId,
      kind: "ricordo",
      text: "il nipote ha imparato ad andare in bici",
    });
    if (typeof sent === "string") throw new Error(sent);
    ricordoId = sent.id;

    // tenerla non è del mittente
    expect(await posta.keep(nostra.accountId, ricordoId)).toBe("non-tua");

    const kept = await posta.keep(parenti.accountId, ricordoId);
    if (typeof kept === "string") throw new Error(kept);
    const [memory] = await db.select().from(memories).where(eq(memories.id, kept.memoryId));
    expect(memory?.gosinoId).toBe(parenti.gosinoId);
    expect(memory?.kind).toBe("episode");
    // in chiaro (ADR-091), e non finge di essere nato in casa
    expect(memory?.text).toContain("bici");
    expect(memory?.text).toContain("Casa Nostra");

    expect(await posta.keep(parenti.accountId, ricordoId)).toBe("gia-tenuta");
  });
});

describe("la revoca chiude la porta", () => {
  it("dopo la revoca non parte più niente, da nessuna delle due parti", async () => {
    const done = await ties.revoke(nostra.accountId, tieId);
    expect(done).toEqual({ id: tieId });

    for (const [from, gosino] of [
      [nostra.accountId, nostra.gosinoId],
      [parenti.accountId, parenti.gosinoId],
    ] as const) {
      const refused = await posta.send(from, {
        tieId,
        fromGosinoId: gosino,
        kind: "messaggio",
        text: "troppo tardi",
      });
      expect(refused).toBe("non-accettata");
    }
  });
});

describe("il gesto a voce: «manda ai nonni: …»", () => {
  let chat: ChatService;
  const say = (text: string) => chat.handle({ channel: "home", text });

  beforeAll(async () => {
    // la parentela di prima è revocata: se ne stringe una nuova, accettata
    const proposed = await ties.propose(nostra.accountId, {
      toAccount: "casa-nonni",
      label: "i nonni",
    });
    if (typeof proposed === "string") throw new Error(proposed);
    await ties.accept(parenti.accountId, proposed.id);

    chat = new ChatService({
      db,
      // il provider non esiste: se il gesto lo raggiungesse, il test morirebbe
      embedder: { embed: () => Promise.reject(new Error("mai")) },
      llm: {
        chat: () => Promise.reject(new Error("il provider non deve essere chiamato")),
      },
      psyche: await PsycheService.restore(db, new Date(), nostra.gosinoId),
      dataKey: MASTER_KEY,
      timezone: "Europe/Rome",
      locale: "it-IT",
      gosinoId: nostra.gosinoId,
      accountId: nostra.accountId,
      character: characterFrom({}),
      postcards: { ties, parcels: posta },
    });
  });

  it("spedisce senza sfiorare il provider, e lo dice", async () => {
    const response = await say("manda ai nonni: stasera grigliata, venite!");
    expect(response.reply).toContain("I Nonni");
    expect(response.reply).toContain("partita");

    const inbox = await posta.inbox(parenti.accountId);
    // la punteggiatura in coda la toglie il parser, come in ogni gesto
    expect(inbox[0]?.text).toBe("stasera grigliata, venite");
  });

  it("una parentela che non c'è si spiega, non si inventa", async () => {
    const response = await say("manda agli zii: ciao!");
    expect(response.reply).toContain("Non ho una parentela");
  });

  it("una proposta non ancora accettata si dice com'è", async () => {
    const proposed = await ties.propose(nostra.accountId, {
      toAccount: "casa-vicini",
      label: "gli zii",
    });
    if (typeof proposed === "string") throw new Error(proposed);
    const response = await say("manda agli zii: ciao!");
    expect(response.reply).toContain("proposta");
  });

  it("non costa niente: nessuna riga sul salvadanaio", async () => {
    const spend = await db
      .select()
      .from(budgetLedger)
      .where(eq(budgetLedger.gosinoId, nostra.gosinoId));
    expect(spend).toHaveLength(0);
  });

  it("una frase normale NON diventa una cartolina: arriva al provider, e infatti esplode", async () => {
    await expect(say("come stai?")).rejects.toThrow();
  });
});
