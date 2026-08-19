import { GenericContainer, type StartedTestContainer } from "testcontainers";

/** Real ephemeral S3 (MinIO) for integration tests. */

export interface MinioHandle {
  container: StartedTestContainer;
  endpoint: string;
  accessKey: string;
  secretKey: string;
}

export async function startMinio(): Promise<MinioHandle> {
  const accessKey = "ugo-test";
  const secretKey = "ugo-test-secret";
  const local = process.env.UGO_TEST_S3_URL;
  if (local !== undefined && local !== "") return useLocalServer(local, accessKey, secretKey);
  const container = await new GenericContainer("minio/minio")
    .withEnvironment({ MINIO_ROOT_USER: accessKey, MINIO_ROOT_PASSWORD: secretKey })
    .withCommand(["server", "/data"])
    .withExposedPorts(9000)
    .start();
  return {
    container,
    endpoint: `http://${container.getHost()}:${String(container.getMappedPort(9000))}`,
    accessKey,
    secretKey,
  };
}

/**
 * Il ripiego per gli ambienti senza Docker, gemello di `UGO_TEST_PG_URL`: un
 * MinIO **vero** già acceso, dichiarato in `UGO_TEST_S3_URL`, con le stesse
 * credenziali che il container userebbe. Resta Zero-Mock — è lo stesso
 * server, avviato da fuori invece che da qui.
 *
 * L'isolamento fra un test e l'altro qui lo dà il **bucket**: ogni file di
 * test ne crea uno suo, come già faceva col container. `stop()` non spegne
 * niente, perché quel server non l'abbiamo acceso noi e potrebbe servire al
 * file successivo.
 */
function useLocalServer(endpoint: string, accessKey: string, secretKey: string): MinioHandle {
  return {
    // il cast è quello dichiarato in `postgres.helper.ts`, e per la stessa
    // ragione: dei container i test usano solo `stop()`
    container: { stop: () => Promise.resolve() } as unknown as StartedTestContainer,
    endpoint,
    accessKey,
    secretKey,
  };
}
