import { describe, expect, it } from "vitest";
import { jsonLines } from "./lines.js";

async function* pieces(...parts: Buffer[]): AsyncGenerator<Buffer> {
  for (const part of parts) {
    yield part;
    await Promise.resolve();
  }
}

async function all(source: AsyncIterable<Buffer>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const row of jsonLines(source)) out.push(row);
  return out;
}

describe("rows out of a stream of bytes", () => {
  it("reads one row per line however the bytes were cut", async () => {
    const text = '{"a":1}\n{"b":2}\n{"c":3}\n';
    const bytes = Buffer.from(text);
    expect(await all(pieces(bytes))).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    expect(await all(pieces(bytes.subarray(0, 4), bytes.subarray(4, 11), bytes.subarray(11)))).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    expect(await all(pieces(...[...bytes].map((byte) => Buffer.from([byte]))))).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it("does not break a multi-byte character cut between two pieces", async () => {
    const bytes = Buffer.from('{"nome":"è così, «ciao» 🐷"}\n');
    for (let cut = 1; cut < bytes.length; cut += 1) {
      expect(await all(pieces(bytes.subarray(0, cut), bytes.subarray(cut)))).toEqual([{ nome: "è così, «ciao» 🐷" }]);
    }
  });

  it("an empty table is no rows", async () => {
    expect(await all(pieces())).toEqual([]);
    expect(await all(pieces(Buffer.alloc(0)))).toEqual([]);
  });

  it("refuses a last line that never ended: the writer terminates every row", async () => {
    await expect(all(pieces(Buffer.from('{"a":1}\n{"b":')))).rejects.toThrow(/line/u);
  });

  it("refuses a line that is not JSON, without echoing it", async () => {
    await expect(all(pieces(Buffer.from("non json segretissimo\n")))).rejects.toThrow(/line 1/u);
    await expect(all(pieces(Buffer.from("non json segretissimo\n")))).rejects.not.toThrow(/segretissimo/u);
  });

  it("refuses a row that is not an object", async () => {
    await expect(all(pieces(Buffer.from("[1,2]\n")))).rejects.toThrow(/object/u);
    await expect(all(pieces(Buffer.from('"testo"\n')))).rejects.toThrow(/object/u);
  });

  it("refuses an absurdly long line instead of buffering it", async () => {
    const huge = Buffer.alloc(9 * 1024 * 1024, 0x61);
    await expect(all(pieces(huge))).rejects.toThrow(/too long/u);
  });
});
