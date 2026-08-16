import { parseArgs } from "node:util";
import { createDbClient, households, type DbClient } from "@ugo/db";
import { OllamaEmbeddingsClient } from "@ugo/memory";
import { EnvValidationError, parseDataKey, parseEnv } from "@ugo/shared";
import { eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { ExportService } from "./services/privacy/exportService.js";
import { createAuditLog } from "./services/auditLog.js";
import { createHousehold, HouseholdSlugTakenError } from "./services/householdService.js";
import { ForgetService, BeingNotFoundError } from "./services/privacy/forgetService.js";

/**
 * `ugo` operator CLI (PROGETTO §7): data-subject rights that must be
 * available without going through the HTTP surface.
 *   pnpm --filter soul ugo forget --being <uuid> --yes
 *   pnpm --filter soul ugo export > anima.json
 *
 * ADR-019 phase 2: both commands work on one house. `--casa` is optional only
 * while there is a single family on the install; with a neighbourhood it
 * becomes mandatory, because "all of them" is never what an operator means
 * when exporting or erasing.
 */

const cliEnvSchema = z.object({
  DATABASE_URL: z.url(),
  UGO_DATA_KEY: z.string().min(1),
  OLLAMA_URL: z.url().optional(),
  OLLAMA_EMBED_MODEL: z.string().min(1).default("nomic-embed-text"),
});

const USAGE = `uso:
  ugo forget --being <uuid> --yes [--casa <slug|uuid>]
                               anonimizza irreversibilmente un essere del branco
  ugo export [--casa <slug|uuid>]
                               esporta i dati di una casa in JSON (stdout)

  ugo casa nuova --slug <slug> --nome "<nome>" [--tz <fuso>] [--locale <it-IT>]
                 [--gosino <nome>] [--archetipo <nome>] [--tipo casa|azienda]
                               fa nascere un'organizzazione: chiave dati, primo
                               gosino, genoma e token del proprietario

  --casa   slug o uuid della casa. Obbligatorio se ce n'è più di una.`;

/** Resolves `--casa` to one house, or explains why it cannot. */
async function resolveHousehold(db: DbClient, casa: string | undefined): Promise<string> {
  if (casa !== undefined) {
    const [row] = await db
      .select({ id: households.id, slug: households.slug })
      .from(households)
      .where(or(eq(households.slug, casa), eq(households.id, casa)));
    if (row === undefined) throw new Error(`casa "${casa}" non trovata`);
    return row.id;
  }
  const open = await db
    .select({ id: households.id, slug: households.slug })
    .from(households)
    .where(isNull(households.closedAt))
    .limit(2);
  const only = open[0];
  if (open.length === 1 && only !== undefined) return only.id;
  if (open.length === 0) throw new Error("nessuna casa: esegui le migrazioni");
  throw new Error("ci sono più case: indica --casa <slug|uuid>");
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      being: { type: "string" },
      casa: { type: "string" },
      slug: { type: "string" },
      nome: { type: "string" },
      tz: { type: "string" },
      locale: { type: "string" },
      gosino: { type: "string" },
      archetipo: { type: "string" },
      tipo: { type: "string" },
      yes: { type: "boolean", default: false },
    },
  });
  const command = positionals[0];

  let env;
  try {
    env = parseEnv(cliEnvSchema);
  } catch (error) {
    console.error(error instanceof EnvValidationError ? error.message : error);
    return 1;
  }
  const db = createDbClient(env.DATABASE_URL);
  const dataKey = parseDataKey(env.UGO_DATA_KEY);

  try {
    if (command === "forget") {
      if (values.being === undefined) {
        console.error("errore: --being <uuid> è obbligatorio\n" + USAGE);
        return 1;
      }
      if (!values.yes) {
        // irreversible by design: make the operator say so out loud
        console.error("errore: l'oblio è irreversibile — ripeti con --yes per confermare");
        return 1;
      }
      const embedder =
        env.OLLAMA_URL !== undefined
          ? new OllamaEmbeddingsClient(env.OLLAMA_URL, env.OLLAMA_EMBED_MODEL)
          : undefined;
      const householdId = await resolveHousehold(db, values.casa);
      const report = await new ForgetService({
        db,
        dataKey,
        ...(embedder !== undefined && { embedder }),
      }).forgetBeing(values.being, householdId);
      // ADR-049: la riga vale anche da qui. Anzi soprattutto: dalla CLI non
      // c'e' nessun token, quindi `token_id` e `role` restano nulli — e
      // «qualcuno con una shell sul server» e' un'informazione, non un vuoto.
      await createAuditLog(db).record({
        verb: "forget",
        outcome: "ok",
        householdId,
        resourceType: "being",
        resourceId: values.being,
      });
      if (embedder === undefined) {
        console.error("attenzione: OLLAMA_URL assente — memorie non re-embeddate");
      }
      console.log(JSON.stringify({ forget_report: report }, null, 2));
      return 0;
    }
    if (command === "export") {
      const householdId = await resolveHousehold(db, values.casa);
      const bundle = await new ExportService(db, dataKey).exportAll(householdId);
      await createAuditLog(db).record({
        verb: "export",
        outcome: "ok",
        householdId,
        resourceType: "household",
        resourceId: householdId,
      });
      console.log(JSON.stringify(bundle, null, 2));
      return 0;
    }
    if (command === "casa" && positionals[1] === "nuova") {
      if (values.slug === undefined || values.nome === undefined) {
        console.error("errore: --slug e --nome sono obbligatori\n" + USAGE);
        return 1;
      }
      // ADR-061: casa o azienda, in italiano sulla riga di comando come nel
      // pannello — 'home'/'business' restano il vocabolario del database
      if (values.tipo !== undefined && values.tipo !== "casa" && values.tipo !== "azienda") {
        console.error('errore: --tipo accetta "casa" o "azienda"\n' + USAGE);
        return 1;
      }
      const born = await createHousehold(db, dataKey, {
        slug: values.slug,
        name: values.nome,
        ...(values.tz !== undefined && { timezone: values.tz }),
        ...(values.locale !== undefined && { locale: values.locale }),
        ...(values.gosino !== undefined && { gosinoName: values.gosino }),
        ...(values.archetipo !== undefined && { archetype: values.archetipo }),
        ...(values.tipo !== undefined && {
          kind: values.tipo === "azienda" ? ("business" as const) : ("home" as const),
        }),
      });
      const audit = createAuditLog(db);
      await audit.record({
        verb: "household_created",
        outcome: "ok",
        householdId: born.householdId,
        resourceType: "household",
        resourceId: born.householdId,
      });
      // del token resta scritto che ne e' stato emesso uno, e il suo id: mai il
      // segreto, che in database esiste solo come SHA-256
      await audit.record({
        verb: "token_issued",
        outcome: "ok",
        householdId: born.householdId,
        resourceType: "token",
        resourceId: born.tokenId,
      });

      // su stderr e non su stdout: stdout e' per i dati, e un token che finisce
      // dentro una pipe o un file di log e' un token da revocare
      console.error(`casa "${born.slug}" creata.`);
      console.error(`gosino: ${values.gosino ?? "ugo"} — ${born.persona}`);
      console.error("");
      console.error("Token del proprietario, mostrato UNA VOLTA SOLA:");
      console.error("");
      console.error(`  ${born.ownerToken}`);
      console.error("");
      console.error("In database c'è solo il suo SHA-256: se lo perdi, se ne emette un altro.");
      console.log(JSON.stringify({ householdId: born.householdId, gosinoId: born.gosinoId }));
      return 0;
    }
    console.error(USAGE);
    return 1;
  } catch (error) {
    if (error instanceof HouseholdSlugTakenError) {
      console.error(`errore: ${error.message}`);
      return 1;
    }
    if (error instanceof BeingNotFoundError) {
      console.error(`errore: essere ${values.being ?? ""} non trovato`);
      return 1;
    }
    console.error("errore:", error instanceof Error ? error.message : error);
    return 1;
  } finally {
    await db.$client.end();
  }
}

process.exit(await main());
