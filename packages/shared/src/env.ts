import type { z } from "zod";

/**
 * Raised when the environment does not satisfy the given schema.
 * The message lists variable NAMES and the reason — never values
 * (values may be secrets; they must not reach logs).
 */
export class EnvValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * Parse an environment source against a Zod schema, fail-fast style.
 * Call this once at process boot; on failure the caller must exit(1).
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new EnvValidationError(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
