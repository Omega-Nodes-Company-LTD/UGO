import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EnvValidationError, parseEnv } from "./env.js";

// parseEnv is a pure parsing function (no I/O when given an explicit source):
// unit testing is allowed here per TESTING_PLAYBOOK §1.

const schema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
});

describe("parseEnv", () => {
  it("returns typed values for a valid source", () => {
    const env = parseEnv(schema, {
      DATABASE_URL: "postgres://ugo:secret@postgres:5432/ugo",
      PORT: "8080",
    });
    expect(env.DATABASE_URL).toBe("postgres://ugo:secret@postgres:5432/ugo");
    expect(env.PORT).toBe(8080);
  });

  it("applies defaults for optional variables", () => {
    const env = parseEnv(schema, {
      DATABASE_URL: "postgres://ugo:secret@postgres:5432/ugo",
    });
    expect(env.PORT).toBe(3000);
  });

  it("fails fast listing the offending variable names", () => {
    expect(() => parseEnv(schema, {})).toThrow(EnvValidationError);
    expect(() => parseEnv(schema, {})).toThrow(/DATABASE_URL/);
  });

  it("never leaks variable values in the error message", () => {
    const secret = "postgres://ugo:SUPERSECRET@host:5432/ugo";
    let message = "";
    try {
      parseEnv(z.object({ DATABASE_URL: z.url(), MISSING_VAR: z.string() }), {
        DATABASE_URL: secret,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("MISSING_VAR");
    expect(message).not.toContain("SUPERSECRET");
  });
});
