import { accessTokens, corrections, gosini, rooms, slugOfRoom, type DbClient } from "@ugo/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuditLogger } from "../services/auditLog.js";
import type { PreHandler } from "./guard.js";
import { exemplarsOf, inAccount } from "./scope.js";
import { issueToken, revokeToken } from "../services/tenantAuth.js";

/**
 * Le chiavi di casa e le correzioni (ADR-100).
 *
 * Due cose che si facevano **solo in SQL**, e non per scelta:
 *
 * 1. **i token di casa**. Quelli dei clienti hanno rotte e pannello da
 *    ADR-052; quelli di casa — il telefono di chi ci vive, il dock in cucina,
 *    l'agente MCP — si emettevano entrando nel container. Un token che non si
 *    può revocare dall'interfaccia in cui ci si accorge del problema è una
 *    chiave che non si può cambiare: sai che è in giro e non puoi farci
 *    niente finché non trovi le credenziali del database.
 * 2. **le correzioni**. «Parli troppo forte» si dice (ADR-058) e finisce nel
 *    prompt di quella creatura per sempre: scrivibile e non leggibile, quindi
 *    né verificabile né ritirabile. Una cosa che cambia il carattere e che non
 *    si può guardare è la manopola che ADR-068 vieta, entrata dalla finestra.
 */

const newTokenSchema = z.object({
  label: z.string().min(1).max(80),
  role: z.enum(["owner", "member"]),
  /** giorni; assente = non scade, che è il default di chi vive qui */
  giorni: z.number().int().min(1).max(3650).optional(),
});

export interface KeysDeps {
  db: DbClient;
  guard: PreHandler;
  audit?: AuditLogger;
}

export function registerKeysRoutes(app: FastifyInstance, deps: KeysDeps): void {
  /** Le chiavi in giro: mai il valore, che non esiste da nessuna parte. */
  app.get("/v1/tokens", { preHandler: deps.guard }, async (request, reply) => {
    const rows = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      (db, accountId) =>
        db
          .select({
            id: accessTokens.id,
            label: accessTokens.label,
            role: accessTokens.role,
            createdAt: accessTokens.createdAt,
            lastUsedAt: accessTokens.lastUsedAt,
            expiresAt: accessTokens.expiresAt,
            revokedAt: accessTokens.revokedAt,
          })
          .from(accessTokens)
          .where(eq(accessTokens.accountId, accountId))
          .orderBy(desc(accessTokens.createdAt)),
    );
    if (rows === undefined) return reply;
    return reply.send({
      chiavi: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
      })),
    });
  });

  /**
   * Una chiave nuova. Il valore in chiaro esce **una volta sola**, come dal
   * CLI e come per i clienti: in database c'è solo lo SHA-256, e se si perde
   * si riemette — non si recupera.
   */
  app.post("/v1/tokens", { preHandler: deps.guard }, async (request, reply) => {
    const parsed = newTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid body", detail: z.prettifyError(parsed.error) });
    }
    const made = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const expiresAt =
          parsed.data.giorni === undefined
            ? undefined
            : new Date(Date.now() + parsed.data.giorni * 86_400_000);
        const issued = await issueToken(db, {
          accountId,
          role: parsed.data.role,
          label: parsed.data.label,
          ...(expiresAt !== undefined && { expiresAt }),
        });
        return { accountId, issued };
      },
    );
    if (made === undefined) return reply;
    await deps.audit?.record({
      verb: "token_issued",
      outcome: "ok",
      accountId: made.accountId,
      actor: request.tenant,
      resourceType: "token",
      resourceId: made.issued.id,
    });
    return reply.status(201).send({ id: made.issued.id, token: made.issued.token });
  });

  /**
   * Revocare. Non cancella la riga: una chiave revocata è un fatto della
   * casa, e sapere che c'era vale quanto sapere che non vale più.
   */
  app.delete("/v1/tokens/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const [mine] = await db
          .select({ id: accessTokens.id })
          .from(accessTokens)
          .where(and(eq(accessTokens.id, id), eq(accessTokens.accountId, accountId)));
        if (mine === undefined) return "missing" as const;
        /**
         * Revocare la PROPRIA chiave è concesso, e va detto: chi si accorge
         * che il telefono è stato rubato usa il pannello da un altro
         * dispositivo, e la chiave da bruciare potrebbe essere quella con cui
         * sta guardando. Impedirlo sarebbe proteggere la sessione invece
         * della casa.
         */
        await revokeToken(db, id);
        return { accountId };
      },
    );
    if (done === undefined) return reply;
    if (done === "missing") return reply.status(404).send({ error: "non esiste" });
    await deps.audit?.record({
      verb: "token_revoked",
      outcome: "ok",
      accountId: done.accountId,
      actor: request.tenant,
      resourceType: "token",
      resourceId: id,
    });
    return reply.status(204).send();
  });

  /** Cosa gli è stato detto di correggere, e da quando. */
  app.get("/v1/corrections", { preHandler: deps.guard }, async (request, reply) => {
    const asked = (request.query as { gosino?: string }).gosino;
    const rows = await inAccount(deps.db, request, reply, { requireAdmin: true }, (db, accountId) =>
      db
        .select({
          id: corrections.id,
          gosinoId: corrections.gosinoId,
          signal: corrections.signal,
          payload: corrections.payload,
          createdAt: corrections.createdAt,
          name: gosini.name,
        })
        .from(corrections)
        .innerJoin(gosini, eq(gosini.id, corrections.gosinoId))
        .where(
          asked === undefined || asked === ""
            ? inArray(corrections.gosinoId, exemplarsOf(db, accountId))
            : and(eq(corrections.gosinoId, asked), eq(gosini.accountId, accountId)),
        )
        .orderBy(desc(corrections.createdAt)),
    );
    if (rows === undefined) return reply;
    return reply.send({
      correzioni: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    });
  });

  /**
   * Ritirare una correzione: si cancella davvero.
   *
   * A differenza di un ricordo — che si invalida e resta, perché spiega cosa
   * UGO credeva (ADR-021) — una correzione **non è una cosa che UGO ha
   * pensato**: è un'istruzione che gli abbiamo dato. Ritirarla è tornare
   * sulla propria parola, e la propria parola si può ritirare.
   */
  app.delete("/v1/corrections/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const gone = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      (db, accountId) =>
        db
          .delete(corrections)
          .where(
            and(
              eq(corrections.id, id),
              inArray(corrections.gosinoId, exemplarsOf(db, accountId)),
            ),
          )
          .returning({ id: corrections.id }),
    );
    if (gone === undefined) return reply;
    if (gone.length === 0) return reply.status(404).send({ error: "non esiste" });
    return reply.status(204).send();
  });

  /**
   * `POST /v1/gosini/:id/reward` — la mela dal pannello, su una riga precisa.
   *
   * Il contratto del muso porta `reward.act` da ADR-058 «per chi *sa* cosa sta
   * premiando — il pannello, quando premia una riga precisa del registro delle
   * iniziative». Il campo esisteva, il bottone no: ogni mela arrivava con
   * `act` vuoto, e l'apprendimento dei gesti (`act_efficacy`) riceveva solo
   * «bravo in generale», che non insegna niente su COSA è piaciuto.
   */
  app.post("/v1/gosini/:id/reward", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z
      .object({ act: z.string().min(1).max(40).optional() })
      .safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const done = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const [who] = await db
          .select({ id: gosini.id })
          .from(gosini)
          .where(and(eq(gosini.id, id), eq(gosini.accountId, accountId)));
        if (who === undefined) return "missing" as const;
        // la stessa strada del muso: efficacia del gesto + legame con chi c'è
        const { EfficacyService } = await import("../services/volition/efficacy.js");
        const { RewardService } = await import("../services/volition/reward.js");
        const efficacy = new EfficacyService(db, id);
        await new RewardService({ db, gosinoId: id, accountId, efficacy }).give({
          ...(parsed.data.act !== undefined && { act: parsed.data.act }),
          at: new Date(),
        });
        return "given" as const;
      },
    );
    if (done === undefined) return reply;
    if (done === "missing") return reply.status(404).send({ error: "non esiste" });
    return reply.status(201).send({ premiato: true, act: parsed.data.act ?? null });
  });

  /**
   * `PATCH /v1/rooms/:id` — la stanza cambia nome (ADR-039).
   *
   * Chi ci vive **resta dov'è**: il nome è un'etichetta, non un posto nuovo.
   * Senza questa rotta un refuso nel nome della stanza si correggeva
   * cancellandola — e cancellarla sfratta tutti quelli che ci abitano.
   */
  app.patch("/v1/rooms/:id", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({ name: z.string().min(1).max(40) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid body" });
    const renamed = await inAccount(
      deps.db,
      request,
      reply,
      { requireAdmin: true },
      async (db, accountId) => {
        const [before] = await db
          .select({ name: rooms.name })
          .from(rooms)
          .where(and(eq(rooms.id, id), eq(rooms.accountId, accountId)));
        if (before === undefined) return "missing" as const;
        const wanted = parsed.data.name.trim();
        if (wanted === "") return "missing" as const;
        // l'unicità è sullo slug (ADR-039): due stanze che differiscono per
        // maiuscole sono una stanza con due grafie
        const slug = slugOfRoom(wanted);
        const [clash] = await db
          .select({ id: rooms.id })
          .from(rooms)
          .where(and(eq(rooms.accountId, accountId), eq(rooms.slug, slug)));
        if (clash !== undefined && clash.id !== id) return "clash" as const;
        await db.update(rooms).set({ name: wanted, slug }).where(eq(rooms.id, id));
        // chi ci vive porta l'etichetta addosso (`location_label`): senza
        // questo, rinominare la stanza sfrattava tutti in silenzio
        await db
          .update(gosini)
          .set({ locationLabel: wanted })
          .where(and(eq(gosini.accountId, accountId), eq(gosini.locationLabel, before.name)));
        return { from: before.name, to: wanted };
      },
    );
    if (renamed === undefined) return reply;
    if (renamed === "missing") return reply.status(404).send({ error: "non esiste" });
    if (renamed === "clash") {
      return reply.status(409).send({ error: "esiste già una stanza con quel nome" });
    }
    return reply.send(renamed);
  });
}
