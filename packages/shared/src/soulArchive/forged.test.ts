import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ArchiveError } from "./errors.js";
import { encodeHeader } from "./format.js";
import { deriveKey } from "./kdf.js";
import { sealChunks } from "./cipher.js";
import { canonicalSecret } from "./recoveryCode.js";
import { openSoulArchive } from "./index.js";
import { collect, FAST_KDF, manifest, SECRET, trickle } from "./testKit.js";

/**
 * A *correctly encrypted* archive can still be hostile: whoever holds the
 * passphrase can write anything inside. These tests forge such archives with
 * the real cipher and hand-written framing, to prove the reader rejects bad
 * content on its own merits and not merely because authentication fails.
 */

const ENTRY = 0x01;
const END = 0x00;

function entry(name: string, data: Buffer): Buffer {
  const nameBytes = Buffer.from(name, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const zero = Buffer.alloc(4);
  const body = data.length > 0 ? [len, data] : [];
  return Buffer.concat([Buffer.from([ENTRY, nameBytes.length]), nameBytes, ...body, zero]);
}

async function forge(plaintext: Buffer): Promise<Buffer> {
  const header = {
    kdf: FAST_KDF,
    chunkLog2: 12,
    salt: randomBytes(16),
    noncePrefix: randomBytes(7),
  };
  const headerBytes = encodeHeader(header);
  const key = await deriveKey(canonicalSecret(SECRET), header.salt, FAST_KDF);
  const sealed = await collect(sealChunks([plaintext], key, headerBytes, header.noncePrefix, 1 << 12));
  return Buffer.concat([headerBytes, sealed]);
}

async function failure(bytes: Buffer): Promise<string> {
  try {
    const archive = await openSoulArchive(trickle(bytes, 4096), SECRET);
    for await (const table of archive.tables) await collect(table.data);
  } catch (error) {
    if (error instanceof ArchiveError) return error.code;
    throw error;
  }
  return "no-error";
}

const manifestEntry = entry("manifest.json", Buffer.from(JSON.stringify(manifest())));
const emptyIntegrity = entry("integrity.json", Buffer.from(JSON.stringify({ files: [] })));

describe("a hostile but correctly encrypted archive", () => {
  it("accepts the forged minimal archive, so the failures below are about content", async () => {
    const bytes = await forge(Buffer.concat([manifestEntry, emptyIntegrity, Buffer.from([END])]));
    expect(await failure(bytes)).toBe("no-error");
  });

  it.each([
    ["a parent-directory path", "../../etc/cron.d/x"],
    ["an absolute path", "/etc/passwd"],
    ["a Windows path", "tables\\beings.ndjson"],
    ["a name outside the whitelist", "tables/Beings.ndjson"],
    ["a nested path", "tables/sub/beings.ndjson"],
    ["an executable", "install.sh"],
    ["a name with a NUL byte", "tables/beings\u0000.ndjson"],
  ])("rejects %s as an entry name", async (_label, name) => {
    const bytes = await forge(
      Buffer.concat([manifestEntry, entry(name, Buffer.from("{}\n")), emptyIntegrity, Buffer.from([END])]),
    );
    expect(await failure(bytes)).toBe("bad-entry-name");
  });

  it("rejects an archive whose first entry is not the manifest", async () => {
    const bytes = await forge(
      Buffer.concat([entry("tables/beings.ndjson", Buffer.from("{}\n")), manifestEntry, Buffer.from([END])]),
    );
    expect(await failure(bytes)).toBe("malformed");
  });

  it("rejects a manifest that does not match the schema", async () => {
    const bad = entry("manifest.json", Buffer.from(JSON.stringify({ kind: "ugo-soul" })));
    expect(await failure(await forge(Buffer.concat([bad, emptyIntegrity, Buffer.from([END])])))).toBe(
      "malformed",
    );
  });

  it("rejects a manifest that is not JSON at all", async () => {
    const bad = entry("manifest.json", Buffer.from("not json"));
    expect(await failure(await forge(Buffer.concat([bad, Buffer.from([END])])))).toBe("malformed");
  });

  it("rejects the same table twice", async () => {
    const t = entry("tables/beings.ndjson", Buffer.from("{}\n"));
    const bytes = await forge(Buffer.concat([manifestEntry, t, t, emptyIntegrity, Buffer.from([END])]));
    expect(await failure(bytes)).toBe("malformed");
  });

  it("rejects an archive with no integrity record (cut off on purpose)", async () => {
    const bytes = await forge(Buffer.concat([manifestEntry, Buffer.from([END])]));
    expect(await failure(bytes)).toBe("truncated");
  });

  it("rejects an integrity record that lies about a digest", async () => {
    const t = Buffer.from("{}\n");
    const lie = entry(
      "integrity.json",
      Buffer.from(
        JSON.stringify({
          files: [{ name: "tables/beings.ndjson", bytes: 3, sha256: "0".repeat(64), rows: 1 }],
        }),
      ),
    );
    const bytes = await forge(
      Buffer.concat([manifestEntry, entry("tables/beings.ndjson", t), lie, Buffer.from([END])]),
    );
    expect(await failure(bytes)).toBe("integrity-mismatch");
  });

  it("rejects a table the integrity record does not list", async () => {
    const bytes = await forge(
      Buffer.concat([
        manifestEntry,
        entry("tables/beings.ndjson", Buffer.from("{}\n")),
        emptyIntegrity,
        Buffer.from([END]),
      ]),
    );
    expect(await failure(bytes)).toBe("integrity-mismatch");
  });

  it("rejects anything after the end marker", async () => {
    const bytes = await forge(
      Buffer.concat([manifestEntry, emptyIntegrity, Buffer.from([END]), Buffer.from("tail")]),
    );
    expect(await failure(bytes)).toBe("malformed");
  });

  it("rejects an unknown entry tag", async () => {
    const bytes = await forge(Buffer.concat([manifestEntry, Buffer.from([0x7f, 1, 65]), emptyIntegrity]));
    expect(await failure(bytes)).toBe("malformed");
  });
});
