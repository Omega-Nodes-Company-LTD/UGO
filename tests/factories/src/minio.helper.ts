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
