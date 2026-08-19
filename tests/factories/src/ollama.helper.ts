import { GenericContainer, type StartedTestContainer } from "testcontainers";

/**
 * Real Ollama for integration tests (Zero-Mock). Set UGO_TEST_OLLAMA_MODELS
 * to a host directory holding the model cache to run fully offline; without
 * it, the model is pulled on first run (network required, then Docker-cached
 * per volume lifetime).
 */

export const EMBED_MODEL = "nomic-embed-text";
/**
 * ADR-107: il modello di TESTO per il giudice dell'astensione.
 *
 * Piccolo apposta (~1 GB): il giudice risponde una parola, non scrive un
 * racconto, e un modello grosso in CI si paga a ogni run che non trova la
 * cache. Non è il modello di casa in produzione — lì decide
 * `OLLAMA_CHAT_MODEL` — è il più piccolo su cui la misura abbia senso.
 */
export const TEXT_MODEL = "qwen2.5:1.5b";

export interface OllamaHandle {
  container: StartedTestContainer;
  baseUrl: string;
}

export interface OllamaOptions {
  /** quali modelli servono. Di default solo l'embedder, com'era prima. */
  models?: readonly string[];
}

export async function startOllama(options: OllamaOptions = {}): Promise<OllamaHandle> {
  let builder = new GenericContainer("ollama/ollama").withExposedPorts(11434);
  const modelsDir = process.env.UGO_TEST_OLLAMA_MODELS;
  if (modelsDir !== undefined && modelsDir !== "") {
    builder = builder.withBindMounts([{ source: modelsDir, target: "/root/.ollama" }]);
  }
  const container = await builder.start();
  const baseUrl = `http://${container.getHost()}:${String(container.getMappedPort(11434))}`;

  const hasModel = async (wanted: string): Promise<boolean> => {
    const response = await fetch(new URL("/api/tags", baseUrl));
    if (!response.ok) return false;
    const body = (await response.json()) as { models?: { name: string }[] };
    // `startsWith` sul nome intero: `qwen2.5:1.5b` e `qwen2.5:3b` cominciano
    // uguali fino ai due punti, e confrontare solo la famiglia direbbe di sì
    // per il modello sbagliato
    return (body.models ?? []).some((model) => model.name.startsWith(wanted));
  };

  for (const wanted of options.models ?? [EMBED_MODEL]) {
    if (await hasModel(wanted)) continue;
    const pull = await container.exec(["ollama", "pull", wanted]);
    if (pull.exitCode !== 0 || !(await hasModel(wanted))) {
      await container.stop();
      throw new Error(
        `ollama pull ${wanted} failed (exit ${String(pull.exitCode)}); ` +
          "set UGO_TEST_OLLAMA_MODELS to a cache dir or allow network access",
      );
    }
  }
  return { container, baseUrl };
}
