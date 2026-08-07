import { GenericContainer, type StartedTestContainer } from "testcontainers";

/**
 * Real Ollama for integration tests (Zero-Mock). Set UGO_TEST_OLLAMA_MODELS
 * to a host directory holding the model cache to run fully offline; without
 * it, the model is pulled on first run (network required, then Docker-cached
 * per volume lifetime).
 */

export const EMBED_MODEL = "nomic-embed-text";

export interface OllamaHandle {
  container: StartedTestContainer;
  baseUrl: string;
}

export async function startOllama(): Promise<OllamaHandle> {
  let builder = new GenericContainer("ollama/ollama").withExposedPorts(11434);
  const modelsDir = process.env.UGO_TEST_OLLAMA_MODELS;
  if (modelsDir !== undefined && modelsDir !== "") {
    builder = builder.withBindMounts([{ source: modelsDir, target: "/root/.ollama" }]);
  }
  const container = await builder.start();
  const baseUrl = `http://${container.getHost()}:${String(container.getMappedPort(11434))}`;

  const hasModel = async (): Promise<boolean> => {
    const response = await fetch(new URL("/api/tags", baseUrl));
    if (!response.ok) return false;
    const body = (await response.json()) as { models?: { name: string }[] };
    return (body.models ?? []).some((model) => model.name.startsWith(EMBED_MODEL));
  };

  if (!(await hasModel())) {
    const pull = await container.exec(["ollama", "pull", EMBED_MODEL]);
    if (pull.exitCode !== 0 || !(await hasModel())) {
      await container.stop();
      throw new Error(
        `ollama pull ${EMBED_MODEL} failed (exit ${String(pull.exitCode)}); ` +
          "set UGO_TEST_OLLAMA_MODELS to a cache dir or allow network access",
      );
    }
  }
  return { container, baseUrl };
}
