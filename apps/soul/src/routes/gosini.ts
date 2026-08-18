import { gosini, traitSets, type DbClient } from "@ugo/db";
import { lifeAt } from "@ugo/psyche";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ARCHETYPES, characterFrom, traitsSchema } from "../services/council/character.js";
import { drawLifeJitter } from "../services/lifeDice.js";
import { guardBreeding } from "./breeding.js";
import { RoomCatalogue } from "../services/roomCatalogue.js";
import type { PreHandler } from "./guard.js";
import { householdScope } from "./scope.js";

/**
 * The population: who exists, who is born, and which room they live in
 * (ADR-031, ADR-036).
 *
 * Split out of the council routes because they were never the same thing:
 * moving somebody between rooms was reachable only on a server that had a
 * council configured, which is an unrelated feature. Guarded — creating a
 * creature and deciding which screen shows him are both things a stray request
 * must not be able to do.
 */

const newGosinoSchema = z.object({
  name: z.string().min(1).max(40),
  locationLabel: z.string().min(1).max(40).optional(),
  /** a ready-made character, or nothing for a plain one */
  archetype: z.enum(["curiosone", "pigrone", "affettuoso", "brontolone", "timidone"]).optional(),
  /** explicit dials, which win over the archetype */
  traits: traitsSchema.partial().optional(),
});

/** ADR-077: il pelo in tre gradini, che è come lo si guarda. */
function coatOf(greying: number): "scuro" | "brizzolato" | "grigio" {
  if (greying <= 0) return "scuro";
  return greying < 0.5 ? "brizzolato" : "grigio";
}

/** ADR-036: moving one between rooms. An empty label takes him out of every room. */
const moveSchema = z.object({ locationLabel: z.string().max(40) });

/** ADR-039: making a room, which is now a thing and not a spelling. */
const newRoomSchema = z.object({ name: z.string().min(1).max(40) });

export interface GosiniRoutesDeps {
  db: DbClient;
  /** the household every new exemplar is born into (ADR-019) */
  guard: PreHandler;
  /**
   * ADR-035/036: a newborn with no runtime, or a mover whose room the registry
   * has not heard about, is worse than an error. `resolve()` falls back to the
   * eldest, so without a reload the panel answers about the new one with the
   * old one's mood — and a moved creature keeps appearing on the old dock.
   */
  registry?: { reload: () => Promise<void> };
}

export function registerGosiniRoutes(app: FastifyInstance, deps: GosiniRoutesDeps): void {
  const catalogue = new RoomCatalogue(deps.db);

  /**
   * The rooms, and who is in them (ADR-037). **Not guarded**, unlike everything
   * else in this file, because the body needs it and the body has no operator
   * token: a dock must be able to offer "which room am I?" without one.
   *
   * What it exposes is room labels and creature names — the same class of thing
   * `whoami` has always sent down an unguarded socket on this tailnet. It says
   * nothing about the household: no people, no memories, no spend.
   *
   * ADR-039: the catalogue is the source, not the residents. A room the owner
   * made and has not filled yet is still a room you can point a screen at.
   */
  app.get("/v1/rooms", async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    return reply.send({ rooms: await catalogue.list(householdId) });
  });

  /** Making a room (ADR-039). Guarded: `GET` is for the body, this is not. */
  app.post("/v1/rooms", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = newRoomSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const made = await catalogue.create(householdId, parsed.data.name);
    if (made === undefined) return reply.status(400).send({ error: "invalid body" });
    return reply.status(made.created ? 201 : 200).send(made);
  });

  /**
   * Unmaking one (ADR-039). Whoever lived there comes out of every room rather
   * than disappearing with it.
   */
  app.delete("/v1/rooms/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const gone = await catalogue.remove(householdId, id);
    if (gone === undefined) return reply.status(404).send({ error: "non esiste" });
    // the registry holds `where`: a creature evicted here must stop being
    // handed to the dock that used to show him
    await deps.registry?.reload();
    return reply.send(gone);
  });

  app.post("/v1/gosini", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = newGosinoSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    /**
     * ADR-081: **un gosino non si crea, si riceve**. Questa porta resta, ma è
     * la porta dell'allevamento fondatore — l'unico posto in cui una creatura
     * può cominciare a esistere senza genitori. Per tutti gli altri il modo di
     * avere un gosino è adottarne uno nato, e sceglierlo fra quelli che ci sono.
     */
    if (!(await guardBreeding(deps.db, householdId, "conia", reply))) return reply;
    const { name, locationLabel, archetype, traits } = parsed.data;

    // ADR-039: a room he is born into has to be one that exists. Silently
    // creating it here would have made the catalogue grow by typo — and, since
    // ADR-019 phase 2, one that exists *in this house*: the neighbours' kitchen
    // used to vouch for a label here.
    let where: string | undefined;
    if (locationLabel !== undefined) {
      where = await catalogue.named(householdId, locationLabel);
      if (where === undefined) return reply.status(400).send({ error: "stanza sconosciuta" });
    }

    // explicit dials win over the archetype, which wins over the plain default
    const merged = { ...(archetype === undefined ? {} : ARCHETYPES[archetype]), ...traits };
    const character = characterFrom(merged);

    const created = await deps.db
      .insert(gosini)
      .values({
        householdId,
        name,
        // ADR-077: nascere a mano è comunque nascere da qui in avanti. La
        // porta di servizio della nascita non è la porta dell'immortalità:
        // `mortal_from = null` resta soltanto per chi c'era già
        mortalFrom: new Date(),
        lifeJitterDays: drawLifeJitter(),
        // coniato, non nato: è il punto zero di una linea, e non si vende
        origin: "capostipite",
        ...(where !== undefined && { locationLabel: where }),
      })
      .returning({ id: gosini.id });
    const id = created[0]?.id;
    if (id === undefined) return reply.status(500).send({ error: "not created" });

    // version 1 of the genome, immutable from here: a change is a new version
    await deps.db.insert(traitSets).values({
      householdId,
      gosinoId: id,
      version: 1,
      traits: character.traits,
      mutationNote: archetype === undefined ? "nato a mano" : `archetipo: ${archetype}`,
    });

    // he exists in the database; now give him an apparatus to be himself with
    await deps.registry?.reload();

    return reply.status(201).send({
      id,
      name,
      persona: character.persona,
      ...(where !== undefined && { where }),
    });
  });

  app.get("/v1/gosini", { preHandler: deps.guard }, async (request, reply) => {
    const householdId = await householdScope(deps.db, request, reply);
    if (householdId === undefined) return reply;
    const rows = await deps.db
      .select({
        id: gosini.id,
        name: gosini.name,
        where: gosini.locationLabel,
        bornAt: gosini.bornAt,
        mortalFrom: gosini.mortalFrom,
        jitter: gosini.lifeJitterDays,
        // ADR-081/082: da dove viene — e quindi se può essere ceduto
        origin: gosini.origin,
        noticedAt: gosini.deathNoticeAt,
      })
      .from(gosini)
      .where(eq(gosini.householdId, householdId));
    const now = new Date();
    const out = [];
    for (const row of rows) {
      const traits = await deps.db
        .select({ traits: traitSets.traits })
        .from(traitSets)
        .where(eq(traitSets.gosinoId, row.id))
        .limit(1);
      const character = characterFrom(traits[0]?.traits);
      // ADR-071: l'età non si conserva, si calcola da `born_at` e dal genoma
      /**
       * ADR-077: **la data della morte non si dice.** `fraction` e
       * `plasticity` erano qui da poche ore (ADR-071) e da una qualunque
       * delle due si ricavava la vita attesa con una divisione — quindi il
       * giorno. Restano i giorni vissuti e lo stadio, che sono ciò che si
       * vede guardando un animale.
       *
       * L'arco corre da `mortal_from`, non dalla nascita: un capostipite che
       * non ha ancora accettato la mortalità non ha età da mostrare.
       *
       * Il dado (`life_jitter_days`) entra nel calcolo e **non esce**: serve a
       * far sì che la vita non sia una funzione del genoma, non a essere letto.
       */
      const mortalFrom = row.mortalFrom;
      const life =
        mortalFrom === null
          ? undefined
          : lifeAt(mortalFrom, now, character.traits.longevity, row.jitter ?? 0);
      out.push({
        id: row.id,
        name: row.name,
        where: row.where,
        persona: character.persona,
        mortal: mortalFrom !== null,
        origin: row.origin,
        /** ADR-077: che il preavviso sia stato dato, non quando finisce */
        farewellNotice: row.noticedAt !== null,
        age:
          life === undefined
            ? undefined
            : {
                days: Math.floor(life.ageDays),
                stage: life.stage,
                /**
                 * Il pelo a parole e non a numero. `greying` era un numero
                 * fra 0 e 1 proporzionale alla frazione di vita: da lui e dai
                 * giorni si ricavava la vita attesa con una divisione,
                 * esattamente come da `fraction`. Tre gradini sono ciò che si
                 * vede guardando l'animale — e guardare l'animale è la stima
                 * che ADR-077 concede apertamente.
                 */
                coat: coatOf(life.greying),
              },
      });
    }
    return reply.send({ gosini: out });
  });

  /**
   * Moving a creature to another room (ADR-036).
   *
   * The room is what a device shows, so this is the one control that decides
   * who appears where. It is a PATCH and not part of the birth form on purpose:
   * where somebody lives changes, and the genome does not.
   */
  app.patch("/v1/gosini/:id", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = moveSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const { id } = request.params as { id: string };
    const householdId = await householdScope(deps.db, request, reply, { requireAdmin: true });
    if (householdId === undefined) return reply;
    const asked = parsed.data.locationLabel.trim();

    // ADR-039: empty still means "out of every room"; anything else has to name
    // a room that exists, and is stored the way the catalogue spells it
    let room: string | null = null;
    if (asked !== "") {
      const known = await catalogue.named(householdId, asked);
      if (known === undefined) return reply.status(400).send({ error: "stanza sconosciuta" });
      room = known;
    }

    const moved = await deps.db
      .update(gosini)
      .set({ locationLabel: room })
      .where(and(eq(gosini.id, id), eq(gosini.householdId, householdId)))
      .returning({ id: gosini.id, name: gosini.name, where: gosini.locationLabel });
    const row = moved[0];
    if (row === undefined) return reply.status(404).send({ error: "non esiste" });

    // the registry holds `where`, and it is what a socket asks when a device
    // says which room it is the body of: stale here means the dock keeps
    // showing the old room's occupants until a restart
    await deps.registry?.reload();
    return reply.send(row);
  });
}
