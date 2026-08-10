import { parseArgs } from "node:util";
import { createDbClient } from "@ugo/db";
import { OllamaEmbeddingsClient } from "@ugo/memory";
import { EnvValidationError, parseDataKey, parseEnv } from "@ugo/shared";
import { z } from "zod";
import { ExportService } from "./services/privacy/exportService.js";
import { ForgetService, BeingNotFoundError } from "./services/privacy/forgetService.js";

/**
 * `ugo` operator CLI (PROGETTO §7): data-subject rights that must be
 * available without going through the HTTP surface.
 *   pnpm --filter soul ugo forget --being <uuid>
 *   pnpm --filter soul ugo export > anima.json
 */

const cliEnvSchema = z.object({
  DATABASE_URL: z.url(),
  UGO_DATA_KEY: z.string().min(1),
  OLLAMA_URL: z.url().optional(),
  OLLAMA_EMBED_MODEL: z.string().min(1).default("nomic-embed-text"),
});

const USAGE = `uso:
  ugo forget --being <uuid>    anonimizza irreversibilmente un essere del branco
  ugo export                   esporta tutti i dati in JSON (stdout)`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { being: { type: "string" }, yes: { type: "boolean", default: false } },
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
      const report = await new ForgetService({
        db,
        dataKey,
        ...(embedder !== undefined && { embedder }),
      }).forgetBeing(values.being);
      if (embedder === undefined) {
        console.error("attenzione: OLLAMA_URL assente — memorie non re-embeddate");
      }
      console.log(JSON.stringify({ forget_report: report }, null, 2));
      return 0;
    }
    if (command === "export") {
      const bundle = await new ExportService(db, dataKey).exportAll();
      console.log(JSON.stringify(bundle, null, 2));
      return 0;
    }
    console.error(USAGE);
    return 1;
  } catch (error) {
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
