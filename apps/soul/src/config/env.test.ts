import { DEFAULT_CHAT_MODEL, DEFAULT_PROVIDERS, DEFAULT_TTS_MODEL } from "@ugo/memory";
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
  OPENROUTER_API_KEY: "k",
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

/**
 * ADR-125: OpenRouter è l'unico fornitore a pagamento. La chiave è
 * obbligatoria, i default sono quelli misurati, e i nomi ritirati fermano il
 * boot invece di essere ignorati in silenzio.
 */
describe("OpenRouter, unico varco (ADR-125)", () => {
  it("senza OPENROUTER_API_KEY il boot si ferma", () => {
    const result = soulEnvSchema.safeParse({ ...base, OPENROUTER_API_KEY: undefined });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === "OPENROUTER_API_KEY")).toBe(true);
  });

  it("applica i default: DeepSeek V4 Flash, ElevenLabs v4, fornitori in ordine", () => {
    const env = parse({});
    expect(env.OPENROUTER_CHAT_MODEL).toBe(DEFAULT_CHAT_MODEL);
    expect(env.OPENROUTER_TTS_MODEL).toBe(DEFAULT_TTS_MODEL);
    expect(env.OPENROUTER_PROVIDERS).toEqual([...DEFAULT_PROVIDERS]);
  });

  it("una stringa vuota (i default vuoti del compose) vale come assente", () => {
    const env = parse({ OPENROUTER_CHAT_MODEL: "", OPENROUTER_PROVIDERS: "", OPENROUTER_TTS_MODEL: "" });
    expect(env.OPENROUTER_CHAT_MODEL).toBe(DEFAULT_CHAT_MODEL);
    expect(env.OPENROUTER_PROVIDERS).toEqual([...DEFAULT_PROVIDERS]);
  });

  it("legge OPENROUTER_PROVIDERS come lista ORDINATA, senza spazi né voci vuote", () => {
    const env = parse({ OPENROUTER_PROVIDERS: " Azure , DeepInfra,, Parasail " });
    expect(env.OPENROUTER_PROVIDERS).toEqual(["Azure", "DeepInfra", "Parasail"]);
  });

  it.each([
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
    "UGO_CHAT_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "UGO_TTS_MODEL",
    "UGO_TTS_VOICE",
    "OPENROUTER_BASE_URL",
  ])("%s è ritirata: il boot si ferma e dice perché", (name) => {
    const result = soulEnvSchema.safeParse({ ...base, [name]: "ancora-qui" });
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.path[0] === name);
    expect(issue?.message).toMatch(/non esiste più \(ADR-125\)/u);
  });
});

describe("il telefono (ADR-128)", () => {
  const token = "p".repeat(40);
  const account = "00000000-0000-4000-8000-000000000002";

  it("si accende con segreto e casa insieme", () => {
    const result = soulEnvSchema.safeParse({
      ...base,
      UGO_PHONE_TOKEN: token,
      UGO_PHONE_ACCOUNT_ID: account,
    });
    expect(result.success).toBe(true);
  });

  it("resta spento senza nessuno dei due, anche con stringhe vuote", () => {
    const result = soulEnvSchema.safeParse({ ...base, UGO_PHONE_TOKEN: "", UGO_PHONE_ACCOUNT_ID: "" });
    expect(result.success).toBe(true);
    expect(result.data?.UGO_PHONE_TOKEN).toBeUndefined();
  });

  it.each([
    { UGO_PHONE_TOKEN: token },
    { UGO_PHONE_ACCOUNT_ID: account },
  ])("mezza porta ferma il boot: %o", (half) => {
    const result = soulEnvSchema.safeParse({ ...base, ...half });
    expect(result.success).toBe(false);
  });

  it("rifiuta un segreto corto", () => {
    const result = soulEnvSchema.safeParse({
      ...base,
      UGO_PHONE_TOKEN: "corto",
      UGO_PHONE_ACCOUNT_ID: account,
    });
    expect(result.success).toBe(false);
  });
});
