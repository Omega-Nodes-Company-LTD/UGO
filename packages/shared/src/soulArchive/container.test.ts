import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ArchiveError } from "./errors.js";
import { HEADER_BYTES } from "./format.js";
import { openSoulArchive, writeSoulArchive, type TableInput } from "./index.js";
import { collect, FAST_KDF, manifest, ndjson, SECRET, trickle } from "./testKit.js";

const beings = ndjson(25);
const memories = ndjson(400, 120); // large enough to span several 4 KiB chunks

async function build(tables: TableInput[] = [], overrides: { chunkLog2?: number } = {}) {
  const all: TableInput[] = tables.length > 0 ? tables : [
    { table: "beings", data: beings },
    { table: "memories", data: memories },
  ];
  return collect(
    writeSoulArchive({
      manifest: manifest(),
      tables: all,
      secret: SECRET,
      kdf: FAST_KDF,
      chunkLog2: overrides.chunkLog2 ?? 12,
    }),
  );
}

async function readAll(bytes: Buffer, secret = SECRET, pieces = 1000, limits = {}) {
  const archive = await openSoulArchive(trickle(bytes, pieces), secret, limits);
  const out = new Map<string, Buffer>();
  for await (const table of archive.tables) out.set(table.table, await collect(table.data));
  return { manifest: archive.manifest, tables: out };
}

async function failure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ArchiveError) return error.code;
    throw error;
  }
  return "no-error";
}

describe("round trip", () => {
  it("gives back the manifest and every table, byte for byte", async () => {
    const bytes = await build();
    const read = await readAll(bytes);
    expect(read.manifest).toEqual(manifest());
    expect([...read.tables.keys()]).toEqual(["beings", "memories"]);
    expect(read.tables.get("beings")).toEqual(beings);
    expect(read.tables.get("memories")).toEqual(memories);
  });

  it("does not care how the bytes arrive: one byte at a time works too", async () => {
    const bytes = await build([{ table: "beings", data: beings }]);
    const read = await readAll(bytes, SECRET, 1);
    expect(read.tables.get("beings")).toEqual(beings);
  });

  it("carries streamed data and an empty table", async () => {
    const bytes = await build([
      { table: "events", data: trickle(memories, 777) },
      { table: "desires", data: Buffer.alloc(0) },
    ]);
    const read = await readAll(bytes);
    expect(read.tables.get("events")).toEqual(memories);
    expect(read.tables.get("desires")).toEqual(Buffer.alloc(0));
  });

  it("accepts the recovery code however it was typed", async () => {
    const bytes = await build();
    const read = await readAll(bytes, "abcd efgh jkmn pqrs tvwx yz01");
    expect(read.tables.size).toBe(2);
  });

  it("leaves no plaintext on the wire", async () => {
    const bytes = await build();
    const probe = JSON.parse(beings.toString("utf8").split("\n")[0] ?? "{}") as { text: string };
    expect(bytes.includes(Buffer.from(probe.text))).toBe(false);
    expect(bytes.includes(Buffer.from("ugo-soul"))).toBe(false);
  });

  it("is never the same twice: fresh salt and nonce prefix", async () => {
    const a = await build([{ table: "beings", data: beings }]);
    const b = await build([{ table: "beings", data: beings }]);
    expect(a.equals(b)).toBe(false);
  });
});

describe("the production key derivation", () => {
  it("round-trips with the default cost parameters (128 MiB scrypt)", async () => {
    const bytes = await collect(
      writeSoulArchive({
        manifest: manifest(),
        tables: [{ table: "beings", data: beings }],
        secret: SECRET,
      }),
    );
    const read = await readAll(bytes);
    expect(read.tables.get("beings")).toEqual(beings);
  }, 30_000);
});

describe("a wrong or damaged archive is refused, never half-read", () => {
  it("refuses the wrong passphrase, and says nothing that distinguishes it from damage", async () => {
    const bytes = await build();
    expect(await failure(() => readAll(bytes, "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ"))).toBe(
      "authentication-failed",
    );
  });

  it("refuses something that is not an archive", async () => {
    expect(await failure(() => readAll(Buffer.from("%PDF-1.7 non sono un'anima".repeat(5))))).toBe(
      "bad-magic",
    );
  });

  it("refuses an empty file", async () => {
    expect(await failure(() => readAll(Buffer.alloc(0)))).toBe("truncated");
  });

  it("refuses a newer format major before touching any key", async () => {
    const bytes = Buffer.from(await build());
    bytes[8] = 2; // major version byte
    expect(await failure(() => readAll(bytes))).toBe("unsupported-version");
  });

  it("detects a flipped bit anywhere: header, length prefix or ciphertext", async () => {
    const bytes = await build();
    const spots = [10, 14, 20, 30, HEADER_BYTES + 1, HEADER_BYTES + 6, bytes.length >> 1, bytes.length - 3];
    for (const at of spots) {
      const damaged = Buffer.from(bytes);
      damaged[at] = (damaged[at] ?? 0) ^ 0x01;
      const code = await failure(() => readAll(damaged));
      expect(code, `byte ${String(at)}`).not.toBe("no-error");
    }
  });

  it("detects truncation at every kind of boundary", async () => {
    const bytes = await build();
    const cuts = [HEADER_BYTES, HEADER_BYTES + 2, bytes.length >> 1, bytes.length - 1, bytes.length - 20];
    for (const cut of cuts) {
      const code = await failure(() => readAll(bytes.subarray(0, cut)));
      expect(code, `cut at ${String(cut)}`).not.toBe("no-error");
    }
  });

  it("detects a missing final chunk even when the cut lands exactly between chunks", async () => {
    const bytes = await build();
    // walk the chunk frames and drop the last one
    let at = HEADER_BYTES;
    let lastStart = at;
    while (at < bytes.length) {
      lastStart = at;
      at += 4 + bytes.readUInt32BE(at);
    }
    expect(await failure(() => readAll(bytes.subarray(0, lastStart)))).toBe("authentication-failed");
  });

  it("detects data appended after the end", async () => {
    const bytes = await build();
    expect(await failure(() => readAll(Buffer.concat([bytes, Buffer.from("extra")])))).not.toBe(
      "no-error",
    );
  });

  it("detects chunks swapped around", async () => {
    const bytes = await build();
    const frames: Buffer[] = [];
    for (let at = HEADER_BYTES; at < bytes.length; ) {
      const size = 4 + bytes.readUInt32BE(at);
      frames.push(bytes.subarray(at, at + size));
      at += size;
    }
    expect(frames.length).toBeGreaterThan(3);
    const [f0, f1, ...rest] = frames;
    const swapped = Buffer.concat([
      bytes.subarray(0, HEADER_BYTES),
      ...(f1 && f0 ? [f1, f0] : []),
      ...rest,
    ]);
    expect(await failure(() => readAll(swapped))).toBe("authentication-failed");
  });
});

describe("the reader does not trust the header", () => {
  it("refuses key-derivation costs that would exhaust a small machine", async () => {
    const bytes = Buffer.from(await build());
    bytes[10] = 25; // log2N: 32 million iterations, tens of GiB
    expect(await failure(() => readAll(bytes))).toBe("bad-kdf-params");
  });

  // The one header byte that changes neither the key nor the nonce: only the
  // header-as-AAD binding can notice it. Without that binding an attacker could
  // alter how the file is cut into chunks and nothing would complain.
  it("detects a header change that touches neither key nor nonce", async () => {
    const bytes = Buffer.from(await build()); // chunkLog2 = 12
    bytes[13] = 13; // still a valid chunk size
    expect(await failure(() => readAll(bytes))).toBe("authentication-failed");
  });

  it("refuses an absurd chunk size", async () => {
    const bytes = Buffer.from(await build());
    bytes[13] = 40;
    expect(await failure(() => readAll(bytes))).toBe("malformed");
  });
});

describe("limits", () => {
  it("stops a table that is larger than the allowed entry size", async () => {
    const bytes = await build();
    const code = await failure(() => readAll(bytes, SECRET, 1000, { maxEntryBytes: 1000 }));
    expect(code).toBe("limit-exceeded");
  });

  it("stops an archive larger than the allowed total", async () => {
    const bytes = await build();
    const code = await failure(() => readAll(bytes, SECRET, 1000, { maxTotalBytes: 5000 }));
    expect(code).toBe("limit-exceeded");
  });

  it("stops an archive with too many entries", async () => {
    const tables = Array.from({ length: 6 }, (_, i) => ({
      table: `t${String(i)}`,
      data: Buffer.from("{}\n"),
    }));
    const bytes = await build(tables);
    expect(await failure(() => readAll(bytes, SECRET, 1000, { maxEntries: 4 }))).toBe(
      "limit-exceeded",
    );
  });
});

describe("integrity", () => {
  it("is exactly the digest, byte count and row count of what was written", async () => {
    const bytes = await build([{ table: "beings", data: beings }]);
    const archive = await openSoulArchive(trickle(bytes, 999), SECRET);
    for await (const table of archive.tables) await collect(table.data);
    const digest = createHash("sha256").update(beings).digest("hex");
    expect(archive.integrity()).toEqual({
      files: [{ name: "tables/beings.ndjson", bytes: beings.length, sha256: digest, rows: 25 }],
    });
  });

  it("does not finish the iteration until the integrity record has been checked", async () => {
    const bytes = await build();
    const archive = await openSoulArchive(trickle(bytes, 999), SECRET);
    expect(() => archive.integrity()).toThrow(); // too early: nothing verified yet
    for await (const table of archive.tables) await collect(table.data);
    expect(() => archive.integrity()).not.toThrow();
  });

  it("skips what the consumer ignored, but still verifies it", async () => {
    const bytes = await build();
    const archive = await openSoulArchive(trickle(bytes, 999), SECRET);
    const seen: string[] = [];
    for await (const table of archive.tables) seen.push(table.table); // data never read
    expect(seen).toEqual(["beings", "memories"]);
    expect(archive.integrity().files).toHaveLength(2);
  });
});
