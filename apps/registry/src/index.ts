import { createPrivateKey, createPublicKey } from "node:crypto";
import postgres from "postgres";
import { buildRegistry } from "./server.js";
import { ChainStore } from "./store.js";

/**
 * L'avvio del registrar (ADR-073). Fail-fast su ogni variabile mancante, come
 * ogni servizio di questo repository: un registro che parte senza la sua
 * chiave firmerebbe con niente, e se ne accorgerebbe qualcuno fra un anno.
 */

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`manca ${name}`);
  return value;
};

const databaseUrl = required("REGISTRY_DATABASE_URL");
const token = required("REGISTRY_TOKEN");
const registrarName = process.env.REGISTRY_NAME ?? "ugo-registrar";
const port = Number(process.env.PORT ?? 3100);

/** La chiave del registrar: PKCS#8 in base64, mai un file nel repository. */
const privateKey = createPrivateKey({
  key: Buffer.from(required("REGISTRY_SIGNING_KEY"), "base64"),
  format: "der",
  type: "pkcs8",
});
const registrarPublicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" });

const sql = postgres(databaseUrl, { max: 5 });
const store = new ChainStore(sql, privateKey.export({ format: "der", type: "pkcs8" }));
await store.migrate();

const app = buildRegistry({
  store,
  token,
  registrarPublicKey,
  registrarName,
  logger: true,
});

const shutdown = async (): Promise<void> => {
  await app.close();
  await sql.end();
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

await app.listen({ host: "0.0.0.0", port });
