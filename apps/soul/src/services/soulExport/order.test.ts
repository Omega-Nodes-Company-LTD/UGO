import { describe, expect, it } from "vitest";
import { orderByForeignKeys } from "./order.js";

describe("tables in foreign-key order", () => {
  it("puts what is referenced before what references it", () => {
    const order = orderByForeignKeys(
      ["messages", "gosini", "accounts", "bonds", "beings"],
      [
        ["gosini", "accounts"],
        ["beings", "accounts"],
        ["messages", "gosini"],
        ["messages", "beings"],
        ["bonds", "gosini"],
        ["bonds", "beings"],
      ],
    );
    const at = (table: string): number => order.indexOf(table);
    expect(at("accounts")).toBeLessThan(at("gosini"));
    expect(at("accounts")).toBeLessThan(at("beings"));
    expect(at("gosini")).toBeLessThan(at("messages"));
    expect(at("beings")).toBeLessThan(at("bonds"));
    expect(order).toHaveLength(5);
  });

  it("is deterministic: independent tables come out alphabetically", () => {
    const edges: [string, string][] = [["b", "a"], ["c", "a"], ["d", "a"]];
    expect(orderByForeignKeys(["d", "c", "b", "a"], edges)).toEqual(["a", "b", "c", "d"]);
    expect(orderByForeignKeys(["a", "b", "c", "d"], edges)).toEqual(["a", "b", "c", "d"]);
  });

  it("ignores a table pointing at itself (the importer handles those columns)", () => {
    expect(orderByForeignKeys(["gosini", "accounts"], [["gosini", "gosini"], ["gosini", "accounts"]])).toEqual([
      "accounts",
      "gosini",
    ]);
  });

  it("ignores references to tables that are not in the archive", () => {
    expect(orderByForeignKeys(["messages", "gosini"], [["messages", "gosini"], ["messages", "customers"]])).toEqual([
      "gosini",
      "messages",
    ]);
  });

  it("refuses a cycle instead of inventing an order", () => {
    expect(() => orderByForeignKeys(["a", "b"], [["a", "b"], ["b", "a"]])).toThrow(/cycle/u);
  });

  it("keeps a table with no edges at all", () => {
    expect(orderByForeignKeys(["rooms", "act_efficacy"], [])).toEqual(["act_efficacy", "rooms"]);
  });
});
