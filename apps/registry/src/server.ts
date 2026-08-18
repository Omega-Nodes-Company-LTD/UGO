import { timingSafeEqual } from "node:crypto";
import { ACT_KINDS, verifyBirth, type Act, type BirthCertificate } from "@ugo/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { ChainStore } from "./store.js";

/**
 * Il registrar (ADR-073): riceve atti, li mette in catena, e lascia che
 * chiunque verifichi.
 *
 * La lettura è **pubblica** di proposito: un libro genealogico che si può
 * consultare solo col permesso di chi lo tiene non è un libro genealogico. La
 * scrittura no: presentare un atto richiede il token del registrar.
 *
 * Sulla catena non c'è nessuna persona — solo id di creature, impronte e
 * firme — e per questo la lettura pubblica non è una fuga di dati.
 */

const parentSchema = z.object({
  gosinoId: z.uuid(),
  publicKey: z.string().min(1),
  signature: z.string().min(1),
});

const actSchema = z.object({
  kind: z.enum(ACT_KINDS),
  gosinoId: z.uuid(),
  genomeHash: z.string().regex(/^[0-9a-f]{64}$/),
  parents: z.array(parentSchema).min(1).max(4).optional(),
  at: z.iso.datetime(),
  // ADR-082: la custodia, in forma opaca — mai un nome, mai una persona
  fromHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  toHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  generation: z.number().int().min(0).max(10_000).optional(),
});

export interface RegistryServerOptions {
  store: ChainStore;
  /** chi può PRESENTARE atti; leggere non richiede niente */
  token: string;
  registrarPublicKey: Buffer;
  registrarName: string;
  logger?: boolean;
}

const sameSecret = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function buildRegistry(options: RegistryServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  const authorized = (request: { headers: Record<string, unknown> }): boolean => {
    const header = request.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
    return sameSecret(header.slice(7), options.token);
  };

  app.get("/health", async (_request, reply) => {
    const head = await options.store.head();
    return reply.send({
      status: "ok",
      registrar: options.registrarName,
      publicKey: options.registrarPublicKey.toString("base64"),
      head: head ?? null,
    });
  });

  /** La testa: quello che un peer scarica per testimoniare. */
  app.get("/head", async (_request, reply) => {
    const head = await options.store.head();
    return reply.send({
      registrar: options.registrarName,
      publicKey: options.registrarPublicKey.toString("base64"),
      ...(head ?? { seq: 0, hash: null }),
    });
  });

  /** La catena, camminabile da chiunque. */
  app.get("/chain", async (request, reply) => {
    const query = request.query as { from?: string; limit?: string };
    const from = Number(query.from ?? 1);
    const limit = Number(query.limit ?? 200);
    return reply.send({
      entries: await options.store.entries(
        Number.isFinite(from) && from > 0 ? from : 1,
        Number.isFinite(limit) && limit > 0 ? limit : 200,
      ),
    });
  });

  /** Gli atti di una creatura: il pedigree, verificabile senza di noi. */
  app.get("/acts/:gosinoId", async (request, reply) => {
    const { gosinoId } = request.params as { gosinoId: string };
    return reply.send({ entries: await options.store.actsFor(gosinoId) });
  });

  app.post("/acts", async (request, reply) => {
    if (!authorized(request)) return reply.status(401).send({ error: "non autorizzato" });
    const parsed = actSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "atto non valido" });
    // `exactOptionalPropertyTypes`: le chiavi assenti restano assenti, invece
    // di diventare `undefined` — che cambierebbe l'impronta dell'atto
    const { parents, generation, fromHash, toHash, ...rest } = parsed.data;
    const act: Act = {
      ...rest,
      ...(parents !== undefined && { parents }),
      ...(generation !== undefined && { generation }),
      ...(fromHash !== undefined && { fromHash }),
      ...(toHash !== undefined && { toHash }),
    };

    /**
     * Una nascita entra in catena solo se **i genitori l'hanno firmata**
     * (ADR-070). Il registro non è la fonte della fiducia: la fiducia sta
     * nelle creature, e il registro certifica l'ordine, non la parentela.
     */
    if (act.kind === "birth") {
      const parents = act.parents ?? [];
      if (parents.length === 0) {
        return reply.status(422).send({ error: "una nascita senza genitori non si registra" });
      }
      const certificate: BirthCertificate = {
        childId: act.gosinoId,
        genomeHash: act.genomeHash,
        parentIds: parents.map((parent) => parent.gosinoId),
        bornAt: act.at,
        generation: act.generation ?? 0,
      };
      const allSigned = parents.every((parent) =>
        verifyBirth(
          certificate,
          Buffer.from(parent.signature, "base64"),
          Buffer.from(parent.publicKey, "base64"),
        ),
      );
      if (!allSigned) {
        return reply.status(422).send({ error: "firme dei genitori non valide" });
      }
    }

    /**
     * ADR-082 — le due regole che rendono la cessione una legge della specie
     * invece di una regola del server di qualcuno.
     *
     * 1. **Si cedono solo i nati.** Non lo si chiede al venditore: lo si
     *    guarda in catena. Nessun atto di nascita ⇒ è un capostipite (o
     *    un'ombra), e un capostipite è l'inizio di una stirpe, non merce.
     * 2. **La custodia è una catena.** Chi cede deve essere chi teneva. Un
     *    allevamento che vende due volte lo stesso cucciolo presenta un
     *    secondo atto la cui provenienza non è più la custodia corrente — ed
     *    è esattamente la doppia vendita, vista da chiunque.
     */
    if (act.kind === "transfer") {
      if (act.toHash === undefined) {
        return reply.status(422).send({ error: "una cessione senza destinatario non si registra" });
      }
      if (!(await options.store.wasBorn(act.gosinoId))) {
        return reply
          .status(422)
          .send({ error: "si cedono solo i nati: di questa creatura non c'è atto di nascita" });
      }
      const holder = await options.store.holderOf(act.gosinoId);
      if (holder !== undefined && holder !== act.fromHash) {
        return reply
          .status(409)
          .send({ error: "questa creatura è già stata ceduta a qualcun altro" });
      }
    }

    const entry = await options.store.append(act);
    if (entry === undefined) {
      // già in catena: non è un errore, è una richiesta già soddisfatta
      return reply.status(200).send({ alreadyRegistered: true });
    }
    return reply.status(201).send({ entry });
  });

  /** Il gossip: un altro registrar dice cosa ha visto della propria catena. */
  app.post("/witness", async (request, reply) => {
    const parsed = z
      .object({
        registrar: z.string().min(1).max(120),
        seq: z.number().int().min(0),
        hash: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "testimonianza non valida" });
    await options.store.witness(parsed.data.registrar, parsed.data.seq, parsed.data.hash);
    return reply.status(201).send({ recorded: true });
  });

  app.get("/witnesses", async (_request, reply) => {
    return reply.send({ witnesses: await options.store.witnesses() });
  });

  return app;
}
