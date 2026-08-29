import { describe, expect, it } from "vitest";
import { appDatabaseUrl, audioStorageFromEnv, soulEnvSchema } from "./env.js";

/**
 * Pure configuration logic, so a unit test is the honest place for it
 * (TESTING_PLAYBOOK §1). What it protects is the first deploy: soul refused
 * to boot because the variables were named the way every S3 provider's
 * console names them, and not the way this file used to insist on.
 */

const base = {
  DATABASE_URL: "postgres://u:p@db:5432/ugo",
  OLLAMA_URL: "http://ollama:11434",
  ANTHROPIC_API_KEY: "k",
  UGO_DATA_KEY: "x".repeat(44),
};

const parse = (extra: Record<string, string>) =>
  soulEnvSchema.parse({ ...base, ...extra });

describe("appDatabaseUrl — il flip di RLS (ADR-062 tempo 2b)", () => {
  it("sceglie DATABASE_URL_APP quando impostata (il servizio parla come ugo_app)", () => {
    expect(
      appDatabaseUrl(parse({ DATABASE_URL_APP: "postgres://ugo_app:p@db:5432/ugo" })),
    ).toBe("postgres://ugo_app:p@db:5432/ugo");
  });

  it("senza DATABASE_URL_APP resta sull'owner (il muro è inerte)", () => {
    expect(appDatabaseUrl(parse({}))).toBe("postgres://u:p@db:5432/ugo");
  });

  it("tratta la stringa vuota come assente (compose passa i default vuoti)", () => {
    expect(appDatabaseUrl(parse({ DATABASE_URL_APP: "" }))).toBe("postgres://u:p@db:5432/ugo");
  });
});

describe("S3 configuration", () => {
  it("accepts the AWS-conventional names every provider console shows", () => {
    const storage = audioStorageFromEnv(
      parse({
        S3_ENDPOINT: "https://fsn1.your-objectstorage.com",
        S3_ACCESS_KEY_ID: "AKIA",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_BUCKET_AUDIO: "ugo-audio",
        S3_REGION: "fsn1",
      }),
    );
    expect(storage).toEqual({
      endpoint: "https://fsn1.your-objectstorage.com",
      accessKey: "AKIA",
      secretKey: "secret",
      bucket: "ugo-audio",
      // Hetzner rejects a wrong region, so it must travel with the rest
      region: "fsn1",
    });
  });

  it("still accepts the short names, and prefers them when both are set", () => {
    const storage = audioStorageFromEnv(
      parse({
        S3_ENDPOINT: "https://s3.example",
        S3_ACCESS_KEY: "short",
        S3_ACCESS_KEY_ID: "long",
        S3_SECRET_KEY: "shortsecret",
        S3_BUCKET_AUDIO: "b",
      }),
    );
    expect(storage?.accessKey).toBe("short");
    expect(storage?.region).toBe("us-east-1");
  });

  it("treats nothing configured as audio upload simply being off", () => {
    expect(audioStorageFromEnv(parse({}))).toBeUndefined();
  });

  it("names the missing variables instead of listing all of them", () => {
    expect(() =>
      audioStorageFromEnv(
        parse({ S3_ENDPOINT: "https://s3.example", S3_ACCESS_KEY_ID: "AKIA" }),
      ),
    ).toThrow(/mancano .*S3_SECRET_KEY.*S3_BUCKET_AUDIO/s);
  });

  it("never puts a secret in the error text", () => {
    try {
      audioStorageFromEnv(parse({ S3_ENDPOINT: "https://s3.example", S3_SECRET_ACCESS_KEY: "hunter2" }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain("hunter2");
    }
  });
});
