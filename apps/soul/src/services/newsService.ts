import { feedItems, rssFeeds, type DbClient } from "@ugo/db";
import { and, desc, eq } from "drizzle-orm";

/**
 * Cosa è arrivato dai feed (ADR-080).
 *
 * Il sogno li scarica da un pezzo e li tiene su `feed_items`, ma quello che il
 * proprietario poteva vedere erano **due contatori** sul pannello: «412 item,
 * 3 consigliati». Gli articoli veri non li leggeva nessuno finché UGO non
 * decideva di consigliarne uno.
 *
 * Qui non si decide niente: si guarda cosa c'è, dal più recente.
 */

export interface NewsRow {
  title: string;
  feed: string;
  link: string | null;
  publishedAt: string | null;
  /** ADR-058: se e quando è già diventato un consiglio suo */
  advisedAt: string | null;
}

const MAX_ITEMS = 50;

export class NewsService {
  public constructor(private readonly db: DbClient) {}

  /** A quanti feed **accesi** è iscritta la casa: zero è una risposta diversa da «niente di nuovo». */
  public async subscribed(householdId: string): Promise<number> {
    const rows = await this.db
      .select({ id: rssFeeds.id })
      .from(rssFeeds)
      .where(and(eq(rssFeeds.householdId, householdId), eq(rssFeeds.enabled, true)));
    return rows.length;
  }

  /**
   * Gli ultimi arrivati, col nome del feed da cui vengono. Ordinati per data di
   * pubblicazione quando c'è: un feed che ripubblica vecchi articoli non deve
   * scavalcare la cronaca di stamattina solo perché l'abbiamo scaricato dopo.
   */
  public async latest(householdId: string, limit = 10): Promise<NewsRow[]> {
    const rows = await this.db
      .select({
        title: feedItems.title,
        link: feedItems.link,
        publishedAt: feedItems.publishedAt,
        advisedAt: feedItems.advisedAt,
        createdAt: feedItems.createdAt,
        feed: rssFeeds.label,
      })
      .from(feedItems)
      .innerJoin(rssFeeds, eq(feedItems.feedId, rssFeeds.id))
      .where(and(eq(feedItems.householdId, householdId), eq(rssFeeds.enabled, true)))
      .orderBy(desc(feedItems.publishedAt), desc(feedItems.createdAt))
      .limit(Math.min(MAX_ITEMS, Math.max(1, limit)));

    return rows.map((row) => ({
      title: row.title,
      feed: row.feed,
      link: row.link,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      advisedAt: row.advisedAt?.toISOString() ?? null,
    }));
  }
}
