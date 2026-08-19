import { gosini, traitSets, type DbClient } from "@ugo/db";
import { expressedTraits, GENE_CATALOG, GENE_KEYS, hiddenAllele } from "@ugo/psyche";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { genomeFromStoredTraits } from "../services/genetics.js";
import type { PreHandler } from "./guard.js";
import { inAccount } from "./scope.js";

/**
 * Il genoma, riletto (ADR-105).
 *
 * Si sceglieva alla nascita e non si rileggeva più: `trait_sets` era visibile
 * per un istante nel modulo della nascita e poi spariva, quindi «perché è
 * fatto così?» e «cosa passerà ai figli?» erano domande senza risposta a meno
 * di aprire psql e sapere leggere un jsonb.
 *
 * **In sola lettura, e non è una limitazione: è la regola 13.** Un carattere
 * che si regola è un'impostazione, e una creatura con le impostazioni è un
 * prodotto. Qui non c'è nessuna scrittura, e non ci sarà.
 *
 * La cosa che questa vista aggiunge davvero è **quello che una creatura porta
 * e non mostra**: un allele recessivo coperto non si vede addosso e passa ai
 * figli lo stesso. È la spiegazione di come da due genitori senza chiazze
 * nasca un cucciolo a chiazze — un fatto che il motore calcolava da ADR-068 e
 * che nessuno poteva guardare.
 */

export interface GenomeRoutesDeps {
  db: DbClient;
  guard: PreHandler;
}

export function registerGenomeRoutes(app: FastifyInstance, deps: GenomeRoutesDeps): void {
  app.get("/v1/gosini/:id/genome", { preHandler: deps.guard }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const found = await inAccount(deps.db, request, reply, {}, async (db, accountId) => {
      const [who] = await db
        .select({
          id: gosini.id,
          name: gosini.name,
          generation: gosini.generation,
          origin: gosini.origin,
        })
        .from(gosini)
        .where(and(eq(gosini.id, id), eq(gosini.accountId, accountId)));
      if (who === undefined) return "missing" as const;

      /**
       * L'ultima versione, e **le altre si contano**. Il genoma è immutabile
       * (ADR-015: una modifica è una versione nuova, non una correzione), e un
       * esemplare con più di una versione è un fatto che chi guarda deve poter
       * vedere invece di doverlo dedurre.
       */
      const versions = await db
        .select({
          version: traitSets.version,
          traits: traitSets.traits,
          note: traitSets.mutationNote,
          at: traitSets.createdAt,
        })
        .from(traitSets)
        .where(eq(traitSets.gosinoId, id))
        .orderBy(desc(traitSets.version));
      const latest = versions[0];
      if (latest === undefined) return "no-genome" as const;
      return { who, latest, versions: versions.length };
    });
    if (found === undefined) return reply;
    if (found === "missing") return reply.status(404).send({ error: "non esiste" });
    if (found === "no-genome")
      return reply.status(404).send({ error: "nessun genoma", detail: "nessun genoma scritto" });

    const genome = genomeFromStoredTraits(found.latest.traits, found.who.id);
    const expressed = expressedTraits(genome);
    const genes = GENE_KEYS.map((key) => {
      const alleles = genome.alleles[key];
      const hidden = hiddenAllele(key, alleles);
      return {
        key,
        expression: GENE_CATALOG[key].expression,
        alleles,
        expressed: expressed[key],
        // `undefined` quando mostra tutto quello che ha
        ...(hidden !== undefined && { hidden }),
      };
    });

    return reply.send({
      gosino: found.who,
      ceppo: genome.ceppo,
      version: found.latest.version,
      versions: found.versions,
      writtenAt: found.latest.at,
      // «cucciolata seed=… cucciolo=…» per chi è nato: da dove viene questo genoma
      ...(found.latest.note !== null && { note: found.latest.note }),
      genes,
    });
  });
}
