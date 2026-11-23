import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TABLES } from "./policyTables.js";

/**
 * The export policy must know every table (ADR-132, in the spirit of ADR-089's
 * `exportCoverage.test.ts`). A table added to the schema without a decision
 * here would otherwise reach a customer's archive — or fail it at the worst
 * moment, on their machine. The integration test checks the same against the
 * real migrated database, down to the columns; this one is the cheap early
 * warning that runs everywhere.
 */
const SCHEMA = join(import.meta.dirname, "..", "..", "..", "..", "..", "packages", "db", "src", "schema");

function tablesInSchema(): string[] {
  const found = new Set<string>();
  for (const file of readdirSync(SCHEMA)) {
    if (!file.endsWith(".ts")) continue;
    const source = readFileSync(join(SCHEMA, file), "utf8");
    for (const match of source.matchAll(/pgTable\(\s*"([a-z_]+)"/gu)) {
      if (match[1] !== undefined) found.add(match[1]);
    }
  }
  return [...found].sort();
}

describe("the export policy", () => {
  it("reads the schema for real, so a broken read cannot pass as 'no tables'", () => {
    expect(tablesInSchema().length).toBeGreaterThan(50);
  });

  it("classifies every table in the schema", () => {
    const missing = tablesInSchema().filter((table) => !(table in TABLES));
    expect(missing, `add these to policyTables.ts with a decision: ${missing.join(", ")}`).toEqual([]);
  });

  it("has no entry for a table that no longer exists", () => {
    const real = new Set(tablesInSchema());
    const stale = Object.keys(TABLES).filter((table) => !real.has(table));
    expect(stale, `remove from policyTables.ts: ${stale.join(", ")}`).toEqual([]);
  });

  it("gives every omission a category and a reason a person can read", () => {
    for (const [table, policy] of Object.entries(TABLES)) {
      const whys = [
        ...(policy.omit ? [policy.omit] : []),
        ...Object.values(policy.drop ?? {}),
      ];
      for (const why of whys) {
        expect(why.reason.length, `${table}: reason too short`).toBeGreaterThan(20);
        expect(why.category, `${table}: category`).toMatch(/^[a-z-]+$/u);
      }
    }
  });

  it("never mixes omitting a whole table with per-column rules for it", () => {
    for (const [table, policy] of Object.entries(TABLES)) {
      if (policy.omit === undefined) continue;
      const extras = [policy.drop, policy.encrypted, policy.publicBytes, policy.mediaColumn];
      expect(
        extras.every((extra) => extra === undefined),
        `${table} is omitted entirely but also has column rules`,
      ).toBe(true);
    }
  });

  it("keeps the biometric and credential tables out, whatever else changes", () => {
    // a tripwire for the two categories that must never be exported by accident
    const mustStayBehind = [
      "access_tokens",
      "pairing_codes",
      "login_links",
      "customer_access_tokens",
      "recognition_profiles",
      "unknown_prints",
      "perception_events",
      "corrections",
    ];
    for (const table of mustStayBehind) {
      expect(TABLES[table]?.omit, `${table} must be omitted`).toBeDefined();
    }
  });

  it("never exports the hosting installation's keys or the creature's private signing key", () => {
    expect(TABLES.accounts?.drop).toHaveProperty("wrapped_data_key");
    expect(TABLES.gosini?.drop).toHaveProperty("wrapped_soul_key");
    expect(TABLES.gosini?.drop).toHaveProperty("signing_private_key");
    expect(TABLES.gosini?.drop).toHaveProperty("rotation_secret");
  });

  it("never carries the authorizations to found or breed (rule 14)", () => {
    expect(TABLES.accounts?.drop).toHaveProperty("is_foundry");
    expect(TABLES.accounts?.drop).toHaveProperty("can_breed");
  });
});
