import { GenericContainer, type StartedTestContainer } from "testcontainers";

/** Real ephemeral S3 (MinIO) for integration tests. */

export interface MinioHandle {
  container: StartedTestContainer;
  endpoint: string;
  accessKey: string;
  secretKey: string;
}

/**
 * Dove sta MinIO, adesso che non sta più dove stava.
 *
 * `minio/minio` su Docker Hub **non esiste più**: il repository è stato
 * cancellato l'11 settembre 2026 e l'API risponde `404 object not found`. Non
 * è un tag ritirato — MinIO aveva chiuso le immagini community nell'ottobre
 * 2025 e archiviato il repo open source a febbraio 2026, e la cancellazione è
 * il seguito. Da quel giorno ogni test Zero-Mock che vuole un bucket muore nel
 * `beforeAll` con `pull access denied`.
 *
 * `quay.io/minio/minio`, che tutti indicano come destinazione, **non serve
 * pull anonimi** (401 anche col token anonimo in mano) e le sue immagini sono
 * congelate: non riceveranno più patch. Non è una destinazione.
 *
 * Questa è MinIO **vero**, ricostruito e patchato da Chainguard, e si scarica
 * senza credenziali. Conta che sia vero e non un emulatore: `s3mock`,
 * `s3proxy` e LocalStack farebbero passare i test contro un'imitazione
 * dell'API S3, che è precisamente ciò che la regola 1 vieta.
 *
 * Il costo, perché non resti una sorpresa: in anonimo Chainguard offre solo
 * `latest`, quindi l'immagine si muove sotto i piedi e questi test non sono
 * riproducibili nel tempo come con un tag pinnato. Il giorno in cui quel
 * `latest` rompe qualcosa, l'alternativa è un object storage reale con un tag
 * fisso (Garage, SeaweedFS) — al prezzo di riscrivere questo helper, perché
 * nessuno dei due parla la configurazione di MinIO.
 */
const MINIO_IMAGE = "cgr.dev/chainguard/minio:latest";

export async function startMinio(): Promise<MinioHandle> {
  const accessKey = "ugo-test";
  const secretKey = "ugo-test-secret";
  const local = process.env.UGO_TEST_S3_URL;
  if (local !== undefined && local !== "") return useLocalServer(local, accessKey, secretKey);
  const container = await new GenericContainer(MINIO_IMAGE)
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
