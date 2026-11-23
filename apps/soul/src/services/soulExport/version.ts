import { createRequire } from "node:module";

/**
 * The soul version written into an archive's manifest (`generator.version`),
 * read from this package's own `package.json` — present next to `dist/` in the
 * image and next to `src/` in development. "unknown" is a fine answer: the
 * manifest is for a human reading it later, nothing branches on it.
 */
export function generatorVersion(): string {
  try {
    const pkg = createRequire(import.meta.url)("../../../package.json") as { version?: unknown };
    return typeof pkg.version === "string" && pkg.version !== "" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
