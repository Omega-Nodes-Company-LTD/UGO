import { describe, expect, it } from "vitest";
import { assessCompatibility, integritySchema, soulManifestSchema } from "./manifest.js";
import { manifest } from "./testKit.js";

const runtime = {
  supportedMajor: 1,
  supportedMinor: 0,
  schemaVersion: "0062_la-cartolina",
  embeddingModel: "openai/text-embedding-3-small",
} as const;

describe("the manifest", () => {
  it("accepts a well-formed manifest", () => {
    expect(soulManifestSchema.parse(manifest())).toEqual(manifest());
  });

  it("ignores fields a later minor version added, so old readers keep working", () => {
    const parsed = soulManifestSchema.parse({ ...manifest(), futureField: { a: 1 } });
    expect(parsed).not.toHaveProperty("futureField");
  });

  it.each([
    ["no creatures", { gosinoIds: [] }],
    ["a creature id that is not a uuid", { gosinoIds: ["../etc/passwd"] }],
    ["a wrong kind", { kind: "ugo-backup" }],
    ["an unknown mode", { mode: "clone" }],
    ["a malformed date", { createdAt: "yesterday" }],
    ["a negative omission count", { omissions: [{ category: "x", reason: "y", count: -1 }] }],
  ])("rejects %s", (_label, patch) => {
    expect(soulManifestSchema.safeParse({ ...manifest(), ...patch }).success).toBe(false);
  });

  it("requires the omissions list to exist, even when empty: silence is not an answer", () => {
    const { omissions, ...without } = manifest();
    expect(omissions.length).toBeGreaterThan(0); // the fixture has some; the point is removing them
    expect(soulManifestSchema.safeParse(without).success).toBe(false);
    expect(soulManifestSchema.safeParse({ ...without, omissions: [] }).success).toBe(true);
  });

  it("has no place for a key, a token or a passphrase", () => {
    // not a behaviour test: a tripwire. If someone adds a secret-shaped field,
    // this list is where the review conversation starts.
    const keys = Object.keys(soulManifestSchema.shape);
    expect(keys.filter((k) => /key|token|secret|pass/iu.test(k))).toEqual([]);
  });
});

describe("the integrity record", () => {
  const sha = "a".repeat(64);

  it("accepts digests as lowercase hex", () => {
    const ok = integritySchema.safeParse({
      files: [{ name: "tables/beings.ndjson", bytes: 10, sha256: sha, rows: 2 }],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a digest that is not 64 hex characters", () => {
    const bad = integritySchema.safeParse({
      files: [{ name: "tables/beings.ndjson", bytes: 10, sha256: "xyz", rows: 2 }],
    });
    expect(bad.success).toBe(false);
  });
});

describe("compatibility policy", () => {
  it("accepts the same version", () => {
    expect(assessCompatibility(manifest(), runtime)).toEqual({ ok: true, warnings: [] });
  });

  it("refuses a different major: the layout may have changed under us", () => {
    const result = assessCompatibility(
      manifest({ formatVersion: { major: 2, minor: 0 } }),
      runtime,
    );
    expect(result).toMatchObject({ ok: false, reason: "unsupported-format-major" });
  });

  it("accepts a newer minor but says so", () => {
    const result = assessCompatibility(
      manifest({ formatVersion: { major: 1, minor: 3 } }),
      runtime,
    );
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.warnings).toContain("newer-minor");
  });

  it("refuses an archive made by a newer database schema: update first", () => {
    const result = assessCompatibility(
      manifest({ source: { ...manifest().source, schemaVersion: "0070_domani" } }),
      runtime,
    );
    expect(result).toMatchObject({ ok: false, reason: "archive-from-newer-schema" });
  });

  it("accepts an archive from an older schema", () => {
    const result = assessCompatibility(
      manifest({ source: { ...manifest().source, schemaVersion: "0040_prima" } }),
      runtime,
    );
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.warnings).toContain("older-schema");
  });

  it("refuses a schema version it cannot read, rather than guessing", () => {
    const result = assessCompatibility(
      manifest({ source: { ...manifest().source, schemaVersion: "boh" } }),
      runtime,
    );
    expect(result).toMatchObject({ ok: false, reason: "unreadable-schema-version" });
  });

  it("warns when the embedding model differs (vectors get recomputed anyway)", () => {
    const result = assessCompatibility(
      manifest({ source: { ...manifest().source, embeddingModel: "altro/modello" } }),
      runtime,
    );
    expect(result.ok && result.warnings).toContain("embedding-model-differs");
  });
});
