import { gosini, rooms, slugOfRoom, type DbClient } from "@ugo/db";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * The rooms of the house, as a catalogue (ADR-039).
 *
 * A room used to exist only while somebody stood in it, because it *was* the
 * string in `gosini.location_label`. This is the list itself, so an empty room
 * is a room — and so the panel can offer a list to pick from instead of a
 * text field that grows a new room out of every typo.
 *
 * `location_label` stays the room's **name**, because the name is the address
 * (`/?stanza=cucina`) that the body uses and the documentation promises. What
 * keeps the two from drifting is `named()`: nothing writes a label this does
 * not recognise.
 *
 * ADR-019 phase 2: every method takes the house. `create()` already did;
 * `list()`, `named()` and `remove()` did not — and `named()` is what validates
 * a birth and a move, so a kitchen next door would have vouched for a label
 * here. `remove()` was the worst of the three: it evicted by slug across
 * **every** house, so unmaking one family's "cucina" turned another family's
 * creature out of theirs.
 */
export class RoomCatalogue {
  public constructor(private readonly db: DbClient) {}

  /** Every room, with whoever lives in it — including the ones nobody does. */
  public async list(accountId: string): Promise<{ id: string; room: string; gosini: Resident[] }[]> {
    const known = await this.db
      .select({ id: rooms.id, name: rooms.name, slug: rooms.slug })
      .from(rooms)
      .where(eq(rooms.accountId, accountId))
      .orderBy(rooms.slug);
    const residents = await this.db
      .select({ id: gosini.id, name: gosini.name, where: gosini.locationLabel })
      .from(gosini)
      .where(and(isNull(gosini.retiredAt), eq(gosini.accountId, accountId)));

    const byRoom = new Map<string, Resident[]>();
    for (const row of residents) {
      const key = slugOfRoom(row.where ?? "");
      if (key === "") continue;
      byRoom.set(key, [...(byRoom.get(key) ?? []), { id: row.id, name: row.name }]);
    }
    return known.map((room) => ({
      id: room.id,
      room: room.name,
      gosini: byRoom.get(room.slug) ?? [],
    }));
  }

  /**
   * The room by that name, spelled the way the catalogue spells it.
   *
   * Returning the catalogue's spelling is the point: moving somebody to
   * "Cucina" has to store whatever the room is actually called, or the label
   * and the room drift apart by capital letter.
   */
  public async named(accountId: string, label: string): Promise<string | undefined> {
    const slug = slugOfRoom(label);
    if (slug === "") return undefined;
    const found = await this.db
      .select({ name: rooms.name })
      .from(rooms)
      .where(and(eq(rooms.accountId, accountId), eq(rooms.slug, slug)))
      .limit(1);
    return found[0]?.name;
  }

  /**
   * Make one, or hand back the one already there.
   *
   * Two rooms differing only in case are one room with two spellings, so the
   * slug is what collides — and a collision is not an error: asking for a room
   * that exists and getting it is what the owner meant.
   */
  public async create(
    accountId: string,
    name: string,
  ): Promise<{ id: string; room: string; created: boolean } | undefined> {
    const trimmed = name.trim();
    const slug = slugOfRoom(trimmed);
    if (slug === "") return undefined;

    const existing = await this.db
      .select({ id: rooms.id, name: rooms.name })
      .from(rooms)
      .where(and(eq(rooms.accountId, accountId), eq(rooms.slug, slug)))
      .limit(1);
    const already = existing[0];
    if (already !== undefined) return { id: already.id, room: already.name, created: false };

    const created = await this.db
      .insert(rooms)
      .values({ accountId, name: trimmed, slug })
      .returning({ id: rooms.id, name: rooms.name });
    const row = created[0];
    return row === undefined ? undefined : { id: row.id, room: row.name, created: true };
  }

  /**
   * Unmake one. Whoever lived there comes out of every room rather than
   * vanishing with it — the same state as a creature never given one.
   *
   * The eviction goes first on purpose: interrupted between the two writes,
   * the labels point at a room that still exists, which is recoverable. The
   * other order leaves them pointing at nothing.
   */
  public async remove(
    accountId: string,
    id: string,
  ): Promise<{ room: string; evicted: number } | undefined> {
    const found = await this.db
      .select({ name: rooms.name, slug: rooms.slug })
      .from(rooms)
      .where(and(eq(rooms.accountId, accountId), eq(rooms.id, id)))
      .limit(1);
    const room = found[0];
    if (room === undefined) return undefined;

    const evicted = await this.db
      .update(gosini)
      .set({ locationLabel: null })
      .where(
        and(
          eq(gosini.accountId, accountId),
          sql`lower(btrim(${gosini.locationLabel})) = ${room.slug}`,
        ),
      )
      .returning({ id: gosini.id });
    await this.db.delete(rooms).where(eq(rooms.id, id));
    return { room: room.name, evicted: evicted.length };
  }
}

interface Resident {
  id: string;
  name: string;
}
