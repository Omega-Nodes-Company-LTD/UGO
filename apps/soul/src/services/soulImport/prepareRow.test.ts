import { randomBytes } from "node:crypto";
import { decryptText, encryptText, unwrapDataKey } from "@ugo/shared";
import { describe, expect, it } from "vitest";
import type { TablePolicy } from "../soulExport/policy.js";
import { TABLES } from "../soulExport/policyTables.js";
import { prepareRow, type ColumnInfo, type PrepareContext } from "./prepareRow.js";

const MASTER = randomBytes(32);
const cols = (...names: string[]): Map<string, ColumnInfo> =>
  new Map(names.map((name) => [name, { name, nullable: !name.endsWith("_id") || name === "being_id" }]));

function context(over: Partial<PrepareContext> & { table: string }): PrepareContext {
  return {
    columns: cols("id", "text"),
    foreignKeys: new Map(),
    selfReferences: new Set(),
    known: new Map(),
    masterKey: MASTER,
    policy: {},
    ...over,
  };
}

describe("columns the target does not have", () => {
  it("are dropped and reported, never invented", () => {
    const result = prepareRow({ id: "1", text: "x", colonna_futura: 5 }, context({ table: "t" }));
    expect(result.kind).toBe("row");
    if (result.kind !== "row") return;
    expect(result.row).toEqual({ id: "1", text: "x" });
    expect(result.ignored).toEqual(["colonna_futura"]);
  });
});

describe("references to rows that are not in the archive", () => {
  const base = {
    columns: new Map<string, ColumnInfo>([
      ["id", { name: "id", nullable: false }],
      ["being_id", { name: "being_id", nullable: true }],
      ["gosino_id", { name: "gosino_id", nullable: false }],
    ]),
    foreignKeys: new Map([
      ["being_id", "beings"],
      ["gosino_id", "gosini"],
    ]),
    known: new Map([
      ["beings", new Set(["b1"])],
      ["gosini", new Set(["g1"])],
    ]),
  };

  it("a nullable reference to a missing row becomes null, and says so", () => {
    const result = prepareRow({ id: "1", being_id: "assente", gosino_id: "g1" }, context({ table: "messages", ...base }));
    expect(result.kind).toBe("row");
    if (result.kind !== "row") return;
    expect(result.row.being_id).toBeNull();
    expect(result.nulled).toEqual(["being_id"]);
  });

  it("a reference to a row that IS there is left alone", () => {
    const result = prepareRow({ id: "1", being_id: "b1", gosino_id: "g1" }, context({ table: "messages", ...base }));
    if (result.kind !== "row") throw new Error("expected a row");
    expect(result.row.being_id).toBe("b1");
    expect(result.nulled).toEqual([]);
  });

  it("a NOT NULL reference to a missing row skips the whole row, with the reason", () => {
    const result = prepareRow({ id: "1", being_id: null, gosino_id: "assente" }, context({ table: "births", ...base }));
    expect(result).toEqual({ kind: "skipped", column: "gosino_id" });
  });

  it("a reference to a table that was not imported at all is left to the database to judge", () => {
    const result = prepareRow(
      { id: "1", being_id: "x", gosino_id: "g1" },
      context({ table: "t", ...base, known: new Map([["gosini", new Set(["g1"])]]) }),
    );
    if (result.kind !== "row") throw new Error("expected a row");
    expect(result.row.being_id).toBe("x");
  });
});

describe("a table that points at itself", () => {
  const withSelf = {
    columns: new Map<string, ColumnInfo>([
      ["id", { name: "id", nullable: false }],
      ["parent_gosino_id", { name: "parent_gosino_id", nullable: true }],
    ]),
    selfReferences: new Set(["parent_gosino_id"]),
  };

  it("goes in with the column empty and the value remembered for a second pass", () => {
    const result = prepareRow({ id: "g2", parent_gosino_id: "g1" }, context({ table: "gosini", ...withSelf }));
    if (result.kind !== "row") throw new Error("expected a row");
    expect(result.row.parent_gosino_id).toBeNull();
    expect(result.deferred).toEqual([{ id: "g2", column: "parent_gosino_id", value: "g1" }]);
  });

  it("has nothing to remember when the column is already empty", () => {
    const result = prepareRow({ id: "g1", parent_gosino_id: null }, context({ table: "gosini", ...withSelf }));
    if (result.kind !== "row") throw new Error("expected a row");
    expect(result.deferred).toEqual([]);
  });
});

describe("text goes back the way the runtime writes it", () => {
  it("is re-encrypted under the LOCAL key", () => {
    const policy: TablePolicy = { encrypted: ["text"] };
    const result = prepareRow({ id: "1", text: "ciao Ugo" }, context({ table: "messages", policy }));
    if (result.kind !== "row") throw new Error("expected a row");
    expect(result.row.text).not.toBe("ciao Ugo");
    expect(decryptText(String(result.row.text), MASTER)).toBe("ciao Ugo");
  });

  it("stays in the clear where the policy says so (memories, ADR-091)", () => {
    const result = prepareRow({ id: "1", text: "v1: sembra un cifrato ma è un ricordo" }, context({ table: "memories", policy: TABLES.memories ?? {} }));
    if (result.kind !== "row") throw new Error("expected a row");
    expect(result.row.text).toBe("v1: sembra un cifrato ma è un ricordo");
  });

  it("leaves an empty or missing value empty", () => {
    const policy: TablePolicy = { encrypted: ["text"] };
    const result = prepareRow({ id: "1", text: "" }, context({ table: "messages", policy }));
    if (result.kind !== "row") throw new Error("expected a row");
    expect(result.row.text).toBe("");
  });

  it("round-trips a text that merely looks like ciphertext", () => {
    const policy: TablePolicy = { encrypted: ["text"] };
    const lookalike = encryptText("dentro", randomBytes(32)); // someone typed this into a message
    const result = prepareRow({ id: "1", text: lookalike }, context({ table: "messages", policy }));
    if (result.kind !== "row") throw new Error("expected a row");
    expect(decryptText(String(result.row.text), MASTER)).toBe(lookalike);
  });
});

describe("rules that belong to this installation, not to the archive", () => {
  const accountsColumns = cols("id", "name", "wrapped_data_key", "is_foundry", "can_breed");
  const creatureColumns = cols("id", "name", "wrapped_soul_key", "peer_encounters", "signing_public_key");

  it("a house gets a data key of its own, wrapped under the local master key", () => {
    const result = prepareRow({ id: "a", name: "Casa" }, context({ table: "accounts", columns: accountsColumns }));
    if (result.kind !== "row") throw new Error("expected a row");
    const wrapped = Buffer.from(String(result.row.wrapped_data_key).replace(/^\\x/u, ""), "hex");
    expect(unwrapDataKey(wrapped, MASTER)).toHaveLength(32);
  });

  it("no house arrives with the right to found or to breed (rule 14)", () => {
    const result = prepareRow({ id: "a", name: "Casa", is_foundry: true, can_breed: true }, context({ table: "accounts", columns: accountsColumns }));
    if (result.kind !== "row") throw new Error("expected a row");
    expect(result.row.is_foundry).toBe(false);
    expect(result.row.can_breed).toBe(false);
  });

  it("a creature gets a new inner key, and cannot meet other creatures without its signing key", () => {
    const result = prepareRow({ id: "g", name: "Ugo", peer_encounters: true, signing_public_key: "\\xabcd" }, context({ table: "gosini", columns: creatureColumns }));
    if (result.kind !== "row") throw new Error("expected a row");
    expect(unwrapDataKey(Buffer.from(String(result.row.wrapped_soul_key).replace(/^\\x/u, ""), "hex"), MASTER)).toHaveLength(32);
    expect(result.row.peer_encounters).toBe(false);
    expect(result.row.signing_public_key).toBe("\\xabcd"); // the public identity travels
  });

  it("two creatures never share an inner key", () => {
    const a = prepareRow({ id: "g1", name: "A" }, context({ table: "gosini", columns: creatureColumns }));
    const b = prepareRow({ id: "g2", name: "B" }, context({ table: "gosini", columns: creatureColumns }));
    if (a.kind !== "row" || b.kind !== "row") throw new Error("expected rows");
    expect(a.row.wrapped_soul_key).not.toEqual(b.row.wrapped_soul_key);
  });
});
