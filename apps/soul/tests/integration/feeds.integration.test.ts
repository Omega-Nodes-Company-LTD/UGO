import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  auditLog,
  createDbClient,
  type DbClient,
  feedItems,
  accounts,
  rssFeeds,
  runMigrations,
} from "@ugo/db";
import { startPostgres } from "@ugo/factories";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueToken } from "../../src/services/tenantAuth.js";
import { buildServer } from "../../src/server.js";

/**
 * Le rotte dei feed (ADR-060): la lista è della casa, e SOLO della casa.
 * Il download non passa da qui — è dei job — quindi quel che si prova è la
 * scrittura della lista, il muro fra le case, e il cascade della disdetta.
 */

let container: StartedPostgreSqlContainer;
let db: DbClient;
let app: FastifyInstance;
let houseA = "";
let houseB = "";
let tokenA = "";
let tokenB = "";

async function born(slug: string): Promise<string> {
  const [row] = await db
    .insert(accounts)
    .values({ slug, name: slug })
    .returning({ id: accounts.id });
  return row?.id ?? "";
}

beforeAll(async () => {
  const pg = await startPostgres();
  container = pg.container;
  await runMigrations(pg.url);
  db = createDbClient(pg.url);
  houseA = await born("casa-feed-a");
  houseB = await born("casa-feed-b");
  app = buildServer({
    db,
    mqtt: { url: "mqtt://127.0.0.1:1" },
    ollamaUrl: "http://127.0.0.1:1",
    logger: false,
    features: { chat: undefined as never, psyche: undefined as never },
  });
  tokenA = (await issueToken(db, { accountId: houseA, role: "owner", label: "prova" })).token;
  tokenB = (await issueToken(db, { accountId: houseB, role: "owner", label: "prova" })).token;
}, 180_000);

afterAll(async () => {
  await app.close();
  await db.$client.end();
  await container.stop();
});

const asOwner = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

describe("i feed della casa", () => {
  it("iscrive, elenca, e lo stesso URL due volte è un 409, non un doppione", async () => {
    const made = await app.inject({
      method: "POST",
      url: "/v1/feeds",
      headers: asOwner(tokenA),
      payload: { url: "https://blog.example.com/feed.xml", label: "blog di prova" },
    });
    expect(made.statusCode).toBe(201);

    const twice = await app.inject({
      method: "POST",
      url: "/v1/feeds",
      headers: asOwner(tokenA),
      payload: { url: "https://blog.example.com/feed.xml", label: "di nuovo" },
    });
    expect(twice.statusCode).toBe(409);

    const listed = await app.inject({ method: "GET", url: "/v1/feeds", headers: asOwner(tokenA) });
    const { feeds } = listed.json<{ feeds: { label: string; items: number }[] }>();
    expect(feeds).toHaveLength(1);
    expect(feeds[0]?.label).toBe("blog di prova");

    const audited = await db.select().from(auditLog).where(eq(auditLog.verb, "feed_added"));
    expect(audited.length).toBeGreaterThan(0);
  });

  it("un URL che non è http(s) viene rifiutato: niente file://, niente gopher", async () => {
    const refused = await app.inject({
      method: "POST",
      url: "/v1/feeds",
      headers: asOwner(tokenA),
      payload: { url: "file:///etc/passwd", label: "no" },
    });
    expect(refused.statusCode).toBe(400);
  });

  it("la lista del vicino non si vede, non si spegne e non si disdice (anti-BOLA)", async () => {
    const [mine] = await db
      .select({ id: rssFeeds.id })
      .from(rssFeeds)
      .where(eq(rssFeeds.accountId, houseA));
    if (mine === undefined) throw new Error("no feed");

    const listed = await app.inject({ method: "GET", url: "/v1/feeds", headers: asOwner(tokenB) });
    expect(listed.json<{ feeds: unknown[] }>().feeds).toHaveLength(0);

    const toggled = await app.inject({
      method: "PATCH",
      url: `/v1/feeds/${mine.id}`,
      headers: asOwner(tokenB),
      payload: { enabled: false },
    });
    expect(toggled.statusCode).toBe(404);

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/feeds/${mine.id}`,
      headers: asOwner(tokenB),
    });
    expect(removed.statusCode).toBe(404);
  });

  it("la disdetta porta via anche le novità scaricate: il cascade è la promessa", async () => {
    const [mine] = await db
      .select({ id: rssFeeds.id })
      .from(rssFeeds)
      .where(eq(rssFeeds.accountId, houseA));
    if (mine === undefined) throw new Error("no feed");
    await db.insert(feedItems).values({
      accountId: houseA,
      feedId: mine.id,
      guid: "x-1",
      title: "Una novità",
    });

    const gone = await app.inject({
      method: "DELETE",
      url: `/v1/feeds/${mine.id}`,
      headers: asOwner(tokenA),
    });
    expect(gone.statusCode).toBe(204);
    const leftovers = await db.select().from(feedItems).where(eq(feedItems.feedId, mine.id));
    expect(leftovers).toHaveLength(0);
  });
});
