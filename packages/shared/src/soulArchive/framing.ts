import { ByteReader } from "./byteReader.js";
import { ArchiveError } from "./errors.js";
import { assertEntryName, MAX_FRAME_BYTES, type ReadLimits } from "./format.js";

/**
 * The plaintext stream inside the encrypted chunks:
 *
 *   ( 0x01 · nameLen(u8) · name · ( dataLen(u32 BE, >0) · data )* · 0(u32) )*  0x00
 *
 * Entry sizes are not known up front (a table streams out of the database), so
 * data travels in frames and an empty frame ends the entry. There are no
 * paths, no links, no permissions and no compression: the things archive
 * formats usually get attacked through do not exist here.
 */
const ENTRY = 0x01;
const END = 0x00;

export type EntryData = Uint8Array | AsyncIterable<Uint8Array>;
export interface EntryInput {
  name: string;
  data: EntryData;
}

function frame(data: Uint8Array): Buffer[] {
  const out: Buffer[] = [];
  for (let at = 0; at < data.length; at += MAX_FRAME_BYTES) {
    const piece = data.subarray(at, at + MAX_FRAME_BYTES);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(piece.length);
    out.push(length, Buffer.from(piece));
  }
  return out;
}

export async function* frameEntries(entries: AsyncIterable<EntryInput>): AsyncGenerator<Buffer> {
  for await (const entry of entries) {
    const name = Buffer.from(assertEntryName(entry.name), "utf8");
    yield Buffer.from([ENTRY, name.length]);
    yield name;
    if (entry.data instanceof Uint8Array) {
      yield* frame(entry.data);
    } else {
      for await (const piece of entry.data) yield* frame(piece);
    }
    yield Buffer.alloc(4); // end of entry
  }
  yield Buffer.from([END]);
}

/** Pull-based on purpose: a consumer that stops early cannot desynchronise the stream. */
export interface RawEntry {
  name: string;
  pull(): Promise<Buffer | undefined>;
}

const NAME_DECODER = new TextDecoder("utf-8", { fatal: true });

export async function* readEntries(
  plain: AsyncIterable<Uint8Array>,
  limits: ReadLimits,
): AsyncGenerator<RawEntry, void> {
  const reader = new ByteReader(plain);
  let count = 0;
  let total = 0;
  let open: { finished: boolean; bytes: number } | undefined;

  const pullFrom = async (cursor: { finished: boolean; bytes: number }): Promise<Buffer | undefined> => {
    if (cursor.finished) return undefined;
    const length = (await reader.read(4)).readUInt32BE(0);
    if (length === 0) {
      cursor.finished = true;
      return undefined;
    }
    if (length > MAX_FRAME_BYTES) throw new ArchiveError("malformed", "frame too large");
    cursor.bytes += length;
    total += length;
    if (cursor.bytes > limits.maxEntryBytes || total > limits.maxTotalBytes) {
      throw new ArchiveError("limit-exceeded", "archive larger than the allowed size");
    }
    return reader.read(length);
  };

  for (;;) {
    // whatever the consumer left unread of the previous entry is skipped here
    if (open !== undefined) while ((await pullFrom(open)) !== undefined) continue;

    const tag = (await reader.read(1))[0];
    if (tag === END) {
      if (!(await reader.isDone())) throw new ArchiveError("malformed", "data after the end marker");
      return;
    }
    if (tag !== ENTRY) throw new ArchiveError("malformed", "unknown entry tag");

    count += 1;
    if (count > limits.maxEntries) throw new ArchiveError("limit-exceeded", "too many entries");

    const nameLength = (await reader.read(1))[0] ?? 0;
    if (nameLength === 0) throw new ArchiveError("bad-entry-name", "empty entry name");
    let name: string;
    try {
      name = NAME_DECODER.decode(await reader.read(nameLength));
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      throw new ArchiveError("bad-entry-name", "entry name is not valid text");
    }
    assertEntryName(name);

    const cursor = { finished: false, bytes: 0 };
    open = cursor;
    yield { name, pull: () => pullFrom(cursor) };
  }
}
